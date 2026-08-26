(() => {
  "use strict";

  if (document.body.dataset.page !== "shopping-range") return;
  const core = window.DietCalendarCore;
  const ops = window.DietOperationsCore;
  const state = window.DietSiteState;
  if (!core || !ops || !state) return;

  const esc = state.escapeHtml;
  const show = state.show;
  const categorySlug = (value) => state.normalize(value).replaceAll(" ", "-");

  const formatListText = (result) => {
    const lines = [
      `Lista della spesa dal ${core.formatMedium(result.start)} al ${core.formatMedium(result.end)}`,
      result.effective ? `${result.day_count} giorni civili · ${result.meal_count} pasti effettivi` : `${result.day_count} giorni-matrice · giorni ${result.first_global_day}-${result.last_global_day}`,
      "",
    ];
    let category = null;
    result.items.forEach((item) => {
      if (item.category !== category) {
        category = item.category;
        lines.push(category.toUpperCase());
      }
      lines.push(`- ${item.name}: ${ops.formatQuantity(item.suggested)} ${item.unit} (necessari ${ops.formatQuantity(item.exact)} ${item.unit})`);
    });
    return lines.join("\n");
  };

  const renderItems = (result, key) => {
    const host = document.querySelector("[data-range-shopping-results]");
    if (!host) return;
    const groups = ops.groupBy(result.items, "category");
    if (!result.items.length) {
      host.innerHTML = `<section class="empty-state-card"><h2>Nessun ingrediente</h2><p>L'intervallo selezionato non contiene giorni del piano.</p></section>`;
      return;
    }
    host.innerHTML = Object.entries(groups).map(([category, items]) => `
      <section class="shopping-category range-category" data-category="${esc(categorySlug(category))}">
        <h2>${esc(category)} <span>${items.length}</span></h2>
        <div class="shopping-items">
          ${items.map((item) => `
            <label class="shopping-item range-shopping-item">
              <input type="checkbox" value="${esc(item.code)}">
              <span class="checkmark" aria-hidden="true"></span>
              <span class="shopping-name">
                <strong>${esc(item.name)}</strong>
                <small>${esc(item.note)} · usato in ${item.global_days.length} giorni</small>
              </span>
              <span class="shopping-quantity">
                <strong>${esc(ops.formatQuantity(item.suggested))} ${esc(item.unit)}</strong>
                <small>necessari ${esc(ops.formatQuantity(item.exact))} ${esc(item.unit)} · passo ${esc(ops.formatQuantity(item.rounding_step))}</small>
              </span>
            </label>`).join("")}
        </div>
      </section>`).join("");

    let checked = new Set();
    try { checked = new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { checked = new Set(); }
    const boxes = [...host.querySelectorAll('input[type="checkbox"]')];
    const update = () => {
      const done = boxes.filter((box) => box.checked).length;
      const progress = document.querySelector("[data-range-shopping-progress]");
      progress?.style.setProperty("--progress", `${boxes.length ? (done / boxes.length) * 100 : 0}%`);
      const text = progress?.querySelector("strong");
      if (text) text.textContent = `${done} / ${boxes.length}`;
    };
    boxes.forEach((box) => {
      box.checked = checked.has(box.value);
      box.addEventListener("change", () => {
        if (box.checked) checked.add(box.value); else checked.delete(box.value);
        localStorage.setItem(key, JSON.stringify([...checked]));
        update();
      });
    });
    document.querySelector("[data-clear-range-shopping]")?.addEventListener("click", () => {
      boxes.forEach((box) => { box.checked = false; });
      checked.clear();
      localStorage.removeItem(key);
      update();
    });
    update();
  };

  const init = async () => {
    const startState = state.resolveStart();
    const setup = document.querySelector("[data-plan-setup]");
    const app = document.querySelector("[data-range-shopping-app]");
    show(document.querySelector("[data-plan-loading]"), false);
    if (!startState.value) {
      show(setup, true);
      show(app, false);
      return;
    }
    show(setup, false);
    show(app, true);

    try {
      const [calendar, dataset] = await Promise.all([
        state.fetchJson("data/calendar.json"),
        state.fetchJson("data/shopping-range.json"),
      ]);
      const start = startState.value;
      const effectiveContext = await globalThis.TataDietEffectiveStore?.context?.(start).catch(() => null);
      const range = effectiveContext ? { start: effectiveContext.days[0].date, end: effectiveContext.days.at(-1).date } : core.planRange(start, calendar.duration_days || 180);
      const params = new URLSearchParams(location.search);
      const today = core.clampDate(core.todayISO(), range.start, range.end);
      let from = core.isValidISO(params.get("from")) ? params.get("from") : today;
      let to = core.isValidISO(params.get("to")) ? params.get("to") : core.minDate(core.addDays(from, 6), range.end);
      from = core.clampDate(from, range.start, range.end);
      to = core.clampDate(to, range.start, range.end);
      if (core.compareDates(from, to) > 0) [from, to] = [to, from];

      document.querySelectorAll("[data-active-range]").forEach((element) => {
        element.textContent = `${core.formatMedium(range.start)} – ${core.formatMedium(range.end)}`;
      });
      const fromInput = document.querySelector("[data-shopping-from]");
      const toInput = document.querySelector("[data-shopping-to]");
      [fromInput, toInput].forEach((input) => {
        input.min = range.start;
        input.max = range.end;
      });
      fromInput.value = from;
      toInput.value = to;

      const submitRange = (nextFrom, nextTo) => {
        const url = state.stateUrl("spesa/intervallo/index.html", start, { from: nextFrom, to: nextTo });
        location.assign(url.href);
      };
      document.querySelector("[data-range-shopping-form]")?.addEventListener("submit", (event) => {
        event.preventDefault();
        submitRange(fromInput.value, toInput.value);
      });
      document.querySelectorAll("[data-shopping-quick]").forEach((button) => {
        button.addEventListener("click", () => {
          const mode = button.dataset.shoppingQuick;
          const currentIndex = core.diffDays(start, from);
          if (mode === "5") submitRange(from, core.minDate(core.addDays(from, 4), range.end));
          if (mode === "7") submitRange(from, core.minDate(core.addDays(from, 6), range.end));
          if (mode === "variant") {
            const base = Math.floor(currentIndex / 5) * 5;
            submitRange(core.addDays(start, base), core.addDays(start, Math.min(base + 4, core.diffDays(start, range.end))));
          }
          if (mode === "cycle") {
            const base = Math.floor(currentIndex / 30) * 30;
            submitRange(core.addDays(start, base), core.addDays(start, Math.min(base + 29, core.diffDays(start, range.end))));
          }
        });
      });

      let result;
      if (effectiveContext && globalThis.TataDietEffectiveCore) {
        const eff = globalThis.TataDietEffectiveCore.aggregateShopping(effectiveContext.days, effectiveContext.maps, from, to, dataset.rules || {});
        result = { effective: true, start: eff.start, end: eff.end, day_count: eff.dayCount, meal_count: eff.mealCount, unresolved_meals: eff.unresolvedMeals, first_global_day: "—", last_global_day: "—",
          items: eff.items.map((item) => ({ code: item.code, name: item.name, category: item.category, unit: item.unit, exact: item.exact, suggested: item.suggested, rounding_step: item.roundingStep, note: item.note, global_days: item.dates })) };
      } else result = ops.aggregateIngredients(dataset, start, from, to);
      const summary = document.querySelector("[data-range-shopping-summary]");
      if (summary) summary.innerHTML = result.effective ? `
        <div><strong>${result.day_count}</strong><span>giorni civili</span></div>
        <div><strong>${result.items.length}</strong><span>prodotti distinti</span></div>
        <div><strong>${result.meal_count}</strong><span>pasti effettivi</span></div>
        <div><strong>${result.unresolved_meals}</strong><span>pasti senza ingredienti</span></div>` : `
        <div><strong>${result.day_count}</strong><span>giorni-matrice</span></div>
        <div><strong>${result.items.length}</strong><span>prodotti distinti</span></div>
        <div><strong>${result.first_global_day}-${result.last_global_day}</strong><span>giorni del piano</span></div>
        <div><strong>${new Set(result.items.map((item) => item.category)).size}</strong><span>reparti</span></div>`;
      const label = document.querySelector("[data-range-shopping-label]");
      if (label) label.textContent = `${core.formatLong(result.start)} – ${core.formatLong(result.end)}`;
      const key = `diet-plan-shopping-range:${start}:${result.start}:${result.end}`;
      renderItems(result, key);

      const text = formatListText(result);
      document.querySelector("[data-copy-range-shopping]")?.addEventListener("click", (event) => state.copyText(text, event.currentTarget, "Lista copiata"));
      document.querySelector("[data-print-range-shopping]")?.addEventListener("click", () => window.print());
      document.querySelector("[data-download-range-shopping]")?.addEventListener("click", () => {
        state.downloadBlob(text, `spesa-${result.start}-${result.end}.txt`);
      });
    } catch (error) {
      const host = document.querySelector("[data-range-shopping-results]");
      if (host) host.innerHTML = `<section class="notice-card error-card"><h2>Impossibile calcolare la spesa</h2><p>${esc(error.message)}</p></section>`;
    }
  };

  init();
})();
