(function (global, factory) {
  const api = factory(global.TataDietDB);
  if (typeof module === "object" && module.exports) module.exports = api;
  global.TataDietBackup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dbApi) {
  "use strict";
  const FORMAT = "tatadiet-backup";
  const SCHEMA_VERSION = 1;
  const APP_VERSION = "5.2.1";
  const dataKeys = ["ingredients", "ingredientRevisions", "recipes", "recipeVersions", "planInstances", "calendarDays", "operations", "shoppingChecklists", "settings"];

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  async function sha256(text) {
    if (!globalThis.crypto?.subtle) throw new Error("SHA-256 non disponibile in questo browser");
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function baseInfo() {
    const id = (await dbApi.get("meta", "baseDatasetId"))?.value;
    const sourceSha256 = (await dbApi.get("meta", "baseDatasetSourceSha256"))?.value;
    if (!id || !sourceSha256) throw new Error("Dataset base V5 non inizializzato");
    return { id, sourceSha256 };
  }

  function isPersonal(record) { return record && !String(record.id || "").startsWith("base:") && record.origin !== "base" && !record.immutable; }
  function emptyData() { return { ingredients: [], ingredientRevisions: [], recipes: [], recipeVersions: [], planInstances: [], calendarDays: [], operations: [], shoppingChecklists: [], settings: {} }; }

  async function collect(mode = "full") {
    const data = emptyData();
    if (["full", "recipes"].includes(mode)) {
      data.ingredients = (await dbApi.getAll("ingredients")).filter(isPersonal);
      data.ingredientRevisions = (await dbApi.getAll("ingredientRevisions")).filter(isPersonal);
      data.recipes = (await dbApi.getAll("recipes")).filter(isPersonal);
      data.recipeVersions = (await dbApi.getAll("recipeVersions")).filter(isPersonal);
    }
    if (["full", "calendar"].includes(mode)) {
      data.planInstances = await dbApi.getAll("planInstances");
      data.calendarDays = await dbApi.getAll("calendarDays");
      data.operations = await dbApi.getAll("operations");
    }
    if (mode === "full") data.shoppingChecklists = await dbApi.getAll("shoppingChecklists");
    if (["full", "settings"].includes(mode)) data.settings = await dbApi.allSettingsObject();
    return data;
  }

  async function createBackup(mode = "full") {
    if (!["full", "recipes", "calendar", "settings"].includes(mode)) throw new Error("Modalità backup non valida");
    const envelope = {
      recordType: "backup", format: FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(), baseDataset: await baseInfo(), mode, data: await collect(mode),
      integrity: { algorithm: "sha256", digest: "" },
    };
    envelope.integrity.digest = await sha256(canonical({ ...envelope, integrity: { algorithm: "sha256", digest: "" } }));
    return envelope;
  }

  function validateShape(backup) {
    const errors = [];
    if (!backup || typeof backup !== "object") return ["Il file non contiene un oggetto JSON."];
    if (backup.recordType !== "backup" || backup.format !== FORMAT) errors.push("Formato TataDiet non riconosciuto.");
    if (backup.schemaVersion !== SCHEMA_VERSION) errors.push(`Schema ${backup.schemaVersion ?? "?"} non supportato.`);
    if (!["full", "recipes", "calendar", "settings"].includes(backup.mode)) errors.push("Modalità backup non valida.");
    if (!backup.baseDataset?.id || !/^[a-f0-9]{64}$/.test(backup.baseDataset?.sourceSha256 || "")) errors.push("Riferimento al dataset base non valido.");
    if (!backup.data || typeof backup.data !== "object") errors.push("Sezione dati mancante.");
    else dataKeys.forEach((key) => {
      if (key === "settings") { if (typeof backup.data[key] !== "object" || Array.isArray(backup.data[key])) errors.push("Impostazioni non valide."); }
      else if (!Array.isArray(backup.data[key])) errors.push(`${key} deve essere un array.`);
    });
    if (backup.integrity?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(backup.integrity?.digest || "")) errors.push("Checksum SHA-256 mancante o non valido.");
    return errors;
  }

  async function verifyIntegrity(backup) {
    const actual = await sha256(canonical({ ...backup, integrity: { algorithm: "sha256", digest: "" } }));
    return { valid: actual === backup.integrity.digest, actual, expected: backup.integrity.digest };
  }

  async function preview(backup) {
    const errors = validateShape(backup);
    if (errors.length) return { valid: false, errors, warnings: [], conflicts: [], counts: {} };
    const integrity = await verifyIntegrity(backup);
    if (!integrity.valid) errors.push("Checksum non valido: il file è stato modificato o corrotto.");
    const currentBase = await baseInfo();
    if (backup.baseDataset.id !== currentBase.id || backup.baseDataset.sourceSha256 !== currentBase.sourceSha256) errors.push("Il backup usa un dataset base incompatibile con questa installazione.");
    const warnings = [];
    if (backup.appVersion && backup.appVersion !== APP_VERSION) warnings.push(`Backup creato con TataDiet ${backup.appVersion}; lo schema ${SCHEMA_VERSION} è compatibile con TataDiet ${APP_VERSION}.`);
    const conflicts = [];
    for (const store of ["ingredients", "ingredientRevisions", "recipes", "recipeVersions", "planInstances", "calendarDays", "operations"]) {
      for (const row of backup.data[store] || []) {
        const current = await dbApi.get(store, row.id);
        if (current && canonical(current) !== canonical(row)) conflicts.push({ store, id: row.id, kind: "different-content" });
      }
    }
    const counts = Object.fromEntries(dataKeys.map((key) => [key, key === "settings" ? Object.keys(backup.data.settings || {}).length : (backup.data[key] || []).length]));
    if (conflicts.length) warnings.push("Sono presenti record con lo stesso ID ma contenuto diverso.");
    return { valid: !errors.length, errors, warnings, conflicts, counts, integrity, mode: backup.mode, exportedAt: backup.exportedAt };
  }

  async function snapshotCurrent() {
    return createBackup("full");
  }

  function remapConflictId(id) {
    const suffix = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${id}:import:${suffix}`;
  }

  function deepRemap(value, idMap) {
    if (Array.isArray(value)) return value.map((item) => deepRemap(item, idMap));
    if (value && typeof value === "object") {
      const out = {};
      Object.entries(value).forEach(([key, item]) => { out[key] = deepRemap(item, idMap); });
      return out;
    }
    return typeof value === "string" && idMap.has(value) ? idMap.get(value) : value;
  }

  async function prepareImportRecords(backup, mode) {
    const allowed = mode === "recipes" ? ["ingredients", "ingredientRevisions", "recipes", "recipeVersions"]
      : mode === "calendar" ? ["planInstances", "calendarDays", "operations"]
      : mode === "settings" ? []
      : ["ingredients", "ingredientRevisions", "recipes", "recipeVersions", "planInstances", "calendarDays", "operations", "shoppingChecklists"];
    const idMap = new Map();
    if (mode === "merge") {
      for (const store of allowed) {
        for (const row of backup.data[store] || []) {
          const current = await dbApi.get(store, row.id);
          if (current && canonical(current) !== canonical(row)) {
            if (current.origin === "base" || current.immutable) throw new Error(`Conflitto con record base immutabile: ${row.id}`);
            idMap.set(row.id, remapConflictId(row.id));
          }
        }
      }
    }
    return {
      allowed,
      idMap,
      records: Object.fromEntries(allowed.map((store) => [store, (backup.data[store] || []).map((row) => deepRemap(row, idMap))])),
    };
  }

  async function importBackup(backup, mode = "replace") {
    const report = await preview(backup);
    if (!report.valid) throw new Error(report.errors.join(" "));
    if (!["replace", "merge", "recipes", "calendar", "settings"].includes(mode)) throw new Error("Modalità di import non valida");
    const safetyBackup = await snapshotCurrent();
    const prepared = await prepareImportRecords(backup, mode);
    const allStores = ["meta", "settings", "ingredients", "ingredientRevisions", "recipes", "recipeVersions", "planInstances", "calendarDays", "operations", "shoppingChecklists"];
    const currentPersonal = {};
    for (const store of ["ingredients", "ingredientRevisions", "recipes", "recipeVersions"]) currentPersonal[store] = (await dbApi.getAll(store)).filter(isPersonal);

    const db = await dbApi.openDatabase();
    try {
      const tx = db.transaction(allStores, "readwrite");
      const now = new Date().toISOString();
      tx.objectStore("meta").put({ key: "preImportRollback", value: safetyBackup, updatedAt: now });
      tx.objectStore("meta").put({ key: "preImportRollbackCreatedAt", value: now });

      if (mode === "replace") {
        ["ingredients", "ingredientRevisions", "recipes", "recipeVersions"].forEach((store) => currentPersonal[store].forEach((row) => tx.objectStore(store).delete(row.id)));
        ["planInstances", "calendarDays", "operations", "shoppingChecklists"].forEach((store) => tx.objectStore(store).clear());
      } else if (mode === "recipes") {
        ["ingredients", "ingredientRevisions", "recipes", "recipeVersions"].forEach((store) => currentPersonal[store].forEach((row) => tx.objectStore(store).delete(row.id)));
      } else if (mode === "calendar") {
        ["planInstances", "calendarDays", "operations"].forEach((store) => tx.objectStore(store).clear());
      }

      for (const store of prepared.allowed) prepared.records[store].forEach((row) => tx.objectStore(store).put(row));
      if (["replace", "merge", "settings"].includes(mode)) {
        if (mode === "replace" || mode === "settings") tx.objectStore("settings").clear();
        Object.entries(backup.data.settings || {}).forEach(([key, value]) => tx.objectStore("settings").put({ key, value, source: "import", updatedAt: now }));
      }
      tx.objectStore("meta").put({ key: "lastImportAt", value: now });
      tx.objectStore("meta").put({ key: "lastImportMode", value: mode });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    } finally { db.close(); }
    return { imported: Object.fromEntries(prepared.allowed.map((store) => [store, prepared.records[store].length])), remappedIds: prepared.idMap.size, safetyBackup, report };
  }

  async function rollbackLastImport() {
    const row = await dbApi.get("meta", "preImportRollback");
    if (!row?.value) throw new Error("Nessun backup preventivo disponibile per il rollback.");
    const result = await importBackup(row.value, "replace");
    await dbApi.put("meta", { key: "lastRollbackAt", value: new Date().toISOString() });
    return result;
  }

  async function parseFile(file) {
    if (!file) throw new Error("Seleziona un file JSON.");
    const text = await file.text();
    try { return JSON.parse(text); } catch { throw new Error("Il file non contiene JSON valido."); }
  }

  function filename(mode) {
    return `tatadiet-backup-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
  }

  return { FORMAT, SCHEMA_VERSION, APP_VERSION, canonical, sha256, createBackup, validateShape, verifyIntegrity, preview, importBackup, rollbackLastImport, parseFile, filename, collect, baseInfo };
});
