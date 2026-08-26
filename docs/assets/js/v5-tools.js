(() => {
  "use strict";
  if (document.body.dataset.page !== "tools") return;
  const db = window.TataDietDB;
  const backup = window.TataDietBackup;
  const state = window.DietSiteState;
  if (!db || !backup || !state) return;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const status = (message, tone = "ok") => {
    const host = $("[data-v5-status]");
    if (!host) return;
    host.className = `tool-status ${tone}`;
    host.textContent = message;
    host.hidden = false;
  };
  const formatCounts = (counts) => Object.entries(counts).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(" · ") || "nessun record personale";

  async function initialize() {
    const result = await db.initialize({ fetchJson: (path) => state.fetchJson(path) });
    const counts = result.counts;
    $("[data-v5-db-state]").textContent = "Pronto";
    $("[data-v5-base-count]").textContent = `${counts.ingredients || 0} ingredienti · ${counts.recipes || 0} ricette`;
    $("[data-v5-personal-count]").textContent = `${Math.max(0, (counts.ingredients || 0) - 130)} ingredienti · ${Math.max(0, (counts.recipes || 0) - 306)} ricette`;
    const migrated = await db.get("meta", "v4MigrationSummary");
    $("[data-v5-migration]").textContent = migrated?.value ? `${migrated.value.startDate ? "data iniziale" : "nessuna data"}, ${migrated.value.checklists} checklist` : "nessuna migrazione";
    const start = await db.getSetting("planStartDate");
    if (start) $("[data-v5-start]").textContent = start;
    return result;
  }

  async function exportBackup(mode) {
    status("Preparazione del backup…");
    const envelope = await backup.createBackup(mode);
    state.downloadBlob(JSON.stringify(envelope, null, 2), backup.filename(mode), "application/json;charset=utf-8");
    status(`Backup ${mode} esportato con checksum SHA-256.`);
  }

  function renderPreview(report, payload) {
    const host = $("[data-import-preview]");
    if (!host) return;
    host.hidden = false;
    const counts = Object.entries(report.counts || {}).filter(([, n]) => n).map(([key, n]) => `<li><strong>${n}</strong> ${state.escapeHtml(key)}</li>`).join("");
    const conflicts = report.conflicts?.length ? `<p class="import-warning"><strong>${report.conflicts.length} conflitti ID</strong> saranno gestiti secondo la modalità scelta.</p>` : "";
    host.innerHTML = `
      <div class="import-preview-head"><div><p class="eyebrow">Anteprima import</p><h3>${report.valid ? "Backup verificato" : "Backup non importabile"}</h3></div><span class="status-pill ${report.valid ? "success" : "danger"}">${report.valid ? "SHA-256 valido" : "Errore"}</span></div>
      <p>${state.escapeHtml(payload.appVersion || "Versione sconosciuta")} · ${state.escapeHtml(payload.mode || "?")} · ${state.escapeHtml(payload.exportedAt || "")}</p>
      ${counts ? `<ul class="compact-count-list">${counts}</ul>` : "<p>Nessun dato personale nel file.</p>"}
      ${conflicts}
      ${report.errors?.length ? `<div class="import-errors">${report.errors.map((e) => `<p>${state.escapeHtml(e)}</p>`).join("")}</div>` : ""}
    `;
    $("[data-import-actions]").hidden = !report.valid;
  }

  let pendingBackup = null;
  async function chooseBackup(file) {
    pendingBackup = await backup.parseFile(file);
    status("Verifica integrità e compatibilità…");
    const report = await backup.preview(pendingBackup);
    renderPreview(report, pendingBackup);
    status(report.valid ? "Backup verificato. Scegli come importarlo." : "Backup non importabile.", report.valid ? "ok" : "error");
  }

  async function doImport(mode) {
    if (!pendingBackup) return;
    const label = { replace: "sostituire tutti i dati personali", merge: "unire i dati", recipes: "sostituire ricette e ingredienti personali", calendar: "sostituire il calendario personale", settings: "sostituire le impostazioni" }[mode];
    if (!confirm(`Confermi di ${label}? Prima dell'import viene creato un checkpoint automatico.`)) return;
    status("Importazione transazionale in corso…");
    const result = await backup.importBackup(pendingBackup, mode);
    status(`Import completato. ${formatCounts(result.imported)}${result.remappedIds ? ` · ${result.remappedIds} ID rimappati` : ""}.`);
    $("[data-rollback-import]").hidden = false;
    await initialize();
  }

  async function rollback() {
    if (!confirm("Ripristinare il checkpoint creato prima dell'ultima importazione?")) return;
    status("Ripristino del checkpoint…");
    await backup.rollbackLastImport();
    status("Rollback completato.");
    await initialize();
  }

  async function init() {
    try { await initialize(); }
    catch (error) { status(`IndexedDB non disponibile: ${error.message}`, "error"); return; }
    $$('[data-v5-export]').forEach((button) => button.addEventListener("click", () => exportBackup(button.dataset.v5Export).catch((error) => status(error.message, "error"))));
    $("[data-v5-import-file]")?.addEventListener("change", async (event) => {
      $("[data-import-preview]").hidden = true; $("[data-import-actions]").hidden = true;
      try { await chooseBackup(event.target.files?.[0]); } catch (error) { status(error.message, "error"); }
      event.target.value = "";
    });
    $$('[data-v5-import-mode]').forEach((button) => button.addEventListener("click", () => doImport(button.dataset.v5ImportMode).catch((error) => status(error.message, "error"))));
    $("[data-rollback-import]")?.addEventListener("click", () => rollback().catch((error) => status(error.message, "error")));
  }
  init();
})();
