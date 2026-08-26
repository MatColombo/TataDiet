#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
page=ROOT/'docs'/'calendario'/'modifica'/'index.html'
soup=BeautifulSoup(page.read_text(encoding='utf-8'),'html.parser')
checks={}
checks['page_id']=soup.body and soup.body.get('data-page')=='plan-editor'
checks['heading']=bool(soup.select_one('h1')) and soup.select_one('h1').get_text(strip=True)=='Planner personale'
checks['summary']=all(soup.select_one(sel) for sel in ['[data-plan-effective-range]','[data-plan-day-count]','[data-plan-modified-count]','[data-plan-meal-count]'])
checks['adherence']=len(soup.select('[data-adherence-actions] [data-status]'))==4
checks['day_types']=bool(soup.select_one('[data-plan-day-type] option[value="CUSTOM"]'))
checks['custom_shift']=all(soup.select_one(sel) for sel in ['[data-custom-start]','[data-custom-end]','[data-custom-next-day]','[data-custom-reheat]','[data-custom-fridge]','[data-custom-snack]'])
expected={'leave-day-free','postpone-sequence','insert-day','remove-day','restore-day','restore-from-date'}
checks['structural_actions']={x.get('data-plan-action') for x in soup.select('[data-plan-action]')}==expected
checks['impact_dialog']=bool(soup.select_one('[data-plan-impact-dialog]')) and bool(soup.select_one('[data-impact-confirm]'))
checks['undo_redo']=bool(soup.select_one('[data-plan-undo]')) and bool(soup.select_one('[data-plan-redo]'))
checks['meal_preview']=bool(soup.select_one('[data-plan-meals]'))
scripts=[tag.get('src','') for tag in soup.select('script[src]')]
checks['modules']=all(any(name in src for src in scripts) for name in ['v5-plan-core.js','v5-plan-store.js','v5-plan.js','v5-plan-calendar.js'])
calendar=BeautifulSoup((ROOT/'docs'/'calendario'/'index.html').read_text(encoding='utf-8'),'html.parser')
checks['calendar_editor_link']=any('modifica/index.html' in (a.get('href') or '') for a in calendar.select('a'))
checks['calendar_effective_banner']=bool(calendar.select_one('[data-effective-calendar-banner]'))
ids=[tag.get('id') for tag in soup.select('[id]') if tag.get('id')]
checks['unique_ids']=len(ids)==len(set(ids))
report={'status':'ok' if all(checks.values()) else 'failed','checks':checks,'html':str(page)}
out=ROOT/'qa'/'v5-phase5'/'ui-static-report.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok':raise SystemExit(1)
