/**
 * Annex 8 — one entry at a time.
 *
 * A licensee records work as it happens, several times a month, so each entry
 * is a row from the moment it is typed rather than part of a whole-month
 * payload saved at the end. This module owns what the server needs to know
 * about those rows: which table each part lives in, which columns may be
 * written, which date decides the month an entry belongs to, and how a row is
 * copied when the user duplicates it.
 *
 * Deliberately kept free of database and HTTP concerns so the rules can be
 * read — and tested — on their own.
 */

export type EntryPart = 'instrument' | 'module' | 'repair' | 'standard';

export const ENTRY_PARTS: EntryPart[] = ['instrument', 'module', 'repair', 'standard'];

export const isEntryPart = (v: unknown): v is EntryPart =>
  typeof v === 'string' && (ENTRY_PARTS as string[]).includes(v);

interface EntryConfig {
  table: string;
  /** Columns a client may write. Anything else in the payload is ignored. */
  columns: string[];
  /**
   * The column whose date decides which month the entry belongs to. Part 3A
   * modules and Part 5 standards have no activity date of their own: a module
   * follows its host instrument or repair, and a standard describes the
   * equipment used during the month rather than a dated job.
   */
  activityDate: string | null;
  /** Columns NOT carried over when duplicating — see duplicateValues(). */
  uniquePerEntry: string[];
  /** Human label for messages, Khmer first. */
  label: { kh: string; en: string };
}

export const ENTRY_CONFIG: Record<EntryPart, EntryConfig> = {
  instrument: {
    table: 'annex8_report_instruments',
    columns: [
      'row_no', 'op_code', 'category', 'category_other', 'instrument_name', 'model', 'serial_no',
      'manufacturer', 'country', 'max_capacity', 'min_capacity', 'e_value', 'unit', 'accuracy_class',
      'type_approval_no', 'completion_date', 'customer_name', 'province', 'address',
      'latitude', 'longitude', 'label_qr_no',
      'verification_status', 'verification_cert_no', 'verification_date',
    ],
    activityDate: 'completion_date',
    // A duplicate is "another one like this": same model and customer, but its
    // own identity and its own verification result.
    uniquePerEntry: ['serial_no', 'label_qr_no', 'verification_cert_no', 'verification_date'],
    label: { kh: 'ផលិត/ដំឡើង', en: 'Manufactured / installed' },
  },

  module: {
    table: 'annex8_report_modules',
    columns: [
      'row_no', 'host_serial_no', 'host_part', 'module_name', 'model', 'serial_no', 'range_e',
      'manufacturer', 'country', 'cert_no', 'new_or_replacement',
    ],
    activityDate: null,
    // Eight load cells on one weighbridge differ only by serial and
    // certificate, which is exactly why duplicate earns its place here.
    uniquePerEntry: ['serial_no', 'cert_no'],
    label: { kh: 'ម៉ូឌុល', en: 'Modules / spare parts' },
  },

  repair: {
    table: 'annex8_report_repairs',
    columns: [
      'row_no', 'category', 'instrument_name', 'model', 'serial_no', 'customer_name',
      'province', 'address', 'latitude', 'longitude',
      'repair_from', 'repair_to', 'repair_description',
      'seal_broken', 'seal_removed_no', 'notification_no', 'technician',
      'verification_status', 'verification_cert_no', 'verification_date',
    ],
    activityDate: 'repair_to',
    uniquePerEntry: [
      'serial_no', 'seal_removed_no', 'notification_no',
      'verification_cert_no', 'verification_date',
    ],
    label: { kh: 'ជួសជុល', en: 'Repairs' },
  },

  standard: {
    table: 'annex8_report_standards',
    columns: ['row_no', 'equipment', 'serial_no', 'class_range', 'cal_cert_no', 'lab', 'cal_date', 'due_date', 'status'],
    activityDate: null,
    uniquePerEntry: ['serial_no', 'cal_cert_no'],
    label: { kh: 'ឧបករណ៍ស្ដង់ដារ', en: 'Standards' },
  },
};

/** The audit log's `entity` value for a part. */
export const auditEntityFor = (part: EntryPart): string => part;

/** Keeps only the columns this part allows, dropping anything else. */
export function pickEntryColumns(part: EntryPart, payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const column of ENTRY_CONFIG[part].columns) {
    if (column in payload) out[column] = payload[column];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Which month does this entry belong to?
 * ------------------------------------------------------------------ */

/** YYYY-MM from a YYYY-MM-DD date string, or '' when there is no usable date. */
export function periodOfDate(date: unknown): string {
  const text = String(date ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  return `${match[1]}-${match[2]}`;
}

/**
 * The month an entry is filed under.
 *
 * An entry belongs to the month its WORK happened, not the month it was typed:
 * an instrument completed on 31 August and entered on 2 September is August's.
 * Parts with no activity date of their own fall back to the month the user is
 * working in.
 */
export function periodForEntry(
  part: EntryPart,
  payload: Record<string, any>,
  fallbackPeriod: string,
): string {
  const column = ENTRY_CONFIG[part].activityDate;
  if (!column) return fallbackPeriod;
  return periodOfDate(payload[column]) || fallbackPeriod;
}

/* ------------------------------------------------------------------ *
 * Duplicating
 * ------------------------------------------------------------------ */

/**
 * The values to prefill when copying an entry.
 *
 * Duplicate exists to save typing — eight load cells on one weighbridge, or a
 * run of identical scales for the same customer. What it must never copy is
 * the part that makes the row a distinct instrument: its serial, its label,
 * and anything recording a verification that was performed on that one unit.
 * Copying a certificate number across would attach one instrument's result to
 * another, which is the kind of error a paper form would never make.
 */
export function duplicateValues(part: EntryPart, row: Record<string, any>): Record<string, any> {
  const config = ENTRY_CONFIG[part];
  const out: Record<string, any> = {};

  for (const column of config.columns) {
    if (column === 'row_no') continue;
    if (config.uniquePerEntry.includes(column)) continue;
    out[column] = row[column];
  }

  // A copy starts unverified: the original's result belongs to the original.
  if (config.columns.includes('verification_status')) out.verification_status = 'PENDING';
  return out;
}

/* ------------------------------------------------------------------ *
 * Can this month still be edited?
 * ------------------------------------------------------------------ */

export type ReportStatusValue = 'OPEN' | 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'ACCEPTED' | string;

/** Entries may be added or changed only while the month is with the licensee. */
export const isEditableStatus = (status: ReportStatusValue): boolean =>
  status === 'OPEN' || status === 'DRAFT' || status === 'RETURNED';

export interface MonthClosedError {
  code: 'MONTH_CLOSED';
  period_month: string;
  status: string;
  report_id: string | null;
  message_kh: string;
  message_en: string;
}

/** The refusal a client turns into "create an amendment for <month>?". */
export function monthClosedError(
  period: string,
  status: string,
  reportId: string | null,
): MonthClosedError {
  return {
    code: 'MONTH_CLOSED',
    period_month: period,
    status,
    report_id: reportId,
    message_kh: `របាយការណ៍ខែ ${period} ត្រូវបានដាក់ជូនរួចហើយ។ សូមស្នើកែតម្រូវ។`,
    message_en: `The report for ${period} has already been submitted. Create an amendment instead.`,
  };
}
