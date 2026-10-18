import { formatKhmerOfficialDateBlock } from '../../utils/khmerOfficialDate';
import { dataProblems } from './contract';
import type { ConsolidatedData, OfficerInputs } from './contract';
import { KHMER_MONTHS, toKhmerDigits } from './periods';
import type { ReportingPeriod } from './periods';

export interface AnalysisFinding {
  rule: string;
  fields: string[];
  text: string;
}
export interface ConsolidatedAnalysis {
  challenges: Array<{ text: string }>;
  conclusion: string;
  findings: AnalysisFinding[];
}

/** Formatted aggregate values only; absent/unknown values never become zero. */
function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/[០-៩]/g, digit => String('០១២៣៤៥៦៧៨៩'.indexOf(digit)));
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?%?$/.test(text)) return null;
  const number = Number(text.replace(/[,٪%]/g, ''));
  return Number.isFinite(number) ? number : null;
}
const kh = (number: number) => toKhmerDigits(number.toLocaleString('en-US', { maximumFractionDigits: 1 }));

/** Deterministic observations from complete server aggregates, with rule evidence. */
export function analyzeConsolidatedData(data: ConsolidatedData): ConsolidatedAnalysis {
  const get = (key: keyof ConsolidatedData) => {
    const value = numeric(data[key]);
    const rate = key === 'kpi_sub_rate_cur' || key === 'kpi_sub_rate_prev';
    if (value === null || (rate ? value > 100 : !Number.isSafeInteger(value) || /%/.test(String(data[key])))) return null;
    return value;
  };
  const findings: AnalysisFinding[] = [];
  const add = (rule: string, fields: string[], text: string) => findings.push({ rule, fields, text });
  const missing = get('sub_notsub_total');
  const late = get('sub_late_total');
  const failed = get('total_failed');
  const backlog = get('backlog_total_cur');
  const backlog30 = get('backlog_over30_cur');
  if (missing !== null && missing > 0) add('missing-reports', ['sub_notsub_total'],
    `មានសហគ្រាស ${kh(missing)} មិនទាន់ដាក់របាយការណ៍គ្រប់ខែដែលត្រូវដាក់ក្នុងរយៈពេលនេះ។`);
  if (late !== null && late > 0) add('late-reports', ['sub_late_total'],
    `មានសហគ្រាស ${kh(late)} ដាក់របាយការណ៍យឺត តាមចំណាត់ថ្នាក់ក្នុងទិន្នន័យរបាយការណ៍។`);
  if (failed !== null && failed > 0) add('failed-verification', ['total_failed'],
    `មានកំណត់ត្រាសកម្មភាព ${kh(failed)} ដែលមានលទ្ធផលផ្ទៀងផ្ទាត់ «ធ្លាក់» និងត្រូវតាមដានការកែតម្រូវ។`);
  if (backlog !== null && backlog > 0) add('pending-at-period-end', ['backlog_total_cur'],
    `មានកំណត់ត្រារង់ចាំផ្ទៀងផ្ទាត់ ${kh(backlog)} នៅចុងរយៈពេលរបាយការណ៍។`);
  if (backlog30 !== null && backlog30 > 0) add('pending-over-30-days', ['backlog_over30_cur'],
    `កំណត់ត្រារង់ចាំលើស ៣០ ថ្ងៃមាន ${kh(backlog30)} ដែលត្រូវផ្ដល់អាទិភាពតាមដាន។`);
  for (const [field, rule, label] of [
    ['std_expired_count', 'expired-standards', 'មានបទដ្ឋានខ្នាតដែលផុតកំណត់ព្យាសកម្ម'],
    ['std_due60_count', 'standards-due-soon', 'មានបទដ្ឋានខ្នាតដែលត្រូវព្យាសកម្មក្នុងរយៈពេល ៦០ ថ្ងៃ'],
    ['lic_expiring90_count', 'licences-expiring', 'មានអាជ្ញាប័ណ្ណដែលនឹងផុតសុពលភាពក្នុងរយៈពេល ៩០ ថ្ងៃ'],
    ['out_of_scope_count', 'scope-review', 'មានកំណត់ត្រាដែលត្រូវពិនិត្យវិសាលភាពអាជ្ញាប័ណ្ណ'],
  ] as const) {
    const count = get(field);
    if (count !== null && count > 0) add(rule, [field], `${label} ចំនួន ${kh(count)}។`);
  }
  const currentRate = get('kpi_sub_rate_cur');
  const previousRate = get('kpi_sub_rate_prev');
  if (currentRate !== null && previousRate !== null && currentRate <= 100 && previousRate <= 100 && currentRate < previousRate) {
    add('submission-rate-decreased', ['kpi_sub_rate_cur', 'kpi_sub_rate_prev'],
      `អត្រាដាក់របាយការណ៍ថយចុះ ${kh(previousRate - currentRate)} ចំណុចភាគរយ បើធៀបនឹងរយៈពេលមុនប្រភេទដូចគ្នា។`);
  }

  // Compare metrics only where both tables claim the same service-entry unit.
  const inconsistent = (['m', 'i', 'r', 'passed', 'failed', 'pending'] as const).filter(metric => {
    const total = get(`total_${metric}`);
    const annex = get(`lic_total_${metric}`);
    return total !== null && annex !== null && total !== annex;
  });
  if (inconsistent.length) add('annex-totals-mismatch', inconsistent.flatMap(metric => [`total_${metric}`, `lic_total_${metric}`]),
    'ចំនួនសរុបតាមសកម្មភាព និងចំនួនសរុបក្នុងបញ្ជីសហគ្រាសមិនត្រូវគ្នា។ ត្រូវផ្ទៀងផ្ទាត់ទិន្នន័យមុនបញ្ជាក់របាយការណ៍។');
  const unknownFields = (['sub_active_total', 'sub_submitted_total', 'sub_notsub_total', 'sub_late_total', 'sub_ontime_total',
    'total_m', 'total_i', 'total_r', 'total_passed', 'total_failed', 'backlog_total_cur', 'backlog_over30_cur'] as const)
    .filter(key => get(key) === null);
  const active = get('sub_active_total');
  const submitted = get('sub_submitted_total');
  const ontime = get('sub_ontime_total');
  const submissionMismatch = (active !== null && submitted !== null && missing !== null && submitted + missing !== active)
    || (submitted !== null && ontime !== null && late !== null && ontime + late !== submitted);
  if (submissionMismatch) add('submission-totals-mismatch',
    ['sub_active_total', 'sub_submitted_total', 'sub_notsub_total', 'sub_ontime_total', 'sub_late_total'],
    'ចំនួនសហគ្រាសតាមចំណាត់ថ្នាក់ដាក់របាយការណ៍មិនត្រូវគ្នានឹងចំនួនសរុប។ ត្រូវពិនិត្យចំណាត់ថ្នាក់ខ្វះ យឺត និងទាន់ពេល។');
  if (unknownFields.length) add('incomplete-data', [...unknownFields],
    'សូចនាករមួយចំនួនមិនមានទិន្នន័យគ្រប់គ្រាន់ ដូច្នេះមិនអាចវាយតម្លៃបញ្ហាប្រឈមបានពេញលេញទេ។');
  if (!findings.length) add('no-flagged-indicators', ['sub_notsub_total', 'sub_late_total', 'total_failed', 'backlog_total_cur', 'backlog_over30_cur'],
    'តាមសូចនាករដែលអាចប្រើបាន មិនមានរបាយការណ៍ខ្វះ យឺត លទ្ធផលធ្លាក់ ឬកំណត់ត្រារង់ចាំដែលត្រូវបានរាយការណ៍ក្នុងទិន្នន័យនេះទេ។');

  const conclusion: string[] = [];
  if (!submissionMismatch && active !== null && submitted !== null && submitted <= active) {
    conclusion.push(`ក្នុងរយៈពេលរបាយការណ៍នេះ មានសហគ្រាស ${kh(submitted)} ក្នុងចំណោម ${kh(active)} បានដាក់របាយការណ៍គ្រប់ខែដែលត្រូវដាក់។`);
  }
  const activity: string[] = [];
  for (const [field, label] of [['total_m', 'ផលិត'], ['total_i', 'ដំឡើង'], ['total_r', 'ជួសជុល']] as const) {
    const count = get(field);
    if (count !== null) activity.push(`${label} ${kh(count)}`);
  }
  if (activity.length) conclusion.push(`ទិន្នន័យកត់ត្រាសកម្មភាព៖ ${activity.join(' និង ')} កំណត់ត្រា។`);
  const passed = get('total_passed');
  if (passed !== null && failed !== null) conclusion.push(`លទ្ធផលផ្ទៀងផ្ទាត់តាមកំណត់ត្រាសកម្មភាព៖ ជាប់ ${kh(passed)} និងធ្លាក់ ${kh(failed)}។`);
  const priorities = findings.filter(finding => !['no-flagged-indicators', 'incomplete-data', 'annex-totals-mismatch', 'submission-totals-mismatch'].includes(finding.rule));
  if (priorities.length) conclusion.push('គួរផ្ដល់អាទិភាពលើការតាមដានចំណុចដែលបានរកឃើញក្នុងផ្នែកបញ្ហាប្រឈម។');
  if (unknownFields.length || inconsistent.length || submissionMismatch) conclusion.push('ត្រូវបំពេញ និងផ្ទៀងផ្ទាត់ទិន្នន័យដែលមិនពេញលេញ ឬមិនត្រូវគ្នា មុនការបញ្ជាក់លទ្ធផលចុងក្រោយ។');
  if (!conclusion.length) conclusion.push('មិនទាន់មានទិន្នន័យគ្រប់គ្រាន់សម្រាប់បង្កើតសេចក្ដីសន្និដ្ឋាន។');
  return { findings, challenges: findings.map(({ text }) => ({ text })), conclusion: conclusion.join('\n') };
}

export function automaticConsolidatedFields(period: ReportingPeriod, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid report generation date.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const day = part('day'), month = part('month'), year = part('year');
  // The existing calendar helper accepts a local civil date. Construct it
  // from Cambodia's civil date so host/browser timezone cannot shift it.
  const civil = new Date(Number(year), Number(month) - 1, Number(day), 12);
  const official = formatKhmerOfficialDateBlock(civil);
  const date = toKhmerDigits(`${day}/${month}/${year}`);
  return {
    // A stable period reference, not a database-issued correspondence sequence.
    letter_no: `NMC-CONS-${period.type}-${period.key}`,
    lunar_date_line: official.lunarLine,
    signed_day_kh: toKhmerDigits(day), signed_month_kh: KHMER_MONTHS[Number(month) - 1], signed_year_kh: toKhmerDigits(year),
    prepared_date_kh: date, reviewed_date_kh: date,
  };
}

export function automaticConsolidatedInputs(
  data: ConsolidatedData, period: ReportingPeriod, officer: OfficerInputs = {}, now = new Date(),
): OfficerInputs {
  const problems = dataProblems(data);
  if (problems.length) throw new Error(problems.join('\n'));
  const analysis = analyzeConsolidatedData(data);
  return {
    ...officer, ...automaticConsolidatedFields(period, now),
    challenges: officer.challenges ?? analysis.challenges,
    conclusion: officer.conclusion ?? analysis.conclusion,
  };
}
