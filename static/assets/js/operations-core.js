(function (global, factory) {
  let core = global.DietCalendarCore;
  if (typeof module === "object" && module.exports) {
    core = require("./calendar-core.js");
  }
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  global.DietOperationsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (calendarCore) {
  "use strict";

  if (!calendarCore) throw new Error("DietCalendarCore non disponibile");

  const core = calendarCore;
  const MINUTES_PER_DAY = 1440;

  function normalize(value) {
    return String(value || "")
      .toLocaleLowerCase("it")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isPrepPositive(value) {
    const text = normalize(value);
    if (!text || text.startsWith("no") || text.startsWith("non ") || text.startsWith("meglio al momento")) return false;
    return ["si", "giorno prima", "sera prima", "batch", "anticipo", "porzionabile", "ottimo"].some((token) => text.includes(token));
  }

  function parseFridgeDays(value) {
    const text = String(value || "").toLocaleLowerCase("it");
    const days = text.match(/(\d+(?:[.,]\d+)?)\s*giorn/);
    if (days) return Number(days[1].replace(",", "."));
    const hours = text.match(/(\d+(?:[.,]\d+)?)\s*or/);
    return hours ? Number(hours[1].replace(",", ".")) / 24 : 0;
  }

  function roundUp(value, step) {
    const numeric = Number(value || 0);
    const increment = Number(step || 1);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    if (!Number.isFinite(increment) || increment <= 0) return numeric;
    return Math.ceil((numeric - 1e-9) / increment) * increment;
  }

  function formatQuantity(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat("it-IT", { maximumFractionDigits: Number.isInteger(number) ? 0 : 1 }).format(number);
  }

  function aggregateIngredients(dataset, start, from, to) {
    if (!core.isValidISO(start) || !core.isValidISO(from) || !core.isValidISO(to)) {
      throw new TypeError("Intervallo o data iniziale non validi");
    }
    const range = core.planRange(start, dataset.days.length || 180);
    let first = core.clampDate(from, range.start, range.end);
    let last = core.clampDate(to, range.start, range.end);
    if (core.compareDates(first, last) > 0) [first, last] = [last, first];
    const firstIndex = core.diffDays(start, first);
    const lastIndex = core.diffDays(start, last);
    const aggregate = new Map();

    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const day = dataset.days[index];
      if (!day) continue;
      for (const ingredient of day.ingredients || []) {
        const key = `${ingredient.code}|${ingredient.unit}`;
        const current = aggregate.get(key) || {
          code: ingredient.code,
          name: ingredient.name,
          category: ingredient.category,
          unit: ingredient.unit,
          exact: 0,
          global_days: [],
        };
        current.exact += Number(ingredient.quantity || 0);
        current.global_days.push(day.global_day);
        aggregate.set(key, current);
      }
    }

    const categoryOrder = new Map((dataset.categories || []).map((name, index) => [name, index]));
    const items = [...aggregate.values()].map((item) => {
      const rule = dataset.rules?.[item.code] || {};
      const conversion = Number(rule.conversion_factor || 1);
      const exact = item.exact / conversion;
      const step = Number(rule.rounding_step || 1);
      return {
        ...item,
        source_exact: Math.round(item.exact * 100) / 100,
        exact: Math.round(exact * 100) / 100,
        suggested: roundUp(exact, step),
        unit: rule.display_unit || item.unit,
        rounding_step: step,
        note: rule.note || "Quantità suggerita arrotondata per eccesso.",
      };
    }).sort((a, b) => {
      const category = (categoryOrder.get(a.category) ?? 999) - (categoryOrder.get(b.category) ?? 999);
      return category || a.name.localeCompare(b.name, "it");
    });

    return {
      start: first,
      end: last,
      day_count: lastIndex - firstIndex + 1,
      first_global_day: firstIndex + 1,
      last_global_day: lastIndex + 1,
      items,
    };
  }

  function eventStamp(event) {
    return core.toOrdinal(event.actual_date) * MINUTES_PER_DAY + Number(event.minute_of_day || 0);
  }

  function eventsInWindow(days, start, referenceDate, referenceMinute, hours = 48) {
    const duration = Math.max(0, Number(hours || 0));
    const from = core.toOrdinal(referenceDate) * MINUTES_PER_DAY + Number(referenceMinute || 0);
    const to = from + duration * 60;
    return core.allEvents(days, start)
      .map((event) => ({ ...event, stamp: eventStamp(event) }))
      .filter((event) => event.stamp >= from && event.stamp <= to)
      .map((event) => {
        const hoursUntil = (event.stamp - from) / 60;
        return {
          ...event,
          hours_until: hoursUntil,
          window_segment: hoursUntil <= 24 ? "first" : "second",
          window_label: hoursUntil <= 24 ? "0–24 ore" : "24–48 ore",
        };
      });
  }

  function prepItemsInWindow(days, start, referenceDate, referenceMinute, hours = 48) {
    return eventsInWindow(days, start, referenceDate, referenceMinute, hours)
      .filter((event) => isPrepPositive(event.prepare_ahead))
      .map((event) => {
        const previousDate = core.addDays(event.actual_date, -1);
        const prepDate = event.hours_until <= 24 ? referenceDate : core.maxDate(referenceDate, previousDate);
        const urgency = event.hours_until <= 8 ? "prioritaria" : event.hours_until <= 24 ? "entro-24" : "tra-24-48";
        return {
          ...event,
          prep_date: prepDate,
          urgency,
          fridge_days: parseFridgeDays(event.fridge),
        };
      });
  }

  function groupBy(items, key) {
    return items.reduce((groups, item) => {
      const value = typeof key === "function" ? key(item) : item[key];
      if (!groups[value]) groups[value] = [];
      groups[value].push(item);
      return groups;
    }, {});
  }

  function icsEscape(value) {
    return String(value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  }

  function compactDate(value) {
    return value.replaceAll("-", "");
  }

  function stampUtc(date) {
    const now = date instanceof Date ? date : new Date(date || Date.now());
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  }

  function foldIcsLine(line) {
    const limit = 73;
    if (line.length <= limit) return [line];
    const rows = [];
    let remaining = line;
    while (remaining.length > limit) {
      rows.push(remaining.slice(0, limit));
      remaining = ` ${remaining.slice(limit)}`;
    }
    rows.push(remaining);
    return rows;
  }

  function buildIcs(days, start, from, to, includePrep = false, generatedAt) {
    const range = core.planRange(start, days.length || 180);
    let first = core.clampDate(from || range.start, range.start, range.end);
    let last = core.clampDate(to || range.end, range.start, range.end);
    if (core.compareDates(first, last) > 0) [first, last] = [last, first];
    const firstIndex = core.diffDays(start, first);
    const lastIndex = core.diffDays(start, last);
    const dtstamp = stampUtc(generatedAt);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Piano alimentare statico//Versione 4//IT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Piano alimentare - turni",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Rome",
      "X-LIC-LOCATION:Europe/Rome",
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "TZNAME:CEST",
      "DTSTART:19700329T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "TZNAME:CET",
      "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];

    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const day = days[index];
      const date = core.addDays(start, day.global_day - 1);
      const nextDate = core.addDays(date, 1);
      lines.push("BEGIN:VEVENT", `UID:diet-plan-shift-${start}-${day.global_day}@static`, `DTSTAMP:${dtstamp}`);
      if (day.d_code === "D1") {
        lines.push(`DTSTART;TZID=Europe/Rome:${compactDate(date)}T080000`, `DTEND;TZID=Europe/Rome:${compactDate(date)}T200000`);
      } else if (day.d_code === "D2") {
        lines.push(`DTSTART;TZID=Europe/Rome:${compactDate(date)}T200000`, `DTEND;TZID=Europe/Rome:${compactDate(nextDate)}T080000`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`, `DTEND;VALUE=DATE:${compactDate(nextDate)}`);
      }
      lines.push(
        `SUMMARY:${icsEscape(`${day.d_code} · ${day.shift_name}`)}`,
        `DESCRIPTION:${icsEscape(`Ciclo ${day.cycle} · Variante ${day.variant} · giorno ${day.global_day}. ${day.shift_hours}`)}`,
        `CATEGORIES:${icsEscape(day.d_code)}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }

    if (includePrep) {
      const groups = new Map();
      for (let index = firstIndex; index <= lastIndex; index += 1) {
        const day = days[index];
        for (const meal of day.meals || []) {
          if (!isPrepPositive(meal.prepare_ahead)) continue;
          const actualDate = core.actualMealDate(start, day, meal);
          const prepDate = core.addDays(actualDate, -1);
          const list = groups.get(prepDate) || [];
          list.push(`${meal.title} (${actualDate} ${meal.time})`);
          groups.set(prepDate, list);
        }
      }
      [...groups.entries()].sort((a, b) => core.compareDates(a[0], b[0])).forEach(([prepDate, titles]) => {
        const unique = [...new Set(titles)];
        lines.push(
          "BEGIN:VEVENT",
          `UID:diet-plan-prep-${start}-${prepDate}@static`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;TZID=Europe/Rome:${compactDate(prepDate)}T180000`,
          `DTEND;TZID=Europe/Rome:${compactDate(prepDate)}T183000`,
          "SUMMARY:Preparazioni del piano alimentare",
          `DESCRIPTION:${icsEscape(unique.join("\n"))}`,
          "CATEGORIES:MEAL-PREP",
          "BEGIN:VALARM",
          "TRIGGER:-PT1H",
          "ACTION:DISPLAY",
          "DESCRIPTION:Preparazioni del piano alimentare",
          "END:VALARM",
          "END:VEVENT",
        );
      });
    }

    lines.push("END:VCALENDAR");
    return lines.flatMap(foldIcsLine).join("\r\n") + "\r\n";
  }

  function scoreEntry(entry, query) {
    const normalized = normalize(query);
    if (!normalized) return 1;
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const title = normalize(entry.title);
    const subtitle = normalize(entry.subtitle);
    const text = normalize(entry.text);
    if (!tokens.every((token) => title.includes(token) || subtitle.includes(token) || text.includes(token))) return 0;
    let score = 10;
    if (title === normalized) score += 100;
    else if (title.startsWith(normalized)) score += 60;
    else if (title.includes(normalized)) score += 35;
    tokens.forEach((token) => {
      if (title.startsWith(token)) score += 12;
      else if (title.includes(token)) score += 7;
      if (subtitle.includes(token)) score += 3;
    });
    return score;
  }

  function search(entries, query, types) {
    const allowed = new Set((types || []).filter(Boolean));
    return entries
      .filter((entry) => !allowed.size || allowed.has(entry.type))
      .map((entry) => ({ ...entry, score: scoreEntry(entry, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "it"));
  }

  return {
    normalize,
    isPrepPositive,
    parseFridgeDays,
    roundUp,
    formatQuantity,
    aggregateIngredients,
    eventsInWindow,
    prepItemsInWindow,
    groupBy,
    buildIcs,
    search,
    scoreEntry,
  };
});
