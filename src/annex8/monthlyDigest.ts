/**
 * Monthly compliance digest — who sent NMC their Annex 8 report, and who did not.
 *
 * Once a month the system totals up every active licensee and reports to the
 * NMC Telegram group: how many submitted for the period, how many were on time
 * (ប្រការ២១ — by day 7), how many are still missing, and what the month's
 * activity across all enterprises adds up to.
 *
 * Pure logic, no database and no network, so the wording and the arithmetic can
 * be checked on their own. The server supplies the rows; this decides what the
 * message says.
 */

import { DEADLINE_DAY } from './constants';
import { khmerMonthLabel, toKhmerDigits } from './summary';

/** Cambodia is UTC+7 and does not observe daylight saving. */
export const CAMBODIA_OFFSET_MS = 7 * 60 * 60 * 1000;

export const cambodiaNow = (now: Date = new Date()) => new Date(now.getTime() + CAMBODIA_OFFSET_MS);

/** The period a digest sent today reports on: the month that has just ended. */
export function previousPeriod(now: Date = new Date()): string {
  const kh = cambodiaNow(now);
  const y = kh.getUTCFullYear();
  const m = kh.getUTCMonth();            // 0-based; month - 1 is the previous one
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES: Record<string, number> = {};
[
  ['january', 'jan', 'មករា'], ['february', 'feb', 'កុម្ភៈ'], ['march', 'mar', 'មីនា'],
  ['april', 'apr', 'មេសា'], ['may', 'may', 'ឧសភា'], ['june', 'jun', 'មិថុនា'],
  ['july', 'jul', 'កក្កដា'], ['august', 'aug', 'សីហា'], ['september', 'sep', 'កញ្ញា'],
  ['october', 'oct', 'តុលា'], ['november', 'nov', 'វិច្ឆិកា'], ['december', 'dec', 'ធ្នូ'],
].forEach((names, i) => names.forEach((n) => { MONTH_NAMES[n] = i + 1; }));

/**
 * Legacy `reports` rows carry a loose month string plus a separate year, and
 * the month may be a number, an English name or a Khmer name depending on how
 * the row was created. Getting this wrong would mark a compliant enterprise as
 * missing in an official digest, so names are resolved rather than ignored.
 */
export function normalizeLegacyPeriod(month?: string | null, year?: string | null): string {
  const raw = String(month || '').trim();
  const yyyy = String(year || '').match(/\d{4}/)?.[0];
  if (!raw || !yyyy) return '';

  let mm = raw.match(/\d{1,2}/)?.[0];
  if (!mm) {
    const lower = raw.toLowerCase();
    const hit = Object.keys(MONTH_NAMES).find((n) => lower.startsWith(n) || raw.startsWith(n));
    if (hit) mm = String(MONTH_NAMES[hit]);
  }
  if (!mm) return '';

  const n = Number(mm);
  if (!Number.isInteger(n) || n < 1 || n > 12) return '';
  return `${yyyy}-${String(n).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export interface DigestLicence {
  license_number: string;
  company_name_kh?: string | null;
  company_name?: string | null;
}

export interface DigestAnnex8Report {
  licence_no: string;
  report_id?: string | null;
  status?: string | null;
  on_time?: boolean | null;
  report_type?: string | null;
  submitted_at?: string | null;
  part2_summary?: any;
}

export interface DigestLegacyReport {
  license_number: string;
  report_month?: string | null;
  report_year?: string | null;
}

export interface DigestEntry {
  licence_no: string;
  name: string;
  report_id: string;
  on_time: boolean | null;
  /** A NIL report is a submission: the month simply had no activity. */
  nil: boolean;
  /** Counted from the frozen legacy form rather than Annex 8. */
  legacy: boolean;
}

export interface MonthlyDigest {
  period: string;
  deadline: string;
  licensees: number;
  submitted: DigestEntry[];
  onTime: DigestEntry[];
  late: DigestEntry[];
  missing: DigestEntry[];
  /** Submitted under the frozen legacy form, counted but flagged. */
  legacy: DigestEntry[];
  totals: { manufactured: number; installed: number; repaired: number; passed: number; failed: number; pending: number };
  complianceRate: number;
}

/* ------------------------------------------------------------------ *
 * Building the digest
 * ------------------------------------------------------------------ */

const nameOf = (l: DigestLicence) =>
  String(l.company_name_kh || l.company_name || l.license_number || '').trim() || l.license_number;

/** OPEN is incremental work, not a submission. Returned receipts still count. */
const isSubmitted = (r: DigestAnnex8Report) =>
  ['SUBMITTED', 'RETURNED', 'ACCEPTED'].includes(String(r.status || '').toUpperCase());

export function buildMonthlyDigest(input: {
  period: string;
  licences: DigestLicence[];
  annex8Reports: DigestAnnex8Report[];
  legacyReports?: DigestLegacyReport[];
}): MonthlyDigest {
  const { period, licences } = input;
  const activeLicences = new Set(licences.map(l => String(l.license_number || '').trim()));

  const byLicence = new Map<string, DigestAnnex8Report>();
  for (const r of input.annex8Reports) {
    if (!isSubmitted(r)) continue;
    const key = String(r.licence_no || '').trim();
    if (!key || !activeLicences.has(key)) continue;
    // An amendment supersedes the original; keep the latest submission.
    const prev = byLicence.get(key);
    if (!prev || String(r.submitted_at || '') > String(prev.submitted_at || '')) byLicence.set(key, r);
  }

  const legacyLicences = new Set(
    (input.legacyReports || [])
      .filter((r) => normalizeLegacyPeriod(r.report_month, r.report_year) === period)
      .map((r) => String(r.license_number || '').trim())
      .filter(Boolean),
  );

  const submitted: DigestEntry[] = [];
  const missing: DigestEntry[] = [];
  const legacy: DigestEntry[] = [];

  for (const licence of licences) {
    const key = String(licence.license_number || '').trim();
    if (!key) continue;
    const report = byLicence.get(key);

    if (report) {
      const entry: DigestEntry = {
        licence_no: key,
        name: nameOf(licence),
        report_id: String(report.report_id || ''),
        on_time: report.on_time === null || report.on_time === undefined ? null : !!report.on_time,
        nil: String(report.report_type || '').toUpperCase() === 'NIL',
        legacy: false,
      };
      submitted.push(entry);
      continue;
    }

    if (legacyLicences.has(key)) {
      const entry: DigestEntry = {
        licence_no: key, name: nameOf(licence), report_id: '', on_time: null, nil: false, legacy: true,
      };
      submitted.push(entry);
      legacy.push(entry);
      continue;
    }

    missing.push({ licence_no: key, name: nameOf(licence), report_id: '', on_time: null, nil: false, legacy: false });
  }

  // Month totals, taken from the stored Part 2 of each submitted Annex 8 report.
  const totals = { manufactured: 0, installed: 0, repaired: 0, passed: 0, failed: 0, pending: 0 };
  for (const r of byLicence.values()) {
    const t = r.part2_summary?.total;
    if (!t) continue;
    for (const k of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[k] += Number(t[k]) || 0;
    }
  }

  const sortByName = (a: DigestEntry, b: DigestEntry) => a.name.localeCompare(b.name, 'km');
  submitted.sort(sortByName);
  missing.sort(sortByName);

  return {
    period,
    deadline: new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), DEADLINE_DAY)).toISOString().slice(0, 10),
    licensees: licences.length,
    submitted,
    onTime: submitted.filter((e) => e.on_time === true),
    late: submitted.filter((e) => e.on_time === false),
    missing,
    legacy,
    totals,
    complianceRate: licences.length ? Math.round((submitted.length / licences.length) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ *
 * The Telegram message
 * ------------------------------------------------------------------ */

/** Telegram rejects a sendMessage body over 4096 characters. */
export const TELEGRAM_LIMIT = 4096;

/** A document caption is limited to 1024 characters, not 4096. */
export const TELEGRAM_CAPTION_LIMIT = 1024;

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

const khNum = (n: number) => toKhmerDigits(String(n));

/** `2026-09` → `កញ្ញា ឆ្នាំ២០២៦` (khmerMonthLabel already carries the year). */
const periodLabel = (period: string) => khmerMonthLabel(period);

/**
 * Splits a list of lines into Telegram-sized messages, repeating the given
 * heading on each continuation so a long roll call still reads correctly.
 */
function chunk(header: string, lines: string[], continued: string): string[] {
  if (!lines.length) return [];
  const out: string[] = [];
  let current = header;

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > TELEGRAM_LIMIT - 64) {
      out.push(current);
      current = `${continued}\n${line}`;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

/**
 * Renders the digest as one or more Telegram messages (HTML parse mode).
 * The summary always comes first and always fits in a single message, so the
 * headline numbers are readable even when the name lists run long.
 */
export function renderDigestMessages(d: MonthlyDigest): string[] {
  const label = periodLabel(d.period);
  const t = d.totals;

  const summary = [
    `📊 <b>របាយការណ៍សង្ខេបប្រចាំខែ ${esc(label)}</b>`,
    `<i>Monthly Annex 8 compliance summary · ${esc(d.period)}</i>`,
    '',
    `សហគ្រាសមានអាជ្ញាប័ណ្ណសរុប៖ <b>${khNum(d.licensees)}</b>`,
    `✅ បានដាក់ជូនរបាយការណ៍៖ <b>${khNum(d.submitted.length)}</b> (${khNum(d.complianceRate)}%)`,
    `   • ទាន់ពេល (មុនថ្ងៃទី${khNum(DEADLINE_DAY)})៖ <b>${khNum(d.onTime.length)}</b>`,
    `   • យឺត (ប្រការ២១)៖ <b>${khNum(d.late.length)}</b>`,
    `❌ មិនទាន់ដាក់ជូន៖ <b>${khNum(d.missing.length)}</b>`,
    '',
    `<b>សកម្មភាពសរុបក្នុងខែ</b>`,
    `ផលិត ${khNum(t.manufactured)} · ដំឡើង ${khNum(t.installed)} · ជួសជុល ${khNum(t.repaired)}`,
    `ជាប់ ${khNum(t.passed)} · ធ្លាក់ ${khNum(t.failed)} · រង់ចាំ ${khNum(t.pending)}`,
  ];

  if (d.legacy.length) {
    summary.push(
      '',
      `<i>ក្នុងនោះ ${khNum(d.legacy.length)} ប្រើទម្រង់ចាស់ / submitted on the frozen legacy form</i>`,
    );
  }

  const messages = [summary.join('\n')];

  if (d.missing.length) {
    const lines = d.missing.map((e, i) =>
      `${khNum(i + 1)}. ${esc(e.name)} — <code>${esc(e.licence_no)}</code>`);
    messages.push(...chunk(
      `❌ <b>សហគ្រាសមិនទាន់ដាក់ជូនរបាយការណ៍ ${esc(label)}</b>\n<i>Not yet submitted (${d.missing.length})</i>\n`,
      lines,
      `❌ <i>បន្ត / continued</i>\n`,
    ));
  }

  if (d.late.length) {
    const lines = d.late.map((e, i) =>
      `${khNum(i + 1)}. ${esc(e.name)} — <code>${esc(e.report_id || e.licence_no)}</code>`);
    messages.push(...chunk(
      `⏰ <b>ដាក់ជូនយឺត ${esc(label)}</b>\n<i>Submitted after day ${DEADLINE_DAY} (${d.late.length})</i>\n`,
      lines,
      `⏰ <i>បន្ត / continued</i>\n`,
    ));
  }

  if (d.submitted.length) {
    const lines = d.submitted.map((e, i) => {
      const marks = [
        e.on_time === true ? '✅' : e.on_time === false ? '⏰' : '•',
        e.nil ? '(គ្មានសកម្មភាព)' : '',
        e.legacy ? '(ទម្រង់ចាស់)' : '',
      ].filter(Boolean).join(' ');
      return `${khNum(i + 1)}. ${marks} ${esc(e.name)}${e.report_id ? ` — <code>${esc(e.report_id)}</code>` : ''}`;
    });
    messages.push(...chunk(
      `✅ <b>សហគ្រាសដែលបានដាក់ជូនរបាយការណ៍ ${esc(label)}</b>\n<i>Submitted (${d.submitted.length})</i>\n`,
      lines,
      `✅ <i>បន្ត / continued</i>\n`,
    ));
  }

  return messages;
}

/* ------------------------------------------------------------------ *
 * The PDF attachment
 * ------------------------------------------------------------------ */

/** Annex8_Digest_<YYYY-MM>.pdf */
export const digestFileName = (period: string) => `NMC_Monthly_Report_Digest_${period}.pdf`;

/**
 * The digest as a printable HTML page, converted to PDF by Gotenberg's
 * Chromium so Khmer shapes correctly.
 *
 * This is NOT the official Annex 8 — that one is only ever produced by filling
 * the Word template, and its layout must never be built in code. This is an
 * internal NMC summary of who reported, so an ordinary styled page is the right
 * thing and carries no template obligation.
 */
export function renderDigestHtml(d: MonthlyDigest): string {
  const label = periodLabel(d.period);
  const t = d.totals;

  const row = (e: DigestEntry, i: number) => {
    const status = e.on_time === true
      ? '<span class="ok">ទាន់ពេល</span>'
      : e.on_time === false
        ? '<span class="late">យឺត</span>'
        : '<span class="muted">—</span>';
    const notes = [e.nil ? 'គ្មានសកម្មភាព' : '', e.legacy ? 'ទម្រង់ចាស់' : ''].filter(Boolean).join(', ');
    return `<tr><td class="n">${khNum(i + 1)}</td><td>${esc(e.name)}</td>`
      + `<td class="mono">${esc(e.licence_no)}</td><td class="mono">${esc(e.report_id || '—')}</td>`
      + `<td>${status}</td><td>${esc(notes || '—')}</td></tr>`;
  };

  const missingRow = (e: DigestEntry, i: number) =>
    `<tr><td class="n">${khNum(i + 1)}</td><td>${esc(e.name)}</td><td class="mono">${esc(e.licence_no)}</td></tr>`;

  const section = (title: string, sub: string, head: string, body: string, count: number) => count
    ? `<h2>${title} <span class="count">${khNum(count)}</span></h2>
       <p class="sub">${sub}</p>
       <table><thead>${head}</thead><tbody>${body}</tbody></table>`
    : '';

  return `<!doctype html>
<html lang="km"><head><meta charset="utf-8">
<title>${esc(digestFileName(d.period))}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  body { font-family: "Khmer OS Siemreap", "Noto Sans Khmer", sans-serif; color: #0B1A35; font-size: 10pt; margin: 0; }
  h1 { font-family: "Khmer OS Muol Light", "Khmer OS Siemreap", serif; font-size: 14pt; text-align: center; margin: 0 0 2mm; color: #0B1A35; }
  .en { text-align: center; font-size: 9pt; color: #5b6b85; margin: 0 0 6mm; }
  h2 { font-size: 11pt; margin: 7mm 0 1mm; border-bottom: 1.5pt solid #C9A227; padding-bottom: 1mm; }
  h2 .count { background: #0B1A35; color: #fff; border-radius: 9pt; padding: 0 2.5mm; font-size: 9pt; }
  .sub { font-size: 8.5pt; color: #5b6b85; margin: 0 0 2mm; }
  .cards { display: flex; gap: 3mm; margin-bottom: 4mm; }
  .card { flex: 1; border: .8pt solid #d7deea; border-top: 2.5pt solid #C9A227; border-radius: 2mm; padding: 2.5mm; text-align: center; }
  .card .v { font-size: 15pt; font-weight: 700; display: block; }
  .card .l { font-size: 7.5pt; color: #5b6b85; }
  .card.good .v { color: #166534; } .card.bad .v { color: #b91c1c; }
  table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  th, td { border: .5pt solid #c8d2e2; padding: 1.2mm 1.8mm; text-align: left; vertical-align: top; }
  th { background: #eef2f8; font-size: 8pt; }
  td.n, th.n { text-align: center; width: 9mm; }
  .mono { font-family: "DejaVu Sans Mono", monospace; font-size: 7.5pt; }
  .ok { color: #166534; } .late { color: #b45309; } .muted { color: #94a3b8; }
  .totals td { text-align: center; }
  footer { margin-top: 7mm; border-top: .5pt solid #c8d2e2; padding-top: 2mm; font-size: 7.5pt; color: #5b6b85; text-align: center; }
  tr { page-break-inside: avoid; }
</style></head><body>

<h1>របាយការណ៍សង្ខេបប្រចាំខែ ${esc(label)}</h1>
<p class="en">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ · National Metrology Center<br>
Monthly Annex 8 compliance summary · ${esc(d.period)}</p>

<div class="cards">
  <div class="card"><span class="v">${khNum(d.licensees)}</span><span class="l">សហគ្រាសមានអាជ្ញាប័ណ្ណ</span></div>
  <div class="card good"><span class="v">${khNum(d.submitted.length)}</span><span class="l">បានដាក់ជូន (${khNum(d.complianceRate)}%)</span></div>
  <div class="card"><span class="v">${khNum(d.onTime.length)}</span><span class="l">ទាន់ពេល</span></div>
  <div class="card"><span class="v">${khNum(d.late.length)}</span><span class="l">យឺត (ប្រការ២១)</span></div>
  <div class="card bad"><span class="v">${khNum(d.missing.length)}</span><span class="l">មិនទាន់ដាក់ជូន</span></div>
</div>

<h2>សកម្មភាពសរុបក្នុងខែ</h2>
<p class="sub">Combined activity reported by all enterprises</p>
<table class="totals"><thead><tr>
  <th>ផលិត</th><th>ដំឡើង</th><th>ជួសជុល</th><th>ជាប់</th><th>ធ្លាក់</th><th>រង់ចាំ</th>
</tr></thead><tbody><tr>
  <td>${khNum(t.manufactured)}</td><td>${khNum(t.installed)}</td><td>${khNum(t.repaired)}</td>
  <td>${khNum(t.passed)}</td><td>${khNum(t.failed)}</td><td>${khNum(t.pending)}</td>
</tr></tbody></table>

${section('សហគ្រាសមិនទាន់ដាក់ជូនរបាយការណ៍', 'Not yet submitted',
  '<tr><th class="n">ល.រ</th><th>សហគ្រាស</th><th>លេខអាជ្ញាប័ណ្ណ</th></tr>',
  d.missing.map(missingRow).join(''), d.missing.length)}

${section('សហគ្រាសដែលបានដាក់ជូនរបាយការណ៍', 'Submitted',
  '<tr><th class="n">ល.រ</th><th>សហគ្រាស</th><th>លេខអាជ្ញាប័ណ្ណ</th><th>លេខរបាយការណ៍</th><th>ស្ថានភាព</th><th>កំណត់សម្គាល់</th></tr>',
  d.submitted.map(row).join(''), d.submitted.length)}

<footer>
  កាលបរិច្ឆេទចេញរបាយការណ៍៖ ${esc(new Date(Date.now() + CAMBODIA_OFFSET_MS).toISOString().slice(0, 10))} ·
  ផុតកំណត់ដាក់ជូន៖ ថ្ងៃទី${khNum(DEADLINE_DAY)} · Generated automatically by MLRS
</footer>
</body></html>`;
}

/** The caption that goes with the PDF; kept inside Telegram's 1024 limit. */
export function renderDigestCaption(d: MonthlyDigest): string {
  const full = renderDigestMessages(d)[0];
  if (full.length <= TELEGRAM_CAPTION_LIMIT) return full;
  return `${full.slice(0, TELEGRAM_CAPTION_LIMIT - 24)}\n<i>…</i>`;
}
