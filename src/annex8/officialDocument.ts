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
  fillAnnex8Template,
  listTags,
} from '../lib/annex8/annex8Docx';
import { mapRecordToAnnex8 } from '../lib/annex8/mapReportToAnnex8';

export const DEFAULT_TEMPLATE_VERSION = 'v1';

/**
 * The template is served to the browser from public/, so on disk it is either
 * public/templates (dev, and in the repo) or dist/templates (after a build,
 * which is what Vercel ships).
 */
export const templateCandidatesFor = (version: string) => [
  path.join(process.cwd(), 'dist', 'templates', `Annex8_template_${version}.docx`),
  path.join(process.cwd(), 'public', 'templates', `Annex8_template_${version}.docx`),
];
export const templatePathFor = (version: string) =>
  templateCandidatesFor(version).find((p) => fs.existsSync(p)) || templateCandidatesFor(version)[0];

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
  // disk, which is why vercel.json ships dist/templates/**.
  if (!fs.existsSync(templateFile)) {
    missing.push(`dist/templates/Annex8_template_${version}.docx (or public/templates/)`);
  }
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

/**
 * Reads the stored report and hands it to the shared mapper, which is the same
 * one the browser download uses — so a document rendered server-side can never
 * differ from the one a licensee downloads.
 *
 * Part 2 totals are deliberately not carried over: buildAnnex8Data recomputes
 * them from the rows, and nothing client-computed is passed through.
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

  const { payload, extra } = mapRecordToAnnex8(
    report,
    {
      instruments: instruments.data || [],
      modules: modules.data || [],
      repairs: repairs.data || [],
      standards: standards.data || [],
      carryOver: carryOver.data || [],
    },
    {
      decision_no: profile.data?.decision_no,
      decision_date: profile.data?.decision_date,
      legal_rep_name: profile.data?.legal_rep_name,
      license_owner_name: licence.data?.license_owner_name,
    },
  );

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
  const doc = fillAnnex8Template(template, input.payload, input.extra);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
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

/**
 * HTML -> PDF with Gotenberg's Chromium.
 *
 * Used for the monthly compliance digest, which is an internal NMC summary and
 * not the official annex — the annex is only ever produced by filling the Word
 * template. Chromium shapes Khmer correctly provided the image carries the
 * Khmer fonts (docker/gotenberg.Dockerfile), the same requirement as the
 * LibreOffice route above.
 */
export async function convertHtmlToPdf(html: string, fileName = 'index.html'): Promise<Buffer> {
  const base = process.env.GOTENBERG_URL;
  if (!base) throw new PdfConversionError('GOTENBERG_URL is not configured.');

  const form = new FormData();
  // Gotenberg requires the entry file to be named index.html.
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  form.append('printBackground', 'true');
  form.append('preferCssPageSize', 'true');

  const res = await fetch(`${base.replace(/\/$/, '')}/forms/chromium/convert/html`, {
    method: 'POST',
    body: form as any,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new PdfConversionError(`Gotenberg returned ${res.status} for ${fileName}. ${detail.slice(0, 300)}`);
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

/**
 * Where official documents are kept.
 *
 *   supabase  Supabase Storage (default, how it runs today)
 *   fs        a directory on the server — for a self-hosted Postgres on
 *             MISTI's internal network, where storage.* does not exist
 *
 * The rest of the module does not know which is in use: both drivers take and
 * return the same object path, so moving off Supabase changes this setting and
 * nothing else. ANNEX8_STORAGE_DIR sets the directory for the fs driver.
 */
export const STORAGE_DRIVER = (process.env.ANNEX8_STORAGE_DRIVER || 'supabase').toLowerCase();
const STORAGE_DIR = process.env.ANNEX8_STORAGE_DIR
  || path.join(process.cwd(), 'var', 'annex8-reports');

/** Rejects any path that would escape the storage root. */
function resolveStoredPath(storagePath: string): string {
  const full = path.resolve(STORAGE_DIR, storagePath);
  const root = path.resolve(STORAGE_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Refusing to use a storage path outside the store: ${storagePath}`);
  }
  return full;
}

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

  if (STORAGE_DRIVER === 'fs') {
    const full = resolveStoredPath(storagePath);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, body);
    return { path: storagePath, sha256: sha256(body) };
  }

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
  if (STORAGE_DRIVER === 'fs') {
    // Resolved outside the try: a path escaping the store is a hard error, not
    // a quiet "not found" that the caller would paper over by re-rendering.
    const full = resolveStoredPath(storagePath);
    try {
      return await fs.promises.readFile(full);
    } catch {
      return null;      // missing file: the caller re-renders and backfills
    }
  }

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
