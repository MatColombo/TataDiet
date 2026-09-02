#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa'/'v5.2'; QA.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(); parser.add_argument('--base-url',required=True); args=parser.parse_args(); base=args.base_url.rstrip('/')
report={'status':'ok','version':'5.2.1','checks':[],'errors':[]}
def check(name,ok,detail=None):
    row={'name':name,'ok':bool(ok)}
    if detail is not None: row['detail']=detail
    report['checks'].append(row)
    print(f'[QA] {name}: {"OK" if ok else "FAIL"} {detail if detail is not None else ""}', flush=True)
    if not ok: report['errors'].append(f'{name}: {detail}')

def wait_runtime(page):
    page.wait_for_function("() => document.readyState !== 'loading' && !!window.TataDietDB && !!window.TataDietPlanStore")

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow')
    page=ctx.new_page(); page.set_default_timeout(10000)
    errors=[]; page.on('pageerror',lambda e: errors.append(str(e)))

    page.goto(base+'/index.html',wait_until='domcontentloaded')
    page.wait_for_function("() => document.body?.dataset.version === '5.2.1'")
    check('version_5_2',page.locator('body').get_attribute('data-version')=='5.2.1')
    page.evaluate("() => navigator.serviceWorker.ready")
    page.wait_for_timeout(800)
    if not page.evaluate("() => !!navigator.serviceWorker.controller"):
        page.reload(wait_until='domcontentloaded'); page.wait_for_function("() => !!navigator.serviceWorker.controller")
    page.wait_for_timeout(800); wait_runtime(page)

    init=page.evaluate("""async()=>{await TataDietDB.initialize();const root=document.body.dataset.root||'';const t=await fetch(new URL(root+'data/v5/plan-template.base.v1.json',location.href)).then(r=>r.json());const x=await TataDietPlanStore.ensureActive('2026-09-01',t,t.dataset_version);return {id:x.plan.id,days:x.days.length,today:DietCalendarCore.todayISO()};}""")
    today=init['today']; check('plan_initialized',init['days']==180,init)

    # Toolbar / navigation simplification.
    desktop_nav=page.locator('.desktop-nav').inner_text()
    check('desktop_toolbar_reordered',all(x in desktop_nav for x in ['Ricette','Preferenze','Utilità']) and 'Piano' not in desktop_nav,desktop_nav)
    mobile_text=page.locator('.mobile-nav').inner_text()
    check('mobile_toolbar_reordered',all(x in mobile_text for x in ['Ricette','Preferenze','Utilità']) and 'Piano' not in mobile_text,mobile_text)
    page.goto(base+'/calendario/index.html?start=2026-09-01',wait_until='domcontentloaded'); page.wait_for_timeout(400)
    check('plan_link_calendar_bottom',page.locator('a',has_text='Apri il piano').count()>0)

    # Prepare a deterministic egg occurrence and personal recipe for the new V5.2 workflows.
    page.goto(base+'/ricette/studio/index.html',wait_until='domcontentloaded'); page.wait_for_selector('[data-recipes-app]:not([hidden])'); wait_runtime(page)
    seeded=page.evaluate("""async()=>{
      const b=await TataDietPlanStore.activeBundle(); const catalog=await TataDietComposerStore.library();
      const targetDate=b.days.find(d=>DietCalendarCore.compareDates(d.date,DietCalendarCore.todayISO())>=0 && d.meals?.length)?.date;
      const day=TataDietPlanCore.byDate(b.days,targetDate); const meal=day.meals[0]; const fam=TataDietComposerCore.mealFamily(meal.mealType);
      const egg=catalog.find(e=>e.isCurrent&&(e.foodGroups||[]).includes('eggs')&&(e.mealTypes||[]).some(m=>TataDietComposerCore.mealFamily(m)===fam)) || catalog.find(e=>e.isCurrent&&(e.foodGroups||[]).includes('eggs'));
      if(!egg) throw new Error('Nessuna ricetta con uova'); await TataDietComposerStore.replaceMeal(targetDate,meal.id,egg.version.id,1);
      const baseRecipe=catalog.find(e=>e.isCurrent&&e.recipe.origin==='base'&&(e.version.ingredientLines||[]).length&&(e.mealTypes||[]).some(m=>['Pranzo','Cena'].includes(m))) || catalog.find(e=>e.isCurrent&&e.recipe.origin==='base'&&(e.version.ingredientLines||[]).length);
      const draft=await TataDietRecipeStore.duplicateDraft(baseRecipe.recipe.id); draft.title='QA Ricetta V5.2 programmabile'; const saved=await TataDietRecipeStore.saveDraft(draft);
      return {targetDate,eggVersion:egg.version.id,personalRecipe:saved.recipe.id,personalVersion:saved.version.id};
    }""")
    check('personal_recipe_created',bool(seeded['personalRecipe']),seeded)

    # Preferences mass rebalancing: one preview, selectable proposals, one commit.
    page.goto(base+'/preferenze/index.html',wait_until='domcontentloaded'); page.wait_for_selector('[data-pref-card="eggs"]')
    page.locator('[data-pref-level="eggs"]').select_option('never'); page.locator('[data-pref-save]').click(); page.wait_for_timeout(250)
    page.locator('[data-rebalance-range="7"]').click(); page.wait_for_selector('[data-rebalance-dialog][open]')
    n=page.locator('[data-rebalance-proposal]').count(); check('mass_rebalance_proposes_changes',n>=1,n)
    if n>1:
        for i in range(1,n): page.locator('[data-rebalance-proposal]').nth(i).uncheck()
    selected_text=page.locator('[data-rebalance-selected-count]').inner_text(); check('mass_rebalance_selective_confirmation','1 di' in selected_text,selected_text)
    page.locator('[data-rebalance-apply]').click(); page.wait_for_timeout(500)
    op=page.evaluate("""async()=>{const ops=await TataDietDB.getAll('operations');ops.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));return ops.at(-1)?.kind||ops.at(-1)?.type||'';}""")
    check('mass_rebalance_single_operation',op=='rebalance-preferences',op)
    page.screenshot(path=str(QA/'preferences-rebalance-desktop.png'),full_page=True)

    # Recipe scheduler: personal recipe, random N, partial acceptance.
    page.goto(base+f"/ricette/programma/index.html?recipe={seeded['personalRecipe']}",wait_until='domcontentloaded'); page.wait_for_selector('[data-recipe-schedule-app]:not([hidden])')
    check('personal_recipe_scheduler_selected',page.locator('[data-schedule-recipe]').input_value()==seeded['personalRecipe'])
    page.locator('[data-schedule-count]').fill('2'); page.locator('label:has(input[name="schedule-range"][value="30"])').click(); page.locator('[data-schedule-generate]').click(); page.wait_for_timeout(500)
    sn=page.locator('[data-schedule-proposal]').count(); check('recipe_scheduler_proposals',sn>=1,sn)
    if sn>1:
        for i in range(1,sn): page.locator('[data-schedule-proposal]').nth(i).uncheck()
    before_count=page.evaluate("""async v=>{const b=await TataDietPlanStore.activeBundle();return b.days.flatMap(d=>d.meals||[]).filter(m=>m.recipeVersionId===v).length;}""",seeded['personalVersion'])
    page.locator('[data-schedule-apply]').click(); page.wait_for_timeout(500)
    sched=page.evaluate("""async v=>{const b=await TataDietPlanStore.activeBundle();const ops=await TataDietDB.getAll('operations');ops.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));return {count:b.days.flatMap(d=>d.meals||[]).filter(m=>m.recipeVersionId===v).length,op:ops.at(-1)?.kind||ops.at(-1)?.type||''};}""",seeded['personalVersion'])
    check('recipe_scheduler_partial_apply',sched['count']==before_count+1,sched)
    check('recipe_scheduler_single_operation',sched['op']=='schedule-recipe',sched)
    page.screenshot(path=str(QA/'recipe-scheduler-desktop.png'),full_page=True)

    # Shopping opens by date and defaults to today's list; presets update in place.
    page.goto(base+'/spesa/index.html?start=2026-09-01',wait_until='domcontentloaded'); page.wait_for_selector('[data-range-shopping-form]'); page.wait_for_timeout(500)
    initial=[page.locator('[data-shopping-from]').input_value(),page.locator('[data-shopping-to]').input_value()]
    check('shopping_defaults_today',initial==[today,today],initial)
    page.locator('[data-shopping-quick="7"]').click(); page.wait_for_timeout(300)
    seven=[page.locator('[data-shopping-from]').input_value(),page.locator('[data-shopping-to]').input_value()]
    expected_end=page.evaluate("t=>DietCalendarCore.addDays(t,6)",today)
    check('shopping_quick_7_days',seven==[today,expected_end],seven)
    check('shopping_results_visible',page.locator('[data-range-shopping-results]').is_visible())
    check('shopping_cycles_bottom_link',page.locator('a',has_text='liste per ciclo').count()>0 or page.locator('a',has_text='ciclo').count()>0)
    page.screenshot(path=str(QA/'shopping-dates-desktop.png'),full_page=True)

    # Oggi order: day card, next meal, civil-date meals, nutrition, then 48h preview.
    page.goto(base+f'/oggi/index.html?start=2026-09-01&date={today}',wait_until='domcontentloaded'); page.wait_for_selector('[data-today-app]:not([hidden])'); page.wait_for_timeout(400)
    order=page.evaluate("""()=>{const c=document.querySelector('[data-today-content]');const t=c.innerText.toLowerCase();return {hero:!!c.querySelector('.today-shift-hero'),next:t.indexOf('prossimo pasto'),meals:t.indexOf('pasti nella data civile'),nutrition:t.indexOf('valori nutrizionali'),calendarActive:t.includes('calendario attivo'),prepAfter:document.querySelector('[data-today-prep-preview]')?.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_PRECEDING};}""")
    check('today_new_order',order['hero'] and 0<=order['next']<order['meals']<order['nutrition'],order)
    check('today_active_calendar_removed',not order['calendarActive'],order)
    check('today_48h_after_content',bool(order['prepAfter']),order)
    page.screenshot(path=str(QA/'today-v5.2-desktop.png'),full_page=True)

    # New core workflows remain available offline through the PWA cache.
    ctx.set_offline(True)
    for route,selector in [('/preferenze/index.html','[data-pref-card="eggs"]'),('/ricette/programma/index.html', '[data-recipe-schedule-app]'),('/spesa/index.html','[data-range-shopping-form]')]:
        page.goto(base+route,wait_until='domcontentloaded'); page.wait_for_selector(selector)
    check('v5_2_core_pages_offline',True)
    ctx.set_offline(False)

    # Mobile toolbar and new pages must not overflow horizontally.
    mobile=ctx.new_page(); mobile.set_viewport_size({'width':390,'height':844}); overflow=[]
    for route in ['/oggi/index.html?start=2026-09-01', '/preferenze/index.html','/ricette/programma/index.html','/spesa/index.html?start=2026-09-01']:
        mobile.goto(base+route,wait_until='domcontentloaded'); mobile.wait_for_timeout(250)
        sw,cw=mobile.evaluate('[document.documentElement.scrollWidth,document.documentElement.clientWidth]')
        if sw>cw: overflow.append({'route':route,'scrollWidth':sw,'clientWidth':cw})
    check('mobile_no_horizontal_overflow',not overflow,overflow)
    mobile.goto(base+'/spesa/index.html?start=2026-09-01',wait_until='domcontentloaded'); mobile.screenshot(path=str(QA/'shopping-dates-mobile.png'),full_page=True)

    check('no_page_errors',not errors,errors)
    browser.close()

report['status']='ok' if all(x['ok'] for x in report['checks']) and not report['errors'] else 'failed'
(QA/'browser-v5.2-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
