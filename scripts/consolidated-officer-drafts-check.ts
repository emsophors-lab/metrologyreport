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
assert.equal(actions.length, 2, 'Only recorded staff accept/return outcomes in the period');
assert.equal(actions[0].date, '០១/០៤/២០២៦');
assert.equal(actions[0].licensee, 'LIC-TEST', 'No invented company name');
assert.ok(String(actions[0].result).includes('Audit #1'));
assert.ok(String(actions[1].action).includes('ត្រឡប់'));
assert.equal(draftRecordedActions([event], period, '2026-03-31T16:59:59Z', []).length, 0);
assert.equal(draftRecordedActions([], period, asOf, []).length, 0);
assert.equal(draftRecordedActions(Array.from({ length: 1205 }, (_, i) => ({ ...event, id: i + 1 })), period, asOf, []).length, 1205);
const analysis = analyzeConsolidatedData(data);
assert.ok(analysis.proposals.length > 0);
assert.ok(analysis.proposals.every((row, i) => row.no === i + 1 && row.legal_basis === '' && String(row.proposal).includes('ស្នើឱ្យ')));
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
console.log('PASS: recorded-only staff actions, Cambodia boundaries, deduplication, 1205 events, evidence-based proposals, no invented legal references and manual overrides.');
