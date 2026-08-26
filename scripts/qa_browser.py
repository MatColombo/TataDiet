#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "qa" / "v4"
QA.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description="Controllo browser responsive, PWA e offline della V4")
parser.add_argument("--base-url", default="http://127.0.0.1:8000")
parser.add_argument("--executable-path", default=None)
args = parser.parse_args()
BASE = args.base_url.rstrip("/")
results: list[dict] = []
errors: list[str] = []


def inspect(page, label: str):
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    results.append({"page": label, "url": page.url, "horizontal_overflow_px": overflow})
    if overflow > 2:
        errors.append(f"Overflow orizzontale {label}: {overflow}px")


def wire(page, prefix=""):
    page.on("console", lambda msg: errors.append(f"{prefix}console {msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"{prefix}pageerror: {exc}"))


with sync_playwright() as p:
    launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if args.executable_path:
        launch["executable_path"] = args.executable_path
    browser = p.chromium.launch(**launch)

    desktop = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        locale="it-IT",
        timezone_id="Europe/Rome",
        accept_downloads=True,
        service_workers="allow",
    )
    page = desktop.new_page(); wire(page)

    page.goto(f"{BASE}/?start=2026-09-07", wait_until="networkidle")
    page.wait_for_selector(".hero-v4")
    assert page.locator(".hero-illustration").count() == 1
    assert page.locator(".operation-card").count() >= 4
    assert page.locator('link[rel="manifest"]').count() == 1
    inspect(page, "home V4 desktop")
    page.screenshot(path=str(QA / "home-desktop.png"), full_page=True)

    page.goto(f"{BASE}/calendario/?start=2026-09-07&focus=2026-09-09", wait_until="networkidle")
    page.wait_for_selector(".calendar-day-cell.is-focus")
    assert page.locator(".calendar-day-cell.is-focus .calendar-flag.tail").count() == 1
    assert page.locator("[data-prep-link]").count() == 1
    inspect(page, "calendario desktop")
    page.screenshot(path=str(QA / "calendar-month-desktop.png"), full_page=True)

    page.click('[data-calendar-view="overview"]')
    page.wait_for_selector(".cycle-calendar-card")
    assert page.locator(".cycle-calendar-card").count() == 6
    assert page.locator(".cycle-mini-day").count() == 180
    inspect(page, "panoramica sei cicli")
    page.screenshot(path=str(QA / "calendar-overview-desktop.png"), full_page=True)

    page.goto(f"{BASE}/oggi/?start=2026-08-24", wait_until="networkidle")
    page.wait_for_selector(".today-shift-hero")
    page.wait_for_selector("[data-today-prep-preview]:not([hidden])")
    assert page.locator(".prep-preview-card").count() >= 1
    assert "24 e 48" in page.locator("[data-today-prep-preview]").inner_text()
    inspect(page, "oggi con prep")
    page.screenshot(path=str(QA / "today-desktop.png"), full_page=True)

    page.goto(f"{BASE}/preparazioni/?start=2026-09-07&date=2026-09-07&time=08:00", wait_until="networkidle")
    page.wait_for_selector('.prep-window-section[data-prep-segment="first"]')
    page.wait_for_selector('.prep-window-section[data-prep-segment="second"]')
    assert page.locator('.prep-window-section[data-prep-segment="first"] .prep-task').count() >= 1
    assert page.locator('.prep-window-section[data-prep-segment="second"] .prep-task').count() >= 1
    assert page.locator("[data-prep-summary] > div").count() == 4
    summary_text = page.locator("[data-prep-summary]").inner_text()
    assert "prime 24" in summary_text and "24 e 48" in summary_text
    assert "9 settembre" in page.locator("[data-prep-window]").inner_text().lower()
    inspect(page, "preparazioni 48 ore complete")
    page.screenshot(path=str(QA / "preparations-desktop.png"), full_page=True)

    page.goto(f"{BASE}/spesa/intervallo/?start=2026-09-07&from=2026-09-07&to=2026-09-11", wait_until="networkidle")
    page.wait_for_selector(".range-shopping-item")
    assert page.locator(".range-shopping-item").count() == 46
    assert "5" in page.locator("[data-range-shopping-summary]").inner_text()
    inspect(page, "spesa per intervallo")
    page.screenshot(path=str(QA / "shopping-range-desktop.png"), full_page=True)

    page.goto(f"{BASE}/cerca/?start=2026-09-07&q=mozzarella", wait_until="networkidle")
    page.wait_for_selector(".search-result-card")
    assert page.locator(".search-result-card.type-ingredient").count() >= 1
    assert page.locator(".search-result-card.type-recipe").count() >= 1
    inspect(page, "ricerca globale")
    page.screenshot(path=str(QA / "search-desktop.png"), full_page=True)

    page.goto(f"{BASE}/ricette/", wait_until="networkidle")
    page.wait_for_selector(".recipe-card")
    page.select_option('[data-filter="time"]', "10")
    page.check('[data-filter="cold"]')
    visible = page.locator(".recipe-card:not([hidden])").count()
    assert 0 < visible < 306
    inspect(page, "filtri ricette")
    page.screenshot(path=str(QA / "recipes-filtered-desktop.png"), full_page=True)

    page.goto(f"{BASE}/strumenti/?start=2026-09-07", wait_until="networkidle")
    page.wait_for_selector("[data-ics-app]:not([hidden])")
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.ready")
    sw_info = page.evaluate("navigator.serviceWorker.ready.then(r => ({scope:r.scope, active:Boolean(r.active)}))")
    assert sw_info["active"] is True
    page.wait_for_function("document.querySelector('[data-offline-pack-count]')?.textContent !== '—'")
    assert int(page.locator("[data-offline-pack-count]").inner_text()) >= 600
    assert "MB" in page.locator("[data-offline-pack-size]").inner_text()
    with page.expect_download() as download_info:
        page.click("[data-export-ics]")
    download = download_info.value
    ics_path = QA / "test-export.ics"
    download.save_as(str(ics_path))
    ics_text = ics_path.read_text(encoding="utf-8")
    assert "BEGIN:VCALENDAR" in ics_text and ics_text.count("BEGIN:VEVENT") == 180
    assert "Versione 4" in ics_text
    inspect(page, "strumenti PWA ed export ICS")
    page.screenshot(path=str(QA / "tools-desktop.png"), full_page=True)

    # Download and verify the optional full offline library.
    page.click("[data-download-offline-pack]")
    page.wait_for_selector("[data-offline-pack-status].is-ready", timeout=120000)
    assert "Libreria offline disponibile" in page.locator("[data-offline-pack-status]").inner_text()
    pack_status = page.locator("[data-offline-pack-status]").inner_text()
    results.append({"page": "libreria offline completa", "status": pack_status, "service_worker_scope": sw_info["scope"]})

    # A deep, non-core page must remain reachable without network after the pack download.
    first_recipe_slug = page.evaluate("fetch('../data/recipes.json').then(r=>r.json()).then(d=>d.recipes[0].slug)")
    desktop.set_offline(True)
    page.goto(f"{BASE}/ricette/{first_recipe_slug}/index.html", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_selector("h1")
    assert page.locator(".network-chip.is-offline").count() == 1
    inspect(page, "ricetta profonda offline")
    page.screenshot(path=str(QA / "offline-deep-recipe-desktop.png"), full_page=True)
    desktop.set_offline(False)
    page.goto(f"{BASE}/strumenti/?start=2026-09-07", wait_until="networkidle")
    page.wait_for_selector("[data-offline-pack-status].is-ready")

    desktop.close()

    mobile = browser.new_context(viewport={"width": 390, "height": 844}, locale="it-IT", timezone_id="Europe/Rome", service_workers="allow")
    mpage = mobile.new_page(); wire(mpage, "mobile ")
    for label, path, selector, shot in [
        ("home mobile", "/?start=2026-09-07", ".hero-v4", "home-mobile.png"),
        ("oggi mobile", "/oggi/?start=2026-08-24", ".today-shift-hero", "today-mobile.png"),
        ("prep mobile", "/preparazioni/?start=2026-09-07&date=2026-09-07&time=08:00", '[data-prep-segment="second"]', "preparations-mobile.png"),
        ("spesa mobile", "/spesa/intervallo/?start=2026-09-07&from=2026-09-07&to=2026-09-11", ".range-shopping-item", "shopping-range-mobile.png"),
        ("strumenti mobile", "/strumenti/?start=2026-09-07", ".pwa-feature-card", "tools-mobile.png"),
    ]:
        mpage.goto(f"{BASE}{path}", wait_until="networkidle")
        mpage.wait_for_selector(selector)
        assert mpage.locator(".mobile-nav a").count() == 5
        inspect(mpage, label)
        mpage.screenshot(path=str(QA / shot), full_page=True)
    assert mpage.locator(".pwa-feature-card").count() == 1
    mobile.close()

    clean = browser.new_context(viewport={"width": 1100, "height": 800}, locale="it-IT", timezone_id="Europe/Rome", service_workers="allow")
    cpage = clean.new_page(); wire(cpage, "clean ")
    cpage.goto(f"{BASE}/preparazioni/", wait_until="networkidle")
    cpage.wait_for_selector("[data-plan-setup]:not([hidden])")
    assert cpage.locator("[data-prep-app]:not([hidden])").count() == 0
    inspect(cpage, "configurazione iniziale V4")
    cpage.screenshot(path=str(QA / "setup-desktop.png"), full_page=True)
    clean.close()
    browser.close()

report = {"status": "ok" if not errors else "failed", "version": "4.0.0", "results": results, "errors": errors}
(QA / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
if errors:
    raise SystemExit(1)
