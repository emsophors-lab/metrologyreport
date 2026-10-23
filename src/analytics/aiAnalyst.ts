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

/**
 * The models to try, in order.
 *
 * A list rather than one name because the provider's flash models go through
 * spells of "experiencing high demand", and a monthly report should not lose
 * its AI wording to a busy five minutes. Whichever model answers is the one
 * recorded in the report's limitations, so substituting is visible, not
 * silent. Configure as a comma-separated list.
 */
const MODELS = () => (process.env.ANALYTICS_AI_MODEL || 'gemini-3.8-flash,gemini-flash-latest')
  .split(',').map(m => m.trim()).filter(Boolean);

/**
 * Attempts per model. One, by default.
 *
 * A successful call takes 25-30s when the provider is healthy, and the whole
 * budget has to fit under the serverless function's deadline. Spending it on
 * a second go at a model that has just said "high demand" leaves nothing for
 * the next model in the list, which is the likelier way to get an answer.
 * Raise it only where the budget is generous (a worker, not a request).
 */
const ATTEMPTS = Number(process.env.ANALYTICS_AI_ATTEMPTS || 1);

/**
 * Whether a failure is worth trying again.
 *
 * Overload, a gateway error and a dropped connection are conditions of the
 * moment. A bad key, an unknown model or a malformed request will fail
 * identically however many times it is sent, and retrying those just delays
 * the fallback the report is going to use anyway.
 *
 * An exhausted quota is deliberately NOT transient, even though it reads
 * like a temporary condition. The free tier allows 20 requests per day per
 * model and tells you to retry in over an hour; no budget measured in
 * seconds will outlast it. Falling through to the NEXT model in the list is
 * the useful response, because the quota is counted per model.
 */
function transient(message: string): boolean {
  if (/quota|RESOURCE_EXHAUSTED|HTTP 429|too many requests/i.test(message)) return false;
  return /high demand|overload|unavailable|timeout|timed out|fetch failed|ECONN|ETIMEDOUT|socket hang up|HTTP 50\d/i
    .test(message);
}
/**
 * The total time the agent may take, across every model and retry.
 *
 * A budget rather than a per-attempt timeout, because the retries have to
 * fit inside the serverless function's own deadline: three 30-second
 * attempts would be killed by the platform mid-flight, and the report would
 * come back as a 504 instead of as a report worded by the drafter. 50s
 * leaves room under a 60s function limit to build and return it.
 */
const BUDGET_MS = Number(process.env.ANALYTICS_AI_BUDGET_MS || 50000);
/** The most any single attempt may take, within that budget. */
const TIMEOUT_MS = Number(process.env.ANALYTICS_AI_TIMEOUT_MS || 45000);
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
 * The call to the model, as a replaceable function.
 *
 * Separated so the checks can exercise the path where the agent ANSWERS —
 * the accept path, and each rejection — without a key and without a network.
 * Testing only the no-key fallback would leave the guards in this file
 * unverified, which is the opposite of the point.
 */
export type Generate = (prompt: string, model: string, signal: AbortSignal) => Promise<string>;

/**
 * One HTTPS POST, rather than the @google/genai SDK.
 *
 * The SDK hung for the full timeout against this endpoint while the same
 * request by fetch answered in under a second, so the SDK is not in the
 * path: for a single JSON generateContent call it buys nothing and couples
 * the report to an SDK version. The timeout here is ours, and honoured.
 */
const geminiGenerate: Generate = async (prompt, model, signal) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: {
        'x-goog-api-key': String(process.env.GEMINI_API_KEY),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });

  const body = await response.json().catch(() => null) as any;
  if (!response.ok || body?.error) {
    // The provider's own words. A model name that has been retired is the
    // likeliest failure, and it says so precisely — worth keeping.
    throw new Error(body?.error?.message || `HTTP ${response.status}`);
  }
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error(`the answer had no content (finishReason: ${body?.candidates?.[0]?.finishReason || 'none'})`);
  }
  return parts.map((part: any) => String(part?.text || '')).join('');
};

/**
 * Ask the agent to word the report. Returns `engine: 'deterministic'`
 * whenever its answer cannot be used, with the reason for the log.
 */
export async function draftWithAiAnalyst(
  data: AnalyticsData,
  generate: Generate = geminiGenerate,
): Promise<AiAnalystResult> {
  const fallback = (reason: string): AiAnalystResult =>
    ({ narrative: null, engine: 'deterministic', model: null, reason });

  if (generate === geminiGenerate && !aiAnalystEnabled()) {
    return fallback('ANALYTICS_AI_ENABLED is not true, or GEMINI_API_KEY is unset');
  }

  const figures = figuresFor(data);
  const prompt = PROMPT + JSON.stringify(figures, null, 1);

  const deadline = Date.now() + BUDGET_MS;
  const remaining = () => deadline - Date.now();

  /** One attempt, bounded by whichever is sooner: its timeout or the budget. */
  const ask = async (model: string) => {
    const allowed = Math.min(TIMEOUT_MS, remaining());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), allowed);
    try {
      return await generate(prompt, model, controller.signal);
    } catch (err: any) {
      throw new Error(err?.name === 'AbortError'
        ? `did not answer within ${allowed}ms`
        : String(err?.message || err));
    } finally {
      clearTimeout(timer);
    }
  };

  const problems: string[] = [];

  for (const model of MODELS()) {
    for (let attempt = 1; attempt <= Math.max(1, ATTEMPTS); attempt++) {
      // Stop rather than start something the budget cannot finish.
      if (remaining() < 2000) {
        problems.push(`budget of ${BUDGET_MS}ms spent`);
        return fallback(`no model answered — ${problems.join('; ')}`);
      }
      let raw: string;
      try {
        raw = await ask(model);
      } catch (err: any) {
        const message = String(err?.message || err);
        problems.push(`${model}: ${message}`);
        if (!transient(message)) break;             // the next attempt would fail the same way
        if (attempt < ATTEMPTS) await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      // The answer arrived. From here a rejection is about the CONTENT, and
      // is not retried: resampling until a model stops inventing figures
      // would turn the guard into a dice roll. The deterministic draft is a
      // perfectly good report.
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch { return fallback(`${model}: the answer was not JSON`); }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return fallback(`${model}: the agent did not return a JSON object`);
      }

      const narrative: Record<string, string> = {};
      for (const key of NARRATIVE_SCALARS) {
        const value = (parsed as any)[key];
        if (typeof value !== 'string' || !value.trim()) return fallback(`${model}: ${key} missing or empty`);
        if (value.length > MAX_CHARS) return fallback(`${model}: ${key} is longer than ${MAX_CHARS} characters`);
        // Rule 1, enforced rather than requested.
        if (!numbersAreGrounded(value, figures)) {
          return fallback(`${model}: ${key} contains a figure that is not in the data`);
        }
        narrative[key] = value.trim();
      }

      return { narrative: narrative as unknown as AiNarrative, engine: 'ai-agent', model };
    }
  }

  return fallback(`no model answered — ${problems.join('; ')}`);
}
