export const TEMPLATE_PATH = '/templates/Consolidated_template_v1.docx';
export const TEMPLATE_SHA256 = '4df153c3cc536823ff776492f7055931ecbc20bcc2291602868ffc26f8a2936a';
export const UNKNOWN = 'មិនមានទិន្នន័យ';
export const DOTS = '................................................................................';
export const LOOP_FIELDS = {
  late_list: ['no', 'name', 'licence_no', 'type_kh', 'status_kh', 'action'],
  provinces: ['no', 'province', 'installed', 'repairs', 'total', 'main_categories'],
  failed: ['no', 'licensee', 'instrument', 'serial_no', 'province', 'cause_action'],
  seals: ['no', 'licensee', 'instrument_serial', 'seal_no', 'notification_no', 'subsequent_verification'],
  challenges: ['text'],
  actions: ['no', 'licensee', 'action', 'date', 'result'],
  proposals: ['no', 'proposal', 'legal_basis'],
  licensees: ['no', 'name', 'licence_no', 'type_kh', 'province', 'm', 'i', 'r', 'passed', 'failed', 'pending', 'status_kh', 'report_no', 'remark'],
} as const;
export type LoopKey = keyof typeof LOOP_FIELDS;
type Value = string | number;
type LoopRows = { [K in LoopKey]: Array<Record<(typeof LOOP_FIELDS)[K][number], Value>> };
type Kpi = 'active' | 'sub_rate' | 'ontime_rate' | 'mi' | 'repairs' | 'pass_rate' | 'backlog' | 'backlog30' | 'seals' | 'complaints' | 'expiring90';
type Submission = 'active' | 'submitted' | 'ontime' | 'late' | 'nil' | 'amend' | 'returned' | 'notsub';
type Category = 'nawi' | 'weighbridge' | 'weights' | 'fuel' | 'lpg' | 'elec' | 'water' | 'ev' | 'other';
type Metric = 'm' | 'i' | 'r' | 'passed' | 'failed' | 'pending' | 'ytd';
const BASE_KEYS = [
  'letter_no', 'period_word_kh', 'period_word_en', 'period_label_kh', 'annex8_months_kh', 'period_range_kh',
  'chk_month', 'chk_quarter', 'chk_semester', 'chk_year', 'active_licensees_kh', 'submitted_count_kh',
  'submission_rate_kh', 'on_time_count_kh', 'late_count_kh', 'not_submitted_count_kh', 'total_m_kh',
  'total_i_kh', 'total_r_kh', 'verified_count_kh', 'total_passed_kh', 'pass_rate_kh', 'total_failed_kh',
  'total_pending_kh', 'lunar_date_line', 'signed_day_kh', 'signed_month_kh', 'signed_year_kh', 'head_name',
  'data_as_of_kh', 'prov_total_installed', 'prov_total_repairs', 'prov_total_all',
  'preparer_name', 'preparer_position', 'prepared_date_kh', 'reviewer_name', 'reviewer_position', 'reviewed_date_kh', 'conclusion',
] as const;
type ScalarKey = (typeof BASE_KEYS)[number] | `kpi_${Kpi}_${'cur' | 'prev' | 'chg'}`
  | `sub_${Submission}_${'mi' | 'r' | 'total' | 'pct'}` | `${Category}_${Metric}`
  | `${'total' | 'prev' | 'chg'}_${Metric}` | `backlog_${'cleared' | 'new' | 'total' | 'over30'}_${'cur' | 'prev' | 'remark'}`
  | `ev6_${1 | 2 | 3 | 4 | 5 | 6}_${'count' | 'summary'}`
  | `${'std_expired' | 'std_due60' | 'lic_expiring90' | 'out_of_scope'}_${'count' | 'licensees'}`
  | `lic_total_${Exclude<Metric, 'ytd'>}`;
export type ConsolidatedData = Record<ScalarKey, Value> & LoopRows;
const cross = (prefix: string[], suffix: string[]) => prefix.flatMap(p => suffix.map(s => `${p}_${s}`));
export const SCALAR_KEYS: string[] = [
  ...BASE_KEYS,
  ...cross(['active', 'sub_rate', 'ontime_rate', 'mi', 'repairs', 'pass_rate', 'backlog', 'backlog30', 'seals', 'complaints', 'expiring90'].map(k => `kpi_${k}`), ['cur', 'prev', 'chg']),
  ...cross(['active', 'submitted', 'ontime', 'late', 'nil', 'amend', 'returned', 'notsub'].map(k => `sub_${k}`), ['mi', 'r', 'total', 'pct']),
  ...cross(['nawi', 'weighbridge', 'weights', 'fuel', 'lpg', 'elec', 'water', 'ev', 'other', 'total', 'prev', 'chg'], ['m', 'i', 'r', 'passed', 'failed', 'pending', 'ytd']),
  ...cross(['cleared', 'new', 'total', 'over30'].map(k => `backlog_${k}`), ['cur', 'prev', 'remark']),
  ...cross(Array.from({ length: 6 }, (_, i) => `ev6_${i + 1}`), ['count', 'summary']),
  ...cross(['std_expired', 'std_due60', 'lic_expiring90', 'out_of_scope'], ['count', 'licensees']),
  ...cross(['lic_total'], ['m', 'i', 'r', 'passed', 'failed', 'pending']),
];
export const OFFICER_SCALARS = ['letter_no', 'head_name', 'lunar_date_line', 'signed_day_kh', 'signed_month_kh',
  'signed_year_kh', 'preparer_name', 'preparer_position', 'prepared_date_kh', 'reviewer_name',
  'reviewer_position', 'reviewed_date_kh', 'conclusion'] as const;
export type OfficerInputs = Partial<Pick<ConsolidatedData, (typeof OFFICER_SCALARS)[number]>>
  & { challenges?: LoopRows['challenges']; actions?: LoopRows['actions']; proposals?: LoopRows['proposals'] };

export function dataProblems(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['Report data must be an object.'];
  const obj = data as Record<string, unknown>;
  const keys = new Set([...SCALAR_KEYS, ...Object.keys(LOOP_FIELDS)]);
  const problems = [...keys].filter(k => !Object.hasOwn(obj, k)).map(k => `Missing key: ${k}`);
  Object.keys(obj).filter(k => !keys.has(k)).forEach(k => problems.push(`Unused key: ${k}`));
  for (const k of SCALAR_KEYS) {
    if (Object.hasOwn(obj, k) && typeof obj[k] !== 'string' && typeof obj[k] !== 'number' && obj[k] !== null) problems.push(`Invalid scalar: ${k}`);
    if (typeof obj[k] === 'number' && !Number.isFinite(obj[k])) problems.push(`Non-finite value: ${k}`);
  }
  for (const [key, fields] of Object.entries(LOOP_FIELDS)) {
    if (!Array.isArray(obj[key])) { problems.push(`Expected an array: ${key}`); continue; }
    (obj[key] as unknown[]).forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { problems.push(`Invalid row: ${key}[${index}]`); return; }
      for (const field of fields) if (!Object.hasOwn(item, field)) problems.push(`Missing key: ${key}[${index}].${field}`);
      for (const field of Object.keys(item)) if (!(fields as readonly string[]).includes(field)) problems.push(`Unused key: ${key}[${index}].${field}`);
      for (const [field, v] of Object.entries(item)) if (v !== null && typeof v !== 'string' && typeof v !== 'number') problems.push(`Invalid cell: ${key}[${index}].${field}`);
    });
  }
  return problems;
}
