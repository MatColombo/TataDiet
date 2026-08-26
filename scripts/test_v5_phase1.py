#!/usr/bin/env python3
"""Contract tests for TataDiet V5 Phase 1 artifacts.

The test deliberately reads only generated Phase-1 files. It verifies that the
frozen base seed is internally coherent and that later phases can rely on stable
IDs, hashes and record counts.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "v5_data" / "base"
AUDIT = ROOT / "v5_audit"
QA = ROOT / "qa" / "v5-phase1"
BASE_SCHEMAS = ROOT / "schemas" / "v5" / "base"
REPORT = QA / "contract-test.json"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def check(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def main() -> None:
    failures: list[str] = []
    checks: dict[str, Any] = {}

    manifest_path = BASE / "base-dataset-manifest.json"
    ingredients_path = BASE / "ingredients.base.v1.json"
    recipes_path = BASE / "recipes.base.v1.json"
    plan_path = BASE / "plan-template.base.v1.json"
    audit_path = AUDIT / "audit-summary.json"
    dependency_path = AUDIT / "static-data-dependency-map.json"
    migration_path = AUDIT / "v4-to-v5-migration-map.json"
    schema_report_path = QA / "schema-validation.json"

    required_paths = [
        manifest_path,
        ingredients_path,
        recipes_path,
        plan_path,
        audit_path,
        dependency_path,
        migration_path,
        schema_report_path,
    ]
    for path in required_paths:
        check(path.is_file(), f"missing-file:{path.relative_to(ROOT)}", failures)
    if failures:
        raise SystemExit("\n".join(failures))

    manifest = read_json(manifest_path)
    ingredient_data = read_json(ingredients_path)
    recipe_data = read_json(recipes_path)
    plan_data = read_json(plan_path)
    audit = read_json(audit_path)
    dependencies = read_json(dependency_path)
    migration = read_json(migration_path)
    schema_report = read_json(schema_report_path)

    # Manifest and deterministic seed.
    check(manifest.get("immutable") is True, "manifest-not-immutable", failures)
    check(manifest.get("dataset_version") == "tatadiet-base-v1", "unexpected-dataset-version", failures)
    for filename, metadata in manifest.get("files", {}).items():
        path = BASE / filename
        check(path.is_file(), f"manifest-file-missing:{filename}", failures)
        if path.is_file():
            check(sha256(path) == metadata.get("sha256"), f"manifest-hash-mismatch:{filename}", failures)
    seed_timestamps = {
        ingredient_data.get("generated_at"),
        recipe_data.get("generated_at"),
        plan_data.get("generated_at"),
        manifest.get("generated_at"),
    }
    check(len(seed_timestamps) == 1, "base-seed-timestamps-not-identical", failures)
    stable_timestamp = next(iter(seed_timestamps))
    try:
        datetime.fromisoformat(str(stable_timestamp))
    except ValueError:
        failures.append("invalid-base-seed-timestamp")

    # Validate every immutable seed record against its dedicated transport schema.
    schema_inputs = {
        "ingredient.schema.json": ingredient_data.get("ingredients", []),
        "recipe-family.schema.json": recipe_data.get("recipe_families", []),
        "recipe-version.schema.json": recipe_data.get("recipe_versions", []),
        "calendar-day.schema.json": plan_data.get("days", []),
    }
    base_schema_record_count = 0
    for schema_name, records in schema_inputs.items():
        schema_path = BASE_SCHEMAS / schema_name
        check(schema_path.is_file(), f"missing-base-schema:{schema_name}", failures)
        if not schema_path.is_file():
            continue
        schema = read_json(schema_path)
        try:
            Draft202012Validator.check_schema(schema)
        except SchemaError as exc:
            failures.append(f"invalid-base-schema:{schema_name}:{exc.message}")
            continue
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        for record in records:
            errors = list(validator.iter_errors(record))
            if errors:
                first = errors[0]
                path = "/".join(str(item) for item in first.absolute_path) or "/"
                failures.append(
                    f"base-schema-record:{schema_name}:{record.get('id')}:{path}:{first.message}"
                )
            base_schema_record_count += 1

    # Ingredient catalog.
    ingredients = ingredient_data.get("ingredients", [])
    ingredient_ids = {item.get("id") for item in ingredients}
    ingredient_revision_ids = {item.get("revision_id") for item in ingredients}
    ingredient_codes = {item.get("code") for item in ingredients}
    check(len(ingredients) == 130, f"ingredient-count:{len(ingredients)}", failures)
    check(len(ingredient_ids) == 130, "duplicate-ingredient-id", failures)
    check(len(ingredient_revision_ids) == 130, "duplicate-ingredient-revision-id", failures)
    check(all(item.get("revision_id") for item in ingredients), "missing-ingredient-revision-id", failures)
    check(len(ingredient_codes) == 130, "duplicate-ingredient-code", failures)
    check(all(item.get("immutable") is True for item in ingredients), "mutable-base-ingredient", failures)
    check(all(item.get("origin") == "base" for item in ingredients), "non-base-origin-ingredient", failures)
    core_keys = {"energy_kcal", "protein_g", "carbohydrate_g", "fat_g", "fiber_g"}
    check(
        all(core_keys <= set(item.get("nutrients", {})) for item in ingredients),
        "ingredient-missing-core-nutrient-field",
        failures,
    )

    # Recipes and versions.
    families = recipe_data.get("recipe_families", [])
    versions = recipe_data.get("recipe_versions", [])
    family_by_id = {item.get("id"): item for item in families}
    version_by_id = {item.get("id"): item for item in versions}
    check(len(families) == 306, f"recipe-family-count:{len(families)}", failures)
    check(len(family_by_id) == 306, "duplicate-recipe-family-id", failures)
    check(len(versions) == 547, f"recipe-version-count:{len(versions)}", failures)
    check(len(version_by_id) == 547, "duplicate-recipe-version-id", failures)
    check(all(item.get("immutable") is True for item in families + versions), "mutable-base-recipe-record", failures)
    for family in families:
        version_ids = family.get("version_ids", [])
        check(bool(version_ids), f"family-without-version:{family.get('id')}", failures)
        check(
            family.get("default_version_id") in version_ids,
            f"family-invalid-default-version:{family.get('id')}",
            failures,
        )
        for version_id in version_ids:
            check(version_id in version_by_id, f"family-missing-version:{version_id}", failures)
            if version_id in version_by_id:
                check(
                    version_by_id[version_id].get("recipe_id") == family.get("id"),
                    f"version-family-mismatch:{version_id}",
                    failures,
                )

    structured_versions = [item for item in versions if item.get("composition_status") == "structured"]
    manual_versions = [item for item in versions if item.get("composition_status") == "unstructured_estimate"]
    check(len(structured_versions) == 529, f"structured-version-count:{len(structured_versions)}", failures)
    check(len(manual_versions) == 18, f"manual-version-count:{len(manual_versions)}", failures)
    check(
        all(item.get("nutrition", {}).get("rounded_match_to_source") is True for item in structured_versions),
        "structured-version-nutrition-mismatch",
        failures,
    )
    check(
        all(not item.get("ingredient_lines") for item in manual_versions),
        "manual-version-has-structured-lines",
        failures,
    )

    # Plan references and occurrence-level counts.
    days = plan_data.get("days", [])
    check(len(days) == 180, f"day-count:{len(days)}", failures)
    check([day.get("base_global_day") for day in days] == list(range(1, 181)), "global-day-sequence", failures)
    meal_ids: set[str] = set()
    occurrence_ids_by_version: dict[str, set[str]] = {}
    occurrence_count = 0
    structured_occurrences = 0
    manual_occurrences = 0
    ingredient_line_occurrences = 0
    for day in days:
        check(day.get("immutable") is True, f"mutable-base-day:{day.get('id')}", failures)
        for meal in day.get("meals", []):
            occurrence_count += 1
            meal_id = meal.get("id")
            check(meal_id not in meal_ids, f"duplicate-meal-id:{meal_id}", failures)
            meal_ids.add(meal_id)
            recipe_id = meal.get("recipe_id")
            version_id = meal.get("recipe_version_id")
            check(recipe_id in family_by_id, f"meal-missing-recipe:{meal_id}", failures)
            check(version_id in version_by_id, f"meal-missing-version:{meal_id}", failures)
            if version_id in version_by_id:
                version = version_by_id[version_id]
                check(version.get("recipe_id") == recipe_id, f"meal-recipe-version-mismatch:{meal_id}", failures)
                occurrence_ids_by_version.setdefault(version_id, set()).add(meal_id)
                lines = version.get("ingredient_lines", [])
                if lines:
                    structured_occurrences += 1
                    ingredient_line_occurrences += len(lines)
                    for line in lines:
                        check(
                            line.get("ingredient_id") in ingredient_ids,
                            f"recipe-line-missing-ingredient:{version_id}",
                            failures,
                        )
                        check(
                            line.get("ingredient_revision_id") in ingredient_revision_ids,
                            f"recipe-line-missing-ingredient-revision:{version_id}",
                            failures,
                        )
                else:
                    manual_occurrences += 1
            if day.get("day_type") == "D2" and meal.get("time") in {"03:30", "08:20"}:
                check(meal.get("day_offset") == 1, f"d2-tail-offset:{meal_id}", failures)
    check(occurrence_count == 864, f"meal-count:{occurrence_count}", failures)
    check(structured_occurrences == 846, f"structured-occurrence-count:{structured_occurrences}", failures)
    check(manual_occurrences == 18, f"manual-occurrence-count:{manual_occurrences}", failures)
    check(ingredient_line_occurrences == 3189, f"ingredient-line-occurrence-count:{ingredient_line_occurrences}", failures)

    for version_id, version in version_by_id.items():
        declared = set(version.get("source_occurrence_ids", []))
        actual = occurrence_ids_by_version.get(version_id, set())
        check(declared == actual, f"version-occurrence-map:{version_id}", failures)
        check(version.get("source_occurrence_count") == len(actual), f"version-occurrence-count:{version_id}", failures)

    # Audit gates and formula caches.
    validation = audit.get("validation", {})
    formulas = validation.get("workbook_formulas", {})
    check(audit.get("release_gate", {}).get("phase_1_complete") is True, "phase1-gate-failed", failures)
    check(validation.get("daily_reconciliation_differences") == 0, "daily-reconciliation-difference", failures)
    check(validation.get("structured_nutrient_mismatches_at_0_1") == 0, "nutrient-mismatch", failures)
    check(formulas.get("formula_count") == 5308, f"formula-count:{formulas.get('formula_count')}", failures)
    check(formulas.get("missing_cached_values") == 0, "missing-formula-cache", failures)
    check(not formulas.get("cached_errors"), "cached-formula-error", failures)
    max_differences = validation.get("nutrient_max_absolute_difference", {})
    check(
        max_differences and all(value is not None and value <= 0.051 for value in max_differences.values()),
        "nutrient-absolute-difference-over-tolerance",
        failures,
    )

    # Dependency map must not contain duplicate references.
    duplicate_references: list[str] = []
    for dataset, refs in dependencies.get("runtime_and_build_references", {}).items():
        keys = [(item.get("file"), item.get("line"), item.get("context")) for item in refs]
        if len(keys) != len(set(keys)):
            duplicate_references.append(dataset)
    check(not duplicate_references, f"duplicate-static-dependencies:{duplicate_references}", failures)

    # Migration and schema fixtures.
    source_keys = {item.get("source_key") for item in migration.get("local_storage", []) if item.get("source_key")}
    check("diet-plan:start-date:v2" in source_keys, "missing-v4-start-date-migration", failures)
    check(schema_report.get("status") == "pass", "schema-example-validation-failed", failures)
    check(schema_report.get("example_count") == 8, "schema-example-count", failures)
    check(not schema_report.get("validation_errors"), "schema-positive-errors", failures)
    check(not schema_report.get("reference_errors"), "schema-reference-errors", failures)
    check(schema_report.get("negative_example_count", 0) >= 6, "schema-negative-test-count", failures)
    check(not schema_report.get("negative_test_failures"), "schema-negative-tests-failed", failures)

    checks.update(
        {
            "ingredients": len(ingredients),
            "recipe_families": len(families),
            "recipe_versions": len(versions),
            "days": len(days),
            "meals": occurrence_count,
            "structured_occurrences": structured_occurrences,
            "manual_occurrences": manual_occurrences,
            "ingredient_line_occurrences": ingredient_line_occurrences,
            "formula_count": formulas.get("formula_count"),
            "max_nutrient_absolute_difference": max_differences,
            "static_dependency_references": dependencies.get("reference_count"),
            "schema_positive_examples": schema_report.get("example_count"),
            "schema_negative_examples": schema_report.get("negative_example_count"),
            "base_schema_records_validated": base_schema_record_count,
            "stable_seed_timestamp": stable_timestamp,
        }
    )
    report = {
        "status": "pass" if not failures else "fail",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "failures": failures,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if not failures else 1)


if __name__ == "__main__":
    main()
