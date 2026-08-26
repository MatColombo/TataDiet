#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa'/'v5-phase2'; QA.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(); parser.add_argument('--base-url',default='http://127.0.0.1:8000'); args=parser.parse_args(); BASE=args.base_url.rstrip('/')
report={'status':'ok','version':'5.0.0-alpha.2-phase2','checks':[],'errors':[]}

def check(name, ok, details=None):
    report['checks'].append({'name':name,'ok':bool(ok),'details':details})
    if not ok: report['errors'].append(name)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    ctx=browser.new_context(viewport={'width':1440,'height':1100},locale='it-IT',timezone_id='Europe/Rome',accept_downloads=True,service_workers='allow')
    # V4 data exists before first V5 page initializes.
    ctx.add_init_script("""
      localStorage.setItem('diet-plan:start-date:v2','2026-09-07');
      localStorage.setItem('diet-plan-shopping:test-scope', JSON.stringify({apple:true}));
      localStorage.setItem('diet-plan-shopping-range:test-range', JSON.stringify({milk:true}));
    """)
    page=ctx.new_page()
    console_errors=[]
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type=='error' else None)
    page.goto(f'{BASE}/strumenti/?start=2026-09-07', wait_until='networkidle')
    page.wait_for_selector('[data-v5-db-state]')
    page.wait_for_function("document.querySelector('[data-v5-db-state]').textContent === 'Pronto'")
    page.screenshot(path=str(QA/'tools-phase2-desktop.png'),full_page=True)
    check('UI IndexedDB pronta', page.locator('[data-v5-db-state]').inner_text()=='Pronto')
    check('UI catalogo base', '130 ingredienti' in page.locator('[data-v5-base-count]').inner_text() and '306 ricette' in page.locator('[data-v5-base-count]').inner_text())
    check('Migrazione V4 visibile', '2 checklist' in page.locator('[data-v5-migration]').inner_text(), page.locator('[data-v5-migration]').inner_text())

    result=page.evaluate("""async () => {
      const db=TataDietDB, b=TataDietBackup;
      const counts=await db.counts();
      const start=await db.getSetting('planStartDate');
      const legacy=await db.getAll('shoppingChecklists');
      const personalIngredient={recordType:'ingredient',id:'usr:ingredient:test-milk',name:'Latte test',nameNormalized:'latte test',category:'latticini-e-uova',origin:'personal',currentRevisionId:'usr:ingredient-revision:test-milk@1',archivedAt:null};
      const personalRevision={recordType:'ingredientRevision',id:'usr:ingredient-revision:test-milk@1',ingredientId:'usr:ingredient:test-milk',revisionNumber:1,basis:{amount:100,unit:'ml'},preparationState:'as-sold',brand:null,nutrition:{energy_kcal:50,protein_g:3.3,carbohydrate_g:4.8,fat_g:1.5,fiber_g:0,sugars_g:null,saturated_fat_g:null,salt_g:null,sodium_mg:null},conversions:[],allergens:[],toleranceNotes:null,source:{kind:'label',name:'Etichetta test',url:null,note:null},createdAt:new Date().toISOString(),origin:'personal'};
      await db.put('ingredients',personalIngredient); await db.put('ingredientRevisions',personalRevision); await db.setSetting('phase2RoundTrip','before-export','qa');
      const backup=await b.createBackup('full');
      const preview=await b.preview(backup);
      await db.setSetting('phase2RoundTrip','mutated','qa');
      const imported=await b.importBackup(backup,'replace');
      const restored=await db.getSetting('phase2RoundTrip');
      const corrupted=structuredClone(backup); corrupted.data.settings.phase2RoundTrip='tampered';
      const corruptPreview=await b.preview(corrupted);
      const incompatible=structuredClone(backup); incompatible.baseDataset.id='other-dataset'; incompatible.integrity.digest=await b.sha256(b.canonical({...incompatible,integrity:{algorithm:'sha256',digest:''}}));
      const incompatiblePreview=await b.preview(incompatible);
      await db.setSetting('phase2RoundTrip','post-import-change','qa');
      await b.rollbackLastImport();
      const rollbackValue=await db.getSetting('phase2RoundTrip');
      const finalCounts=await db.counts();
      return {counts,start,legacyCount:legacy.length,backupCounts:{ingredients:backup.data.ingredients.length,revisions:backup.data.ingredientRevisions.length,checklists:backup.data.shoppingChecklists.length,settings:Object.keys(backup.data.settings).length},previewValid:preview.valid,restored,corruptValid:corruptPreview.valid,corruptErrors:corruptPreview.errors,incompatibleValid:incompatiblePreview.valid,incompatibleErrors:incompatiblePreview.errors,rollbackValue,finalCounts,remapped:imported.remappedIds};
    }""")
    check('Seed base IndexedDB', result['counts']['ingredients']>=130 and result['counts']['recipes']>=306, result['counts'])
    check('Data iniziale migrata', result['start']=='2026-09-07', result['start'])
    check('Checklist V4 migrate', result['legacyCount']==2, result['legacyCount'])
    check('Backup include solo ingrediente personale', result['backupCounts']['ingredients']==1 and result['backupCounts']['revisions']==1, result['backupCounts'])
    check('Backup include checklist', result['backupCounts']['checklists']==2, result['backupCounts'])
    check('Anteprima checksum valida', result['previewValid'] is True)
    check('Round-trip replace ripristina setting', result['restored']=='before-export', result['restored'])
    check('Corruzione checksum bloccata', result['corruptValid'] is False and any('Checksum' in x for x in result['corruptErrors']), result['corruptErrors'])
    check('Dataset incompatibile bloccato', result['incompatibleValid'] is False and any('incompatibile' in x for x in result['incompatibleErrors']), result['incompatibleErrors'])
    check('Rollback checkpoint funzionante', result['rollbackValue']=='before-export', result['rollbackValue'])
    check('Nessun errore console', not console_errors, console_errors)

    # Mobile visual check.
    mobile=browser.new_context(viewport={'width':390,'height':844},locale='it-IT',timezone_id='Europe/Rome',service_workers='allow')
    mp=mobile.new_page(); mp.goto(f'{BASE}/strumenti/?start=2026-09-07',wait_until='networkidle'); mp.wait_for_function("document.querySelector('[data-v5-db-state]').textContent === 'Pronto'")
    overflow=mp.evaluate('document.documentElement.scrollWidth-window.innerWidth')
    check('UI mobile senza overflow', overflow<=2, overflow)
    mp.screenshot(path=str(QA/'tools-phase2-mobile.png'),full_page=True)
    mobile.close(); ctx.close(); browser.close()

report['status']='ok' if not report['errors'] else 'failed'
(QA/'browser-phase2-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['errors']: raise SystemExit(1)
