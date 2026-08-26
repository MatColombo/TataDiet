#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOCK_DIR="$ROOT_DIR/.phase1.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "A Phase-1 validation is already running." >&2
  exit 2
fi
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$LOCK_DIR" "$TMP_DIR"' EXIT

rm -rf qa/v5-phase1
mkdir -p qa/v5-phase1

python3 scripts/audit_v5_data.py | tee qa/v5-phase1/audit-run.json
cp v5_audit/audit-summary.json qa/v5-phase1/data-audit.json
sha256sum v5_data/base/*.json > "$TMP_DIR/seed-hashes-pass1.txt"

# A second generation must produce byte-for-byte identical base seed files.
python3 scripts/audit_v5_data.py > qa/v5-phase1/audit-determinism-run.json
sha256sum v5_data/base/*.json > "$TMP_DIR/seed-hashes-pass2.txt"
cp "$TMP_DIR/seed-hashes-pass1.txt" qa/v5-phase1/seed-hashes-pass1.txt
cp "$TMP_DIR/seed-hashes-pass2.txt" qa/v5-phase1/seed-hashes-pass2.txt
diff -u "$TMP_DIR/seed-hashes-pass1.txt" "$TMP_DIR/seed-hashes-pass2.txt" \
  > qa/v5-phase1/seed-determinism.diff

python3 scripts/validate_v5_schemas.py | tee qa/v5-phase1/schema-run.json
python3 scripts/test_v5_phase1.py | tee qa/v5-phase1/contract-run.json

python3 - <<'PY'
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path.cwd()
audit = json.loads((root / "qa/v5-phase1/audit-run.json").read_text(encoding="utf-8"))
schema = json.loads((root / "qa/v5-phase1/schema-run.json").read_text(encoding="utf-8"))
contract = json.loads((root / "qa/v5-phase1/contract-run.json").read_text(encoding="utf-8"))
deterministic = not (root / "qa/v5-phase1/seed-determinism.diff").read_text(encoding="utf-8").strip()

passed = bool(
    audit.get("release_gate", {}).get("phase_1_complete")
    and schema.get("status") == "pass"
    and contract.get("status") == "pass"
    and deterministic
)
summary = {
    "status": "pass" if passed else "fail",
    "phase": "V5 Phase 1 of 8",
    "phase_version": "5.0.0-alpha.1-phase1",
    "runtime_public_version": "4.0.0",
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "dataset_version": audit.get("dataset_version"),
    "counts": audit.get("counts"),
    "formula_audit": audit.get("validation", {}).get("workbook_formulas"),
    "max_nutrient_absolute_difference": audit.get("validation", {}).get("nutrient_max_absolute_difference"),
    "schema": {
        "positive_examples": schema.get("example_count"),
        "negative_examples": schema.get("negative_example_count"),
        "validation_errors": schema.get("validation_errors"),
        "negative_test_failures": schema.get("negative_test_failures"),
    },
    "deterministic_seed": deterministic,
    "contract": contract.get("checks"),
    "next_phase": "IndexedDB, migration V4, export/import JSON and round-trip tests",
}
(root / "qa/v5-phase1/phase1-summary.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps(summary, ensure_ascii=False, indent=2))
raise SystemExit(0 if passed else 1)
PY
