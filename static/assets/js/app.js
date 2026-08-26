(() => {
  "use strict";

  const normalize = (value) => String(value || "")
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const storageStart = () => {
    const query = new URLSearchParams(location.search).get("start");
    if (/^\d{4}-\d{2}-\d{2}$/.test(query || "")) return query;
    try { return localStorage.getItem("diet-plan:start-date:v2"); } catch { return null; }
  };

  document.querySelectorAll("[data-preserve-start]").forEach((link) => {
    const start = storageStart();
    if (!start) return;
    const url = new URL(link.href, location.href);
    url.searchParams.set("start", start);
    link.href = url.href;
  });

  document.querySelectorAll("[data-copy-url]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copyValue || window.location.href);
        const old = button.textContent;
        button.textContent = "Collegamento copiato";
        setTimeout(() => { button.textContent = old; }, 1800);
      } catch {
        window.prompt("Copia questo collegamento", button.dataset.copyValue || window.location.href);
      }
    });
  });

  document.querySelectorAll("[data-print]").forEach((button) => button.addEventListener("click", () => window.print()));

  const filterPanel = document.querySelector("[data-recipe-filters]");
  if (filterPanel) {
    const cards = [...document.querySelectorAll("[data-recipe-grid] .recipe-card")];
    const search = filterPanel.querySelector("[data-recipe-search]");
    const selects = [...filterPanel.querySelectorAll("select[data-filter]")];
    const checks = [...filterPanel.querySelectorAll('input[type="checkbox"][data-filter]')];
    const count = filterPanel.querySelector("[data-result-count]");
    const empty = document.querySelector("[data-empty-state]");
    const params = new URLSearchParams(location.search);
    if (params.get("q")) search.value = params.get("q");

    const apply = () => {
      const query = normalize(search.value);
      const selected = Object.fromEntries(selects.map((select) => [select.dataset.filter, normalize(select.value)]));
      const enabled = new Set(checks.filter((input) => input.checked).map((input) => input.dataset.filter));
      let visible = 0;
      cards.forEach((card) => {
        const textMatch = !query || normalize(card.dataset.search).includes(query);
        const mealMatch = !selected.meal || normalize(card.dataset.meals).includes(selected.meal);
        const cuisineMatch = !selected.cuisine || normalize(card.dataset.cuisines).includes(selected.cuisine);
        const timeMatch = !selected.time || Number(card.dataset.minPrep || 9999) <= Number(selected.time);
        const fridgeMatch = !selected.fridge || Number(card.dataset.fridge || 0) >= Number(selected.fridge);
        const aheadMatch = !enabled.has("ahead") || card.dataset.ahead === "yes";
        const coldMatch = !enabled.has("cold") || card.dataset.cold === "yes";
        const reheatMatch = !enabled.has("reheat") || card.dataset.reheat === "yes";
        const visibleCard = textMatch && mealMatch && cuisineMatch && timeMatch && fridgeMatch && aheadMatch && coldMatch && reheatMatch;
        card.hidden = !visibleCard;
        if (visibleCard) visible += 1;
      });
      count.textContent = String(visible);
      empty.hidden = visible !== 0;
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set("q", search.value.trim()); else url.searchParams.delete("q");
      history.replaceState({}, "", url);
    };

    search.addEventListener("input", apply);
    selects.forEach((select) => select.addEventListener("change", apply));
    checks.forEach((input) => input.addEventListener("change", apply));
    document.querySelector("[data-clear-recipe-filters]")?.addEventListener("click", () => {
      search.value = "";
      selects.forEach((select) => { select.value = ""; });
      checks.forEach((input) => { input.checked = false; });
      apply();
    });
    apply();
  }

  const shoppingList = document.querySelector("[data-shopping-list]");
  if (shoppingList) {
    const listKey = `diet-plan-shopping:${shoppingList.dataset.shoppingList}`;
    const checkboxes = [...shoppingList.querySelectorAll('input[type="checkbox"]')];
    const clearButton = document.querySelector("[data-clear-shopping]");
    const progress = document.querySelector("[data-shopping-progress]");
    const progressBar = progress?.querySelector("span");
    const progressText = progress?.querySelector("strong");

    let checked = new Set();
    try { checked = new Set(JSON.parse(localStorage.getItem(listKey) || "[]")); } catch { checked = new Set(); }

    const updateProgress = () => {
      const done = checkboxes.filter((box) => box.checked).length;
      const percent = checkboxes.length ? (done / checkboxes.length) * 100 : 0;
      if (progressBar) progressBar.style.setProperty("--progress", `${percent}%`);
      if (progressText) progressText.textContent = `${done} / ${checkboxes.length}`;
    };

    checkboxes.forEach((box) => {
      box.checked = checked.has(box.value);
      box.addEventListener("change", () => {
        if (box.checked) checked.add(box.value); else checked.delete(box.value);
        localStorage.setItem(listKey, JSON.stringify([...checked]));
        updateProgress();
      });
    });

    clearButton?.addEventListener("click", () => {
      checkboxes.forEach((box) => { box.checked = false; });
      checked.clear();
      localStorage.removeItem(listKey);
      updateProgress();
    });

    const listText = () => [...shoppingList.querySelectorAll(".shopping-category")].flatMap((section) => {
      const rows = [section.querySelector("h2")?.childNodes[0]?.textContent?.trim().toUpperCase() || "SPESA"];
      section.querySelectorAll(".shopping-item").forEach((item) => {
        const name = item.querySelector(".shopping-name strong")?.textContent?.trim();
        const quantity = item.querySelector(".shopping-quantity strong")?.textContent?.trim();
        if (name) rows.push(`- ${name}: ${quantity || ""}`);
      });
      rows.push("");
      return rows;
    }).join("\n");

    document.querySelector("[data-copy-shopping-text]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(listText());
        const old = button.textContent;
        button.textContent = "Lista copiata";
        setTimeout(() => { button.textContent = old; }, 1800);
      } catch { window.prompt("Copia la lista", listText()); }
    });

    updateProgress();
  }
})();


// V5 Phase 2: initialize local-first persistence in background on every page.
if (window.TataDietDB && window.DietSiteState) {
  window.TataDietDB.initialize({ fetchJson: (path) => window.DietSiteState.fetchJson(path) })
    .catch((error) => console.warn("TataDiet V5 local persistence unavailable", error));
}
