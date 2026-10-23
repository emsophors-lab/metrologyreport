/**
 * The approved legal references for section 6.2 (សំណើ).
 *
 * Until now `legal_basis` was left empty, with the note "No approved
 * legal-reference catalogue exists. Officers supply verified references."
 * That was the right call while there was nothing to cite from. This file is
 * that catalogue, so the system can fill the column itself.
 *
 * WHY A CATALOGUE AND NOT A PROMPT
 *
 * A language model asked to cite Cambodian metrology law will produce
 * citations that read perfectly and may be wrong — an article number that
 * does not exist, or one that does but says something else. In a report that
 * goes to the Director General and may support an inspection, a fabricated
 * legal reference is far worse than an empty column. So the AI never writes a
 * citation: it may only SELECT from the entries below, and anything it
 * returns that is not one of these is rejected (see citationsAreApproved).
 *
 * WHERE THESE COME FROM
 *
 * Every entry is a reference this system already relies on in code, not one
 * written from memory:
 *
 *   ប្រការ១៧  carry-over of unfinished work   (Annex 8 carry-over)
 *   ប្រការ២១  due by the 7th of the next month (annex8/constants.ts,
 *             summary.ts, validation.ts, monthlyDigest.ts)
 *   ប្រការ២៥  seal removal needs an Annex 10 notification
 *             (annex8/constants.ts event 6.6, analytics/aggregate.ts)
 *   ឧបសម្ព័ន្ធទី៨  the monthly return itself
 *   ឧបសម្ព័ន្ធទី១០ the seal-removal notification
 *
 * and the OIML recommendations already carried per instrument category in
 * annex8/constants.ts, which are the "international best practice" leg.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * The formal title and number of the instrument these articles belong to.
 * The repository cites the articles but never names the Prakas or the Law, so
 * naming it here would mean inventing it. INSTRUMENT_TITLE below is a single
 * place for the owner to supply it; until it is filled, citations print as
 * the article alone, which is what the rest of the system already does.
 */

/**
 * The instrument the articles below belong to.
 *
 * Fill this in with the official title and number once confirmed, e.g.
 * 'ប្រកាសលេខ ... ចុះថ្ងៃទី ...'. Leave empty rather than guess: an article
 * number attached to the wrong instrument is a worse citation than a bare
 * article number.
 */
export const INSTRUMENT_TITLE = 'ប្រកាសលេខ ២៤៧ សហវ.ប្រក ចុះថ្ងៃទី១៨ ខែមីនា ឆ្នាំ២០២២';

export interface LegalReference {
  /** Stable id, used by the rule map and by the AI's allowed-choice list. */
  id: string;
  /** The citation exactly as it should print, in Khmer. */
  ref: string;
  /** What it governs — for the officer reviewing, and for choosing. */
  scope: string;
  /** National instrument, or international good practice. */
  kind: 'national' | 'international';
}

/**
 * A national reference holds the ARTICLE alone.
 *
 * The instrument is printed once per citation by `legalBasisForRule`, not
 * baked into each entry: a proposal citing two articles would otherwise
 * repeat the whole Prakas title twice inside one table cell.
 */
const article = (id: string, ref: string, scope: string): LegalReference =>
  ({ id, ref, scope, kind: 'national' });

export const LEGAL_REFERENCES: LegalReference[] = [
  article('art17', 'ប្រការ១៧',
    'ការបន្តរាយការណ៍ការងារដែលមិនទាន់បញ្ចប់ទៅខែបន្ទាប់'),
  article('art21', 'ប្រការ២១',
    'ថិរវេលាដាក់របាយការណ៍ប្រចាំខែ — ត្រឹមថ្ងៃទី៧ នៃខែបន្ទាប់'),
  article('art25', 'ប្រការ២៥',
    'ការដោះសញ្ញាត្រួតពិនិត្យ ត្រូវមានលិខិតជូនដំណឹងតាមឧបសម្ព័ន្ធទី១០'),
  article('annex8', 'ឧបសម្ព័ន្ធទី៨',
    'ទម្រង់របាយការណ៍ប្រចាំខែរបស់អ្នកកាន់អាជ្ញាប័ណ្ណ'),
  article('annex10', 'ឧបសម្ព័ន្ធទី១០',
    'ទម្រង់លិខិតជូនដំណឹងពីការដោះសញ្ញាត្រួតពិនិត្យ'),

  // International good practice, by instrument category. These are the OIML
  // recommendations this system already records against each category.
  { id: 'oiml_r76', ref: 'OIML R 76', kind: 'international',
    scope: 'ជញ្ជីងមិនស្វ័យប្រវត្តិ និងជញ្ជីងថ្លឹងរថយន្ត' },
  { id: 'oiml_r111', ref: 'OIML R 111', kind: 'international',
    scope: 'កូនទម្ងន់' },
  { id: 'oiml_r117', ref: 'OIML R 117', kind: 'international',
    scope: 'ឧបករណ៍ចែកចាយប្រេងឥន្ធនៈ និងហ្គាស LPG' },
  { id: 'oiml_r46', ref: 'OIML R 46', kind: 'international',
    scope: 'នាឡិកាស្ទង់អគ្គិសនី' },
  { id: 'oiml_r49', ref: 'OIML R 49', kind: 'international',
    scope: 'នាឡិកាស្ទង់ទឹក' },
];

const BY_ID = new Map(LEGAL_REFERENCES.map(r => [r.id, r]));

/**
 * Which references apply to each deterministic finding rule.
 *
 * Keyed by the rule ids analyzeConsolidatedData already produces, so 6.2
 * carries a real legal basis with no AI involved at all. A rule with no
 * entry here gets an empty citation rather than a loosely-related one.
 */
const RULE_REFERENCES: Record<string, string[]> = {
  // Reporting duty and its deadline.
  'late-reports': ['art21', 'annex8'],
  'missing-reports': ['art21', 'annex8'],
  'submission-rate-decreased': ['art21'],

  // Work not finished in the period carries over.
  'pending-at-period-end': ['art17'],
  'pending-over-30-days': ['art17'],

  // Things the return itself governs: what must be recorded and reconciled.
  'failed-verification': ['annex8'],
  'annex-totals-mismatch': ['annex8'],
  'submission-totals-mismatch': ['annex8'],
  'scope-review': ['annex8'],
  'incomplete-data': ['annex8'],

  // Deliberately unmapped, because the catalogue has nothing that governs
  // them: expired-standards, standards-due-soon, licences-expiring. They
  // print an empty citation rather than a loosely-related article, and an
  // officer may add the right one. Add entries above only when the
  // reference is confirmed, never to fill the column.
};

/**
 * The citation text for a finding rule, or '' when none applies.
 *
 * The instrument is named once, then its articles; international
 * recommendations follow after a semicolon because they belong to a
 * different authority and must not read as part of the Prakas.
 */
export function legalBasisForRule(rule: string): string {
  const ids = RULE_REFERENCES[rule];
  if (!ids?.length) return '';
  const refs = ids.map(id => BY_ID.get(id)).filter(Boolean) as LegalReference[];
  const national = refs.filter(r => r.kind === 'national').map(r => r.ref);
  const international = refs.filter(r => r.kind === 'international').map(r => r.ref);
  const parts: string[] = [];
  if (national.length) {
    parts.push(INSTRUMENT_TITLE ? `${INSTRUMENT_TITLE} ${national.join(' និង ')}` : national.join(' និង '));
  }
  parts.push(...international);
  return parts.join('; ');
}

/** Every approved citation token: the articles, annexes and OIML numbers. */
export const APPROVED_CITATIONS: string[] = LEGAL_REFERENCES.map(r => r.ref);

/**
 * Whether a legal_basis value cites only approved references.
 *
 * The instrument title is stripped first where present, because a citation
 * names it once and then lists articles under it. What remains must be
 * entirely made of approved tokens. An empty value is allowed: saying
 * nothing is always permitted, inventing something never is.
 */
export function citationsAreApproved(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return text.split(';').map(part => part.trim()).filter(Boolean).every(part => {
    const body = INSTRUMENT_TITLE && part.startsWith(INSTRUMENT_TITLE)
      ? part.slice(INSTRUMENT_TITLE.length).trim()
      : part;
    if (!body) return false;
    return body.split(/,|និង/).map(t => t.trim()).filter(Boolean)
      .every(token => APPROVED_CITATIONS.includes(token));
  });
}

/** The catalogue as the AI is allowed to see it: ids, citations and scope. */
export const citationChoices = () => LEGAL_REFERENCES.map(
  r => ({ ref: r.ref, scope: r.scope, kind: r.kind }));
