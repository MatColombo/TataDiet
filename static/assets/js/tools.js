(() => {
  "use strict";

  if (document.body.dataset.page !== "tools") return;
  const core = window.DietCalendarCore;
  const ops = window.DietOperationsCore;
  const state = window.DietSiteState;
  if (!core || !ops || !state) return;

  const esc = state.escapeHtml;
  const show = state.show;
  const startState = state.resolveStart();

  const setStatus = (message, tone = "ok") => {
    const host = document.querySelector("[data-tools-status]");
    if (!host) return;
    host.className = `tool-status ${tone}`;
    host.textContent = message;
    show(host, true);
  };

  const preferences = () => ({
    schema: "diet-plan-preferences",
    version: 1,
    site_version: document.body.dataset.version,
    exported_at: new Date().toISOString(),
    items: state.allowedStorageItems(),
  });

  const exportPreferences = () => {
    const payload = JSON.stringify(preferences(), null, 2);
    state.downloadBlob(payload, `piano-alimentare-preferenze-${core.todayISO()}.json`, "application/json;charset=utf-8");
    setStatus("Preferenze esportate. Il file contiene soltanto configurazione locale e spunte.");
  };

  const importPreferences = async (file) => {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error("Il file non contiene JSON valido.");
    }
    if (data?.schema !== "diet-plan-preferences" || typeof data.items !== "object" || Array.isArray(data.items)) {
      throw new Error("Il file non è un backup compatibile del piano alimentare.");
    }
    const entries = Object.entries(data.items).filter(([key, value]) => key.startsWith(state.PREFIX) && typeof value === "string");
    if (!entries.length) throw new Error("Il backup non contiene preferenze compatibili.");
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
    setStatus(`${entries.length} preferenze importate. Ricarica la pagina per applicarle.`);
  };

  const resetPreferences = () => {
    const keys = Object.keys(state.allowedStorageItems());
    if (!keys.length) {
      setStatus("Non ci sono dati locali da rimuovere.", "neutral");
      return;
    }
    if (!window.confirm(`Rimuovere ${keys.length} elementi locali, inclusa la data iniziale e le spunte della spesa?`)) return;
    keys.forEach((key) => localStorage.removeItem(key));
    setStatus("Dati locali rimossi. Il piano statico non è stato modificato.");
  };

  const initCalendarTools = async () => {
    const setup = document.querySelector("[data-plan-setup]");
    const app = document.querySelector("[data-ics-app]");
    if (!startState.value) {
      show(setup, true);
      show(app, false);
      return;
    }
    show(setup, false);
    show(app, true);
    const calendar = await state.fetchJson("data/calendar.json");
    const start = startState.value;
    const effectiveContext = await globalThis.TataDietEffectiveStore?.context?.(start).catch(() => null);
    const range = effectiveContext ? { start: effectiveContext.days[0].date, end: effectiveContext.days.at(-1).date } : core.planRange(start, calendar.duration_days || 180);
    document.querySelectorAll("[data-active-range]").forEach((element) => {
      element.textContent = `${core.formatMedium(range.start)} – ${core.formatMedium(range.end)}`;
    });

    const from = document.querySelector("[data-ics-from]");
    const to = document.querySelector("[data-ics-to]");
    [from, to].forEach((input) => {
      input.min = range.start;
      input.max = range.end;
    });
    from.value = range.start;
    to.value = range.end;

    document.querySelector("[data-ics-scope]")?.addEventListener("change", (event) => {
      const custom = event.target.value === "custom";
      document.querySelector("[data-ics-custom]").hidden = !custom;
    });

    document.querySelector("[data-export-ics]")?.addEventListener("click", async () => {
      const scope = document.querySelector("[data-ics-scope]")?.value || "all";
      const first = scope === "custom" ? from.value : range.start;
      const last = scope === "custom" ? to.value : range.end;
      if (!core.isValidISO(first) || !core.isValidISO(last)) {
        setStatus("Seleziona un intervallo valido.", "error");
        return;
      }
      const includePrep = Boolean(document.querySelector("[data-ics-prep]")?.checked);
      const content = effectiveContext && globalThis.TataDietEffectiveCore
        ? globalThis.TataDietEffectiveCore.buildIcs(effectiveContext.plan, effectiveContext.days, effectiveContext.maps, first, last, includePrep)
        : ops.buildIcs(calendar.days, start, first, last, includePrep);
      state.downloadBlob(content, `piano-turni-${first}-${last}.ics`, "text/calendar;charset=utf-8");
      setStatus(`Calendario ${effectiveContext ? "effettivo " : ""}esportato dal ${core.formatMedium(first)} al ${core.formatMedium(last)}${includePrep ? " con promemoria meal-prep" : ""}.`);
    });
  };

  const init = async () => {
    show(document.querySelector("[data-plan-loading]"), false);
    document.querySelector("[data-export-preferences]")?.addEventListener("click", exportPreferences);
    document.querySelector("[data-import-preferences]")?.addEventListener("change", async (event) => {
      try { await importPreferences(event.target.files?.[0]); }
      catch (error) { setStatus(error.message, "error"); }
      event.target.value = "";
    });
    document.querySelector("[data-reset-preferences]")?.addEventListener("click", resetPreferences);
    const count = document.querySelector("[data-local-count]");
    if (count) count.textContent = String(Object.keys(state.allowedStorageItems()).length);
    try {
      await initCalendarTools();
    } catch (error) {
      setStatus(`Impossibile preparare l'esportazione ICS: ${error.message}`, "error");
    }
  };

  init();
})();
