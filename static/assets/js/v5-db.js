(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietDB = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DB_NAME = "tatadiet-v5";
  const DB_VERSION = 1;
  const SCHEMA_VERSION = 1;
  const APP_VERSION = "5.2.0";
  const STABLE_MIGRATION_VERSION = 5;
  const CONTENT_MIGRATION_VERSION = 3;
  const RECIPE_CONTENT_MIGRATION_VERSION = 4;
  const STORE_SPECS = {
    meta: { keyPath: "key" },
    settings: { keyPath: "key" },
    ingredients: { keyPath: "id", indexes: [["origin", "origin"], ["nameNormalized", "nameNormalized"], ["category", "category"], ["archivedAt", "archivedAt"]] },
    ingredientRevisions: { keyPath: "id", indexes: [["ingredientId", "ingredientId"], ["revisionNumber", "revisionNumber"], ["createdAt", "createdAt"]] },
    recipes: { keyPath: "id", indexes: [["origin", "origin"], ["titleNormalized", "titleNormalized"], ["archivedAt", "archivedAt"]] },
    recipeVersions: { keyPath: "id", indexes: [["recipeId", "recipeId"], ["versionNumber", "versionNumber"], ["createdAt", "createdAt"]] },
    planInstances: { keyPath: "id", indexes: [["status", "status"], ["startDate", "startDate"], ["updatedAt", "updatedAt"]] },
    calendarDays: { keyPath: "id", indexes: [["planInstanceId", "planInstanceId"], ["date", "date"], ["dayType", "dayType"], ["sequenceIndex", "sequenceIndex"]] },
    operations: { keyPath: "id", indexes: [["planInstanceId", "planInstanceId"], ["kind", "kind"], ["createdAt", "createdAt"], ["undoneAt", "undoneAt"]] },
    shoppingChecklists: { keyPath: "id", indexes: [["scopeKey", "scopeKey"], ["updatedAt", "updatedAt"]] },
  };

  const personalStores = ["ingredients", "ingredientRevisions", "recipes", "recipeVersions", "planInstances", "calendarDays", "operations", "shoppingChecklists"];
  const backupStores = ["ingredients", "ingredientRevisions", "recipes", "recipeVersions", "planInstances", "calendarDays", "operations"];

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  async function defaultFetchJson(path) {
    let target = path;
    if (typeof document !== "undefined" && typeof location !== "undefined") {
      const root = document.body?.dataset?.root || "";
      target = new URL(`${root}${path}`, location.href).href;
    }
    const response = await fetch(target);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    return response.json();
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error("IndexedDB non disponibile"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        Object.entries(STORE_SPECS).forEach(([name, spec]) => {
          const store = db.objectStoreNames.contains(name)
            ? request.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath: spec.keyPath });
          (spec.indexes || []).forEach(([indexName, keyPath]) => {
            if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
          });
        });
        const meta = request.transaction.objectStore("meta");
        meta.put({ key: "schemaVersion", value: SCHEMA_VERSION, updatedAt: new Date().toISOString() });
        meta.put({ key: "createdAt", value: new Date().toISOString() });
        meta.put({ key: "lastUpgradeFrom", value: event.oldVersion || 0 });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Impossibile aprire IndexedDB"));
      request.onblocked = () => reject(new Error("Aggiornamento IndexedDB bloccato da un'altra scheda"));
    });
  }

  async function get(storeName, key) {
    const db = await openDatabase();
    try { return await requestPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key)); }
    finally { db.close(); }
  }

  async function getAll(storeName) {
    const db = await openDatabase();
    try { return await requestPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll()); }
    finally { db.close(); }
  }

  async function put(storeName, value) {
    const db = await openDatabase();
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      await transactionPromise(tx);
      return value;
    } finally { db.close(); }
  }

  async function bulkPut(storeName, records) {
    if (!records?.length) return 0;
    const db = await openDatabase();
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      records.forEach((record) => store.put(record));
      await transactionPromise(tx);
      return records.length;
    } finally { db.close(); }
  }

  async function clearStores(storeNames) {
    const names = storeNames?.length ? storeNames : personalStores;
    const db = await openDatabase();
    try {
      const tx = db.transaction(names, "readwrite");
      names.forEach((name) => tx.objectStore(name).clear());
      await transactionPromise(tx);
    } finally { db.close(); }
  }

  async function counts() {
    const names = Object.keys(STORE_SPECS);
    const db = await openDatabase();
    try {
      const tx = db.transaction(names, "readonly");
      const entries = await Promise.all(names.map(async (name) => [name, await requestPromise(tx.objectStore(name).count())]));
      return Object.fromEntries(entries);
    } finally { db.close(); }
  }

  async function setSetting(key, value, source = "v5") {
    return put("settings", { key, value, source, updatedAt: new Date().toISOString() });
  }

  async function getSetting(key) {
    const row = await get("settings", key);
    return row ? row.value : null;
  }

  async function allSettingsObject() {
    const rows = await getAll("settings");
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  function camelNutrition(source) {
    source = source || {};
    return {
      energyKcal: Number(source.energyKcal ?? source.energy_kcal ?? 0),
      proteinG: Number(source.proteinG ?? source.protein_g ?? 0),
      carbohydrateG: Number(source.carbohydrateG ?? source.carbohydrate_g ?? 0),
      fatG: Number(source.fatG ?? source.fat_g ?? 0),
      fiberG: Number(source.fiberG ?? source.fiber_g ?? 0),
      sugarsG: source.sugarsG ?? source.sugars_g ?? null,
      saturatedFatG: source.saturatedFatG ?? source.saturated_fat_g ?? null,
      saltG: source.saltG ?? source.salt_g ?? null,
      sodiumMg: source.sodiumMg ?? source.sodium_mg ?? null,
    };
  }

  function domainSource(source, fallbackLabel) {
    source = source || {};
    if (source.type && source.label) return { type: source.type, label: source.label, url: source.url || null, notedAt: source.notedAt || null };
    const kind = String(source.kind || "").toLowerCase();
    const type = kind.includes("label") ? "label" : kind.includes("database") || kind.includes("legacy") ? "database" : kind.includes("import") ? "import" : "manual";
    return { type, label: source.name || source.source_name || fallbackLabel, url: source.url || source.source_url || null, notedAt: source.notedAt || source.captured_at || null };
  }

  function domainConversions(items, basisUnit) {
    return (items || []).map((item, index) => ({
      unitCode: item.unitCode || item.unit || `portion-${index + 1}`,
      labelSingular: item.labelSingular || item.singular_label || item.unit || "unità",
      labelPlural: item.labelPlural || item.plural_label || item.labelSingular || item.singular_label || item.unit || "unità",
      basisAmount: Number(item.basisAmount ?? item.base_quantity ?? 0),
      isDefault: Boolean(item.isDefault),
      notes: item.notes || item.source || (item.base_unit && item.base_unit !== basisUnit ? `Base originaria: ${item.base_unit}` : null),
    }));
  }

  function mapBaseIngredient(item) {
    const epoch = new Date(0).toISOString();
    return {
      recordType: "ingredient",
      id: item.id,
      name: item.name,
      nameNormalized: normalize(item.name),
      category: item.category_id || item.category_name || "altro",
      aliases: item.aliases || [],
      origin: "base",
      currentRevisionId: item.revision_id,
      createdAt: item.created_at || epoch,
      updatedAt: item.updated_at || epoch,
      archivedAt: null,
      immutable: true,
    };
  }

  function mapBaseIngredientRevision(item) {
    const foodStates = { unspecified: "unknown", raw: "raw", cooked: "cooked", dry: "dry", drained: "drained", prepared: "prepared", "ready-to-eat": "ready-to-eat", "as-sold": "as-sold", as_sold: "as-sold" };
    const basis = item.nutrition_basis || item.basis || { amount: 100, unit: "g" };
    return {
      recordType: "ingredientRevision",
      id: item.revision_id,
      ingredientId: item.id,
      revisionNumber: item.revision || 1,
      basis: { amount: 100, unit: basis.unit === "ml" ? "ml" : "g" },
      preparationState: foodStates[item.food_state] || item.preparationState || "unknown",
      brand: item.brand ?? null,
      nutrition: camelNutrition(item.nutrients || item.nutrition),
      conversions: domainConversions(item.conversions, basis.unit),
      allergens: item.allergens || [],
      toleranceNotes: item.toleranceNotes || null,
      source: domainSource(item.provenance || item.source, "Dataset TataDiet"),
      createdAt: item.provenance?.captured_at || item.createdAt || new Date(0).toISOString(),
      origin: "base",
      immutable: true,
    };
  }

  function normalizeBaseMealPrep(source) {
    source = source || {};
    const text = (value) => String(value || "").toLocaleLowerCase("it");
    const yes = (value) => value === true || /^(s[iì]|yes|true)/.test(text(value));
    const fridgeText = text(source.fridge || source.fridgeHours || "");
    const dayMatch = fridgeText.match(/(\d+)\s*giorn/);
    const hourMatch = fridgeText.match(/(\d+)\s*or/);
    const fridgeHours = hourMatch ? Number(hourMatch[1]) : dayMatch ? Number(dayMatch[1]) * 24 : null;
    return {
      prepareAhead: yes(source.prepareAhead ?? source.prepare_ahead),
      coldSuitable: yes(source.coldSuitable ?? source.cold),
      reheatable: yes(source.reheatable ?? source.reheat),
      fridgeHours,
      notes: source.fridge || null,
    };
  }

  function mapBaseRecipe(item) {
    const epoch = new Date(0).toISOString();
    return {
      recordType: "recipe",
      id: item.id,
      title: item.title,
      titleNormalized: normalize(item.title),
      description: item.description ?? null,
      mealTypes: item.meal_types || [],
      cuisines: item.cuisines || [],
      origin: "base",
      currentVersionId: item.default_version_id,
      createdAt: epoch,
      updatedAt: epoch,
      archivedAt: null,
      immutable: true,
    };
  }

  function mapBaseRecipeVersion(item, family = null) {
    const calculated = camelNutrition(item.nutrition?.values_per_serving || {});
    const manual = camelNutrition(item.nutrition?.source_values_per_serving || {});
    return {
      recordType: "recipeVersion",
      id: item.id,
      recipeId: item.recipe_id,
      versionNumber: item.revision || 1,
      servings: item.servings || 1,
      nutritionMode: item.nutrition?.mode === "manual_estimate" ? "manual" : (item.editable_ingredient_composition ? "calculated" : "manual"),
      ingredientLines: (item.ingredient_lines || []).map((line, index) => ({
        id: `${item.id}:line:${index + 1}`,
        ingredientId: line.ingredient_id,
        ingredientRevisionId: line.ingredient_revision_id,
        quantity: line.quantity,
        unit: line.unit,
        baseQuantity: line.base_quantity,
        baseUnit: line.base_unit,
        conversionId: line.conversion_id,
        preparationNote: line.preparation_note,
      })),
      calculatedNutrition: calculated,
      manualNutrition: manual,
      metadata: {
        mealTypes: family?.meal_types || [],
        cuisine: item.cuisine || family?.cuisines?.[0] || "Non specificata",
        tags: [], prepMinutes: item.prep_minutes || 0,
        instructions: item.instructions || [], mealPrep: normalizeBaseMealPrep(item.meal_prep || {}),
        spiceLevel: item.spices === "Nessuna" ? "none" : "very-low", notes: item.practical_notes || null,
      },
      createdAt: new Date(0).toISOString(), supersedesVersionId: null, origin: "base", immutable: true,
    };
  }

  async function seedBaseDataset(fetcher) {
    const existing = await get("meta", "baseDatasetId");
    if (existing?.value) return { seeded: false, datasetId: existing.value };
    const fetchJson = fetcher || defaultFetchJson;
    const [manifest, ingredientsFile, recipesFile] = await Promise.all([
      fetchJson("data/v5/base-dataset-manifest.json"),
      fetchJson("data/v5/ingredients.base.v1.json"),
      fetchJson("data/v5/recipes.base.v1.json"),
    ]);
    const ingredients = ingredientsFile.ingredients.map(mapBaseIngredient);
    const ingredientRevisions = ingredientsFile.ingredients.map(mapBaseIngredientRevision);
    const recipes = recipesFile.recipe_families.map(mapBaseRecipe);
    const familyById = new Map(recipesFile.recipe_families.map((row) => [row.id, row]));
    const recipeVersions = recipesFile.recipe_versions.map((row) => mapBaseRecipeVersion(row, familyById.get(row.recipe_id)));
    const db = await openDatabase();
    try {
      const names = ["ingredients", "ingredientRevisions", "recipes", "recipeVersions", "meta"];
      const tx = db.transaction(names, "readwrite");
      ingredients.forEach((row) => tx.objectStore("ingredients").put(row));
      ingredientRevisions.forEach((row) => tx.objectStore("ingredientRevisions").put(row));
      recipes.forEach((row) => tx.objectStore("recipes").put(row));
      recipeVersions.forEach((row) => tx.objectStore("recipeVersions").put(row));
      tx.objectStore("meta").put({ key: "baseDatasetId", value: manifest.dataset_version, updatedAt: new Date().toISOString() });
      tx.objectStore("meta").put({ key: "baseDatasetSourceSha256", value: manifest.source.xlsx.sha256, updatedAt: new Date().toISOString() });
      tx.objectStore("meta").put({ key: "baseSeededAt", value: new Date().toISOString() });
      await transactionPromise(tx);
    } finally { db.close(); }
    return { seeded: true, datasetId: manifest.dataset_version, ingredients: ingredients.length, recipes: recipes.length, recipeVersions: recipeVersions.length };
  }

  async function migrateV4(storage) {
    const marker = await get("meta", "v4MigrationCompletedAt");
    if (marker) return { migrated: false, alreadyDone: true };
    const source = storage || globalThis.localStorage;
    const now = new Date().toISOString();
    let startDate = null;
    const checklistRecords = [];
    try {
      const candidate = source.getItem("diet-plan:start-date:v2");
      if (/^\d{4}-\d{2}-\d{2}$/.test(candidate || "")) startDate = candidate;
      for (let i = 0; i < source.length; i += 1) {
        const key = source.key(i);
        if (!key || !(key.startsWith("diet-plan-shopping:") || key.startsWith("diet-plan-shopping-range:"))) continue;
        checklistRecords.push({ id: `legacy:${key}`, scopeKey: key, sourceKey: key, value: source.getItem(key), legacy: true, migratedAt: now, updatedAt: now });
      }
    } catch { /* localStorage may be unavailable */ }
    const db = await openDatabase();
    try {
      const tx = db.transaction(["settings", "shoppingChecklists", "meta"], "readwrite");
      if (startDate) tx.objectStore("settings").put({ key: "planStartDate", value: startDate, source: "v4-migration", updatedAt: now });
      checklistRecords.forEach((row) => tx.objectStore("shoppingChecklists").put(row));
      tx.objectStore("meta").put({ key: "v4MigrationCompletedAt", value: now });
      tx.objectStore("meta").put({ key: "v4MigrationSummary", value: { startDate: Boolean(startDate), checklists: checklistRecords.length } });
      await transactionPromise(tx);
    } finally { db.close(); }
    return { migrated: true, startDate, checklists: checklistRecords.length };
  }

  async function ensurePhase3IngredientShape() {
    const marker = await get("meta", "phase3IngredientShapeVersion");
    if (Number(marker?.value || 0) >= CONTENT_MIGRATION_VERSION) return { migrated: false, version: Number(marker.value) };
    const [ingredients, revisions] = await Promise.all([getAll("ingredients"), getAll("ingredientRevisions")]);
    const revisionMap = new Map(revisions.map((row) => [row.id, row]));
    const now = new Date().toISOString();
    const normalizedIngredients = ingredients.filter((row) => row.origin === "base" || String(row.id).startsWith("base:")).map((row) => ({
      ...row,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      createdAt: row.createdAt || new Date(0).toISOString(),
      updatedAt: row.updatedAt || new Date(0).toISOString(),
      archivedAt: row.archivedAt || null,
      immutable: true,
      origin: "base",
      nameNormalized: normalize(row.name),
    }));
    const normalizedRevisions = normalizedIngredients.map((ingredient) => {
      const row = revisionMap.get(ingredient.currentRevisionId);
      if (!row) return null;
      const basis = row.basis || row.nutrition_basis || { amount: 100, unit: "g" };
      const stateMap = { unspecified: "unknown", as_sold: "as-sold" };
      return {
        ...row,
        basis: { amount: 100, unit: basis.unit === "ml" ? "ml" : "g" },
        preparationState: ["raw","cooked","dry","drained","prepared","ready-to-eat","as-sold","unknown"].includes(row.preparationState) ? row.preparationState : (stateMap[row.preparationState || row.food_state] || row.food_state || "unknown"),
        brand: row.brand ?? null,
        nutrition: camelNutrition(row.nutrition || row.nutrients),
        conversions: domainConversions(row.conversions, basis.unit),
        allergens: Array.isArray(row.allergens) ? row.allergens : [],
        toleranceNotes: row.toleranceNotes ?? null,
        source: domainSource(row.source || row.provenance, `Dataset TataDiet · ${ingredient.name}`),
        createdAt: row.createdAt || new Date(0).toISOString(),
        origin: "base",
        immutable: true,
      };
    }).filter(Boolean);
    const db = await openDatabase();
    try {
      const tx = db.transaction(["ingredients", "ingredientRevisions", "meta"], "readwrite");
      normalizedIngredients.forEach((row) => tx.objectStore("ingredients").put(row));
      normalizedRevisions.forEach((row) => tx.objectStore("ingredientRevisions").put(row));
      tx.objectStore("meta").put({ key: "phase3IngredientShapeVersion", value: CONTENT_MIGRATION_VERSION, updatedAt: now });
      tx.objectStore("meta").put({ key: "phase3IngredientShapeAt", value: now });
      await transactionPromise(tx);
    } finally { db.close(); }
    return { migrated: true, ingredients: normalizedIngredients.length, revisions: normalizedRevisions.length, version: CONTENT_MIGRATION_VERSION };
  }

  async function ensurePhase4RecipeShape(fetcher) {
    const marker = await get("meta", "phase4RecipeShapeVersion");
    if (Number(marker?.value || 0) >= RECIPE_CONTENT_MIGRATION_VERSION) return { migrated: false, version: Number(marker.value) };
    const fetchJson = fetcher || defaultFetchJson;
    const recipesFile = await fetchJson("data/v5/recipes.base.v1.json");
    const families = recipesFile.recipe_families.map(mapBaseRecipe);
    const familyById = new Map(recipesFile.recipe_families.map((row) => [row.id, row]));
    const versions = recipesFile.recipe_versions.map((row) => mapBaseRecipeVersion(row, familyById.get(row.recipe_id)));
    const now = new Date().toISOString();
    const db = await openDatabase();
    try {
      const tx = db.transaction(["recipes", "recipeVersions", "meta"], "readwrite");
      families.forEach((row) => tx.objectStore("recipes").put(row));
      versions.forEach((row) => tx.objectStore("recipeVersions").put(row));
      tx.objectStore("meta").put({ key: "phase4RecipeShapeVersion", value: RECIPE_CONTENT_MIGRATION_VERSION, updatedAt: now });
      tx.objectStore("meta").put({ key: "phase4RecipeShapeAt", value: now });
      await transactionPromise(tx);
    } finally { db.close(); }
    return { migrated: true, recipes: families.length, versions: versions.length, version: RECIPE_CONTENT_MIGRATION_VERSION };
  }

  async function ensureStableRelease() {
    const marker = await get("meta", "stableReleaseMigrationVersion");
    if (Number(marker?.value || 0) >= STABLE_MIGRATION_VERSION) {
      await put("meta", { key: "currentAppVersion", value: APP_VERSION, updatedAt: new Date().toISOString() });
      return { migrated: false, version: Number(marker.value), appVersion: APP_VERSION };
    }
    // La stabile usa lo stesso schema IndexedDB delle alpha V5. Non riscrivere i dati
    // personali: ingredienti, ricette, calendario e operazioni devono mantenere gli ID
    // e i riferimenti immutabili creati dalle build precedenti.
    const now = new Date().toISOString();
    const db = await openDatabase();
    try {
      const tx = db.transaction(["meta"], "readwrite");
      const meta = tx.objectStore("meta");
      meta.put({ key: "stableReleaseMigrationVersion", value: STABLE_MIGRATION_VERSION, updatedAt: now });
      meta.put({ key: "stableReleaseMigrationAt", value: now, updatedAt: now });
      meta.put({ key: "currentAppVersion", value: APP_VERSION, updatedAt: now });
      await transactionPromise(tx);
    } finally { db.close(); }
    return { migrated: true, version: STABLE_MIGRATION_VERSION, appVersion: APP_VERSION };
  }

  async function initialize(options = {}) {
    await openDatabase().then((db) => db.close());
    const seed = await seedBaseDataset(options.fetchJson);
    const migration = await migrateV4(options.storage);
    const phase3Shape = await ensurePhase3IngredientShape();
    const phase4Shape = await ensurePhase4RecipeShape(options.fetchJson);
    const stableRelease = await ensureStableRelease();
    await put("meta", { key: "lastInitializedAt", value: new Date().toISOString() });
    return { seed, migration, phase3Shape, phase4Shape, stableRelease, counts: await counts() };
  }

  return { DB_NAME, DB_VERSION, SCHEMA_VERSION, APP_VERSION, STABLE_MIGRATION_VERSION, CONTENT_MIGRATION_VERSION, RECIPE_CONTENT_MIGRATION_VERSION, STORE_SPECS, personalStores, backupStores, openDatabase, get, getAll, put, bulkPut, clearStores, counts, setSetting, getSetting, allSettingsObject, seedBaseDataset, migrateV4, ensurePhase3IngredientShape, ensurePhase4RecipeShape, ensureStableRelease, initialize, normalize };
});
