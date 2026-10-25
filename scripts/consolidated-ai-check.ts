/**
 * Section 6.2: the legal-basis catalogue and the AI drafter's guards.
 *
 *   npm run consolidated:ai:check
 *
 * The thing this protects is narrow and serious. A consolidated report may
 * support an inspection, and section 6.2 carries the legal basis for each
 * proposal. A citation that reads correctly but does not exist — the kind a
 * language model produces fluently — is worse than an empty column, which is
 * why the column sat empty until there was a catalogue to cite from.
 *
 * So: the AI never writes a citation, only selects one, and anything outside
 * the approved list is refused and the deterministic draft used instead.
 */
import assert from 'node:assert/strict';

import {
  APPROVED_CITATIONS, INSTRUMENT_TITLE, LEGAL_REFERENCES, citationChoices, citationsAreApproved,
  legalBasisForRule,
} from '../src/lib/consolidated/legalBasis';
import { draftActionsWithAi, draftConsolidatedWithAi } from '../src/consolidated/aiDrafter';
import type { ConsolidatedAnalysis } from '../src/lib/consolidated/automaticReport';
import type { ConsolidatedData } from '../src/lib/consolidated/contract';

let failures = 0;
const check = (name: string, run: () => void) => {
  try { run(); console.log(`  OK   ${name}`); }
  catch (err: any) { failures++; console.error(`  FAIL ${name}\n       ${err?.message || err}`); }
};
const checkAsync = async (name: string, run: () => Promise<void>) => {
  try { await run(); console.log(`  OK   ${name}`); }
  catch (err: any) { failures++; console.error(`  FAIL ${name}\n       ${err?.message || err}`); }
};

/* ------------------------------------------------------------------ *
 * 1. The catalogue
 * ------------------------------------------------------------------ */
console.log('\nThe approved catalogue');

check('every entry has an id, a citation and a scope', () => {
  for (const r of LEGAL_REFERENCES) {
    assert.ok(r.id && r.ref && r.scope, `incomplete entry: ${JSON.stringify(r)}`);
    assert.ok(['national', 'international'].includes(r.kind));
  }
});

check('ids are unique', () => {
  const ids = LEGAL_REFERENCES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

check('it covers the articles this system actually relies on', () => {
  // Art. 21 (the deadline), Art. 25 (seals), Art. 17 (carry-over) and the
  // two annexes are referenced throughout the Annex 8 code. If one is ever
  // dropped from the catalogue, the proposals that cite it go blank.
  for (const needle of ['ប្រការ១៧', 'ប្រការ២១', 'ប្រការ២៥', 'ឧបសម្ព័ន្ធទី៨', 'ឧបសម្ព័ន្ធទី១០']) {
    assert.ok(APPROVED_CITATIONS.some(c => c.includes(needle)), `missing: ${needle}`);
  }
});

check('international good practice is the OIML set the system records', () => {
  for (const r of ['OIML R 76', 'OIML R 111', 'OIML R 117', 'OIML R 46', 'OIML R 49']) {
    assert.ok(APPROVED_CITATIONS.includes(r), `missing: ${r}`);
  }
});

/* ------------------------------------------------------------------ *
 * 2. Rules get a real basis, or none
 * ------------------------------------------------------------------ */
console.log('\nEach rule cites what governs it, or nothing');

check('the reporting-deadline rules cite the deadline article', () => {
  for (const rule of ['late-reports', 'missing-reports', 'submission-rate-decreased']) {
    assert.match(legalBasisForRule(rule), /ប្រការ២១/, rule);
  }
});

check('the carry-over rules cite the carry-over article', () => {
  for (const rule of ['pending-at-period-end', 'pending-over-30-days']) {
    assert.match(legalBasisForRule(rule), /ប្រការ១៧/, rule);
  }
});

check('a rule the catalogue does not govern cites nothing', () => {
  // Rather than a loosely-related article. An officer can add the right one.
  for (const rule of ['expired-standards', 'standards-due-soon', 'licences-expiring']) {
    assert.equal(legalBasisForRule(rule), '', rule);
  }
});

check('an unknown rule cites nothing rather than throwing', () => {
  assert.equal(legalBasisForRule('no-such-rule'), '');
});

check('every citation a rule produces is itself approved', () => {
  for (const rule of ['late-reports', 'missing-reports', 'pending-over-30-days',
    'failed-verification', 'annex-totals-mismatch', 'scope-review', 'incomplete-data']) {
    assert.ok(citationsAreApproved(legalBasisForRule(rule)), rule);
  }
});

/* ------------------------------------------------------------------ *
 * 3. The citation guard
 * ------------------------------------------------------------------ */
console.log('\nNo citation that is not on the list');

check('an approved citation passes', () => {
  assert.ok(citationsAreApproved('ប្រការ២១'));
  assert.ok(citationsAreApproved('ប្រការ២១; ឧបសម្ព័ន្ធទី៨'));
  assert.ok(citationsAreApproved('OIML R 76'));
});

check('an empty citation is allowed — saying nothing always is', () => {
  assert.ok(citationsAreApproved(''));
  assert.ok(citationsAreApproved(null));
  assert.ok(citationsAreApproved(undefined));
});

check('an article that does not exist in the catalogue is refused', () => {
  // The exact failure this guard exists for: fluent, plausible, invented.
  assert.equal(citationsAreApproved('ប្រការ៤៥'), false);
  assert.equal(citationsAreApproved('ប្រការ២១; ប្រការ៩៩'), false);
});

check('an invented law title is refused', () => {
  assert.equal(citationsAreApproved('ច្បាប់ស្ដីពីមាត្រាសាស្ត្រ ប្រការ១២'), false);
});

check('an OIML number we do not record is refused', () => {
  assert.equal(citationsAreApproved('OIML R 60'), false);
});

check('articles are joined, and the instrument named at most once', () => {
  // Both configurations are normal: the title is empty until a Prakas
  // number is confirmed, and set once it is. The joining must hold either
  // way, and naming the instrument per-article would repeat the whole title
  // inside one table cell.
  const basis = legalBasisForRule('late-reports');
  assert.match(basis, /ប្រការ២១ និង ឧបសម្ព័ន្ធទី៨/);
  if (INSTRUMENT_TITLE) {
    assert.ok(basis.startsWith(INSTRUMENT_TITLE), 'the Prakas should be named first');
    assert.equal(basis.split(INSTRUMENT_TITLE).length - 1, 1, 'named once, not per article');
  } else {
    assert.equal(basis, 'ប្រការ២១ និង ឧបសម្ព័ន្ធទី៨', 'bare articles while no Prakas is confirmed');
  }
});

check('an international recommendation is not filed under the Prakas', () => {
  // OIML belongs to a different authority and must not read as part of it.
  const r = LEGAL_REFERENCES.find(x => x.id === 'oiml_r76')!;
  assert.equal(r.ref, 'OIML R 76');
  assert.equal(r.kind, 'international');
  if (INSTRUMENT_TITLE) assert.ok(!r.ref.includes(INSTRUMENT_TITLE));
});

check('a citation under the instrument title is accepted', () => {
  assert.ok(citationsAreApproved(`${INSTRUMENT_TITLE} ប្រការ២១`));
  assert.ok(citationsAreApproved(`${INSTRUMENT_TITLE} ប្រការ២១ និង ឧបសម្ព័ន្ធទី៨`));
  assert.ok(citationsAreApproved(`${INSTRUMENT_TITLE} ប្រការ១៧; OIML R 76`));
});

check('an invented article under a real instrument title is still refused', () => {
  // The likeliest fabrication once a real title exists: a plausible
  // article number attached to the correct Prakas.
  assert.equal(citationsAreApproved(`${INSTRUMENT_TITLE} ប្រការ៤៥`), false);
  assert.equal(citationsAreApproved(`${INSTRUMENT_TITLE} ប្រការ២១ និង ប្រការ៩៩`), false);
});

check('an invented instrument is refused', () => {
  assert.equal(citationsAreApproved('ប្រកាសលេខ ៩៩៩ សហវ.ប្រក ប្រការ២១'), false);
});

check('the title alone, citing nothing, is refused', () => {
  // Only meaningful with a title: an empty value is always allowed, because
  // saying nothing is permitted and inventing something is not.
  if (INSTRUMENT_TITLE) assert.equal(citationsAreApproved(INSTRUMENT_TITLE), false);
  else assert.ok(citationsAreApproved(''), 'an empty citation stays allowed');
});

/* ------------------------------------------------------------------ *
 * 4. The drafter's guards
 * ------------------------------------------------------------------ */
console.log('\nThe AI drafter');

const data = {
  period_label_kh: 'ខែតុលា ឆ្នាំ២០២៦', active_licensees_kh: '២៤', late_count_kh: '៣',
  submission_rate_kh: '៩៦.៤%', total_failed_kh: '៥',
} as unknown as ConsolidatedData;

const analysis: ConsolidatedAnalysis = {
  challenges: [{ text: 'ក' }],
  conclusion: 'សេចក្ដីសន្និដ្ឋានដើម',
  findings: [{ rule: 'late-reports', text: 'យឺត' } as any, { rule: 'missing-reports', text: 'ខ្វះ' } as any],
  proposals: [
    { no: 1, proposal: 'ស្នើតាមដានការដាក់យឺត', legal_basis: 'ប្រការ២១' },
    { no: 2, proposal: 'ស្នើផ្ទៀងផ្ទាត់ការខ្វះ', legal_basis: 'ប្រការ២១; ឧបសម្ព័ន្ធទី៨' },
  ],
};

const stub = (body: unknown) => ({
  provider: 'gemini' as const, models: ['model-a'],
  generate: async () => typeof body === 'string' ? body : JSON.stringify(body),
});

const good = {
  proposals: [
    { proposal: 'ស្នើឱ្យតាមដានអ្នកកាន់អាជ្ញាប័ណ្ណដែលដាក់យឺតចំនួន ៣។', legal_basis: 'ប្រការ២១' },
    { proposal: 'ស្នើឱ្យផ្ទៀងផ្ទាត់ករណីខ្វះរបាយការណ៍។', legal_basis: 'ប្រការ២១; ឧបសម្ព័ន្ធទី៨' },
  ],
  conclusion: 'សូមបន្តតាមដាន។',
};

await checkAsync('a clean answer is used', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, stub(good) as any);
  assert.equal(r.engine, 'ai-agent');
  assert.equal(r.analysis?.proposals.length, 2);
  assert.equal(r.analysis?.proposals[0].legal_basis, 'ប្រការ២១');
  assert.equal(r.analysis?.conclusion, 'សូមបន្តតាមដាន។');
});

await checkAsync('an invented citation is refused outright', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, stub({
    ...good,
    proposals: [{ ...good.proposals[0], legal_basis: 'ប្រការ៤៥' }, good.proposals[1]],
  }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.equal(r.analysis, null);
  assert.match(r.reason || '', /legal reference that is not approved/);
});

await checkAsync('it cannot add a proposal the rules did not find', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, stub({
    ...good, proposals: [...good.proposals, { proposal: 'ស្នើបន្ថែម', legal_basis: '' }],
  }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /3 proposals for 2 findings/);
});

await checkAsync('it cannot drop one either', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, stub({
    ...good, proposals: [good.proposals[0]],
  }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /1 proposals for 2 findings/);
});

await checkAsync('an invented figure is refused', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, stub({
    ...good,
    proposals: [{ ...good.proposals[0], proposal: 'ស្នើតាមដាន ៩៩៩ ករណី។' }, good.proposals[1]],
  }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /figure that is not in the data/);
});

await checkAsync('an empty proposal is refused rather than printed blank', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, stub({
    ...good, proposals: [{ proposal: '  ', legal_basis: '' }, good.proposals[1]],
  }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /is empty/);
});

await checkAsync('text that is not JSON is refused', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, stub('Sure! Here are your proposals:') as any);
  assert.equal(r.engine, 'deterministic');
});

await checkAsync('with no provider it uses the deterministic draft', async () => {
  const r = await draftConsolidatedWithAi(data, analysis, null);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /no AI provider/);
});

await checkAsync('no licensee identity reaches the drafter', async () => {
  let seen = '';
  const withNames = {
    ...data,
    licensees: [{ name: 'ក្រុមហ៊ុន កខគ', licence_no: 'L-0031' }],
  } as unknown as ConsolidatedData;
  await draftConsolidatedWithAi(withNames, analysis, {
    provider: 'gemini', models: ['m'],
    generate: async (prompt: string) => { seen = prompt; return JSON.stringify(good); },
  } as any);
  assert.ok(!seen.includes('ក្រុមហ៊ុន កខគ'), 'a licensee name reached the prompt');
  assert.ok(!seen.includes('L-0031'), 'a licence number reached the prompt');
  assert.ok(seen.includes('ប្រការ២១'), 'the approved catalogue should be in the prompt');
});

await checkAsync('the approved catalogue is what it is offered', async () => {
  const choices = citationChoices();
  assert.equal(choices.length, LEGAL_REFERENCES.length);
  for (const c of choices) assert.ok(APPROVED_CITATIONS.includes(c.ref));
});

/* ------------------------------------------------------------------ *
 * 5. Section 6.1 — wording only
 * ------------------------------------------------------------------ */
console.log('\nSection 6.1: the AI may word it, never populate it');

const recorded: ConsolidatedData['actions'] = [
  { no: 1, licensee: 'ក្រុមហ៊ុន កខគ (L-0031)', action: 'ផ្ញើលិខិតរំលឹក', date: '១៥/១០/២០២៦', result: 'បានផ្ញើរួច · Reminder #7' },
  { no: 2, licensee: 'ក្រុមហ៊ុន ឃង (L-0077)', action: 'ពិនិត្យ និងទទួលយករបាយការណ៍', date: '២០/១០/២០២៦', result: 'បានកត់ត្រា · Audit #12' },
];

const goodActions = { actions: [
  { action: 'បានផ្ញើលិខិតរំលឹកស្ដីពីការដាក់របាយការណ៍', result: 'លិខិតត្រូវបានផ្ញើរួចរាល់' },
  { action: 'បានពិនិត្យ និងទទួលយករបាយការណ៍ប្រចាំខែ', result: 'ទទួលយកដោយគ្មានកំណត់សម្គាល់' },
] };

await checkAsync('it rewords the rows that exist', async () => {
  const r = await draftActionsWithAi(recorded, stub(goodActions) as any);
  assert.equal(r.engine, 'ai-agent');
  assert.equal(r.actions?.length, 2);
  assert.match(String(r.actions?.[0].action), /លិខិតរំលឹក/);
});

await checkAsync('the licensee and date survive the rewording untouched', async () => {
  // Asserted rather than asked for: these identify the action, and a report
  // that moves one to another company or another day is a false record.
  const r = await draftActionsWithAi(recorded, stub({ actions: [
    { action: 'ក', result: 'ខ' }, { action: 'គ', result: 'ឃ' },
  ] }) as any);
  assert.equal(r.actions?.[0].licensee, recorded[0].licensee);
  assert.equal(r.actions?.[0].date, recorded[0].date);
  assert.equal(r.actions?.[1].licensee, recorded[1].licensee);
  assert.equal(r.actions?.[1].date, recorded[1].date);
});

await checkAsync('it cannot add an action the Centre never took', async () => {
  const r = await draftActionsWithAi(recorded, stub({ actions: [
    ...goodActions.actions,
    { action: 'បានចុះត្រួតពិនិត្យនៅរោងចក្រ', result: 'បានរកឃើញបញ្ហា' },
  ] }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /3 rows for 2 recorded actions/);
});

await checkAsync('it cannot drop one either', async () => {
  const r = await draftActionsWithAi(recorded, stub({ actions: [goodActions.actions[0]] }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /1 rows for 2 recorded actions/);
});

await checkAsync('an invented figure in the wording is refused', async () => {
  const r = await draftActionsWithAi(recorded, stub({ actions: [
    { action: 'បានផ្ញើលិខិតរំលឹក ៩៩ ច្បាប់', result: 'ផ្ញើរួច' }, goodActions.actions[1],
  ] }) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /figure that is not in the record/);
});

await checkAsync('with no recorded action there is nothing to word', async () => {
  // The empty 6.1 an officer sees stays empty, rather than being filled in.
  const r = await draftActionsWithAi([], stub(goodActions) as any);
  assert.equal(r.engine, 'deterministic');
  assert.match(r.reason || '', /no recorded actions/);
});

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nSections 6.1 and 6.2 hold.\n');
process.exitCode = failures ? 1 : 0;
