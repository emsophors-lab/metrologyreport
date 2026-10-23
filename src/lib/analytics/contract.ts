/**
 * The Smart Analytics report — what the template needs, exactly.
 *
 * Analytics_template_v1.docx is the single source of truth for layout. This
 * file is the single source of truth for the DATA that fills it: every tag in
 * the template has a key here, and every key here is used by the template.
 * `npm run analytics:check` enforces both directions, so a tag added in Word
 * and not here is a failed build rather than a blank line in a report that
 * goes to the Director General.
 *
 * Nothing here renders anything. Code only prepares values for tags.
 */
import type { PeriodType } from '../consolidated/periods';

export const TEMPLATE_PATH = '/templates/Analytics_template_v1.docx';
export const TEMPLATE_SHA256 = '2c99e809f0b49fae40da531a86dcf1b1c55027941a1d94f9d9fd72b2adab7961';

/** Shown where a figure genuinely cannot be computed, never as a zero. */
export const UNKNOWN = 'មិនមានទិន្នន័យ';
/** Shown where a model's performance has not been measured on held-out data. */
export const NOT_MEASURED = 'មិនទាន់វាស់';
export const DOTS = '..........................................';

/**
 * Risk bands, as fixed by NMC: High ≥ 70, Medium 40–69, Low < 40.
 *
 * The ML dashboard bands differently (Critical ≥80, High ≥60, Medium ≥35)
 * because it drives inspection queues rather than this report. Converting
 * happens in one place — riskLevel() below — so the two cannot drift.
 */
export const RISK_BANDS = { high: 70, medium: 40 } as const;

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export function riskLevel(score: number): RiskLevel {
  if (score >= RISK_BANDS.high) return 'HIGH';
  if (score >= RISK_BANDS.medium) return 'MEDIUM';
  return 'LOW';
}

export const RISK_LEVEL_KH: Record<RiskLevel, string> = {
  HIGH: 'ខ្ពស់', MEDIUM: 'មធ្យម', LOW: 'ទាប',
};

/** A quality row is only shown once a model has this many verifications. */
export const DEFAULT_MIN_SAMPLE = 20;

/**
 * An anomaly is a signal for an officer to check, never a finding on its own.
 * Only an NMC officer moves it off រង់ចាំពិនិត្យ.
 */
export const REVIEW_STATUSES = ['រង់ចាំពិនិត្យ', 'បានផ្ទៀងផ្ទាត់ – ពិត', 'មិនពិត'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_PENDING: ReviewStatus = 'រង់ចាំពិនិត្យ';

export const LOOP_FIELDS = {
  key_findings: ['text'],
  kpis: ['no', 'name', 'current', 'previous', 'trend'],
  models: ['no', 'name', 'purpose', 'method', 'performance', 'version'],
  forecasts: ['no', 'category', 'previous', 'current', 'forecast', 'interval', 'trend'],
  high_risk: ['no', 'licensee', 'licence_no', 'score', 'previous_score', 'factors', 'action'],
  anomalies: ['no', 'type', 'subject', 'description', 'score', 'review_status'],
  geo: ['no', 'province', 'installed', 'repairs', 'fail_rate', 'risk_level', 'remark'],
  quality: ['no', 'model', 'manufacturer', 'verified', 'failed', 'fail_rate', 'remark'],
  recommendations: ['no', 'priority', 'text', 'responsible', 'timeline'],
  limitations: ['text'],
  all_risk: ['no', 'licensee', 'licence_no', 'score', 'level', 'change', 'factors'],
} as const;

export type LoopKey = keyof typeof LOOP_FIELDS;
type Value = string | number;
type LoopRows = { [K in LoopKey]: Array<Record<(typeof LOOP_FIELDS)[K][number], Value>> };

/** Computed from the data. The analyst never types these. */
export const COMPUTED_SCALARS = [
  'period_word_kh', 'period_label_kh', 'annex8_months_kh', 'period_range_kh',
  'chk_month', 'chk_quarter', 'chk_semester', 'chk_year',
  'generated_at_kh', 'model_set_version',
  'licensees_analyzed_kh', 'records_analyzed_kh', 'overall_risk_kh',
  'data_as_of_kh', 'data_period_kh', 'licensees_analyzed', 'records_analyzed',
  'data_completeness', 'records_excluded', 'records_no_gps',
  'risk_high', 'risk_medium', 'risk_low', 'risk_total', 'min_sample',
] as const;

/**
 * Written by the machine: the ML figures are put into official Khmer by the
 * AI analyst agent, or by the deterministic drafter when no agent is
 * configured or it returns something unusable. An officer may still correct
 * the wording before approving, and a correction wins — but nobody has to
 * write the analysis from scratch.
 */
export const NARRATIVE_SCALARS = [
  'executive_summary', 'trend_commentary', 'geo_commentary', 'conclusion',
] as const;

/**
 * The analyst block, filled by the machine rather than typed by a person.
 *
 * NMC's decision: the analysis is performed automatically by the models and
 * worded by the AI analyst agent, so the report is signed by the engine that
 * actually did it. Naming a human there would credit a person for work they
 * did not do, and would hide which model version produced the figures — the
 * one thing a reader needs in order to reproduce them.
 *
 * This is NOT an approval. A named human reviewer still signs the report
 * before it leaves the Centre (`reviewer_name` below), and no sanction or
 * licence action follows from a score. See the limitations loop.
 */
export const MACHINE_SCALARS = ['analyst_name', 'analyst_position', 'analysed_date_kh'] as const;

/** Typed by the officer. Blank prints as dots, never as a guess. */
export const OFFICER_SCALARS = [
  'letter_no', 'report_no', 'lunar_date_line', 'signed_day_kh', 'signed_month_kh',
  'signed_year_kh', 'reviewer_name', 'reviewer_position', 'reviewed_date_kh',
] as const;

/** Loops the analyst edits rather than the system computing outright. */
export const NARRATIVE_LOOPS = ['key_findings', 'limitations', 'recommendations'] as const;

export const SCALAR_KEYS: string[] = [
  ...COMPUTED_SCALARS, ...NARRATIVE_SCALARS, ...MACHINE_SCALARS, ...OFFICER_SCALARS,
];

export type AnalyticsData = Record<(typeof SCALAR_KEYS)[number], Value> & LoopRows;

export type AnalyticsTextInputs = Partial<
  Pick<AnalyticsData, (typeof NARRATIVE_SCALARS)[number] | (typeof OFFICER_SCALARS)[number]>
> & Partial<Pick<LoopRows, (typeof NARRATIVE_LOOPS)[number]>>;

export interface AnalyticsPeriodRef { type: PeriodType; year: number; index: number }

/**
 * Everything wrong with a data object, as a list — not the first problem
 * only. A report that is missing four values should say so once.
 */
export function dataProblems(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['Analytics data must be an object.'];
  }
  const obj = data as Record<string, unknown>;
  const problems: string[] = [];
  const known = new Set<string>([...SCALAR_KEYS, ...Object.keys(LOOP_FIELDS)]);

  for (const key of SCALAR_KEYS) {
    if (!Object.hasOwn(obj, key)) { problems.push(`Missing key: ${key}`); continue; }
    const value = obj[key];
    if (value === null || value === undefined || (typeof value !== 'string' && typeof value !== 'number')) {
      problems.push(`Invalid scalar: ${key}`);
    }
  }

  for (const [loop, fields] of Object.entries(LOOP_FIELDS)) {
    if (!Object.hasOwn(obj, loop)) { problems.push(`Missing key: ${loop}`); continue; }
    const rows = obj[loop];
    if (!Array.isArray(rows)) { problems.push(`Loop must be an array: ${loop}`); continue; }
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object') { problems.push(`${loop}[${i}] must be an object`); return; }
      for (const field of fields) {
        if (!Object.hasOwn(row as object, field)) problems.push(`Missing cell: ${loop}[${i}].${field}`);
      }
      for (const field of Object.keys(row as object)) {
        if (!(fields as readonly string[]).includes(field)) {
          problems.push(`Unused cell: ${loop}[${i}].${field}`);
        }
      }
    });
  }

  for (const key of Object.keys(obj)) {
    if (!known.has(key)) problems.push(`Unused key: ${key}`);
  }

  // Rules NMC set, checked on the data rather than trusted of the builder.
  const anomalies = obj.anomalies;
  if (Array.isArray(anomalies)) {
    anomalies.forEach((row: any, i: number) => {
      if (row && !REVIEW_STATUSES.includes(row.review_status)) {
        problems.push(`anomalies[${i}].review_status must be one of: ${REVIEW_STATUSES.join(' | ')}`);
      }
    });
  }
  const forecasts = obj.forecasts;
  if (Array.isArray(forecasts)) {
    forecasts.forEach((row: any, i: number) => {
      const interval = String(row?.interval ?? '').trim();
      if (!interval || interval === UNKNOWN) return;      // honest absence is allowed
      if (!/–|-/.test(interval)) {
        problems.push(`forecasts[${i}].interval must be a range, e.g. "360 – 430"`);
      }
    });
  }
  const high = obj.high_risk;
  if (Array.isArray(high)) {
    high.forEach((row: any, i: number) => {
      if (!String(row?.factors ?? '').trim()) {
        problems.push(`high_risk[${i}].factors must explain the score`);
      }
    });
  }
  return problems;
}
