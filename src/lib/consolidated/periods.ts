export type PeriodType = 'MONTH' | 'QUARTER' | 'SEMESTER' | 'YEAR';
export const KHMER_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
export const toKhmerDigits = (v: string | number) => String(v).replace(/\d/g, d => '០១២៣៤៥៦៧៨៩'[Number(d)]);
export const periodSize: Record<PeriodType, number> = { MONTH: 1, QUARTER: 3, SEMESTER: 6, YEAR: 12 };

export interface ReportingPeriod {
  type: PeriodType;
  year: number;
  index: number;
  key: string;
  start: string;
  end: string;
  months: string[];
}

export function reportingPeriod(type: PeriodType, year: number, index = 1): ReportingPeriod {
  if (!Object.hasOwn(periodSize, type) || !Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new Error('Invalid reporting period type or year.');
  }
  const size = periodSize[type];
  if (!Number.isInteger(index) || index < 1 || index > 12 / size) throw new Error('Invalid period index.');
  const first = (index - 1) * size + 1;
  const last = first + size - 1;
  const monthKey = (month: number) => `${year}-${String(month).padStart(2, '0')}`;
  return {
    type, year, index,
    key: type === 'MONTH' ? monthKey(first) : type === 'YEAR' ? String(year)
      : `${year}-${type === 'QUARTER' ? 'Q' : 'S'}${index}`,
    start: `${monthKey(first)}-01`,
    end: `${monthKey(last)}-${new Date(Date.UTC(year, last, 0)).getUTCDate()}`,
    months: Array.from({ length: size }, (_, i) => monthKey(first + i)),
  };
}

export function previousPeriod(period: ReportingPeriod) {
  return reportingPeriod(period.type, period.index === 1 ? period.year - 1 : period.year,
    period.index === 1 ? 12 / periodSize[period.type] : period.index - 1);
}

export function periodTemplateFields(p: ReportingPeriod) {
  const first = Number(p.start.slice(5, 7));
  const last = Number(p.end.slice(5, 7));
  const y = toKhmerDigits(p.year);
  const word = { MONTH: 'ខែ', QUARTER: 'ត្រីមាស', SEMESTER: 'ឆមាស', YEAR: 'ឆ្នាំ' }[p.type];
  return {
    period_word_kh: word,
    period_word_en: { MONTH: 'month', QUARTER: 'quarter', SEMESTER: 'half-year', YEAR: 'year' }[p.type],
    period_label_kh: p.type === 'MONTH' ? `ខែ${KHMER_MONTHS[first - 1]} ឆ្នាំ${y}`
      : p.type === 'YEAR' ? `ឆ្នាំ${y}` : `${word}ទី${toKhmerDigits(p.index)} ឆ្នាំ${y}`,
    annex8_months_kh: p.type === 'MONTH' ? `ខែ${KHMER_MONTHS[first - 1]} ឆ្នាំ${y}`
      : `ពីខែ${KHMER_MONTHS[first - 1]} ដល់ខែ${KHMER_MONTHS[last - 1]} ឆ្នាំ${y}`,
    period_range_kh: `ពីថ្ងៃទី០១ ខែ${KHMER_MONTHS[first - 1]} ដល់ថ្ងៃទី${toKhmerDigits(p.end.slice(8))} ខែ${KHMER_MONTHS[last - 1]} ឆ្នាំ${y}`,
    chk_month: p.type === 'MONTH' ? '☑' : '☐',
    chk_quarter: p.type === 'QUARTER' ? '☑' : '☐',
    chk_semester: p.type === 'SEMESTER' ? '☑' : '☐',
    chk_year: p.type === 'YEAR' ? '☑' : '☐',
  };
}

export function periodChange(current: number | null, previous: number | null, rate = false): string {
  if (current === null || previous === null) return 'មិនមានទិន្នន័យ';
  if (previous === 0) return 'ថ្មី';
  const delta = rate ? current - previous : ((current - previous) / previous) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}${rate ? ' pt' : '%'}`;
}
