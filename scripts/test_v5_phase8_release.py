#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
QA = ROOT / 'qa' / 'v5-phase8'
QA.mkdir(parents=True, exist_ok=True)
VERSION = '5.0.0'
errors=[]
checks={}

def check(name, condition, detail=''):
    checks[name]=bool(condition)
    if not condition:
        errors.append(f'{name}: {detail}')

# Version convergence across generated datasets.
versioned = ['calendar.json','plan.json','recipes.json','shopping.json','shopping-range.json','search-index.json','build-meta.json','offline-assets.json']
versions={name: json.loads((DOCS/'data'/name).read_text(encoding='utf-8')).get('version') for name in versioned}
check('dataset_versions_stable', all(v == VERSION for v in versions.values()), versions)
html=list(DOCS.rglob('*.html'))
check('all_html_stable', all(BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser').body.get('data-version') == VERSION for p in html), 'data-version non stabile')

# Public UI must no longer advertise alpha/phase checkpoints.
ui_text='\n'.join((p.read_text(encoding='utf-8') for p in html))
check('no_alpha_in_public_ui', 'V5 alpha' not in ui_text and '5.0.0-alpha' not in ui_text, 'etichetta alpha presente')
check('no_phase_badges_public_ui', re.search(r'V5\s*(?:·\s*)?Fase\s*[1-8]|Fase\s*[1-8]', ui_text, flags=re.I) is None, 'riferimento interno a una fase presente nella UI')

# Stable backup and DB markers.
backup=(ROOT/'static/assets/js/v5-backup.js').read_text(encoding='utf-8')
db=(ROOT/'static/assets/js/v5-db.js').read_text(encoding='utf-8')
check('backup_app_version', 'const APP_VERSION = "5.0.0";' in backup)
check('db_app_version', 'const APP_VERSION = "5.0.0";' in db)
check('stable_migration_marker', 'STABLE_MIGRATION_VERSION = 5' in db and 'stableReleaseMigrationVersion' in db)
check('alpha_backup_compatibility_warning', 'schema' in backup and 'è compatibile' in backup)

# PWA core must cover every JS loaded globally and the two editable calendar pages.
sw=(ROOT/'static/service-worker.js').read_text(encoding='utf-8')
base=BeautifulSoup((ROOT/'templates/base.html').read_text(encoding='utf-8'),'html.parser')
base_scripts=[str(t.get('src')).replace('{{ relroot }}','') for t in base.find_all('script',src=True)]
missing=[src for src in base_scripts if f'"{src}"' not in sw]
check('pwa_core_covers_global_js', not missing, missing)
for required in ['calendario/modifica/index.html','calendario/componi/index.html','offline/index.html']:
    check(f'pwa_core_{required}', f'"{required}"' in sw, required)
check('pwa_install_atomic', 'await caches.delete(CORE_CACHE)' in sw and 'Installazione annullata' in sw)
check('pwa_update_explicit', 'SKIP_WAITING' in sw and 'self.skipWaiting()' in sw)

manifest=json.loads((DOCS/'manifest.webmanifest').read_text(encoding='utf-8'))
check('manifest_stable_brand', manifest.get('short_name') == 'TataDiet', manifest.get('short_name'))
check('manifest_standalone', manifest.get('display') == 'standalone')
check('manifest_scope_relative', manifest.get('scope') == './' and str(manifest.get('start_url','')).startswith('./'))

# No source-map/debug artifacts or Python caches in public docs.
public_bad=[p.relative_to(DOCS).as_posix() for p in DOCS.rglob('*') if p.is_file() and (p.suffix in {'.pyc','.map'} or '__pycache__' in p.parts)]
check('public_artifacts_clean', not public_bad, public_bad[:10])

report={'status':'ok' if not errors else 'failed','version':VERSION,'checks':checks,'errors':errors,'html_files':len(html)}
(QA/'release-static-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if not errors else 1)
