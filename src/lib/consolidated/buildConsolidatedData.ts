import { dataProblems, DOTS, LOOP_FIELDS, OFFICER_SCALARS, SCALAR_KEYS, UNKNOWN } from './contract';
import type { ConsolidatedData, LoopKey, OfficerInputs } from './contract';
import { periodTemplateFields, previousPeriod, reportingPeriod, toKhmerDigits } from './periods';
import type { PeriodType, ReportingPeriod } from './periods';
import { automaticConsolidatedInputs } from './automaticReport';

export interface ConsolidatedPreview {
  period: ReportingPeriod;
  previous: ReportingPeriod;
  data: ConsolidatedData;
  source: 'postgresql';
  data_as_of: string;
  warnings: string[];
}

/** Formatting only. All source aggregation belongs to the approved PostgreSQL RPC. */
export function prepareConsolidatedData(input: unknown, period: ReportingPeriod, officer: OfficerInputs = {}): ConsolidatedData {
  const problems = dataProblems(input);
  if (problems.length) throw new Error(problems.join('\n'));
  const data = structuredClone(input) as ConsolidatedData;
  Object.assign(data, periodTemplateFields(period));
  for (const key of OFFICER_SCALARS) {
    if (Object.hasOwn(officer, key)) (data as any)[key] = officer[key];
    if (!String(data[key] ?? '').trim()) (data as any)[key] = DOTS;
  }
  for (const key of SCALAR_KEYS) {
    if ((data as any)[key] === null) (data as any)[key] = UNKNOWN;
    if (key.endsWith('_kh')) (data as any)[key] = toKhmerDigits((data as any)[key]);
  }
  for (const key of ['challenges', 'actions', 'proposals'] as const) {
    if (officer[key]) (data as any)[key] = structuredClone(officer[key]);
  }
  const officerLoops = new Set<LoopKey>(['challenges', 'actions', 'proposals']);
  const noneColumn: Partial<Record<LoopKey, string>> = {
    late_list: 'name', provinces: 'province', failed: 'licensee', seals: 'licensee', licensees: 'name',
  };
  for (const [name, fields] of Object.entries(LOOP_FIELDS)) {
    const key = name as LoopKey;
    if (!data[key].length) {
      (data as any)[key] = Array.from({ length: officerLoops.has(key) ? 3 : 1 }, (_, i) =>
        Object.fromEntries(fields.map(field => [field,
          field === 'no' ? officerLoops.has(key) ? i + 1 : '-'
            : field === noneColumn[key] ? 'គ្មាន | None' : key === 'challenges' ? DOTS : '',
        ])));
    }
    for (const row of data[key]) for (const field of fields) {
      if ((row as any)[field] === null) (row as any)[field] = UNKNOWN;
    }
  }
  return data;
}

export async function buildConsolidatedData(
  periodType: PeriodType, year: number, index = 1, officer: OfficerInputs = {}, now = new Date(),
): Promise<ConsolidatedPreview> {
  const period = reportingPeriod(periodType, year, index);
  const { apiRequest } = await import('../../supabaseSync');
  const params = new URLSearchParams({ period_type: periodType, year: String(year), index: String(index) });
  const response = await apiRequest<ConsolidatedPreview>(`/api/consolidated/preview?${params}`);
  if (response.source !== 'postgresql' || response.period?.key !== period.key) {
    throw new Error('The aggregation source or reporting period does not match the request.');
  }
  return { ...response, previous: previousPeriod(period), data: prepareConsolidatedData(
    response.data, period, automaticConsolidatedInputs(response.data, period, officer, now),
  ) };
}
