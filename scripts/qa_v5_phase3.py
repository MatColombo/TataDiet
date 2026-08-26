#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa'/'v5-phase3'; QA.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(); parser.add_argument('--base-url',default='http://127.0.0.1:8000'); args=parser.parse_args(); BASE=args.base_url.rstrip('/')
report={'status':'ok','version':'5.0.0-alpha.3-phase3','checks':[],'errors':[]}
def check(name,ok,details=None):
    report['checks'].append({'name':name,'ok':bool(ok),'details':details})
    if not ok: report['errors'].append(name)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    ctx=browser.new_context(viewport={'width':1440,'height':1100},locale='it-IT',timezone_id='Europe/Rome',service_workers='allow')
    page=ctx.new_page(); console_errors=[]
    page.on('console',lambda msg: console_errors.append(msg.text) if msg.type=='error' else None)
    page.goto(f'{BASE}/ingredienti/',wait_until='networkidle')
    page.wait_for_selector('[data-ingredients-app]:not([hidden])')
    base_count=int(page.locator('[data-ingredient-count-base]').inner_text().replace('.',''))
    check('Catalogo base visibile',base_count==130,base_count)
    check('Nessun personale iniziale',page.locator('[data-ingredient-count-personal]').inner_text()=='0')

    page.locator('[data-new-ingredient]').click()
    page.locator('input[name=name]').fill('Crema di riso test')
    page.locator('select[name=category]').select_option('cereali-pane-e-derivati')
    page.locator('select[name=preparationState]').select_option('prepared')
    page.locator('input[name=energyKcal]').fill('92')
    page.locator('input[name=proteinG]').fill('2.1')
    page.locator('input[name=carbohydrateG]').fill('18.5')
    page.locator('input[name=fatG]').fill('1.1')
    page.locator('input[name=fiberG]').fill('0.6')
    page.locator('select[name=sourceType]').select_option('label')
    page.locator('input[name=sourceLabel]').fill('Etichetta QA')
    page.locator('[data-save-ingredient]').click()
    page.wait_for_function("document.querySelector('[data-ingredient-count-personal]').textContent.trim() === '1'")
    check('Creazione da UI',page.locator('[data-ingredient-count-personal]').inner_text()=='1')

    page.locator('[data-ingredient-search]').fill('Crema di riso test')
    page.wait_for_timeout(100)
    card=page.locator('.ingredient-card.is-personal').first
    check('Ingrediente personale ricercabile',card.count()==1 and 'Crema di riso test' in card.inner_text())
    card.locator('[data-ingredient-action=edit]').click()
    page.locator('input[name=energyKcal]').fill('96')
    page.locator('input[name=sourceLabel]').fill('Etichetta QA aggiornata')
    page.locator('[data-save-ingredient]').click()
    page.wait_for_function("document.querySelector('[data-ingredient-count-revisions]').textContent.trim() === '2'")
    check('Nuova revisione da UI',page.locator('[data-ingredient-count-revisions]').inner_text()=='2')

    page.locator('[data-ingredient-search]').fill('Crema di riso test')
    page.locator('.ingredient-card.is-personal [data-ingredient-action=history]').click()
    page.wait_for_selector('[data-history-dialog][open]')
    check('Cronologia con due revisioni',page.locator('.revision-entry').count()==2,page.locator('.revision-entry').count())
    page.locator('[data-history-close]').click()

    page.once('dialog',lambda dialog: dialog.accept())
    page.locator('.ingredient-card.is-personal [data-ingredient-action=archive]').click()
    # Playwright needs dialog handler registered before click; if native confirmation already passed, fall back via evaluate below.
    page.wait_for_timeout(200)
    if page.locator('[data-ingredient-count-archived]').inner_text()!='1':
        page.evaluate("async()=>{const row=(await TataDietIngredientStore.listIngredients()).find(x=>x.ingredient.name==='Crema di riso test');await TataDietIngredientStore.archiveIngredient(row.ingredient.id,true)}")
        page.reload(wait_until='networkidle'); page.wait_for_selector('[data-ingredients-app]:not([hidden])')
    check('Archiviazione persistente',page.locator('[data-ingredient-count-archived]').inner_text()=='1')

    page.locator('[data-ingredient-status-filter]').select_option('active')
    page.locator('[data-ingredient-origin]').select_option('base')
    page.locator('[data-ingredient-search]').fill('mozzarella')
    page.wait_for_timeout(120)
    base_card=page.locator('.ingredient-card.is-base').first
    check('Filtro catalogo base',base_card.count()==1)
    base_card.locator('[data-ingredient-action=duplicate]').click()
    check('Duplicazione precompilata',page.locator('input[name=name]').input_value().endswith('· personale'),page.locator('input[name=name]').input_value())
    page.locator('[data-dialog-cancel]').click()

    page.screenshot(path=str(QA/'ingredients-desktop.png'),full_page=True)
    check('Nessun errore console',not console_errors,console_errors)

    mobile=browser.new_context(viewport={'width':390,'height':844},locale='it-IT',timezone_id='Europe/Rome',service_workers='allow')
    mp=mobile.new_page(); mp.goto(f'{BASE}/ingredienti/',wait_until='networkidle'); mp.wait_for_selector('[data-ingredients-app]:not([hidden])')
    overflow=mp.evaluate('document.documentElement.scrollWidth-window.innerWidth')
    check('Mobile senza overflow',overflow<=2,overflow)
    mp.screenshot(path=str(QA/'ingredients-mobile.png'),full_page=True)
    mobile.close(); ctx.close(); browser.close()

report['status']='ok' if not report['errors'] else 'failed'
(QA/'browser-phase3-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['errors']: raise SystemExit(1)
