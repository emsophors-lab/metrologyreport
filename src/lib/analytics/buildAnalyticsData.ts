/**
 * Turning aggregated Annex 8 figures into the Smart Analytics report's data.
 *
 * Deliberately a pure function over an already-aggregated input. The heavy
 * work — scanning every accepted Annex 8 report and its entries — happens in
 * the database (see analyticsAggregationSql.ts); this file only shapes and
 * words the result. That keeps it testable without a database and keeps one
 * definition of each figure.
 *
 * Source of truth: Annex 8 reports with status ACCEPTED. A month a licensee
 * is still filling in, or one NMC has not accepted, is not evidence of
 * anything and is excluded.
 *
 * Period tags come from the consolidated report's helper, not a second copy:
 * one report wording the period differently from another is the kind of thing
 * that gets noticed in a ministry.
 */
import {
  DEFAULT_MIN_SAMPLE, DOTS, NARRATIVE_LOOPS, NARRATIVE_SCALARS, NOT_MEASURED,
  OFFICER_SCALARS, REVIEW_PENDING, RISK_LEVEL_KH, UNKNOWN, riskLevel,
} from './contract';
import type { AnalyticsData, AnalyticsTextInputs, ReviewStatus } from './contract';
import { forecastNext, intervalText } from './forecast';
import {
  KHMER_MONTHS, periodTemplateFields, previousPeriod, reportingPeriod, toKhmerDigits,
} from '../consolidated/periods';
import type { PeriodType, ReportingPeriod } from '../consolidated/periods';

/* ------------------------------------------------------------------ *
 * What the database hands us
 * ------------------------------------------------------------------ */

export interface CategorySeries {
  /** Category code, e.g. WEIGHBRIDGE. */
  code: string;
  /** Khmer label as it should print. */
  label_kh: string;
  /** Counts for equal-length periods, oldest first, ending with the current one. */
  history: number[];
}

export interface LicenseeRisk {
  licensee: string;
  licence_no: string;
  /** 0–100. */
  score: number;
  previous_score: number | null;
  /** Why the score is what it is. Never empty — an unexplained score is not usable. */
  factors: string[];
  recommended_action: string;
}

export interface AnomalyRow {
  type: string;
  subject: string;
  description: string;
  /** 0–1. */
  score: number;
  review_status?: ReviewStatus;
}

export interface GeoRow {
  province: string;
  installed: number;
  repairs: number;
  verified: number;
  failed: number;
}

export interface QualityRow {
  model: string;
  manufacturer: string;
  verified: number;
  failed: number;
}

export interface ModelRow {
  name: string;
  purpose: string;
  method: string;
  /** Held-out performance, already worded, e.g. "AUC 0.81". Omit if unmeasured. */
  performance?: string;
  version: string;
}

export interface AnalyticsSource {
  period: { type: PeriodType; year: number; index: number };
  /** ISO date the figures were taken, Asia/Phnom_Penh. */
  data_as_of: string;
  model_set_version: string;
  licensees_analyzed: number;
  records_analyzed: number;
  records_previous: number | null;
  /** Entry rows rejected as unusable, and rows with no GPS. */
  records_excluded: number;
  records_no_gps: number;
  /** 0–100, how complete the analysed records were. */
  data_completeness_pct: number;
  /** How many months of history the forecast models saw. */
  history_months: number;
  categories: CategorySeries[];
  risks: LicenseeRisk[];
  anomalies: AnomalyRow[];
  geo: GeoRow[];
  quality: QualityRow[];
  models: ModelRow[];
  min_sample?: number;
  /**
   * Which engine performed the analysis, for the machine's signature block
   * and for the limitations list. Absent means no trained model was
   * available and the wording came from the deterministic drafter — which is
   * stated in the report rather than left for the reader to guess.
   */
  engine?: {
    /** Active trained model version id, or null when cold-start. */
    trained_model_id?: string | null;
    /** How the Khmer narrative was worded. */
    narrative?: 'ai-agent' | 'deterministic';
    /** The AI agent's model name, when one worded it. */
    agent_model?: string | null;
  };
  /** Totals for the activity KPIs, current and previous period. */
  totals: {
    manufactured: number; installed: number; repaired: number;
    passed: number; failed: number; pending: number;
  };
  totals_previous: {
    manufactured: number; installed: number; repaired: number;
    passed: number; failed: number; pending: number;
  } | null;
}

/* ------------------------------------------------------------------ *
 * Small shared formatting
 * ------------------------------------------------------------------ */

const kh = (v: number | string) => toKhmerDigits(v);
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const pct1 = (v: number) => `${v.toFixed(1)}%`;

/** "↑ +10.4%", "↓ -3.2%", "→ ០%", or the unknown marker. */
function trendText(current: number, previous: number | null): string {
  if (previous === null || !Number.isFinite(previous)) return UNKNOWN;
  if (previous === 0) return current === 0 ? '→ ០%' : 'ថ្មី';
  const delta = ((current - previous) / previous) * 100;
  const arrow = delta > 0.05 ? '↑' : delta < -0.05 ? '↓' : '→';
  return `${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

const dmyKh = (iso: string) => {
  const [y, m, d] = String(iso).split('-');
  return `${kh(d)}/${kh(m)}/${kh(y)}`;
};

/** An overall risk word from the share of licensees in each band. */
function overallRisk(high: number, medium: number, total: number): string {
  if (total === 0) return UNKNOWN;
  const highShare = pct(high, total);
  const elevated = pct(high + medium, total);
  if (highShare >= 20) return RISK_LEVEL_KH.HIGH;
  if (elevated >= 35) return RISK_LEVEL_KH.MEDIUM;
  return RISK_LEVEL_KH.LOW;
}

/* ------------------------------------------------------------------ *
 * Khmer drafting
 *
 * Plain official wording built only from the computed numbers. The analyst
 * sees these in editable boxes and what they save wins — nothing here is
 * presented as the analyst's own words until they have read it.
 * ------------------------------------------------------------------ */

function draftExecutiveSummary(s: AnalyticsSource, f: ReturnType<typeof periodTemplateFields>): string {
  const activity = s.totals.manufactured + s.totals.installed + s.totals.repaired;
  const prev = s.totals_previous
    ? s.totals_previous.manufactured + s.totals_previous.installed + s.totals_previous.repaired
    : null;
  const movement = prev === null ? '' :
    prev === 0 ? ' ដែលជាសកម្មភាពដំបូងក្នុងរយៈពេលប្រៀបធៀប' :
    activity >= prev
      ? ` កើនឡើង ${pct1(pct(activity - prev, prev))} បើធៀបនឹង${f.period_word_kh}មុន`
      : ` ថយចុះ ${pct1(pct(prev - activity, prev))} បើធៀបនឹង${f.period_word_kh}មុន`;

  const judged = s.totals.passed + s.totals.failed + s.totals.pending;
  const passLine = judged > 0
    ? ` អត្រាឆ្លងការផ្ទៀងផ្ទាត់ស្ថិតនៅ ${pct1(pct(s.totals.passed, judged))}។`
    : '';

  const high = s.risks.filter(r => riskLevel(r.score) === 'HIGH').length;
  const riskLine = s.risks.length > 0
    ? ` ក្នុងចំណោមអ្នកកាន់អាជ្ញាប័ណ្ណ ${kh(s.risks.length)} មាន ${kh(high)} ស្ថិតក្នុងកម្រិតហានិភ័យខ្ពស់។`
    : '';

  return `ក្នុង${f.period_label_kh} នាយកដ្ឋានបានវិភាគកំណត់ត្រាសកម្មភាពចំនួន ${kh(s.records_analyzed)} `
    + `ពីអ្នកកាន់អាជ្ញាប័ណ្ណ ${kh(s.licensees_analyzed)} ក្រុមហ៊ុន។ សកម្មភាពសរុបមានចំនួន ${kh(activity)}${movement}។`
    + passLine + riskLine
    + ` លទ្ធផលវិភាគនេះជាឧបករណ៍គាំទ្រការសម្រេចចិត្តប៉ុណ្ណោះ ហើយត្រូវផ្ទៀងផ្ទាត់ដោយមន្ត្រីជំនាញមុនការអនុវត្តវិធានការណាមួយ។`;
}

function draftKeyFindings(s: AnalyticsSource, f: ReturnType<typeof periodTemplateFields>): Array<{ text: string }> {
  const out: Array<{ text: string }> = [];

  const rising = s.categories
    .map(c => ({ c, cur: c.history.at(-1) ?? 0, prev: c.history.at(-2) ?? null }))
    .filter(x => x.prev !== null && x.prev > 0)
    .sort((a, b) => ((b.cur - b.prev!) / b.prev!) - ((a.cur - a.prev!) / a.prev!))[0];
  if (rising && rising.cur > rising.prev!) {
    out.push({
      text: `${rising.c.label_kh} កើនឡើង ${pct1(pct(rising.cur - rising.prev!, rising.prev!))} `
        + `បើធៀបនឹង${f.period_word_kh}មុន។`,
    });
  }

  const judged = s.totals.passed + s.totals.failed + s.totals.pending;
  if (s.totals.failed > 0 && judged > 0) {
    out.push({
      text: `មានឧបករណ៍ ${kh(s.totals.failed)} មិនឆ្លងការផ្ទៀងផ្ទាត់ ស្មើនឹង ${pct1(pct(s.totals.failed, judged))} `
        + `នៃឧបករណ៍ដែលបានវាយតម្លៃ។`,
    });
  }

  const high = s.risks.filter(r => riskLevel(r.score) === 'HIGH');
  if (high.length) {
    out.push({
      text: `អ្នកកាន់អាជ្ញាប័ណ្ណចំនួន ${kh(high.length)} ស្ថិតក្នុងកម្រិតហានិភ័យខ្ពស់ `
        + `(ពិន្ទុ ≥ ${kh(70)}) ហើយត្រូវការការតាមដានជិតស្និទ្ធ។`,
    });
  }

  const pendingAnomalies = s.anomalies.filter(a => (a.review_status ?? REVIEW_PENDING) === REVIEW_PENDING);
  if (pendingAnomalies.length) {
    out.push({
      text: `រកឃើញករណីមិនប្រក្រតីចំនួន ${kh(pendingAnomalies.length)} ដែលកំពុងរង់ចាំការផ្ទៀងផ្ទាត់ដោយមន្ត្រី។`,
    });
  }

  if (!out.length) {
    out.push({ text: `មិនមានការប្រែប្រួលគួរឱ្យកត់សម្គាល់ក្នុង${f.period_label_kh}ទេ។` });
  }
  return out;
}

function draftTrendCommentary(s: AnalyticsSource, f: ReturnType<typeof periodTemplateFields>): string {
  const withForecast = s.categories
    .map(c => ({ c, fc: forecastNext(c.history) }))
    .filter(x => x.fc.interval !== null);
  if (!withForecast.length) {
    return `ទិន្នន័យប្រវត្តិមិនទាន់គ្រប់គ្រាន់ដើម្បីបង្កើតចន្លោះទំនុកចិត្ត ៩៥% សម្រាប់ការព្យាករទេ។ `
      + `ការព្យាករនឹងអាចធ្វើបានពេលមានទិន្នន័យយ៉ាងតិច ៤ ${f.period_word_kh}។`;
  }
  const top = withForecast.sort((a, b) => (b.fc.value - (b.c.history.at(-1) ?? 0)) - (a.fc.value - (a.c.history.at(-1) ?? 0)))[0];
  const now = top.c.history.at(-1) ?? 0;
  const dir = top.fc.value > now ? 'បន្តកើនឡើង' : top.fc.value < now ? 'ថយចុះ' : 'រក្សាស្ថិរភាព';
  return `ការព្យាករបង្ហាញថា ${top.c.label_kh} នឹង${dir}ក្នុង${f.period_word_kh}បន្ទាប់ `
    + `(ប៉ាន់ស្មាន ${top.fc.value} ចន្លោះទំនុកចិត្ត ៩៥% ${intervalText(top.fc, UNKNOWN)})។ `
    + `ការព្យាករផ្អែកលើទិន្នន័យប្រវត្តិ ${kh(s.history_months)} ខែ ហើយមិនគិតបញ្ចូលការផ្លាស់ប្ដូរគោលនយោបាយ `
    + `ឬព្រឹត្តិការណ៍មិនធម្មតានាពេលអនាគតទេ។`;
}

function draftGeoCommentary(s: AnalyticsSource): string {
  if (!s.geo.length) return `មិនមានទិន្នន័យភូមិសាស្ត្រគ្រប់គ្រាន់សម្រាប់${UNKNOWN}ទេ។`;
  const rated = s.geo
    .filter(g => g.verified > 0)
    .map(g => ({ g, rate: pct(g.failed, g.verified) }))
    .sort((a, b) => b.rate - a.rate);
  const national = pct(
    s.geo.reduce((n, g) => n + g.failed, 0),
    s.geo.reduce((n, g) => n + g.verified, 0),
  );
  if (!rated.length) {
    return `មិនទាន់មានការផ្ទៀងផ្ទាត់គ្រប់គ្រាន់ក្នុងខេត្តនីមួយៗ ដើម្បីគណនាអត្រាមិនឆ្លងទេ។`;
  }
  const worst = rated[0];
  const line = worst.rate > national
    ? `អត្រាមិនឆ្លងការផ្ទៀងផ្ទាត់នៅ${worst.g.province} (${pct1(worst.rate)}) ខ្ពស់ជាងមធ្យមភាគជាតិ (${pct1(national)})។`
    : `អត្រាមិនឆ្លងការផ្ទៀងផ្ទាត់មានលក្ខណៈស្មើគ្នាតាមខេត្ត ដោយមធ្យមភាគជាតិស្ថិតនៅ ${pct1(national)}។`;
  const gps = s.records_no_gps > 0
    ? ` កំណត់ត្រាចំនួន ${kh(s.records_no_gps)} មិនមានទិន្នន័យ GPS ដែលអាចប៉ះពាល់ដល់ការវិភាគតាមតំបន់។`
    : '';
  return line + gps;
}

function draftConclusion(s: AnalyticsSource, f: ReturnType<typeof periodTemplateFields>): string {
  const high = s.risks.filter(r => riskLevel(r.score) === 'HIGH').length;
  const overall = overallRisk(high, s.risks.filter(r => riskLevel(r.score) === 'MEDIUM').length, s.risks.length);
  return `ស្ថានភាពទូទៅនៃសកម្មភាពអ្នកកាន់អាជ្ញាប័ណ្ណក្នុង${f.period_label_kh} ត្រូវបានវាយតម្លៃថាមានកម្រិតហានិភ័យ${overall}។ `
    + `នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្មនឹងបន្តតាមដានអ្នកកាន់អាជ្ញាប័ណ្ណដែលមានហានិភ័យខ្ពស់ `
    + `និងផ្ទៀងផ្ទាត់ករណីមិនប្រក្រតីដែលបានរកឃើញ។ រាល់វិធានការរដ្ឋបាលត្រូវផ្អែកលើការត្រួតពិនិត្យជាក់ស្តែង `
    + `ដោយមន្ត្រីមានសមត្ថកិច្ច មិនមែនលើពិន្ទុវិភាគតែម្នាក់ឯងទេ។`;
}

function draftLimitations(s: AnalyticsSource): Array<{ text: string }> {
  const out: Array<{ text: string }> = [];
  if (s.data_completeness_pct < 100) {
    out.push({
      text: `ទិន្នន័យ ${pct1(100 - s.data_completeness_pct)} មិនពេញលេញ`
        + (s.records_no_gps > 0 ? ` ហើយកំណត់ត្រា ${kh(s.records_no_gps)} មិនមាន GPS` : '')
        + `។ លទ្ធផលវិភាគអាស្រ័យលើគុណភាពទិន្នន័យដែលបានរាយការណ៍។`,
    });
  }
  const noInterval = s.categories.filter(c => forecastNext(c.history).interval === null).length;
  if (noInterval > 0) {
    out.push({
      text: `ប្រភេទឧបករណ៍ចំនួន ${kh(noInterval)} មិនមានទិន្នន័យប្រវត្តិគ្រប់គ្រាន់ `
        + `ដើម្បីបង្កើតចន្លោះទំនុកចិត្ត ៩៥% ដូច្នេះការព្យាករត្រូវប្រើដោយប្រុងប្រយ័ត្ន។`,
    });
  }
  out.push({
    text: `ពិន្ទុហានិភ័យ និងករណីមិនប្រក្រតី ជាសញ្ញាសម្រាប់ការតាមដាន មិនមែនជាភស្តុតាងនៃការល្មើសទេ។`,
  });

  // Who produced the analysis, and who produced the wording. A reader must
  // be able to tell a trained model's score from a cold-start one, and an
  // agent's sentence from a generated one, without asking us.
  const trained = s.engine?.trained_model_id;
  out.push({
    text: trained
      ? `ការវិភាគធ្វើឡើងដោយស្វ័យប្រវត្តិ ដោយប្រើម៉ូដែលរៀនដោយម៉ាស៊ីនលេខ ${trained}។`
      : `គ្មានម៉ូដែលរៀនដោយម៉ាស៊ីនបានបណ្ដុះបណ្ដាលនៅពេលវិភាគ។ `
        + `ពិន្ទុហានិភ័យមកពីវិធានដែលអាចផ្ទៀងផ្ទាត់បានលើរបាយការណ៍ឧបសម្ព័ន្ធទី៨ តែប៉ុណ្ណោះ។`,
  });
  out.push({
    text: s.engine?.narrative === 'ai-agent'
      ? `អត្ថបទអធិប្បាយត្រូវតាក់តែងដោយភ្នាក់ងារ AI (${s.engine.agent_model || 'AI agent'}) `
        + `ពីតួលេខដែលបានគណនាខាងលើ ហើយត្រូវពិនិត្យដោយមន្ត្រីមុនអនុម័ត។`
      : `អត្ថបទអធិប្បាយត្រូវតាក់តែងដោយប្រព័ន្ធពីតួលេខដែលបានគណនាខាងលើ `
        + `ហើយត្រូវពិនិត្យដោយមន្ត្រីមុនអនុម័ត។`,
  });
  return out;
}

function draftRecommendations(s: AnalyticsSource, f: ReturnType<typeof periodTemplateFields>) {
  const out: Array<Record<string, string | number>> = [];
  const dept = 'នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម';
  const high = s.risks.filter(r => riskLevel(r.score) === 'HIGH');
  if (high.length) {
    out.push({
      no: out.length + 1, priority: 'ខ្ពស់',
      text: `ចុះត្រួតពិនិត្យអ្នកកាន់អាជ្ញាប័ណ្ណ ${kh(high.length)} ដែលមានហានិភ័យខ្ពស់`,
      responsible: dept, timeline: `${f.period_word_kh}បន្ទាប់`,
    });
  }
  const pending = s.anomalies.filter(a => (a.review_status ?? REVIEW_PENDING) === REVIEW_PENDING);
  if (pending.length) {
    out.push({
      no: out.length + 1, priority: 'ខ្ពស់',
      text: `ផ្ទៀងផ្ទាត់ករណីមិនប្រក្រតី ${kh(pending.length)} ដែលកំពុងរង់ចាំ`,
      responsible: dept, timeline: '៣០ ថ្ងៃ',
    });
  }
  if (s.data_completeness_pct < 95) {
    out.push({
      no: out.length + 1, priority: 'មធ្យម',
      text: `ពង្រឹងគុណភាពទិន្នន័យរបាយការណ៍ ជាពិសេសទីតាំង GPS និងលេខវិញ្ញាបនបត្រ`,
      responsible: dept, timeline: `${f.period_word_kh}បន្ទាប់`,
    });
  }
  if (!out.length) {
    out.push({
      no: 1, priority: 'មធ្យម',
      text: 'បន្តការតាមដានតាមទម្លាប់ និងរក្សាគុណភាពទិន្នន័យ',
      responsible: dept, timeline: `${f.period_word_kh}បន្ទាប់`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

export function analyticsPeriod(type: PeriodType, year: number, index = 1): ReportingPeriod {
  return reportingPeriod(type, year, index);
}

export function buildAnalyticsData(
  source: AnalyticsSource,
  text: AnalyticsTextInputs = {},
  now = new Date(),
): AnalyticsData {
  const period = reportingPeriod(source.period.type, source.period.year, source.period.index);
  const fields = periodTemplateFields(period);
  const minSample = source.min_sample ?? DEFAULT_MIN_SAMPLE;

  const generatedIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  /* ---- risk ---- */
  const banded = source.risks.map(r => ({ ...r, level: riskLevel(r.score) }));
  const high = banded.filter(r => r.level === 'HIGH');
  const medium = banded.filter(r => r.level === 'MEDIUM');
  const low = banded.filter(r => r.level === 'LOW');

  const byScore = [...banded].sort((a, b) => b.score - a.score);

  /* ---- KPIs ---- */
  const activity = source.totals.manufactured + source.totals.installed + source.totals.repaired;
  const prevTotals = source.totals_previous;
  const prevActivity = prevTotals
    ? prevTotals.manufactured + prevTotals.installed + prevTotals.repaired : null;
  const judged = source.totals.passed + source.totals.failed + source.totals.pending;
  const prevJudged = prevTotals
    ? prevTotals.passed + prevTotals.failed + prevTotals.pending : null;

  const kpis = [
    {
      no: 1, name: 'សកម្មភាពសរុប (ផលិត + ដំឡើង + ជួសជុល)',
      current: String(activity),
      previous: prevActivity === null ? UNKNOWN : String(prevActivity),
      trend: trendText(activity, prevActivity),
    },
    {
      no: 2, name: 'ឧបករណ៍ឆ្លងការផ្ទៀងផ្ទាត់',
      current: String(source.totals.passed),
      previous: prevTotals === null ? UNKNOWN : String(prevTotals.passed),
      trend: trendText(source.totals.passed, prevTotals?.passed ?? null),
    },
    {
      no: 3, name: 'ឧបករណ៍មិនឆ្លងការផ្ទៀងផ្ទាត់',
      current: String(source.totals.failed),
      previous: prevTotals === null ? UNKNOWN : String(prevTotals.failed),
      trend: trendText(source.totals.failed, prevTotals?.failed ?? null),
    },
    {
      no: 4, name: 'អត្រាឆ្លងការផ្ទៀងផ្ទាត់',
      current: judged ? pct1(pct(source.totals.passed, judged)) : UNKNOWN,
      previous: prevJudged ? pct1(pct(prevTotals!.passed, prevJudged)) : UNKNOWN,
      trend: judged && prevJudged
        ? trendText(pct(source.totals.passed, judged), pct(prevTotals!.passed, prevJudged))
        : UNKNOWN,
    },
    {
      no: 5, name: 'អ្នកកាន់អាជ្ញាប័ណ្ណហានិភ័យខ្ពស់',
      current: String(high.length),
      previous: UNKNOWN,
      trend: UNKNOWN,
    },
  ];

  /* ---- forecasts ---- */
  const forecasts = source.categories.map((c, i) => {
    const point = forecastNext(c.history);
    const current = c.history.at(-1) ?? 0;
    const previous = c.history.at(-2) ?? null;
    return {
      no: i + 1,
      category: c.label_kh,
      previous: previous === null ? UNKNOWN : String(previous),
      current: String(current),
      forecast: String(point.value),
      interval: intervalText(point, UNKNOWN),
      trend: point.value > current ? '↑ កើន' : point.value < current ? '↓ ថយ' : '→ ស្ថិរ',
    };
  });

  /* ---- quality, only where there is enough evidence ---- */
  const quality = source.quality
    .filter(q => q.verified >= minSample)
    .sort((a, b) => pct(b.failed, b.verified) - pct(a.failed, a.verified))
    .map((q, i) => {
      const rate = pct(q.failed, q.verified);
      return {
        no: i + 1,
        model: q.model,
        manufacturer: q.manufacturer || UNKNOWN,
        verified: String(q.verified),
        failed: String(q.failed),
        fail_rate: pct1(rate),
        remark: rate >= 10 ? 'ពិនិត្យឡើងវិញ' : '',
      };
    });

  /* ---- geography ---- */
  const nationalFail = pct(
    source.geo.reduce((n, g) => n + g.failed, 0),
    source.geo.reduce((n, g) => n + g.verified, 0),
  );
  const geo = source.geo
    .sort((a, b) => (b.installed + b.repairs) - (a.installed + a.repairs))
    .map((g, i) => {
      const rate = g.verified > 0 ? pct(g.failed, g.verified) : null;
      const level = rate === null ? UNKNOWN
        : rate >= nationalFail * 1.5 ? RISK_LEVEL_KH.HIGH
        : rate >= nationalFail ? RISK_LEVEL_KH.MEDIUM : RISK_LEVEL_KH.LOW;
      return {
        no: i + 1,
        province: g.province || UNKNOWN,
        installed: String(g.installed),
        repairs: String(g.repairs),
        fail_rate: rate === null ? UNKNOWN : pct1(rate),
        risk_level: level,
        remark: rate !== null && rate >= nationalFail * 1.5 ? 'តាមដានបន្ថែម' : '',
      };
    });

  /* ---- models: performance only where it was actually measured ---- */
  const models = source.models.map((m, i) => ({
    no: i + 1,
    name: m.name,
    purpose: m.purpose,
    method: m.method,
    performance: m.performance?.trim() || NOT_MEASURED,
    version: m.version,
  }));

  // period_word_en belongs to the consolidated template, which prints a
  // bilingual heading. This one does not, and an unused value would fail the
  // contract — the check that stops a tag going missing also stops a stray
  // one creeping in.
  const { period_word_en: _unusedHere, ...periodFields } = fields;

  const computed: Record<string, string | number> = {
    ...periodFields,
    generated_at_kh: dmyKh(generatedIso),
    model_set_version: source.model_set_version,
    licensees_analyzed_kh: kh(source.licensees_analyzed),
    records_analyzed_kh: kh(source.records_analyzed),
    overall_risk_kh: overallRisk(high.length, medium.length, banded.length),
    data_as_of_kh: dmyKh(source.data_as_of),
    data_period_kh: `${dmyKh(period.start)} – ${dmyKh(period.end)} `
      + `(ម៉ូដែលព្យាករប្រើទិន្នន័យ ${kh(source.history_months)} ខែ)`,
    licensees_analyzed: source.licensees_analyzed,
    records_analyzed: source.records_analyzed,
    data_completeness: pct1(source.data_completeness_pct),
    records_excluded: source.records_excluded,
    records_no_gps: source.records_no_gps,
    risk_high: high.length,
    risk_medium: medium.length,
    risk_low: low.length,
    risk_total: banded.length,
    min_sample: minSample,
  };

  const drafted = {
    executive_summary: draftExecutiveSummary(source, fields),
    trend_commentary: draftTrendCommentary(source, fields),
    geo_commentary: draftGeoCommentary(source),
    conclusion: draftConclusion(source, fields),
  };

  const officerBlank: Record<string, string> = {
    letter_no: DOTS, report_no: DOTS,
    lunar_date_line: 'ថ្ងៃ............ ខែ............ ឆ្នាំ............ ព.ស.............',
    signed_day_kh: '........', signed_month_kh: '............', signed_year_kh: '............',
    reviewer_name: DOTS, reviewer_position: DOTS, reviewed_date_kh: '......../......../............',
  };

  /**
   * The analyst block, signed by the machine that did the work.
   *
   * The version goes in the name because it is the only way a reader can
   * reproduce the figures: the same months analysed by a later model set can
   * legitimately give different scores, and a report that does not say which
   * one produced it cannot be checked. The date is the date the analysis
   * ran, not the date an officer looked at it.
   */
  const machine: Record<string, string> = {
    analyst_name: `ប្រព័ន្ធវិភាគស្វ័យប្រវត្តិ ${source.model_set_version} (AI Agent)`,
    analyst_position: 'ម៉ូដែលរៀនដោយម៉ាស៊ីន (ML) និងភ្នាក់ងារបញ្ញាសិប្បនិម្មិត (AI)',
    analysed_date_kh: dmyKh(generatedIso),
  };

  const data = {
    ...computed,
    ...drafted,
    ...officerBlank,
    ...machine,
    key_findings: draftKeyFindings(source, fields),
    limitations: draftLimitations(source),
    recommendations: draftRecommendations(source, fields),
    kpis,
    models,
    forecasts,
    high_risk: high.sort((a, b) => b.score - a.score).map((r, i) => ({
      no: i + 1,
      licensee: r.licensee,
      licence_no: r.licence_no,
      score: String(Math.round(r.score)),
      previous_score: r.previous_score === null ? UNKNOWN : String(Math.round(r.previous_score)),
      factors: r.factors.join('; ') || UNKNOWN,
      action: r.recommended_action,
    })),
    anomalies: source.anomalies.map((a, i) => ({
      no: i + 1,
      type: a.type,
      subject: a.subject,
      description: a.description,
      score: a.score.toFixed(2),
      review_status: a.review_status ?? REVIEW_PENDING,
    })),
    geo,
    quality,
    all_risk: byScore.map((r, i) => ({
      no: i + 1,
      licensee: r.licensee,
      licence_no: r.licence_no,
      score: String(Math.round(r.score)),
      level: RISK_LEVEL_KH[r.level],
      change: r.previous_score === null ? UNKNOWN
        : `${r.score - r.previous_score >= 0 ? '+' : ''}${Math.round(r.score - r.previous_score)}`,
      factors: r.factors.join('; ') || UNKNOWN,
    })),
  } as unknown as AnalyticsData;

  // The analyst's words and the officer's entries win over the drafts.
  return applyTextInputs(data, text);
}

/**
 * Keys a saved draft is allowed to overlay.
 *
 * Built from the contract rather than written out, so a key moved between
 * groups cannot leave a hole here. The machine's analyst block is absent on
 * purpose: those three values identify the engine that produced the figures,
 * and a draft — or a hand-written request — must not be able to put a
 * person's name on work the models did.
 */
const EDITABLE_KEYS: ReadonlySet<string> = new Set<string>([
  ...NARRATIVE_SCALARS, ...OFFICER_SCALARS, ...NARRATIVE_LOOPS,
]);

/** Overlay saved officer input and wording, ignoring blanks so a draft is not lost. */
export function applyTextInputs(data: AnalyticsData, text: AnalyticsTextInputs): AnalyticsData {
  const out = { ...data } as Record<string, unknown>;
  for (const [key, value] of Object.entries(text)) {
    if (!EDITABLE_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    out[key] = value;
  }
  return out as AnalyticsData;
}

export function previousAnalyticsPeriod(type: PeriodType, year: number, index = 1) {
  return previousPeriod(reportingPeriod(type, year, index));
}

export { KHMER_MONTHS };
