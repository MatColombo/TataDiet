#!/usr/bin/env python3
from pathlib import Path
from bs4 import BeautifulSoup
import json
ROOT=Path(__file__).resolve().parents[1]
page=ROOT/'docs/calendario/componi/index.html'
html=page.read_text(encoding='utf-8')
soup=BeautifulSoup(html,'html.parser')
checks={
 'page_exists':page.exists(),
 'page_id':soup.body and soup.body.get('data-page')=='day-composer',
 'composer_core':bool(soup.find('script',src=lambda x:x and x.endswith('v5-composer-core.js'))),
 'composer_store':bool(soup.find('script',src=lambda x:x and x.endswith('v5-composer-store.js'))),
 'composer_ui':bool(soup.find('script',src=lambda x:x and x.endswith('v5-composer.js'))),
 'nutrition_summary':bool(soup.select_one('[data-composer-kcal]')) and bool(soup.select_one('[data-composer-fiber]')),
 'suggest_action':bool(soup.select_one('[data-composer-suggest]')),
 'template_action':bool(soup.select_one('[data-composer-template]')),
 'add_action':bool(soup.select_one('[data-composer-add]')),
 'picker':bool(soup.select_one('[data-recipe-picker]')),
 'picker_fit_filter':bool(soup.select_one('[data-picker-fit]')),
 'planner_link':bool(soup.select_one('[data-composer-planner-link]')),
}
planner=BeautifulSoup((ROOT/'docs/calendario/modifica/index.html').read_text(encoding='utf-8'),'html.parser')
checks['planner_to_composer']=bool(planner.select_one('[data-plan-composer-link]'))
manifest=json.loads((ROOT/'docs/data/offline-assets.json').read_text())
paths=set(manifest.get('assets',[]))
checks['offline_page']=any(str(x).endswith('calendario/componi/index.html') for x in paths)
checks['offline_core']=any(str(x).endswith('assets/js/v5-composer-core.js') for x in paths)
report={'status':'ok' if all(checks.values()) else 'failed','checkpoint':'5.0.0-alpha.6-phase6','checks':checks}
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
