#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa'/'v5-phase5';QA.mkdir(parents=True,exist_ok=True)
report={'status':'ok','version':'5.0.0-alpha.5-phase5','checks':[],'errors':[]}
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    raise SystemExit(f'Playwright non disponibile: {exc}')
parser=argparse.ArgumentParser();parser.add_argument('--base-url',required=True);args=parser.parse_args();base=args.base_url.rstrip('/')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1050})
    page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.goto(base+'/calendario/modifica/index.html?start=2026-09-01&focus=2026-09-04',wait_until='networkidle')
    page.wait_for_selector('[data-effective-plan-loading]',state='hidden')
    report['checks'].append({'name':'planner_loaded','ok':page.locator('[data-effective-plan-app]').is_visible()})
    report['checks'].append({'name':'initial_180','ok':page.locator('[data-plan-day-count]').inner_text().strip()=='180'})
    page.get_by_role('button',name='Non seguita').click();page.wait_for_function("document.querySelector('[data-plan-adherence]').textContent.includes('Non seguita')")
    report['checks'].append({'name':'adherence_saved','ok':'Non seguita' in page.locator('[data-plan-adherence]').inner_text()})
    page.locator('[data-plan-day-type]').select_option('CUSTOM');page.locator('[data-custom-shift-name]').fill('Turno QA 10-22');page.locator('[data-custom-start]').fill('10:00');page.locator('[data-custom-end]').fill('22:00');page.locator('[data-plan-change-type]').click();page.wait_for_function("document.querySelector('[data-plan-day-shift]').textContent.includes('Turno QA 10-22')")
    report['checks'].append({'name':'custom_shift','ok':'Turno QA 10-22' in page.locator('[data-plan-day-shift]').inner_text()})
    page.locator('[data-plan-focus-date]').fill('2026-09-10');page.locator('[data-plan-go-date]').click();page.get_by_role('button',name='Posticipa da qui').click();page.locator('[data-impact-confirm]').click();page.wait_for_timeout(180)
    report['checks'].append({'name':'postpone_181','ok':page.locator('[data-plan-day-count]').inner_text().strip()=='181'})
    page.locator('[data-plan-undo]').click();page.wait_for_timeout(160)
    report['checks'].append({'name':'undo_180','ok':page.locator('[data-plan-day-count]').inner_text().strip()=='180'})
    page.screenshot(path=str(QA/'planner-desktop.png'),full_page=True)
    page.goto(base+'/calendario/index.html?start=2026-09-01&focus=2026-09-04',wait_until='networkidle');page.wait_for_selector('[data-calendar-grid] .calendar-day-cell')
    page.wait_for_timeout(250)
    changed=page.locator('[data-calendar-date="2026-09-04"]')
    report['checks'].append({'name':'calendar_overlay','ok':'is-effective-changed' in (changed.get_attribute('class') or '')})
    report['checks'].append({'name':'effective_banner','ok':page.locator('[data-effective-calendar-banner]').is_visible()})
    mobile=context.new_page();mobile.set_viewport_size({'width':390,'height':844});mobile.goto(base+'/calendario/modifica/index.html?start=2026-09-01&focus=2026-09-04',wait_until='networkidle');mobile.wait_for_selector('[data-effective-plan-loading]',state='hidden');
    report['checks'].append({'name':'mobile_no_overflow','ok':mobile.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')})
    mobile.screenshot(path=str(QA/'planner-mobile.png'),full_page=True)
    browser.close()
report['status']='ok' if not report['errors'] and all(x['ok'] for x in report['checks']) else 'failed'
(QA/'browser-phase5-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok':raise SystemExit(1)
