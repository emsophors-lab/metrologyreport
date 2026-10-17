/**
 * MLRS report record + licence record  →  (payload, extra) for buildAnnex8Data.
 *
 * Two entry points, because the official Word is downloadable from two places
 * with different data in hand:
 *
 *   mapStateToAnnex8()   the licensee's own wizard — the working Annex8State,
 *                        before or just after submitting.
 *   mapRecordToAnnex8()  a stored report — an annex8_reports row plus its child
 *                        rows, as NMC staff see it.
 *
 * Part 2 totals are NOT mapped. buildAnnex8Data recomputes them from the rows,
 * and nothing the form computed is passed through.
 *
 * Several database columns are named differently from the payload fields
 * (max_capacity / min_capacity / e_value, latitude / longitude, host_part,
 * new_status), so the record mapping is written out rather than spread.
 */
import { PROVINCES } from '../../annex8/constants';
import type { Annex8Licensee, Annex8State } from '../../annex8/types';
import type { Annex8Extra } from './annex8Docx';

/**
 * «ធ្វើនៅ» takes the capital or province NAME only — not the whole street
 * address. It is read from what the enterprise already filled in: first its
 * operating address, then the provinces of the work it reported this month.
 *
 * Longest name first, so ព្រះសីហនុ is not mistaken for ព្រះវិហារ and the
 * two-word names win over any shorter name they contain.
 */
const PROVINCES_BY_LENGTH = [...PROVINCES].sort((a, b) => b.length - a.length);

export function deriveSignedPlace(
  operatingAddress?: string | null,
  rowProvinces: Array<string | null | undefined> = [],
): string {
  const address = String(operatingAddress || '');
  const hit = PROVINCES_BY_LENGTH.find((p) => address.includes(p));
  if (hit) return hit;

  // ភ្នំពេញ is commonly written without the រាជធានី prefix.
  if (address.includes('ភ្នំពេញ')) return 'រាជធានីភ្នំពេញ';

  // Otherwise fall back to where the month's work actually happened: the
  // province that appears on the most rows.
  const tally = new Map<string, number>();
  for (const raw of rowProvinces) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const match = PROVINCES_BY_LENGTH.find((p) => value.includes(p))
      || (value.includes('ភ្នំពេញ') ? 'រាជធានីភ្នំពេញ' : '');
    if (match) tally.set(match, (tally.get(match) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of tally) {
    if (count > bestCount) { best = name; bestCount = count; }
  }
  return best;
}

export interface Annex8DocxInput {
  payload: Record<string, any>;
  extra: Annex8Extra;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/* ------------------------------------------------------------------ *
 * 1. From the wizard state
 * ------------------------------------------------------------------ */

/** What the form knows about the submission at the moment of download. */
export interface Annex8StateExtra {
  report_id?: string | null;
  submitted_at?: string | null;
  received_at?: string | null;
  on_time?: boolean | null;
  signed_place?: string;
  letter_no?: string;
  lunar_date_line?: string;
  legal_rep_name?: string;
}

export function mapStateToAnnex8(
  state: Annex8State,
  licensee: Partial<Annex8Licensee> | null | undefined,
  submission: Annex8StateExtra = {},
): Annex8DocxInput {
  const m = state.meta;

  const payload = {
    format_version: state.format_version,
    meta: {
      licence_no: m.licence_no,
      licence_type: m.licence_type,
      enterprise_name_kh: m.enterprise_name_kh,
      enterprise_name_en: m.enterprise_name_en,
      registration_no: m.registration_no,
      licence_valid_to: str(m.licence_valid_to),
      operating_address: m.operating_address,
      period_month: m.period_month,
      report_type: m.report_type,
      original_report_id: str(m.original_report_id),
      report_id: submission.report_id ?? m.report_id ?? null,
      contact: {
        name: str(m.contact.name),
        position: str(m.contact.position),
        phone: str(m.contact.phone),
        email: str(m.contact.email),
      },
    },
    // _id is a UI row key; everything else goes through unchanged.
    part3_instruments: state.instruments.map(({ _id, ...x }) => x),
    part3a_modules: state.modules.map(({ _id, ...x }) => ({ ...x, part: (x as any).part || 'P3' })),
    part4_repairs: state.repairs.map(({ _id, ...x }) => x),
    part5_standards: state.standards.map(({ _id, ...x }) => x),
    carry_over_updates: state.carry_over.map((c) => ({
      ref: c.ref,
      serial_no: c.serial_no,
      status: c.status,
      cert_no: c.cert_no,
      date: c.date,
    })),
    part6_events: state.events,
    declaration_accepted: state.declaration,
  };

  const extra: Annex8Extra = {
    decision_no: str(licensee?.decision_no),
    decision_date: str(licensee?.decision_date),
    legal_rep_name: str(submission.legal_rep_name),
    preparer_name: str(m.contact.name),
    preparer_position: str(m.contact.position),
    submitted_at: str(submission.submitted_at ?? state.submitted_at),
    received_at: str(submission.received_at ?? submission.submitted_at ?? state.submitted_at),
    report_id: str(submission.report_id ?? m.report_id),
    // undefined leaves BOTH NMC checkboxes empty, which is right for a draft:
    // on_time is the server's decision, not the form's.
    on_time: submission.on_time === null || submission.on_time === undefined
      ? undefined
      : !!submission.on_time,
    signed_place: submission.signed_place || deriveSignedPlace(
      m.operating_address,
      [...state.instruments.map((x) => x.province), ...state.repairs.map((x) => x.province)],
    ),
    letter_no: submission.letter_no,
    lunar_date_line: submission.lunar_date_line,
  };

  return { payload, extra };
}

/* ------------------------------------------------------------------ *
 * 2. From a stored report
 * ------------------------------------------------------------------ */

export interface Annex8RecordRows {
  instruments?: any[];
  modules?: any[];
  repairs?: any[];
  standards?: any[];
  carryOver?: any[];
}

/** The licence-side fields the cover letter and Part 7 need. */
export interface Annex8LicenceRecord {
  decision_no?: string;
  decision_date?: string;
  legal_rep_name?: string;
  license_owner_name?: string;
  signed_place?: string;
}

export function mapRecordToAnnex8(
  report: Record<string, any>,
  rows: Annex8RecordRows = {},
  licence: Annex8LicenceRecord | null | undefined = null,
): Annex8DocxInput {
  const payload = {
    format_version: report.format_version,
    meta: {
      licence_no: report.licence_no,
      licence_type: report.licence_type,
      enterprise_name_kh: report.enterprise_name_kh,
      enterprise_name_en: report.enterprise_name_en,
      registration_no: report.registration_no,
      licence_valid_to: str(report.licence_valid_to),
      operating_address: report.operating_address,
      period_month: report.period_month,
      report_type: report.report_type,
      original_report_id: str(report.original_report_id),
      report_id: str(report.report_id),
      contact: {
        name: str(report.contact_name),
        position: str(report.contact_position),
        phone: str(report.contact_phone),
        email: str(report.contact_email),
      },
    },
    part3_instruments: (rows.instruments || []).map((x: any) => ({
      op_code: x.op_code,
      category: x.category,
      category_other: str(x.category_other),
      instrument_name: x.instrument_name,
      model: str(x.model),
      serial_no: x.serial_no,
      manufacturer: str(x.manufacturer),
      country: str(x.country),
      max: str(x.max_capacity),
      min: str(x.min_capacity),
      e: str(x.e_value),
      unit: str(x.unit),
      accuracy_class: str(x.accuracy_class),
      type_approval_no: str(x.type_approval_no),
      completion_date: str(x.completion_date),
      customer_name: str(x.customer_name),
      province: str(x.province),
      address: str(x.address),
      lat: str(x.latitude),
      long: str(x.longitude),
      label_qr_no: str(x.label_qr_no),
      verification_status: x.verification_status,
      verification_cert_no: str(x.verification_cert_no),
      verification_date: str(x.verification_date),
    })),
    part3a_modules: (rows.modules || []).map((x: any) => ({
      host_serial_no: x.host_serial_no,
      part: x.host_part || 'P3',
      module_name: x.module_name,
      model: str(x.model),
      serial_no: str(x.serial_no),
      range_e: str(x.range_e),
      manufacturer: str(x.manufacturer),
      country: str(x.country),
      cert_no: str(x.cert_no),
      new_or_replacement: x.new_or_replacement,
    })),
    part4_repairs: (rows.repairs || []).map((x: any) => ({
      category: x.category,
      instrument_name: x.instrument_name,
      model: str(x.model),
      serial_no: x.serial_no,
      customer_name: str(x.customer_name),
      province: str(x.province),
      address: str(x.address),
      lat: str(x.latitude),
      long: str(x.longitude),
      repair_from: str(x.repair_from),
      repair_to: str(x.repair_to),
      repair_description: str(x.repair_description),
      seal_broken: !!x.seal_broken,
      seal_removed_no: str(x.seal_removed_no),
      notification_no: str(x.notification_no),
      technician: str(x.technician),
      verification_status: x.verification_status,
      verification_cert_no: str(x.verification_cert_no),
      verification_date: str(x.verification_date),
    })),
    part5_standards: (rows.standards || []).map((x: any) => ({
      equipment: x.equipment,
      serial_no: str(x.serial_no),
      class_range: str(x.class_range),
      cal_cert_no: str(x.cal_cert_no),
      lab: str(x.lab),
      cal_date: str(x.cal_date),
      due_date: str(x.due_date),
      status: x.status,
    })),
    // The column is new_status; the field the fill module reads is status.
    carry_over_updates: (rows.carryOver || []).map((x: any) => ({
      ref: x.source_part,
      serial_no: str(x.serial_no),
      status: x.new_status,
      cert_no: str(x.cert_no),
      date: str(x.verification_date),
    })),
    part6_events: report.events || {},
    declaration_accepted: !!report.declaration_accepted,
  };

  const extra: Annex8Extra = {
    decision_no: str(licence?.decision_no),
    decision_date: str(licence?.decision_date),
    legal_rep_name: str(licence?.legal_rep_name || licence?.license_owner_name),
    preparer_name: str(report.contact_name),
    preparer_position: str(report.contact_position),
    submitted_at: str(report.submitted_at),
    received_at: str(report.received_at || report.submitted_at),
    report_id: str(report.report_id),
    on_time: report.on_time === null || report.on_time === undefined ? undefined : !!report.on_time,
    signed_place: licence?.signed_place || deriveSignedPlace(
      report.operating_address,
      [
        ...(rows.instruments || []).map((x: any) => x.province),
        ...(rows.repairs || []).map((x: any) => x.province),
      ],
    ),
  };

  return { payload, extra };
}
