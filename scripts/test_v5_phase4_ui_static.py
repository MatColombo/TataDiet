#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
page=ROOT/'docs'/'ricette'/'studio'/'index.html'
soup=BeautifulSoup(page.read_text(encoding='utf-8'),'html.parser')
checks={}
checks['page_id']=soup.body and soup.body.get('data-page')=='recipe-studio'
checks['main_heading']=bool(soup.select_one('h1')) and soup.select_one('h1').get_text(strip=True)=='Studio ricette'
checks['new_button']=bool(soup.select_one('[data-new-recipe]'))
checks['grid']=bool(soup.select_one('[data-recipe-studio-grid]'))
checks['editor_dialog']=bool(soup.select_one('[data-recipe-dialog]'))
checks['history_dialog']=bool(soup.select_one('[data-recipe-history-dialog]'))
checks['ingredient_template']=bool(soup.select_one('#recipe-line-template [data-line="ingredientId"]')) and bool(soup.select_one('[data-add-recipe-line]'))
required=['title','servings','mealTypes','cuisine','prepMinutes','spiceLevel']
checks['required_fields']=all(soup.select_one(f'[name="{name}"]') for name in required)
checks['meal_prep_fields']=all(soup.select_one(f'[name="{name}"]') for name in ['prepareAhead','coldSuitable','reheatable','fridgeHours'])
checks['live_nutrition']=all(soup.select_one(sel) for sel in ['[data-recipe-preview-kcal]','[data-recipe-preview-protein]','[data-recipe-preview-carbs]','[data-recipe-preview-fat]','[data-recipe-preview-fiber]'])
script_src=[tag.get('src','') for tag in soup.select('script[src]')]
checks['script_modules']=all(any(name in src for src in script_src) for name in ['v5-recipes-core.js','v5-recipe-store.js','v5-recipes.js'])
archive=BeautifulSoup((ROOT/'docs'/'ricette'/'index.html').read_text(encoding='utf-8'),'html.parser')
checks['archive_studio_link']=any('studio/index.html' in (a.get('href') or '') for a in archive.select('a'))
static_recipe=next((ROOT/'docs'/'ricette').glob('*/index.html'))
if static_recipe.parent.name=='studio': static_recipe=list((ROOT/'docs'/'ricette').glob('*/index.html'))[1]
recipe_soup=BeautifulSoup(static_recipe.read_text(encoding='utf-8'),'html.parser')
checks['static_recipe_duplicate_link']=any('studio/index.html?recipe=base:recipe:' in (a.get('href') or '') for a in recipe_soup.select('a'))
ids=[tag.get('id') for tag in soup.select('[id]') if tag.get('id')]
checks['unique_ids']=len(ids)==len(set(ids))
report={'status':'ok' if all(checks.values()) else 'failed','checks':checks,'html':str(page)}
out=ROOT/'qa'/'v5-phase4'/'ui-static-report.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
