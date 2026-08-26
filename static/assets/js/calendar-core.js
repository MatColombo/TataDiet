(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  global.DietCalendarCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY_MS = 86400000;
  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function parseISO(value) {
    if (typeof value !== "string") return null;
    const match = ISO_RE.exec(value.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) return null;
    return { year, month, day };
  }

  function isValidISO(value) {
    return Boolean(parseISO(value));
  }

  function toISO(parts) {
    return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  function toOrdinal(value) {
    const parts = typeof value === "string" ? parseISO(value) : value;
    if (!parts) throw new TypeError(`Data civile non valida: ${value}`);
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
  }

  function fromOrdinal(ordinal) {
    const date = new Date(Number(ordinal) * DAY_MS);
    return toISO({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }

  function addDays(value, amount) {
    return fromOrdinal(toOrdinal(value) + Number(amount));
  }

  function diffDays(start, end) {
    return toOrdinal(end) - toOrdinal(start);
  }

  function compareDates(a, b) {
    return Math.sign(toOrdinal(a) - toOrdinal(b));
  }

  function minDate(a, b) {
    return toOrdinal(a) <= toOrdinal(b) ? a : b;
  }

  function maxDate(a, b) {
    return toOrdinal(a) >= toOrdinal(b) ? a : b;
  }

  function clampDate(value, minimum, maximum) {
    return maxDate(minDate(value, maximum), minimum);
  }

  function todayISO(now) {
    const date = now instanceof Date ? now : new Date();
    return toISO({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    });
  }

  function utcDate(value) {
    const parts = parseISO(value);
    if (!parts) throw new TypeError(`Data civile non valida: ${value}`);
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  }

  function formatDate(value, options) {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "UTC",
      ...options,
    }).format(utcDate(value));
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  function formatLong(value) {
    return capitalize(formatDate(value, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }));
  }

  function formatMedium(value) {
    return formatDate(value, { day: "numeric", month: "short", year: "numeric" });
  }

  function formatShort(value) {
    return formatDate(value, { day: "2-digit", month: "2-digit" });
  }

  function monthStart(value) {
    const parts = parseISO(value);
    if (!parts) throw new TypeError(`Data civile non valida: ${value}`);
    return toISO({ year: parts.year, month: parts.month, day: 1 });
  }

  function monthEnd(value) {
    const parts = parseISO(value);
    if (!parts) throw new TypeError(`Data civile non valida: ${value}`);
    const date = new Date(Date.UTC(parts.year, parts.month, 0));
    return toISO({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }

  function addMonths(value, amount) {
    const parts = parseISO(value);
    if (!parts) throw new TypeError(`Data civile non valida: ${value}`);
    const date = new Date(Date.UTC(parts.year, parts.month - 1 + Number(amount), 1));
    return toISO({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: 1,
    });
  }

  function monthKey(value) {
    const parts = parseISO(value);
    if (!parts) return "";
    return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}`;
  }

  function sameMonth(a, b) {
    return monthKey(a) === monthKey(b);
  }

  function mondayIndex(value) {
    const weekday = utcDate(value).getUTCDay();
    return weekday === 0 ? 6 : weekday - 1;
  }

  function monthGridDates(value) {
    const first = monthStart(value);
    const last = monthEnd(value);
    const gridStart = addDays(first, -mondayIndex(first));
    const gridEnd = addDays(last, 6 - mondayIndex(last));
    const count = diffDays(gridStart, gridEnd) + 1;
    return Array.from({ length: count }, (_, index) => addDays(gridStart, index));
  }

  function mappingForIndex(index) {
    const numeric = Number(index);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric >= 180) return null;
    const withinCycle = numeric % 30;
    return {
      globalDay: numeric + 1,
      cycle: Math.floor(numeric / 30) + 1,
      variant: Math.floor(withinCycle / 5) + 1,
      dayInVariant: (withinCycle % 5) + 1,
      dCode: `D${(withinCycle % 5) + 1}`,
    };
  }

  function planDayForDate(days, start, date) {
    const index = diffDays(start, date);
    return index >= 0 && index < days.length ? days[index] : null;
  }

  function actualMealDate(start, day, meal) {
    return addDays(start, day.global_day - 1 + Number(meal.day_offset || 0));
  }

  function eventsOnDate(days, start, date) {
    const primaryIndex = diffDays(start, date);
    const candidates = [];
    const lower = Math.max(0, primaryIndex - 3);
    const upper = Math.min(days.length - 1, primaryIndex);
    for (let index = lower; index <= upper; index += 1) {
      const day = days[index];
      for (const meal of day.meals || []) {
        const actualDate = actualMealDate(start, day, meal);
        if (actualDate === date) {
          candidates.push({
            ...meal,
            actual_date: actualDate,
            source_day: day,
            is_tail: day.global_day - 1 !== primaryIndex,
          });
        }
      }
    }
    return candidates.sort((a, b) => a.minute_of_day - b.minute_of_day);
  }

  function allEvents(days, start) {
    const events = [];
    for (const day of days) {
      for (const meal of day.meals || []) {
        events.push({
          ...meal,
          actual_date: actualMealDate(start, day, meal),
          source_day: day,
        });
      }
    }
    return events.sort((a, b) => {
      const dateDifference = toOrdinal(a.actual_date) - toOrdinal(b.actual_date);
      return dateDifference || a.minute_of_day - b.minute_of_day;
    });
  }

  function findNextEvent(days, start, date, minuteOfDay) {
    const targetOrdinal = toOrdinal(date);
    const targetMinute = Number(minuteOfDay || 0);
    return allEvents(days, start).find((event) => {
      const eventOrdinal = toOrdinal(event.actual_date);
      return eventOrdinal > targetOrdinal || (eventOrdinal === targetOrdinal && event.minute_of_day >= targetMinute);
    }) || null;
  }

  function planRange(start, duration) {
    const days = Number(duration || 180);
    return { start, end: addDays(start, days - 1) };
  }

  return {
    DAY_MS,
    parseISO,
    isValidISO,
    toISO,
    toOrdinal,
    fromOrdinal,
    addDays,
    diffDays,
    compareDates,
    minDate,
    maxDate,
    clampDate,
    todayISO,
    formatDate,
    formatLong,
    formatMedium,
    formatShort,
    capitalize,
    monthStart,
    monthEnd,
    addMonths,
    monthKey,
    sameMonth,
    mondayIndex,
    monthGridDates,
    mappingForIndex,
    planDayForDate,
    actualMealDate,
    eventsOnDate,
    allEvents,
    findNextEvent,
    planRange,
  };
});
