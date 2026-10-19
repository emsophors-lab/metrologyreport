import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import PizZip from 'pizzip';
import { dataProblems, LOOP_FIELDS, SCALAR_KEYS, TEMPLATE_SHA256, UNKNOWN } from '../src/lib/consolidated/contract';
import type { ConsolidatedData } from '../src/lib/consolidated/contract';
import { prepareConsolidatedData } from '../src/lib/consolidated/buildConsolidatedData';
import { consolidatedFileName, fillConsolidatedTemplate } from '../src/lib/consolidated/consolidatedDocx';
import { periodChange, previousPeriod, reportingPeriod, toKhmerDigits } from '../src/lib/consolidated/periods';
import type { PeriodType } from '../src/lib/consolidated/periods';
import { templateDataProblems, templateTags } from '../src/lib/consolidated/templateContract';

const template = fs.readFileSync('public/templates/Consolidated_template_v1.docx');
const sample = JSON.parse(fs.readFileSync('src/lib/consolidated/__fixtures__/consolidated-sample-data.json', 'utf8')) as ConsolidatedData;
const hash = (buf: Uint8Array) => crypto.createHash('sha256').update(buf).digest('hex');
assert.equal(hash(template), TEMPLATE_SHA256);
assert.deepEqual(dataProblems(sample), []);
assert.deepEqual(templateDataProblems(templateTags(template), sample), ['Unused template value: head_name']);
assert.ok(dataProblems({ ...sample, total_m: undefined }).includes('Invalid scalar: total_m'));
const missingCell = structuredClone(sample);
delete (missingCell.licensees[0] as any).licence_no;
assert.ok(dataProblems(missingCell).some(p => p.includes('licensees[0].licence_no')));

// Independent miniature parser fixture. The official template is never edited.
function parserFixture(body: string) {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generate({ type: 'uint8array' });
}
const splitTags = templateTags(parserFixture('<w:p><w:r><w:t>{split_</w:t></w:r><w:r><w:t>key}</w:t></w:r></w:p>'));
assert.deepEqual(splitTags, { split_key: {} });
const nested = templateTags(parserFixture('<w:p><w:r><w:t>{#outer}{name}{#inner}{text}{/inner}{/outer}</w:t></w:r></w:p>'));
assert.deepEqual(templateDataProblems(nested, { outer: [{ name: 'KH', inner: [{ text: 'សាកល្បង' }] }] }), []);
assert.ok(templateDataProblems(nested, { outer: [{ name: 'KH', inner: [{}] }] }).some(p => p.includes('inner[0].text')));

fs.mkdirSync('test-output', { recursive: true });
function render(name: string, data: ConsolidatedData) {
  const buf = fillConsolidatedTemplate(template, data).getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const zip = new PizZip(buf);
  assert.ok(zip.file('[Content_Types].xml'));
  assert.ok(zip.file('word/document.xml'));
  assert.deepEqual(templateTags(buf), {}, 'Every placeholder resolves across all Word parts');
  fs.writeFileSync(`test-output/${name}`, buf);
  return zip;
}
const rendered = render('Consolidated_SAMPLE_SEMESTER.docx', sample);
const expected = new PizZip(fs.readFileSync('docs/consolidated/Consolidated_sample_filled.docx'));
const differentParts = Object.keys(expected.files).filter(name => !expected.files[name].dir &&
  (!rendered.file(name) || !Buffer.from(expected.file(name)!.asUint8Array()).equals(Buffer.from(rendered.file(name)!.asUint8Array()))));
// The supplied template has a literal signer; the supplied filled sample has
// a dotted signature line. Report that source conflict without altering either.
assert.ok(rendered.file('word/styles.xml')!.asText() === expected.file('word/styles.xml')!.asText());
assert.ok(differentParts.includes('word/document.xml'));

for (const [type, index, start, end, prevKey] of [
  ['MONTH', 1, '2026-01-01', '2026-01-31', '2025-12'],
  ['QUARTER', 1, '2026-01-01', '2026-03-31', '2025-Q4'],
  ['SEMESTER', 1, '2026-01-01', '2026-06-30', '2025-S2'],
  ['YEAR', 1, '2026-01-01', '2026-12-31', '2025'],
] as Array<[PeriodType, number, string, string, string]>) {
  const period = reportingPeriod(type, 2026, index);
  assert.equal(period.start, start); assert.equal(period.end, end);
  assert.equal(previousPeriod(period).key, prevKey);
  const empty = structuredClone(sample);
  // Controlled empty aggregate fixture, not production data or a source-row aggregator.
  for (const key of SCALAR_KEYS) {
    if (typeof (empty as any)[key] === 'number') (empty as any)[key] = 0;
    else if (String((empty as any)[key]).endsWith('%')) (empty as any)[key] = '0.0%';
    else if (key.endsWith('_chg') || key.startsWith('chg_')) (empty as any)[key] = 'ថ្មី';
    else if (key.endsWith('_kh') && /[០-៩]/.test(String((empty as any)[key]))) (empty as any)[key] = '០';
  }
  for (const key of Object.keys(LOOP_FIELDS)) (empty as any)[key] = [];
  empty.conclusion = '';
  const data = prepareConsolidatedData(empty, period, { letter_no: 'TEST-001', challenges: [], actions: [], proposals: [] });
  assert.equal(data.letter_no, 'TEST-001'); assert.equal(data.total_m, 0);
  for (const key of ['late_list', 'provinces', 'failed', 'seals', 'licensees'] as const) assert.equal(data[key].length, 1);
  assert.equal(data.challenges.length, 3); assert.equal(data.actions.length, 3); assert.equal(data.proposals.length, 3);
  assert.equal(Object.values(data).filter(value => value === '☑').length, 1);
  assert.ok(String(data.period_label_kh).includes('២០២៦'));
  render(`Consolidated_FIXTURE_${type}_EMPTY.docx`, data);
}
assert.equal(reportingPeriod('MONTH', 2024, 2).end, '2024-02-29');
assert.equal(reportingPeriod('QUARTER', 2026, 4).end, '2026-12-31');
assert.equal(reportingPeriod('SEMESTER', 2026, 2).months.length, 6);
assert.throws(() => reportingPeriod('QUARTER', 2026, 5));
assert.throws(() => reportingPeriod('INVALID' as PeriodType, 2026));
assert.equal(periodChange(110, 100), '+10.0%');
assert.equal(periodChange(87.5, 81.8, true), '+5.7 pt');
assert.equal(periodChange(1, 0), 'ថ្មី');
assert.equal(periodChange(null, 0), UNKNOWN);
assert.equal(toKhmerDigits('08/07/2026'), '០៨/០៧/២០២៦');
assert.equal(consolidatedFileName(reportingPeriod('YEAR', 2026), new Date('2026-01-01T18:00:00Z')), 'Consolidated_YEAR_2026_2026-01-02.docx');
const unknown = prepareConsolidatedData({ ...sample, total_pending: null }, reportingPeriod('SEMESTER', 2026, 1));
assert.equal(unknown.total_pending, UNKNOWN, 'Unknown is never turned into zero');
const officer = { letter_no: 'OFFICER-KEEP', conclusion: 'សេចក្ដីសន្និដ្ឋានរបស់មន្ត្រី' };
const refreshed = prepareConsolidatedData({ ...sample, total_m: 99 }, reportingPeriod('SEMESTER', 2026, 1), officer);
assert.equal(refreshed.letter_no, officer.letter_no); assert.equal(refreshed.conclusion, officer.conclusion);

const bulk = structuredClone(sample);
bulk.licensees = Array.from({ length: 80 }, (_, i) => ({ ...sample.licensees[0], no: i + 1, licence_no: `FIXTURE-LIC-${i + 1}` }));
const bulkZip = render('Consolidated_FIXTURE_80_LICENSEES.docx', bulk);
assert.ok(bulkZip.file('word/document.xml')!.asText().includes('FIXTURE-LIC-80'));

const cats = ['nawi', 'weighbridge', 'weights', 'fuel', 'lpg', 'elec', 'water', 'ev', 'other'];
for (const metric of ['m', 'i', 'r', 'passed', 'failed', 'pending', 'ytd']) {
  assert.equal(cats.reduce((n, category) => n + Number((sample as any)[`${category}_${metric}`]), 0), Number((sample as any)[`total_${metric}`]));
}
const discrepancies: string[] = [];
for (const metric of ['m', 'i', 'r', 'passed', 'failed', 'pending']) {
  const sum = sample.licensees.reduce((n, row) => n + Number((row as any)[metric]), 0);
  assert.equal(sum, Number((sample as any)[`lic_total_${metric}`]));
  if (sum !== Number((sample as any)[`total_${metric}`])) discrepancies.push(`${metric}: Annex 1 ${sum}; section 3 ${String((sample as any)[`total_${metric}`])}`);
}
assert.ok(discrepancies.length > 0, 'Known sample reconciliation discrepancy must be reported');
fs.writeFileSync('test-output/Consolidated_validation.json', JSON.stringify({
  template_sha256: hash(template), sample_matches_expected_package: false, differing_expected_parts: differentParts,
  accepted_static_fields: ['head_name: department head is already printed in the official template, confirmed by owner'], sample_reconciliation_issues: discrepancies,
  passed: ['split-run and nested-loop tag parsing', 'period boundaries', 'previous periods across year boundaries', 'leap year', 'Khmer digits', 'empty tables', 'unknown versus zero',
    'officer fields preserved on refresh', 'valid DOCX packages', 'no unresolved tags', '80 licensees', 'category totals', 'Annex 1 internal totals'],
  not_run: ['production Supabase RPC deployment', 'historical backlog', 'persistent drafts', 'finalized snapshots'],
}, null, 2));
assert.equal(hash(fs.readFileSync('public/templates/Consolidated_template_v1.docx')), TEMPLATE_SHA256);
console.log('PASS: template integrity, periods, rendering, empty/long tables and formatting.');
console.log('EXPECTED SAMPLE DIFFERENCE: template prints a literal signer, expected sample has a dotted name. Differing parts: ' + differentParts.join(', '));
console.log('ACCEPTED: head_name is unused; owner confirmed the static department head in the supplied template.');
console.log('SAMPLE RECONCILIATION ISSUES:\n' + discrepancies.join('\n'));
console.log('NOT RUN HERE: production Supabase deployment and storage/finalization. Local SQL aggregation is verified separately by consolidated-db-test.ts.');
