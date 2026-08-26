(() => {
  "use strict";
  if (document.body.dataset.page !== "ingredients") return;

  const db = window.TataDietDB;
  const core = window.TataDietIngredientCore;
  const store = window.TataDietIngredientStore;
  if (!db || !core || !store) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const fmt = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("it-IT", { maximumFractionDigits: digits }) : "—";
  const formatDate = (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  const loading = $("[data-ingredients-loading]");
  const statusHost = $("[data-ingredients-status]");
  const apps = $$('[data-ingredients-app]');
  const grid = $("[data-ingredient-grid]");
  const empty = $("[data-ingredient-empty]");
  const searchInput = $("[data-ingredient-search]");
  const originFilter = $("[data-ingredient-origin]");
  const categoryFilter = $("[data-ingredient-category]");
  const statusFilter = $("[data-ingredient-status-filter]");
  const dialog = $("[data-ingredient-dialog]");
  const form = $("[data-ingredient-form]");
  const historyDialog = $("[data-history-dialog]");
  const conversionList = $("[data-conversion-list]");
  const conversionTemplate = $("#conversion-row-template");

  let rows = [];
  let allIngredients = [];
  let usageMap = new Map();
  let editingIngredientId = null;
  let formMode = "new";
  let liveValidation = null;

  function setStatus(message, tone = "ok") {
    statusHost.textContent = message;
    statusHost.className = `tool-status ${tone}`;
    statusHost.hidden = false;
    window.clearTimeout(setStatus.timer);
    setStatus.timer = window.setTimeout(() => { statusHost.hidden = true; }, 7000);
  }

  function originOf(ingredient) {
    if (ingredient.origin === "base" || String(ingredient.id).startsWith("base:")) return "base";
    return "personal";
  }

  function normalizedRevision(row) {
    return core.normalizeRevision(row.revision, row.ingredient.name);
  }

  function buildUsageMap(recipeVersions) {
    const map = new Map();
    recipeVersions.forEach((version) => {
      const lines = version.ingredientLines || version.ingredient_lines || [];
      lines.forEach((line) => {
        const id = line.ingredientId || line.ingredient_id;
        if (!id) return;
        map.set(id, (map.get(id) || 0) + 1);
      });
    });
    return map;
  }

  function categoryOptions(categories) {
    return categories.map((category) => `<option value="${esc(category)}">${esc(core.displayCategory(category))}</option>`).join("");
  }

  function updateCategoryControls() {
    const categories = [...new Set(rows.map((row) => row.ingredient.category || "altro"))].sort((a, b) => core.displayCategory(a).localeCompare(core.displayCategory(b), "it"));
    categoryFilter.innerHTML = `<option value="all">Tutte le categorie</option>${categoryOptions(categories)}`;
    const formSelect = $("[data-ingredient-form-category]");
    formSelect.innerHTML = categoryOptions([...new Set([...categories, "altro"])]);
  }

  function nutritionCard(nutrition, basisUnit) {
    return `<div class="ingredient-nutrition-strip" aria-label="Valori nutrizionali">
      <span><strong>${fmt(nutrition.energyKcal, 0)}</strong><small>kcal</small></span>
      <span><strong>${fmt(nutrition.proteinG)}</strong><small>P</small></span>
      <span><strong>${fmt(nutrition.carbohydrateG)}</strong><small>C</small></span>
      <span><strong>${fmt(nutrition.fatG)}</strong><small>G</small></span>
      <span><strong>${fmt(nutrition.fiberG)}</strong><small>Fibra</small></span>
      <em>/ 100 ${esc(basisUnit)}</em>
    </div>`;
  }

  function cardHTML(row) {
    const ingredient = row.ingredient;
    const revision = normalizedRevision(row);
    const isBase = originOf(ingredient) === "base";
    const archived = Boolean(ingredient.archivedAt);
    const usage = usageMap.get(ingredient.id) || 0;
    const source = revision.source?.label || "Fonte non specificata";
    const originLabel = isBase ? "Catalogo TataDiet" : ingredient.origin === "imported" ? "Importato" : "Personale";
    const originClass = isBase ? "base" : "personal";
    const actions = isBase
      ? `<button class="button secondary compact" type="button" data-ingredient-action="duplicate" data-id="${esc(ingredient.id)}">Duplica e personalizza</button>`
      : `<button class="button secondary compact" type="button" data-ingredient-action="edit" data-id="${esc(ingredient.id)}">Modifica</button>
         <button class="button ghost compact" type="button" data-ingredient-action="history" data-id="${esc(ingredient.id)}">Revisioni</button>
         <button class="button ghost compact" type="button" data-ingredient-action="${archived ? "restore" : "archive"}" data-id="${esc(ingredient.id)}">${archived ? "Riattiva" : "Archivia"}</button>
         ${archived ? `<button class="button ghost compact danger-text" type="button" data-ingredient-action="delete" data-id="${esc(ingredient.id)}">Elimina</button>` : ""}`;
    return `<article class="ingredient-card ${isBase ? "is-base" : "is-personal"} ${archived ? "is-archived" : ""}" data-ingredient-id="${esc(ingredient.id)}">
      <div class="ingredient-card-head">
        <div>
          <div class="ingredient-card-badges"><span class="ingredient-origin-badge ${originClass}">${originLabel}</span><span class="ingredient-revision-badge">rev ${esc(revision.revisionNumber || 1)}</span>${archived ? '<span class="ingredient-archived-badge">Archiviato</span>' : ""}</div>
          <h2>${esc(ingredient.name)}</h2>
          <p>${esc(core.displayCategory(ingredient.category))} · ${esc(core.displayState(revision.preparationState))}${revision.brand ? ` · ${esc(revision.brand)}` : ""}</p>
        </div>
        <span class="ingredient-usage" title="Righe ricetta che utilizzano questo ingrediente"><strong>${usage}</strong><small>usi</small></span>
      </div>
      ${nutritionCard(revision.nutrition, revision.basis.unit)}
      <div class="ingredient-card-details">
        <p><span>Fonte</span><strong title="${esc(source)}">${esc(source)}</strong></p>
        <p><span>Conversioni</span><strong>${revision.conversions.length || "nessuna"}</strong></p>
        <p><span>Alias</span><strong>${ingredient.aliases?.length ? esc(ingredient.aliases.join(", ")) : "—"}</strong></p>
      </div>
      <div class="ingredient-card-actions">${actions}</div>
    </article>`;
  }

  function render() {
    const query = core.normalize(searchInput.value);
    const origin = originFilter.value;
    const category = categoryFilter.value;
    const status = statusFilter.value;
    const filtered = rows.filter((row) => {
      const ingredient = row.ingredient;
      const source = normalizedRevision(row).source?.label || "";
      const haystack = core.normalize([ingredient.name, ...(ingredient.aliases || []), ingredient.category, source].join(" "));
      if (query && !haystack.includes(query)) return false;
      if (origin !== "all" && originOf(ingredient) !== origin) return false;
      if (category !== "all" && ingredient.category !== category) return false;
      if (status === "active" && ingredient.archivedAt) return false;
      if (status === "archived" && !ingredient.archivedAt) return false;
      return true;
    });
    grid.innerHTML = filtered.map(cardHTML).join("");
    $("[data-ingredient-results-count]").textContent = filtered.length.toLocaleString("it-IT");
    empty.hidden = filtered.length > 0;
  }

  async function reload() {
    rows = await store.listIngredients();
    allIngredients = rows.map((row) => row.ingredient);
    const [revisions, recipeVersions] = await Promise.all([db.getAll("ingredientRevisions"), db.getAll("recipeVersions")]);
    usageMap = buildUsageMap(recipeVersions);
    const personalIds = new Set(rows.filter((row) => originOf(row.ingredient) !== "base").map((row) => row.ingredient.id));
    $("[data-ingredient-count-base]").textContent = rows.filter((row) => originOf(row.ingredient) === "base").length.toLocaleString("it-IT");
    $("[data-ingredient-count-personal]").textContent = rows.filter((row) => originOf(row.ingredient) !== "base" && !row.ingredient.archivedAt).length.toLocaleString("it-IT");
    $("[data-ingredient-count-archived]").textContent = rows.filter((row) => originOf(row.ingredient) !== "base" && row.ingredient.archivedAt).length.toLocaleString("it-IT");
    $("[data-ingredient-count-revisions]").textContent = revisions.filter((revision) => personalIds.has(revision.ingredientId)).length.toLocaleString("it-IT");
    updateCategoryControls();
    render();
  }

  function addConversion(values = {}) {
    const fragment = conversionTemplate.content.cloneNode(true);
    const row = $(".conversion-row", fragment);
    Object.entries(values).forEach(([key, value]) => {
      const input = $(`[data-conv="${key}"]`, row);
      if (input && value !== null && value !== undefined) input.value = value;
    });
    $("[data-conv-basis-unit]", row).textContent = form.elements.basisUnit.value;
    conversionList.appendChild(fragment);
  }

  function readConversions() {
    return $$(".conversion-row", conversionList).map((row) => ({
      unitCode: $("[data-conv=unitCode]", row).value,
      labelSingular: $("[data-conv=labelSingular]", row).value,
      labelPlural: $("[data-conv=labelPlural]", row).value,
      basisAmount: $("[data-conv=basisAmount]", row).value,
      basisUnit: form.elements.basisUnit.value,
      notes: $("[data-conv=notes]", row).value,
    }));
  }

  function collectDraft() {
    const data = new FormData(form);
    return {
      name: data.get("name"), category: data.get("category"), aliases: data.get("aliases"), brand: data.get("brand"),
      preparationState: data.get("preparationState"), basisUnit: data.get("basisUnit"),
      energyKcal: data.get("energyKcal"), proteinG: data.get("proteinG"), carbohydrateG: data.get("carbohydrateG"), fatG: data.get("fatG"), fiberG: data.get("fiberG"),
      sugarsG: data.get("sugarsG"), saturatedFatG: data.get("saturatedFatG"), saltG: data.get("saltG"), sodiumMg: data.get("sodiumMg"),
      sourceType: data.get("sourceType"), sourceLabel: data.get("sourceLabel"), sourceUrl: data.get("sourceUrl"), allergens: data.get("allergens"), toleranceNotes: data.get("toleranceNotes"),
      conversions: readConversions(),
    };
  }

  function renderValidation(validation) {
    liveValidation = validation;
    const host = $("[data-validation-preview]");
    $("[data-preview-kcal]").textContent = fmt(validation.draft?.nutrition?.energyKcal, 0);
    $("[data-preview-protein]").textContent = fmt(validation.draft?.nutrition?.proteinG);
    $("[data-preview-carbs]").textContent = fmt(validation.draft?.nutrition?.carbohydrateG);
    $("[data-preview-fat]").textContent = fmt(validation.draft?.nutrition?.fatG);
    $("[data-preview-fiber]").textContent = fmt(validation.draft?.nutrition?.fiberG);
    $("[data-preview-atwater]").textContent = Number.isFinite(validation.atwaterKcal) ? `${fmt(validation.atwaterKcal, 0)} kcal` : "— kcal";
    if (validation.errors.length) {
      host.className = "validation-preview has-errors";
      host.innerHTML = `<strong>${validation.errors.length} camp${validation.errors.length === 1 ? "o da correggere" : "i da correggere"}</strong><ul>${validation.errors.slice(0, 6).map((item) => `<li>${esc(item.message)}</li>`).join("")}</ul>`;
    } else if (validation.warnings.length) {
      host.className = "validation-preview has-warnings";
      host.innerHTML = `<strong>Dati salvabili · ${validation.warnings.length} avvis${validation.warnings.length === 1 ? "o" : "i"}</strong><ul>${validation.warnings.slice(0, 6).map((item) => `<li>${esc(item.message)}</li>`).join("")}</ul>`;
    } else {
      host.className = "validation-preview is-valid";
      host.innerHTML = "<strong>Dati coerenti</strong><p>I campi obbligatori e le conversioni risultano validi.</p>";
    }
    $("[data-save-ingredient]").disabled = !validation.valid;
  }

  function validateLive() {
    try { renderValidation(core.validateDraft(collectDraft(), allIngredients, editingIngredientId)); }
    catch { /* form is still being initialized */ }
  }

  function resetForm() {
    form.reset();
    conversionList.innerHTML = "";
    form.elements.basisUnit.value = "g";
    form.elements.preparationState.value = "as-sold";
    form.elements.sourceType.value = "label";
    editingIngredientId = null;
    formMode = "new";
    $("[data-ingredient-dialog-eyebrow]").textContent = "Ingrediente personale";
    $("[data-ingredient-dialog-title]").textContent = "Nuovo ingrediente";
    $("[data-ingredient-dialog-subtitle]").textContent = "Inserisci i valori nutrizionali riportati in etichetta o nella fonte scelta.";
    $("[data-save-explanation]").textContent = "Il salvataggio creerà la revisione 1.";
    $("[data-ingredient-form-alert]").hidden = true;
  }

  function fillForm(draft) {
    const fields = ["name", "category", "aliases", "brand", "preparationState", "basisUnit", "energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG", "sugarsG", "saturatedFatG", "saltG", "sodiumMg", "sourceType", "sourceLabel", "sourceUrl", "allergens", "toleranceNotes"];
    fields.forEach((name) => {
      const element = form.elements.namedItem(name);
      if (!element) return;
      const value = draft[name];
      element.value = value === null || value === undefined ? "" : value;
    });
    conversionList.innerHTML = "";
    (draft.conversions || []).forEach((conversion) => addConversion(conversion));
    $$("[data-conv-basis-unit]", conversionList).forEach((node) => { node.textContent = form.elements.basisUnit.value; });
    validateLive();
  }

  function showDialog() {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    setTimeout(() => form.elements.name.focus(), 50);
  }

  async function openNew() {
    resetForm();
    fillForm({ category: "latticini-e-uova", preparationState: "as-sold", basisUnit: "g", sourceType: "label", sourceLabel: "Etichetta del prodotto", conversions: [] });
    showDialog();
  }

  async function openDuplicate(id) {
    resetForm();
    formMode = "duplicate";
    const draft = await store.duplicateDraft(id);
    $("[data-ingredient-dialog-eyebrow]").textContent = "Copia personale";
    $("[data-ingredient-dialog-title]").textContent = "Duplica ingrediente base";
    $("[data-ingredient-dialog-subtitle]").textContent = "Modifica liberamente la copia: il record TataDiet originale resterà invariato.";
    $("[data-save-explanation]").textContent = "Verrà creato un nuovo ingrediente personale con revisione 1.";
    fillForm(draft);
    showDialog();
  }

  async function openEdit(id) {
    resetForm();
    const bundle = await store.getBundle(id);
    if (!bundle) throw new Error("Ingrediente non trovato");
    editingIngredientId = id;
    formMode = "edit";
    $("[data-ingredient-dialog-eyebrow]").textContent = `Revisione ${Number(bundle.currentRevision?.revisionNumber || 0) + 1}`;
    $("[data-ingredient-dialog-title]").textContent = `Modifica ${bundle.ingredient.name}`;
    $("[data-ingredient-dialog-subtitle]").textContent = "La revisione corrente non verrà sovrascritta; resterà disponibile nello storico.";
    $("[data-save-explanation]").textContent = `Il salvataggio creerà la revisione ${Number(bundle.currentRevision?.revisionNumber || 0) + 1}.`;
    fillForm(core.draftFromRecords(bundle.ingredient, bundle.currentRevision));
    showDialog();
  }

  async function showHistory(id) {
    const bundle = await store.getBundle(id);
    if (!bundle) throw new Error("Ingrediente non trovato");
    $("[data-history-title]").textContent = `${bundle.ingredient.name} · revisioni`;
    const currentId = bundle.ingredient.currentRevisionId;
    $("[data-revision-timeline]").innerHTML = bundle.revisions.map((revision) => {
      const normalized = core.normalizeRevision(revision, bundle.ingredient.name);
      const current = revision.id === currentId;
      return `<article class="revision-entry ${current ? "is-current" : ""}">
        <div class="revision-entry-head"><div><span class="ingredient-revision-badge">rev ${esc(revision.revisionNumber)}</span>${current ? '<span class="status-pill success">Corrente</span>' : ""}</div><time>${esc(formatDate(revision.createdAt))}</time></div>
        ${nutritionCard(normalized.nutrition, normalized.basis.unit)}
        <dl><div><dt>Stato</dt><dd>${esc(core.displayState(normalized.preparationState))}</dd></div><div><dt>Fonte</dt><dd>${esc(normalized.source.label)}</dd></div><div><dt>Conversioni</dt><dd>${normalized.conversions.length}</dd></div></dl>
      </article>`;
    }).join("");
    historyDialog.showModal();
  }

  async function handleAction(action, id) {
    try {
      if (action === "duplicate") return openDuplicate(id);
      if (action === "edit") return openEdit(id);
      if (action === "history") return showHistory(id);
      if (action === "archive") {
        if (!confirm("Archiviare questo ingrediente personale? Le ricette che lo usano continueranno a riferirsi alle revisioni esistenti.")) return;
        await store.archiveIngredient(id, true); await reload(); return setStatus("Ingrediente archiviato.");
      }
      if (action === "restore") { await store.archiveIngredient(id, false); await reload(); return setStatus("Ingrediente riattivato."); }
      if (action === "delete") {
        const usage = await store.referenceInfo(id);
        if (usage.count) return setStatus(`Non eliminabile: è usato da ${usage.count} version${usage.count === 1 ? "e" : "i"} di ricetta. Può restare archiviato.`, "warn");
        if (!confirm("Eliminare definitivamente questo ingrediente e tutte le sue revisioni? Questa azione non è annullabile.")) return;
        const result = await store.deleteIfUnused(id);
        if (!result.deleted) return setStatus("Ingrediente non eliminato.", "warn");
        await reload(); return setStatus(`Ingrediente eliminato con ${result.revisionsDeleted} revision${result.revisionsDeleted === 1 ? "e" : "i"}.`);
      }
    } catch (error) { setStatus(error.message || String(error), "error"); }
  }

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ingredient-action]");
    if (!button) return;
    handleAction(button.dataset.ingredientAction, button.dataset.id);
  });

  [searchInput, originFilter, categoryFilter, statusFilter].forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", render));
  $("[data-ingredient-reset]").addEventListener("click", () => { searchInput.value = ""; originFilter.value = "all"; categoryFilter.value = "all"; statusFilter.value = "active"; render(); });
  $("[data-new-ingredient]").addEventListener("click", openNew);
  $("[data-dialog-close]").addEventListener("click", () => dialog.close());
  $("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  $("[data-history-close]").addEventListener("click", () => historyDialog.close());
  $("[data-add-conversion]").addEventListener("click", () => { addConversion(); validateLive(); });
  conversionList.addEventListener("click", (event) => { const button = event.target.closest("[data-remove-conversion]"); if (button) { button.closest(".conversion-row").remove(); validateLive(); } });
  conversionList.addEventListener("input", validateLive);
  conversionList.addEventListener("change", validateLive);
  form.addEventListener("input", validateLive);
  form.addEventListener("change", (event) => { if (event.target.name === "basisUnit") $$("[data-conv-basis-unit]", conversionList).forEach((node) => { node.textContent = event.target.value; }); validateLive(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const validation = core.validateDraft(collectDraft(), allIngredients, editingIngredientId);
    renderValidation(validation);
    if (!validation.valid) {
      const firstField = validation.errors.find((item) => item.field)?.field;
      const target = firstField ? form.elements.namedItem(firstField) : null;
      target?.focus?.();
      return;
    }
    const saveButton = $("[data-save-ingredient]");
    saveButton.disabled = true;
    saveButton.textContent = "Salvataggio…";
    try {
      const result = await store.saveDraft(validation.draft, editingIngredientId);
      dialog.close();
      await reload();
      setStatus(formMode === "edit" ? `Nuova revisione ${result.revision.revisionNumber} salvata.` : "Ingrediente personale creato.");
    } catch (error) {
      const alert = $("[data-ingredient-form-alert]");
      alert.textContent = error.message || String(error);
      alert.className = "ingredient-form-alert error";
      alert.hidden = false;
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Salva ingrediente";
    }
  });

  (async () => {
    try {
      const init = await db.initialize();
      await reload();
      loading.hidden = true;
      apps.forEach((node) => { node.hidden = false; });
      const requestedIngredient = new URLSearchParams(location.search).get("ingredient");
      if (requestedIngredient && allIngredients.some((item) => item.id === requestedIngredient && item.origin === "personal")) await openEdit(requestedIngredient);
      if (init.phase3Shape?.migrated) setStatus(`Catalogo locale aggiornato alla Fase 3: ${init.phase3Shape.ingredients} ingredienti normalizzati.`);
    } catch (error) {
      loading.hidden = true;
      setStatus(`Impossibile inizializzare lo Studio ingredienti: ${error.message || error}`, "error");
    }
  })();
})();
