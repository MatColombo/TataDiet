(() => {
  "use strict";

  if (document.body.dataset.page !== "search") return;
  const ops = window.DietOperationsCore;
  const state = window.DietSiteState;
  if (!ops || !state) return;

  const esc = state.escapeHtml;
  const typeOrder = ["recipe", "ingredient", "day", "variant", "cycle"];
  const labels = { recipe: "Ricette", ingredient: "Ingredienti", day: "Giorni", variant: "Varianti", cycle: "Cicli" };

  const internalHref = (entry, start) => {
    const url = new URL(`${state.root()}${entry.href}`, location.href);
    if (start) url.searchParams.set("start", start);
    return url.href;
  };

  const init = async () => {
    const input = document.querySelector("[data-global-search]");
    const host = document.querySelector("[data-global-results]");
    const count = document.querySelector("[data-global-count]");
    const chips = [...document.querySelectorAll("[data-search-type]")];
    const loading = document.querySelector("[data-search-loading]");
    const start = state.resolveStart().value;
    if (!input || !host) return;

    try {
      const data = await state.fetchJson("data/search-index.json");
      const effectiveContext = await globalThis.TataDietEffectiveStore?.context?.(start).catch(() => null);
      if (effectiveContext && globalThis.TataDietEffectiveCore) {
        const extra = globalThis.TataDietEffectiveCore.personalSearchEntries(effectiveContext, effectiveContext.maps, start);
        data.entries = [...data.entries, ...extra];
      }
      state.show(loading, false);
      const params = new URLSearchParams(location.search);
      input.value = params.get("q") || "";
      const requestedTypes = (params.get("type") || "").split(",").filter((type) => typeOrder.includes(type));
      if (requestedTypes.length) chips.forEach((chip) => { chip.checked = requestedTypes.includes(chip.value); });

      const render = () => {
        const activeTypes = chips.filter((chip) => chip.checked).map((chip) => chip.value);
        const allResults = ops.search(data.entries, input.value, activeTypes);
        const results = allResults.slice(0, 40);
        if (count) count.textContent = allResults.length > results.length ? `${results.length} di ${allResults.length}` : String(results.length);
        const url = new URL(location.href);
        if (input.value.trim()) url.searchParams.set("q", input.value.trim()); else url.searchParams.delete("q");
        if (activeTypes.length && activeTypes.length < typeOrder.length) url.searchParams.set("type", activeTypes.join(",")); else url.searchParams.delete("type");
        history.replaceState({}, "", url);

        if (!input.value.trim()) {
          host.innerHTML = `
            <section class="search-welcome">
              <h2>Cerca in tutto il piano</h2>
              <p>Puoi usare nomi di alimenti, ricette, turni, mesi, numeri di giorno o cucine.</p>
              <div class="search-suggestions">
                ${["mozzarella", "N notte", "pasto freddo", "giorno 30", "couscous", "Ottobre variante 3"].map((term) => `<button type="button" data-search-suggestion="${esc(term)}">${esc(term)}</button>`).join("")}
              </div>
            </section>`;
          host.querySelectorAll("[data-search-suggestion]").forEach((button) => {
            button.addEventListener("click", () => {
              input.value = button.dataset.searchSuggestion;
              input.dispatchEvent(new Event("input"));
              input.focus();
            });
          });
          return;
        }
        if (!results.length) {
          host.innerHTML = `<section class="empty-state-card"><h2>Nessun risultato</h2><p>Prova con un termine più breve oppure riattiva tutte le categorie.</p></section>`;
          return;
        }
        const grouped = ops.groupBy(results, "type");
        host.innerHTML = `${allResults.length > results.length ? `<div class="search-limit-note">Sono mostrati i 40 risultati più pertinenti su ${allResults.length}. Restringi la ricerca per affinare l'elenco.</div>` : ""}` + typeOrder.filter((type) => grouped[type]?.length).map((type) => `
          <section class="search-result-group">
            <header><h2>${labels[type]}</h2><span>${grouped[type].length}</span></header>
            <div class="search-result-list">
              ${grouped[type].map((entry) => `
                <a class="search-result-card type-${esc(entry.type)}" href="${esc(internalHref(entry, start))}">
                  <span class="search-type-label">${esc(entry.type_label)}</span>
                  <div><h3>${esc(entry.title)}</h3><p>${esc(entry.subtitle)}</p></div>
                  <div class="search-result-badges">${(entry.badges || []).map((badge) => `<span>${esc(badge)}</span>`).join("")}</div>
                  <span class="search-open">Apri →</span>
                </a>`).join("")}
            </div>
          </section>`).join("");
      };

      let timer;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(render, 80);
      });
      chips.forEach((chip) => chip.addEventListener("change", render));
      document.querySelector("[data-search-all]")?.addEventListener("click", () => {
        chips.forEach((chip) => { chip.checked = true; });
        render();
      });
      render();
      if (input.value) input.focus({ preventScroll: true });
    } catch (error) {
      state.show(loading, false);
      host.innerHTML = `<section class="notice-card error-card"><h2>Indice di ricerca non disponibile</h2><p>${esc(error.message)}</p></section>`;
    }
  };

  init();
})();
