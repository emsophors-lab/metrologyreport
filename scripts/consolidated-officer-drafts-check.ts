import assert from 'node:assert/strict';
import fs from 'node:fs';
import { actionWindow, draftRecordedActions, draftReviewOutcomes, groupActionEvents } from '../src/lib/consolidated/officerDrafts';
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
const actions = groupActionEvents(draftRecordedActions([
  event, event,
  { ...event, id: 2, action: 'return', new_value: { status: 'RETURNED' } },
  { ...event, id: 3, actor_role: 'company' },
  { ...event, id: 4, action: 'submit' },
  { ...event, id: 5, entity: 'instrument' },
  { ...event, id: 6, created_at: '2026-03-31T16:59:59Z' },
  { ...event, id: 7, created_at: '2026-04-30T17:00:00Z' },
  { ...event, id: 8, new_value: { status: 'SUBMITTED' } },
  { ...event, id: 9, created_at: 'invalid' },
], period, asOf), []);
assert.equal(actions.length, 2, 'One row per licensee per kind of staff action');
// An officer correcting an instrument row is the same intervention as one
// correcting the report, so entities beyond 'report' now count and join the
// group for that licensee and action.
assert.equal(actions[0].action, 'ពិនិត្យ និងទទួលយករបាយការណ៍ ២ លើក',
  'a staff action on an instrument counts alongside the one on the report');
assert.equal(actions[0].date, '០១/០៤/២០២៦');
assert.equal(actions[0].licensee, 'LIC-TEST', 'No invented company name');
assert.match(String(actions[0].result), /កំណត់ត្រា ២/, 'the row says how many records stand behind it');
assert.ok(String(actions[1].action).includes('ត្រឡប់'));
assert.equal(groupActionEvents(draftRecordedActions([event], period, '2026-03-31T16:59:59Z'), []).length, 0);
assert.equal(groupActionEvents(draftRecordedActions([], period, asOf), []).length, 0);
// 1205 identical events are one thing the Centre did, 1205 times. The table
// says so in one line rather than in 1205 — the same evidence, readable.
const many = groupActionEvents(draftRecordedActions(Array.from({ length: 1205 }, (_, i) => ({ ...event, id: i + 1, report_uuid: 'r' + i } as any)), period, asOf), []);
assert.equal(many.length, 1, '1205 events of one kind group into one row');
assert.match(String(many[0].action), /១២០៥ លើក/, 'the row states how many times');
assert.match(String(many[0].result), /កំណត់ត្រា ១២០៥/, 'and how many records stand behind it');
/* ---- 6.1 from the reports themselves, when the audit log is empty ---- */
// This is the case that made 6.1 blank on production: no audit rows at all,
// while the report rows said plainly that reports had been accepted.
const outcomes = draftReviewOutcomes([
  { id: 'r1', licence_no: 'LIC-A', status: 'ACCEPTED', reviewer: 'officer',
    received_at: '2026-04-10T03:00:00Z', returned_at: null, updated_at: null, period_month: '2026-04' },
  { id: 'r2', licence_no: 'LIC-A', status: 'ACCEPTED', reviewer: 'officer',
    received_at: '2026-04-12T03:00:00Z', returned_at: null, updated_at: null, period_month: '2026-04' },
  { id: 'r3', licence_no: 'LIC-B', status: 'RETURNED', reviewer: 'officer',
    received_at: null, returned_at: '2026-04-11T03:00:00Z', updated_at: null, period_month: '2026-04' },
  // Still being filled in: not an action the Centre has taken.
  { id: 'r4', licence_no: 'LIC-C', status: 'SUBMITTED', reviewer: null,
    received_at: null, returned_at: null, updated_at: null, period_month: '2026-04' },
], []);
const fromReports = groupActionEvents(outcomes, []);
assert.equal(fromReports.length, 2, 'an empty audit log no longer empties 6.1');
assert.match(String(fromReports[0].action), /ទទួលយក.*២ លើក/, 'two accepted reports for one licensee are one row of two');
assert.match(String(fromReports[1].action), /ត្រឡប់/);
assert.ok(!fromReports.some(r => String(r.licensee).includes('LIC-C')), 'a submitted report is not an action taken');

// The same outcome held in BOTH records is one action, not two.
const audit = draftRecordedActions([{ id: 9, licence_no: 'LIC-A', created_at: '2026-04-10T03:00:00Z',
  entity: 'report', action: 'accept', actor_role: 'admin', new_value: { status: 'ACCEPTED' },
  report_uuid: 'r1' } as any], period, asOf);
assert.equal(groupActionEvents([...audit, ...outcomes], []).find(r => String(r.licensee).includes('LIC-A'))!.action,
  'ពិនិត្យ និងទទួលយករបាយការណ៍ ២ លើក', 'the audit row and the report row for r1 count once');

// A record with no usable timestamp is reported, not dropped.
const undated = groupActionEvents(draftReviewOutcomes([
  { id: 'r9', licence_no: 'LIC-D', status: 'ACCEPTED', reviewer: 'officer',
    received_at: null, returned_at: null, updated_at: null, period_month: '2026-04' },
], []), []);
assert.equal(undated.length, 1, 'an action without a date is still an action');
assert.match(String(undated[0].date), /២០២៦-០៤|មិនមានកាលបរិច្ឆេទ/);

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
