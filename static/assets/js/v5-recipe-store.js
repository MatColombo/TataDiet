(function (global, factory) {
  const api = factory(global.TataDietDB, global.TataDietRecipeCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietRecipeStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dbApi, core) {
  "use strict";

  function requireDeps() { if (!dbApi || !core) throw new Error("Moduli V5 ricette non inizializzati"); }
  function txPromise(tx) { return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || new Error("Transazione non riuscita")); tx.onabort = () => reject(tx.error || new Error("Transazione annullata")); }); }
  function isBase(record) { return record?.origin === "base" || record?.immutable || String(record?.id || "").startsWith("base:"); }

  async function ingredientContext(options = {}) {
    requireDeps();
    const [ingredients, revisions] = await Promise.all([dbApi.getAll("ingredients"), dbApi.getAll("ingredientRevisions")]);
    const activeOnly = options.activeOnly !== false;
    return {
      ingredients: ingredients.filter((row) => !activeOnly || !row.archivedAt).sort((a, b) => String(a.name).localeCompare(String(b.name), "it", { sensitivity: "base" })),
      revisions,
    };
  }

  async function listRecipes(options = {}) {
    requireDeps();
    const [recipes, versions] = await Promise.all([dbApi.getAll("recipes"), dbApi.getAll("recipeVersions")]);
    const versionById = new Map(versions.map((row) => [row.id, row]));
    return recipes
      .filter((row) => options.includeArchived !== false || !row.archivedAt)
      .map((recipe) => ({ recipe, version: versionById.get(recipe.currentVersionId) || null }))
      .sort((a, b) => String(a.recipe.title || "").localeCompare(String(b.recipe.title || ""), "it", { sensitivity: "base" }));
  }

  async function getBundle(recipeId) {
    requireDeps();
    const recipe = await dbApi.get("recipes", recipeId);
    if (!recipe) return null;
    const versions = (await dbApi.getAll("recipeVersions")).filter((row) => row.recipeId === recipeId || row.recipe_id === recipeId)
      .sort((a, b) => Number(b.versionNumber ?? b.revision ?? 0) - Number(a.versionNumber ?? a.revision ?? 0));
    const currentVersion = versions.find((row) => row.id === recipe.currentVersionId) || versions[0] || null;
    return { recipe, currentVersion, versions };
  }

  async function saveDraft(input, recipeId = null) {
    requireDeps();
    const [{ ingredients, revisions }, allRecipes] = await Promise.all([ingredientContext({ activeOnly: false }), dbApi.getAll("recipes")]);
    let existingRecipe = null;
    let currentVersion = null;
    if (recipeId) {
      const bundle = await getBundle(recipeId);
      if (!bundle) throw new Error("Ricetta non trovata");
      if (isBase(bundle.recipe)) throw new Error("Le ricette base sono immutabili: duplicale prima di modificarle.");
      existingRecipe = bundle.recipe;
      currentVersion = bundle.currentVersion;
    }
    const result = await core.makePersonalRecords(input, { ingredients, revisions, recipes: allRecipes, existingRecipe, currentVersion });
    const db = await dbApi.openDatabase();
    try {
      const tx = db.transaction(["recipes", "recipeVersions"], "readwrite");
      tx.objectStore("recipeVersions").put(result.version);
      tx.objectStore("recipes").put(result.recipe);
      await txPromise(tx);
    } finally { db.close(); }
    return result;
  }

  async function duplicateDraft(recipeId) {
    requireDeps();
    const bundle = await getBundle(recipeId);
    if (!bundle?.currentVersion) throw new Error("Ricetta o versione non disponibile");
    const draft = core.draftFromRecords(bundle.recipe, bundle.currentVersion);
    draft.title = `${bundle.recipe.title} · personale`;
    return draft;
  }

  async function archiveRecipe(recipeId, archived = true) {
    requireDeps();
    const recipe = await dbApi.get("recipes", recipeId);
    if (!recipe) throw new Error("Ricetta non trovata");
    if (isBase(recipe)) throw new Error("Le ricette base non possono essere archiviate.");
    const now = new Date().toISOString();
    const updated = { ...recipe, archivedAt: archived ? now : null, updatedAt: now };
    await dbApi.put("recipes", updated);
    return updated;
  }

  async function usageInfo(recipeId) {
    requireDeps();
    const [calendarDays, operations] = await Promise.all([dbApi.getAll("calendarDays"), dbApi.getAll("operations")]);
    const refs = [];
    const inspect = (record, kind) => {
      const text = JSON.stringify(record);
      if (text.includes(recipeId)) refs.push({ kind, id: record.id });
    };
    calendarDays.forEach((row) => inspect(row, "calendarDay"));
    operations.forEach((row) => inspect(row, "operation"));
    return { count: refs.length, references: refs };
  }

  async function deleteIfUnused(recipeId) {
    requireDeps();
    const bundle = await getBundle(recipeId);
    if (!bundle) return { deleted: false, reason: "not-found" };
    if (isBase(bundle.recipe)) throw new Error("Le ricette base non possono essere eliminate.");
    const usage = await usageInfo(recipeId);
    if (usage.count) return { deleted: false, reason: "referenced", usage };
    const db = await dbApi.openDatabase();
    try {
      const tx = db.transaction(["recipes", "recipeVersions"], "readwrite");
      bundle.versions.forEach((version) => tx.objectStore("recipeVersions").delete(version.id));
      tx.objectStore("recipes").delete(recipeId);
      await txPromise(tx);
    } finally { db.close(); }
    return { deleted: true, versionsDeleted: bundle.versions.length };
  }

  return { ingredientContext, listRecipes, getBundle, saveDraft, duplicateDraft, archiveRecipe, usageInfo, deleteIfUnused, isBase };
});
