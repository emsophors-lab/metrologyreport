import { dataProblems, LOOP_FIELDS, OFFICER_SCALARS, SCALAR_KEYS, UNKNOWN } from './contract';
import type { ConsolidatedData } from './contract';
import { periodChange, periodTemplateFields, previousPeriod, toKhmerDigits } from './periods';
import type { ReportingPeriod } from './periods';

type Row = Record<string, any>;
export interface ConsolidatedSqlResult {
  version: number; data_as_of: string;
  submission: Row[]; categories: Row[]; licensees: Row[]; provinces: Row[];
  province_total: Row; seals: Row[]; seal_counts: Row[]; expiry: Row[];
  diagnostics: Record<string, number>; sources: Row[];
}
const CATEGORIES = { NAWI: 'nawi', WEIGHBRIDGE: 'weighbridge', WEIGHTS: 'weights', FUEL_DISPENSER: 'fuel',
  LPG_DISPENSER: 'lpg', ELEC_METER: 'elec', WATER_METER: 'water', EV_CHARGER: 'ev', OTHER: 'other' } as const;
const TYPES: Record<string, string> = { MANUF_INSTALL: 'ផដ', REPAIR: 'ជ' };
const number = (v: unknown) => { const n = Number(v); if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid SQL aggregate count'); return n; };
const rate = (n: number, d: number) => d ? `${(n / d * 100).toFixed(1)}%` : null;

/** Format database aggregates into the official tag contract; never tally source entries. */
export function formatConsolidatedAggregate(raw: ConsolidatedSqlResult, period: ReportingPeriod, source: 'postgresql' | 'mysql') {
  if (raw?.version !== 1 || !raw.data_as_of || !raw.diagnostics || !['submission','categories','licensees','provinces','seals','seal_counts','expiry','sources'].every(key => Array.isArray((raw as any)[key]))) {
    throw new Error('Invalid consolidated SQL response.');
  }
  const integrity = Object.entries(raw.diagnostics).filter(([, value]) => number(value) > 0);
  if (integrity.length) throw new Error('ត្រូវពិនិត្យទិន្នន័យដើម៖ ' + integrity.map(([key, count]) => `${key}=${count}`).join(', '));
  const data: any = Object.fromEntries(SCALAR_KEYS.map(key => [key, null]));
  const sources = [...raw.sources].sort((a,b) => `${a.licence_no}/${a.period_month}/${a.id}`.localeCompare(`${b.licence_no}/${b.period_month}/${b.id}`));
  for (const key of OFFICER_SCALARS) data[key] = '';
  for (const key of Object.keys(LOOP_FIELDS)) data[key] = [];
  Object.assign(data, periodTemplateFields(period));
  const warnings = [
    'ស្ថានភាពអាជ្ញាប័ណ្ណគណនាតាមថ្ងៃចេញ និងថ្ងៃផុតសុពលភាពដែលកំពុងរក្សាទុក។ ប្រវត្តិប្តូរសុពលភាព ឬផ្អាកមិនអាចស្ដារបានពេញលេញទេ។',
    'លទ្ធផលផ្ទៀងផ្ទាត់ និងស្តុករង់ចាំនៅចុងរយៈពេលមិនអាចបញ្ជាក់បានដោយគ្មានប្រវត្តិស្ថានភាពពេញលេញ។ សូចនាករទាំងនេះបង្ហាញ «មិនមានទិន្នន័យ» មិនមែន ០ ទេ។',
    'ចំនួនករណីព្រឹត្តិការណ៍ ប្រវត្តិបទដ្ឋានខ្នាត និងការរំលោភវិសាលភាពមិនទាន់មានទិន្នន័យគ្រប់គ្រាន់សម្រាប់រាប់។',
  ];
  const cutoff = new Date(raw.data_as_of);
  if (!Number.isFinite(cutoff.getTime())) throw new Error('Invalid SQL data cutoff.');
  data.data_as_of_kh = toKhmerDigits(new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Phnom_Penh', day:'2-digit',month:'2-digit',year:'numeric' }).format(cutoff));
  const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Phnom_Penh', day:'2-digit',month:'2-digit',year:'numeric' }).format(cutoff);
  if (period.end >= currentDate) warnings.push('រយៈពេលដែលបានជ្រើសមិនទាន់បញ្ចប់ទេ។ លទ្ធផលគិតត្រឹមកាលបរិច្ឆេទទាញទិន្នន័យ មិនមែនលទ្ធផលចុងរយៈពេលដែលបានបិទទេ។');
  if (raw.submission.some(row => row.type === 'UNKNOWN')) warnings.push('សហគ្រាសមួយចំនួនមិនទាន់មានប្រភេទអាជ្ញាប័ណ្ណ។ មិនបែងចែកទៅប្រភេទ ផដ ឬ ជ ដោយសន្មតទេ។');
  const submission = (w: string, type = 'TOTAL') => raw.submission.find(row => row.window === w && row.type === type);
  for (const w of ['cur','prev']) {
    const s = submission(w);
    const active = s ? number(s.active) : 0;
    data[`kpi_active_${w}`] = active;
    data[`kpi_sub_rate_${w}`] = rate(s ? number(s.submitted) : 0, active);
    data[`kpi_ontime_rate_${w}`] = rate(s ? number(s.ontime) : 0, active);
    data[`kpi_seals_${w}`] = number(raw.seal_counts.find(row => row.window === w)?.count ?? 0);
    data[`kpi_expiring90_${w}`] = number(raw.expiry.find(row => row.window === w)?.count ?? 0);
  }
  const active = data.kpi_active_cur;
  for (const metric of ['active','submitted','ontime','late','notsub','nil','amend','returned']) {
    data[`sub_${metric}_total`] = number(submission('cur')?.[metric] ?? 0);
    for (const [suffix,type] of [['mi','MANUF_INSTALL'],['r','REPAIR']]) data[`sub_${metric}_${suffix}`] =
      submission('cur','UNKNOWN') ? null : number(submission('cur',type)?.[metric] ?? 0);
    data[`sub_${metric}_pct`] = rate(data[`sub_${metric}_total`], active);
  }
  const counts = (w: string, category: string) => raw.categories.find(row => row.window === w && row.category === category);
  for (const [code,key] of [...Object.entries(CATEGORIES),['TOTAL','total']]) {
    for (const op of ['m','i','r']) data[`${key}_${op}`] = number(counts('cur',code)?.[op] ?? 0);
    const ytd = counts('ytd',code);
    data[`${key}_ytd`] = ['m','i','r'].reduce((n, op) => n + number(ytd?.[op] ?? 0), 0);
  }
  for (const op of ['m','i','r']) {
    data[`prev_${op}`] = number(counts('prev','TOTAL')?.[op] ?? 0);
    data[`chg_${op}`] = periodChange(data[`total_${op}`],data[`prev_${op}`]);
    data[`lic_total_${op}`] = data[`total_${op}`];
  }
  const prevYtd = counts('prev_ytd','TOTAL');
  data.prev_ytd = ['m','i','r'].reduce((n,op) => n + number(prevYtd?.[op] ?? 0),0);
  data.chg_ytd = periodChange(data.total_ytd,data.prev_ytd);
  for (const w of ['cur','prev']) {
    const c = counts(w,'TOTAL');
    data[`kpi_mi_${w}`] = number(c?.m ?? 0) + number(c?.i ?? 0);
    data[`kpi_repairs_${w}`] = number(c?.r ?? 0);
  }
  for (const key of ['active','sub_rate','ontime_rate','mi','repairs','pass_rate','backlog','backlog30','seals','complaints','expiring90']) {
    const cur = data[`kpi_${key}_cur`], prev = data[`kpi_${key}_prev`];
    data[`kpi_${key}_chg`] = periodChange(cur === null ? null : parseFloat(cur), prev === null ? null : parseFloat(prev), key.endsWith('rate'));
  }
  const status = (row: Row) => row.required === 0 ? 'មិនតម្រូវក្នុងរយៈពេល' : row.missing > 0 ? 'មិនទាន់ទទួលគ្រប់ខែ' : row.late > 0 ? 'យឺត' : 'ទាន់ពេល';
  const ordered = [...raw.licensees].sort((a,b) => a.licence_no.localeCompare(b.licence_no));
  data.licensees = ordered.map((row,i) => ({ no:i+1,name:row.name,licence_no:row.licence_no,type_kh:TYPES[row.type] ?? UNKNOWN,
    province:row.province,m:number(row.m),i:number(row.i),r:number(row.r),passed:null,failed:null,pending:null,status_kh:status(row),
    report_no:sources.filter(report => report.licence_no === row.licence_no && report.period_month >= period.start.slice(0,7) && report.period_month<=period.end.slice(0,7)).map(report => report.report_id || UNKNOWN).join(', '),
    remark:row.missing_months ? `ខែមិនទាន់ទទួល៖ ${row.missing_months}` : '',
  }));
  data.late_list = ordered.filter(row => row.missing>0 || row.late>0).map((row,i) => ({ no:i+1,name:row.name,licence_no:row.licence_no,
    type_kh:TYPES[row.type] ?? UNKNOWN,status_kh:[row.missing_months ? `មិនទាន់ទទួល៖ ${row.missing_months}` : '',row.late_months ? `យឺត៖ ${row.late_months}` : ''].filter(Boolean).join('; '),action:'',
  }));
  data.provinces = [...raw.provinces].sort((a,b) => a.province.localeCompare(b.province)).map((row,i) => ({no:i+1,...row,main_categories:UNKNOWN}));
  data.prov_total_installed = number(raw.province_total.installed);
  data.prov_total_repairs = number(raw.province_total.repairs);
  data.prov_total_all = number(raw.province_total.total);
  data.failed = [{no:'-',licensee:UNKNOWN,instrument:'',serial_no:'',province:'',cause_action:'មិនអាចបញ្ជាក់លទ្ធផលនៅចុងរយៈពេលដោយគ្មានប្រវត្តិពេញលេញ'}];
  data.seals = [...raw.seals].sort((a,b) => `${a.licence_no}/${a.entry_id}`.localeCompare(`${b.licence_no}/${b.entry_id}`)).map((row,i) => ({no:i+1,licensee:ordered.find(l => l.licence_no===row.licence_no)?.name ?? row.licence_no,
    instrument_serial:`${row.instrument} / ${row.serial_no}`,seal_no:row.seal_no || UNKNOWN,notification_no:row.notification_no || UNKNOWN,subsequent_verification:UNKNOWN}));
  data.lic_expiring90_count = data.kpi_expiring90_cur;
  for (const [key,value] of Object.entries({active_licensees_kh:active,submitted_count_kh:data.sub_submitted_total,submission_rate_kh:data.kpi_sub_rate_cur,
    on_time_count_kh:data.sub_ontime_total,late_count_kh:data.sub_late_total,not_submitted_count_kh:data.sub_notsub_total,
    total_m_kh:data.total_m,total_i_kh:data.total_i,total_r_kh:data.total_r})) data[key] = value === null ? null : toKhmerDigits(value as any);
  const problems = dataProblems(data);
  if (problems.length) throw new Error(problems.join('\n'));
  return {period,previous:previousPeriod(period),data:data as ConsolidatedData,source,data_as_of:cutoff.toISOString(),warnings,
    source_manifest:sources,definitions_version:'consolidated-v1-missing-first',unavailable:['historical-verification','backlog','event-case-counts','standards-history','scope-history']};
}
