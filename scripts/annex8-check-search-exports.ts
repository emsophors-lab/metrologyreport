import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import * as XLSX from 'xlsx';
import { buildSearchDocx, buildSearchPrintHtml, buildSearchXlsx } from '../src/annex8/searchExports';
import type { ActivityRow, SearchExportContext } from '../src/annex8/searchExports';

const rows: ActivityRow[] = Array.from({ length: 31 }, (_, i) => ({
  format_version: i === 0 ? 'LEGACY-1' : 'A8-2026.2',
  row_id: `row-${i}`, licence_no: 'LIC-2026-001', company_name_kh: 'សហគ្រាសសាកល្បង',
  category: null, instrument_name: 'ជញ្ជីងអេឡិចត្រូនិក', serial_no: `SERIAL-${i + 1}`,
  customer_name: i === 0 ? '<script>alert("test")</script>' : 'អតិថិជន', province: 'ភ្នំពេញ',
  op_code: ['M', 'I', 'R'][i % 3], activity_date: '2026-10-18',
  verification_status: ['PASSED', 'FAILED', 'PENDING'][i % 3], report_month: '10', report_year: '2026',
}));
const context: SearchExportContext = {
  filters: [['ខែ / Month', 'តុលា (10)'], ['Search', 'Scale < 100 & "test"']], truncated: true,
};

const workbook = XLSX.read(await buildSearchXlsx(rows, context), { type: 'array' });
const detail = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Instruments, { header: 1 });
assert.equal(detail.length, rows.length + 1, 'Excel includes results on every screen page');
assert.equal(detail[1][1], rows[0].company_name_kh, 'Excel preserves Khmer');
assert.equal(detail[31][7], 'SERIAL-31');
assert.equal(detail[1][13], 'LEGACY-1', 'Legacy and Annex 8 rows both export');
assert.ok(JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets.Summary)).includes('Limited results'));

const word = new PizZip(await (await buildSearchDocx(rows, context)).arrayBuffer());
const xml = word.file('word/document.xml')!.asText();
assert.equal((xml.match(/<w:tr>/g) || []).length, rows.length + 1);
assert.ok(xml.includes(rows[0].company_name_kh));
assert.ok(xml.includes('SERIAL-31'));
assert.ok(xml.includes('w:orient="landscape"'));
assert.ok(xml.includes('w:w="16838"'), 'Word uses landscape A4 dimensions');
assert.ok(xml.includes('w:tblHeader'), 'Column headers repeat on subsequent pages');
assert.ok(xml.includes('&lt;script&gt;'), 'User text stays text in Word');
assert.ok(xml.includes('Limited results'));

const html = buildSearchPrintHtml(rows, context);
assert.equal((html.match(/<tr>/g) || []).length, rows.length + 1);
assert.ok(html.includes('SERIAL-31'));
assert.ok(html.includes('A4 landscape'));
assert.ok(html.includes('table-header-group'));
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(!html.includes('<script>alert'));
assert.ok(html.includes('Scale &lt; 100 &amp; &quot;test&quot;'));
assert.ok(html.includes('Limited results'));

for (const builder of [buildSearchDocx, buildSearchXlsx, buildSearchPrintHtml]) {
  await builder([], { filters: [], truncated: false });
}
console.log('Search exports pass: real Word/Excel, Khmer, all 31 rows, filter context, safe print HTML, truncation and empty results.');
