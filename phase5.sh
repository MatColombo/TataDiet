#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
rm -rf qa/v5-phase5
mkdir -p qa/v5-phase5
./build.sh | tee qa/v5-phase5/build-report.json
python3 scripts/validate_site.py | tee qa/v5-phase5/validation-report.json
python3 scripts/test_v5_phase5_ui_static.py | tee qa/v5-phase5/ui-static-report.txt
node --check static/assets/js/v5-db.js
node --check static/assets/js/v5-backup.js
node --check static/assets/js/v5-ingredients-core.js
node --check static/assets/js/v5-ingredient-store.js
node --check static/assets/js/v5-ingredients.js
node --check static/assets/js/v5-recipes-core.js
node --check static/assets/js/v5-recipe-store.js
node --check static/assets/js/v5-recipes.js
node --check static/assets/js/v5-plan-core.js
node --check static/assets/js/v5-plan-store.js
node --check static/assets/js/v5-plan.js
node --check static/assets/js/v5-plan-calendar.js
node scripts/test_calendar_logic.js | tee qa/v5-phase5/calendar-test-report.json
node scripts/test_v4_logic.js | tee qa/v5-phase5/v4-logic-report.json
node scripts/test_v5_phase2_backup.js | tee qa/v5-phase5/phase2-backup-regression.txt
node scripts/test_v5_phase3_ingredients.js | tee qa/v5-phase5/ingredient-regression.txt
node scripts/test_v5_phase4_recipes.js | tee qa/v5-phase5/recipe-core-regression.txt
node scripts/test_v5_phase4_store.js | tee qa/v5-phase5/recipe-store-regression.txt
node scripts/test_v5_phase4_backup_recipes.js | tee qa/v5-phase5/recipe-backup-regression.txt
node scripts/test_v5_phase5_plan.js | tee qa/v5-phase5/plan-core-report.txt
node scripts/test_v5_phase5_store.js | tee qa/v5-phase5/plan-store-report.txt
node scripts/test_v5_phase5_backup_calendar.js | tee qa/v5-phase5/calendar-backup-report.txt
python3 - <<'PY' | tee qa/v5-phase5/schema-record-report.json
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
root=Path('.')
schema=json.loads((root/'schemas/v5/domain/tatadiet-v5.schema.json').read_text())
validator=Draft202012Validator(schema,format_checker=FormatChecker())
samples=json.loads((root/'qa/v5-phase5/plan-schema-samples.json').read_text())
errors={name:[e.message for e in validator.iter_errors(row)] for name,row in samples.items()}
report={'status':'ok' if not any(errors.values()) else 'failed','errors':errors}
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok':raise SystemExit(1)
PY
python3 scripts/test_v5_phase3_ui_static.py > qa/v5-phase5/phase3-ui-regression.txt
python3 scripts/test_v5_phase4_ui_static.py > qa/v5-phase5/phase4-ui-regression.txt
python3 scripts/validate_v5_schemas.py > qa/v5-phase5/phase1-schema-regression.json
python3 scripts/test_v5_phase1.py > qa/v5-phase5/phase1-contract-regression.json
python3 - <<'PY'
import json
from pathlib import Path
root=Path('.')
validation=json.loads((root/'qa/v5-phase5/validation-report.json').read_text())
core=json.loads((root/'qa/v5-phase5/plan-core-report.json').read_text())
store=json.loads((root/'qa/v5-phase5/plan-store-report.json').read_text())
ui=json.loads((root/'qa/v5-phase5/ui-static-report.json').read_text())
summary={
 'status':'ok','checkpoint':'5.0.0-alpha.5-phase5','database':'tatadiet-v5','schema_version':1,
 'html_files':validation['html_files'],'links_checked':validation['links_checked'],'offline_assets':validation['data_counts']['offline_assets'],
 'base_days':180,'base_meals':864,'plan_core_checks':core['checks'],'plan_store_checks':store['checks'],'ui_checks':ui['checks'],
 'browser_qa_note':'QA browser dedicata disponibile; eseguire sul deploy GitHub Pages se la policy Chromium locale blocca localhost.'
}
(root/'qa/v5-phase5/phase5-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
