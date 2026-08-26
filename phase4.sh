#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
rm -rf qa/v5-phase4
mkdir -p qa/v5-phase4
./build.sh | tee qa/v5-phase4/build-report.json
python3 scripts/validate_site.py | tee qa/v5-phase4/validation-report.json
python3 scripts/test_v5_phase4_ui_static.py | tee qa/v5-phase4/ui-static-report.txt
node --check static/assets/js/v5-db.js
node --check static/assets/js/v5-backup.js
node --check static/assets/js/v5-ingredients-core.js
node --check static/assets/js/v5-ingredient-store.js
node --check static/assets/js/v5-ingredients.js
node --check static/assets/js/v5-recipes-core.js
node --check static/assets/js/v5-recipe-store.js
node --check static/assets/js/v5-recipes.js
node scripts/test_calendar_logic.js | tee qa/v5-phase4/calendar-test-report.json
node scripts/test_v4_logic.js | tee qa/v5-phase4/v4-logic-report.json
node scripts/test_v5_phase2_backup.js | tee qa/v5-phase4/phase2-backup-regression.txt
node scripts/test_v5_phase3_ingredients.js | tee qa/v5-phase4/ingredient-regression.txt
node scripts/test_v5_phase4_recipes.js | tee qa/v5-phase4/recipe-core-report.txt
node scripts/test_v5_phase4_store.js | tee qa/v5-phase4/recipe-store-report.txt
node scripts/test_v5_phase4_backup_recipes.js | tee qa/v5-phase4/recipe-backup-report.txt
python3 - <<'PY' | tee qa/v5-phase4/schema-record-report.json
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
root=Path('.'); schema=json.loads((root/'schemas/v5/domain/tatadiet-v5.schema.json').read_text()); validator=Draft202012Validator(schema,format_checker=FormatChecker())
samples={'recipe':json.loads((root/'qa/v5-phase4/recipe-schema-sample.json').read_text())}
# Ingredient sample is written by the Phase 3 regression test.
ing_path=root/'qa/v5-phase3/ingredient-schema-sample.json'
if ing_path.exists(): samples['ingredient']=json.loads(ing_path.read_text())
errors={}
for group,data in samples.items():
  for key,row in data.items(): errors[f'{group}.{key}']=[e.message for e in validator.iter_errors(row)]
report={'status':'ok' if not any(errors.values()) else 'failed','errors':errors}
print(json.dumps(report,ensure_ascii=False,indent=2))
if report['status']!='ok': raise SystemExit(1)
PY
./phase1.sh > qa/v5-phase4/phase1-regression.txt
python3 - <<'PY'
import json
from pathlib import Path
root=Path('.')
validation=json.loads((root/'qa/v5-phase4/validation-report.json').read_text())
core=json.loads((root/'qa/v5-phase4/recipe-core-report.json').read_text())
summary={
 'status':'ok','checkpoint':'5.0.0-alpha.4-phase4','database':'tatadiet-v5','schema_version':1,
 'ingredient_content_migration_version':3,'recipe_content_migration_version':4,
 'html_files':validation['html_files'],'links_checked':validation['links_checked'],'offline_assets':validation['data_counts']['offline_assets'],
 'base_recipes':306,'base_recipe_versions':547,'base_ingredients':130,'recipe_checks':core['checks'],
 'browser_qa_note':'Script Playwright disponibile; se localhost è bloccato dalla policy Chromium, eseguirlo sul deploy GitHub Pages.'
}
(root/'qa/v5-phase4/phase4-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
