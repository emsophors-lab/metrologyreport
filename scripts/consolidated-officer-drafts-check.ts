import assert from 'node:assert/strict';
import fs from 'node:fs';
import { actionWindow, draftRecordedActions } from '../src/lib/consolidated/officerDrafts';
import type { StaffReviewEvidence } from '../src/lib/consolidated/officerDrafts';
import { analyzeConsolidatedData, automaticConsolidatedInputs } from '../src/lib/consolidated/automaticReport';
import type { ConsolidatedData } from '../src/lib/consolidated/contract';
import { reportingPeriod } from '../src/lib/consolidated/periods';

const data = JSON.parse(fs.readFileSync('src/lib/consolidated/__fixtures__/consolidated-sample-data.json', 'utf8')) as ConsolidatedData;
const period = reportingPeriod('MONTH', 2026, 4);
const asOf = '2026-05-05T00:00:00Z';
assert.deepEqual(actionWindow(period, asOf), { start: '2026-03-31T17:00:00.000Z', end: '2026-04-30T17:00:00.000Z', cutoff: '2026-05-05T00:00:00.000Z' });
const event: StaffReviewEvidence = { id: 1, licence_no: 'LIC-TEST', created_at: '2026-03-31T17:00:00Z',
  entity: 'report', action: 'accept', actor_role: 'admin', new_value: { status: 'ACCEPTED' } };
const actions = draftRecordedActions([
  event, event,
  { ...event, id: 2, action: 'return', new_value: { status: 'RETURNED' } },
  { ...event, id: 3, actor_role: 'company' },
  { ...event, id: 4, action: 'submit' },
  { ...event, id: 5, entity: 'instrument' },
  { ...event, id: 6, created_at: '2026-03-31T16:59:59Z' },
  { ...event, id: 7, created_at: '2026-04-30T17:00:00Z' },
  { ...event, id: 8, new_value: { status: 'SUBMITTED' } },
  { ...event, id: 9, created_at: 'invalid' },
], period, asOf, []);
assert.equal(actions.length, 2, 'One row per licensee per kind of staff action');
// An officer correcting an instrument row is the same intervention as one
// correcting the report, so entities beyond 'report' now count and join the
// group for that licensee and action.
assert.ok(String(actions[0].result).includes('#5'), 'a staff action on an instrument counts');
assert.equal(actions[0].date, '០១/០៤/២០២៦');
assert.equal(actions[0].licensee, 'LIC-TEST', 'No invented company name');
assert.ok(String(actions[0].result).includes('Audit #1'));
assert.ok(String(actions[1].action).includes('ត្រឡប់'));
assert.equal(draftRecordedActions([event], period, '2026-03-31T16:59:59Z', []).length, 0);
assert.equal(draftRecordedActions([], period, asOf, []).length, 0);
// 1205 identical events are one thing the Centre did, 1205 times. The table
// says so in one line rather than in 1205 — the same evidence, readable.
const many = draftRecordedActions(Array.from({ length: 1205 }, (_, i) => ({ ...event, id: i + 1 })), period, asOf, []);
assert.equal(many.length, 1, '1205 events of one kind group into one row');
assert.match(String(many[0].action), /១២០៥ លើក/, 'the row states how many times');
assert.ok(String(many[0].result).includes('+១២០០'), 'and how many audit ids are not listed');
const analysis = analyzeConsolidatedData(data);
assert.ok(analysis.proposals.length > 0);
// legal_basis is no longer always blank: rules the approved catalogue
// governs now carry their citation, and the rest still carry nothing.
assert.ok(analysis.proposals.every((row, i) => row.no === i + 1 && String(row.proposal).includes('ស្នើឱ្យ')));
assert.ok(analysis.proposals.some(row => String(row.legal_basis).includes('ប្រការ២១')), 'the deadline rules cite the deadline article');
assert.ok(analysis.proposals.some(row => row.legal_basis === ''), 'a rule the catalogue does not govern still cites nothing');
const draft = automaticConsolidatedInputs({ ...data, actions }, period);
assert.deepEqual(draft.actions, actions);
assert.deepEqual(draft.proposals, analysis.proposals);
const manual = { actions: [{ no: 1, licensee: 'Manual', action: 'Verified', date: '', result: '' }],
  proposals: [{ no: 1, proposal: 'Manual proposal', legal_basis: 'Officer-verified reference' }] };
assert.deepEqual(automaticConsolidatedInputs(data, period, manual).actions, manual.actions);
assert.deepEqual(automaticConsolidatedInputs(data, period, manual).proposals, manual.proposals);
assert.deepEqual(automaticConsolidatedInputs(data, period, { actions: [], proposals: [] }).proposals, [], 'Manual removal stays removed');
const unknown = { ...data, sub_notsub_total: 'មិនមានទិន្នន័យ', sub_late_total: 'មិនមានទិន្នន័យ' };
assert.ok(!analyzeConsolidatedData(unknown).proposals.some(row => String(row.proposal).includes('សហគ្រាសដែលដាក់របាយការណ៍យឺត')));
console.log('PASS: recorded-only staff actions across entities, grouping with counts, Cambodia boundaries, deduplication, 1205 events in one row, evidence-based proposals, catalogue-only legal references and manual overrides.');
