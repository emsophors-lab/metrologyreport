import assert from 'node:assert/strict';
import fs from 'node:fs';
import PizZip from 'pizzip';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { Document, Paragraph, Packer } from 'docx';
import { Jimp } from 'jimp';
import jsQR from 'jsqr';
import { DOMParser } from '@xmldom/xmldom';
import { issueReportArtifact, lookupIssuance, sha256, verificationPage, verificationOrigin } from '../src/reports/issuance';
import { sealDocx, sealPdf, sealXlsx } from '../src/reports/sealArtifacts';
import { createIssuedExport, IssuedExportError } from '../src/reports/issuedExports';

process.env.REPORT_VERIFICATION_ORIGIN = 'http://localhost:3004';
const records: any[] = [];
let fail = false;
const db = { from(table: string) {
  assert.equal(table, 'report_issuances');
  return {
    async insert(row: any) { if (!fail) records.push(row); return { error: fail ? { message: 'offline' } : null }; },
    select() { return { eq(_key: string, hash: string) { return { async maybeSingle() {
      return { data: records.find(row => row.token_hash === hash), error: null };
    } }; } }; },
  };
} };
const details = { kind: 'test', format: 'docx' as const, title: '<Test report>', issuer: 'local-test',
  basis: 'database' as const, snapshot: { customer: 'PRIVATE-CUSTOMER', gps: 'PRIVATE-GPS' } };
const original = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Original report content')] }] }));
const artifact = await issueReportArtifact(db, details, seal => sealDocx(original, seal));
const token = artifact.seal.url.split('/').pop()!;
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
assert.equal(records[0].artifact_sha256, sha256(artifact.bytes));
assert.ok(!JSON.stringify(records[0]).includes(token), 'Plain QR token is not stored');
const publicRow = await lookupIssuance(db, token);
assert.equal(publicRow.status, 200);
assert.ok(!JSON.stringify(publicRow).includes('PRIVATE-'));
assert.ok(!('source_snapshot' in publicRow.body));
assert.equal((await lookupIssuance(db, token, sha256(artifact.bytes))).body.file_match, true);
assert.equal((await lookupIssuance(db, token, sha256(Buffer.concat([artifact.bytes, Buffer.from('changed')])))).body.file_match, false);
assert.equal((await lookupIssuance(db, 'a'.repeat(43))).status, 404);
assert.equal((await lookupIssuance(db, '../oops')).status, 400);
assert.equal((await lookupIssuance(db, token, 'bad')).status, 400);
records[0].state = 'revoked';
assert.equal((await lookupIssuance(db, token, sha256(artifact.bytes))).body.file_match, false);
records[0].state = 'issued';
fail = true;
await assert.rejects(issueReportArtifact(db, details, async () => Buffer.from('test')), /could not be saved/);
fail = false;
assert.ok(!verificationPage('</script>', 'nonce').includes('/verify/</script>'));
process.env.REPORT_VERIFICATION_ORIGIN = 'http://untrusted.test';
assert.throws(verificationOrigin, /secure/);
process.env.REPORT_VERIFICATION_ORIGIN = 'http://localhost:3004';

async function decode(png: Buffer) {
  const img = await Jimp.read(png);
  const qr = jsQR(new Uint8ClampedArray(img.bitmap.data), img.bitmap.width, img.bitmap.height);
  assert.equal(qr?.data, artifact.seal.url, 'Embedded QR decodes to the issuance URL');
}
const docx = new PizZip(artifact.bytes);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const documentXml = (bytes: Buffer) => new DOMParser().parseFromString(new PizZip(bytes).file('word/document.xml')!.asText(), 'application/xml');
const paragraphs = (bytes: Buffer): any[] => Array.from(documentXml(bytes).getElementsByTagNameNS(W, 'body')[0].childNodes)
  .filter((node: any) => node.localName === 'p');
assert.ok(paragraphs(artifact.bytes)[0].getElementsByTagNameNS(WP, 'docPr')[0].getAttribute('descr')!.includes(artifact.seal.id), 'Generic Word QR is first');
assert.ok(docx.file('word/document.xml')!.asText().includes('Original report content'));
assert.ok(docx.file('word/document.xml')!.asText().includes(artifact.seal.id));
await decode(docx.file(`word/media/mlrs-qr-${artifact.seal.id}.png`)!.asNodeBuffer());
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Original'); sheet.getCell('A1').value = 'Original value';
sheet.getCell('B1').value = { formula: '1+2', result: 3 }; sheet.getCell('A1').font = { bold: true };
const xlsx = await sealXlsx(Buffer.from(await workbook.xlsx.writeBuffer()), artifact.seal);
const checked = new ExcelJS.Workbook(); await checked.xlsx.load(xlsx as any);
assert.equal(checked.getWorksheet('Original')!.getCell('A1').value, 'Original value');
assert.equal(checked.getWorksheet('Original')!.getCell('A1').font.bold, true);
assert.equal((checked.getWorksheet('Original')!.getCell('B1').value as any).formula, '1+2');
assert.ok(checked.getWorksheet('NMC Verification'));
assert.equal(checked.worksheets[0].name, 'NMC Verification', 'Excel opens with the top QR sheet');
assert.equal(checked.getWorksheet('NMC Verification')!.getImages()[0].range.tl.nativeRow, 0);
const xzip = new PizZip(xlsx);
const png = Object.keys(xzip.files).find(name => name.startsWith('xl/media/') && name.endsWith('.png'))!;
await decode(xzip.file(png)!.asNodeBuffer());
const pdf = await PDFDocument.create();
const pdfPage = pdf.addPage([595, 842]);
pdfPage.drawText('Original report title', { x: 40, y: 790, size: 18 });
pdfPage.drawText('Original PDF content', { x: 40, y: 640, size: 12 });
pdfPage.drawText('Original report footer', { x: 40, y: 30, size: 10 });
const sealedPdf = await sealPdf(Buffer.from(await pdf.save()), artifact.seal);
assert.equal((await PDFDocument.load(sealedPdf)).getPageCount(), 1, 'PDF QR does not add an appendix page');
assert.deepEqual((await PDFDocument.load(sealedPdf)).getPage(0).getSize(), pdf.getPage(0).getSize());
const sample = JSON.parse(fs.readFileSync('src/lib/consolidated/__fixtures__/consolidated-sample-data.json', 'utf8'));
const master = fs.readFileSync('public/templates/Consolidated_template_v1.docx');
const masterHash = sha256(master);
const annexSample = JSON.parse(fs.readFileSync('src/lib/annex8/__fixtures__/sample-payload.json', 'utf8'));
const annexDraft = await createIssuedExport(db, 'local-test', [annexSample.report.meta.licence_no], {
  kind: 'annex8-draft', format: 'docx', state: annexSample.report, extra: annexSample.extra,
});
assert.equal(annexDraft.seal.details.basis, 'draft');
assert.ok(new PizZip(annexDraft.bytes).file('word/document.xml')!.asText().includes('WB-26-0012'), 'Draft export preserves mapped instrument rows');
assert.ok(paragraphs(annexDraft.bytes)[3].getElementsByTagNameNS(WP, 'docPr')[0].getAttribute('descr')!.includes(annexDraft.seal.id), 'Annex QR follows its three motto lines');
const consolidated = await createIssuedExport(db, 'local-test', null, { kind: 'consolidated', format: 'docx', data: sample, sample: true });
assert.equal(consolidated.seal.details.basis, 'draft');
const letterhead = paragraphs(consolidated.bytes)[0];
const drawings = Array.from(letterhead.getElementsByTagNameNS(WP, 'docPr')) as any[];
const qrAnchor = drawings.find(node => node.getAttribute('descr')?.includes(consolidated.seal.id))!.parentNode;
assert.equal(qrAnchor.localName, 'anchor');
assert.equal(qrAnchor.getElementsByTagNameNS(WP, 'positionH')[0].getAttribute('relativeFrom'), 'column');
assert.ok(Number(qrAnchor.getElementsByTagNameNS(WP, 'positionV')[0].textContent) > 700000, 'Consolidated QR sits below motto, in the letterhead');
assert.equal(sha256(fs.readFileSync('public/templates/Consolidated_template_v1.docx')), masterHash);
await assert.rejects(createIssuedExport(db, 'company', ['OWN'], { kind: 'consolidated', format: 'docx', data: sample }),
  (error: any) => error instanceof IssuedExportError && error.status === 403);
await assert.rejects(createIssuedExport(db, 'company', ['OWN'], { kind: 'staff-workbook', format: 'xlsx' }),
  (error: any) => error.status === 403);
await assert.rejects(createIssuedExport(db, 'company', ['OWN'], { kind: 'upload', format: 'docx', data: 'arbitrary file' }),
  (error: any) => error.status === 400);
const analytics = { generatedDate: '2026-10-20', reportDate: '2026-10-20T00:00:00Z',
  total: 0, active: 0, activePct: 0, expiring: 0, expired: 0, gps: 0, noGps: 0, telegram: 0, noTelegram: 0,
  reportCount: 0, noReportCount: 0, criticalRiskCount: 0, highRiskCount: 0,
  statusRows: [], provinceRows: [], serviceRows: [], instrumentRows: [], monthlyRows: [], riskRows: [], topRisks: [],
  exp30: 0, exp60: 0, exp90: 0 };
for (const format of ['docx', 'pdf', 'pptx']) {
  const output = await createIssuedExport(db, 'local-test', null, { kind: 'analytics', format, data: structuredClone(analytics) });
  assert.equal((await lookupIssuance(db, output.seal.url.split('/').pop()!, sha256(output.bytes))).body.file_match, true);
  if (format === 'pptx') {
    const slides = new PizZip(output.bytes);
    assert.ok(slides.file('ppt/slides/slide1.xml')!.asText().includes(output.seal.id), 'Presentation QR is on the cover slide');
  }
}
const htmlReport = await createIssuedExport(db, 'local-test', null, { kind: 'legacy', format: 'html', ids: [] });
const html = htmlReport.bytes.toString();
assert.ok(html.indexOf('aria-label="Report verification"') < html.indexOf('<h1>'), 'Print view QR precedes report content');
fs.mkdirSync('test-output/report-issuance', { recursive: true });
fs.writeFileSync('test-output/report-issuance/test.docx', artifact.bytes);
fs.writeFileSync('test-output/report-issuance/test.xlsx', xlsx);
fs.writeFileSync('test-output/report-issuance/test.pdf', sealedPdf);
fs.writeFileSync('test-output/report-issuance/consolidated.docx', consolidated.bytes);
fs.writeFileSync('test-output/report-issuance/annex8.docx', annexDraft.bytes);
fs.writeFileSync('test-output/report-issuance/print-view.html', htmlReport.bytes);
console.log('PASS: top-of-report QR in Word/PDF/Excel/HTML/PowerPoint, hashes, QR decoding, private metadata, revocation, tampering, failed writes, staff scope, master template unchanged.');
