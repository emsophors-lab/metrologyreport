/**
 * Annex 8 DB → payload mapping check — run in CI.
 *
 *   npm run annex8:check:db
 *
 * loadAnnex8RenderInput() rebuilds the A8-2026.2 payload out of the stored
 * rows, and several columns are named differently from the payload fields
 * (max_capacity / min_capacity / e_value, latitude / longitude, host_part,
 * new_status). A typo there does not throw: it quietly prints a blank cell in
 * the official annex.
 *
 * So this renders twice — once from the sample payload directly, once from a
 * fake database built out of that same payload using the real column names —
 * and requires the two documents to carry the same text. Any column the
 * mapping drops shows up as a difference.
 */
import fs from 'fs';
import path from 'path';

import PizZip from 'pizzip';

import { fillAnnex8Template } from '../src/lib/annex8/annex8Docx';
import { deriveSignedPlace } from '../src/lib/annex8/mapReportToAnnex8';
import { loadAnnex8RenderInput, readTemplate } from '../src/annex8/officialDocument';

const ROOT = process.cwd();
const sample = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'src', 'lib', 'annex8', '__fixtures__', 'sample-payload.json'), 'utf8'));
const r = sample.report;
const extra = sample.extra;

/* ---------------------------------------------------------------- *
 * A fake Supabase that returns the sample payload as database rows
 * ---------------------------------------------------------------- */

const rows: Record<string, any[]> = {
  annex8_reports: [{
    id: 'test-uuid',
    format_version: r.format_version,
    report_id: extra.report_id,
    licence_no: r.meta.licence_no,
    licence_type: r.meta.licence_type,
    enterprise_name_kh: r.meta.enterprise_name_kh,
    enterprise_name_en: r.meta.enterprise_name_en,
    registration_no: r.meta.registration_no,
    licence_valid_to: r.meta.licence_valid_to,
    operating_address: r.meta.operating_address,
    period_month: r.meta.period_month,
    report_type: r.meta.report_type,
    original_report_id: r.meta.original_report_id || null,
    contact_name: r.meta.contact.name,
    contact_position: r.meta.contact.position,
    contact_phone: r.meta.contact.phone,
    contact_email: r.meta.contact.email,
    events: r.part6_events,
    declaration_accepted: r.declaration_accepted,
    status: 'SUBMITTED',
    on_time: extra.on_time,
    submitted_at: extra.submitted_at,
    received_at: extra.received_at,
  }],
  annex8_report_instruments: [
    ...r.part3_instruments.map((x: any, i: number) => ({
    row_no: i + 1,
    op_code: x.op_code,
    category: x.category,
    category_other: x.category_other,
    instrument_name: x.instrument_name,
    model: x.model,
    serial_no: x.serial_no,
    manufacturer: x.manufacturer,
    country: x.country,
    max_capacity: x.max,
    min_capacity: x.min,
    e_value: x.e,
    unit: x.unit,
    accuracy_class: x.accuracy_class,
    type_approval_no: x.type_approval_no,
    completion_date: x.completion_date || null,
    customer_name: x.customer_name,
    province: x.province,
    address: x.address,
    latitude: x.lat || null,
    longitude: x.long || null,
    label_qr_no: x.label_qr_no,
    verification_status: x.verification_status,
    verification_cert_no: x.verification_cert_no,
    verification_date: x.verification_date || null,
    deleted_at: null,
  })),
    // Soft-deleted entry (e.g. LC-8808) — must be excluded by .is('deleted_at', null)
    {
      row_no: 999,
      op_code: 'NEW',
      category: 'WEIGH_ELECTRONIC',
      instrument_name: 'Deleted Scale',
      model: 'DEL-1',
      serial_no: 'DELETED-SN-999',
      manufacturer: 'Deleted Corp',
      country: 'KH',
      accuracy_class: 'III',
      customer_name: 'Ghost Customer',
      province: 'ភ្នំពេញ',
      address: 'Ghost St',
      verification_status: 'PASS',
      deleted_at: '2026-10-18T10:00:00.000Z',
    },
  ],
  annex8_report_modules: r.part3a_modules.map((x: any, i: number) => ({
    row_no: i + 1,
    host_serial_no: x.host_serial_no,
    host_part: x.part,
    module_name: x.module_name,
    model: x.model,
    serial_no: x.serial_no,
    range_e: x.range_e,
    manufacturer: x.manufacturer,
    country: x.country,
    cert_no: x.cert_no,
    new_or_replacement: x.new_or_replacement,
  })),
  annex8_report_repairs: r.part4_repairs.map((x: any, i: number) => ({
    row_no: i + 1,
    category: x.category,
    instrument_name: x.instrument_name,
    model: x.model,
    serial_no: x.serial_no,
    customer_name: x.customer_name,
    province: x.province,
    address: x.address,
    latitude: x.lat || null,
    longitude: x.long || null,
    repair_from: x.repair_from || null,
    repair_to: x.repair_to || null,
    repair_description: x.repair_description,
    seal_broken: x.seal_broken,
    seal_removed_no: x.seal_removed_no,
    notification_no: x.notification_no,
    technician: x.technician,
    verification_status: x.verification_status,
    verification_cert_no: x.verification_cert_no,
    verification_date: x.verification_date || null,
  })),
  annex8_report_standards: r.part5_standards.map((x: any, i: number) => ({
    row_no: i + 1,
    equipment: x.equipment,
    serial_no: x.serial_no,
    class_range: x.class_range,
    cal_cert_no: x.cal_cert_no,
    lab: x.lab,
    cal_date: x.cal_date || null,
    due_date: x.due_date || null,
    status: x.status,
  })),
  annex8_carry_over_updates: (r.carry_over_updates || []).map((x: any) => ({
    source_part: x.ref || 'P3',
    source_row_id: null,
    serial_no: x.serial_no,
    new_status: x.status,
    cert_no: x.cert_no || null,
    verification_date: x.date || null,
  })),
  annex8_licence_profiles: [{
    license_number: r.meta.licence_no,
    decision_no: extra.decision_no,
    decision_date: extra.decision_date,
    legal_rep_name: extra.legal_rep_name,
  }],
  enterprise_licenses: [{
    license_number: r.meta.licence_no,
    license_owner_name: extra.legal_rep_name,
  }],
};

/** Just enough of the query builder for loadAnnex8RenderInput. */
function fakeSupabase() {
  const builder = (table: string) => {
    let data = [...(rows[table] || [])];
    const api: any = {
      select: () => api,
      eq: () => api,
      is: (col: string, val: any) => {
        data = data.filter((r: any) => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val));
        return api;
      },
      order: () => Promise.resolve({ data, error: null }),
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data, error: null }),
    };
    return api;
  };
  return { from: builder };
}

/* ---------------------------------------------------------------- *
 * Compare the two renders
 * ---------------------------------------------------------------- */

const text = (buf: Buffer) =>
  (new PizZip(buf).file('word/document.xml') as any).asText().replace(/<[^>]+>/g, '');

(async () => {
  const template = readTemplate();

  // extra.submitted_at decides the signature date, and extra.letter_no /
  // signed_place / lunar_date_line are hand-filled fields the loader does not
  // supply, so the direct render is given the same subset the loader produces.
  const render = (payload: any, extra: any): Buffer =>
    fillAnnex8Template(template, payload, extra)
      .getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  const direct = render(r, {
    decision_no: extra.decision_no,
    decision_date: extra.decision_date,
    legal_rep_name: extra.legal_rep_name,
    preparer_name: r.meta.contact.name,
    preparer_position: r.meta.contact.position,
    submitted_at: extra.submitted_at,
    received_at: extra.received_at,
    report_id: extra.report_id,
    on_time: extra.on_time,
    // The loader derives this from the operating address; the control render
    // is given the same value so the comparison stays about column mapping.
    signed_place: deriveSignedPlace(
      r.meta.operating_address,
      [...r.part3_instruments.map((x: any) => x.province), ...r.part4_repairs.map((x: any) => x.province)],
    ),
  });

  const input = await loadAnnex8RenderInput(fakeSupabase(), 'test-uuid');
  if (!input) {
    console.error('✗ loadAnnex8RenderInput returned null for the fake report.');
    process.exit(1);
  }
  const fromDb = render(input.payload, input.extra);

  const a = text(direct);
  const b = text(fromDb);

  if (a === b) {
    console.log('✓ DB mapping: the document rendered from database rows is identical to the payload render.');
    process.exit(0);
  }

  // Report the first difference as the surrounding text, which names the field.
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  console.error('\n✗ DB mapping differs from the payload render.\n');
  console.error(`  First difference at character ${i}:`);
  console.error(`    payload : …${a.slice(Math.max(0, i - 60), i + 60)}…`);
  console.error(`    database: …${b.slice(Math.max(0, i - 60), i + 60)}…`);
  console.error('\n  A column is probably mapped to the wrong payload field in');
  console.error('  loadAnnex8RenderInput (src/annex8/officialDocument.ts).\n');
  process.exit(1);
})();
