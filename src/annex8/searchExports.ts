import { CATEGORIES } from './constants';

export interface ActivityRow {
  format_version: string;
  row_id: string;
  licence_no: string;
  company_name_kh: string;
  category: string | null;
  instrument_name: string;
  serial_no: string;
  customer_name: string;
  province: string | null;
  op_code: string;
  activity_date: string | null;
  verification_status: string | null;
  report_month: string;
  report_year: string;
}

export interface SearchExportContext {
  filters: Array<[string, string]>;
  truncated: boolean;
}

const TITLE = 'របាយការណ៍លទ្ធផលស្វែងរកឧបករណ៍';
const HEADERS = ['ល.រ', 'សហគ្រាស / អាជ្ញាប័ណ្ណ', 'អតិថិជន / ទីតាំង', 'ឧបករណ៍ / ប្រភេទ',
  'លេខស៊េរី', 'សេវាកម្ម', 'លទ្ធផល', 'ថ្ងៃធ្វើសេវាកម្ម', 'ខែ / ឆ្នាំ'];
const SERVICE: Record<string, string> = { M: 'ផលិត', I: 'តម្លើង', R: 'ជួសជុល' };
const RESULT: Record<string, string> = { PASSED: 'ជាប់', FAILED: 'ធ្លាក់', PENDING: 'រង់ចាំ' };
const value = (v: unknown) => String(v ?? '').trim() || '-';
const category = (r: ActivityRow) => CATEGORIES[r.category as keyof typeof CATEGORIES]?.kh || r.category || '';
const generatedAt = () => new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', hour12: false });
const fileName = (ext: string) => `NMC_report_search_${new Date().toISOString().slice(0, 10)}.${ext}`;
const summary = (rows: ActivityRow[]) => {
  const count = (key: keyof ActivityRow, v: string) => rows.filter(r => r[key] === v).length;
  return `សរុប ${rows.length} · សហគ្រាស ${new Set(rows.map(r => r.licence_no).filter(Boolean)).size}`
    + ` · ផលិត ${count('op_code', 'M')} · តម្លើង ${count('op_code', 'I')} · ជួសជុល ${count('op_code', 'R')}`
    + ` · ជាប់ ${count('verification_status', 'PASSED')} · ធ្លាក់ ${count('verification_status', 'FAILED')}`
    + ` · រង់ចាំ ${count('verification_status', 'PENDING')}`;
};
const detailRows = (rows: ActivityRow[]) => rows.map((r, i) => [
  String(i + 1), `${value(r.company_name_kh)}\n${value(r.licence_no)}`,
  `${value(r.customer_name)}\n${value(r.province)}`,
  [value(r.instrument_name), category(r)].filter(Boolean).join('\n'),
  value(r.serial_no), SERVICE[r.op_code] || value(r.op_code),
  RESULT[r.verification_status || ''] || '-', value(r.activity_date),
  `${value(r.report_month)} / ${value(r.report_year)}`,
]);
const limitNote = 'លទ្ធផលត្រូវបានកំណត់ចំនួន។ ឯកសារនេះមានតែទិន្នន័យដែលបានផ្ទុក។ / Limited results: this file includes only the loaded rows.';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function buildSearchXlsx(rows: ActivityRow[], context: SearchExportContext) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const metadata = XLSX.utils.aoa_to_sheet([
    [TITLE], ['National Metrology Center'], ['បង្កើតនៅ / Generated (GMT+7)', generatedAt()],
    ...context.filters, [], [summary(rows)], ...(context.truncated ? [[limitNote]] : []),
  ]);
  metadata['!cols'] = [{ wch: 36 }, { wch: 75 }];
  XLSX.utils.book_append_sheet(workbook, metadata, 'Summary');
  const data = XLSX.utils.aoa_to_sheet([
    ['ល.រ', 'សហគ្រាស', 'លេខអាជ្ញាប័ណ្ណ', 'អតិថិជន', 'ទីតាំង', 'ឧបករណ៍', 'ប្រភេទឧបករណ៍',
      'លេខស៊េរី', 'ប្រភេទសេវាកម្ម', 'លទ្ធផល', 'ថ្ងៃធ្វើសេវាកម្ម', 'ខែ', 'ឆ្នាំ', 'កំណែទម្រង់'],
    ...rows.map((r, i) => [i + 1, r.company_name_kh, r.licence_no, r.customer_name, r.province || '',
      r.instrument_name, category(r), r.serial_no, SERVICE[r.op_code] || r.op_code,
      RESULT[r.verification_status || ''] || '', r.activity_date || '', r.report_month, r.report_year, r.format_version]),
  ]);
  data['!cols'] = [6, 35, 24, 30, 22, 32, 28, 24, 18, 14, 20, 8, 8, 18].map(wch => ({ wch }));
  data['!autofilter'] = { ref: data['!ref']! };
  XLSX.utils.book_append_sheet(workbook, data, 'Instruments');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export async function buildSearchDocx(rows: ActivityRow[], context: SearchExportContext) {
  const { AlignmentType, Document, Footer, Packer, PageNumber, PageOrientation, Paragraph,
    Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = await import('docx');
  const font = 'Khmer OS Battambang';
  const paragraph = (text: string, bold = false) => new Paragraph({
    spacing: { after: 70 }, children: [new TextRun({ text, font, bold, size: 17 })],
  });
  const widths = [500, 2500, 2400, 2600, 1700, 1200, 1100, 1800, 1598];
  const tableRow = (cells: string[], header = false) => new TableRow({
    tableHeader: header,
    children: cells.map((text, index) => new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      shading: header ? { fill: 'E8EEF6' } : undefined,
      margins: { top: 90, bottom: 90, left: 80, right: 80 },
      children: text.split('\n').map(line => paragraph(line, header)),
    })),
  });
  const document = new Document({
    styles: { default: { document: { run: { font, size: 18 } } } },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 720, bottom: 720, left: 720, right: 720 },
      } },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'NMC | ', font, size: 16 }), new TextRun({ children: [PageNumber.CURRENT] })],
      })] }) },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ', font, size: 26, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: TITLE, font, size: 22, bold: true })] }),
        paragraph(`បង្កើតនៅ / Generated (GMT+7): ${generatedAt()}`),
        ...context.filters.map(([label, filter]) => paragraph(`${label}: ${filter}`)),
        paragraph(summary(rows), true),
        ...(context.truncated ? [paragraph(limitNote)] : []),
        new Table({
          width: { size: 15398, type: WidthType.DXA },
          layout: TableLayoutType.FIXED, columnWidths: widths,
          rows: [tableRow(HEADERS, true), ...detailRows(rows).map(cells => tableRow(cells))],
        }),
      ],
    }],
  });
  return Packer.toBlob(document);
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export function buildSearchPrintHtml(rows: ActivityRow[], context: SearchExportContext) {
  const escape = (text: string) => escapeHtml(text).replace(/\n/g, '<br>');
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><title>${fileName('pdf')}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&display=swap">
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Noto Sans Khmer', 'Khmer OS Battambang', sans-serif; font-size: 9pt; color: #172b49; margin: 0; }
      h1 { font-size: 15pt; text-align: center; margin: 4mm 0; }
      h2 { font-size: 12pt; text-align: center; margin: 3mm 0 5mm; }
      p { margin: 2mm 0; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4mm; font-size: 8pt; }
      th, td { border: 1px solid #cbd5e1; padding: 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #e8eef6; } thead { display: table-header-group; }
      tr { break-inside: avoid; } th:first-child, td:first-child { width: 4%; }
      button { font: inherit; cursor: pointer; padding: 8px 16px; margin: 8px 0; }
      @media print { button { display: none; } }
    </style></head><body>
    <button onclick="window.print()">Print / Save as PDF</button>
    <h1>មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h1><h2>${TITLE}</h2>
    <p>បង្កើតនៅ / Generated (GMT+7): ${escape(generatedAt())}</p>
    ${context.filters.map(([label, filter]) => `<p>${escape(label)}: ${escape(filter)}</p>`).join('')}
    <p><strong>${escape(summary(rows))}</strong></p>
    ${context.truncated ? `<p>${limitNote}</p>` : ''}
    <table><thead><tr>${HEADERS.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead>
    <tbody>${detailRows(rows).map(cells => `<tr>${cells.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </body></html>`;
}

export async function exportSearchResults(
  format: 'docx' | 'xlsx' | 'pdf', rows: ActivityRow[], context: SearchExportContext, printWindow: Window | null,
) {
  const { issuedExportBlob } = await import('../reports/issuedExportClient');
  const issued = await issuedExportBlob({ kind: 'search', format: format === 'pdf' ? 'html' : format,
    ids: rows.map(row => row.row_id), keys: rows.map(row => `${row.format_version}/${row.row_id}`), context });
  if (issued && format !== 'pdf') { save(issued, fileName(format)); return; }
  if (format === 'pdf') {
    if (!printWindow || printWindow.closed) throw new Error('Please allow pop-ups to print or save this report as PDF.');
    printWindow.document.open();
    printWindow.document.write(issued ? await issued.text() : buildSearchPrintHtml(rows, context));
    printWindow.document.close();
    if (printWindow.document.readyState !== 'complete') {
      await new Promise<void>(resolve => printWindow.addEventListener('load', () => resolve(), { once: true }));
    }
    await printWindow.document.fonts.ready;
    if (!printWindow.closed) { printWindow.focus(); printWindow.print(); }
  } else if (format === 'docx') {
    save(await buildSearchDocx(rows, context), fileName('docx'));
  } else {
    save(new Blob([await buildSearchXlsx(rows, context)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }), fileName('xlsx'));
  }
}
