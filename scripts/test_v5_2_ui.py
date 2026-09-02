#!/usr/bin/env python3
from pathlib import Path
import json,re
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];DOCS=ROOT/'docs';errors=[];checks={}
def check(name,ok,detail=''):
    checks[name]=bool(ok)
    if not ok: errors.append(f'{name}: {detail}')
html=list(DOCS.rglob('*.html'));check('html_count',len(html)==592,len(html))
for rel in ['calendario/gestisci/index.html','preferenze/index.html','ricette/programma/index.html','spesa/index.html','spesa/cicli/index.html']:
    check('page_'+rel,(DOCS/rel).exists(),rel)
base=BeautifulSoup((ROOT/'templates/base.html').read_text(encoding='utf-8'),'html.parser')
mobile=base.select_one('.mobile-nav');labels=[a.get_text(' ',strip=True) for a in mobile.find_all('a')]
check('mobile_toolbar_seven',len(labels)==7,labels)
check('mobile_toolbar_added',all(x in labels for x in ['Ricette','Preferenze','Utilità']),labels)
check('mobile_toolbar_no_plan','Piano' not in labels,labels)
desktop=[a.get_text(' ',strip=True) for a in base.select('.desktop-nav a')];check('desktop_no_plan','Piano' not in desktop,desktop);check('desktop_preferences','Preferenze' in desktop,desktop)
calendar=BeautifulSoup((DOCS/'calendario/index.html').read_text(encoding='utf-8'),'html.parser');check('plan_link_calendar_bottom',any('../piano/index.html'==(a.get('href') or '') for a in calendar.find_all('a')), 'missing')
today_text=(ROOT/'templates/today.html').read_text(encoding='utf-8');check('today_no_active_calendar_card','Calendario attivo' not in today_text);effective=(ROOT/'static/assets/js/v5-effective-pages.js').read_text(encoding='utf-8');positions=[effective.find(x) for x in ['today-shift-hero','next-meal-card','today-events-section','today-nutrition-section']];check('today_runtime_order',positions==sorted(positions) and all(x>=0 for x in positions),positions)
shopping=BeautifulSoup((DOCS/'spesa/index.html').read_text(encoding='utf-8'),'html.parser');check('shopping_root_range',shopping.body.get('data-page')=='shopping-range',shopping.body.get('data-page'));quick=[b.get('data-shopping-quick') for b in shopping.select('[data-shopping-quick]')];check('shopping_quick_presets',quick==['today','tomorrow','48h','5','7'],quick);form=shopping.select_one('[data-range-shopping-form]');selection=shopping.select_one('.shopping-selection-card');check('shopping_selection_after_picker',form is not None and selection is not None and form.sourceline < selection.sourceline,(getattr(form,'sourceline',None),getattr(selection,'sourceline',None)))
check('shopping_cycles_link',any('cicli/index.html' in (a.get('href') or '') for a in shopping.find_all('a')))
prefs=BeautifulSoup((DOCS/'preferenze/index.html').read_text(encoding='utf-8'),'html.parser');ranges=[b.get('data-rebalance-range') for b in prefs.select('[data-rebalance-range]')];check('rebalance_ranges',ranges==['1','7','30','rest'],ranges);check('rebalance_dialog',prefs.select_one('[data-rebalance-dialog]') is not None)
scheduler=BeautifulSoup((DOCS/'ricette/programma/index.html').read_text(encoding='utf-8'),'html.parser');check('scheduler_count_input',scheduler.select_one('[data-schedule-count]') is not None);check('scheduler_ranges',{x.get('value') for x in scheduler.select('input[name="schedule-range"]')}=={'7','30','rest'});check('scheduler_selective_confirmation',scheduler.select_one('[data-schedule-select-all]') is not None and scheduler.select_one('[data-schedule-apply]') is not None)
recipe_pages=list((DOCS/'ricette').glob('*/index.html'));program_links=sum(1 for p in recipe_pages if 'programma/index.html?recipe=' in p.read_text(encoding='utf-8'));check('base_recipe_program_links',program_links>=306,program_links)
legacy=[]
for p in html:
    soup=BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser')
    for tag in soup(['script','style']): tag.decompose()
    if re.search(r'\bD[1-5]\b',' '.join(soup.stripped_strings)):legacy.append(p.relative_to(DOCS).as_posix())
check('no_visible_legacy_day_codes',not legacy,legacy[:10])
sw=(ROOT/'static/service-worker.js').read_text(encoding='utf-8');
for token in ['ricette/programma/index.html','spesa/cicli/index.html','assets/js/v5-planning-core.js','assets/js/v5-balance.js','assets/js/v5-recipe-scheduler.js']:
    check('pwa_'+token,token in sw,token)
report={'status':'ok' if not errors else 'failed','version':'5.2.1','checks':checks,'errors':errors,'html_files':len(html)};print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if not errors else 1)
