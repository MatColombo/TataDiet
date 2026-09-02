#!/usr/bin/env python3
from pathlib import Path
import json,re
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]; DOCS=ROOT/'docs'
errors=[]; checks={}
def check(name,ok,detail=''):
    checks[name]=bool(ok)
    if not ok: errors.append(f'{name}: {detail}')

html=list(DOCS.rglob('*.html'))
check('html_count',len(html)==590,len(html))
check('manager_page',(DOCS/'calendario/gestisci/index.html').exists())
check('preferences_page',(DOCS/'preferenze/index.html').exists())
manager=BeautifulSoup((DOCS/'calendario/gestisci/index.html').read_text(encoding='utf-8'),'html.parser')
buttons=manager.select('[data-day-type]')
check('seven_visible_day_choices',[(b.get_text(' ',strip=True),b.get('data-day-type')) for b in buttons]==[
 ('G Giornata','D1'),('N Notte','D2'),('SN Smonto','D3'),('R1 Riposo 1','D4'),('R2 Riposo 2','D5'),('M Mattino','M'),('P Pomeriggio','P')],str([(b.get_text(' ',strip=True),b.get('data-day-type')) for b in buttons]))
check('single_final_confirmation',len(manager.select('[data-manager-confirm]'))==1)
check('preferences_from_manager',any('../../preferenze/index.html' in (a.get('href') or '') for a in manager.find_all('a')))

# User-visible HTML must not expose legacy D1-D5 codes.
legacy=[]
for p in html:
    soup=BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser')
    for tag in soup(['script','style']): tag.decompose()
    text=' '.join(soup.stripped_strings)
    if re.search(r'\bD[1-5]\b',text): legacy.append(p.relative_to(DOCS).as_posix())
check('no_visible_legacy_day_codes',not legacy,legacy[:20])

css=(ROOT/'static/assets/css/styles.css').read_text(encoding='utf-8')
for token,value in {'--d1':'#a66a21','--d2':'#173b83','--d3':'#58a9d6','--d4':'#3e8a59','--d5':'#3e8a59','--m':'#e5a700','--p':'#b6242d'}.items():
    values=re.findall(rf'{re.escape(token)}\s*:\s*(#[0-9a-fA-F]{{6}})',css)
    check(f'palette_{token}',bool(values) and values[-1].lower()==value.lower(),values[-1] if values else 'missing')

manifest=json.loads((DOCS/'manifest.webmanifest').read_text(encoding='utf-8'))
check('manager_pwa_shortcut',any(x.get('url')=='calendario/gestisci/index.html' for x in manifest.get('shortcuts',[])))
schema=json.loads((ROOT/'schemas/v5/domain/tatadiet-v5.schema.json').read_text(encoding='utf-8'))
raw=json.dumps(schema)
check('domain_schema_morning_afternoon','"M"' in raw and '"P"' in raw)
check('service_worker_manager','"calendario/gestisci/index.html"' in (ROOT/'static/service-worker.js').read_text())
check('service_worker_preferences','"preferenze/index.html"' in (ROOT/'static/service-worker.js').read_text())

report={'status':'ok' if not errors else 'failed','version':'5.1.0','checks':checks,'errors':errors,'html_files':len(html)}
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
