const KHMER_NUMERALS: Record<string, string> = {
  '0': '០',
  '1': '១',
  '2': '២',
  '3': '៣',
  '4': '៤',
  '5': '៥',
  '6': '៦',
  '7': '៧',
  '8': '៨',
  '9': '៩'
};

const KHMER_MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ'
];

const DEFAULT_LOCATION = 'រាជធានីភ្នំពេញ';
const UNKNOWN_LUNAR_DATE = 'កាលបរិច្ឆេទចន្ទគតិ: មិនមានទិន្នន័យ';
const VERIFIED_LUNAR_DATE_BY_ISO: Record<string, string> = {
  '2026-06-28': 'ថ្ងៃអាទិត្យ ១៤កើត ខែបឋមាសាឍ ឆ្នាំមមី អដ្ឋស័ក ពុទ្ធសករាជ ២៥៧០'
};

export interface KhmerOfficialDateOptions {
  lunarDateOverride?: string;
  khmerLunarDateOverride?: string;
  location?: string;
  includeUnavailableLunarLine?: boolean;
}

export function toKhmerNumerals(value: string | number): string {
  return String(value).replace(/[0-9]/g, digit => KHMER_NUMERALS[digit] || digit);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatKhmerGregorianDate(date: Date, location = DEFAULT_LOCATION): string {
  const day = toKhmerNumerals(date.getDate());
  const month = KHMER_MONTHS[date.getMonth()] || '';
  const year = toKhmerNumerals(date.getFullYear());
  return `${location}. ថ្ងៃទី${day} ខែ${month} ឆ្នាំ${year}`;
}

export function formatKhmerOfficialDateBlock(
  date: Date,
  options: KhmerOfficialDateOptions = {}
): { lunarLine: string; gregorianLine: string; fullText: string } {
  const location = options.location || DEFAULT_LOCATION;
  const verifiedDefault = VERIFIED_LUNAR_DATE_BY_ISO[dateKey(date)];
  const lunarLine =
    options.khmerLunarDateOverride ||
    options.lunarDateOverride ||
    verifiedDefault ||
    (options.includeUnavailableLunarLine === false ? '' : UNKNOWN_LUNAR_DATE);
  const gregorianLine = formatKhmerGregorianDate(date, location);
  return {
    lunarLine,
    gregorianLine,
    fullText: lunarLine ? `${lunarLine}\n${gregorianLine}` : gregorianLine
  };
}

