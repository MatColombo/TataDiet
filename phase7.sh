#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
mkdir -p qa/v5-phase7
./build.sh | tee qa/v5-phase7/build-report.json
python3 scripts/validate_site.py | tee qa/v5-phase7/validation-report.json
python3 scripts/test_v5_phase7_ui_static.py | tee qa/v5-phase7/ui-static-report.json
node --check static/assets/js/v5-effective-core.js
node --check static/assets/js/v5-effective-store.js
node --check static/assets/js/v5-effective-pages.js
node --check static/assets/js/v5-db.js
node --check static/assets/js/v5-backup.js
node --check static/assets/js/v5-ingredients.js
node --check static/assets/js/v5-recipes.js
node --check static/assets/js/v5-plan.js
node --check static/assets/js/v5-composer.js
node --check static/assets/js/calendar.js
node --check static/assets/js/prep.js
node --check static/assets/js/shopping-range.js
node --check static/assets/js/search.js
node --check static/assets/js/tools.js
node scripts/test_calendar_logic.js | tee qa/v5-phase7/calendar-test-report.json
node scripts/test_v4_logic.js | tee qa/v5-phase7/v4-logic-report.json
node scripts/test_v5_phase2_backup.js | tee qa/v5-phase7/phase2-backup-regression.txt
node scripts/test_v5_phase3_ingredients.js | tee qa/v5-phase7/ingredient-regression.txt
node scripts/test_v5_phase4_recipes.js | tee qa/v5-phase7/recipe-core-regression.txt
node scripts/test_v5_phase4_store.js | tee qa/v5-phase7/recipe-store-regression.txt
node scripts/test_v5_phase4_backup_recipes.js | tee qa/v5-phase7/recipe-backup-regression.txt
node scripts/test_v5_phase5_plan.js | tee qa/v5-phase7/plan-core-regression.txt
node scripts/test_v5_phase5_store.js | tee qa/v5-phase7/plan-store-regression.txt
node scripts/test_v5_phase5_backup_calendar.js | tee qa/v5-phase7/calendar-backup-regression.txt
node scripts/test_v5_phase6_composer.js | tee qa/v5-phase7/composer-core-regression.txt
node scripts/test_v5_phase6_store.js | tee qa/v5-phase7/composer-store-regression.txt
node scripts/test_v5_phase7_effective.js | tee qa/v5-phase7/effective-core-report.json
node scripts/test_v5_phase7_store.js | tee qa/v5-phase7/effective-store-report.json
python3 scripts/test_v5_phase3_ui_static.py > qa/v5-phase7/phase3-ui-regression.txt
python3 scripts/test_v5_phase4_ui_static.py > qa/v5-phase7/phase4-ui-regression.txt
python3 scripts/test_v5_phase5_ui_static.py > qa/v5-phase7/phase5-ui-regression.txt
python3 scripts/test_v5_phase6_ui_static.py > qa/v5-phase7/phase6-ui-regression.txt
python3 scripts/validate_v5_schemas.py > qa/v5-phase7/phase1-schema-regression.json
python3 scripts/test_v5_phase1.py > qa/v5-phase7/phase1-contract-regression.json
python3 - <<'PY'
import json
from pathlib import Path
root=Path('.')
validation=json.loads((root/'qa/v5-phase7/validation-report.json').read_text())
core=json.loads((root/'qa/v5-phase7/effective-core-report.json').read_text())
store=json.loads((root/'qa/v5-phase7/effective-store-report.json').read_text())
ui=json.loads((root/'qa/v5-phase7/ui-static-report.json').read_text())
browser_path=root/'qa/v5-phase7/browser-phase7-report.json'
browser=json.loads(browser_path.read_text()) if browser_path.exists() else None
summary={
 'status':'ok','checkpoint':'5.0.0-alpha.7-phase7','database':'tatadiet-v5','schema_version':1,
 'html_files':validation['html_files'],'links_checked':validation['links_checked'],
 'offline_assets':validation['data_counts']['offline_assets'],'offline_bytes':validation['data_counts']['offline_bytes'],
 'base_days':180,'base_meals':864,'base_recipes':306,'recipe_versions':547,
 'effective_core_checks':core['checks'],'effective_store_checks':store['checks'],'ui_checks':ui['checks'],
 'browser_qa': browser if browser and browser.get('status')=='ok' else {'status':'not-run','script':'scripts/qa_v5_phase7.py'}
}
(root/'qa/v5-phase7/phase7-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
