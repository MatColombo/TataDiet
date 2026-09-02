#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require(path.join(__dirname, "..", "docs", "assets", "js", "calendar-core.js"));
const calendar = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "data", "calendar.json"), "utf8"));

assert.equal(calendar.version, "5.2.1");
assert.equal(calendar.days.length, 180);
assert.equal(calendar.days.flatMap((day) => day.meals).length, 864);

assert.equal(core.isValidISO("2026-02-29"), false);
assert.equal(core.isValidISO("2028-02-29"), true);
assert.equal(core.addDays("2026-03-28", 1), "2026-03-29");
assert.equal(core.addDays("2026-03-28", 2), "2026-03-30");
assert.equal(core.addDays("2026-10-24", 1), "2026-10-25");
assert.equal(core.addDays("2026-10-24", 2), "2026-10-26");
assert.equal(core.diffDays("2026-10-24", "2026-10-26"), 2);

const expectedMappings = new Map([
  [0, { globalDay: 1, cycle: 1, variant: 1, dayInVariant: 1, dCode: "D1" }],
  [1, { globalDay: 2, cycle: 1, variant: 1, dayInVariant: 2, dCode: "D2" }],
  [29, { globalDay: 30, cycle: 1, variant: 6, dayInVariant: 5, dCode: "D5" }],
  [30, { globalDay: 31, cycle: 2, variant: 1, dayInVariant: 1, dCode: "D1" }],
  [179, { globalDay: 180, cycle: 6, variant: 6, dayInVariant: 5, dCode: "D5" }],
]);
for (const [index, expected] of expectedMappings) assert.deepEqual(core.mappingForIndex(index), expected);

calendar.days.forEach((day, index) => {
  const mapping = core.mappingForIndex(index);
  assert.equal(day.global_day, mapping.globalDay);
  assert.equal(day.cycle, mapping.cycle);
  assert.equal(day.variant, mapping.variant);
  assert.equal(day.day_in_variant, mapping.dayInVariant);
  assert.equal(day.d_code, mapping.dCode);
});

const start = "2026-09-07";
const dates = calendar.days.map((day) => core.addDays(start, day.global_day - 1));
assert.equal(new Set(dates).size, 180);
assert.equal(dates[0], start);
assert.equal(dates[179], core.addDays(start, 179));

const d2 = calendar.days[1];
const d3Date = core.addDays(start, 2);
const d3Events = core.eventsOnDate(calendar.days, start, d3Date);
const tails = d3Events.filter((event) => event.is_tail);
const primary = d3Events.filter((event) => !event.is_tail);
assert.equal(d2.d_code, "D2");
assert.deepEqual(tails.map((event) => event.time), ["03:30", "08:20"]);
assert.ok(tails.every((event) => event.source_day.global_day === 2));
assert.ok(primary.every((event) => event.source_day.global_day === 3));
assert.ok(primary.length > 0, "La data dello smonto deve contenere anche i pasti del D3");

const next = core.findNextEvent(calendar.days, start, d3Date, 600);
assert.equal(next.actual_date, d3Date);
assert.equal(next.time, "15:00");

for (const month of ["2026-02-01", "2026-03-01", "2026-10-01", "2027-01-01"]) {
  const grid = core.monthGridDates(month);
  assert.ok(grid.length === 35 || grid.length === 42);
  assert.equal(grid.length % 7, 0);
  assert.equal(core.mondayIndex(grid[0]), 0);
  assert.equal(core.mondayIndex(grid[grid.length - 1]), 6);
}

console.log(JSON.stringify({
  status: "ok",
  version: calendar.version,
  days: calendar.days.length,
  meals: calendar.days.flatMap((day) => day.meals).length,
  dstCases: ["2026-03-29", "2026-10-25"],
  d2TailEvents: tails.map((event) => event.time),
}, null, 2));
