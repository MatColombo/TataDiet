(() => {
  "use strict";

  const page = document.body.dataset.page || "";
  if (!new Set(["prep", "today"]).has(page)) return;

  const core = window.DietCalendarCore;
  const ops = window.DietOperationsCore;
  const state = window.DietSiteState;
  if (!core || !ops || !state) return;

  const esc = state.escapeHtml;
  const show = state.show;

  const mealHref = (event, start) => {
    if (event.meal_href) return state.stateUrl(event.meal_href, start).href;
    const url = state.stateUrl(event.source_day.path, start, { focus: event.actual_date });
    if (event.anchor) url.hash = event.anchor;
    return url.href;
  };
  const recipeHref = (event, start) => state.stateUrl(event.recipe_href || `ricette/${event.recipe_slug}/index.html`, start).href;

  function windowBounds(date, time, hours = 48) {
    const [hour, minute] = time.split(":").map(Number);
    const startMinute = hour * 60 + minute;
    const absoluteEnd = startMinute + hours * 60;
    return {
      startDate: date,
      startTime: time,
      endDate: core.addDays(date, Math.floor(absoluteEnd / 1440)),
      endTime: `${String(Math.floor((absoluteEnd % 1440) / 60)).padStart(2, "0")}:${String(absoluteEnd % 60).padStart(2, "0")}`,
    };
  }

  const formatTimeWindow = (date, time) => {
    const bounds = windowBounds(date, time, 48);
    return `${core.formatLong(bounds.startDate)} alle ${bounds.startTime} – ${core.formatLong(bounds.endDate)} alle ${bounds.endTime}`;
  };

  const untilLabel = (hours) => {
    if (hours < 1) return "entro un'ora";
    if (Math.abs(hours - Math.round(hours)) < 0.05) return `tra ${Math.round(hours)} ore`;
    return `tra ${Math.ceil(hours)} ore`;
  };

  const adaptEffectivePrep = (item, start) => ({
    actual_date: item.actualDate, time: item.time, hours_until: item.hoursUntil, window_segment: item.windowSegment,
    window_label: item.windowSegment === "first" ? "0–24 ore" : "24–48 ore", urgency: item.urgency,
    source_day: { d_code: item.day.dayType, cycle: null, variant: null }, meal_type: item.mealType, title: item.title,
    prepare_ahead: "Preparabile in anticipo", prep_minutes: item.prepMinutes, prep_date: item.prepDate,
    cold: item.mealPrep?.coldSuitable ? "Sì" : "No", fridge: item.mealPrep?.fridgeHours ? `${item.mealPrep.fridgeHours} ore` : (item.mealPrep?.notes || "non indicato"),
    recipe_href: item.href, meal_href: `calendario/componi/index.html?focus=${encodeURIComponent(item.sourceDate)}`
  });

  const taskCard = (item, start) => `
    <article class="prep-task ${esc(item.urgency)}">
      <div class="prep-task-time">
        <time datetime="${esc(item.actual_date)}T${esc(item.time)}"><span>${esc(core.formatShort(item.actual_date))}</span><strong>${esc(item.time)}</strong></time>
        <span>${esc(untilLabel(item.hours_until))}</span>
      </div>
      <div class="prep-task-main">
        <div class="prep-task-topline"><span>${item.source_day.cycle ? `${esc(item.source_day.d_code)} · C${item.source_day.cycle} · V${item.source_day.variant}` : `Piano personale · ${esc(item.source_day.d_code)}`}</span><span>${esc(item.meal_type)}</span></div>
        <h3><a href="${esc(mealHref(item, start))}">${esc(item.title)}</a></h3>
        <p>${esc(item.prepare_ahead)}</p>
        <div class="prep-meta">
          <span>${item.prep_minutes} min</span>
          <span>Da organizzare: ${esc(core.formatShort(item.prep_date))}</span>
          <span>Freddo: ${esc(item.cold || "non indicato")}</span>
          <span>Frigo: ${esc(item.fridge || "non indicato")}</span>
        </div>
      </div>
      <a class="button compact secondary" href="${esc(recipeHref(item, start))}">Ricetta</a>
    </article>`;

  function consumptionGroups(tasks, start) {
    const groups = ops.groupBy(tasks, "actual_date");
    return Object.entries(groups)
      .sort((a, b) => core.compareDates(a[0], b[0]))
      .map(([date, items]) => `
        <div class="prep-consumption-day">
          <div class="prep-consumption-heading"><span>Da consumare</span><strong>${esc(core.formatLong(date))}</strong></div>
          <div class="prep-task-list">${items.map((item) => taskCard(item, start)).join("")}</div>
        </div>`).join("");
  }

  function bucketSection(segment, items, start, bounds) {
    const first = segment === "first";
    const title = first ? "Prime 24 ore" : "Tra 24 e 48 ore";
    const subtitle = first
      ? `Da ${bounds.startTime} di ${core.formatMedium(bounds.startDate)} fino alla stessa ora del giorno successivo.`
      : `Dalla seconda giornata fino a ${bounds.endTime} di ${core.formatMedium(bounds.endDate)}.`;
    return `
      <section class="prep-window-section ${segment}" data-prep-segment="${segment}">
        <header>
          <div class="prep-window-number">${first ? "01" : "02"}</div>
          <div><p class="eyebrow">${first ? "0–24 ore" : "24–48 ore"}</p><h2>${title}</h2><p>${esc(subtitle)}</p></div>
          <span class="prep-window-count">${items.length} ${items.length === 1 ? "attività" : "attività"}</span>
        </header>
        ${items.length
          ? `<div class="prep-segment-content">${consumptionGroups(items, start)}</div>`
          : `<div class="prep-segment-empty"><span aria-hidden="true">✓</span><div><strong>Nessuna preparazione anticipata in questo blocco</strong><p>La finestra è stata comunque analizzata per intero. I pasti presenti sono da preparare al momento oppure non richiedono attività preventiva.</p></div></div>`}
      </section>`;
  }

  const renderPrepPage = async (calendar, start) => {
    const app = document.querySelector("[data-prep-app]");
    const setup = document.querySelector("[data-plan-setup]");
    const loading = document.querySelector("[data-plan-loading]");
    show(loading, false);
    if (!app) return;
    if (!start) {
      show(setup, true);
      show(app, false);
      return;
    }
    show(setup, false);
    show(app, true);

    const effectiveContext = await globalThis.TataDietEffectiveStore?.context?.(start).catch(() => null);
    const range = effectiveContext ? { start: effectiveContext.days[0].date, end: effectiveContext.days.at(-1).date } : core.planRange(start, calendar.duration_days || 180);
    const params = new URLSearchParams(location.search);
    const today = core.todayISO();
    const requestedDate = core.isValidISO(params.get("date")) ? params.get("date") : core.clampDate(today, range.start, range.end);
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(params.get("time") || "");
    const now = new Date();
    const requestedTime = timeMatch ? params.get("time") : (requestedDate === today ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "08:00");
    const date = core.clampDate(requestedDate, range.start, range.end);
    const minute = Number(requestedTime.slice(0, 2)) * 60 + Number(requestedTime.slice(3, 5));
    const bounds = windowBounds(date, requestedTime, 48);

    document.querySelectorAll("[data-active-range]").forEach((element) => {
      element.textContent = `${core.formatMedium(range.start)} – ${core.formatMedium(range.end)}`;
    });
    const windowLabel = document.querySelector("[data-prep-window]");
    if (windowLabel) windowLabel.textContent = formatTimeWindow(date, requestedTime);

    const dateInput = document.querySelector("[data-prep-date]");
    const timeInput = document.querySelector("[data-prep-time]");
    if (dateInput) {
      dateInput.min = range.start;
      dateInput.max = range.end;
      dateInput.value = date;
    }
    if (timeInput) timeInput.value = requestedTime;

    document.querySelector("[data-prep-reference-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const url = new URL(location.href);
      url.searchParams.set("start", start);
      url.searchParams.set("date", dateInput.value);
      url.searchParams.set("time", timeInput.value);
      location.assign(url.href);
    });
    document.querySelector("[data-prep-now]")?.addEventListener("click", () => {
      const url = state.stateUrl("preparazioni/index.html", start, { date: today });
      url.searchParams.set("time", `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      location.assign(url.href);
    });
    document.querySelector("[data-prep-print]")?.addEventListener("click", () => window.print());

    const effectiveCore = globalThis.TataDietEffectiveCore;
    const allEvents = effectiveContext && effectiveCore ? effectiveCore.eventsBetween(effectiveContext.days, effectiveContext.maps, date, minute, 48) : ops.eventsInWindow(calendar.days, start, date, minute, 48);
    const items = effectiveContext && effectiveCore ? effectiveCore.prepItems(effectiveContext.days, effectiveContext.maps, date, minute, 48).map((item) => adaptEffectivePrep(item, start)) : ops.prepItemsInWindow(calendar.days, start, date, minute, 48);
    const firstItems = items.filter((item) => item.window_segment === "first");
    const secondItems = items.filter((item) => item.window_segment === "second");
    const summary = document.querySelector("[data-prep-summary]");
    const host = document.querySelector("[data-prep-results]");

    if (summary) summary.innerHTML = `
      <div><strong>${allEvents.length}</strong><span>pasti nel periodo</span></div>
      <div><strong>${items.length}</strong><span>preparazioni utili</span></div>
      <div><strong>${firstItems.length}</strong><span>nelle prime 24 h</span></div>
      <div><strong>${secondItems.length}</strong><span>tra 24 e 48 h</span></div>`;

    if (host) {
      host.innerHTML = [
        bucketSection("first", firstItems, start, bounds),
        bucketSection("second", secondItems, start, bounds),
      ].join("");
    }

    const text = [
      "Preparazioni per le prossime 48 ore",
      formatTimeWindow(date, requestedTime),
      "",
      "PRIME 24 ORE",
      ...(firstItems.length ? firstItems.map((item) => `- ${core.formatMedium(item.actual_date)} ${item.time}: ${item.title} — ${item.prepare_ahead}`) : ["- Nessuna preparazione anticipata"]),
      "",
      "TRA 24 E 48 ORE",
      ...(secondItems.length ? secondItems.map((item) => `- ${core.formatMedium(item.actual_date)} ${item.time}: ${item.title} — ${item.prepare_ahead}`) : ["- Nessuna preparazione anticipata"]),
    ].join("\n");
    document.querySelector("[data-copy-prep]")?.addEventListener("click", (event) => state.copyText(text, event.currentTarget, "Piano copiato"));
  };

  const renderTodayPreview = async (calendar, start) => {
    const host = document.querySelector("[data-today-prep-preview]");
    if (!host || !start) return;
    const today = core.todayISO();
    const effectiveContext = await globalThis.TataDietEffectiveStore?.context?.(start).catch(() => null);
    const range = effectiveContext ? { start: effectiveContext.days[0].date, end: effectiveContext.days.at(-1).date } : core.planRange(start, calendar.duration_days || 180);
    if (core.compareDates(today, range.start) < 0 || core.compareDates(today, range.end) > 0) return;
    const now = new Date();
    const effectiveCore = globalThis.TataDietEffectiveCore;
    const items = effectiveContext && effectiveCore ? effectiveCore.prepItems(effectiveContext.days, effectiveContext.maps, today, now.getHours() * 60 + now.getMinutes(), 48).map((item) => adaptEffectivePrep(item, start)) : ops.prepItemsInWindow(calendar.days, start, today, now.getHours() * 60 + now.getMinutes(), 48);
    const first = items.filter((item) => item.window_segment === "first");
    const second = items.filter((item) => item.window_segment === "second");
    show(host, true);
    host.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Operatività</p><h2>Preparazioni nelle prossime 48 ore</h2><p class="section-intro">${first.length} nelle prime 24 ore · ${second.length} tra 24 e 48 ore</p></div>
        <a class="text-link" href="${esc(state.stateUrl("preparazioni/index.html", start).href)}">Apri il piano completo →</a>
      </div>
      ${items.length ? `<div class="prep-preview-grid">${items.slice(0, 4).map((item) => `
        <a href="${esc(mealHref(item, start))}" class="prep-preview-card ${item.window_segment}">
          <span>${esc(item.window_label)} · ${esc(core.formatShort(item.actual_date))} · ${esc(item.time)}</span>
          <strong>${esc(item.title)}</strong>
          <small>${esc(item.prepare_ahead)}</small>
        </a>`).join("")}</div>` : `<div class="notice-card"><strong>Nessuna attività anticipata immediata.</strong><span>I pasti delle prossime 48 ore non richiedono preparazione preventiva.</span></div>`}`;
  };

  const init = async () => {
    const start = state.resolveStart().value;
    try {
      const calendar = await state.fetchJson("data/calendar.json");
      if (page === "prep") await renderPrepPage(calendar, start);
      if (page === "today") await renderTodayPreview(calendar, start);
    } catch (error) {
      const host = document.querySelector("[data-prep-results], [data-today-prep-preview]");
      if (host) {
        show(host, true);
        host.innerHTML = `<section class="notice-card error-card"><h2>Dati non disponibili</h2><p>${esc(error.message)}</p></section>`;
      }
    }
  };

  init();
})();
