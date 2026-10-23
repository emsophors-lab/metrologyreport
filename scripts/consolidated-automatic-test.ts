import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { analyzeConsolidatedData, automaticConsolidatedFields, automaticConsolidatedInputs } from '../src/lib/consolidated/automaticReport';
import { prepareConsolidatedData } from '../src/lib/consolidated/buildConsolidatedData';
import { fillConsolidatedTemplate } from '../src/lib/consolidated/consolidatedDocx';
import { TEMPLATE_SHA256 } from '../src/lib/consolidated/contract';
import type { ConsolidatedData } from '../src/lib/consolidated/contract';
import { reportingPeriod } from '../src/lib/consolidated/periods';
import { templateTags } from '../src/lib/consolidated/templateContract';

const sample = JSON.parse(fs.readFileSync('src/lib/consolidated/__fixtures__/consolidated-sample-data.json', 'utf8')) as ConsolidatedData;
const period = reportingPeriod('MONTH', 2026, 10);
const now = new Date('2026-10-18T18:30:00Z');
const fields = automaticConsolidatedFields(period, now);
assert.equal(fields.letter_no, 'NMC-CONS-MONTH-2026-10');
assert.equal(fields.signed_day_kh, '១៩');
assert.equal(fields.signed_month_kh, 'តុលា');
assert.equal(fields.signed_year_kh, '២០២៦');
assert.equal(fields.prepared_date_kh, '១៩/១០/២០២៦');
assert.equal(fields.reviewed_date_kh, fields.prepared_date_kh);
assert.ok(fields.lunar_date_line.length > 20);
assert.ok(!fields.lunar_date_line.includes('មិនមានទិន្នន័យ'));
assert.equal(automaticConsolidatedFields(period, new Date('2026-06-27T18:00:00Z')).lunar_date_line,
  'ថ្ងៃអាទិត្យ ១៤កើត ខែបឋមាសាឍ ឆ្នាំមមី អដ្ឋស័ក ពុទ្ធសករាជ ២៥៧០');
assert.equal(automaticConsolidatedFields(period, new Date('2024-02-28T18:00:00Z')).prepared_date_kh, '២៩/០២/២០២៤');
assert.equal(automaticConsolidatedFields(period, new Date('2026-12-31T18:00:00Z')).signed_year_kh, '២០២៧');
assert.equal(automaticConsolidatedFields(period, new Date('2027-01-10T00:00:00Z')).letter_no, fields.letter_no);
assert.notEqual(automaticConsolidatedFields(reportingPeriod('QUARTER', 2026, 1), now).letter_no, fields.letter_no);
assert.throws(() => automaticConsolidatedFields(period, new Date('invalid')));

const analysis = analyzeConsolidatedData(sample);
const rules = analysis.findings.map(finding => finding.rule);
for (const rule of ['missing-reports', 'late-reports', 'failed-verification', 'pending-at-period-end', 'pending-over-30-days', 'annex-totals-mismatch']) {
  assert.ok(rules.includes(rule), rule);
}
assert.ok(!rules.includes('submission-totals-mismatch'));
assert.ok(!rules.includes('incomplete-data'));
assert.ok(analysis.challenges.length > 0 && analysis.conclusion.length > 100);
assert.ok(analysis.findings.every(finding => finding.fields.length && finding.fields.every(field => field in sample)));
assert.equal(analysis.findings.find(finding => finding.rule === 'pending-at-period-end')!.fields[0], 'backlog_total_cur');
const changedPending = { ...sample, total_pending: 999 };
assert.equal(analyzeConsolidatedData(changedPending).findings.find(finding => finding.rule === 'pending-at-period-end')!.text,
  analysis.findings.find(finding => finding.rule === 'pending-at-period-end')!.text, 'Use period-end stock, not summed pending activity');
assert.equal(analyzeConsolidatedData({ ...sample, sub_late_total: 0 }).findings.find(finding => finding.rule === 'missing-reports')!.text,
  analysis.findings.find(finding => finding.rule === 'missing-reports')!.text, 'Missing and late remain separate classes');

const unknown = { ...sample, sub_notsub_total: null, total_failed: 'មិនមានទិន្នន័យ', backlog_total_cur: '' } as unknown as ConsolidatedData;
const unknownAnalysis = analyzeConsolidatedData(unknown);
assert.ok(unknownAnalysis.findings.some(finding => finding.rule === 'incomplete-data'));
assert.ok(!unknownAnalysis.findings.some(finding => ['missing-reports', 'failed-verification', 'pending-at-period-end', 'no-flagged-indicators'].includes(finding.rule)));
for (const value of ['...', '-1', '5%', '2.5', '1,2', Infinity]) {
  const result = analyzeConsolidatedData({ ...sample, total_failed: value });
  assert.ok(result.findings.find(finding => finding.rule === 'incomplete-data')!.fields.includes('total_failed'), String(value));
}
assert.ok(analyzeConsolidatedData({ ...sample, total_failed: '១,២០០' }).findings.find(finding => finding.rule === 'failed-verification')!.text.includes('១,២០០'));
assert.ok(analyzeConsolidatedData({ ...sample, kpi_sub_rate_cur: '៨០%', kpi_sub_rate_prev: '90%' })
  .findings.find(finding => finding.rule === 'submission-rate-decreased')!.text.includes('១០ ចំណុចភាគរយ'));
assert.ok(!analyzeConsolidatedData({ ...sample, kpi_sub_rate_cur: '150%', kpi_sub_rate_prev: '160%' })
  .findings.some(finding => finding.rule === 'submission-rate-decreased'));
assert.ok(analyzeConsolidatedData({ ...sample, sub_submitted_total: 100 }).findings.some(finding => finding.rule === 'submission-totals-mismatch'));

const zero = structuredClone(sample);
for (const key of ['sub_active_total', 'sub_submitted_total', 'sub_notsub_total', 'sub_late_total', 'sub_ontime_total',
  'total_m', 'total_i', 'total_r', 'total_passed', 'total_failed', 'total_pending',
  'lic_total_m', 'lic_total_i', 'lic_total_r', 'lic_total_passed', 'lic_total_failed', 'lic_total_pending',
  'backlog_total_cur', 'backlog_over30_cur', 'std_expired_count', 'std_due60_count', 'lic_expiring90_count', 'out_of_scope_count'] as const) zero[key] = 0;
zero.kpi_sub_rate_cur = '0%'; zero.kpi_sub_rate_prev = '0%';
assert.deepEqual(analyzeConsolidatedData(zero).findings.map(finding => finding.rule), ['no-flagged-indicators']);

const override = { challenges: [{ text: 'កំណត់ចំណាំរបស់មន្ត្រី' }], conclusion: 'សេចក្ដីសន្និដ្ឋានរបស់មន្ត្រី',
  letter_no: 'STALE',
  // Not an OfficerInputs key any more: the preparer block is the machine's.
  // Still sent here on purpose, to prove a client cannot set it.
  ...({ prepared_date_kh: 'STALE', preparer_name: 'លោក ក', preparer_position: 'ប្រធាន' } as any) };
const automatic = automaticConsolidatedInputs(sample, period, {}, now);
assert.deepEqual(automatic.challenges, analysis.challenges);
assert.equal(automatic.conclusion, analysis.conclusion);
const overridden = automaticConsolidatedInputs(sample, period, override, now);
assert.deepEqual(overridden.challenges, override.challenges);
assert.equal(overridden.conclusion, override.conclusion);
assert.equal(overridden.letter_no, fields.letter_no);
assert.equal((overridden as any).prepared_date_kh, fields.prepared_date_kh);
// The preparer block names the system, whatever the request asked for.
assert.equal((overridden as any).preparer_name, 'រៀបចំដោយប្រព័ន្ធឆ្លាតវៃរបស់ ម.ម.ជ',
  'a request must not be able to put a person in the preparer block');
assert.match(String((overridden as any).preparer_position), /Smart Algorithm & AI/);
assert.equal(automaticConsolidatedInputs(sample, period, { conclusion: '' }, now).conclusion, '', 'Explicit manual blank is respected');
assert.equal(automaticConsolidatedInputs(sample, period, { conclusion: undefined }, now).conclusion, analysis.conclusion, 'Reset restores algorithm');
const original = JSON.stringify(sample);
const formatted = prepareConsolidatedData(sample, period, automatic);
assert.equal(formatted.letter_no, fields.letter_no);
assert.equal(formatted.conclusion, analysis.conclusion);
assert.equal(JSON.stringify(sample), original, 'No mutation of original aggregates');
const template = fs.readFileSync('public/templates/Consolidated_template_v1.docx');
const document = fillConsolidatedTemplate(template, formatted).getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
assert.deepEqual(templateTags(document), {});
fs.mkdirSync('test-output', { recursive: true });
fs.writeFileSync('test-output/Consolidated_SAMPLE_AUTOMATIC.docx', document);
fs.writeFileSync('test-output/Consolidated_automatic_analysis.json', JSON.stringify({ generated_at: now.toISOString(), fields, analysis }, null, 2));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('public/templates/Consolidated_template_v1.docx')).digest('hex'), TEMPLATE_SHA256);
console.log('PASS: Cambodia dates/lunar line, deterministic reference, evidence-based narratives, zero/unknown, invalid counts, reconciliation, manual overrides, immutable template and automatic DOCX. Host timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone);
