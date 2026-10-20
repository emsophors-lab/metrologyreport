import fs from 'node:fs';
import path from 'node:path';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import { dataProblems, TEMPLATE_SHA256 } from '../lib/consolidated/contract';
import { fillConsolidatedTemplate } from '../lib/consolidated/consolidatedDocx';
import { renderOfficialDocx, loadAnnex8RenderInput } from '../annex8/officialDocument';
import { fillAnnex8Template } from '../lib/annex8/annex8Docx';
import { buildSearchDocx, buildSearchPrintHtml, buildSearchXlsx } from '../annex8/searchExports';
import { issueReportArtifact, sealHtml, sha256, escapeHtml } from './issuance';
import type { IssuanceDetails, ReportSeal } from './issuance';
import { sealDocx, sealPdf, sealXlsx } from './sealArtifacts';

export class IssuedExportError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const requireStaff = (scope: string[] | null) => { if (scope !== null) throw new IssuedExportError(403, 'NMC staff access required.'); };
const text = (value: unknown, max = 500) => String(value ?? '').slice(0, max);
const allowedLicence = (scope: string[] | null, licence: string) => {
  if (scope !== null && !scope.includes(licence)) throw new IssuedExportError(403, 'This licence belongs to another enterprise.');
};
const validRows = (value: unknown): value is any[] => Array.isArray(value) && value.length <= 5000;

async function selectedRows(db: any, table: string, ids: unknown, scope: string[] | null, licenceColumn: string, key = 'id') {
  if (!validRows(ids) || ids.some((id: unknown) => typeof id !== 'string' || id.length > 190)) throw new IssuedExportError(400, 'Invalid selected records.');
  const unique = [...new Set(ids)] as string[];
  const rows: any[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    let query = db.from(table).select('*').in(key, unique.slice(i, i + 100));
    if (scope !== null) query = query.in(licenceColumn, scope);
    const { data, error } = await query;
    if (error) throw new Error('Report source could not be read.');
    rows.push(...data || []);
  }
  if (unique.some(id => !rows.some(row => String(row[key]) === id))) throw new IssuedExportError(403, 'Some selected records are unavailable or outside your licence.');
  return unique.flatMap(id => rows.filter(row => String(row[key]) === id));
}

async function basicTable(headers: string[], values: unknown[][], title: string, format: string) {
  if (format === 'xlsx') {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Report');
    sheet.addRows([headers, ...values]); sheet.columns.forEach(column => { column.width = 25; });
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  if (format === 'html') return Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px 'Khmer OS Battambang',Arial}table{width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px;overflow-wrap:anywhere}tr{break-inside:avoid}</style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${values.map(row => `<tr>${row.map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  if (format !== 'docx') throw new IssuedExportError(400, 'Unsupported report format.');
  const paragraph = (value: unknown) => new Paragraph({ children: [new TextRun({ text: text(value, 10000), font: 'Khmer OS Battambang', size: 18 })] });
  return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: [paragraph(title), new Table({
    rows: [headers, ...values].map(row => new TableRow({ children: row.map(cell => new TableCell({ children: [paragraph(cell)] })) })),
  })] }] })));
}

/** Render known report kinds, never sign a caller-supplied file or arbitrary HTML. */
export async function createIssuedExport(db: any, issuer: string, scope: string[] | null, request: any) {
  if (!request || !['docx', 'pdf', 'xlsx', 'html', 'pptx'].includes(request.format)) throw new IssuedExportError(400, 'Invalid report format.');
  const details: IssuanceDetails = { kind: text(request.kind, 64), format: request.format, title: '', issuer,
    basis: 'database', snapshot: {}, company: '', licence: '', period: '',
  };
  let render: (seal: ReportSeal) => Promise<Buffer>;
  if (request.kind === 'consolidated') {
    requireStaff(scope);
    if (request.format !== 'docx' || dataProblems(request.data).length) throw new IssuedExportError(400, 'Invalid consolidated report.');
    const file = ['dist', 'public'].map(dir => path.join(process.cwd(), dir, 'templates/Consolidated_template_v1.docx')).find(file => fs.existsSync(file));
    if (!file) throw new Error('The approved consolidated template is missing.');
    const template = fs.readFileSync(file);
    if (sha256(template) !== TEMPLATE_SHA256) throw new Error('The approved template hash does not match.');
    details.title = 'NMC Consolidated Report'; details.period = text(request.data.period_label_kh, 190);
    details.basis = request.sample ? 'draft' : 'staff-prepared'; details.snapshot = request.data;
    render = async () => fillConsolidatedTemplate(template, request.data).getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } else if (request.kind === 'annex8') {
    if (!['docx', 'html'].includes(request.format)) throw new IssuedExportError(400, 'Invalid Annex 8 format.');
    const input = await loadAnnex8RenderInput(db, text(request.id, 190));
    if (!input) throw new IssuedExportError(404, 'Report not found.');
    allowedLicence(scope, input.report.licence_no);
    Object.assign(details, { title: 'NMC Monthly Report', licence: input.report.licence_no,
      period: input.report.period_month, company: input.payload.meta?.enterprise_name_kh || '',
      basis: ['OPEN', 'DRAFT'].includes(input.report.status) ? 'draft' : 'database', snapshot: input,
    });
    render = async () => {
      if (request.format === 'docx') return renderOfficialDocx(input);
      const parts = ['part3_instruments', 'part3a_modules', 'part4_repairs', 'part5_standards', 'carry_over_updates'].map(key => {
        const rows = (input.payload as any)[key] || [];
        return `<h2>${escapeHtml(key)}</h2>${rows.map((row: any, index: number) => `<h3>${index + 1}</h3><table><tbody>${Object.entries(row).map(([field, value]) => `<tr><th>${escapeHtml(field)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>`).join('')}`;
      });
      const metadata = Object.entries(input.payload.meta || {}).map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</td></tr>`).join('');
      return Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>NMC Monthly Report Print View</title><style>@page{size:A4;margin:12mm}body{font:12px Arial}table{border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:12px}td,th{border:1px solid #999;padding:4px;overflow-wrap:anywhere;text-align:left}th{width:30%}h2,h3{break-after:avoid}</style></head><body><h1>NMC Monthly Report Print View</h1><p>${escapeHtml(details.licence)} / ${escapeHtml(details.period)}</p><table>${metadata}</table>${parts.join('')}<h2>Events</h2><p>${escapeHtml(JSON.stringify((input.payload as any).part6_events || {}))}</p></body></html>`);
    };
  } else if (request.kind === 'annex8-draft') {
    const state = request.state;
    const parts = request.format === 'docx' ? ['part3_instruments', 'part3a_modules', 'part4_repairs', 'part5_standards']
      : ['instruments', 'modules', 'repairs', 'standards'];
    if (!state?.meta?.licence_no || !parts.every(key => validRows(state[key]))) throw new IssuedExportError(400, 'Invalid report draft.');
    allowedLicence(scope, String(state.meta.licence_no));
    Object.assign(details, { title: 'NMC Monthly Report Draft', basis: 'draft', licence: text(state.meta.licence_no, 190),
      company: text(state.meta.enterprise_name_kh), period: text(state.meta.period_month, 190), snapshot: { state, extra: request.extra || {} } });
    if (request.format === 'docx') render = async () => {
      const file = ['dist', 'public'].map(dir => path.join(process.cwd(), dir, 'templates/Annex8_template_v1.docx')).find(file => fs.existsSync(file));
      if (!file) throw new Error('The approved Annex 8 template is missing.');
      return fillAnnex8Template(fs.readFileSync(file), state, request.extra || {}).getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    };
    else if (request.format === 'xlsx') render = async () => {
      const { exportAnnex8Excel } = await import('../annex8/exports');
      return Buffer.from(await exportAnnex8Excel(state, true) as ArrayBuffer);
    };
    else throw new IssuedExportError(400, 'Unsupported draft format.');
  } else if (request.kind === 'search') {
    if (request.keys !== undefined && (!validRows(request.keys) || request.keys.some((key: unknown) => typeof key !== 'string')))
      throw new IssuedExportError(400, 'Invalid search keys.');
    if (request.context?.filters !== undefined && (!Array.isArray(request.context.filters)
      || request.context.filters.some((row: unknown) => !Array.isArray(row) || row.length !== 2)))
      throw new IssuedExportError(400, 'Invalid search filters.');
    const rows = await selectedRows(db, 'annex8_activity_union', request.ids, scope, 'licence_no', 'row_id');
    const wanted = new Set((request.keys || []).map(String));
    const selected = wanted.size ? rows.filter(row => wanted.has(`${row.format_version}/${row.row_id}`)) : rows;
    if (wanted.size && selected.length !== wanted.size) throw new IssuedExportError(409, 'Search results changed; reload before exporting.');
    const context = { truncated: !!request.context?.truncated, filters: (request.context?.filters || []).slice(0, 20).map((row: any) => [text(row[0], 100), text(row[1], 300)] as [string, string]) };
    details.title = 'NMC Instrument Search Report'; details.snapshot = { rows: selected, context };
    if (scope !== null) details.licence = scope.join(', ');
    render = async () => request.format === 'docx' ? Buffer.from(await (await buildSearchDocx(selected, context)).arrayBuffer())
      : request.format === 'xlsx' ? Buffer.from(await buildSearchXlsx(selected, context))
        : request.format === 'html' ? Buffer.from(buildSearchPrintHtml(selected, context))
          : (() => { throw new IssuedExportError(400, 'Use the issued print view for this PDF.'); })();
  } else if (request.kind === 'legacy') {
    const rows = await selectedRows(db, 'reports', request.ids, scope, 'license_number');
    details.title = text(request.title || 'NMC Monthly Reports'); details.snapshot = rows;
    if (rows.some(row => row.report_status === 'Draft')) details.basis = 'draft';
    if (new Set(rows.map(row => row.license_number)).size === 1) {
      details.licence = text(rows[0].license_number, 190); details.company = text(rows[0].company_name_kh);
    }
    if (scope !== null) details.licence = scope.join(', ');
    const headers = ['Company', 'Licence', 'Customer', 'Address', 'Instrument', 'Serial', 'Scope', 'Spare parts', 'Spare serial', 'Service', 'Start', 'End', 'Month', 'Year'];
    const fields = ['company_name_kh', 'license_number', 'customer_name', 'customer_address', 'measuring_instrument', 'instrument_serial_number', 'scope_of_weight_measure', 'spare_parts', 'spare_part_serial_number', 'service_type', 'service_start_date', 'service_end_date', 'report_month', 'report_year'];
    render = () => basicTable(headers, rows.map(row => fields.map(key => row[key] ?? '')), details.title, request.format);
  } else if (request.kind === 'staff-workbook') {
    requireStaff(scope);
    if (request.format !== 'xlsx' || !Array.isArray(request.sheets) || !request.sheets.length || request.sheets.length > 30
      || request.sheets.some((sheet: any) => !validRows(sheet.rows) || sheet.rows.some((row: any) => !Array.isArray(row) || row.length > 100 || row.some((cell: any) => !['string', 'number', 'boolean'].includes(typeof cell) && cell !== null)))) throw new IssuedExportError(400, 'Invalid workbook snapshot.');
    details.title = text(request.title || 'NMC Staff Report'); details.basis = 'staff-prepared'; details.snapshot = request.sheets;
    render = async () => { const workbook = new ExcelJS.Workbook(); for (const sheet of request.sheets) {
      const target = workbook.addWorksheet(text(sheet.name, 31)); target.addRows(sheet.rows); target.columns.forEach(column => { column.width = 25; });
    } return Buffer.from(await workbook.xlsx.writeBuffer()); };
  } else if (request.kind === 'analytics') {
    requireStaff(scope);
    const data = request.data;
    if (!data || !['statusRows', 'provinceRows', 'serviceRows', 'instrumentRows', 'monthlyRows', 'riskRows', 'topRisks'].every(key => validRows(data[key])) || !['docx', 'pdf', 'pptx'].includes(request.format)) throw new IssuedExportError(400, 'Invalid analytics snapshot.');
    const { generateAnalyticsDocxReport, generateAnalyticsPdfReport, generateAnalyticsPptxBriefing } = await import('../utils/analyticsReportExports');
    if (data.reportDate) data.reportDate = new Date(data.reportDate);
    details.title = 'NMC Analytics Report'; details.basis = 'staff-prepared'; details.snapshot = data;
    render = async seal => request.format === 'docx' ? Buffer.from(await (await generateAnalyticsDocxReport(data, true) as Blob).arrayBuffer())
      : request.format === 'pptx' ? Buffer.from(await generateAnalyticsPptxBriefing(data, seal) as ArrayBuffer)
        : Buffer.from(await generateAnalyticsPdfReport(data, true) as ArrayBuffer);
  } else throw new IssuedExportError(400, 'Unsupported report kind.');
  return issueReportArtifact(db, details, async seal => {
    const bytes = await render(seal);
    if (request.format === 'pptx') return bytes;
    if (request.format === 'docx') return sealDocx(bytes, seal);
    if (request.format === 'pdf') return sealPdf(bytes, seal);
    if (request.format === 'xlsx') return sealXlsx(bytes, seal);
    return Buffer.from(bytes.toString('utf8').replace('<body>', `<body>${sealHtml(seal)}`));
  });
}
