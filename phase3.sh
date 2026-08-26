#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
rm -rf qa/v5-phase3
mkdir -p qa/v5-phase3

./build.sh | tee qa/v5-phase3/build-report.json
python3 scripts/validate_site.py | tee qa/v5-phase3/validation-report.json
python3 scripts/test_v5_phase3_ui_static.py | tee qa/v5-phase3/ui-static-report.txt
node scripts/test_calendar_logic.js | tee qa/v5-phase3/calendar-test-report.json
node scripts/test_v4_logic.js | tee qa/v5-phase3/v4-logic-report.json
node --check static/assets/js/v5-db.js
node --check static/assets/js/v5-backup.js
node --check static/assets/js/v5-ingredients-core.js
node --check static/assets/js/v5-ingredient-store.js
node --check static/assets/js/v5-ingredients.js
node scripts/test_v5_phase2_backup.js | tee qa/v5-phase3/phase2-backup-regression.txt
node scripts/test_v5_phase3_ingredients.js | tee qa/v5-phase3/ingredient-test-report.txt

python3 - <<'PY' | tee qa/v5-phase3/schema-record-report.json
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
root=Path('.')
schema=json.loads((root/'schemas/v5/domain/tatadiet-v5.schema.json').read_text())
sample=json.loads((root/'qa/v5-phase3/ingredient-schema-sample.json').read_text())
validator=Draft202012Validator(schema,format_checker=FormatChecker())
errors={}
for key in ('ingredient','revision'):
    problems=list(validator.iter_errors(sample[key]))
    errors[key]=[p.message for p in problems]
report={'status':'ok' if not any(errors.values()) else 'failed','records':{k:len(v) for k,v in errors.items()},'errors':errors}
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
PY

./phase1.sh > qa/v5-phase3/phase1-regression.txt

python3 - <<'PY'
import json
from pathlib import Path
root=Path('.')
validation=json.loads((root/'qa/v5-phase3/validation-report.json').read_text())
core=json.loads((root/'qa/v5-phase3/ingredient-core-report.json').read_text())
schema=json.loads((root/'qa/v5-phase3/schema-record-report.json').read_text())
phase2=json.loads((root/'qa/v5-phase2/backup-roundtrip-report.json').read_text()) if (root/'qa/v5-phase2/backup-roundtrip-report.json').exists() else {'checks':{}}
summary={
  'status':'ok',
  'checkpoint':'5.0.0-alpha.3-phase3',
  'database':'tatadiet-v5',
  'schema_version':1,
  'content_migration_version':3,
  'html_files':validation['html_files'],
  'links_checked':validation['links_checked'],
  'offline_assets':validation['data_counts']['offline_assets'],
  'ingredient_checks':core['checks'],
  'schema_records_valid':schema['status']=='ok',
  'base_ingredients':130,
  'browser_qa_note':'Script Playwright disponibile; esecuzione localhost bloccata in questo ambiente da policy Chromium. Eseguire sul deploy GitHub Pages o su browser locale non soggetto alla policy.'
}
(root/'qa/v5-phase3/phase3-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
