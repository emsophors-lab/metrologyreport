/**
 * The Smart Analytics report: template contract and rendering.
 *
 *   npm run analytics:check
 *
 * Three things, in order of how expensive they are to get wrong:
 *
 *  1. Every tag in Analytics_template_v1.docx has a value in our data, and
 *     every value we build is used by the template. A tag added in Word and
 *     not here would print blank in a report to the Director General; a value
 *     we compute and never print is wasted work nobody notices.
 *
 *  2. The rules NMC set hold on real output: every forecast carries a 95%
 *     interval or says plainly that it has none; every anomaly has a review
 *     status; every high-risk score is explained; the quality table excludes
 *     models below min_sample.
 *
 *  3. The sample data renders, and so do edge cases — no history, no
 *     anomalies, a licensee with no previous score.
 *
 * The template itself is never modified. It is read, hashed and filled.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';

import {
  DEFAULT_MIN_SAMPLE, LOOP_FIELDS, NOT_MEASURED, REVIEW_STATUSES, RISK_BANDS,
  SCALAR_KEYS, TEMPLATE_SHA256, UNKNOWN, dataProblems, riskLevel,
} from '../src/lib/analytics/contract';
import type { AnalyticsData } from '../src/lib/analytics/contract';
import { buildAnalyticsData } from '../src/lib/analytics/buildAnalyticsData';
import type { AnalyticsSource } from '../src/lib/analytics/buildAnalyticsData';
import { fillAnalyticsTemplate, analyticsFileName } from '../src/lib/analytics/analyticsDocx';
import { forecastNext } from '../src/lib/analytics/forecast';
import { reportingPeriod } from '../src/lib/consolidated/periods';

const TEMPLATE = 'public/templates/Analytics_template_v1.docx';
const SAMPLE = 'src/lib/analytics/__fixtures__/analytics-sample-data.json';
const OUT = 'test-output';

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  OK   ${name}`);
  else { failures++; console.error(`  FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
};

const template = fs.readFileSync(TEMPLATE);
const sample = JSON.parse(fs.readFileSync(SAMPLE, 'utf8')) as AnalyticsData;
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ *
 * 1. The template is the approved one
 * ------------------------------------------------------------------ */
console.log('\nTemplate');
const hash = crypto.createHash('sha256').update(template).digest('hex');
check(`SHA-256 matches the approved file (${hash.slice(0, 12)}…)`, hash === TEMPLATE_SHA256,
  { expected: TEMPLATE_SHA256, actual: hash });

/** Tags as docxtemplater sees them, from the flattened document text. */
function templateTags(buf: Buffer) {
  const zip = new PizZip(buf);
  const parts = Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  const loops = new Set<string>();
  const scalars = new Set<string>();
  for (const part of parts) {
    const text = zip.files[part].asText().replace(/<[^>]+>/g, '');
    for (const [, sigil, name] of text.matchAll(/\{([#/^]?)([\w.\-]+)\}/g)) {
      if (sigil === '#' || sigil === '^') loops.add(name);
      else if (sigil !== '/') scalars.add(name);
    }
  }
  return { loops, scalars };
}

const { loops, scalars } = templateTags(template);
const loopItemKeys = new Set(Object.values(LOOP_FIELDS).flat() as string[]);

console.log('\nEvery template tag has a value, and every value is used');
const missing = [...scalars].filter(t => !SCALAR_KEYS.includes(t) && !loopItemKeys.has(t));
check('no template tag is missing from the contract', missing.length === 0, missing);

const unusedLoops = Object.keys(LOOP_FIELDS).filter(l => !loops.has(l));
check('every loop in the contract exists in the template', unusedLoops.length === 0, unusedLoops);

const unknownLoops = [...loops].filter(l => !(l in LOOP_FIELDS));
check('every loop in the template is in the contract', unknownLoops.length === 0, unknownLoops);

const unusedScalars = SCALAR_KEYS.filter(k => !scalars.has(k));
check('no contract scalar goes unused by the template', unusedScalars.length === 0, unusedScalars);

/* ------------------------------------------------------------------ *
 * 2. The supplied sample is a valid data object
 * ------------------------------------------------------------------ */
console.log('\nThe supplied sample data');
check('passes the contract', dataProblems(sample).length === 0, dataProblems(sample));
const sampleDoc = fillAnalyticsTemplate(template, sample);
const sampleOut = sampleDoc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(path.join(OUT, 'Analytics_SAMPLE.docx'), sampleOut);
const sampleText = new PizZip(sampleOut).files['word/document.xml'].asText().replace(/<[^>]+>/g, '');
check('renders with no unresolved tags', !/\{[\w#/^]+\}/.test(sampleText),
  sampleText.match(/\{[\w#/^]+\}/g)?.slice(0, 5));
check('the Khmer survives rendering', sampleText.includes('នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម'));

/* ------------------------------------------------------------------ *
 * 3. A built report from aggregated figures
 * ------------------------------------------------------------------ */
console.log('\nBuilding a report from aggregated figures');

const source: AnalyticsSource = {
  period: { type: 'SEMESTER', year: 2026, index: 1 },
  data_as_of: '2026-07-07',
  model_set_version: 'MLRS-AI v1.2',
  licensees_analyzed: 24,
  records_analyzed: 565,
  records_previous: 512,
  records_excluded: 7,
  records_no_gps: 12,
  data_completeness_pct: 96.4,
  history_months: 24,
  categories: [
    { code: 'NAWI', label_kh: 'ជញ្ជីងមិនស្វ័យប្រវត្តិ', history: [300, 318, 327, 340, 352, 380] },
    { code: 'FUEL_DISPENSER', label_kh: 'ឧបករណ៍ចែកចាយប្រេងឥន្ធនៈ', history: [60, 66, 71, 78, 84, 99] },
    { code: 'WEIGHBRIDGE', label_kh: 'ជញ្ជីងថ្លឹងរថយន្ត', history: [41, 39] },  // too short for an interval
  ],
  risks: [
    { licensee: 'ក្រុមហ៊ុន ក', licence_no: 'L-0031', score: 82, previous_score: 74,
      factors: ['ដាក់របាយការណ៍យឺត ៣ ខែ', 'ឧបករណ៍ស្ដង់ដារផុតកំណត់'], recommended_action: 'ចុះត្រួតពិនិត្យ' },
    { licensee: 'ក្រុមហ៊ុន ខ', licence_no: 'L-0077', score: 55, previous_score: 60,
      factors: ['អត្រាមិនឆ្លងខ្ពស់'], recommended_action: 'តាមដាន' },
    { licensee: 'ក្រុមហ៊ុន គ', licence_no: 'L-0102', score: 18, previous_score: null,
      factors: ['គ្មានចំណុចគួរកត់សម្គាល់'], recommended_action: 'មិនតម្រូវ' },
  ],
  anomalies: [
    { type: 'លេខស៊េរីស្ទួន', subject: 'ក្រុមហ៊ុន ខ / FD-55120',
      description: 'លេខស៊េរីដូចគ្នា រាយការណ៍ដោយក្រុមហ៊ុនពីរ', score: 0.93 },
  ],
  geo: [
    { province: 'រាជធានីភ្នំពេញ', installed: 41, repairs: 22, verified: 63, failed: 1 },
    { province: 'ខេត្តបាត់ដំបង', installed: 18, repairs: 9, verified: 27, failed: 3 },
  ],
  quality: [
    { model: 'ជញ្ជីងថ្លឹងរថយន្ត / WB-60', manufacturer: 'Example Scale', verified: 21, failed: 2 },
    { model: 'ជញ្ជីងតូច / SC-5', manufacturer: 'Small Co', verified: 5, failed: 2 },  // below min_sample
  ],
  models: [
    { name: 'ម៉ូដែលព្យាករ', purpose: 'ព្យាករចំនួនសកម្មភាព', method: 'OLS trend',
      performance: 'MAPE 8.5%', version: 'v1.2' },
    { name: 'ម៉ូដែលហានិភ័យ', purpose: 'វាយតម្លៃហានិភ័យ', method: 'Random forest',
      version: 'v1.2' },   // no measured performance on purpose
  ],
  totals: { manufactured: 180, installed: 260, repaired: 125, passed: 540, failed: 12, pending: 13 },
  totals_previous: { manufactured: 170, installed: 230, repaired: 112, passed: 489, failed: 15, pending: 8 },
};

const built = buildAnalyticsData(source);
check('the built object passes the contract', dataProblems(built).length === 0, dataProblems(built));

console.log('\nThe rules NMC set');
check(`risk bands are High ≥ ${RISK_BANDS.high}, Medium ≥ ${RISK_BANDS.medium}`,
  riskLevel(82) === 'HIGH' && riskLevel(70) === 'HIGH' && riskLevel(69) === 'MEDIUM'
  && riskLevel(40) === 'MEDIUM' && riskLevel(39) === 'LOW');
check('risk counts match the bands', built.risk_high === 1 && built.risk_medium === 1
  && built.risk_low === 1 && built.risk_total === 3,
  { high: built.risk_high, medium: built.risk_medium, low: built.risk_low });

const forecastRows = built.forecasts as any[];
check('every forecast states an interval or says it has none',
  forecastRows.every(r => /–/.test(String(r.interval)) || r.interval === UNKNOWN),
  forecastRows.map(r => r.interval));
check('a short history yields no invented interval',
  forecastRows.find(r => r.category === 'ជញ្ជីងថ្លឹងរថយន្ត')?.interval === UNKNOWN,
  forecastRows.find(r => r.category === 'ជញ្ជីងថ្លឹងរថយន្ត'));
check('a long history yields a real interval',
  /^\d+ – \d+$/.test(String(forecastRows.find(r => r.category === 'ជញ្ជីងមិនស្វ័យប្រវត្តិ')?.interval)),
  forecastRows[0]);

check('every anomaly carries a review status',
  (built.anomalies as any[]).every(a => (REVIEW_STATUSES as readonly string[]).includes(String(a.review_status))),
  built.anomalies);
check('anomalies start as រង់ចាំពិនិត្យ, not decided by the system',
  (built.anomalies as any[]).every(a => a.review_status === 'រង់ចាំពិនិត្យ'));

check('every high-risk score is explained',
  (built.high_risk as any[]).every(r => String(r.factors).trim() && r.factors !== UNKNOWN),
  built.high_risk);

check(`the quality table excludes models below min_sample (${DEFAULT_MIN_SAMPLE})`,
  (built.quality as any[]).length === 1 && String((built.quality as any[])[0].model).includes('WB-60'),
  built.quality);

check('unmeasured model performance says so rather than inventing a number',
  (built.models as any[])[1].performance === NOT_MEASURED, (built.models as any[])[1]);

check('a licensee with no previous score is not given a fabricated change',
  (built.all_risk as any[]).find(r => r.licence_no === 'L-0102')?.change === UNKNOWN,
  built.all_risk);

console.log('\nKhmer and Arabic numerals land where they should');
check('_kh scalars use Khmer numerals', /^[០-៩]+$/.test(String(built.licensees_analyzed_kh)),
  built.licensees_analyzed_kh);
check('table figures stay Arabic', /^\d+$/.test(String((built.kpis as any[])[0].current)),
  (built.kpis as any[])[0]);
check('the period label matches the consolidated helper',
  built.period_label_kh === 'ឆមាសទី១ ឆ្នាំ២០២៦', built.period_label_kh);
check('the semester checkbox is the ticked one',
  built.chk_semester === '☑' && built.chk_month === '☐');

/* ------------------------------------------------------------------ *
 * 4. Edge cases that must not throw
 * ------------------------------------------------------------------ */
console.log('\nEdge cases');
const empty = buildAnalyticsData({
  ...source,
  categories: [], risks: [], anomalies: [], geo: [], quality: [],
  licensees_analyzed: 0, records_analyzed: 0, records_no_gps: 0, records_excluded: 0,
  data_completeness_pct: 100,
  totals: { manufactured: 0, installed: 0, repaired: 0, passed: 0, failed: 0, pending: 0 },
  totals_previous: null,
});
check('a period with no activity still produces a valid report',
  dataProblems(empty).length === 0, dataProblems(empty));
check('and says so rather than printing zeros as findings',
  (empty.key_findings as any[]).length >= 1);
const emptyOut = fillAnalyticsTemplate(template, empty).getZip().generate({ type: 'nodebuffer' });
fs.writeFileSync(path.join(OUT, 'Analytics_EMPTY.docx'), emptyOut);
check('the empty report renders with no unresolved tags',
  !/\{[\w#/^]+\}/.test(new PizZip(emptyOut).files['word/document.xml'].asText().replace(/<[^>]+>/g, '')));

console.log('\nA real MONTH and a real SEMESTER');
for (const [type, year, index] of [['MONTH', 2026, 9], ['SEMESTER', 2026, 2]] as const) {
  const data = buildAnalyticsData({ ...source, period: { type, year, index } });
  check(`${type} ${year}-${index} passes the contract`, dataProblems(data).length === 0, dataProblems(data));
  const buf = fillAnalyticsTemplate(template, data).getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  const name = analyticsFileName(reportingPeriod(type, year, index), 'DRAFT');
  fs.writeFileSync(path.join(OUT, name), buf);
  const text = new PizZip(buf).files['word/document.xml'].asText().replace(/<[^>]+>/g, '');
  check(`${type} renders with no unresolved tags`, !/\{[\w#/^]+\}/.test(text));
  console.log(`       wrote ${OUT}/${name}`);
}

console.log('\nForecast statistics');
const steady = forecastNext([100, 100, 100, 100, 100, 100]);
check('a flat series forecasts flat', steady.value === 100, steady);
check('and its interval is tight', steady.interval !== null
  && steady.interval[1] - steady.interval[0] <= 2, steady.interval);
const noisy = forecastNext([10, 90, 20, 80, 30, 70]);
check('a noisy series gets a wide interval',
  noisy.interval !== null && noisy.interval[1] - noisy.interval[0] > 60, noisy.interval);
check('fewer than four points yields no interval', forecastNext([5, 7, 9]).interval === null);
check('an interval never goes below zero',
  (forecastNext([5, 4, 3, 2, 1, 0]).interval?.[0] ?? 0) >= 0, forecastNext([5, 4, 3, 2, 1, 0]));

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nThe analytics report contract holds.\n');
assert.equal(failures, 0, `${failures} analytics check(s) failed`);
