#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
mkdir -p qa/v5-phase2
./build.sh | tee qa/v5-phase2/build-report.json
python3 scripts/validate_site.py | tee qa/v5-phase2/validation-report.json
node scripts/test_calendar_logic.js | tee qa/v5-phase2/calendar-test-report.json
node scripts/test_v4_logic.js | tee qa/v5-phase2/v4-logic-report.json
node --check static/assets/js/v5-db.js
node --check static/assets/js/v5-backup.js
node --check static/assets/js/v5-tools.js
node scripts/test_v5_phase2_backup.js | tee qa/v5-phase2/backup-roundtrip-report.txt
./phase1.sh | tee qa/v5-phase2/phase1-regression.txt
python3 - <<'PY'
import json
from pathlib import Path
root=Path('.')
validation=json.loads((root/'qa/v5-phase2/validation-report.json').read_text())
roundtrip=json.loads((root/'qa/v5-phase2/backup-roundtrip-report.json').read_text())
summary={
  'status':'ok',
  'checkpoint':'5.0.0-alpha.2-phase2',
  'database':'tatadiet-v5',
  'schema_version':1,
  'html_files':validation['html_files'],
  'links_checked':validation['links_checked'],
  'offline_assets':validation['data_counts']['offline_assets'],
  'backup_checks':roundtrip['checks'],
  'browser_qa_note':'Script disponibile; esecuzione locale bloccata in questo ambiente da policy Chromium. Verificare dopo deploy GitHub Pages.'
}
(root/'qa/v5-phase2/phase2-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
PY
