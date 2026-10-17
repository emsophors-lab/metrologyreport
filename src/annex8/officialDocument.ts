/**
 * Annex 8 official document rendering (server-side).
 *
 * The official record of a submitted report is the DOCX produced by FILLING
 * templates/Annex8_template_v1.docx, and the PDF converted from it. The
 * template is the single source of truth for layout, fonts and sizes: nothing
 * here generates, restyles or regenerates it. If the printed document looks
 * wrong, the tag or section in the template is what needs editing — not this
 * file.
 *
 * This module owns only the parts around the fill:
 *   - loading the submitted report out of the database and shaping it back
 *     into the A8-2026.2 payload that buildAnnex8Data expects,
 *   - converting the filled DOCX to PDF via Gotenberg,
 *   - storing both in the private bucket and picking the template version a
 *     report was submitted under.
 *
 * buildAnnex8Data() is NOT reimplemented here. It is imported from
 * lib/annex8/fill-annex8, so the logic stays the one in that file.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  Annex8Extra,
  buildAnnex8Data,
  listTags,
  renderAnnex8,
} from '../../lib/annex8/fill-annex8';

export const DEFAULT_TEMPLATE_VERSION = 'v1';

/** Where the template lives, relative to the repo root. */
export const templatePathFor = (version: string) =>
  path.join(process.cwd(), 'templates', `Annex8_template_${version}.docx`);

export class Annex8TemplateMissingError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Annex 8 template assets are not installed: ${missing.join(', ')}`);
    this.name = 'Annex8TemplateMissingError';
  }
}

export function officialAssetsStatus(version = DEFAULT_TEMPLATE_VERSION) {
  const templateFile = templatePathFor(version);
  const missing: string[] = [];
  // The fill module is bundled with the server; only the .docx is read from
  // disk at runtime, which is why vercel.json ships templates/**.
  if (!fs.existsSync(templateFile)) missing.push(`templates/Annex8_template_${version}.docx`);
  return { ready: missing.length === 0, missing, templateFile };
}

export function readTemplate(version = DEFAULT_TEMPLATE_VERSION): Buffer {
  const status = officialAssetsStatus(version);
  if (!status.ready) throw new Annex8TemplateMissingError(status.missing);
  return fs.readFileSync(status.templateFile);
}

/* ------------------------------------------------------------------ *
 * 1. Load the report out of the database
 * ------------------------------------------------------------------ */

export interface Annex8RenderInput {
  /** The row itself, for naming and storage paths. */
  report: Record<string, any>;
  /** The A8-2026.2 payload shape buildAnnex8Data reads. */
  payload: Record<string, any>;
  /** Licence-record and submission values the payload does not carry. */
  extra: Annex8Extra;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Rebuilds the submitted payload from the stored rows. The column names differ
 * from the payload field names in a few places (max_capacity / min_capacity /
 * e_value, latitude / longitude, host_part, new_status), so the mapping is
 * written out rather than spread.
 *
 * Part 2 totals are deliberately NOT included: buildAnnex8Data recomputes them
 * from the rows, and nothing client-computed is passed through.
 */
export async function loadAnnex8RenderInput(
  supabaseAdmin: any,
  reportUuid: string,
): Promise<Annex8RenderInput | null> {
  const { data: report } = await supabaseAdmin
    .from('annex8_reports').select('*').eq('id', reportUuid).maybeSingle();
  if (!report) return null;

  const [instruments, modules, repairs, standards, carryOver, profile, licence] = await Promise.all([
    supabaseAdmin.from('annex8_report_instruments').select('*').eq('report_uuid', reportUuid).order('row_no'),
    supabaseAdmin.from('annex8_report_modules').select('*').eq('report_uuid', reportUuid).order('row_no'),
    supabaseAdmin.from('annex8_report_repairs').select('*').eq('report_uuid', reportUuid).order('row_no'),
    supabaseAdmin.from('annex8_report_standards').select('*').eq('report_uuid', reportUuid).order('row_no'),
    supabaseAdmin.from('annex8_carry_over_updates').select('*').eq('report_uuid', reportUuid),
    supabaseAdmin.from('annex8_licence_profiles').select('*').eq('license_number', report.licence_no).maybeSingle(),
    supabaseAdmin.from('enterprise_licenses').select('*').eq('license_number', report.licence_no).maybeSingle(),
  ]);

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
      contact: {
        name: str(report.contact_name),
        position: str(report.contact_position),
        phone: str(report.contact_phone),
        email: str(report.contact_email),
      },
    },
    part3_instruments: (instruments.data || []).map((x: any) => ({
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
    part3a_modules: (modules.data || []).map((x: any) => ({
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
    part4_repairs: (repairs.data || []).map((x: any) => ({
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
    part5_standards: (standards.data || []).map((x: any) => ({
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
    carry_over_updates: (carryOver.data || []).map((x: any) => ({
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
    // Named in the spec as coming from the licence record.
    decision_no: str(profile.data?.decision_no),
    decision_date: str(profile.data?.decision_date),
    legal_rep_name: str(profile.data?.legal_rep_name || licence.data?.license_owner_name),
    preparer_name: str(report.contact_name),
    preparer_position: str(report.contact_position),
    submitted_at: str(report.submitted_at),
    received_at: str(report.received_at || report.submitted_at),
    report_id: str(report.report_id),
    on_time: report.on_time === null || report.on_time === undefined ? undefined : !!report.on_time,
  };

  return { report, payload, extra };
}

/* ------------------------------------------------------------------ *
 * 2. Fill the template
 * ------------------------------------------------------------------ */

export function renderOfficialDocx(
  input: Annex8RenderInput,
  version = DEFAULT_TEMPLATE_VERSION,
): Buffer {
  const template = readTemplate(version);
  // Part 2 totals are recomputed inside buildAnnex8Data.
  const data = buildAnnex8Data(input.payload, input.extra);
  return renderAnnex8(template, data);
}

/** Tag list of a template, for the CI check against buildAnnex8Data's keys. */
export function listTemplateTags(version = DEFAULT_TEMPLATE_VERSION): string[] {
  return listTags(readTemplate(version));
}

/* ------------------------------------------------------------------ *
 * 3. DOCX -> PDF via Gotenberg
 * ------------------------------------------------------------------ */

export class PdfConversionError extends Error {}

/**
 * Converts with LibreOffice inside Gotenberg. The image must carry Khmer OS
 * Siemreap and Khmer OS Muol Light (docker/gotenberg.Dockerfile), otherwise
 * LibreOffice substitutes a fallback and the Khmer text comes out broken.
 */
export async function convertDocxToPdf(docx: Buffer, fileName: string): Promise<Buffer> {
  const base = process.env.GOTENBERG_URL;
  if (!base) throw new PdfConversionError('GOTENBERG_URL is not configured.');

  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), fileName);

  const res = await fetch(`${base.replace(/\/$/, '')}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form as any,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new PdfConversionError(`Gotenberg returned ${res.status}. ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ *
 * 4. Naming and checksums
 * ------------------------------------------------------------------ */

/** Annex8_<licence_no>_<YYYY-MM>_<report_id>.(docx|pdf) */
export function officialFileName(
  report: { licence_no?: string; period_month?: string; report_id?: string },
  ext: 'docx' | 'pdf',
): string {
  const safe = (v: unknown) => String(v ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `Annex8_${safe(report.licence_no)}_${safe(report.period_month)}_${safe(report.report_id)}.${ext}`;
}

export const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

/* ------------------------------------------------------------------ *
 * 5. Private storage bucket
 * ------------------------------------------------------------------ */

/**
 * Official documents live in a PRIVATE Supabase Storage bucket. Nothing is
 * served from a public URL: every download goes through
 * GET /api/reports/:id/annex8.(docx|pdf), which checks that the caller is the
 * owner licensee or NMC staff first.
 */
export const OFFICIAL_BUCKET = process.env.ANNEX8_BUCKET || 'annex8-reports';

/** <licence_no>/<YYYY-MM>/<report_id>/<file name> — stable, so a re-render overwrites. */
export function officialStoragePath(
  report: { licence_no?: string; period_month?: string; report_id?: string },
  ext: 'docx' | 'pdf',
): string {
  const safe = (v: unknown) => String(v ?? 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return [
    safe(report.licence_no),
    safe(report.period_month),
    safe(report.report_id),
    officialFileName(report, ext),
  ].join('/');
}

const CONTENT_TYPE: Record<'docx' | 'pdf', string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/** Uploads one official document and returns the path it was stored at. */
export async function putOfficialDocument(
  supabaseAdmin: any,
  report: { licence_no?: string; period_month?: string; report_id?: string },
  ext: 'docx' | 'pdf',
  body: Buffer,
): Promise<{ path: string; sha256: string }> {
  const storagePath = officialStoragePath(report, ext);
  const { error } = await supabaseAdmin.storage
    .from(OFFICIAL_BUCKET)
    .upload(storagePath, body, { contentType: CONTENT_TYPE[ext], upsert: true });
  if (error) throw new Error(`Storage upload failed (${storagePath}): ${error.message || error}`);
  return { path: storagePath, sha256: sha256(body) };
}

export async function getOfficialDocument(
  supabaseAdmin: any,
  storagePath: string,
): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(OFFICIAL_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Renders the official DOCX and PDF for a submitted report and stores both in
 * the private bucket. Returns the columns to write onto the report row.
 *
 * Called once at submission. A failure here must never fail the submission —
 * the report is already accepted — so the caller records official_render_error
 * and the download route re-renders on demand.
 */
export async function renderAndStoreOfficialDocuments(
  supabaseAdmin: any,
  reportUuid: string,
  version = DEFAULT_TEMPLATE_VERSION,
): Promise<Record<string, any>> {
  const input = await loadAnnex8RenderInput(supabaseAdmin, reportUuid);
  if (!input) throw new Error('Report not found.');

  const docx = renderOfficialDocx(input, version);
  const stored = await putOfficialDocument(supabaseAdmin, input.report, 'docx', docx);

  const out: Record<string, any> = {
    official_docx_path: stored.path,
    official_docx_sha256: stored.sha256,
    official_rendered_at: new Date().toISOString(),
    official_render_error: null,
  };

  // The PDF needs Gotenberg. If it is not reachable the DOCX still stands as
  // the official record, and the error is kept so a retry can find the report.
  try {
    const pdf = await convertDocxToPdf(docx, officialFileName(input.report, 'docx'));
    const storedPdf = await putOfficialDocument(supabaseAdmin, input.report, 'pdf', pdf);
    out.official_pdf_path = storedPdf.path;
    out.official_pdf_sha256 = storedPdf.sha256;
  } catch (err: any) {
    out.official_render_error = `PDF: ${err?.message || err}`;
  }

  return out;
}
