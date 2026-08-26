#!/usr/bin/env python3
from pathlib import Path
from bs4 import BeautifulSoup
import json
ROOT=Path(__file__).resolve().parents[1]
checks={}
base=BeautifulSoup((ROOT/'docs/index.html').read_text(encoding='utf-8'),'html.parser')
scripts=[x.get('src','') for x in base.select('script[src]')]
checks['effective_modules']=all(any(name in src for src in scripts) for name in ['v5-effective-core.js','v5-effective-store.js','v5-effective-pages.js'])
for key,path,page_id in [('today','docs/oggi/index.html','today'),('prep','docs/preparazioni/index.html','prep'),('shopping','docs/spesa/intervallo/index.html','shopping-range'),('search','docs/cerca/index.html','search'),('tools','docs/strumenti/index.html','tools')]:
    soup=BeautifulSoup((ROOT/path).read_text(encoding='utf-8'),'html.parser');checks[f'{key}_page']=soup.body.get('data-page')==page_id
checks['shopping_phase7']='V5 Fase 7' in (ROOT/'docs/spesa/intervallo/index.html').read_text(encoding='utf-8')
checks['prep_phase7']='V5 Fase 7' in (ROOT/'docs/preparazioni/index.html').read_text(encoding='utf-8')
checks['today_phase7']='V5 Fase 7' in (ROOT/'docs/oggi/index.html').read_text(encoding='utf-8')
manifest=json.loads((ROOT/'docs/data/offline-assets.json').read_text())
assets=set(manifest['assets'])
checks['offline_effective']=all(any(str(x).endswith(name) for x in assets) for name in ['assets/js/v5-effective-core.js','assets/js/v5-effective-store.js','assets/js/v5-effective-pages.js'])
report={'status':'ok' if all(checks.values()) else 'failed','checkpoint':'5.0.0-alpha.7-phase7','checks':checks}
out=ROOT/'qa/v5-phase7/ui-static-report.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
