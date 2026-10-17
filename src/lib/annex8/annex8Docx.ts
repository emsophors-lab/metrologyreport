/**
 * MLRS · Annex 8 — official monthly report, generated IN THE BROWSER by
 * filling public/templates/Annex8_template_v1.docx.
 *
 * The template is the single source of truth for layout, fonts, font sizes,
 * spacing, borders, page orientation and wording. This module only prepares
 * values for its tags and never styles anything. If the printed document looks
 * wrong, the tag or section in the template is what needs editing — do not fix
 * it here.
 *
 * TypeScript/ESM port of docs/annex8/fill-annex8.js. Every helper, tag and
 * fallback is the one in that reference file; only the module syntax, the types
 * and the browser template loading were added.
 *
 *   const blob = await renderAnnex8Docx(payload, extra);   // Blob
 *   await downloadAnnex8Docx(payload, extra);              // triggers download
 */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

/** Template version a report was filled with; stored on the report row. */
export const DEFAULT_TEMPLATE_VERSION = 'v1';

/** Served from public/, so it is also in dist/templates/ after a build. */
export const templateUrlFor = (version = DEFAULT_TEMPLATE_VERSION) =>
  `/templates/Annex8_template_${version}.docx`;

/* ------------------------------------------------------------------ *
 * formatting helpers  (unchanged from fill-annex8.js)
 * ------------------------------------------------------------------ */

const KD = '០១២៣៤៥៦៧៨៩';
const kh = (v: unknown) => String(v ?? '').replace(/\d/g, (d) => KD[Number(d)]);
const KM = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const BOX = (on: boolean) => (on ? '☑' : '☐');
const dmy = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');   // 2026-09-30 -> 30/09/2026
const parts = (iso?: string): [string, string, string] => {
  if (!iso) return ['', '', ''];
  const [y, m, d] = iso.split('-');
  return [d, m, y];
};
const or = (v: unknown, fallback: string) =>
  (v === undefined || v === null || String(v).trim() === '' ? fallback : (v as string));
// Hand-fill fields keep their dotted line when the system has no value, so the printout still looks official.
const DOTS = (n: number) => '.'.repeat(n);

/** Cambodia is UTC+7 with no daylight saving. */
const KH_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Day/month/year of a timestamp as they read in Cambodia, falling back to the
 * moment the document is generated. Using UTC getters on a shifted clock keeps
 * the answer the same whether this runs in a Phnom Penh browser or on a UTC
 * server.
 */
function khDateParts(iso?: string | null): { day: number; month: number; year: number } {
  const base = iso ? new Date(iso) : new Date();
  const d = new Date((Number.isNaN(base.getTime()) ? Date.now() : base.getTime()) + KH_OFFSET_MS);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

const CAT_CODE: Record<string, string> = {
  NAWI: 'nawi', WEIGHBRIDGE: 'weighbridge', WEIGHTS: 'weights', FUEL_DISPENSER: 'fuel', LPG_DISPENSER: 'lpg',
  ELEC_METER: 'elec', WATER_METER: 'water', EV_CHARGER: 'ev', OTHER: 'other',
};
/**
 * Verification wording for the Part 3 and Part 4 result cells.
 *
 * ជាប់ / ធ្លាក់, matching the template: its Part 2 column headers and the
 * carry-over line already say ជាប់ / ធ្លាក់, so the rows must read the same —
 * one official document cannot use two words for the same thing. The reference
 * fill-annex8.js printed ឆ្លង / មិនឆ្លង here, which is the difference against
 * docs/annex8/Annex8_sample_filled.docx.
 */
const VTXT = (st?: string, no?: string, date?: string) =>
  (st === 'PENDING' || !st ? 'រង់ចាំ' : `${st === 'PASSED' ? 'ជាប់' : 'ធ្លាក់'} ${or(no, '')} ${dmy(date)}`.trim());
const STD_KH: Record<string, string> = { VALID: 'មានសុពលភាព', EXPIRED: 'ផុតកំណត់', OUT_OF_SERVICE: 'ឈប់ប្រើ' };
const loc = (x: any) =>
  [x.province, x.address, (x.lat && x.long) ? `(${x.lat}, ${x.long})` : ''].filter(Boolean).join(' ');

/** Values the report payload does not carry: from the licence record and the submission. */
export interface Annex8Extra {
  decision_no?: string;
  decision_date?: string;
  letter_no?: string;
  preparer_name?: string;
  preparer_position?: string;
  legal_rep_name?: string;
  /** Khmer lunar date text; prints the template's dotted line when absent. */
  lunar_date_line?: string;
  /** «ធ្វើនៅ» — the capital/province name only, e.g. រាជធានីភ្នំពេញ. */
  signed_place?: string;
  /** Overrides the «ធ្វើនៅ … ថ្ងៃទី» date; defaults to submitted_at, then to now. */
  signed_date?: string;
  submitted_at?: string;
  received_at?: string;
  report_id?: string;
  on_time?: boolean;
}

type Counters = { m: number; i: number; r: number; passed: number; failed: number; pending: number };

/* ------------------------------------------------------------------ *
 * buildAnnex8Data  (logic identical to the reference file)
 * ------------------------------------------------------------------ */

/**
 * @param r      report payload (see MLRS_Annex8_field_spec.xlsx)
 * @param extra  data not in the payload: decision_no, decision_date, letter_no, preparer, legal_rep,
 *               lunar_date_line (Khmer lunar date text), received_at, report_id, on_time
 */
export function buildAnnex8Data(r: any, extra: Annex8Extra = {}): Record<string, any> {
  const m = r.meta;
  const [y, mo] = String(m.period_month).split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const isNil = m.report_type === 'NIL';
  const ins: any[] = isNil ? [] : (r.part3_instruments || []);
  const mods: any[] = isNil ? [] : (r.part3a_modules || []);
  const reps: any[] = isNil ? [] : (r.part4_repairs || []);
  const stds: any[] = isNil ? [] : (r.part5_standards || []);

  // Part 2 – ALWAYS recomputed here from the rows (never trust client totals)
  const sum: Record<string, Counters> = {};
  Object.values(CAT_CODE).forEach((c) => { sum[c] = { m: 0, i: 0, r: 0, passed: 0, failed: 0, pending: 0 }; });
  const vkey = (s?: string) => (({ PASSED: 'passed', FAILED: 'failed' } as Record<string, string>)[s || ''] || 'pending');
  ins.forEach((x) => {
    const c = CAT_CODE[x.category];
    if (!c) return;
    sum[c][x.op_code === 'M' ? 'm' : 'i']++;
    (sum[c] as any)[vkey(x.verification_status)]++;
  });
  reps.forEach((x) => {
    const c = CAT_CODE[x.category];
    if (!c) return;
    sum[c].r++;
    (sum[c] as any)[vkey(x.verification_status)]++;
  });
  const total: Counters = { m: 0, i: 0, r: 0, passed: 0, failed: 0, pending: 0 };
  Object.values(sum).forEach((s) => Object.keys(total).forEach((k) => { (total as any)[k] += (s as any)[k]; }));
  const flat: Record<string, number> = {};
  Object.entries(sum).forEach(([c, s]) => Object.entries(s).forEach(([k, v]) => { flat[`${c}_${k}`] = v; }));
  Object.entries(total).forEach(([k, v]) => { flat[`total_${k}`] = v; });
  const others = [...new Set(ins.concat(reps).filter((x) => x.category === 'OTHER').map((x) => x.category_other).filter(Boolean))];

  const co: any[] = r.carry_over_updates || [];
  const coCount = (s: string) => co.filter((x) => x.status === s).length;
  const provinces = [...new Set(ins.concat(reps).map((x) => x.province).filter(Boolean))];
  const [vd, vm, vy] = parts(m.licence_valid_to);
  const [dd, dm, dy] = parts(extra.decision_date);
  /**
   * «ធ្វើនៅ … ថ្ងៃទី … ខែ … ឆ្នាំ …» is the date the document is made. A
   * submitted report is dated by its submission; anything else is dated the
   * day it is generated, so the printout never comes out with blank dots for
   * the licensee to fill in by hand. Read in Cambodia time, because the
   * server that generates it runs in UTC.
   */
  const signed = khDateParts(extra.signed_date || extra.submitted_at);
  const ev = r.part6_events || {};

  return {
    // cover letter
    enterprise_name_kh: m.enterprise_name_kh,
    enterprise_name_en: m.enterprise_name_en,
    letter_no: or(extra.letter_no, DOTS(45)),
    period_month_name_kh: KM[mo - 1],
    period_year_kh: kh(y),
    period_start_day_kh: kh('01'),
    period_end_day_kh: kh(lastDay),
    licence_no: m.licence_no,
    licence_valid_day_kh: kh(vd),
    licence_valid_month_kh: vm ? KM[Number(vm) - 1] : '',
    licence_valid_year_kh: kh(vy),
    licence_valid_to_kh: kh(dmy(m.licence_valid_to)),
    decision_no: or(extra.decision_no, DOTS(30)),
    decision_day_kh: or(kh(dd), DOTS(9)),
    decision_month_kh: dm ? KM[Number(dm) - 1] : DOTS(12),
    decision_year_kh: or(kh(dy), DOTS(14)),
    total_m_kh: kh(total.m), total_i_kh: kh(total.i), total_r_kh: kh(total.r),
    provinces_kh: provinces.length ? provinces.join(' ') : (isNil ? '—' : DOTS(40)),
    chk_nil: BOX(isNil),
    lunar_date_line: or(extra.lunar_date_line, 'ថ្ងៃ.................. ខែ............... ឆ្នាំ............... ព.ស.............'),
    signed_place_kh: or(extra.signed_place, DOTS(20)),
    signed_day_kh: kh(signed.day),
    signed_month_kh: KM[signed.month],
    signed_year_kh: kh(signed.year),

    // Part 1
    registration_no: m.registration_no,
    operating_address: m.operating_address,
    contact_line: [m.contact?.name, m.contact?.position, m.contact?.phone, m.contact?.email].filter(Boolean).join(', '),
    chk_lt_manuf: BOX(m.licence_type === 'MANUF_INSTALL'),
    chk_lt_repair: BOX(m.licence_type === 'REPAIR'),
    chk_regular: BOX(m.report_type === 'REGULAR'),
    chk_amendment: BOX(m.report_type === 'AMENDMENT'),
    original_report_id: m.report_type === 'AMENDMENT' ? m.original_report_id : DOTS(17),

    // Part 2
    ...flat,
    other_category_label: others.length ? `(${others.join(', ')})` : '(សូមបញ្ជាក់)....................',
    co_total: co.length, co_passed: coCount('PASSED'), co_failed: coCount('FAILED'), co_pending: coCount('PENDING'),

    // Parts 3, 3A, 4, 5 (loops: an empty array prints the "គ្មាន | None" row)
    instruments: ins.map((x, i) => ({
      no: i + 1,
      op_code_kh: x.op_code === 'M' ? 'ផ' : 'ដ',
      instrument_name: [x.instrument_name, x.category === 'OTHER' ? x.category_other : ''].filter(Boolean).join(' – '),
      model: x.model,
      serial_no: x.serial_no,
      manufacturer_country: [x.manufacturer, x.country].filter(Boolean).join(' / '),
      metrology_spec: [
        [x.max, x.min, x.e].filter((v: any) => v !== '' && v != null).join(' / '),
        x.unit,
        x.accuracy_class,
      ].filter(Boolean).join(' '),
      type_approval_no: x.type_approval_no,
      completion_date: dmy(x.completion_date),
      customer_name: x.customer_name || '',
      location: loc(x),
      label_qr_no: x.label_qr_no,
      verification_text: VTXT(x.verification_status, x.verification_cert_no, x.verification_date),
    })),
    modules: mods.map((x, i) => ({
      no: i + 1,
      host_serial_no: x.host_serial_no,
      part_kh: x.part === 'P4' ? '៤' : '៣',
      module_name: x.module_name,
      model: x.model,
      serial_no: x.serial_no,
      range_e: x.range_e || '',
      manufacturer: x.manufacturer,
      country: x.country,
      cert_no: x.cert_no,
      new_or_replacement_kh: x.new_or_replacement === 'REPLACEMENT' ? 'ជំនួស' : 'ថ្មី',
    })),
    repairs: reps.map((x, i) => ({
      no: i + 1,
      instrument_model: [x.instrument_name, x.model].filter(Boolean).join(' '),
      serial_no: x.serial_no,
      customer_name: x.customer_name,
      location: loc(x),
      repair_period: `${dmy(x.repair_from)} – ${dmy(x.repair_to)}`,
      repair_description: x.repair_description,
      seal_removed_no: x.seal_broken ? x.seal_removed_no : '—',
      notification_no: x.seal_broken ? x.notification_no : '—',
      technician: x.technician,
      verification_text: VTXT(x.verification_status, x.verification_cert_no, x.verification_date),
    })),
    standards: stds.map((x, i) => ({
      no: i + 1,
      equipment: x.equipment,
      serial_no: x.serial_no,
      class_range: x.class_range || '',
      cal_cert_no: x.cal_cert_no,
      lab: x.lab,
      due_date: dmy(x.due_date),
      status_kh: STD_KH[x.status] || x.status,
    })),

    // Part 6
    ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => {
      const e = ev[`e6_${n}`] || {};
      return [
        [`e6_${n}_yes`, BOX(e.yes === true)],
        [`e6_${n}_no`, BOX(e.yes === false)],
        [`e6_${n}_details`, e.yes ? (e.details || '') : ''],
      ];
    })),

    // Part 7 & NMC box
    preparer_name: or(extra.preparer_name ?? m.contact?.name, DOTS(40)),
    preparer_position: or(extra.preparer_position ?? m.contact?.position, DOTS(39)),
    legal_rep_name: or(extra.legal_rep_name, DOTS(40)),
    received_date_kh: extra.received_at ? kh(dmy(extra.received_at.slice(0, 10))) : '....../....../.........',
    report_id: or(extra.report_id, DOTS(21)),
    chk_on_time: BOX(extra.on_time === true),
    chk_late: BOX(extra.on_time === false),
  };
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Thrown when the template could not be loaded; carries a Khmer message for the UI. */
export class Annex8TemplateError extends Error {
  readonly kh = 'មិនអាចទាញយកទម្រង់ឯកសារផ្លូវការបានទេ';
}

/** Thrown when docxtemplater rejected the data; its message names the tag. */
export class Annex8RenderError extends Error {
  readonly kh = 'មិនអាចបំពេញទម្រង់ឯកសារផ្លូវការបានទេ';
}

/** Loads the template from public/. Cached by the browser like any static asset. */
export async function fetchAnnex8Template(
  version = DEFAULT_TEMPLATE_VERSION,
): Promise<ArrayBuffer> {
  const url = templateUrlFor(version);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err: any) {
    throw new Annex8TemplateError(`Could not fetch ${url}: ${err?.message || err}`);
  }
  if (!res.ok) throw new Annex8TemplateError(`${url} returned HTTP ${res.status}.`);

  const buf = await res.arrayBuffer();
  // A missing file under a SPA rewrite comes back as index.html, not a 404.
  const sig = new Uint8Array(buf.slice(0, 2));
  if (sig[0] !== 0x50 || sig[1] !== 0x4b) {
    throw new Annex8TemplateError(
      `${url} is not a .docx (ZIP) file — it returned ${buf.byteLength} bytes starting with `
      + `0x${sig[0]?.toString(16)}${sig[1]?.toString(16)}. Check that public/templates/ is deployed.`,
    );
  }
  return buf;
}

/**
 * Fills the template and returns the docxtemplater document, so the caller can
 * ask its zip for a Blob (browser) or a nodebuffer (the check scripts). One
 * implementation, so a script can never render differently from the app.
 */
export function fillAnnex8Template(
  template: ArrayBuffer | Uint8Array,
  payload: any,
  extra: Annex8Extra = {},
): any {
  const data = buildAnnex8Data(payload, extra);
  try {
    const doc = new Docxtemplater(new PizZip(template as any), {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',           // unknown/missing value -> empty, never "undefined"
    });
    doc.render(data);                 // throws with the tag name if the template is broken
    return doc;
  } catch (err: any) {
    // docxtemplater puts the offending tags in err.properties.errors.
    const detail = (err?.properties?.errors || [])
      .map((e: any) => e?.properties?.explanation || e?.message)
      .filter(Boolean)
      .join('; ');
    throw new Annex8RenderError(detail || err?.message || String(err));
  }
}

/** Fills the template and returns the .docx as a Blob. */
export async function renderAnnex8Docx(
  payload: any,
  extra: Annex8Extra = {},
  options: { version?: string; template?: ArrayBuffer } = {},
): Promise<Blob> {
  const version = options.version || DEFAULT_TEMPLATE_VERSION;
  const template = options.template || (await fetchAnnex8Template(version));
  const doc = fillAnnex8Template(template, payload, extra);
  return doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

/** Annex8_<licence_no>_<YYYY-MM>_<report_id or draft>.docx */
export function annex8FileName(payload: any, extra: Annex8Extra = {}): string {
  const safe = (v: unknown) => String(v ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const id = safe(extra.report_id || payload?.meta?.report_id) || 'draft';
  return `Annex8_${safe(payload?.meta?.licence_no)}_${safe(payload?.meta?.period_month)}_${id}.docx`;
}

/** Fills the template and triggers a download. Returns the file name used. */
export async function downloadAnnex8Docx(
  payload: any,
  extra: Annex8Extra = {},
  options: { version?: string; fileName?: string } = {},
): Promise<string> {
  const blob = await renderAnnex8Docx(payload, extra, { version: options.version });
  const fileName = options.fileName || annex8FileName(payload, extra);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: Safari needs the object URL alive until the download starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return fileName;
}

/* ------------------------------------------------------------------ *
 * Tag inspection (used by the tag check in scripts/)
 * ------------------------------------------------------------------ */

/** Lists every tag in a template buffer. */
export function listTags(template: ArrayBuffer | Uint8Array): string[] {
  const xml = (new PizZip(template as any).file('word/document.xml') as any)
    .asText().replace(/<[^>]+>/g, '');
  return [...new Set([...xml.matchAll(/\{([#^/]?)([a-z0-9_]+)\}/gi)].map((m: any) => m[1] + m[2]))];
}

/**
 * Keys that only exist inside a loop item, so a tag check must not expect them
 * among buildAnnex8Data's top-level keys.
 */
export const LOOP_ITEM_KEYS = [
  'no', 'op_code_kh', 'instrument_name', 'model', 'serial_no', 'manufacturer_country', 'metrology_spec',
  'type_approval_no', 'completion_date', 'customer_name', 'location', 'label_qr_no', 'verification_text',
  'host_serial_no', 'part_kh', 'module_name', 'range_e', 'manufacturer', 'country', 'cert_no',
  'new_or_replacement_kh', 'instrument_model', 'repair_period', 'repair_description', 'seal_removed_no',
  'notification_no', 'technician', 'equipment', 'class_range', 'cal_cert_no', 'lab', 'due_date', 'status_kh',
];

/** The loop arrays are consumed by {#…} sections rather than printed as a value. */
export const LOOP_ARRAY_KEYS = ['instruments', 'modules', 'repairs', 'standards'];
