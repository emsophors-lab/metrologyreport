/**
 * The AI drafter for the consolidated report's section 6.2 (សំណើ).
 *
 * NMC's decision: the system prepares and analyses this report, so the
 * proposals are worded by the machine and carry their legal basis, drawn
 * from law, regulation and international good practice.
 *
 * WHAT IT MAY AND MAY NOT DO
 *
 *  - It may REWORD a proposal the rules already found, and CHOOSE the legal
 *    references for it from the approved catalogue.
 *  - It may not add a proposal, drop one, or reorder them. The findings come
 *    from the figures; an AI inventing a recommendation that no rule
 *    supports would be the Centre proposing action on a fact it has not
 *    established.
 *  - It may not write a citation. It selects from legalBasis.ts, and
 *    anything outside that catalogue is refused. A fabricated article number
 *    in a report that may support an inspection is the worst thing this
 *    feature could produce, and it is the reason the column sat empty until
 *    the catalogue existed.
 *  - It may not state a figure that is not in the data it was given.
 *
 * SECTION 6.1 IS NOT DRAFTED HERE, ON PURPOSE
 *
 * 6.1 records what NMC actually did — accepted and returned reports, from
 * the audit log, within the period. Those are facts with evidence behind
 * them, and server.ts already refuses to invent them when the audit history
 * cannot be read. An AI has nothing to add to a register of what happened,
 * and a great deal to get wrong.
 *
 * Any violation falls back to the deterministic draft, which is complete and
 * already carries its legal basis.
 */
import { numbersAreGrounded } from '../analytics/aiAnalyst';
import type { AiConfig } from '../analytics/aiAnalyst';
import { citationChoices, citationsAreApproved } from '../lib/consolidated/legalBasis';
import type { ConsolidatedData } from '../lib/consolidated/contract';
import type { ConsolidatedAnalysis } from '../lib/consolidated/automaticReport';

export interface AiDraftResult {
  /** Null when the deterministic draft should be used instead. */
  analysis: ConsolidatedAnalysis | null;
  engine: 'ai-agent' | 'deterministic';
  model: string | null;
  /** Why it was not used, for the server log. */
  reason?: string;
}

const MAX_CHARS = 1200;
const BUDGET_MS = () => Number(process.env.CONSOLIDATED_AI_BUDGET_MS || 60000);

/**
 * The figures the drafter may see.
 *
 * Named explicitly, so a key added to the report later cannot leak through.
 * No licensee names, licence numbers or serials: the proposals are about
 * the period, and the named tables are filled by us from the database.
 */
function figuresFor(data: ConsolidatedData) {
  const pick = (keys: string[]) => Object.fromEntries(
    keys.filter(k => Object.hasOwn(data as object, k)).map(k => [k, (data as any)[k]]));
  return pick([
    'period_label_kh', 'period_range_kh', 'data_as_of_kh',
    'active_licensees_kh', 'submitted_count_kh', 'submission_rate_kh',
    'on_time_count_kh', 'late_count_kh', 'not_submitted_count_kh',
    'total_m_kh', 'total_i_kh', 'total_r_kh',
    'verified_count_kh', 'total_passed_kh', 'pass_rate_kh',
    'total_failed_kh', 'total_pending_kh',
    'kpi_backlog_cur', 'kpi_backlog30_cur', 'kpi_seals_cur',
  ]);
}

const PROMPT = `អ្នកគឺជាអ្នករៀបចំរបាយការណ៍សរុបរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (ម.ម.ជ)។

សូមសរសេរឡើងវិញនូវ «សំណើ» (ផ្នែក៦.២) ជាភាសាខ្មែរផ្លូវការ ដោយផ្អែកលើការរកឃើញដែលបានផ្ដល់ជូន។

វិន័យដែលមិនអាចបំពានបាន៖
1. ហាមបន្ថែម ហាមលុប និងហាមប្ដូរលំដាប់សំណើ។ ចំនួនសំណើត្រូវដូចគ្នានឹងការរកឃើញ។
2. ប្រើតែតួលេខដែលមានក្នុងទិន្នន័យខាងក្រោម។ ហាមបង្កើតតួលេខថ្មី។
3. សម្រាប់ «មូលដ្ឋានច្បាប់» សូមជ្រើសរើសតែពីបញ្ជីយោងដែលបានអនុម័តខាងក្រោមប៉ុណ្ណោះ។
   ហាមសរសេរលេខប្រការ ឬឯកសារច្បាប់ណាមួយដែលមិនមានក្នុងបញ្ជីនេះ។
   បើគ្មានយោងសមស្រប សូមទុកវាឱ្យទទេ។
4. សំណើត្រូវជាការស្នើឱ្យពិនិត្យ ផ្ទៀងផ្ទាត់ ឬតាមដាន។ ហាមស្នើទណ្ឌកម្ម ឬការដកអាជ្ញាបណ្ណ។
5. សរសេរឱ្យខ្លី ច្បាស់ និងសុភាព។

ឆ្លើយជា JSON តែមួយ ដោយមិនមានអត្ថបទផ្សេង៖
{"proposals":[{"proposal":"...","legal_basis":"..."}],"conclusion":"..."}

`;

/**
 * Reword 6.2 and choose its citations. Returns the deterministic analysis
 * untouched whenever the answer cannot be used.
 */
export async function draftConsolidatedWithAi(
  data: ConsolidatedData,
  analysis: ConsolidatedAnalysis,
  config: AiConfig | null,
): Promise<AiDraftResult> {
  const fallback = (reason: string): AiDraftResult =>
    ({ analysis: null, engine: 'deterministic', model: null, reason });

  if (!config) return fallback('no AI provider is configured');
  if (!analysis.proposals.length) return fallback('the rules found nothing to propose');

  const figures = figuresFor(data);
  const payload = {
    figures,
    findings: analysis.proposals.map(p => ({ proposal: p.proposal, legal_basis: p.legal_basis })),
    approved_legal_references: citationChoices(),
  };

  const deadline = Date.now() + BUDGET_MS();
  for (const model of config.models) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) return fallback(`budget of ${BUDGET_MS()}ms spent`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let raw: string;
    try {
      raw = await config.generate(PROMPT + JSON.stringify(payload, null, 1), model, controller.signal);
    } catch (err: any) {
      // The provider's own words, kept: a retired model name or an
      // exhausted quota says so precisely.
      const message = err?.name === 'AbortError' ? 'did not answer in time' : String(err?.message || err);
      if (model === config.models.at(-1)) return fallback(`${model}: ${message}`);
      continue;
    } finally {
      clearTimeout(timer);
    }

    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { return fallback(`${model}: the answer was not JSON`); }

    const rows = parsed?.proposals;
    if (!Array.isArray(rows)) return fallback(`${model}: proposals missing`);
    if (rows.length !== analysis.proposals.length) {
      // Rule 1, enforced rather than requested.
      return fallback(`${model}: returned ${rows.length} proposals for ${analysis.proposals.length} findings`);
    }

    const proposals: ConsolidatedData['proposals'] = [];
    for (let i = 0; i < rows.length; i++) {
      const text = String(rows[i]?.proposal ?? '').trim();
      const basis = String(rows[i]?.legal_basis ?? '').trim();
      if (!text) return fallback(`${model}: proposal ${i + 1} is empty`);
      if (text.length > MAX_CHARS) return fallback(`${model}: proposal ${i + 1} is too long`);
      if (!numbersAreGrounded(text, payload)) {
        return fallback(`${model}: proposal ${i + 1} states a figure that is not in the data`);
      }
      if (!citationsAreApproved(basis)) {
        return fallback(`${model}: proposal ${i + 1} cites a legal reference that is not approved`);
      }
      proposals.push({ no: i + 1, proposal: text, legal_basis: basis });
    }

    const conclusion = String(parsed?.conclusion ?? '').trim();
    if (conclusion && !numbersAreGrounded(conclusion, payload)) {
      return fallback(`${model}: the conclusion states a figure that is not in the data`);
    }

    return {
      analysis: {
        ...analysis,
        proposals,
        conclusion: conclusion || analysis.conclusion,
      },
      engine: 'ai-agent',
      model,
    };
  }
  return fallback('no model answered');
}
