(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietIngredientCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREPARATION_STATES = ["raw", "cooked", "dry", "drained", "prepared", "ready-to-eat", "as-sold", "unknown"];
  const SOURCE_TYPES = ["label", "database", "manual", "import"];
  const BASIS_UNITS = ["g", "ml"];
  const CONVERSION_UNITS = ["piece", "tbsp", "tsp", "cup", "portion", "g", "ml"];

  const STATE_LABELS = {
    raw: "Crudo",
    cooked: "Cotto",
    dry: "Secco",
    drained: "Sgocciolato",
    prepared: "Preparato",
    "ready-to-eat": "Pronto al consumo",
    "as-sold": "Come venduto",
    unknown: "Non specificato",
  };

  const CATEGORY_LABELS = {
    "ortofrutta": "Ortofrutta",
    "carne-e-affettati": "Carne e affettati",
    "pesce": "Pesce",
    "latticini-e-uova": "Latticini e uova",
    "cereali-pane-e-derivati": "Cereali, pane e derivati",
    "legumi-e-conserve": "Legumi e conserve",
    "frutta-secca-e-semi": "Frutta secca e semi",
    "condimenti-e-dispensa": "Condimenti e dispensa",
    "pasto-flessibile": "Pasto flessibile",
    altro: "Altro",
  };

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  function slugToken(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ingrediente";
  }

  function numeric(value, fallback = 0) {
    if (value === "" || value === null || value === undefined) return fallback;
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) ? number : NaN;
  }

  function optionalNumeric(value) {
    if (value === "" || value === null || value === undefined) return null;
    return numeric(value, NaN);
  }

  function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function displayCategory(category) {
    if (!category) return "Altro";
    if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
    return String(category).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toLocaleUpperCase("it"));
  }

  function displayState(state) {
    return STATE_LABELS[state] || STATE_LABELS.unknown;
  }

  function normalizeNutrition(source) {
    source = source || {};
    return {
      energyKcal: numeric(source.energyKcal ?? source.energy_kcal, 0),
      proteinG: numeric(source.proteinG ?? source.protein_g, 0),
      carbohydrateG: numeric(source.carbohydrateG ?? source.carbohydrate_g, 0),
      fatG: numeric(source.fatG ?? source.fat_g, 0),
      fiberG: numeric(source.fiberG ?? source.fiber_g, 0),
      sugarsG: optionalNumeric(source.sugarsG ?? source.sugars_g),
      saturatedFatG: optionalNumeric(source.saturatedFatG ?? source.saturated_fat_g),
      saltG: optionalNumeric(source.saltG ?? source.salt_g),
      sodiumMg: optionalNumeric(source.sodiumMg ?? source.sodium_mg),
    };
  }

  function normalizeSource(source, ingredientName = "Ingrediente") {
    source = source || {};
    if (source.type && source.label) {
      return {
        type: SOURCE_TYPES.includes(source.type) ? source.type : "manual",
        label: String(source.label),
        url: source.url || null,
        notedAt: source.notedAt || null,
      };
    }
    const kind = String(source.kind || "").toLowerCase();
    const type = kind.includes("label") ? "label" : kind.includes("database") || kind.includes("legacy") ? "database" : kind.includes("import") ? "import" : "manual";
    return {
      type,
      label: source.name || source.source_name || `Dataset TataDiet · ${ingredientName}`,
      url: source.url || source.source_url || null,
      notedAt: source.notedAt || source.captured_at || null,
    };
  }

  function normalizeConversions(conversions, basisUnit = "g") {
    return (conversions || []).map((item, index) => ({
      unitCode: String(item.unitCode || item.unit || `portion-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `portion-${index + 1}`,
      labelSingular: String(item.labelSingular || item.singular_label || item.label || item.unit || "unità").trim(),
      labelPlural: String(item.labelPlural || item.plural_label || item.labelSingular || item.singular_label || item.label || item.unit || "unità").trim(),
      basisAmount: numeric(item.basisAmount ?? item.base_quantity, 0),
      basisUnit: item.basisUnit || item.base_unit || basisUnit,
      isDefault: Boolean(item.isDefault),
      notes: item.notes || item.source || null,
    }));
  }

  function normalizeRevision(revision, ingredientName = "Ingrediente") {
    const basis = revision?.basis || revision?.nutrition_basis || { amount: 100, unit: "g" };
    const preparation = revision?.preparationState || revision?.food_state || "unknown";
    const preparationMap = { unspecified: "unknown", as_sold: "as-sold" };
    return {
      ...revision,
      basis: { amount: numeric(basis.amount, 100), unit: BASIS_UNITS.includes(basis.unit) ? basis.unit : "g" },
      preparationState: PREPARATION_STATES.includes(preparation) ? preparation : (preparationMap[preparation] || "unknown"),
      brand: revision?.brand ?? null,
      nutrition: normalizeNutrition(revision?.nutrition || revision?.nutrients),
      conversions: normalizeConversions(revision?.conversions, basis.unit),
      allergens: Array.isArray(revision?.allergens) ? revision.allergens : [],
      toleranceNotes: revision?.toleranceNotes ?? revision?.tolerance_notes ?? null,
      source: normalizeSource(revision?.source || revision?.provenance, ingredientName),
    };
  }

  function draftFromRecords(ingredient, revision) {
    const normalized = normalizeRevision(revision, ingredient?.name);
    return {
      ingredientId: ingredient?.id || null,
      name: ingredient?.name || "",
      category: ingredient?.category || ingredient?.category_id || "altro",
      aliases: Array.isArray(ingredient?.aliases) ? ingredient.aliases.join(", ") : "",
      basisUnit: normalized.basis.unit,
      preparationState: normalized.preparationState,
      brand: normalized.brand || "",
      energyKcal: normalized.nutrition.energyKcal,
      proteinG: normalized.nutrition.proteinG,
      carbohydrateG: normalized.nutrition.carbohydrateG,
      fatG: normalized.nutrition.fatG,
      fiberG: normalized.nutrition.fiberG,
      sugarsG: normalized.nutrition.sugarsG,
      saturatedFatG: normalized.nutrition.saturatedFatG,
      saltG: normalized.nutrition.saltG,
      sodiumMg: normalized.nutrition.sodiumMg,
      allergens: normalized.allergens.join(", "),
      toleranceNotes: normalized.toleranceNotes || "",
      sourceType: normalized.source.type,
      sourceLabel: normalized.source.label,
      sourceUrl: normalized.source.url || "",
      conversions: normalized.conversions.map((item) => ({ ...item })),
    };
  }

  function normalizeDraft(input) {
    const draft = { ...input };
    draft.name = String(input.name || "").trim();
    draft.category = String(input.category || "").trim();
    draft.aliases = Array.isArray(input.aliases)
      ? [...new Set(input.aliases.map((v) => String(v).trim()).filter(Boolean))]
      : [...new Set(String(input.aliases || "").split(",").map((v) => v.trim()).filter(Boolean))];
    draft.basisUnit = BASIS_UNITS.includes(input.basisUnit) ? input.basisUnit : "g";
    draft.preparationState = PREPARATION_STATES.includes(input.preparationState) ? input.preparationState : "unknown";
    draft.brand = String(input.brand || "").trim() || null;
    draft.nutrition = {
      energyKcal: numeric(input.energyKcal ?? input.nutrition?.energyKcal, NaN),
      proteinG: numeric(input.proteinG ?? input.nutrition?.proteinG, NaN),
      carbohydrateG: numeric(input.carbohydrateG ?? input.nutrition?.carbohydrateG, NaN),
      fatG: numeric(input.fatG ?? input.nutrition?.fatG, NaN),
      fiberG: numeric(input.fiberG ?? input.nutrition?.fiberG, NaN),
      sugarsG: optionalNumeric(input.sugarsG ?? input.nutrition?.sugarsG),
      saturatedFatG: optionalNumeric(input.saturatedFatG ?? input.nutrition?.saturatedFatG),
      saltG: optionalNumeric(input.saltG ?? input.nutrition?.saltG),
      sodiumMg: optionalNumeric(input.sodiumMg ?? input.nutrition?.sodiumMg),
    };
    draft.allergens = Array.isArray(input.allergens)
      ? [...new Set(input.allergens.map((v) => String(v).trim()).filter(Boolean))]
      : [...new Set(String(input.allergens || "").split(",").map((v) => v.trim()).filter(Boolean))];
    draft.toleranceNotes = String(input.toleranceNotes || "").trim() || null;
    draft.source = {
      type: SOURCE_TYPES.includes(input.sourceType || input.source?.type) ? (input.sourceType || input.source.type) : "manual",
      label: String(input.sourceLabel || input.source?.label || "").trim(),
      url: String(input.sourceUrl || input.source?.url || "").trim() || null,
      notedAt: input.source?.notedAt || null,
    };
    draft.conversions = normalizeConversions(input.conversions || [], draft.basisUnit).filter((item) => item.unitCode || item.basisAmount || item.labelSingular || item.labelPlural);
    return draft;
  }

  function calculateAtwater(nutrition) {
    const n = normalizeNutrition(nutrition);
    return 4 * n.proteinG + 4 * n.carbohydrateG + 9 * n.fatG;
  }

  function validationResult() { return { errors: [], warnings: [], valid: true }; }

  function validateDraft(input, existingIngredients = [], currentId = null) {
    const draft = normalizeDraft(input);
    const result = validationResult();
    const error = (code, message, field = null) => result.errors.push({ code, message, field });
    const warn = (code, message, field = null) => result.warnings.push({ code, message, field });

    if (!draft.name) error("name-required", "Inserisci il nome dell'ingrediente.", "name");
    else if (draft.name.length > 160) error("name-too-long", "Il nome non può superare 160 caratteri.", "name");
    if (!draft.category) error("category-required", "Seleziona una categoria di spesa.", "category");
    if (!BASIS_UNITS.includes(draft.basisUnit)) error("basis-unit", "La base nutrizionale deve essere per 100 g o per 100 ml.", "basisUnit");

    const limits = { energyKcal: 1000, proteinG: 100, carbohydrateG: 100, fatG: 100, fiberG: 100, sugarsG: 100, saturatedFatG: 100, saltG: 100, sodiumMg: 100000 };
    const labels = { energyKcal: "Energia", proteinG: "Proteine", carbohydrateG: "Carboidrati", fatG: "Grassi", fiberG: "Fibre", sugarsG: "Zuccheri", saturatedFatG: "Grassi saturi", saltG: "Sale", sodiumMg: "Sodio" };
    ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"].forEach((key) => {
      const value = draft.nutrition[key];
      if (!Number.isFinite(value)) error(`nutrition-${key}-required`, `${labels[key]}: inserisci un valore numerico.`, key);
      else if (value < 0 || value > limits[key]) error(`nutrition-${key}-range`, `${labels[key]} deve essere compreso tra 0 e ${limits[key]}.`, key);
    });
    ["sugarsG", "saturatedFatG", "saltG", "sodiumMg"].forEach((key) => {
      const value = draft.nutrition[key];
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > limits[key])) error(`nutrition-${key}-range`, `${labels[key]} non è plausibile.`, key);
    });

    if (!SOURCE_TYPES.includes(draft.source.type)) error("source-type", "Seleziona il tipo di fonte.", "sourceType");
    if (!draft.source.label) error("source-label", "Indica la fonte dei valori nutrizionali.", "sourceLabel");
    if (draft.source.url) {
      try { new URL(draft.source.url); } catch { error("source-url", "L'URL della fonte non è valido.", "sourceUrl"); }
    }

    const conversionCodes = new Set();
    draft.conversions.forEach((item, index) => {
      const prefix = `conversion-${index + 1}`;
      if (!item.unitCode) error(`${prefix}-unit`, `Conversione ${index + 1}: scegli un'unità.`, "conversions");
      if (conversionCodes.has(item.unitCode)) error(`${prefix}-duplicate`, `L'unità “${item.unitCode}” è presente più di una volta.`, "conversions");
      conversionCodes.add(item.unitCode);
      if (!item.labelSingular || !item.labelPlural) error(`${prefix}-labels`, `Conversione ${index + 1}: inserisci etichetta singolare e plurale.`, "conversions");
      if (!Number.isFinite(item.basisAmount) || item.basisAmount <= 0) error(`${prefix}-amount`, `Conversione ${index + 1}: l'equivalenza deve essere maggiore di zero.`, "conversions");
      if (item.basisUnit !== draft.basisUnit) error(`${prefix}-basis`, `Conversione ${index + 1}: l'unità base deve essere ${draft.basisUnit}.`, "conversions");
    });

    const normalizedName = normalize(draft.name);
    const duplicates = (existingIngredients || []).filter((item) => item.id !== currentId && !item.archivedAt && normalize(item.name) === normalizedName);
    if (duplicates.length) warn("duplicate-name", `Esiste già un ingrediente attivo chiamato “${duplicates[0].name}”.`, "name");
    if (draft.preparationState === "unknown") warn("state-unknown", "Lo stato dell'alimento non è specificato: può essere importante per alimenti che cambiano composizione tra crudo e cotto.", "preparationState");

    const n = draft.nutrition;
    if ([n.proteinG, n.carbohydrateG, n.fatG, n.fiberG].every(Number.isFinite)) {
      if (n.proteinG + n.carbohydrateG + n.fatG > 105) warn("macro-sum", "La somma di proteine, carboidrati e grassi supera 105 g per 100 g/ml: ricontrolla i dati.", null);
      const atwater = calculateAtwater(n);
      if (Number.isFinite(n.energyKcal) && n.energyKcal > 0) {
        const difference = Math.abs(n.energyKcal - atwater);
        if (difference > Math.max(30, n.energyKcal * 0.25)) warn("atwater", `L'energia dichiarata (${n.energyKcal.toFixed(0)} kcal) è distante dalla stima dei macronutrienti (${atwater.toFixed(0)} kcal).`, "energyKcal");
      }
    }
    const optionalMissing = [n.sugarsG, n.saturatedFatG, n.saltG, n.sodiumMg].filter((v) => v === null).length;
    if (optionalMissing) warn("optional-missing", `${optionalMissing} valori nutrizionali opzionali non sono compilati. Il calcolo core resta disponibile.`, null);

    result.valid = result.errors.length === 0;
    result.draft = draft;
    result.atwaterKcal = calculateAtwater(draft.nutrition);
    return result;
  }

  function makePersonalRecords(input, options = {}) {
    const draft = normalizeDraft(input);
    const now = options.now || new Date().toISOString();
    const existing = options.existingIngredient || null;
    const currentRevision = options.currentRevision || null;
    const newIngredientId = existing?.id || `usr:ingredient:${uuid()}`;
    const origin = existing?.origin && existing.origin !== "base" ? existing.origin : "personal";
    const revisionNumber = currentRevision ? Number(currentRevision.revisionNumber || 0) + 1 : 1;
    const revisionId = `usr:ingredient-revision:${uuid()}`;
    const ingredient = {
      recordType: "ingredient",
      id: newIngredientId,
      origin,
      name: draft.name,
      category: draft.category,
      aliases: draft.aliases,
      currentRevisionId: revisionId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      archivedAt: null,
    };
    const revision = {
      recordType: "ingredientRevision",
      id: revisionId,
      ingredientId: newIngredientId,
      revisionNumber,
      basis: { amount: 100, unit: draft.basisUnit },
      preparationState: draft.preparationState,
      brand: draft.brand,
      nutrition: draft.nutrition,
      conversions: draft.conversions.map((item) => ({
        unitCode: item.unitCode,
        labelSingular: item.labelSingular,
        labelPlural: item.labelPlural,
        basisAmount: item.basisAmount,
        isDefault: Boolean(item.isDefault),
        notes: item.notes || null,
      })),
      allergens: draft.allergens,
      toleranceNotes: draft.toleranceNotes,
      source: { ...draft.source, notedAt: draft.source.notedAt || now },
      createdAt: now,
    };
    return { ingredient, revision };
  }

  return {
    PREPARATION_STATES, SOURCE_TYPES, BASIS_UNITS, CONVERSION_UNITS, CATEGORY_LABELS,
    normalize, slugToken, numeric, optionalNumeric, displayCategory, displayState,
    normalizeNutrition, normalizeSource, normalizeConversions, normalizeRevision,
    draftFromRecords, normalizeDraft, calculateAtwater, validateDraft, makePersonalRecords,
  };
});
