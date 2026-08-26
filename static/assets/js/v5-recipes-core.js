(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietRecipeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SPICE_LEVELS = ["none", "very-low", "low", "medium", "high"];
  const NUTRIENT_KEYS = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG", "sugarsG", "saturatedFatG", "saltG", "sodiumMg"];

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }
  function numeric(value, fallback = NaN) {
    if (value === "" || value === null || value === undefined) return fallback;
    const out = Number(String(value).replace(",", "."));
    return Number.isFinite(out) ? out : fallback;
  }
  function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  function cleanList(value) {
    if (Array.isArray(value)) return [...new Set(value.map((x) => String(x || "").trim()).filter(Boolean))];
    return [...new Set(String(value || "").split(/[;,\n]/).map((x) => x.trim()).filter(Boolean))];
  }
  function nutritionShape(source = {}) {
    return {
      energyKcal: numeric(source.energyKcal ?? source.energy_kcal, 0),
      proteinG: numeric(source.proteinG ?? source.protein_g, 0),
      carbohydrateG: numeric(source.carbohydrateG ?? source.carbohydrate_g, 0),
      fatG: numeric(source.fatG ?? source.fat_g, 0),
      fiberG: numeric(source.fiberG ?? source.fiber_g, 0),
      sugarsG: source.sugarsG ?? source.sugars_g ?? null,
      saturatedFatG: source.saturatedFatG ?? source.saturated_fat_g ?? null,
      saltG: source.saltG ?? source.salt_g ?? null,
      sodiumMg: source.sodiumMg ?? source.sodium_mg ?? null,
    };
  }
  function emptyNutrition() { return nutritionShape(); }
  function addNutrition(target, source) {
    const out = { ...target };
    for (const key of NUTRIENT_KEYS) {
      if (["sugarsG", "saturatedFatG", "saltG", "sodiumMg"].includes(key)) {
        if (out[key] === null && source[key] === null) continue;
        out[key] = numeric(out[key], 0) + numeric(source[key], 0);
      } else out[key] = numeric(out[key], 0) + numeric(source[key], 0);
    }
    return out;
  }
  function scaleNutrition(source, factor) {
    const out = {};
    const n = nutritionShape(source);
    for (const key of NUTRIENT_KEYS) {
      if (n[key] === null) out[key] = null;
      else out[key] = numeric(n[key], 0) * factor;
    }
    return out;
  }
  function divideNutrition(source, divisor) {
    return scaleNutrition(source, divisor > 0 ? 1 / divisor : 0);
  }

  function ingredientRevisionMap(revisions) { return new Map((revisions || []).map((row) => [row.id, row])); }
  function ingredientMap(ingredients) { return new Map((ingredients || []).map((row) => [row.id, row])); }

  function normalizeRevision(row) {
    if (!row) return null;
    const basis = row.basis || row.nutrition_basis || { amount: 100, unit: "g" };
    return {
      ...row,
      basis: { amount: 100, unit: basis.unit === "ml" ? "ml" : "g" },
      nutrition: nutritionShape(row.nutrition || row.nutrients || {}),
      conversions: (row.conversions || []).map((item, index) => ({
        unitCode: String(item.unitCode || item.unit || `portion-${index + 1}`).trim(),
        labelSingular: item.labelSingular || item.singular_label || item.label || item.unit || "unità",
        labelPlural: item.labelPlural || item.plural_label || item.labelSingular || item.singular_label || item.label || item.unit || "unità",
        basisAmount: numeric(item.basisAmount ?? item.base_quantity, NaN),
        isDefault: Boolean(item.isDefault),
        notes: item.notes || null,
      })).filter((item) => item.unitCode && Number.isFinite(item.basisAmount) && item.basisAmount > 0),
    };
  }

  function unitsForRevision(row) {
    const revision = normalizeRevision(row);
    if (!revision) return [];
    const base = revision.basis.unit;
    return [
      { unitCode: base, labelSingular: base, labelPlural: base, basisAmount: 1, basisUnit: base, conversionId: null, isBase: true },
      ...revision.conversions.filter((c) => c.unitCode !== base).map((c) => ({ ...c, basisUnit: base, conversionId: c.unitCode, isBase: false })),
    ];
  }

  function normalizeLine(input, ingredientsById, revisionsById, index = 0) {
    const ingredientId = String(input.ingredientId || input.ingredient_id || "").trim();
    const ingredient = ingredientsById.get(ingredientId) || null;
    const requestedRevisionId = String(input.ingredientRevisionId || input.ingredient_revision_id || ingredient?.currentRevisionId || "").trim();
    const rawRevision = revisionsById.get(requestedRevisionId) || null;
    const revision = normalizeRevision(rawRevision);
    const amount = numeric(input.amount ?? input.quantity, NaN);
    const unitCode = String(input.unitCode || input.unit || revision?.basis?.unit || "").trim();
    const errors = [];
    if (!ingredient) errors.push("Ingrediente non trovato.");
    if (!revision) errors.push("Revisione ingrediente non trovata.");
    if (rawRevision && rawRevision.ingredientId !== ingredientId) errors.push("La revisione non appartiene all'ingrediente selezionato.");
    if (!Number.isFinite(amount) || amount <= 0) errors.push("La quantità deve essere maggiore di zero.");

    let normalizedAmount = NaN;
    let conversionId = null;
    let displayUnit = unitCode;
    if (revision) {
      if (unitCode === revision.basis.unit) normalizedAmount = amount;
      else {
        const conversion = revision.conversions.find((item) => item.unitCode === unitCode);
        if (!conversion) errors.push(`Non esiste una conversione “${unitCode}” per questo ingrediente.`);
        else {
          normalizedAmount = amount * conversion.basisAmount;
          conversionId = conversion.unitCode;
          displayUnit = amount === 1 ? conversion.labelSingular : conversion.labelPlural;
        }
      }
    }
    const factor = Number.isFinite(normalizedAmount) ? normalizedAmount / 100 : NaN;
    const nutrition = revision && Number.isFinite(factor) ? scaleNutrition(revision.nutrition, factor) : emptyNutrition();
    const lineId = String(input.lineId || input.id || `line-${index + 1}`).replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 100);
    const notes = String(input.notes || input.preparationNote || input.preparation_note || "").trim() || null;
    const optional = Boolean(input.optional);
    const displayText = ingredient && Number.isFinite(amount)
      ? `${amount.toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${displayUnit} ${ingredient.name}${notes ? ` · ${notes}` : ""}`
      : "Ingrediente incompleto";
    return {
      valid: errors.length === 0,
      errors,
      ingredient,
      revision,
      nutrition,
      record: {
        lineId,
        ingredientId,
        ingredientRevisionId: requestedRevisionId,
        amount,
        unitCode,
        normalizedAmount,
        displayText,
        optional,
        notes,
      },
    };
  }

  function normalizeMealPrep(source = {}) {
    const bool = (value) => value === true || value === "true" || value === "yes" || value === "Sì" || value === "Si" || value === "sì";
    let fridgeHours = source.fridgeHours ?? source.fridge_hours ?? null;
    if (fridgeHours === "") fridgeHours = null;
    fridgeHours = fridgeHours === null ? null : numeric(fridgeHours, null);
    return {
      prepareAhead: bool(source.prepareAhead ?? source.prepare_ahead),
      coldSuitable: bool(source.coldSuitable ?? source.cold_suitable ?? source.cold),
      reheatable: bool(source.reheatable ?? source.reheat),
      fridgeHours: Number.isFinite(fridgeHours) ? Math.max(0, Math.round(fridgeHours)) : null,
      notes: String(source.notes || "").trim() || null,
    };
  }

  function normalizeDraft(input = {}) {
    return {
      title: String(input.title || "").trim(),
      servings: numeric(input.servings, 1),
      mealTypes: cleanList(input.mealTypes || input.meal_types || []),
      cuisine: String(input.cuisine || "Italiana").trim() || "Italiana",
      tags: cleanList(input.tags || []),
      prepMinutes: Math.max(0, Math.round(numeric(input.prepMinutes ?? input.prep_minutes, 0) || 0)),
      instructions: Array.isArray(input.instructions) ? input.instructions.map((x) => String(x).trim()).filter(Boolean) : String(input.instructions || "").split(/\n+/).map((x) => x.trim()).filter(Boolean),
      mealPrep: normalizeMealPrep(input.mealPrep || input.meal_prep || input),
      spiceLevel: SPICE_LEVELS.includes(input.spiceLevel) ? input.spiceLevel : "none",
      notes: String(input.notes || "").trim() || null,
      ingredientLines: Array.isArray(input.ingredientLines) ? input.ingredientLines : [],
    };
  }

  function calculateDraft(input, ingredients, revisions) {
    const draft = normalizeDraft(input);
    const ingredientsById = ingredientMap(ingredients);
    const revisionsById = ingredientRevisionMap(revisions);
    const lineResults = draft.ingredientLines.map((line, index) => normalizeLine(line, ingredientsById, revisionsById, index));
    let totalNutrition = emptyNutrition();
    lineResults.forEach((line) => { if (line.valid) totalNutrition = addNutrition(totalNutrition, line.nutrition); });
    const perServing = Number.isFinite(draft.servings) && draft.servings > 0 ? divideNutrition(totalNutrition, draft.servings) : emptyNutrition();
    return { draft, lineResults, totalNutrition, perServing };
  }

  function validateDraft(input, ingredients, revisions, recipes = [], currentRecipeId = null) {
    const calculation = calculateDraft(input, ingredients, revisions);
    const { draft, lineResults } = calculation;
    const errors = [];
    const warnings = [];
    const error = (code, message, field = null) => errors.push({ code, message, field });
    const warn = (code, message, field = null) => warnings.push({ code, message, field });
    if (!draft.title) error("title", "Inserisci un titolo per la ricetta.", "title");
    if (!Number.isFinite(draft.servings) || draft.servings <= 0 || draft.servings > 100) error("servings", "Le porzioni devono essere comprese tra 0 e 100.", "servings");
    if (!draft.mealTypes.length) error("meal-types", "Seleziona o inserisci almeno un tipo di pasto.", "mealTypes");
    if (!draft.cuisine) error("cuisine", "Inserisci la cucina o lo stile della ricetta.", "cuisine");
    if (draft.prepMinutes > 1440) error("prep", "Il tempo di preparazione non può superare 1440 minuti.", "prepMinutes");
    if (!draft.ingredientLines.length) error("ingredients", "Aggiungi almeno un ingrediente.", "ingredientLines");
    lineResults.forEach((line, index) => line.errors.forEach((message) => error(`line-${index + 1}`, `Ingrediente ${index + 1}: ${message}`, "ingredientLines")));
    const duplicateIds = draft.ingredientLines.map((line) => line.ingredientId).filter(Boolean);
    if (new Set(duplicateIds).size < duplicateIds.length) warn("duplicate-ingredient", "Lo stesso ingrediente compare più volte. È consentito, ma verifica che sia intenzionale.", "ingredientLines");
    const normalizedTitle = normalize(draft.title);
    const duplicateRecipe = (recipes || []).find((row) => row.id !== currentRecipeId && !row.archivedAt && normalize(row.title) === normalizedTitle);
    if (duplicateRecipe) warn("duplicate-title", `Esiste già una ricetta attiva chiamata “${duplicateRecipe.title}”.`, "title");
    const perServingLimits = { energyKcal: 1000, proteinG: 100, carbohydrateG: 100, fatG: 100, fiberG: 100 };
    for (const [key, limit] of Object.entries(perServingLimits)) {
      const value = calculation.perServing[key];
      if (!Number.isFinite(value) || value < 0 || value > limit) error(`nutrition-${key}`, `Il valore per porzione ${key} (${Number.isFinite(value) ? value.toFixed(1) : "non valido"}) supera i limiti del modello dati.`, null);
    }
    if (calculation.perServing.fiberG > 12) warn("fiber-high", `La porzione calcolata contiene circa ${calculation.perServing.fiberG.toFixed(1)} g di fibra: verifica la tollerabilità intestinale.`, null);
    if (draft.spiceLevel === "medium" || draft.spiceLevel === "high") warn("spice", "L'intensità aromatica indicata è superiore al profilo abituale TataDiet.", "spiceLevel");
    return { valid: errors.length === 0, errors, warnings, ...calculation };
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  async function sha256(text) {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return Array.from({ length: 8 }, (_, i) => ((h + Math.imul(i + 1, 2654435761)) >>> 0).toString(16).padStart(8, "0")).join("").slice(0, 64);
  }

  async function makePersonalRecords(input, context = {}) {
    const validation = validateDraft(input, context.ingredients || [], context.revisions || [], context.recipes || [], context.existingRecipe?.id || null);
    if (!validation.valid) {
      const err = new Error(validation.errors.map((item) => item.message).join(" "));
      err.validation = validation;
      throw err;
    }
    const now = context.now || new Date().toISOString();
    const existing = context.existingRecipe || null;
    const currentVersion = context.currentVersion || null;
    const recipeId = existing?.id || `usr:recipe:${uuid()}`;
    const versionNumber = currentVersion ? Number(currentVersion.versionNumber || 0) + 1 : 1;
    const versionId = `usr:recipe-version:${uuid()}`;
    const ingredientLines = validation.lineResults.map((line, index) => ({ ...line.record, lineId: `${versionId}:line:${index + 1}`.slice(0, 100) }));
    const digestInput = { servings: validation.draft.servings, ingredientLines, metadata: { mealTypes: validation.draft.mealTypes, cuisine: validation.draft.cuisine, prepMinutes: validation.draft.prepMinutes } };
    const inputDigest = await sha256(canonical(digestInput));
    const recipe = {
      recordType: "recipe",
      id: recipeId,
      origin: existing?.origin && existing.origin !== "base" ? existing.origin : "personal",
      title: validation.draft.title,
      currentVersionId: versionId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      archivedAt: null,
    };
    const version = {
      recordType: "recipeVersion",
      id: versionId,
      recipeId,
      versionNumber,
      servings: validation.draft.servings,
      nutritionMode: "calculated",
      ingredientLines,
      calculatedNutrition: validation.perServing,
      calculation: { status: "complete", algorithmVersion: "v5-recipe-core-1", inputDigest, warnings: validation.warnings.map((item) => item.message) },
      metadata: {
        mealTypes: validation.draft.mealTypes,
        cuisine: validation.draft.cuisine,
        tags: validation.draft.tags,
        prepMinutes: validation.draft.prepMinutes,
        instructions: validation.draft.instructions,
        mealPrep: validation.draft.mealPrep,
        spiceLevel: validation.draft.spiceLevel,
        notes: validation.draft.notes,
      },
      createdAt: now,
      supersedesVersionId: currentVersion?.id || null,
    };
    return { recipe, version, validation };
  }

  function draftFromRecords(recipe, version) {
    if (!recipe || !version) return null;
    const lines = (version.ingredientLines || version.ingredient_lines || []).map((line) => ({
      lineId: line.lineId || line.id || null,
      ingredientId: line.ingredientId || line.ingredient_id,
      ingredientRevisionId: line.ingredientRevisionId || line.ingredient_revision_id,
      amount: line.amount ?? line.quantity,
      unitCode: line.unitCode || line.unit,
      optional: Boolean(line.optional),
      notes: line.notes || line.preparationNote || line.preparation_note || "",
    }));
    const meta = version.metadata || {};
    const oldPrep = meta.mealPrep || version.meal_prep || {};
    return {
      title: recipe.title,
      servings: version.servings || 1,
      mealTypes: meta.mealTypes?.length ? meta.mealTypes : recipe.mealTypes || recipe.meal_types || [],
      cuisine: meta.cuisine || version.cuisine || recipe.cuisine || "Italiana",
      tags: meta.tags || [],
      prepMinutes: meta.prepMinutes ?? version.prep_minutes ?? 0,
      instructions: meta.instructions || version.instructions || [],
      mealPrep: normalizeMealPrep(oldPrep),
      spiceLevel: meta.spiceLevel || (version.spices === "Nessuna" ? "none" : "very-low"),
      notes: meta.notes || version.practical_notes || "",
      ingredientLines: lines,
    };
  }

  return {
    SPICE_LEVELS, NUTRIENT_KEYS, normalize, numeric, cleanList, nutritionShape, emptyNutrition,
    scaleNutrition, divideNutrition, normalizeRevision, unitsForRevision, normalizeLine,
    normalizeMealPrep, normalizeDraft, calculateDraft, validateDraft, canonical, sha256,
    makePersonalRecords, draftFromRecords,
  };
});
