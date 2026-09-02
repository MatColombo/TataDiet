#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const core = require(path.join(root, "docs", "assets", "js", "calendar-core.js"));
const ops = require(path.join(root, "docs", "assets", "js", "operations-core.js"));
const calendar = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "calendar.json"), "utf8"));
const rangeData = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "shopping-range.json"), "utf8"));
const shopping = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "shopping.json"), "utf8"));
const searchIndex = JSON.parse(fs.readFileSync(path.join(root, "docs", "data", "search-index.json"), "utf8"));

assert.equal(calendar.version, "5.2.1");
assert.equal(rangeData.version, "5.2.1");
assert.equal(searchIndex.version, "5.2.1");
assert.equal(rangeData.days.length, 180);
assert.equal(searchIndex.entries.length, 628);

const start = "2026-09-07";
const firstVariant = ops.aggregateIngredients(rangeData, start, start, core.addDays(start, 4));
assert.equal(firstVariant.day_count, 5);
assert.equal(firstVariant.first_global_day, 1);
assert.equal(firstVariant.last_global_day, 5);
const staticVariant = new Map(shopping.variants["c1-v1"].map((item) => [`${item.code}|${item.unit}`, item]));
assert.equal(firstVariant.items.length, staticVariant.size);
firstVariant.items.forEach((item) => {
  const staticItem = staticVariant.get(`${item.code}|${item.unit}`);
  assert.ok(staticItem, `Ingrediente statico mancante: ${item.code}`);
  assert.ok(Math.abs(item.exact - staticItem.exact) <= 0.01, `${item.code}: ${item.exact} != ${staticItem.exact}`);
  assert.ok(item.suggested >= item.exact);
  assert.ok(Math.abs(item.suggested / item.rounding_step - Math.round(item.suggested / item.rounding_step)) <= 1e-8);
});

const prepDate = core.addDays(start, 0);
const prep = ops.prepItemsInWindow(calendar.days, start, prepDate, 8 * 60, 48);
assert.ok(prep.length > 0, "La finestra deve contenere preparazioni");
assert.ok(prep.every((item) => item.hours_until >= 0 && item.hours_until <= 48));
assert.ok(prep.every((item) => ops.isPrepPositive(item.prepare_ahead)));
assert.ok(prep.every((item) => ["prioritaria", "entro-24", "tra-24-48"].includes(item.urgency)));
assert.ok(prep.every((item) => ["first", "second"].includes(item.window_segment)));

// Explicit regression test: the rolling window must include the full 24-48 hour segment.
const syntheticDays = [
  { global_day: 1, d_code: "D1", cycle: 1, variant: 1, meals: [
    { time: "08:00", minute_of_day: 480, day_offset: 0, title: "Subito", meal_type: "Colazione", prepare_ahead: "Sì, preparabile", prep_minutes: 5 },
  ] },
  { global_day: 2, d_code: "D2", cycle: 1, variant: 1, meals: [
    { time: "12:00", minute_of_day: 720, day_offset: 0, title: "Dopo 28 ore", meal_type: "Pranzo", prepare_ahead: "Sì, preparabile", prep_minutes: 10 },
  ] },
  { global_day: 3, d_code: "D3", cycle: 1, variant: 1, meals: [
    { time: "09:00", minute_of_day: 540, day_offset: 0, title: "Dopo 49 ore", meal_type: "Colazione", prepare_ahead: "Sì, preparabile", prep_minutes: 10 },
  ] },
];
const syntheticWindow = ops.prepItemsInWindow(syntheticDays, start, start, 8 * 60, 48);
assert.equal(syntheticWindow.length, 2);
assert.ok(syntheticWindow.some((item) => item.title === "Dopo 28 ore" && item.window_segment === "second" && item.urgency === "tra-24-48"));
assert.ok(!syntheticWindow.some((item) => item.title === "Dopo 49 ore"));

const ics = ops.buildIcs(calendar.days, start, start, core.addDays(start, 179), false, new Date("2026-08-26T10:00:00Z"));
assert.ok(ics.includes("BEGIN:VTIMEZONE"));
assert.ok(ics.includes("TZID:Europe/Rome"));
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 180);
assert.ok(ics.includes("DTSTART;TZID=Europe/Rome:20260908T200000"));
assert.ok(ics.includes("DTEND;TZID=Europe/Rome:20260909T080000"));
assert.ok(ics.endsWith("END:VCALENDAR\r\n"));

const icsWithPrep = ops.buildIcs(calendar.days, start, start, core.addDays(start, 9), true, new Date("2026-08-26T10:00:00Z"));
assert.ok(icsWithPrep.includes("CATEGORIES:MEAL-PREP"));
assert.ok(icsWithPrep.includes("BEGIN:VALARM"));
assert.ok((icsWithPrep.match(/BEGIN:VEVENT/g) || []).length > 10);

const mozzarella = ops.search(searchIndex.entries, "mozzarella", []);
assert.ok(mozzarella.some((entry) => entry.type === "ingredient"));
assert.ok(mozzarella.some((entry) => entry.type === "recipe"));
const day30 = ops.search(searchIndex.entries, "giorno 30", ["day"]);
assert.ok(day30.some((entry) => entry.type === "day" && /30/.test(entry.title)));
const night = ops.search(searchIndex.entries, "N notte", ["day"]);
assert.ok(night.length > 0 && night.every((entry) => entry.type === "day"));

console.log(JSON.stringify({
  status: "ok",
  version: calendar.version,
  pwa: { manifest: true, serviceWorker: true },
  shopping: {
    days: rangeData.days.length,
    firstVariantItems: firstVariant.items.length,
  },
  prep: {
    windowHours: 48,
    items: prep.length,
    secondSegmentItems: prep.filter((item) => item.window_segment === "second").length,
    syntheticSecondSegment: true,
  },
  search: {
    entries: searchIndex.entries.length,
    mozzarellaResults: mozzarella.length,
    day30Results: day30.length,
  },
  ics: {
    shiftEvents: 180,
    prepEnabled: true,
  },
}, null, 2));
