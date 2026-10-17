/**
 * Annex 8 (A8-2026.2) shared constants.
 *
 * Ported from the reference implementation `mlrs_annex8_report_form.html`
 * and the field dictionary `MLRS_Annex8_field_spec.xlsx` (sheet "Lists").
 *
 * This module is isomorphic: no DOM, no React, no browser storage, so the
 * Express server imports the same definitions the form uses.
 */

export const FORMAT_VERSION = 'A8-2026.2';
export const LEGACY_FORMAT_VERSION = 'LEGACY-1';

/** Art. 21 — reports are due by the 7th of the following month, 23:59 (Asia/Phnom_Penh). */
export const DEADLINE_DAY = 7;
export const REPORT_TIMEZONE = 'Asia/Phnom_Penh';

export type InstrumentCategory =
  | 'NAWI'
  | 'WEIGHBRIDGE'
  | 'WEIGHTS'
  | 'FUEL_DISPENSER'
  | 'LPG_DISPENSER'
  | 'ELEC_METER'
  | 'WATER_METER'
  | 'EV_CHARGER'
  | 'OTHER';

interface CategoryMeta {
  kh: string;
  en: string;
  oiml: string;
}

/**
 * Order matters: Part 2 of the official Word layout prints these nine rows in
 * exactly this sequence, followed by a Total row.
 */
export const CATEGORIES: Record<InstrumentCategory, CategoryMeta> = {
  NAWI: { kh: 'ជញ្ជីងមិនស្វ័យប្រវត្តិ', en: 'Non-automatic weighing instrument', oiml: 'R 76' },
  WEIGHBRIDGE: { kh: 'ជញ្ជីងថ្លឹងរថយន្ត', en: 'Weighbridge', oiml: 'R 76' },
  WEIGHTS: { kh: 'កូនទម្ងន់', en: 'Weights', oiml: 'R 111' },
  FUEL_DISPENSER: { kh: 'ឧបករណ៍ចែកចាយប្រេងឥន្ធនៈ', en: 'Fuel dispenser', oiml: 'R 117' },
  LPG_DISPENSER: { kh: 'ឧបករណ៍ចែកចាយហ្គាស LPG', en: 'LPG dispenser', oiml: 'R 117' },
  ELEC_METER: { kh: 'នាឡិកាស្ទង់អគ្គិសនី', en: 'Electricity meter', oiml: 'R 46' },
  WATER_METER: { kh: 'នាឡិកាស្ទង់ទឹក', en: 'Water meter', oiml: 'R 49' },
  EV_CHARGER: { kh: 'ឧបករណ៍បញ្ចូលថាមពលយានយន្តអគ្គិសនី', en: 'EV charging equipment', oiml: '' },
  OTHER: { kh: 'ផ្សេងៗ', en: 'Other', oiml: '' },
};

export const CATEGORY_CODES = Object.keys(CATEGORIES) as InstrumentCategory[];

/** 25 provinces / capital, per the field spec "Lists" sheet. */
export const PROVINCES = [
  'រាជធានីភ្នំពេញ', 'បន្ទាយមានជ័យ', 'បាត់ដំបង', 'កំពង់ចាម', 'កំពង់ឆ្នាំង',
  'កំពង់ស្ពឺ', 'កំពង់ធំ', 'កំពត', 'កណ្ដាល', 'កោះកុង',
  'ក្រចេះ', 'មណ្ឌលគិរី', 'ព្រះវិហារ', 'ព្រៃវែង', 'ពោធិ៍សាត់',
  'រតនគិរី', 'សៀមរាប', 'ព្រះសីហនុ', 'ស្ទឹងត្រែង', 'ស្វាយរៀង',
  'តាកែវ', 'ឧត្តរមានជ័យ', 'កែប', 'ប៉ៃលិន', 'ត្បូងឃ្មុំ',
] as const;

export const COUNTRIES = [
  'Cambodia', 'China', 'Japan', 'Korea', 'Thailand', 'Viet Nam', 'Singapore',
  'Malaysia', 'India', 'Germany', 'Switzerland', 'United States',
  'United Kingdom', 'Italy', 'Türkiye',
] as const;

export const UNITS = ['kg', 'g', 't', 'L', 'm³', 'kWh', 'kW'] as const;

export type OpCode = 'M' | 'I';
export type VerificationStatus = 'PASSED' | 'FAILED' | 'PENDING';
export type LicenceType = 'MANUF_INSTALL' | 'REPAIR';
export type ReportType = 'REGULAR' | 'NIL' | 'AMENDMENT';
export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED';
export type ModuleOrigin = 'NEW' | 'REPLACEMENT';
export type StandardStatus = 'VALID' | 'EXPIRED' | 'OUT_OF_SERVICE';

export const OP_CODE_LABELS: Record<OpCode, { kh: string; en: string }> = {
  M: { kh: 'ផលិត', en: 'Manufacture' },
  I: { kh: 'ដំឡើង', en: 'Install' },
};

export const VERIFICATION_LABELS: Record<VerificationStatus, { kh: string; en: string }> = {
  PASSED: { kh: 'ជាប់', en: 'Passed' },
  FAILED: { kh: 'ធ្លាក់', en: 'Failed' },
  PENDING: { kh: 'រង់ចាំ', en: 'Pending' },
};

export const MODULE_ORIGIN_LABELS: Record<ModuleOrigin, { kh: string; en: string }> = {
  NEW: { kh: 'ថ្មី', en: 'New' },
  REPLACEMENT: { kh: 'ជំនួស', en: 'Replacement' },
};

/** Part 6 items 6.1 – 6.6. */
export const EVENT_KEYS = ['e6_1', 'e6_2', 'e6_3', 'e6_4', 'e6_5', 'e6_6'] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

export const EVENTS: Array<{ key: EventKey; no: string; kh: string; en: string }> = [
  { key: 'e6_1', no: '៦.១', kh: 'ការផ្លាស់ប្ដូរបុគ្គលិកបច្ចេកទេស', en: 'Technical staff changes' },
  { key: 'e6_2', no: '៦.២', kh: 'ការផ្លាស់ប្ដូរទីតាំង រោងចក្រ ឬរោងជាង', en: 'Premises changes' },
  { key: 'e6_3', no: '៦.៣', kh: 'ការផ្លាស់ប្ដូរម៉ូដែលឧបករណ៍ ឬអ្នកផ្គត់ផ្គង់ម៉ូឌុល', en: 'Model or module supplier changes' },
  { key: 'e6_4', no: '៦.៤', kh: 'ពាក្យបណ្ដឹងពីអតិថិជន', en: 'Customer complaints' },
  { key: 'e6_5', no: '៦.៥', kh: 'ភាពមិនអនុលោម ឬឧប្បត្តិហេតុ', en: 'Non-conformities / incidents' },
  { key: 'e6_6', no: '៦.៦', kh: 'ការដកសញ្ញាត្រួតពិនិត្យក្នុងករណីបន្ទាន់ (ប្រការ២៥)', en: 'Emergency seal removal (Art. 25)' },
];

/** Cambodia bounding box, used by V08 / the GPS range check. */
export const CAMBODIA_BOUNDS = { minLat: 10, maxLat: 14.8, minLng: 102.2, maxLng: 108.0 };

export const MIN_REPAIR_DESCRIPTION_LENGTH = 20;

export const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';
export const KHMER_MONTHS = [
  'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
];
