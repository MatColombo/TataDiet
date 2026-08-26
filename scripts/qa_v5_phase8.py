#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa' / 'v5-phase8'
QA.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', required=True, help='URL della root pubblicata, anche sotto un project path (es. http://127.0.0.1:8765/docs)')
args = parser.parse_args()
base = args.base_url.rstrip('/')
report = {'status':'ok','version':'5.0.0','checks':[],'errors':[]}

def check(name, ok, detail=None):
    row={'name':name,'ok':bool(ok)}
    if detail is not None: row['detail']=detail
    report['checks'].append(row)
    if not ok: report['errors'].append(f'{name}: {detail}')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width':1440,'height':1000}, service_workers='allow', accept_downloads=True)
    page = ctx.new_page()
    page.set_default_timeout(20000)
    page_errors=[]
    console_errors=[]
    page.on('pageerror', lambda e: page_errors.append(str(e)))
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)

    page.goto(base + '/index.html', wait_until='domcontentloaded')
    page.wait_for_function("() => document.body?.dataset.version === '5.0.0'")
    check('stable_version_visible', page.locator('body').get_attribute('data-version') == '5.0.0')
    check('no_alpha_brand', 'alpha' not in page.locator('.brand-copy').inner_text().lower())

    # Let the first service worker install/claim cycle finish before exercising IndexedDB.
    page.evaluate("() => navigator.serviceWorker.ready")
    page.wait_for_timeout(500)
    if not page.evaluate("() => !!navigator.serviceWorker.controller"):
      page.reload(wait_until='domcontentloaded')
    page.wait_for_function("() => !!navigator.serviceWorker.controller")
    page.wait_for_timeout(500)

    # Skip link keyboard behavior.
    page.keyboard.press('Tab')
    active = page.evaluate("document.activeElement?.className || ''")
    check('skip_link_first_focus', 'skip-link' in active, active)
    skip_visible = page.locator('.skip-link').evaluate("el => { const s=getComputedStyle(el); const r=el.getBoundingClientRect(); return s.visibility !== 'hidden' && r.width>0 && r.height>0; }")
    check('skip_link_visible_on_focus', skip_visible)

    # IndexedDB stable initialization and creation of representative personal data.
    page.goto(base + '/strumenti/index.html', wait_until='domcontentloaded')
    page.wait_for_function("() => window.TataDietDB && window.TataDietIngredientStore && window.TataDietRecipeStore && window.TataDietPlanStore")
    data_result = page.evaluate("""async () => {
      const db=window.TataDietDB, ing=window.TataDietIngredientStore, rec=window.TataDietRecipeStore, planStore=window.TataDietPlanStore;
      await db.initialize();
      const stableMeta=(await db.get('meta','stableReleaseMigrationVersion'))?.value;
      const appMeta=(await db.get('meta','currentAppVersion'))?.value;

      const allI=await ing.listIngredients();
      const baseI=allI.find(x=>x.ingredient.origin==='base');
      const d=await ing.duplicateDraft(baseI.ingredient.id);
      d.name='QA Ingrediente stabile';
      const savedI=await ing.saveDraft(d);

      const allR=await rec.listRecipes({includeArchived:true});
      const baseR=allR.find(x=>x.recipe.origin==='base' && x.version && (x.version.ingredientLines||[]).length);
      const rd=await rec.duplicateDraft(baseR.recipe.id);
      rd.title='QA Ricetta stabile';
      const savedR=await rec.saveDraft(rd);

      const root=document.body.dataset.root||'';
      const template=await fetch(new URL(root+'data/v5/plan-template.base.v1.json',location.href)).then(r=>r.json());
      const active=await planStore.ensureActive('2026-09-01',template,template.dataset_version);
      await planStore.commit('mark-adherence',{date:'2026-09-01',status:'followed'},template);

      const before={
        ingredientId:savedI.ingredient.id, recipeId:savedR.recipe.id, planId:active.plan.id,
        ingredients:(await db.getAll('ingredients')).filter(x=>x.origin!=='base').map(x=>x.id).sort(),
        recipes:(await db.getAll('recipes')).filter(x=>x.origin!=='base').map(x=>x.id).sort(),
        plans:(await db.getAll('planInstances')).map(x=>x.id).sort(),
        operations:(await db.getAll('operations')).map(x=>x.id).sort()
      };

      // Simula un browser proveniente da una alpha: la migrazione stabile deve essere non distruttiva.
      await db.put('meta',{key:'stableReleaseMigrationVersion',value:0,updatedAt:new Date().toISOString()});
      await db.put('meta',{key:'currentAppVersion',value:'5.0.0-alpha.7-phase7',updatedAt:new Date().toISOString()});
      await db.initialize();
      const after={
        ingredients:(await db.getAll('ingredients')).filter(x=>x.origin!=='base').map(x=>x.id).sort(),
        recipes:(await db.getAll('recipes')).filter(x=>x.origin!=='base').map(x=>x.id).sort(),
        plans:(await db.getAll('planInstances')).map(x=>x.id).sort(),
        operations:(await db.getAll('operations')).map(x=>x.id).sort()
      };
      const marker=(await db.get('meta','stableReleaseMigrationVersion'))?.value;
      const current=(await db.get('meta','currentAppVersion'))?.value;
      return {stableMeta,appMeta,before,after,marker,current};
    }""")
    check('stable_migration_marker', data_result['marker'] == 5 and data_result['current'] == '5.0.0', data_result)
    check('stable_migration_preserves_personal_data', all(data_result['before'][k] == data_result['after'][k] for k in ['ingredients','recipes','plans','operations']), data_result)

    # Backup from final and backwards-compatible alpha envelope; import and rollback.
    backup_result = page.evaluate("""async () => {
      const db=TataDietDB,b=TataDietBackup;
      const original=await b.createBackup('full');
      const alpha=structuredClone(original);
      alpha.appVersion='5.0.0-alpha.7-phase7';
      alpha.integrity.digest='';
      alpha.integrity.digest=await b.sha256(b.canonical(alpha));
      const preview=await b.preview(alpha);
      const personal=(await db.getAll('ingredients')).find(x=>x.origin!=='base');
      const originalName=personal.name;
      await db.put('ingredients',{...personal,name:'QA MUTATO PRIMA IMPORT',nameNormalized:'qa mutato prima import'});
      await b.importBackup(original,'replace');
      const restored=(await db.get('ingredients',personal.id)).name;
      await b.rollbackLastImport();
      const rolledBack=(await db.get('ingredients',personal.id)).name;
      await b.importBackup(original,'replace');
      return {previewValid:preview.valid, warnings:preview.warnings, originalName, restored, rolledBack, final:(await db.get('ingredients',personal.id)).name, appVersion:original.appVersion};
    }""")
    check('backup_stable_version', backup_result['appVersion'] == '5.0.0', backup_result)
    check('alpha_backup_compatible', backup_result['previewValid'] and bool(backup_result['warnings']), backup_result)
    check('backup_replace_roundtrip', backup_result['restored'] == backup_result['originalName'] and backup_result['final'] == backup_result['originalName'], backup_result)
    check('backup_rollback', backup_result['rolledBack'] == 'QA MUTATO PRIMA IMPORT', backup_result)

    # Service worker install must control a project-path deployment.
    page.goto(base + '/index.html', wait_until='domcontentloaded')
    page.evaluate("() => navigator.serviceWorker.ready")
    if not page.evaluate("() => !!navigator.serviceWorker.controller"):
      page.reload(wait_until='domcontentloaded')
      page.wait_for_function("() => !!navigator.serviceWorker.controller")
    sw_scope = page.evaluate("() => navigator.serviceWorker.ready.then(r => r.scope)")
    check('service_worker_project_scope', sw_scope.rstrip('/').endswith('/docs'), sw_scope)

    # Essential planner/composer pages must work offline without the optional full pack.
    ctx.set_offline(True)
    for route, selector in [('/calendario/modifica/index.html?start=2026-09-01&focus=2026-09-01','[data-effective-plan-app]'),('/calendario/componi/index.html?start=2026-09-01&focus=2026-09-01','[data-composer-app]')]:
      page.goto(base + route, wait_until='domcontentloaded')
      page.wait_for_selector(selector)
    check('core_offline_planner_composer', True)
    ctx.set_offline(False)

    # Download the full static library, then open a deep recipe offline.
    page.goto(base + '/strumenti/index.html', wait_until='domcontentloaded')
    page.wait_for_function("() => !!navigator.serviceWorker.controller")
    pack = page.evaluate("""async () => {
      return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('timeout offline pack')),60000);
        const handler=(ev)=>{const d=ev.data||{}; if(d.type==='OFFLINE_PACK_PROGRESS'&&d.state==='complete'){clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',handler);resolve(d);}};
        navigator.serviceWorker.addEventListener('message',handler);
        navigator.serviceWorker.controller.postMessage({type:'DOWNLOAD_OFFLINE_PACK'});
      });
    }""")
    check('offline_pack_complete', pack.get('failed') == 0 and pack.get('done') == pack.get('total'), pack)
    ctx.set_offline(True)
    page.goto(base + '/ricette/patate-con-crema-di-borlotti-e-finocchi/index.html', wait_until='domcontentloaded')
    check('deep_recipe_offline', page.locator('h1').count() == 1 and page.locator('h1').is_visible())
    ctx.set_offline(False)

    # Explicit update: a new worker waits, then SKIP_WAITING activates it without touching IndexedDB.
    page.goto(base + '/index.html', wait_until='domcontentloaded')
    before_ids = page.evaluate("() => TataDietDB.getAll('ingredients').then(xs => xs.filter(x=>x.origin!=='base').map(x=>x.id).sort())")
    update_result = page.evaluate("""async () => {
      const scope=new URL(document.body.dataset.root||'./',location.href).pathname;
      const url=new URL(`service-worker.js?v=5.0.0-qa-update`,new URL(document.body.dataset.root||'./',location.href));
      const reg=await navigator.serviceWorker.register(url,{scope});
      const start=Date.now();
      while(!reg.waiting && Date.now()-start<30000){await new Promise(r=>setTimeout(r,100));}
      if(!reg.waiting) return {waiting:false};
      const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(true),{once:true}));
      reg.waiting.postMessage({type:'SKIP_WAITING'});
      await Promise.race([changed,new Promise(resolve=>setTimeout(()=>resolve(false),15000))]);
      return {waiting:true,controller:!!navigator.serviceWorker.controller,url:navigator.serviceWorker.controller?.scriptURL||''};
    }""")
    # pwa.js intentionally reloads on controllerchange; wait for the new execution context.
    page.wait_for_timeout(1200)
    page.wait_for_function("() => document.readyState !== 'loading' && !!window.TataDietDB")
    after_ids = page.evaluate("() => TataDietDB.getAll('ingredients').then(xs => xs.filter(x=>x.origin!=='base').map(x=>x.id).sort())")
    check('pwa_update_waiting_and_activate', update_result.get('waiting') and update_result.get('controller'), update_result)
    check('pwa_update_preserves_indexeddb', before_ids == after_ids, [before_ids,after_ids])

    # Key views: no horizontal overflow at a small phone width.
    mobile = ctx.new_page()
    mobile.set_viewport_size({'width':390,'height':844})
    routes=['/index.html','/oggi/index.html?start=2026-09-01&date=2026-09-01','/calendario/index.html?start=2026-09-01','/calendario/modifica/index.html?start=2026-09-01&focus=2026-09-01','/calendario/componi/index.html?start=2026-09-01&focus=2026-09-01','/ingredienti/index.html','/ricette/studio/index.html','/spesa/intervallo/index.html?start=2026-09-01&from=2026-09-01&to=2026-09-07','/strumenti/index.html']
    overflow=[]
    for route in routes:
      mobile.goto(base+route,wait_until='domcontentloaded')
      mobile.wait_for_timeout(120)
      sw,cw=mobile.evaluate("[document.documentElement.scrollWidth,document.documentElement.clientWidth]")
      if sw>cw: overflow.append({'route':route,'scrollWidth':sw,'clientWidth':cw})
    check('mobile_no_horizontal_overflow', not overflow, overflow)
    mobile.goto(base + '/calendario/componi/index.html?start=2026-09-01&focus=2026-09-01', wait_until='domcontentloaded')
    mobile.screenshot(path=str(QA/'release-mobile.png'), full_page=True)

    page.goto(base + '/index.html', wait_until='domcontentloaded')
    page.screenshot(path=str(QA/'release-desktop.png'), full_page=True)

    check('no_page_errors', not page_errors, page_errors)
    # Ignore Chromium's expected offline/network console noise; surface actual uncaught JS via pageerror above.
    browser.close()

report['status']='ok' if all(x['ok'] for x in report['checks']) and not report['errors'] else 'failed'
(QA/'browser-phase8-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
