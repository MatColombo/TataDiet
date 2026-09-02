#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
VERSION = "5.1.0"


def load_json(name: str):
    return json.loads((DOCS / "data" / name).read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    html_files = sorted(DOCS.rglob("*.html"))
    id_cache: dict[Path, set[str]] = {}
    links_checked = 0

    def ids_for(path: Path) -> set[str]:
        path = path.resolve()
        if path not in id_cache:
            soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
            id_cache[path] = {str(tag.get("id")) for tag in soup.find_all(attrs={"id": True})}
        return id_cache[path]

    for html in html_files:
        soup = BeautifulSoup(html.read_text(encoding="utf-8"), "html.parser")
        if not soup.title or not soup.title.get_text(strip=True):
            errors.append(f"Titolo mancante: {html.relative_to(DOCS)}")
        if not soup.find("h1"):
            warnings.append(f"H1 mancante: {html.relative_to(DOCS)}")
        if soup.body and soup.body.get("data-version") != VERSION:
            errors.append(f"Versione HTML non coerente: {html.relative_to(DOCS)}")

        for tag in soup.find_all(["a", "link", "script"]):
            links_checked += 1
            attr = "href" if tag.name in {"a", "link"} else "src"
            value = tag.get(attr)
            if not value:
                continue
            parts = urlsplit(value)
            if parts.scheme in {"http", "https", "mailto", "tel", "data", "javascript"} or value.startswith("//"):
                continue
            path_text = unquote(parts.path)
            if not path_text:
                target = html
            elif path_text.startswith("/"):
                errors.append(f"Percorso assoluto non portabile in {html.relative_to(DOCS)}: {value}")
                continue
            else:
                target = (html.parent / path_text).resolve()
                if target.is_dir():
                    target = target / "index.html"
            try:
                target.relative_to(DOCS.resolve())
            except ValueError:
                errors.append(f"Collegamento fuori docs in {html.relative_to(DOCS)}: {value}")
                continue
            if not target.exists():
                errors.append(f"Target mancante in {html.relative_to(DOCS)}: {value} -> {target}")
                continue
            if parts.fragment and target.suffix.lower() == ".html":
                fragment = unquote(parts.fragment)
                if fragment not in ids_for(target):
                    errors.append(f"Frammento mancante in {html.relative_to(DOCS)}: {value}")

    plan = load_json("plan.json")
    recipes = load_json("recipes.json")
    calendar = load_json("calendar.json")
    shopping = load_json("shopping.json")
    shopping_range = load_json("shopping-range.json")
    search_index = load_json("search-index.json")
    meta = load_json("build-meta.json")
    offline_assets = load_json("offline-assets.json")

    days = [day for cycle in plan["cycles"] for variant in cycle["variants"] for day in variant["days"]]
    meals = [meal for day in days for meal in day["meals"]]
    range_records = sum(len(day.get("ingredients", [])) for day in shopping_range["days"])
    search_counts = Counter(entry["type"] for entry in search_index["entries"])

    checks = {
        "cicli": (len(plan["cycles"]), 6),
        "varianti": (sum(len(c["variants"]) for c in plan["cycles"]), 36),
        "giorni": (len(days), 180),
        "pasti": (len(meals), 864),
        "ricette": (len(recipes["recipes"]), 306),
        "html": (len(html_files), 590),
        "giorni calendario": (len(calendar["days"]), 180),
        "pasti calendario": (sum(len(day["meals"]) for day in calendar["days"]), 864),
        "giorni spesa intervallo": (len(shopping_range["days"]), 180),
        "record ingredienti-giorno aggregati": (range_records, 2735),
        "regole arrotondamento": (len(shopping_range["rules"]), 100),
        "ricerca ricette": (search_counts["recipe"], 306),
        "ricerca ingredienti": (search_counts["ingredient"], 100),
        "ricerca giorni": (search_counts["day"], 180),
        "ricerca varianti": (search_counts["variant"], 36),
        "ricerca cicli": (search_counts["cycle"], 6),
    }
    for label, (actual, expected) in checks.items():
        if actual != expected:
            errors.append(f"Conteggio {label}: {actual}, atteso {expected}")

    versioned = [plan, recipes, calendar, shopping, shopping_range, search_index, meta, offline_assets]
    for dataset in versioned:
        if dataset.get("version") != VERSION:
            errors.append(f"Versione JSON non coerente: {dataset.get('version')!r}")
    if meta["counts"]["days"] != len(days) or meta["counts"]["meals"] != len(meals):
        errors.append("build-meta non coerente con plan.json")
    if calendar.get("start_mapping") != {"cycle": 1, "variant": 1, "d_code": "D1", "global_day": 1}:
        errors.append("Mappatura della data iniziale non valida")

    # Reconciliation: exact quantities for C1/V1 must match days 1-5.
    aggregate: dict[tuple[str, str], float] = defaultdict(float)
    for day in shopping_range["days"][:5]:
        for item in day["ingredients"]:
            rule = shopping_range["rules"].get(item["code"], {})
            conversion = float(rule.get("conversion_factor", 1))
            unit = str(rule.get("display_unit", item["unit"]))
            aggregate[(item["code"], unit)] += float(item["quantity"]) / conversion
    static = {(item["code"], item["unit"]): float(item["exact"]) for item in shopping["variants"]["c1-v1"]}
    if set(aggregate) != set(static):
        errors.append("Spesa dinamica C1/V1: insieme ingredienti diverso dalla lista statica")
    else:
        for key, value in aggregate.items():
            if not math.isclose(value, static[key], abs_tol=0.01):
                errors.append(f"Spesa dinamica C1/V1 non riconciliata per {key}: {value} vs {static[key]}")

    # Every suggested quantity must be at least exact and a valid multiple of its rule.
    for item in shopping["variants"]["c1-v1"]:
        rule = shopping_range["rules"].get(item["code"], {})
        step = float(rule.get("rounding_step", 1))
        if item["rounded"] + 1e-9 < item["exact"]:
            errors.append(f"Arrotondamento inferiore al necessario: {item['code']}")
        if step > 0 and not math.isclose(float(item["rounded"]) / step, round(float(item["rounded"]) / step), abs_tol=1e-8):
            warnings.append(f"Quantità statica non multipla del passo inferito: {item['code']}")

    required = [
        "oggi/index.html", "calendario/index.html", "calendario/modifica/index.html", "preparazioni/index.html", "cerca/index.html",
        "strumenti/index.html", "spesa/intervallo/index.html", "offline/index.html",
        "assets/js/calendar-core.js", "assets/js/calendar.js", "assets/js/site-state.js",
        "assets/js/operations-core.js", "assets/js/v5-plan-core.js", "assets/js/v5-plan-store.js", "assets/js/v5-plan.js", "assets/js/v5-plan-calendar.js", "assets/js/prep.js", "assets/js/shopping-range.js",
        "assets/js/search.js", "assets/js/tools.js", "assets/js/pwa.js",
        "assets/css/styles.css", "assets/icons.svg", "assets/brand/brand-mark.svg",
        "assets/illustrations/hero-nurse-planner.svg", "assets/illustrations/offline-ready.svg",
        "assets/icons/icon-192.png", "assets/icons/icon-512.png",
        "assets/icons/icon-maskable-512.png", "assets/icons/apple-touch-icon.png",
        "manifest.webmanifest", "service-worker.js",
        "data/calendar.json", "data/shopping-range.json", "data/search-index.json",
        "data/offline-assets.json",
    ]
    for relative in required:
        if not (DOCS / relative).exists():
            errors.append(f"Risorsa V4 mancante: {relative}")

    # PWA manifest and full offline library.
    try:
        manifest = json.loads((DOCS / "manifest.webmanifest").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"Manifest PWA non valido: {exc}")
        manifest = {}
    if manifest.get("display") != "standalone":
        errors.append("Manifest PWA: display deve essere standalone")
    if not str(manifest.get("start_url", "")).endswith("oggi/index.html"):
        errors.append("Manifest PWA: start_url inatteso")
    manifest_icons = manifest.get("icons", [])
    if len(manifest_icons) < 3:
        errors.append("Manifest PWA: icone insufficienti")
    for icon in manifest_icons:
        src = str(icon.get("src", "")).lstrip("./")
        if src and not (DOCS / src).exists():
            errors.append(f"Manifest PWA: icona mancante {src}")

    sw_text = (DOCS / "service-worker.js").read_text(encoding="utf-8") if (DOCS / "service-worker.js").exists() else ""
    for token in ("DOWNLOAD_OFFLINE_PACK", "CLEAR_OFFLINE_PACK", "SKIP_WAITING", "offline/index.html"):
        if token not in sw_text:
            errors.append(f"Service worker privo di {token}")

    listed_assets = offline_assets.get("assets", [])
    if offline_assets.get("asset_count") != len(listed_assets):
        errors.append("Manifest offline: asset_count non coerente")
    if len(listed_assets) < 600:
        errors.append(f"Manifest offline troppo piccolo: {len(listed_assets)} risorse")
    calculated_bytes = 0
    for relative in listed_assets:
        if relative.startswith("/") or ".." in Path(relative).parts:
            errors.append(f"Manifest offline: percorso non portabile {relative}")
            continue
        target = DOCS / relative
        if not target.is_file():
            errors.append(f"Manifest offline: risorsa mancante {relative}")
        else:
            calculated_bytes += target.stat().st_size
    if calculated_bytes != int(offline_assets.get("total_bytes", -1)):
        errors.append(f"Manifest offline: byte non coerenti {calculated_bytes} vs {offline_assets.get('total_bytes')}")
    if any(item.startswith("downloads/") for item in listed_assets):
        errors.append("Manifest offline: i download pesanti non devono essere inclusi")

    report = {
        "version": VERSION,
        "html_files": len(html_files),
        "links_checked": links_checked,
        "data_counts": {
            "cycles": len(plan["cycles"]),
            "variants": sum(len(c["variants"]) for c in plan["cycles"]),
            "days": len(days),
            "meals": len(meals),
            "recipes": len(recipes["recipes"]),
            "search_entries": len(search_index["entries"]),
            "shopping_day_records": range_records,
            "offline_assets": len(offline_assets.get("assets", [])),
            "offline_bytes": int(offline_assets.get("total_bytes", 0)),
        },
        "errors": errors,
        "warnings": warnings,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
