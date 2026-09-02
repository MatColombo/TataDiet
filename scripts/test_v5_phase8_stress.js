const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../static/assets/js/v5-plan-core.js');

const template = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/data/v5/plan-template.base.v1.json'), 'utf8'));
let { plan, days } = core.buildPlan(template, '2026-09-01', template.dataset_version, '2026-08-26T12:00:00Z');
const initial = JSON.stringify({ plan, days });
const history = [];
const actions = 96;

function commit(action, params) {
  const oldPlan = JSON.parse(JSON.stringify(plan));
  const oldDays = JSON.parse(JSON.stringify(days));
  const result = core.applyAction(plan, days, action, params, template, '2026-08-26T12:00:00Z');
  const patch = core.diffPatch(oldPlan, oldDays, result.plan, result.days);
  history.push(patch);
  plan = result.plan;
  days = result.days;
  const validation = core.validateState(plan, days);
  assert.equal(validation.valid, true, validation.errors.join('; '));
}

for (let i = 0; i < actions; i += 1) {
  const idx = (i * 17) % days.length;
  const date = days[idx].date;
  switch (i % 8) {
    case 0:
      commit('mark-adherence', { date, status: ['followed', 'partial', 'not-followed'][i % 3] });
      break;
    case 1:
      commit('replace-day-type', { date, dayType: ['D1', 'D2', 'D3', 'D4', 'D5', 'M', 'P'][i % 7] });
      break;
    case 2:
      commit('leave-day-free', { date });
      break;
    case 3:
      if (days[idx].baseDayRef) commit('restore-day', { date });
      else commit('mark-adherence', { date, status: 'planned' });
      break;
    case 4:
      commit('insert-day', { date, dayType: i % 16 === 4 ? 'CUSTOM' : 'OFF', customShift: { name: 'Extra', startTime: '10:00', endTime: '22:00', endDayOffset: 0, capabilities: { reheat: false, refrigeration: true, complexSnack: false } } });
      break;
    case 5:
      // Keep the sequence bounded while repeatedly exercising structural shifts.
      if (days.length > 180) commit('remove-day', { date });
      else commit('postpone-sequence', { date });
      break;
    case 6:
      commit('mark-adherence', { date, status: 'planned' });
      break;
    default:
      commit('replace-day-type', { date, dayType: 'CUSTOM', customShift: { name: 'Turno test', startTime: '19:00', endTime: '07:00', endDayOffset: 1, capabilities: { reheat: false, refrigeration: true, complexSnack: false } } });
  }
}

const finalState = JSON.stringify({ plan, days });
assert.ok(days.length >= 179 && days.length <= 182, `dimensione inattesa: ${days.length}`);
assert.equal(core.validateState(plan, days).valid, true);

for (let i = history.length - 1; i >= 0; i -= 1) {
  const state = core.applyPatch(plan, days, history[i].before);
  plan = state.plan;
  days = state.days;
  assert.equal(core.validateState(plan, days).valid, true);
}
assert.equal(JSON.stringify({ plan, days }), initial, 'undo completo non ricostruisce lo stato iniziale');

for (const patch of history) {
  const state = core.applyPatch(plan, days, patch.after);
  plan = state.plan;
  days = state.days;
  assert.equal(core.validateState(plan, days).valid, true);
}
assert.equal(JSON.stringify({ plan, days }), finalState, 'redo completo non ricostruisce lo stato finale');

console.log(JSON.stringify({
  status: 'ok',
  version: '5.2.1',
  operations: history.length,
  finalDays: days.length,
  checks: { continuous_dates: true, unique_ids: true, structural_shifts: true, full_undo: true, full_redo: true }
}, null, 2));
