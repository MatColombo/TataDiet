#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; QA=ROOT/'qa'/'v5-phase4'; QA.mkdir(parents=True,exist_ok=True)
report={'status':'ok','version':'5.0.0-alpha.4-phase4','checks':[],'errors':[]}
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    raise SystemExit(f'Playwright non disponibile: {exc}')
parser=argparse.ArgumentParser();parser.add_argument('--base-url',required=True);args=parser.parse_args();base=args.base_url.rstrip('/')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.goto(base+'/ricette/studio/index.html',wait_until='networkidle')
    page.wait_for_selector('[data-recipes-loading]',state='hidden')
    report['checks'].append({'name':'studio_loaded','ok':page.locator('[data-recipe-studio-grid]').count()==1})
    page.click('[data-new-recipe]')
    page.fill('[name="title"]','QA ricetta personale')
    page.fill('[name="mealTypes"]','Pranzo')
    row=page.locator('.recipe-editor-line').first
    row.locator('[data-line="ingredientId"]').select_option('base:ingredient:banana')
    row.locator('[data-line="amount"]').fill('100')
    page.wait_for_timeout(100)
    kcal=page.locator('[data-recipe-preview-kcal]').inner_text()
    report['checks'].append({'name':'live_nutrition','ok':kcal not in {'0','—',''}})
    page.click('[data-save-recipe]')
    page.wait_for_timeout(300)
    report['checks'].append({'name':'created_card','ok':page.get_by_text('QA ricetta personale',exact=True).count()>=1})
    card=page.locator('.recipe-studio-card',has_text='QA ricetta personale').first
    card.get_by_role('button',name='Modifica').click(); page.wait_for_timeout(100)
    page.fill('[name="title"]','QA ricetta personale v2'); page.click('[data-save-recipe]'); page.wait_for_timeout(300)
    report['checks'].append({'name':'version2','ok':page.locator('.recipe-studio-card',has_text='QA ricetta personale v2').count()==1})
    page.screenshot(path=str(QA/'recipe-studio-desktop.png'),full_page=True)
    mobile=browser.new_page(viewport={'width':390,'height':844}); mobile.goto(base+'/ricette/studio/index.html',wait_until='networkidle'); mobile.wait_for_selector('[data-recipes-loading]',state='hidden');
    report['checks'].append({'name':'mobile_no_overflow','ok':mobile.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')})
    mobile.screenshot(path=str(QA/'recipe-studio-mobile.png'),full_page=True)
    browser.close()
report['status']='ok' if not report['errors'] and all(x['ok'] for x in report['checks']) else 'failed'
(QA/'browser-phase4-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
