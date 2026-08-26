(function (global, factory) {
  const api = factory(global.TataDietDB, global.TataDietIngredientCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietIngredientStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dbApi, core) {
  "use strict";

  function requireDeps() {
    if (!dbApi || !core) throw new Error("Moduli V5 ingredienti non inizializzati");
  }

  function txPromise(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Transazione IndexedDB non riuscita"));
      tx.onabort = () => reject(tx.error || new Error("Transazione IndexedDB annullata"));
    });
  }

  async function listIngredients() {
    requireDeps();
    const [ingredients, revisions] = await Promise.all([dbApi.getAll("ingredients"), dbApi.getAll("ingredientRevisions")]);
    const revisionsById = new Map(revisions.map((row) => [row.id, row]));
    return ingredients.map((ingredient) => ({ ingredient, revision: revisionsById.get(ingredient.currentRevisionId) || null }))
      .sort((a, b) => String(a.ingredient.name || "").localeCompare(String(b.ingredient.name || ""), "it", { sensitivity: "base" }));
  }

  async function getBundle(ingredientId) {
    requireDeps();
    const ingredient = await dbApi.get("ingredients", ingredientId);
    if (!ingredient) return null;
    const allRevisions = (await dbApi.getAll("ingredientRevisions"))
      .filter((row) => row.ingredientId === ingredientId)
      .sort((a, b) => Number(b.revisionNumber || 0) - Number(a.revisionNumber || 0));
    const currentRevision = allRevisions.find((row) => row.id === ingredient.currentRevisionId) || allRevisions[0] || null;
    return { ingredient, currentRevision, revisions: allRevisions };
  }

  async function referenceInfo(ingredientId) {
    requireDeps();
    const versions = await dbApi.getAll("recipeVersions");
    const refs = [];
    for (const version of versions) {
      const lines = version.ingredientLines || version.ingredient_lines || [];
      const hitCount = lines.filter((line) => (line.ingredientId || line.ingredient_id) === ingredientId).length;
      if (hitCount) refs.push({ recipeVersionId: version.id, recipeId: version.recipeId || version.recipe_id || null, count: hitCount, origin: version.origin || (String(version.id).startsWith("base:") ? "base" : "personal") });
    }
    return { count: refs.length, references: refs, baseCount: refs.filter((r) => r.origin === "base").length, personalCount: refs.filter((r) => r.origin !== "base").length };
  }

  async function saveDraft(input, ingredientId = null) {
    requireDeps();
    const allIngredients = (await listIngredients()).map((row) => row.ingredient);
    let existingIngredient = null;
    let currentRevision = null;
    if (ingredientId) {
      const bundle = await getBundle(ingredientId);
      if (!bundle) throw new Error("Ingrediente non trovato");
      if (bundle.ingredient.origin === "base" || bundle.ingredient.immutable || String(bundle.ingredient.id).startsWith("base:")) throw new Error("Gli ingredienti base sono immutabili: duplicali prima di modificarli.");
      existingIngredient = bundle.ingredient;
      currentRevision = bundle.currentRevision;
    }
    const validation = core.validateDraft(input, allIngredients, ingredientId);
    if (!validation.valid) {
      const error = new Error(validation.errors.map((item) => item.message).join(" "));
      error.validation = validation;
      throw error;
    }
    const { ingredient, revision } = core.makePersonalRecords(validation.draft, { existingIngredient, currentRevision });
    const db = await dbApi.openDatabase();
    try {
      const tx = db.transaction(["ingredients", "ingredientRevisions"], "readwrite");
      tx.objectStore("ingredientRevisions").put(revision);
      tx.objectStore("ingredients").put(ingredient);
      await txPromise(tx);
    } finally { db.close(); }
    return { ingredient, revision, validation };
  }

  async function archiveIngredient(ingredientId, archived = true) {
    requireDeps();
    const ingredient = await dbApi.get("ingredients", ingredientId);
    if (!ingredient) throw new Error("Ingrediente non trovato");
    if (ingredient.origin === "base" || ingredient.immutable || String(ingredient.id).startsWith("base:")) throw new Error("Gli ingredienti base non possono essere archiviati.");
    const now = new Date().toISOString();
    const updated = { ...ingredient, archivedAt: archived ? now : null, updatedAt: now };
    await dbApi.put("ingredients", updated);
    return updated;
  }

  async function deleteIfUnused(ingredientId) {
    requireDeps();
    const bundle = await getBundle(ingredientId);
    if (!bundle) return { deleted: false, reason: "not-found" };
    if (bundle.ingredient.origin === "base" || bundle.ingredient.immutable || String(bundle.ingredient.id).startsWith("base:")) throw new Error("Gli ingredienti base non possono essere eliminati.");
    const usage = await referenceInfo(ingredientId);
    if (usage.count) return { deleted: false, reason: "referenced", usage };
    const db = await dbApi.openDatabase();
    try {
      const tx = db.transaction(["ingredients", "ingredientRevisions"], "readwrite");
      bundle.revisions.forEach((revision) => tx.objectStore("ingredientRevisions").delete(revision.id));
      tx.objectStore("ingredients").delete(ingredientId);
      await txPromise(tx);
    } finally { db.close(); }
    return { deleted: true, revisionsDeleted: bundle.revisions.length };
  }

  async function duplicateDraft(ingredientId) {
    requireDeps();
    const bundle = await getBundle(ingredientId);
    if (!bundle?.currentRevision) throw new Error("Ingrediente o revisione non disponibili");
    const draft = core.draftFromRecords(bundle.ingredient, bundle.currentRevision);
    draft.ingredientId = null;
    draft.name = `${bundle.ingredient.name} · personale`;
    draft.sourceType = "database";
    draft.sourceLabel = `Duplicato dal catalogo TataDiet: ${bundle.ingredient.name}`;
    draft.sourceUrl = bundle.currentRevision?.source?.url || bundle.currentRevision?.source?.source_url || "";
    return draft;
  }

  return { listIngredients, getBundle, referenceInfo, saveDraft, archiveIngredient, deleteIfUnused, duplicateDraft };
});
