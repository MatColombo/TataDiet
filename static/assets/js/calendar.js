(() => {
  "use strict";

  const core = window.DietCalendarCore;
  if (!core) return;

  const body = document.body;
  const root = body.dataset.root || "";
  const page = body.dataset.page || "";
  const STORAGE_KEY = "diet-plan:start-date:v2";
  const DAYS_IN_PLAN = 180;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const getStoredStart = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return core.isValidISO(value) ? value : null;
    } catch {
      return null;
    }
  };

  const storeStart = (value) => {
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* storage non disponibile */ }
  };

  const clearStoredStart = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage non disponibile */ }
  };

  const currentParams = () => new URLSearchParams(window.location.search);

  const resolveStart = () => {
    const query = currentParams().get("start");
    if (query && core.isValidISO(query)) {
      storeStart(query);
      return { value: query, source: "url", invalidQuery: false };
    }
    return {
      value: getStoredStart(),
      source: getStoredStart() ? "storage" : null,
      invalidQuery: Boolean(query),
    };
  };

  const stateUrl = (path, start, extra = {}) => {
    const url = new URL(`${root}${path}`, window.location.href);
    if (start) url.searchParams.set("start", start);
    Object.entries(extra).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    });
    return url;
  };

  const copyText = async (value, button) => {
    const original = button ? button.textContent : "";
    try {
      await navigator.clipboard.writeText(value);
      if (button) button.textContent = "Link copiato";
    } catch {
      window.prompt("Copia questo collegamento", value);
      if (button) button.textContent = "Link pronto";
    }
    if (button) setTimeout(() => { button.textContent = original; }, 1800);
  };

  const show = (element, visible = true) => {
    if (element) element.hidden = !visible;
  };

  const setLoading = (visible) => {
    document.querySelectorAll("[data-plan-loading]").forEach((element) => show(element, visible));
  };

  const formatRange = (start) => {
    const range = core.planRange(start, DAYS_IN_PLAN);
    return `${core.formatMedium(range.start)} – ${core.formatMedium(range.end)}`;
  };

  const updateFormPreview = (form) => {
    const input = form.querySelector('input[name="start"]');
    const preview = form.querySelector("[data-start-preview]");
    const error = form.querySelector("[data-start-error]");
    if (!input || !preview) return;
    const value = input.value;
    if (!value) {
      preview.textContent = "Il piano durerà 180 giorni consecutivi.";
      show(error, false);
      return;
    }
    if (!core.isValidISO(value)) {
      preview.textContent = "";
      if (error) {
        error.textContent = "Inserisci una data valida.";
        show(error, true);
      }
      return;
    }
    show(error, false);
    const end = core.addDays(value, DAYS_IN_PLAN - 1);
    preview.textContent = `Dal ${core.formatLong(value)} al ${core.formatLong(end)}.`;
  };

  const attachStartForms = (activeStart) => {
    document.querySelectorAll("[data-start-form]").forEach((form) => {
      const input = form.querySelector('input[name="start"]');
      if (!input) return;
      if (!input.value) input.value = activeStart || core.todayISO();
      updateFormPreview(form);
      input.addEventListener("input", () => updateFormPreview(form));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = input.value;
        const error = form.querySelector("[data-start-error]");
        if (!core.isValidISO(value)) {
          if (error) {
            error.textContent = "La data del primo D1 non è valida.";
            show(error, true);
          }
          input.focus();
          return;
        }
        storeStart(value);
        const url = new URL(window.location.href);
        url.searchParams.set("start", value);
        if (page === "calendar") url.searchParams.set("focus", value);
        if (page === "today") url.searchParams.delete("date");
        window.location.assign(url.href);
      });
    });

    const editor = document.querySelector("[data-start-editor]");
    document.querySelectorAll("[data-change-start]").forEach((button) => {
      button.addEventListener("click", () => {
        show(editor, true);
        editor?.querySelector('input[name="start"]')?.focus();
      });
    });
    document.querySelectorAll("[data-cancel-start]").forEach((button) => {
      button.addEventListener("click", () => show(editor, false));
    });
    document.querySelectorAll("[data-clear-start]").forEach((button) => {
      button.addEventListener("click", () => {
        clearStoredStart();
        const url = new URL(window.location.href);
        ["start", "focus", "date", "view"].forEach((key) => url.searchParams.delete(key));
        window.location.assign(url.href);
      });
    });
  };

  const dayHref = (day, start, focus, anchor) => {
    const url = stateUrl(day.path, start, focus ? { focus } : {});
    if (anchor) url.hash = anchor;
    return url.href;
  };

  const setCommonStateLinks = (start, focus) => {
    document.querySelectorAll("[data-calendar-link]").forEach((link) => {
      link.href = stateUrl("calendario/index.html", start, { focus }).href;
    });
    document.querySelectorAll("[data-today-link]").forEach((link) => {
      link.href = stateUrl("oggi/index.html", start).href;
    });
    document.querySelectorAll("[data-plan-editor-link]").forEach((link) => {
      link.href = stateUrl("calendario/modifica/index.html", start, { focus: focus || core.todayISO() }).href;
    });
    document.querySelectorAll("[data-prep-link]").forEach((link) => {
      link.href = stateUrl("preparazioni/index.html", start, focus ? { date: focus } : {}).href;
    });
    document.querySelectorAll("[data-range-shopping-link]").forEach((link) => {
      const from = focus || core.todayISO();
      link.href = stateUrl("spesa/intervallo/index.html", start, { from, to: core.addDays(from, 6) }).href;
    });
    document.querySelectorAll("[data-tools-link]").forEach((link) => {
      link.href = stateUrl("strumenti/index.html", start).href;
    });
    document.querySelectorAll("[data-copy-calendar-link]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = stateUrl("calendario/index.html", start, { focus: focus || core.todayISO() });
        copyText(target.href, button);
      });
    });
    document.querySelectorAll("[data-active-range]").forEach((element) => {
      element.textContent = formatRange(start);
    });
  };

  const renderHomeStatus = (data, start) => {
    const host = document.querySelector("[data-home-calendar-status]");
    if (!host) return;
    if (!start) {
      host.innerHTML = `
        <div>
          <p class="eyebrow">Calendario non configurato</p>
          <h2>Associa il piano alle date reali</h2>
          <p>Indica il primo D1 per attivare la pagina Oggi e il calendario dei 180 giorni.</p>
        </div>
        <a class="button primary" href="${escapeHtml(stateUrl("calendario/index.html", null).href)}">Configura ora</a>`;
      return;
    }
    const today = core.todayISO();
    const range = core.planRange(start, data.duration_days || DAYS_IN_PLAN);
    const day = core.planDayForDate(data.days, start, today);
    let status;
    if (day) {
      status = `<strong>${escapeHtml(day.d_code)} · ${escapeHtml(day.shift_name)}</strong><span>${escapeHtml(day.month)} · C${day.cycle} · V${day.variant}</span>`;
    } else if (core.diffDays(today, range.start) > 0) {
      status = `<strong>Il piano deve ancora iniziare</strong><span>Primo D1: ${escapeHtml(core.formatLong(range.start))}</span>`;
    } else {
      status = `<strong>Il periodo di 180 giorni è terminato</strong><span>Ultimo giorno: ${escapeHtml(core.formatLong(range.end))}</span>`;
    }
    host.innerHTML = `
      <div>
        <p class="eyebrow">Calendario attivo · ${escapeHtml(formatRange(start))}</p>
        <h2>${escapeHtml(core.formatLong(today))}</h2>
        <div class="home-status-detail">${status}</div>
      </div>
      <div class="home-status-actions">
        <a class="button primary" href="${escapeHtml(stateUrl("oggi/index.html", start).href)}">Apri Oggi</a>
        <a class="button secondary" href="${escapeHtml(stateUrl("preparazioni/index.html", start).href)}">Prep 48 ore</a>
        <a class="button secondary" href="${escapeHtml(stateUrl("calendario/index.html", start, { focus: core.clampDate(today, range.start, range.end) }).href)}">Calendario</a>
      </div>`;
  };

  const renderDayDate = (start) => {
    const dateLine = document.querySelector("[data-day-civil-date]");
    if (!dateLine || !start) return;
    const globalDay = Number(dateLine.dataset.globalDay);
    const date = core.addDays(start, globalDay - 1);
    dateLine.textContent = core.formatLong(date);
    show(dateLine, true);
    document.querySelectorAll("[data-calendar-day-link]").forEach((link) => {
      link.href = stateUrl("calendario/index.html", start, { focus: date }).href;
    });
    document.querySelectorAll("[data-preserve-start]").forEach((link) => {
      const url = new URL(link.href, window.location.href);
      url.searchParams.set("start", start);
      link.href = url.href;
    });
    document.querySelectorAll("[data-copy-url]").forEach((button) => {
      const share = new URL(window.location.href);
      share.searchParams.set("start", start);
      button.dataset.copyValue = share.href;
    });
  };

  const renderCalendar = (data, start) => {
    const app = document.querySelector("[data-calendar-app]");
    const setup = document.querySelector("[data-plan-setup]");
    if (!app) return;
    if (!start) {
      show(setup, true);
      show(app, false);
      return;
    }

    show(setup, false);
    show(app, true);
    attachStartForms(start);

    const range = core.planRange(start, data.duration_days || DAYS_IN_PLAN);
    const today = core.todayISO();
    const params = currentParams();
    const requestedFocus = params.get("focus");
    let focus = core.isValidISO(requestedFocus)
      ? core.clampDate(requestedFocus, range.start, range.end)
      : core.clampDate(today, range.start, range.end);
    let displayedMonth = core.monthStart(focus);
    let view = params.get("view") === "overview" ? "overview" : "month";

    setCommonStateLinks(start, focus);

    const monthView = document.querySelector("[data-calendar-month-view]");
    const overviewView = document.querySelector("[data-calendar-overview-view]");
    const grid = document.querySelector("[data-calendar-grid]");
    const monthLabel = document.querySelector("[data-month-label]");
    const prevButton = document.querySelector("[data-month-prev]");
    const nextButton = document.querySelector("[data-month-next]");
    const goToday = document.querySelector("[data-calendar-go-today]");

    const updateUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("start", start);
      url.searchParams.set("focus", focus);
      if (view === "overview") url.searchParams.set("view", "overview");
      else url.searchParams.delete("view");
      history.replaceState({}, "", url.href);
    };

    const renderMonth = () => {
      const firstMonth = core.monthStart(range.start);
      const lastMonth = core.monthStart(range.end);
      monthLabel.textContent = core.capitalize(core.formatDate(displayedMonth, { month: "long", year: "numeric" }));
      prevButton.disabled = core.monthKey(displayedMonth) <= core.monthKey(firstMonth);
      nextButton.disabled = core.monthKey(displayedMonth) >= core.monthKey(lastMonth);
      goToday.disabled = core.diffDays(range.start, today) < 0 || core.diffDays(today, range.end) < 0;
      goToday.title = goToday.disabled ? "La data odierna è fuori dall'intervallo del piano" : "Apri la data odierna";

      grid.innerHTML = core.monthGridDates(displayedMonth).map((date) => {
        const inCurrentMonth = core.sameMonth(date, displayedMonth);
        const day = core.planDayForDate(data.days, start, date);
        const events = core.eventsOnDate(data.days, start, date);
        const tails = events.filter((event) => event.is_tail);
        const classes = ["calendar-day-cell"];
        if (!inCurrentMonth) classes.push("outside-month");
        if (day) classes.push(day.d_code.toLowerCase());
        if (date === today) classes.push("is-today");
        if (date === focus) classes.push("is-focus");
        const dateNumber = core.parseISO(date).day;
        if (!day) {
          return `<div class="${classes.join(" ")}" data-calendar-date="${date}" aria-hidden="${inCurrentMonth ? "false" : "true"}"><span class="calendar-date-number">${dateNumber}</span></div>`;
        }
        const labels = [core.formatLong(date), day.d_code, day.shift_name, `Ciclo ${day.cycle}`, `Variante ${day.variant}`];
        if (day.flexible) labels.push("pasto flessibile");
        if (tails.length) labels.push(`prosecuzione D2 alle ${tails.map((item) => item.time).join(" e ")}`);
        const href = dayHref(day, start, date);
        return `
          <a class="${classes.join(" ")}" data-calendar-date="${date}" href="${escapeHtml(href)}" aria-label="${escapeHtml(labels.join(", "))}">
            <span class="calendar-cell-top"><span class="calendar-date-number">${dateNumber}</span><b class="calendar-shift-code">${escapeHtml(day.d_code)}</b></span>
            <span class="calendar-shift-name">${escapeHtml(day.shift_name.replace(/\s+\d{2}:\d{2}.*$/, ""))}</span>
            <span class="calendar-cell-meta">C${day.cycle} · V${day.variant}</span>
            <span class="calendar-cell-flags">
              ${day.flexible ? '<span class="calendar-flag flex" title="Pasto flessibile">F</span>' : ""}
              ${tails.length ? '<span class="calendar-flag tail" title="Prosecuzione del D2 precedente">+D2</span>' : ""}
            </span>
          </a>`;
      }).join("");
    };

    const renderOverview = () => {
      const host = document.querySelector("[data-cycle-calendar-grid]");
      host.innerHTML = Array.from({ length: 6 }, (_, cycleIndex) => {
        const cycleNumber = cycleIndex + 1;
        const cycleDays = data.days.filter((day) => day.cycle === cycleNumber);
        const firstDate = core.addDays(start, cycleDays[0].global_day - 1);
        const lastDate = core.addDays(start, cycleDays[cycleDays.length - 1].global_day - 1);
        const daysHtml = cycleDays.map((day) => {
          const date = core.addDays(start, day.global_day - 1);
          const tails = core.eventsOnDate(data.days, start, date).filter((event) => event.is_tail);
          return `
            <a class="cycle-mini-day ${day.d_code.toLowerCase()}${date === today ? " is-today" : ""}" href="${escapeHtml(dayHref(day, start, date))}" title="${escapeHtml(`${core.formatLong(date)} · ${day.d_code} · ${day.shift_name}`)}">
              <span>${escapeHtml(core.formatShort(date))}</span>
              <b>${escapeHtml(day.d_code)}</b>
              <i>${day.flexible ? "F" : ""}${tails.length ? "+" : ""}</i>
            </a>`;
        }).join("");
        return `
          <article class="cycle-calendar-card">
            <header>
              <div class="cycle-number">C${cycleNumber}</div>
              <div><p class="eyebrow">${escapeHtml(cycleDays[0].month)}</p><h3>${escapeHtml(core.formatMedium(firstDate))} – ${escapeHtml(core.formatMedium(lastDate))}</h3></div>
              <button type="button" class="button secondary compact" data-open-cycle-month="${escapeHtml(firstDate)}">Apri</button>
            </header>
            <div class="cycle-mini-grid">${daysHtml}</div>
          </article>`;
      }).join("");
      host.querySelectorAll("[data-open-cycle-month]").forEach((button) => {
        button.addEventListener("click", () => {
          focus = button.dataset.openCycleMonth;
          displayedMonth = core.monthStart(focus);
          setView("month");
        });
      });
    };

    const setView = (nextView) => {
      view = nextView;
      show(monthView, view === "month");
      show(overviewView, view === "overview");
      document.querySelectorAll("[data-calendar-view]").forEach((button) => {
        const active = button.dataset.calendarView === view;
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (view === "month") renderMonth();
      else renderOverview();
      updateUrl();
    };

    prevButton.addEventListener("click", () => {
      displayedMonth = core.addMonths(displayedMonth, -1);
      focus = core.clampDate(core.monthStart(displayedMonth), range.start, range.end);
      renderMonth();
      updateUrl();
    });
    nextButton.addEventListener("click", () => {
      displayedMonth = core.addMonths(displayedMonth, 1);
      focus = core.clampDate(core.monthStart(displayedMonth), range.start, range.end);
      renderMonth();
      updateUrl();
    });
    goToday.addEventListener("click", () => {
      if (goToday.disabled) return;
      focus = today;
      displayedMonth = core.monthStart(today);
      setView("month");
    });
    document.querySelectorAll("[data-calendar-view]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.calendarView));
    });
    document.querySelectorAll("[data-print-calendar]").forEach((button) => {
      button.addEventListener("click", () => window.print());
    });

    setView(view);
  };

  const mealEventHtml = (event, start, selectedDate, isNext, isPast) => {
    const source = event.source_day;
    const label = event.is_tail ? `Prosecuzione ${source.d_code}` : `${source.d_code} · ${source.shift_name}`;
    const classes = ["today-event"];
    if (event.is_tail) classes.push("is-tail");
    if (isNext) classes.push("is-next");
    if (isPast) classes.push("is-past");
    const href = dayHref(source, start, selectedDate, event.anchor);
    return `
      <a class="${classes.join(" ")}" href="${escapeHtml(href)}">
        <div class="today-event-time"><time>${escapeHtml(event.time)}</time><span>${escapeHtml(event.meal_type)}</span></div>
        <div class="today-event-copy">
          <span class="today-event-source">${escapeHtml(label)}</span>
          <h3>${escapeHtml(event.title)}</h3>
          <p>${Math.round(event.kcal)} kcal · ${event.prep_minutes} min${event.prepare_ahead ? ` · ${escapeHtml(event.prepare_ahead)}` : ""}</p>
        </div>
        <span class="today-event-state">${isNext ? "Prossimo" : isPast ? "Trascorso" : "Apri"}</span>
      </a>`;
  };

  const renderToday = (data, start) => {
    const app = document.querySelector("[data-today-app]");
    const setup = document.querySelector("[data-plan-setup]");
    const host = document.querySelector("[data-today-content]");
    if (!app || !host) return;
    if (!start) {
      show(setup, true);
      show(app, false);
      return;
    }

    show(setup, false);
    show(app, true);
    attachStartForms(start);

    const range = core.planRange(start, data.duration_days || DAYS_IN_PLAN);
    const actualToday = core.todayISO();
    const requested = currentParams().get("date");
    const selectedDate = core.isValidISO(requested) ? requested : actualToday;
    const inRange = core.diffDays(range.start, selectedDate) >= 0 && core.diffDays(selectedDate, range.end) >= 0;
    const focus = core.clampDate(selectedDate, range.start, range.end);
    setCommonStateLinks(start, focus);

    document.querySelectorAll("[data-today-link]").forEach((link) => {
      link.href = stateUrl("oggi/index.html", start).href;
      show(link, selectedDate !== actualToday);
    });

    if (!inRange) {
      const before = core.diffDays(selectedDate, range.start) > 0;
      const distance = before ? core.diffDays(selectedDate, range.start) : core.diffDays(range.end, selectedDate);
      host.innerHTML = `
        <section class="today-outside-card">
          <p class="eyebrow">${escapeHtml(core.formatLong(selectedDate))}</p>
          <h2>${before ? "Il piano non è ancora iniziato" : "Il periodo di 180 giorni è terminato"}</h2>
          <p>${before ? `Mancano ${distance} giorni al primo D1.` : `Sono trascorsi ${distance} giorni dall'ultimo D5.`}</p>
          <div class="hero-actions">
            <a class="button primary" href="${escapeHtml(stateUrl("calendario/index.html", start, { focus }).href)}">Apri il calendario</a>
            <a class="button secondary" href="${escapeHtml(stateUrl("oggi/index.html", start, { date: before ? range.start : range.end }).href)}">Mostra ${before ? "il primo" : "l'ultimo"} giorno</a>
          </div>
        </section>`;
      return;
    }

    const day = core.planDayForDate(data.days, start, selectedDate);
    const events = core.eventsOnDate(data.days, start, selectedDate);
    const tails = events.filter((event) => event.is_tail);
    const now = new Date();
    const isActualToday = selectedDate === actualToday;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nextOnDate = events.find((event) => !isActualToday || event.minute_of_day >= nowMinutes) || null;
    const nextEvent = isActualToday
      ? core.findNextEvent(data.days, start, selectedDate, nowMinutes)
      : nextOnDate;

    let nextBlock = "";
    if (nextEvent) {
      const nextLabel = nextEvent.actual_date === selectedDate
        ? `alle ${nextEvent.time}`
        : `${core.formatDate(nextEvent.actual_date, { weekday: "long", day: "numeric", month: "short" })} alle ${nextEvent.time}`;
      nextBlock = `
        <section class="next-meal-card">
          <div><p class="eyebrow">${isActualToday ? "Prossimo pasto" : "Primo pasto della data"}</p><h2>${escapeHtml(nextEvent.title)}</h2><p>${escapeHtml(nextLabel)} · ${Math.round(nextEvent.kcal)} kcal</p></div>
          <a class="button primary" href="${escapeHtml(dayHref(nextEvent.source_day, start, nextEvent.actual_date, nextEvent.anchor))}">Apri il pasto</a>
        </section>`;
    }

    const eventsHtml = events.map((event) => {
      const isPast = isActualToday && event.minute_of_day < nowMinutes;
      const isNext = Boolean(nextOnDate && event.source_day.global_day === nextOnDate.source_day.global_day && event.anchor === nextOnDate.anchor);
      return mealEventHtml(event, start, selectedDate, isNext, isPast);
    }).join("");

    const prevDate = selectedDate === range.start ? null : core.addDays(selectedDate, -1);
    const nextDate = selectedDate === range.end ? null : core.addDays(selectedDate, 1);
    host.innerHTML = `
      ${selectedDate !== actualToday ? `<div class="preview-date-banner"><span>Stai visualizzando una data diversa da oggi: <strong>${escapeHtml(core.formatLong(selectedDate))}</strong></span><a href="${escapeHtml(stateUrl("oggi/index.html", start).href)}">Torna a oggi</a></div>` : ""}
      <header class="today-shift-hero ${escapeHtml(day.d_code.toLowerCase())}">
        <span class="shift-code large">${escapeHtml(day.d_code)}</span>
        <div>
          <p class="eyebrow">${escapeHtml(core.formatLong(selectedDate))} · C${day.cycle} · V${day.variant} · giorno ${day.global_day}</p>
          <h2>${escapeHtml(day.shift_name)}</h2>
          <p>${escapeHtml(day.shift_hours)}</p>
        </div>
        ${day.flexible ? '<span class="flex-badge large">Pasto flessibile</span>' : ""}
      </header>
      ${tails.length ? `<aside class="night-tail-callout"><strong>Prosecuzione del D2 precedente</strong><span>${tails.map((item) => `${escapeHtml(item.time)} · ${escapeHtml(item.title)}`).join("; ")}</span></aside>` : ""}
      ${nextBlock}
      <div class="nutrition-grid day-summary today-nutrition">
        <div><strong>${Math.round(day.total.kcal)}</strong><span>kcal del ${escapeHtml(day.d_code)}</span></div>
        <div><strong>${Number(day.total.protein).toFixed(1)}</strong><span>g proteine</span></div>
        <div><strong>${Number(day.total.carbs).toFixed(1)}</strong><span>g carboidrati</span></div>
        <div><strong>${Number(day.total.fat).toFixed(1)}</strong><span>g grassi</span></div>
        <div><strong>${Number(day.total.fiber).toFixed(1)}</strong><span>g fibra</span></div>
      </div>
      <section class="section-block today-events-section">
        <div class="section-heading"><div><p class="eyebrow">Pasti nella data civile</p><h2>${events.length} appuntamenti alimentari</h2></div><a class="text-link" href="${escapeHtml(dayHref(day, start, selectedDate))}">Apri il giorno completo →</a></div>
        <div class="today-event-list">${eventsHtml}</div>
      </section>
      <nav class="date-pager" aria-label="Date adiacenti">
        ${prevDate ? `<a href="${escapeHtml(stateUrl("oggi/index.html", start, { date: prevDate }).href)}">← ${escapeHtml(core.formatShort(prevDate))}</a>` : "<span></span>"}
        <a href="${escapeHtml(stateUrl("calendario/index.html", start, { focus: selectedDate }).href)}">Apri nel calendario</a>
        ${nextDate ? `<a href="${escapeHtml(stateUrl("oggi/index.html", start, { date: nextDate }).href)}">${escapeHtml(core.formatShort(nextDate))} →</a>` : ""}
      </nav>`;
  };

  const init = async () => {
    const startState = resolveStart();
    attachStartForms(startState.value);
    if (startState.invalidQuery) {
      document.querySelectorAll("[data-start-error]").forEach((element) => {
        element.textContent = "Il parametro start nell'indirizzo non contiene una data valida.";
        show(element, true);
      });
    }

    let data;
    try {
      const response = await fetch(new URL(`${root}data/calendar.json`, window.location.href));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch (error) {
      setLoading(false);
      document.querySelectorAll("[data-plan-setup], [data-calendar-app], [data-today-app]").forEach((element) => show(element, false));
      const host = document.querySelector("main");
      if (host) {
        const box = document.createElement("section");
        box.className = "notice-card error-card";
        box.innerHTML = `<h2>Impossibile caricare il calendario</h2><p>Apri il sito tramite un server web o GitHub Pages. Dettaglio tecnico: ${escapeHtml(error.message)}</p>`;
        host.append(box);
      }
      return;
    }

    setLoading(false);
    if (page === "home") {
      renderHomeStatus(data, startState.value);
      try { await globalThis.TataDietEffectivePages?.renderHome?.(startState.value); } catch (error) { console.warn("Piano effettivo Home non disponibile", error); }
    }
    if (page === "day") renderDayDate(startState.value);
    if (page === "calendar") renderCalendar(data, startState.value);
    if (page === "today") {
      renderToday(data, startState.value);
      try { await globalThis.TataDietEffectivePages?.renderToday?.(startState.value); } catch (error) { console.warn("Piano effettivo Oggi non disponibile", error); }
    }
  };

  init();
})();
