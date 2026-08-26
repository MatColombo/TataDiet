#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
page=ROOT/'docs'/'ingredienti'/'index.html'
soup=BeautifulSoup(page.read_text(encoding='utf-8'),'html.parser')
checks={}
checks['page_id']=soup.body and soup.body.get('data-page')=='ingredients'
checks['main_heading']=bool(soup.select_one('h1')) and soup.select_one('h1').get_text(strip=True)=='Ingredienti'
checks['catalog_grid']=bool(soup.select_one('[data-ingredient-grid]'))
checks['new_button']=bool(soup.select_one('[data-new-ingredient]'))
checks['editor_dialog']=bool(soup.select_one('[data-ingredient-dialog]'))
checks['history_dialog']=bool(soup.select_one('[data-history-dialog]'))
required_names=['name','category','preparationState','basisUnit','energyKcal','proteinG','carbohydrateG','fatG','fiberG','sourceType','sourceLabel']
checks['required_editor_fields']=all(soup.select_one(f'[name="{name}"]') for name in required_names)
checks['optional_nutrients']=all(soup.select_one(f'[name="{name}"]') for name in ['sugarsG','saturatedFatG','saltG','sodiumMg'])
checks['conversion_template']=bool(soup.select_one('#conversion-row-template [data-conv="unitCode"]')) and bool(soup.select_one('[data-add-conversion]'))
checks['custom_units_hint']=bool(soup.select_one('#conversion-unit-options option[value="vasetto"]'))
checks['source_url']=bool(soup.select_one('input[name="sourceUrl"][type="url"]'))
checks['mobile_nav']=any('ingredienti/index.html' in (a.get('href') or '') for a in soup.select('.mobile-nav a'))
checks['desktop_nav']=any('ingredienti/index.html' in (a.get('href') or '') for a in soup.select('.desktop-nav a'))
script_src=[tag.get('src','') for tag in soup.select('script[src]')]
checks['script_modules']=all(any(name in src for src in script_src) for name in ['v5-ingredients-core.js','v5-ingredient-store.js','v5-ingredients.js'])
ids=[tag.get('id') for tag in soup.select('[id]') if tag.get('id')]
checks['unique_ids']=len(ids)==len(set(ids))
report={'status':'ok' if all(checks.values()) else 'failed','checks':checks,'html':str(page)}
out=ROOT/'qa'/'v5-phase3'/'ui-static-report.json'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
