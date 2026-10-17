/**
 * Annex 8 official document rendering (server-side).
 *
 * The official record of a submitted report is the DOCX produced by FILLING
 * templates/Annex8_template_v1.docx, and the PDF converted from it. The
 * template is the single source of truth for layout, fonts and sizes: nothing
 * here generates, restyles or regenerates it.
 *
 * This module owns only the parts around that:
 *   - loading the submitted report + licence record out of the database,
 *   - delegating to lib/annex8/fill-annex8 (buildAnnex8Data / renderAnnex8),
 *   - converting the filled DOCX to PDF via Gotenberg,
 *   - picking the template version a report was submitted under.
 *
 * buildAnnex8Data() is NOT reimplemented here. It is required at runtime from
 * lib/annex8/fill-annex8, so its logic stays the one in that file.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const DEFAULT_TEMPLATE_VERSION = 'v1';

/** Where the template and the fill module live, relative to the repo root. */
export const templatePathFor = (version: string) =>
  path.join(process.cwd(), 'templates', `Annex8_template_${version}.docx`);
export const FILL_MODULE_PATH = path.join(process.cwd(), 'lib', 'annex8', 'fill-annex8');

export class Annex8TemplateMissingError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Annex 8 template assets are not installed: ${missing.join(', ')}`);
    this.name = 'Annex8TemplateMissingError';
  }
}

/**
 * Required at runtime through a computed path so the bundler does not try to
 * resolve it at build time — the file is supplied with the template assets and
 * may legitimately be absent from a checkout that never renders documents.
 */
function loadFillModule(): any {
  // eslint-disable-next-line no-eval
  const runtimeRequire = eval('require') as NodeRequire;
  return runtimeRequire(FILL_MODULE_PATH);
}

export function officialAssetsStatus(version = DEFAULT_TEMPLATE_VERSION) {
  const templateFile = templatePathFor(version);
  const missing: string[] = [];
  if (!fs.existsSync(templateFile)) missing.push(`templates/Annex8_template_${version}.docx`);
  const hasFill = ['.js', '.cjs', '.ts'].some((ext) => fs.existsSync(FILL_MODULE_PATH + ext));
  if (!hasFill) missing.push('lib/annex8/fill-annex8.js');
  return { ready: missing.length === 0, missing, templateFile };
}

/* ------------------------------------------------------------------ *
 * 1. Load the report out of the database
 * ------------------------------------------------------------------ */

export interface Annex8RenderInput {
  report: Record<string, any>;
  licence: Record<string, any>;
  instruments: Record<string, any>[];
  modules: Record<string, any>[];
  repairs: Record<string, any>[];
  standards: Record<string, any>[];
  carryOver: Record<string, any>[];
}

/**
 * Everything the cover letter and Parts 1-7 need, read from the submitted
 * report and the licence record. Part 2 totals are deliberately NOT included:
 * buildAnnex8Data() recomputes them from the rows.
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

  return {
    report,
    licence: {
      licence_no: report.licence_no,
      // Named explicitly in the spec as coming from the licence record.
      decision_no: profile.data?.decision_no || '',
      decision_date: profile.data?.decision_date || '',
      legal_rep_name: profile.data?.legal_rep_name || licence.data?.license_owner_name || '',
      legal_rep_position: profile.data?.legal_rep_position || licence.data?.license_owner_position || '',
      registration_no: profile.data?.registration_no || report.registration_no || '',
      licence_valid_to: report.licence_valid_to || licence.data?.license_expiry_date || '',
      enterprise_name_kh: report.enterprise_name_kh,
      enterprise_name_en: report.enterprise_name_en,
      operating_address: report.operating_address,
    },
    instruments: instruments.data || [],
    modules: modules.data || [],
    repairs: repairs.data || [],
    standards: standards.data || [],
    carryOver: carryOver.data || [],
  };
}

/* ------------------------------------------------------------------ *
 * 2. Fill the template  (delegates to lib/annex8/fill-annex8)
 * ------------------------------------------------------------------ */

export function renderOfficialDocx(
  input: Annex8RenderInput,
  version = DEFAULT_TEMPLATE_VERSION,
): Buffer {
  const status = officialAssetsStatus(version);
  if (!status.ready) throw new Annex8TemplateMissingError(status.missing);

  const fill = loadFillModule();
  if (typeof fill.buildAnnex8Data !== 'function' || typeof fill.renderAnnex8 !== 'function') {
    throw new Annex8TemplateMissingError(['lib/annex8/fill-annex8 must export buildAnnex8Data and renderAnnex8']);
  }

  // Part 2 totals are recomputed inside buildAnnex8Data; nothing client-side
  // is passed through.
  const data = fill.buildAnnex8Data(input);
  return fill.renderAnnex8(data, status.templateFile);
}

/** Tag list of a template, for the CI check against buildAnnex8Data's keys. */
export function listTemplateTags(version = DEFAULT_TEMPLATE_VERSION): string[] {
  const status = officialAssetsStatus(version);
  if (!status.ready) throw new Annex8TemplateMissingError(status.missing);
  const fill = loadFillModule();
  if (typeof fill.listTags !== 'function') {
    throw new Annex8TemplateMissingError(['lib/annex8/fill-annex8 must export listTags']);
  }
  return fill.listTags(status.templateFile);
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
