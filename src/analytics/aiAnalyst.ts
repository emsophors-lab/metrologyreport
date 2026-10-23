/**
 * The AI analyst agent: it writes the report's Khmer, from our figures.
 *
 * NMC's decision is that the machine is the analyst. The models produce the
 * figures (see mlSignals.ts and aggregate.ts); this agent turns them into the
 * official Khmer commentary that a person used to write by hand.
 *
 * Four rules shape everything below, and each one is enforced in code rather
 * than asked for in the prompt:
 *
 *  1. NO NUMBER MAY BE INVENTED. Every digit group in the agent's text must
 *     already appear in the figures we sent it. A sentence containing a
 *     number we did not compute is rejected outright and the deterministic
 *     draft is used instead. An LLM that rounds 96.4% to "about 96%" is
 *     writing a figure NMC cannot trace to a return, and in a report to the
 *     Director General that is worse than plainer prose.
 *
 *  2. NO LICENSEE IS NAMED TO THE AGENT. The payload carries counts, rates
 *     and period labels only — no company name, licence number, serial or
 *     address. The commentary does not need them, and keeping them out means
 *     using this feature does not send the Centre's licensee data to a
 *     third-party service. The named tables in the report are filled by us,
 *     from the database, as before.
 *
 *  3. IT NEVER DECIDES ANYTHING. The agent writes commentary. Risk scores,
 *     anomaly review statuses, recommendations' priorities and every figure
 *     come from the models and the rules. Nothing it returns can trigger a
 *     sanction, a warning or a licence action.
 *
 *  4. FAILURE IS NOT AN ERROR. No key, no network, a malformed answer, a
 *     fabricated number, a timeout: the report is produced with the
 *     deterministic drafts and says in its limitations which wording it
 *     carries. A ministry report must not depend on an external service
 *     being up.
 */
import { NARRATIVE_SCALARS } from '../lib/analytics/contract';
import type { AnalyticsData } from '../lib/analytics/contract';

/** What the agent may write. Nothing else it returns is used. */
export interface AiNarrative {
  executive_summary: string;
  trend_commentary: string;
  geo_commentary: string;
  conclusion: string;
}

export interface AiAnalystResult {
  narrative: AiNarrative | null;
  /** Which engine's wording the caller should present. */
  engine: 'ai-agent' | 'deterministic';
  /** The agent's model name, when it wrote the text. */
  model: string | null;
  /** Why the agent was not used, for the server log. Never shown to a licensee. */
  reason?: string;
}

const MODEL = () => process.env.ANALYTICS_AI_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = Number(process.env.ANALYTICS_AI_TIMEOUT_MS || 30000);
const MAX_CHARS = 2000;

export const aiAnalystEnabled = () =>
  process.env.ANALYTICS_AI_ENABLED === 'true' && !!process.env.GEMINI_API_KEY;

/* ------------------------------------------------------------------ *
 * What the agent is allowed to see
 * ------------------------------------------------------------------ */

/**
 * The figures, with every licensee identity removed.
 *
 * Built by naming what goes in, not by deleting what must stay out: a new
 * tag added to the report later cannot leak through a field list, whereas it
 * would leak straight through a blocklist.
 */
export function figuresFor(data: AnalyticsData) {
  const pick = (keys: string[]) => Object.fromEntries(
    keys.filter(k => Object.hasOwn(data as object, k)).map(k => [k, (data as any)[k]]));

  return {
    period: pick(['period_label_kh', 'period_range_kh', 'data_period_kh', 'data_as_of_kh']),
    scale: pick(['licensees_analyzed', 'records_analyzed', 'data_completeness',
      'records_excluded', 'records_no_gps', 'min_sample']),
    risk: pick(['risk_high', 'risk_medium', 'risk_low', 'risk_total', 'overall_risk_kh']),
    kpis: (data.kpis as any[] || []).map(r => ({
      name: r.name, current: r.current, previous: r.previous, trend: r.trend })),
    forecasts: (data.forecasts as any[] || []).map(r => ({
      category: r.category, previous: r.previous, current: r.current,
      forecast: r.forecast, interval: r.interval, trend: r.trend })),
    // Provinces are geography, not identities, and the commentary is about
    // where instruments are. Licensee-level rows are deliberately absent.
    geo: (data.geo as any[] || []).map(r => ({
      province: r.province, installed: r.installed, repairs: r.repairs,
      fail_rate: r.fail_rate, risk_level: r.risk_level })),
    anomaly_types: [...new Set((data.anomalies as any[] || []).map(r => String(r.type)))],
    anomaly_count: (data.anomalies as any[] || []).length,
    models: (data.models as any[] || []).map(r => ({
      name: r.name, method: r.method, performance: r.performance })),
  };
}

/* ------------------------------------------------------------------ *
 * The guard that makes this usable in an official report
 * ------------------------------------------------------------------ */

const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';
const toArabic = (s: string) =>
  s.replace(/[០-៩]/g, d => String(KHMER_DIGITS.indexOf(d)));

/** Every digit group in a string, normalised to Arabic numerals. */
function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of toArabic(text).matchAll(/\d+(?:[.,]\d+)?/g)) {
    out.push(m[0].replace(',', '.').replace(/\.0+$/, '').replace(/^0+(?=\d)/, ''));
  }
  return out;
}

/**
 * True when every number the agent wrote is one we gave it.
 *
 * The year and the small ordinals that number a report's own sections are
 * allowed: they are not claims about the data. Everything else must be
 * traceable to a figure, or the text is not used.
 */
export function numbersAreGrounded(text: string, figures: unknown): boolean {
  const allowed = new Set<string>(numbersIn(JSON.stringify(figures)));
  // Section numbering and the obvious constants of the report's own form.
  for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '95', '100']) allowed.add(n);
  return numbersIn(text).every(n => allowed.has(n));
}

/* ------------------------------------------------------------------ *
 * The call
 * ------------------------------------------------------------------ */

const PROMPT = `អ្នកគឺជាអ្នកវិភាគទិន្នន័យជំនាញរបស់មន្ទីរជាតិមាត្រាសាស្ត្រកម្ពុជា (NMC)។

សរសេរអត្ថបទអធិប្បាយជាភាសាខ្មែរផ្លូវការ សម្រាប់របាយការណ៍វិភាគទិន្នន័យដែលជូនថ្នាក់ដឹកនាំ។

វិន័យដែលមិនអាចបំពានបាន៖
1. ប្រើតែតួលេខដែលមានក្នុងទិន្នន័យខាងក្រោម។ ហាមបង្កើត ហាមបំប៉ន ហាមបង្គ្រប់តួលេខ។ បើតួលេខណាមួយមិនមាន សូមសរសេរដោយមិនប្រើតួលេខ។
2. ហាមនិយាយថាអ្នកកាន់អាជ្ញាប័ណ្ណណាមួយបានល្មើស។ ពិន្ទុហានិភ័យ និងករណីមិនប្រក្រតី គ្រាន់តែជាសញ្ញាសម្រាប់ការផ្ទៀងផ្ទាត់ប៉ុណ្ណោះ។
3. ហាមស្នើវិធានការផ្លូវការ ដូចជាការដាក់ទណ្ឌកម្ម ឬការដកអាជ្ញាប័ណ្ណ។
4. សរសេរឱ្យខ្លី ច្បាស់ និងសុភាព។ កុំប្រើពាក្យបំផ្លើស។

ឆ្លើយជា JSON តែមួយ ដោយមិនមានអត្ថបទផ្សេង៖
{"executive_summary":"...","trend_commentary":"...","geo_commentary":"...","conclusion":"..."}

- executive_summary: សេចក្ដីសង្ខេបសម្រាប់អ្នកដឹកនាំ (៤–៦ ប្រយោគ)
- trend_commentary: អធិប្បាយលើនិន្នាការ និងការព្យាករ រួមទាំងចន្លោះទំនុកចិត្ត ៩៥% (៣–៥ ប្រយោគ)
- geo_commentary: អធិប្បាយលើការវិភាគតាមខេត្ត/រាជធានី (២–៤ ប្រយោគ)
- conclusion: សេចក្ដីសន្និដ្ឋាន (៣–៥ ប្រយោគ)

ទិន្នន័យ៖
`;

/**
 * Ask the agent to word the report. Returns `engine: 'deterministic'`
 * whenever its answer cannot be used, with the reason for the log.
 */
export async function draftWithAiAnalyst(data: AnalyticsData): Promise<AiAnalystResult> {
  const fallback = (reason: string): AiAnalystResult =>
    ({ narrative: null, engine: 'deterministic', model: null, reason });

  if (!aiAnalystEnabled()) return fallback('ANALYTICS_AI_ENABLED is not true, or GEMINI_API_KEY is unset');

  const figures = figuresFor(data);
  const model = MODEL();

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: String(process.env.GEMINI_API_KEY) });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let raw: string;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: PROMPT + JSON.stringify(figures, null, 1),
        config: { responseMimeType: 'application/json', temperature: 0.2, abortSignal: controller.signal },
      });
      raw = String(response.text || '');
    } finally {
      clearTimeout(timer);
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback('the agent did not return a JSON object');
    }

    const narrative: Record<string, string> = {};
    for (const key of NARRATIVE_SCALARS) {
      const value = (parsed as any)[key];
      if (typeof value !== 'string' || !value.trim()) return fallback(`${key} missing or empty`);
      if (value.length > MAX_CHARS) return fallback(`${key} is longer than ${MAX_CHARS} characters`);
      // Rule 1, enforced rather than requested.
      if (!numbersAreGrounded(value, figures)) {
        return fallback(`${key} contains a figure that is not in the data`);
      }
      narrative[key] = value.trim();
    }

    return { narrative: narrative as unknown as AiNarrative, engine: 'ai-agent', model };
  } catch (err: any) {
    return fallback(err?.name === 'AbortError'
      ? `the agent did not answer within ${TIMEOUT_MS}ms`
      : `the agent call failed: ${err?.message || err}`);
  }
}
