#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa'/'v5.1'; QA.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--base-url',required=True);args=parser.parse_args();base=args.base_url.rstrip('/')
report={'status':'ok','version':'5.1.0','checks':[],'errors':[]}
def check(name,ok,detail=None):
    row={'name':name,'ok':bool(ok)}
    if detail is not None: row['detail']=detail
    report['checks'].append(row)
    if not ok: report['errors'].append(f'{name}: {detail}')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow')
    page=ctx.new_page();page.set_default_timeout(25000)
    errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(base+'/index.html',wait_until='domcontentloaded')
    page.wait_for_function("() => document.body?.dataset.version === '5.1.0'")
    check('version_5_1',page.locator('body').get_attribute('data-version')=='5.1.0')
    page.evaluate("() => navigator.serviceWorker.ready")
    page.wait_for_timeout(2200)
    page.wait_for_load_state('domcontentloaded')
    if not page.evaluate("() => !!navigator.serviceWorker.controller"):
        page.reload(wait_until='domcontentloaded');page.wait_for_function("() => !!navigator.serviceWorker.controller")
    # pwa.js reloads once after controllerchange; wait for the new execution context.
    page.wait_for_timeout(1500)
    page.wait_for_function("() => document.readyState !== 'loading' && !!window.TataDietDB && !!window.TataDietPlanStore")
    page.wait_for_timeout(300)

    # Initialize a deterministic personal plan.
    init=page.evaluate("""async()=>{await TataDietDB.initialize(); const root=document.body.dataset.root||''; const t=await fetch(new URL(root+'data/v5/plan-template.base.v1.json',location.href)).then(r=>r.json()); const x=await TataDietPlanStore.ensureActive('2026-09-01',t,t.dataset_version); return {id:x.plan.id,days:x.days.length};}""")
    check('plan_initialized',init['days']==180,init)

    # Unified day manager: seven types, M/P and automatic menu adaptation.
    page.goto(base+'/calendario/gestisci/index.html?start=2026-09-01&focus=2026-09-01',wait_until='domcontentloaded')
    page.wait_for_selector('[data-manager-app]:not([hidden])')
    check('manager_seven_types',page.locator('[data-day-type]').count()==7,page.locator('[data-day-type]').count())
    visible=[page.locator('[data-day-type]').nth(i).inner_text().replace('\n',' ') for i in range(7)]
    check('manager_labels',visible==['G Giornata','N Notte','SN Smonto','R1 Riposo 1','R2 Riposo 2','M Mattino','P Pomeriggio'],visible)
    palette=page.evaluate("""()=>Object.fromEntries(['--d1','--d2','--d3','--d4','--d5','--m','--p'].map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue(k).trim()]))""")
    expected={'--d1':'#a66a21','--d2':'#173b83','--d3':'#58a9d6','--d4':'#3e8a59','--d5':'#3e8a59','--m':'#e5a700','--p':'#b6242d'}
    check('known_day_palette',palette==expected,palette)
    page.locator('[data-day-type="M"]').click()
    check('type_change_defaults_to_adapt',page.locator('[data-manager-menu-mode][value="adapt"]').is_checked())
    page.wait_for_selector('[data-manager-menu-preview] .manager-meal-row')
    check('morning_preview_uses_day_menu',page.locator('[data-manager-menu-preview] .manager-meal-row').count()==5,page.locator('[data-manager-menu-preview] .manager-meal-row').count())
    check('one_final_confirm',page.locator('[data-manager-confirm]').count()==1 and page.locator('[data-manager-confirm]').is_enabled())
    page.locator('[data-manager-confirm]').click();page.wait_for_selector('[data-manager-final-dialog][open]');page.locator('[data-manager-final-apply]').click();page.wait_for_timeout(500)
    result=page.evaluate("""async()=>{const b=await TataDietPlanStore.activeBundle();const d=TataDietPlanCore.byDate(b.days,'2026-09-01');return {type:d.dayType,meals:d.meals.length,shift:d.shift};}""")
    check('morning_persisted',result['type']=='M' and result['meals']==5 and result['shift']['startTime'] is None,result)

    # Pomeriggio on next day, also adapted as Giornata dietary profile.
    page.locator('[data-manager-date]').fill('2026-09-02');page.locator('[data-manager-go]').click();page.locator('[data-day-type="P"]').click()
    check('afternoon_defaults_to_adapt',page.locator('[data-manager-menu-mode][value="adapt"]').is_checked())
    page.locator('[data-manager-confirm]').click();page.wait_for_selector('[data-manager-final-dialog][open]');page.locator('[data-manager-final-apply]').click();page.wait_for_timeout(400)
    result2=page.evaluate("""async()=>{const b=await TataDietPlanStore.activeBundle();const d=TataDietPlanCore.byDate(b.days,'2026-09-02');return {type:d.dayType,meals:d.meals.length};}""")
    check('afternoon_persisted',result2['type']=='P' and result2['meals']==5,result2)

    # Preferences: save locally, drive automatic proposals, remain present in JSON backup.
    page.goto(base+'/preferenze/index.html',wait_until='domcontentloaded');page.wait_for_selector('[data-pref-card="eggs"]')
    page.locator('[data-pref-level="eggs"]').select_option('never')
    page.locator('[data-pref-level="cheese"]').select_option('rare')
    page.locator('[data-pref-max="cheese"]').fill('2')
    page.locator('[data-pref-save]').click();page.wait_for_timeout(250)
    pref_result=page.evaluate("""async()=>{const pref=await TataDietDB.getSetting('foodPreferencesV1');const b=await TataDietPlanStore.activeBundle();const catalog=await TataDietComposerStore.library();const day={...TataDietPlanCore.byDate(b.days,'2026-09-03'),dayType:'D1',shift:TataDietPlanCore.defaultShift('D1'),meals:[]};const auto=TataDietComposerCore.suggestedMenu(day,catalog,b.days,{preferences:pref,forceSlots:true});const ranked=TataDietComposerCore.suggestRecipes(catalog,{mealType:'Colazione',shift:day.shift,preferences:pref,groupOccurrences:{}},catalog.length);const backup=await TataDietBackup.createBackup('settings');return {pref,autoGroups:auto.items.flatMap(x=>x.entry.foodGroups||[]),manualEggOptions:ranked.filter(x=>(x.foodGroups||[]).includes('eggs')).length,backupVersion:backup.appVersion,backupPref:backup.data.settings.foodPreferencesV1};}""")
    check('preferences_saved',pref_result['pref']['groups']['eggs']['level']=='never' and pref_result['pref']['groups']['cheese']['maxPer7Days']==2,pref_result['pref'])
    check('automatic_menu_respects_never', 'eggs' not in pref_result['autoGroups'], pref_result['autoGroups'])
    check('automatic_menu_respects_cheese_limit', pref_result['autoGroups'].count('cheese') <= 2, pref_result['autoGroups'])
    check('manual_choice_not_removed',pref_result['manualEggOptions']>0,pref_result['manualEggOptions'])
    check('preferences_in_json_backup',pref_result['backupVersion']=='5.1.0' and pref_result['backupPref']['groups']['eggs']['level']=='never',pref_result['backupVersion'])

    # Calendar overlays display the new abbreviations.
    page.goto(base+'/calendario/index.html?start=2026-09-01&focus=2026-09-01',wait_until='domcontentloaded');page.wait_for_timeout(600)
    body=page.locator('body').inner_text()
    check('calendar_displays_morning_afternoon','Mattino' in body and 'Pomeriggio' in body,body[:500])

    # Core offline pages added in V5.1.
    ctx.set_offline(True)
    page.goto(base+'/calendario/gestisci/index.html?start=2026-09-01&focus=2026-09-01',wait_until='domcontentloaded');page.wait_for_selector('[data-manager-app]:not([hidden])')
    page.goto(base+'/preferenze/index.html',wait_until='domcontentloaded');page.wait_for_selector('[data-pref-card="eggs"]')
    check('manager_preferences_offline',True)
    ctx.set_offline(False)

    # Desktop screenshots.
    page.goto(base+'/calendario/gestisci/index.html?start=2026-09-01&focus=2026-09-01',wait_until='domcontentloaded');page.wait_for_selector('[data-manager-app]:not([hidden])')
    page.screenshot(path=str(QA/'day-manager-desktop.png'),full_page=True)
    page.goto(base+'/preferenze/index.html',wait_until='domcontentloaded');page.wait_for_selector('[data-pref-card="eggs"]');page.screenshot(path=str(QA/'preferences-desktop.png'),full_page=True)

    # Mobile usability / overflow.
    mobile=ctx.new_page();mobile.set_viewport_size({'width':390,'height':844});overflow=[]
    for route in ['/calendario/index.html?start=2026-09-01','/calendario/gestisci/index.html?start=2026-09-01&focus=2026-09-01','/preferenze/index.html']:
        mobile.goto(base+route,wait_until='domcontentloaded');mobile.wait_for_timeout(250)
        sw,cw=mobile.evaluate('[document.documentElement.scrollWidth,document.documentElement.clientWidth]')
        if sw>cw: overflow.append({'route':route,'scrollWidth':sw,'clientWidth':cw})
    check('mobile_no_horizontal_overflow',not overflow,overflow)
    mobile.goto(base+'/calendario/gestisci/index.html?start=2026-09-01&focus=2026-09-01',wait_until='domcontentloaded');mobile.wait_for_selector('[data-manager-app]:not([hidden])');mobile.screenshot(path=str(QA/'day-manager-mobile.png'),full_page=True)

    check('no_page_errors',not errors,errors)
    browser.close()
report['status']='ok' if not report['errors'] and all(x['ok'] for x in report['checks']) else 'failed'
(QA/'browser-v5.1-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
