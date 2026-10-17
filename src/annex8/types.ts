/**
 * Annex 8 (A8-2026.2) data shapes.
 *
 * Field names follow the codes in `MLRS_Annex8_field_spec.xlsx`, and the state
 * shape mirrors the reference form `mlrs_annex8_report_form.html`, which is the
 * functional specification for the wizard.
 */

import {
  EventKey,
  InstrumentCategory,
  LicenceType,
  ModuleOrigin,
  OpCode,
  ReportStatus,
  ReportType,
  StandardStatus,
  VerificationStatus,
} from './constants';

/** Part 1 — pre-filled from the licence, not editable by the licensee. */
export interface Annex8Licensee {
  licence_no: string;
  licence_type: LicenceType;
  licence_valid_to: string;
  decision_no: string;
  decision_date: string;
  enterprise_name_kh: string;
  enterprise_name_en: string;
  registration_no: string;
  operating_address: string;
  /** Categories authorised on the licence — drives V06. */
  scope: InstrumentCategory[];
  /** Registered technicians — the Part 4 technician dropdown. */
  staff: string[];
  /** Registered standards — seeds Part 5. */
  standards: Array<{ equipment: string; serial_no: string; class_range: string }>;
}

export interface Annex8Contact {
  name: string;
  position: string;
  phone: string;
  email: string;
}

export interface Annex8Meta {
  report_id: string | null;
  licence_no: string;
  licence_type: LicenceType;
  enterprise_name_kh: string;
  enterprise_name_en: string;
  registration_no: string;
  licence_valid_to: string;
  operating_address: string;
  /** YYYY-MM */
  period_month: string;
  report_type: ReportType;
  original_report_id: string;
  contact: Annex8Contact;
}

/** Part 3 — instruments manufactured or installed. */
export interface Annex8Instrument {
  _id: string;
  op_code: OpCode;
  category: InstrumentCategory | '';
  category_other: string;
  instrument_name: string;
  model: string;
  serial_no: string;
  manufacturer: string;
  country: string;
  max: string;
  min: string;
  e: string;
  unit: string;
  accuracy_class: string;
  type_approval_no: string;
  completion_date: string;
  customer_name: string;
  province: string;
  address: string;
  lat: string;
  long: string;
  label_qr_no: string;
  verification_status: VerificationStatus;
  verification_cert_no: string;
  verification_date: string;
}

/** Part 3A — metrologically relevant modules / spare parts. */
export interface Annex8Module {
  _id: string;
  host_serial_no: string;
  module_name: string;
  model: string;
  serial_no: string;
  range_e: string;
  manufacturer: string;
  country: string;
  cert_no: string;
  new_or_replacement: ModuleOrigin;
}

/** Part 4 — repairs. */
export interface Annex8Repair {
  _id: string;
  category: InstrumentCategory | '';
  instrument_name: string;
  model: string;
  serial_no: string;
  customer_name: string;
  province: string;
  address: string;
  lat: string;
  long: string;
  repair_from: string;
  repair_to: string;
  repair_description: string;
  seal_broken: boolean;
  seal_removed_no: string;
  notification_no: string;
  technician: string;
  verification_status: VerificationStatus;
  verification_cert_no: string;
  verification_date: string;
}

/** Part 5 — measurement standards and test equipment. */
export interface Annex8Standard {
  _id: string;
  equipment: string;
  serial_no: string;
  class_range: string;
  cal_cert_no: string;
  lab: string;
  cal_date: string;
  due_date: string;
  status: StandardStatus;
}

/** Items left PENDING by an earlier report, re-presented for update. */
export interface Annex8CarryOverItem {
  ref: 'P3' | 'P4';
  /** Row id in the originating report, so the source row can be updated too. */
  source_row_id?: string;
  source_report_id?: string;
  serial_no: string;
  instrument_name: string;
  category: InstrumentCategory | '';
  since: string;
  status: VerificationStatus;
  cert_no: string;
  date: string;
}

export type Annex8Events = Record<EventKey, { yes: boolean | null; details: string }>;

/** The full working state of the wizard — also the draft payload. */
export interface Annex8State {
  format_version: string;
  meta: Annex8Meta;
  instruments: Annex8Instrument[];
  modules: Annex8Module[];
  repairs: Annex8Repair[];
  standards: Annex8Standard[];
  carry_over: Annex8CarryOverItem[];
  events: Annex8Events;
  declaration: boolean;
  submitted_at: string | null;
}

/** Part 2 — one row per category, computed from Parts 3 and 4. */
export interface Annex8SummaryRow {
  manufactured: number;
  installed: number;
  repaired: number;
  passed: number;
  failed: number;
  pending: number;
}

export interface Annex8Summary {
  rows: Record<InstrumentCategory, Annex8SummaryRow>;
  total: Annex8SummaryRow;
  carryOver: { count: number; passed: number; failed: number; pending: number };
  /** manufactured + installed + repaired */
  activity: number;
  /** passed + failed + pending */
  results: number;
  /** V01 — the two must be equal. */
  balanced: boolean;
  /** Distinct provinces touched this month — printed on the cover letter. */
  provinces: string[];
}

export type IssueSeverity = 'block' | 'warn' | 'info';

export interface Annex8Issue {
  severity: IssueSeverity;
  /** V01–V11 from the spec, or an R-code for field-level requirements. */
  code: string;
  /** Index into the visible wizard steps. */
  step: number;
  message: string;
  /** Dotted path into Annex8State, e.g. `instruments.0.serial_no`. */
  path: string;
}

/** Facts only the server can supply; the client passes what it knows. */
export interface Annex8ValidationContext {
  licence: Pick<Annex8Licensee, 'scope' | 'licence_valid_to' | 'staff'>;
  now?: Date;
  /** V07 — serials/labels already used elsewhere in the system. */
  knownDuplicateSerials?: string[];
  knownDuplicateLabels?: string[];
  /** V03 — Annex 10 notification numbers known to exist. */
  knownNotificationNos?: string[];
}

export interface Annex8SubmitResult {
  report_id: string;
  submitted_at: string;
}

export interface Annex8Payload {
  format_version: string;
  meta: Annex8Meta & { on_time: boolean };
  part2_summary: Record<string, Annex8SummaryRow>;
  part3_instruments: Array<Omit<Annex8Instrument, '_id'> & { part: 'P3' }>;
  part3a_modules: Array<Omit<Annex8Module, '_id'> & { part: string }>;
  part4_repairs: Array<Omit<Annex8Repair, '_id'>>;
  part5_standards: Array<Omit<Annex8Standard, '_id'>>;
  carry_over_updates: Annex8CarryOverItem[];
  part6_events: Annex8Events;
  declaration_accepted: boolean;
}
