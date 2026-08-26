#!/usr/bin/env python3
"""Validate TataDiet V5 JSON Schema and the Phase 1 example records."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schemas" / "v5" / "domain" / "tatadiet-v5.schema.json"
EXAMPLES_DIR = ROOT / "spec" / "v5" / "examples"
REPORT_PATH = ROOT / "qa" / "v5-phase1" / "schema-validation.json"


def json_pointer(error) -> str:
    if not error.absolute_path:
        return "/"
    return "/" + "/".join(str(item) for item in error.absolute_path)


def validate_references(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Check personal references across the example fixtures.

    References to the immutable ``base:`` namespace may point to records not included
    in this small fixture set and are therefore accepted.
    """

    ids = {record.get("id") for record in records if record.get("id")}
    errors: list[dict[str, Any]] = []

    def require(reference: Any, source: str, field: str) -> None:
        if not isinstance(reference, str) or reference.startswith("base:"):
            return
        if reference not in ids:
            errors.append({"source": source, "field": field, "missing_id": reference})

    for record in records:
        source = record.get("id", record.get("recordType", "record"))
        record_type = record.get("recordType")
        if record_type == "ingredient":
            require(record.get("currentRevisionId"), source, "currentRevisionId")
        elif record_type == "ingredientRevision":
            require(record.get("ingredientId"), source, "ingredientId")
        elif record_type == "recipe":
            require(record.get("currentVersionId"), source, "currentVersionId")
        elif record_type == "recipeVersion":
            require(record.get("recipeId"), source, "recipeId")
            require(record.get("supersedesVersionId"), source, "supersedesVersionId")
            for index, line in enumerate(record.get("ingredientLines", [])):
                require(line.get("ingredientId"), source, f"ingredientLines[{index}].ingredientId")
                require(line.get("ingredientRevisionId"), source, f"ingredientLines[{index}].ingredientRevisionId")
        elif record_type == "planInstance":
            for index, day_id in enumerate(record.get("dayIds", [])):
                require(day_id, source, f"dayIds[{index}]")
        elif record_type == "calendarDay":
            require(record.get("planInstanceId"), source, "planInstanceId")
            require(record.get("baseDayRef"), source, "baseDayRef")
            for index, meal in enumerate(record.get("meals", [])):
                require(meal.get("recipeId"), source, f"meals[{index}].recipeId")
                require(meal.get("recipeVersionId"), source, f"meals[{index}].recipeVersionId")
                require(meal.get("baseMealRef"), source, f"meals[{index}].baseMealRef")
        elif record_type == "operationRecord":
            require(record.get("planInstanceId"), source, "planInstanceId")
            for index, target_id in enumerate(record.get("targetIds", [])):
                require(target_id, source, f"targetIds[{index}]")
    return errors


def run_negative_tests(validator: Draft202012Validator, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ensure representative invalid records are rejected by the schema."""
    by_type = {record.get("recordType"): record for record in records}
    cases: list[tuple[str, dict[str, Any]]] = []

    revision = deepcopy(by_type["ingredientRevision"])
    revision["nutrition"]["proteinG"] = -1
    cases.append(("negative-core-nutrient", revision))

    revision = deepcopy(by_type["ingredientRevision"])
    revision["nutrition"].pop("fiberG", None)
    cases.append(("missing-required-fiber", revision))

    revision = deepcopy(by_type["ingredientRevision"])
    revision["basis"]["amount"] = 0
    cases.append(("zero-nutrition-basis", revision))

    ingredient = deepcopy(by_type["ingredient"])
    ingredient["unexpectedField"] = True
    cases.append(("unexpected-property", ingredient))

    recipe_version = deepcopy(by_type["recipeVersion"])
    recipe_version["servings"] = 0
    cases.append(("zero-servings", recipe_version))

    calendar_day = deepcopy(by_type["calendarDay"])
    calendar_day["date"] = "2026-99-99"
    cases.append(("invalid-calendar-date", calendar_day))

    unknown = {"recordType": "unknown-record", "id": "usr:unknown:test"}
    cases.append(("unknown-record-type", unknown))

    failures: list[dict[str, Any]] = []
    for name, record in cases:
        errors = list(validator.iter_errors(record))
        if not errors:
            failures.append({"case": name, "reason": "invalid record was accepted"})
    return failures


def main() -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise SystemExit(f"Invalid V5 schema: {exc}") from exc

    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    example_paths = sorted(EXAMPLES_DIR.glob("*.json"))
    records: list[dict[str, Any]] = []
    validation_errors: list[dict[str, Any]] = []

    for path in example_paths:
        record = json.loads(path.read_text(encoding="utf-8"))
        records.append(record)
        for error in sorted(validator.iter_errors(record), key=lambda item: list(item.absolute_path)):
            validation_errors.append(
                {
                    "file": str(path.relative_to(ROOT)),
                    "path": json_pointer(error),
                    "message": error.message,
                }
            )

    reference_errors = validate_references(records)
    negative_test_failures = run_negative_tests(validator, records)
    report = {
        "status": "pass" if not validation_errors and not reference_errors and not negative_test_failures else "fail",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "schema": str(SCHEMA_PATH.relative_to(ROOT)),
        "draft": "2020-12",
        "examples": [str(path.relative_to(ROOT)) for path in example_paths],
        "example_count": len(example_paths),
        "validation_errors": validation_errors,
        "reference_errors": reference_errors,
        "negative_example_count": 7,
        "negative_test_failures": negative_test_failures,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["status"] == "pass" else 1)


if __name__ == "__main__":
    main()
