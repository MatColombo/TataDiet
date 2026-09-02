#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
QA="qa/v5.2"
mkdir -p "$QA"

./build.sh | tee "$QA/build-report.json"
python3 scripts/validate_site.py | tee "$QA/validation-report.json"
python3 scripts/test_v5_2_release.py | tee "$QA/release-static-report.json"
python3 scripts/test_v5_2_ui.py | tee "$QA/ui-static-report.json"
python3 scripts/test_v5_2_accessibility.py | tee "$QA/accessibility-static-report.json"

for file in static/service-worker.js static/assets/js/*.js; do node --check "$file" >/dev/null; done

node scripts/test_v5_2_core.js | tee "$QA/v5.2-core-report.json"
node scripts/test_calendar_logic.js | tee "$QA/calendar-test-report.json"
node scripts/test_v4_logic.js | tee "$QA/v4-logic-report.json"
node scripts/test_v5_phase2_backup.js | tee "$QA/phase2-backup-regression.json"
node scripts/test_v5_phase3_ingredients.js | tee "$QA/ingredient-regression.json"
node scripts/test_v5_phase4_recipes.js | tee "$QA/recipe-core-regression.json"
node scripts/test_v5_phase4_store.js | tee "$QA/recipe-store-regression.json"
node scripts/test_v5_phase4_backup_recipes.js | tee "$QA/recipe-backup-regression.json"
node scripts/test_v5_phase5_plan.js | tee "$QA/plan-core-regression.json"
node scripts/test_v5_phase5_store.js | tee "$QA/plan-store-regression.json"
node scripts/test_v5_phase5_backup_calendar.js | tee "$QA/calendar-backup-regression.json"
node scripts/test_v5_phase6_composer.js | tee "$QA/composer-core-regression.json"
node scripts/test_v5_phase6_store.js | tee "$QA/composer-store-regression.json"
node scripts/test_v5_phase7_effective.js | tee "$QA/effective-core-regression.json"
node scripts/test_v5_phase7_store.js | tee "$QA/effective-store-regression.json"
node scripts/test_v5_phase8_stress.js | tee "$QA/stress-report.json"
python3 scripts/validate_v5_schemas.py | tee "$QA/schema-regression.json"
python3 scripts/test_v5_phase1.py | tee "$QA/phase1-contract-regression.json"

python3 - <<'PY'
import json
from pathlib import Path
q=Path('qa/v5.2')
validation=json.loads((q/'validation-report.json').read_text())
a11y=json.loads((q/'accessibility-static-report.json').read_text())
core=json.loads((q/'v5.2-core-report.json').read_text())
stress=json.loads((q/'stress-report.json').read_text())
bp=q/'browser-v5.2-report.json'
browser=json.loads(bp.read_text()) if bp.exists() else {'status':'not-run','checks':[],'errors':[]}
summary={
 'status':'ok', 'version':'5.2.0', 'database':'tatadiet-v5','schema_version':1,
 'html_files':validation['html_files'],'links_checked':validation['links_checked'],
 'offline_assets':validation['data_counts']['offline_assets'],'offline_bytes':validation['data_counts']['offline_bytes'],
 'base_days':180,'base_meals':864,'base_recipes':306,'recipe_versions':547,'base_ingredients':130,
 'v5_2_core':core['status'],
 'accessibility':{'status':a11y['status'],'counts':a11y['counts'],'warnings':len(a11y['warnings'])},
 'stress':stress,
 'browser_qa':browser
}
(q/'v5.2-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
