#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa' / 'v5-phase7'
QA.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', required=True)
args = parser.parse_args()
base = args.base_url.rstrip('/')
report = {'status': 'ok', 'version': '5.0.0-alpha.7-phase7', 'checks': [], 'errors': []}

def check(name, ok, detail=None):
    row = {'name': name, 'ok': bool(ok)}
    if detail is not None:
        row['detail'] = detail
    report['checks'].append(row)

def num_it(text):
    return float(text.replace('.', '').replace(',', '.').strip())

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, service_workers='block', accept_downloads=True)
    page = ctx.new_page()
    page.set_default_timeout(15000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))

    page.goto(base + '/calendario/modifica/index.html?start=2026-09-01&focus=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('[data-effective-plan-loading]', state='hidden')
    check('planner_initialized', page.locator('[data-effective-plan-app]').is_visible())

    page.goto(base + '/calendario/componi/index.html?start=2026-09-01&focus=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('[data-composer-loading]', state='hidden')
    before = num_it(page.locator('[data-composer-kcal]').inner_text())
    card = page.locator('[data-meal-id]').first
    card.locator('[data-meal-portion]').fill('1.5')
    card.locator('[data-meal-update]').click()
    page.wait_for_timeout(200)
    after = num_it(page.locator('[data-composer-kcal]').inner_text())
    check('composer_change_persisted', after > before, [before, after])

    page.goto(base + '/oggi/index.html?start=2026-09-01&date=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('.effective-source-banner')
    today_kcal = num_it(page.locator('.today-nutrition > div').first.locator('strong').inner_text())
    check('today_effective_banner', page.locator('.effective-source-banner').is_visible())
    check('today_effective_nutrition', abs(today_kcal - after) < 1.1, [today_kcal, after])

    page.goto(base + '/preparazioni/index.html?start=2026-09-01&date=2026-09-01&time=08:00', wait_until='domcontentloaded')
    page.wait_for_selector('[data-prep-results] .prep-window-section')
    prep_text = page.locator('[data-prep-results]').inner_text()
    check('prep_effective_source', 'piano personale' in prep_text.lower(), prep_text[:180])

    page.goto(base + '/spesa/intervallo/index.html?start=2026-09-01&from=2026-09-01&to=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('[data-range-shopping-summary]')
    summary = page.locator('[data-range-shopping-summary]').inner_text()
    check('shopping_effective_summary', 'pasti effettivi' in summary, summary)

    page.goto(base + '/calendario/modifica/index.html?start=2026-09-01&focus=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('[data-effective-plan-loading]', state='hidden')
    page.locator('[data-plan-action="leave-day-free"]').click()
    page.wait_for_selector('[data-plan-impact-dialog][open]')
    page.locator('[data-impact-confirm]').click()
    page.wait_for_function("() => document.querySelector('[data-plan-day-title]')?.textContent.toLowerCase().includes('giornata libera')")
    check('planner_free_saved', 'giornata libera' in page.locator('[data-plan-day-title]').inner_text().lower())

    page.goto(base + '/oggi/index.html?start=2026-09-01&date=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('.effective-source-banner')
    check('today_free_zero_meals', '0 appuntamenti alimentari' in page.locator('[data-today-content]').inner_text())

    page.goto(base + '/spesa/intervallo/index.html?start=2026-09-01&from=2026-09-01&to=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('[data-range-shopping-summary]')
    check('shopping_free_zero_meals', '0\npasti effettivi' in page.locator('[data-range-shopping-summary]').inner_text())

    page.goto(base + '/cerca/index.html?start=2026-09-01&q=2026-09-01&type=day', wait_until='domcontentloaded')
    page.wait_for_selector('[data-search-loading]', state='hidden')
    page.wait_for_timeout(180)
    text = page.locator('[data-global-results]').inner_text()
    check('search_effective_day', '2026-09-01' in text and 'FREE' in text, text[:240])

    page.goto(base + '/strumenti/index.html?start=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_selector('[data-ics-app]')
    page.wait_for_timeout(350)
    page.locator('[data-ics-scope]').select_option('custom')
    page.wait_for_selector('[data-ics-custom]', state='visible')
    page.locator('[data-ics-from]').fill('2026-09-01')
    page.locator('[data-ics-to]').fill('2026-09-01')
    with page.expect_download() as dl:
        page.locator('[data-export-ics]').click()
    target = QA / 'effective.ics'
    dl.value.save_as(target)
    raw = target.read_bytes()
    text_ics = raw.decode('utf-8')
    check('ics_effective_free', 'giornata libera' in text_ics and 'TataDiet D1' not in text_ics)
    check('ics_crlf', b'\r\n' in raw)
    check('ics_line_limit', max(len(line) for line in raw.split(b'\r\n')) <= 75)

    page.goto(base + '/index.html?start=2026-09-01', wait_until='domcontentloaded')
    page.wait_for_timeout(250)
    home_text = page.locator('[data-home-calendar-status]').inner_text()
    check('home_effective_status', 'piano personale effettivo' in home_text.lower(), home_text)

    mobile = ctx.new_page()
    mobile.set_viewport_size({'width': 390, 'height': 844})
    mobile.goto(base + '/oggi/index.html?start=2026-09-01&date=2026-09-01', wait_until='domcontentloaded')
    mobile.wait_for_selector('.effective-source-banner')
    dimensions = mobile.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
    check('mobile_today_no_overflow', dimensions[0] <= dimensions[1], dimensions)
    mobile.screenshot(path=str(QA / 'today-effective-mobile.png'), full_page=True)

    page.goto(base + '/spesa/intervallo/index.html?start=2026-09-01&from=2026-09-02&to=2026-09-08', wait_until='domcontentloaded')
    page.wait_for_selector('[data-range-shopping-results]')
    page.screenshot(path=str(QA / 'shopping-effective-desktop.png'), full_page=True)
    browser.close()

report['status'] = 'ok' if not report['errors'] and all(x['ok'] for x in report['checks']) else 'failed'
(QA / 'browser-phase7-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
if report['status'] != 'ok':
    raise SystemExit(1)
