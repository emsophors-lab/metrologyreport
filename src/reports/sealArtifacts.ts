import PizZip from 'pizzip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { AlignmentType, Document, HorizontalPositionRelativeFrom, ImageRun, Packer, Paragraph,
  TextWrappingType, VerticalPositionRelativeFrom } from 'docx';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import type { ReportSeal } from './issuance';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const xml = (source: string) => new DOMParser().parseFromString(source, 'application/xml');
const serialize = (node: any) => new XMLSerializer().serializeToString(node);

/** Stamp filled outputs only; never edit the approved master template. */
export async function sealDocx(bytes: Buffer, seal: ReportSeal): Promise<Buffer> {
  const target = new PizZip(bytes);
  const document = xml(target.file('word/document.xml')!.asText());
  const body = document.getElementsByTagNameNS(W, 'body')[0];
  const first = Array.from(body.childNodes).find(node => node.nodeType === 1) as any;
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  // The consolidated letterhead already reserves a right-hand motto column.
  const motto = seal.details.kind === 'consolidated' && first?.localName === 'p'
    ? Array.from(first.getElementsByTagNameNS(WP, 'anchor')).find((node: any) => node.textContent.includes('Nation Religion King')) as any
    : null;
  const mottoX = Number(motto?.getElementsByTagNameNS(WP, 'positionH')[0]?.textContent);
  const mottoY = Number(motto?.getElementsByTagNameNS(WP, 'positionV')[0]?.textContent);
  const mottoExtent = motto?.getElementsByTagNameNS(WP, 'extent')[0];
  const inLetterhead = !!motto && Number.isFinite(mottoX) && Number.isFinite(mottoY) && !!mottoExtent;
  const proof = new Document({ sections: [{ children: [new Paragraph({
    alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 120 },
    children: [new ImageRun({ data: seal.png, type: 'png', transformation: { width: 112, height: 112 },
      altText: { name: 'Report verification QR', description: `${seal.id} ${seal.url}` },
      ...(inLetterhead ? { floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN,
          offset: Math.round(mottoX + (Number(mottoExtent.getAttribute('cx')) - 112 * 9525) / 2) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH,
          offset: mottoY + Number(mottoExtent.getAttribute('cy')) + 100000 },
        wrap: { type: TextWrappingType.NONE }, allowOverlap: false, behindDocument: false,
      } } : {}),
    })],
  })] }] });
  const generated = new PizZip(await Packer.toBuffer(proof));
  const appendix = xml(generated.file('word/document.xml')!.asText());
  const rels = xml(target.file('word/_rels/document.xml.rels')?.asText() || `<Relationships xmlns="${REL}"/>`);
  const sourceRels = xml(generated.file('word/_rels/document.xml.rels')!.asText());
  const relationMap = new Map<string, string>();
  for (const relation of Array.from(sourceRels.getElementsByTagNameNS(REL, 'Relationship'))) {
    if (!relation.getAttribute('Type')?.endsWith('/image')) continue;
    const oldId = relation.getAttribute('Id')!;
    const newId = `qr${seal.id.replace(/-/g, '')}`;
    const filename = `mlrs-qr-${seal.id}.png`;
    const sourcePath = `word/${relation.getAttribute('Target')}`;
    target.file(`word/media/${filename}`, generated.file(sourcePath)!.asUint8Array());
    const copy = rels.importNode(relation, true);
    copy.setAttribute('Id', newId); copy.setAttribute('Target', `media/${filename}`);
    rels.documentElement!.appendChild(copy); relationMap.set(oldId, newId);
  }
  for (const attr of Array.from(appendix.documentElement!.attributes)) {
    if (attr.name.startsWith('xmlns:') && !document.documentElement!.hasAttribute(attr.name)) {
      document.documentElement!.setAttribute(attr.name, attr.value);
    }
  }
  let drawingId = Math.max(0, ...Array.from(document.getElementsByTagNameNS(WP, 'docPr')).map(node => Number(node.getAttribute('id')) || 0));
  const originalParagraphs = Array.from(body.childNodes).filter((node: any) => node.localName === 'p') as any[];
  const hasMotto = originalParagraphs[0]?.textContent.includes('ព្រះរាជាណាចក្រកម្ពុជា')
    && originalParagraphs[1]?.textContent.includes('ជាតិ');
  const insertBefore = hasMotto ? originalParagraphs[3] || first : first;
  for (const child of Array.from(appendix.getElementsByTagNameNS(W, 'body')[0].childNodes)) {
    if (child.nodeType !== 1 || (child as any).localName === 'sectPr') continue;
    const copy = document.importNode(child, true) as any;
    for (const node of Array.from(copy.getElementsByTagName('*')) as any[]) {
      if (node.namespaceURI === WP && node.localName === 'docPr') node.setAttribute('id', String(++drawingId));
      const id = node.getAttributeNS(R, 'embed');
      if (relationMap.has(id)) node.setAttributeNS(R, 'r:embed', relationMap.get(id)!);
    }
    if (inLetterhead) {
      for (const run of Array.from(copy.childNodes) as any[]) if (run.localName === 'r') first.appendChild(run);
    } else body.insertBefore(copy, insertBefore);
  }
  const types = xml(target.file('[Content_Types].xml')!.asText());
  if (!Array.from(types.getElementsByTagNameNS(CT, 'Default')).some(node => node.getAttribute('Extension') === 'png')) {
    const png = types.createElementNS(CT, 'Default'); png.setAttribute('Extension', 'png'); png.setAttribute('ContentType', 'image/png');
    types.documentElement!.appendChild(png);
  }
  target.file('word/document.xml', serialize(document));
  target.file('word/_rels/document.xml.rels', serialize(rels));
  target.file('[Content_Types].xml', serialize(types));
  return target.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function sealXlsx(bytes: Buffer, seal: ReportSeal): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as any);
  if (workbook.getWorksheet('NMC Verification')) throw new Error('Reserved verification sheet already exists.');
  const sheet = workbook.addWorksheet('NMC Verification');
  sheet.columns = [{ width: 20 }, { width: 60 }, { width: 25 }];
  sheet.addRows([['NMC Report Issuance'], ['Issuance ID', seal.id], ['Issued at', seal.issuedAt],
    ['Report basis', seal.details.basis], ['Verification URL', seal.url]]);
  sheet.getCell('B5').value = { text: seal.url, hyperlink: seal.url };
  const image = workbook.addImage({ buffer: seal.png as any, extension: 'png' });
  sheet.addImage(image, { tl: { col: 2, row: 0 }, ext: { width: 160, height: 160 } });
  sheet.getCell('B5').alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(5).height = 60;
  sheet.getRow(10).height = 15;
  sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, printArea: 'A1:C10' };
  // Reorder only sheet references; original data cells, formulas and ranges stay intact.
  const output = new PizZip(Buffer.from(await workbook.xlsx.writeBuffer()));
  const workbookXml = xml(output.file('xl/workbook.xml')!.asText());
  const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const sheets = workbookXml.getElementsByTagNameNS(S, 'sheets')[0];
  const verification = Array.from(sheets.childNodes).find((node: any) => node.getAttribute?.('name') === 'NMC Verification')!;
  sheets.insertBefore(verification, sheets.firstChild);
  if (!workbookXml.getElementsByTagNameNS(S, 'workbookView').length) {
    const views = workbookXml.getElementsByTagNameNS(S, 'bookViews')[0] || workbookXml.createElementNS(S, 'bookViews');
    views.appendChild(workbookXml.createElementNS(S, 'workbookView'));
    if (!views.parentNode) workbookXml.documentElement!.insertBefore(views, sheets);
  }
  for (const view of Array.from(workbookXml.getElementsByTagNameNS(S, 'workbookView'))) {
    view.setAttribute('activeTab', '0'); view.setAttribute('firstSheet', '0');
  }
  output.file('xl/workbook.xml', serialize(workbookXml));
  for (const name of Object.keys(output.files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) {
    const sheetXml = xml(output.file(name)!.asText());
    for (const view of Array.from(sheetXml.getElementsByTagNameNS(S, 'sheetView'))) {
      view.setAttribute('tabSelected', name === `xl/worksheets/sheet${sheet.id}.xml` ? '1' : '0');
    }
    output.file(name, serialize(sheetXml));
  }
  return output.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function sealPdf(bytes: Buffer, seal: ReportSeal): Promise<Buffer> {
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount()) throw new Error('Cannot verify an empty PDF.');
  const original = pdf.getPage(0);
  const embedded = await pdf.embedPage(original);
  const { width, height } = original.getSize();
  const page = pdf.insertPage(0, [width, height]);
  const headerHeight = Math.min(120, height * 0.2);
  const scale = Math.min((height - headerHeight - 12) / embedded.height, (width - 24) / embedded.width);
  page.drawPage(embedded, { x: (width - embedded.width * scale) / 2, y: 12,
    width: embedded.width * scale, height: embedded.height * scale });
  pdf.removePage(1);
  const image = await pdf.embedPng(seal.png);
  const qrSize = Math.min(84, headerHeight - 20);
  page.drawImage(image, { x: width - qrSize - 24, y: height - qrSize - 12, width: qrSize, height: qrSize });
  let y = height - 32;
  for (const line of ['NMC Report Verification', seal.id, seal.issuedAt, seal.details.basis]) {
    page.drawText(line, { x: 24, y, size: 8 }); y -= 16;
  }
  return Buffer.from(await pdf.save());
}
