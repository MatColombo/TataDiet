#!/usr/bin/env python3
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
QA = ROOT / "qa" / "v5-phase8"
QA.mkdir(parents=True, exist_ok=True)

errors: list[str] = []
warnings: list[str] = []
counts = Counter()

FORM_CONTROLS = {"input", "select", "textarea"}

def accessible_name(tag) -> str:
    aria = (tag.get("aria-label") or "").strip()
    if aria:
        return aria
    text = tag.get_text(" ", strip=True)
    if text:
        return text
    for img in tag.find_all("img"):
        alt = img.get("alt")
        if alt:
            return alt.strip()
    return ""

def has_label(control, soup: BeautifulSoup) -> bool:
    if control.get("aria-label") or control.get("aria-labelledby"):
        return True
    if control.find_parent("label") is not None:
        return True
    cid = control.get("id")
    if cid and soup.find("label", attrs={"for": cid}):
        return True
    return False

for path in sorted(DOCS.rglob("*.html")):
    rel = path.relative_to(DOCS).as_posix()
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    counts["pages"] += 1
    html = soup.find("html")
    if not html or not str(html.get("lang") or "").lower().startswith("it"):
        errors.append(f"{rel}: lingua documento mancante/non italiana")
    if not soup.find("meta", attrs={"name": "viewport"}):
        errors.append(f"{rel}: meta viewport mancante")
    main = soup.find("main", id="contenuto")
    if not main:
        errors.append(f"{rel}: main#contenuto mancante")
    skip = soup.find("a", class_=lambda c: c and "skip-link" in (c if isinstance(c, list) else str(c).split()))
    if not skip or skip.get("href") != "#contenuto":
        errors.append(f"{rel}: skip link non collegato a #contenuto")
    h1s = soup.find_all("h1")
    if len(h1s) != 1:
        errors.append(f"{rel}: atteso un solo H1, trovati {len(h1s)}")

    ids = [str(t.get("id")) for t in soup.find_all(attrs={"id": True})]
    dup = [key for key, value in Counter(ids).items() if value > 1]
    if dup:
        errors.append(f"{rel}: ID duplicati: {', '.join(dup[:5])}")

    for img in soup.find_all("img"):
        counts["images"] += 1
        if not img.has_attr("alt"):
            errors.append(f"{rel}: img senza attributo alt: {img.get('src','?')}")

    for button in soup.find_all("button"):
        counts["buttons"] += 1
        if not accessible_name(button) and not button.get("aria-labelledby"):
            errors.append(f"{rel}: button senza nome accessibile")

    for link in soup.find_all("a"):
        counts["links"] += 1
        if not accessible_name(link) and not link.get("aria-labelledby"):
            errors.append(f"{rel}: link senza nome accessibile: {link.get('href','?')}")

    for control in soup.find_all(FORM_CONTROLS):
        typ = str(control.get("type") or "").lower()
        if control.name == "input" and typ in {"hidden", "button", "submit", "reset", "image"}:
            continue
        counts["form_controls"] += 1
        if not has_label(control, soup):
            errors.append(f"{rel}: {control.name} senza label/aria: {control.get('name') or control.get('data-v5-import-file') or control.get('id') or '?'}")

    for focusable in soup.find_all(attrs={"tabindex": True}):
        try:
            tabindex = int(focusable.get("tabindex"))
        except (TypeError, ValueError):
            continue
        if tabindex > 0:
            errors.append(f"{rel}: tabindex positivo ({tabindex})")

    # Headings: permit repeated levels, report skipped hierarchy as warning rather than hard failure.
    previous = 0
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        level = int(heading.name[1])
        if previous and level > previous + 1:
            warnings.append(f"{rel}: salto gerarchia heading H{previous}->H{level}")
        previous = level

report = {
    "status": "ok" if not errors else "failed",
    "version": "5.0.0",
    "counts": dict(counts),
    "errors": errors,
    "warnings": warnings,
}
(QA / "accessibility-static-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
