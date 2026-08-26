#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa'/'v5-phase6';QA.mkdir(parents=True,exist_ok=True)
report={'status':'ok','version':'5.0.0-alpha.6-phase6','checks':[],'errors':[]}
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--base-url',required=True);args=parser.parse_args();base=args.base_url.rstrip('/')
def check(name,ok,detail=None): report['checks'].append({'name':name,'ok':bool(ok),**({'detail':detail} if detail is not None else {})})
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1050},service_workers='block')
    page=context.new_page();page.set_default_timeout(10000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.goto(base+'/calendario/componi/index.html?start=2026-09-01&focus=2026-09-01',wait_until='domcontentloaded')
    page.wait_for_selector('[data-composer-loading]',state='hidden')
    check('composer_loaded',page.locator('[data-composer-app]').is_visible())
    check('initial_five_meals',page.locator('[data-meal-id]').count()==5,page.locator('[data-meal-id]').count())
    kcal=float(page.locator('[data-composer-kcal]').inner_text().replace('.','').replace(',','.'))
    check('historical_versions_resolved',kcal>1500,kcal)
    first=page.locator('[data-meal-id]').first;original_title=first.locator('h3').inner_text()
    first.locator('[data-meal-replace]').click();page.wait_for_selector('[data-recipe-picker][open]');check('picker_populated',page.locator('[data-pick-version]').count()>20,page.locator('[data-pick-version]').count())
    page.locator('[data-picker-fit]').select_option('cold');page.wait_for_timeout(80);cold_count=page.locator('[data-pick-version]').count();check('picker_fit_filter',cold_count>0 and cold_count<=80,cold_count);page.locator('[data-picker-fit]').select_option('all')
    page.locator('[data-pick-version]').first.click();page.wait_for_selector('[data-recipe-picker]',state='hidden');page.wait_for_timeout(120)
    check('recipe_replaced',page.locator('[data-meal-id]').first.locator('h3').inner_text()!=original_title)
    card=page.locator('[data-meal-id]').first;before=float(page.locator('[data-composer-kcal]').inner_text().replace('.','').replace(',','.'));card.locator('[data-meal-portion]').fill('1.3');card.locator('[data-meal-update]').click();page.wait_for_timeout(120);after=float(page.locator('[data-composer-kcal]').inner_text().replace('.','').replace(',','.'));check('portion_recalculates',abs(after-before)>1,(before,after))
    card=page.locator('[data-meal-id]').first;card.locator('[data-meal-lock]').click();page.wait_for_function("document.querySelector('[data-meal-id] [data-meal-lock]').getAttribute('aria-pressed') === 'true'");locked_title=page.locator('[data-meal-id]').first.locator('h3').inner_text();check('meal_locked',page.locator('[data-meal-id]').first.locator('[data-meal-lock]').get_attribute('aria-pressed')=='true')
    page.locator('[data-composer-suggest]').click();page.wait_for_selector('[data-suggest-dialog][open]');check('suggest_preview',page.locator('[data-suggest-preview] .suggest-row').count()==5);check('suggest_respects_lock','🔒' in page.locator('[data-suggest-preview]').inner_text());page.locator('[data-suggest-apply]').click();page.wait_for_timeout(160);check('locked_recipe_preserved',page.locator('[data-meal-id]').first.locator('h3').inner_text()==locked_title)
    page.locator('[data-composer-template]').click();page.wait_for_selector('[data-template-dialog][open]');sel=page.locator('[data-template-select]');# choose first D3 option by label
    options=sel.locator('option').all();target=None
    for opt in options:
        if '· D3 ·' in opt.inner_text(): target=opt.get_attribute('value');break
    if target: sel.select_option(target)
    page.locator('[data-template-apply]').click();page.wait_for_timeout(160);check('template_d3_three_meals',page.locator('[data-meal-id]').count()==3,page.locator('[data-meal-id]').count())
    page.locator('[data-composer-undo]').click();page.wait_for_timeout(140);check('undo_template',page.locator('[data-meal-id]').count()==5,page.locator('[data-meal-id]').count())
    page.locator('[data-composer-add]').click();page.locator('[data-add-time]').fill('22:30');page.locator('[data-add-type]').fill('Spuntino');page.locator('[data-add-choose]').click();page.wait_for_selector('[data-recipe-picker][open]');page.locator('[data-pick-version]').first.click();page.wait_for_timeout(140);check('manual_add',page.locator('[data-meal-id]').count()==6,page.locator('[data-meal-id]').count())
    page.screenshot(path=str(QA/'composer-desktop.png'),full_page=True)
    mobile=context.new_page();mobile.set_viewport_size({'width':390,'height':844});mobile.goto(base+'/calendario/componi/index.html?start=2026-09-01&focus=2026-09-01',wait_until='domcontentloaded');mobile.wait_for_selector('[data-composer-loading]',state='hidden');check('mobile_no_overflow',mobile.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),mobile.evaluate('[document.documentElement.scrollWidth,document.documentElement.clientWidth]'));mobile.screenshot(path=str(QA/'composer-mobile.png'),full_page=True)
    browser.close()
report['status']='ok' if not report['errors'] and all(x['ok'] for x in report['checks']) else 'failed'
(QA/'browser-phase6-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
