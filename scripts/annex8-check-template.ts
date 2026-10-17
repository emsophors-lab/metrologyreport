/**
 * Annex 8 template check — run in CI.
 *
 *   npm run annex8:check
 *
 * Two jobs:
 *
 *  1. The tag contract. Every tag in templates/Annex8_template_<v>.docx must
 *     have a value from buildAnnex8Data (or be a loop item key), and every key
 *     buildAnnex8Data produces must appear as a tag. Either kind of mismatch
 *     fails the build: a missing tag means a blank in the official document, an
 *     unused key means the template dropped a field the system still fills.
 *
 *  2. Four fixtures rendered into test-output/ for visual review: the sample
 *     payload, a NIL report, an AMENDMENT, and a 40-instrument report that
 *     exercises the Part 3 row loop across a page break.
 *
 * When this fails because the template changed, the fix belongs in the
 * template, not in fill-annex8.ts — the error names the tag to look at.
 */
import fs from 'fs';
import path from 'path';

import {
  LOOP_ARRAY_KEYS,
  LOOP_ITEM_KEYS,
  buildAnnex8Data,
  fillAnnex8Template,
  listTags,
} from '../src/lib/annex8/annex8Docx';

const ROOT = process.cwd();
const VERSION = process.env.ANNEX8_TEMPLATE_VERSION || 'v1';
const TEMPLATE = path.join(ROOT, 'public', 'templates', `Annex8_template_${VERSION}.docx`);
const PAYLOAD = path.join(ROOT, 'src', 'lib', 'annex8', '__fixtures__', 'sample-payload.json');
const OUT_DIR = path.join(ROOT, 'test-output');

/**
 * The loop arrays are consumed by {#…} sections rather than printed as a
 * value, so they are not expected among the plain tags.
 */
const NOT_PRINTED = new Set(LOOP_ARRAY_KEYS);

function fail(lines: string[]): never {
  console.error(`\n✗ Annex 8 template check failed (${path.relative(ROOT, TEMPLATE)})\n`);
  lines.forEach((l) => console.error(`  ${l}`));
  console.error('\nFix the template, not fill-annex8.ts.\n');
  process.exit(1);
}

if (!fs.existsSync(TEMPLATE)) fail([`Template not found: ${TEMPLATE}`]);
if (!fs.existsSync(PAYLOAD)) fail([`Sample payload not found: ${PAYLOAD}`]);

const template = fs.readFileSync(TEMPLATE);
const sample = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'));

/* ---------------------------------------------------------------- *
 * 1. Tag contract
 * ---------------------------------------------------------------- */

const data = buildAnnex8Data(sample.report, sample.extra);
const rawTags = listTags(template);
// {#x} / {/x} / {^x} are section markers for the same name as the loop array.
const tagNames = new Set(rawTags.map((t: string) => t.replace(/^[#^/]/, '')));
const dataKeys = new Set(Object.keys(data));
const loopKeys = new Set(LOOP_ITEM_KEYS);

const missing = [...tagNames].filter((t) => !dataKeys.has(t) && !loopKeys.has(t)).sort();
const unused = [...dataKeys].filter((k) => !tagNames.has(k) && !NOT_PRINTED.has(k)).sort();

const problems: string[] = [];
if (missing.length) {
  problems.push(`Tags in the template with no value from buildAnnex8Data (${missing.length}):`);
  missing.forEach((t) => problems.push(`  {${t}}`));
}
if (unused.length) {
  problems.push(`Values buildAnnex8Data produces that no tag prints (${unused.length}):`);
  unused.forEach((k) => problems.push(`  ${k}`));
}
if (problems.length) fail(problems);

console.log(`✓ Tag contract: ${tagNames.size} tags, all matched (template ${VERSION}).`);

/* ---------------------------------------------------------------- *
 * 2. Fixtures for visual review
 * ---------------------------------------------------------------- */

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A NIL report: the month had no activity, so every loop prints its "គ្មាន" row. */
function nilFixture() {
  const f = clone(sample);
  f.report.meta.report_type = 'NIL';
  f.report.part3_instruments = [];
  f.report.part3a_modules = [];
  f.report.part4_repairs = [];
  f.report.part5_standards = [];
  f.report.carry_over_updates = [];
  f.extra.report_id = 'NMC-RPT-202609-NIL01';
  f.extra.on_time = true;
  return f;
}

/** An AMENDMENT: corrects an earlier report, so the original id must print. */
function amendmentFixture() {
  const f = clone(sample);
  f.report.meta.report_type = 'AMENDMENT';
  f.report.meta.original_report_id = 'NMC-RPT-202608-00031';
  f.extra.report_id = 'NMC-RPT-202609-00043';
  // Late on purpose, so the NMC box prints the late checkbox instead.
  f.extra.on_time = false;
  return f;
}

/** 40 instruments: Part 3 has to repeat its row across page breaks. */
function bulkFixture() {
  const f = clone(sample);
  const base = sample.report.part3_instruments[0];
  f.report.part3_instruments = Array.from({ length: 40 }, (_, i) => {
    const row = clone(base);
    row.serial_no = `BULK-26-${String(i + 1).padStart(4, '0')}`;
    row.label_qr_no = `QR-${String(900000 + i)}`;
    row.op_code = i % 3 === 0 ? 'M' : 'I';
    row.verification_status = ['PASSED', 'FAILED', 'PENDING'][i % 3];
    if (row.verification_status === 'PENDING') {
      row.verification_cert_no = '';
      row.verification_date = '';
    }
    return row;
  });
  f.extra.report_id = 'NMC-RPT-202609-00044';
  return f;
}

const fixtures: Array<[string, any]> = [
  ['Annex8_sample.docx', sample],
  ['Annex8_nil.docx', nilFixture()],
  ['Annex8_amendment.docx', amendmentFixture()],
  ['Annex8_40_instruments.docx', bulkFixture()],
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, fixture] of fixtures) {
  const buf: Buffer = fillAnnex8Template(template, fixture.report, fixture.extra)
    .getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const target = path.join(OUT_DIR, name);
  fs.writeFileSync(target, buf);
  console.log(`✓ ${path.relative(ROOT, target)} (${(buf.length / 1024).toFixed(1)} kB)`);
}

console.log('\nOpen the files in test-output/ to review the layout.');
