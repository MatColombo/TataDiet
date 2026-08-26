(function (global, factory) {
  const api = factory(global.DietCalendarCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  global.DietSiteState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  const STORAGE_KEY = "diet-plan:start-date:v2";
  const PREFIX = "diet-plan";

  function root() {
    return (typeof document !== "undefined" && document.body?.dataset.root) || "";
  }

  function getStoredStart(storage) {
    try {
      const source = storage || localStorage;
      const value = source.getItem(STORAGE_KEY);
      return core && core.isValidISO(value) ? value : null;
    } catch {
      return null;
    }
  }

  function storeStart(value, storage) {
    if (!core || !core.isValidISO(value)) return false;
    try {
      (storage || localStorage).setItem(STORAGE_KEY, value);
      if (globalThis.TataDietDB?.setSetting) globalThis.TataDietDB.setSetting("planStartDate", value, "v4-bridge").catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function clearStart(storage) {
    try { (storage || localStorage).removeItem(STORAGE_KEY); } catch { /* ignore */ }
    if (globalThis.TataDietDB?.setSetting) globalThis.TataDietDB.setSetting("planStartDate", null, "v4-bridge").catch(() => {});
  }

  function resolveStart(search, storage) {
    const params = new URLSearchParams(search ?? (typeof location !== "undefined" ? location.search : ""));
    const query = params.get("start");
    if (query && core?.isValidISO(query)) {
      storeStart(query, storage);
      return { value: query, source: "url", invalidQuery: false };
    }
    const stored = getStoredStart(storage);
    return { value: stored, source: stored ? "storage" : null, invalidQuery: Boolean(query) };
  }

  function stateUrl(path, start, extra, base) {
    const baseUrl = base || (typeof location !== "undefined" ? location.href : "https://example.invalid/");
    const url = new URL(`${root()}${path}`, baseUrl);
    if (start) url.searchParams.set("start", start);
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    });
    return url;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value || "")
      .toLocaleLowerCase("it")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function show(element, visible = true) {
    if (element) element.hidden = !visible;
  }

  async function copyText(value, button, successLabel = "Copiato") {
    const original = button?.textContent || "";
    try {
      await navigator.clipboard.writeText(value);
      if (button) button.textContent = successLabel;
    } catch {
      if (typeof window !== "undefined") window.prompt("Copia il contenuto", value);
      if (button) button.textContent = "Pronto da copiare";
    }
    if (button) setTimeout(() => { button.textContent = original; }, 1800);
  }

  function downloadBlob(content, filename, type = "text/plain;charset=utf-8") {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function fetchJson(path) {
    const response = await fetch(new URL(`${root()}${path}`, window.location.href));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function allowedStorageItems(storage) {
    const source = storage || localStorage;
    const items = {};
    try {
      for (let index = 0; index < source.length; index += 1) {
        const key = source.key(index);
        if (key && key.startsWith(PREFIX)) items[key] = source.getItem(key);
      }
    } catch { /* ignore */ }
    return items;
  }

  return {
    STORAGE_KEY,
    PREFIX,
    root,
    getStoredStart,
    storeStart,
    clearStart,
    resolveStart,
    stateUrl,
    escapeHtml,
    normalize,
    show,
    copyText,
    downloadBlob,
    fetchJson,
    allowedStorageItems,
  };
});
