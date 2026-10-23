/**
 * The machine as analyst: the ML contribution, the AI agent, and the guards.
 *
 *   npm run analytics:ai:check
 *
 * What this protects, in the order it would hurt to lose:
 *
 *  1. The AI agent cannot put a figure in an official report that we did not
 *     compute. This is the check that makes the feature usable at all.
 *  2. No licensee is named to the agent. A regression here would start
 *     sending the Centre's licensee data to a third-party service.
 *  3. The analyst block names the engine and cannot be overwritten by a
 *     request. Otherwise a client could sign the machine's work with a
 *     person's name.
 *  4. The ML model escalates and never discounts, and every point it adds
 *     arrives with a factor sentence.
 *  5. With no key and no model, everything still works — deterministically,
 *     and says so.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { MACHINE_SCALARS, OFFICER_SCALARS, dataProblems } from '../src/lib/analytics/contract';
import type { AnalyticsData } from '../src/lib/analytics/contract';
import { applyTextInputs } from '../src/lib/analytics/buildAnalyticsData';
import { aiAnalystEnabled, draftWithAiAnalyst, figuresFor, numbersAreGrounded } from '../src/analytics/aiAnalyst';
import { ML_MAX_POINTS, featureLabelKh, mlRiskContribution } from '../src/analytics/mlSignals';
import type { LicenceSignal } from '../src/analytics/mlSignals';

let failures = 0;
const check = (name: string, run: () => void) => {
  try { run(); console.log(`  OK   ${name}`); }
  catch (err: any) { failures++; console.error(`  FAIL ${name}\n       ${err?.message || err}`); }
};
/** Separate, so an async body is awaited rather than silently resolving later. */
const checkAsync = async (name: string, run: () => Promise<void>) => {
  try { await run(); console.log(`  OK   ${name}`); }
  catch (err: any) { failures++; console.error(`  FAIL ${name}\n       ${err?.message || err}`); }
};

const sample = JSON.parse(
  fs.readFileSync('src/lib/analytics/__fixtures__/analytics-sample-data.json', 'utf8')) as AnalyticsData;

/* ------------------------------------------------------------------ *
 * 1. No invented figures
 * ------------------------------------------------------------------ */
console.log('\nThe agent cannot invent a figure');

const figures = { scale: { records_analyzed: 565, data_completeness: '96.4%' }, risk: { risk_high: 3 } };

check('text using only our figures is accepted', () => {
  assert.ok(numbersAreGrounded('កំណត់ត្រា 565 ត្រូវបានវិភាគ ហើយ 3 មានហានិភ័យខ្ពស់។', figures));
});

check('a rounded figure we never computed is refused', () => {
  // The failure mode that matters: "about 96%" when the figure is 96.4%.
  assert.equal(numbersAreGrounded('ទិន្នន័យពេញលេញប្រមាណ 96%។', figures), false);
});

check('an invented count is refused', () => {
  assert.equal(numbersAreGrounded('មានអ្នកកាន់អាជ្ញាប័ណ្ណ 412 នាក់។', figures), false);
});

check('Khmer numerals are checked too, not waved through', () => {
  assert.ok(numbersAreGrounded('កំណត់ត្រា ៥៦៥។', figures));
  assert.equal(numbersAreGrounded('កំណត់ត្រា ៤១២។', figures), false);
});

check('a decimal is matched against the figure, not to the nearest whole', () => {
  assert.ok(numbersAreGrounded('ភាពពេញលេញ 96.4%។', figures));
  assert.equal(numbersAreGrounded('ភាពពេញលេញ 96.5%។', figures), false);
});

check('the report’s own section numbers and the 95% interval are allowed', () => {
  assert.ok(numbersAreGrounded('ចន្លោះទំនុកចិត្ត 95% នៅក្នុងផ្នែកទី 3។', figures));
});

check('prose with no figures at all is accepted', () => {
  assert.ok(numbersAreGrounded('និន្នាការទូទៅមានស្ថេរភាព។', figures));
});

/* ------------------------------------------------------------------ *
 * 2. No licensee reaches the agent
 * ------------------------------------------------------------------ */
console.log('\nNo licensee identity is sent to the agent');

const payload = JSON.stringify(figuresFor(sample));

check('no licensee name from the risk tables appears in the payload', () => {
  const names = [...(sample.high_risk as any[]), ...(sample.all_risk as any[])]
    .map(r => String(r.licensee)).filter(Boolean);
  assert.ok(names.length > 0, 'the fixture should contain licensees to begin with');
  for (const name of names) {
    assert.ok(!payload.includes(name), `payload leaked the licensee ${name}`);
  }
});

check('no licence number appears in the payload', () => {
  const licences = [...(sample.high_risk as any[]), ...(sample.all_risk as any[])]
    .map(r => String(r.licence_no)).filter(Boolean);
  assert.ok(licences.length > 0);
  for (const licence of licences) {
    assert.ok(!payload.includes(licence), `payload leaked the licence ${licence}`);
  }
});

check('anomaly subjects (which carry names and serials) are reduced to their types', () => {
  for (const row of sample.anomalies as any[]) {
    assert.ok(!payload.includes(String(row.subject)), `payload leaked the anomaly subject ${row.subject}`);
  }
  assert.ok(payload.includes(String((sample.anomalies as any[])[0].type)), 'the type should still be sent');
});

check('the officer and machine signature blocks are not sent either', () => {
  for (const key of [...MACHINE_SCALARS, ...OFFICER_SCALARS]) {
    assert.ok(!Object.hasOwn(JSON.parse(payload), key), `payload carried ${key}`);
  }
});

/* ------------------------------------------------------------------ *
 * 3. The analyst block belongs to the machine
 * ------------------------------------------------------------------ */
console.log('\nThe analyst block is the machine’s');

check('the machine scalars are not officer inputs', () => {
  for (const key of MACHINE_SCALARS) {
    assert.ok(!(OFFICER_SCALARS as readonly string[]).includes(key),
      `${key} must not be typed by an officer`);
  }
});

check('a request cannot overwrite the analyst block', () => {
  const out = applyTextInputs(sample, {
    analyst_name: 'លោក ក',
    analyst_position: 'ប្រធានការិយាល័យ',
    analysed_date_kh: '០១/០១/២០២៦',
  } as any);
  assert.equal(out.analyst_name, sample.analyst_name);
  assert.equal(out.analyst_position, sample.analyst_position);
  assert.equal(out.analysed_date_kh, sample.analysed_date_kh);
});

check('but an officer’s wording and signature still win', () => {
  const out = applyTextInputs(sample, {
    conclusion: 'សេចក្ដីសន្និដ្ឋានដែលមន្ត្រីបានកែ',
    reviewer_name: 'លោកស្រី ខ',
  } as any);
  assert.equal(out.conclusion, 'សេចក្ដីសន្និដ្ឋានដែលមន្ត្រីបានកែ');
  assert.equal(out.reviewer_name, 'លោកស្រី ខ');
});

check('the analyst block names the engine rather than printing dots', () => {
  assert.match(String(sample.analyst_name), /AI Agent/);
  assert.ok(!String(sample.analyst_name).includes('....'));
  assert.ok(!String(sample.analyst_position).includes('....'));
});

check('an unknown key in a draft is ignored rather than added to the report', () => {
  const out = applyTextInputs(sample, { not_a_tag: 'x' } as any);
  assert.ok(!Object.hasOwn(out as object, 'not_a_tag'));
  assert.deepEqual(dataProblems(out), []);
});

/* ------------------------------------------------------------------ *
 * 4. The ML model escalates, and explains itself
 * ------------------------------------------------------------------ */
console.log('\nThe ML contribution');

const signal = (probability: number): LicenceSignal => ({
  licence_no: 'L-0031', probability, anomaly: 0.4, outlier: false, cluster: 1,
  topFeature: 'missingReportsLast3Months', topFeatureZ: 2.4,
});

check('no trained model adds nothing and claims nothing', () => {
  const c = mlRiskContribution(undefined);
  assert.equal(c.points, 0);
  assert.equal(c.factor, null);
});

check('a model that sees low risk cannot discount the rule score', () => {
  for (const p of [0, 0.1, 0.49]) {
    const c = mlRiskContribution(signal(p));
    assert.equal(c.points, 0, `probability ${p} should add nothing`);
    assert.equal(c.factor, null);
  }
});

check('a high probability adds points, capped', () => {
  const c = mlRiskContribution(signal(1));
  assert.equal(c.points, ML_MAX_POINTS);
  const mid = mlRiskContribution(signal(0.75));
  assert.ok(mid.points > 0 && mid.points < ML_MAX_POINTS, `got ${mid.points}`);
});

check('every point it adds comes with a factor naming the probability', () => {
  const c = mlRiskContribution(signal(0.82));
  assert.ok(c.factor, 'a scored contribution must be explained');
  assert.match(c.factor!, /82%/);
});

check('and names the feature behind it, in Khmer', () => {
  const c = mlRiskContribution(signal(0.82));
  assert.ok(c.factor!.includes(featureLabelKh('missingReportsLast3Months')));
  assert.ok(!c.factor!.includes('missingReportsLast3Months'),
    'the raw feature key should not print in an official report');
});

check('an unmapped feature degrades to its own name rather than blank', () => {
  assert.equal(featureLabelKh('somethingNew'), 'somethingNew');
});

/* ------------------------------------------------------------------ *
 * 5. Everything still works with no key and no model
 * ------------------------------------------------------------------ */
console.log('\nWithout an AI key or a trained model');

check('the agent reports itself disabled rather than throwing', () => {
  const before = process.env.ANALYTICS_AI_ENABLED;
  delete process.env.ANALYTICS_AI_ENABLED;
  try { assert.equal(aiAnalystEnabled(), false); }
  finally { if (before !== undefined) process.env.ANALYTICS_AI_ENABLED = before; }
});

await checkAsync('and falls back to the deterministic wording, with a reason', async () => {
  const before = process.env.ANALYTICS_AI_ENABLED;
  delete process.env.ANALYTICS_AI_ENABLED;
  try {
    const result = await draftWithAiAnalyst(sample);
    assert.equal(result.engine, 'deterministic');
    assert.equal(result.narrative, null);
    assert.ok(result.reason, 'a fallback must say why, for the log');
  } finally { if (before !== undefined) process.env.ANALYTICS_AI_ENABLED = before; }
});

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nThe machine analyst holds.\n');
assert.equal(failures, 0, `${failures} analytics AI check(s) failed`);
