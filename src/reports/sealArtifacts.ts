import PizZip from 'pizzip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { Document, ImageRun, Packer, PageBreak, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import type { ReportSeal } from './issuance';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const xml = (source: string) => new DOMParser().parseFromString(source, 'application/xml');
const serialize = (node: any) => new XMLSerializer().serializeToString(node);

/** Appends a verification page to a filled output; the approved template is untouched. */
export async function sealDocx(bytes: Buffer, seal: ReportSeal): Promise<Buffer> {
  const proof = new Document({ sections: [{ children: [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ children: [new TextRun({ text: 'NMC Report Issuance', bold: true, size: 28, font: 'Arial' })] }),
    new Paragraph({ children: [new ImageRun({ data: seal.png, type: 'png', transformation: { width: 128, height: 128 } })] }),
    ...[seal.id, seal.issuedAt, seal.details.basis, seal.url].map(text => new Paragraph({
      children: [new TextRun({ text, font: 'Arial', size: 18 })],
    })),
  ] }] });
  const generated = new PizZip(await Packer.toBuffer(proof));
  const target = new PizZip(bytes);
  const document = xml(target.file('word/document.xml')!.asText());
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
  const body = document.getElementsByTagNameNS(W, 'body')[0];
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
  let drawingId = Math.max(0, ...Array.from(document.getElementsByTagNameNS(WP, 'docPr')).map(node => Number(node.getAttribute('id')) || 0));
  const section = Array.from(body.childNodes).find(node => node.nodeType === 1 && (node as any).localName === 'sectPr') || null;
  for (const child of Array.from(appendix.getElementsByTagNameNS(W, 'body')[0].childNodes)) {
    if (child.nodeType !== 1 || (child as any).localName === 'sectPr') continue;
    const copy = document.importNode(child, true) as any;
    for (const node of Array.from(copy.getElementsByTagName('*')) as any[]) {
      if (node.namespaceURI === WP && node.localName === 'docPr') node.setAttribute('id', String(++drawingId));
      const id = node.getAttributeNS(R, 'embed');
      if (relationMap.has(id)) node.setAttributeNS(R, 'r:embed', relationMap.get(id)!);
    }
    body.insertBefore(copy, section);
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
  sheet.columns = [{ width: 24 }, { width: 85 }];
  sheet.addRows([['NMC Report Issuance'], ['Issuance ID', seal.id], ['Issued at', seal.issuedAt],
    ['Report basis', seal.details.basis], ['Verification URL', seal.url]]);
  sheet.getCell('B5').value = { text: seal.url, hyperlink: seal.url };
  const image = workbook.addImage({ buffer: seal.png as any, extension: 'png' });
  sheet.addImage(image, { tl: { col: 0, row: 7 }, ext: { width: 160, height: 160 } });
  sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function sealPdf(bytes: Buffer, seal: ReportSeal): Promise<Buffer> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.addPage([595, 842]);
  const image = await pdf.embedPng(seal.png);
  page.drawText('NMC Report Issuance', { x: 45, y: 780, size: 18 });
  page.drawImage(image, { x: 45, y: 600, width: 160, height: 160 });
  let y = 565;
  for (const line of [seal.id, seal.issuedAt, seal.details.basis, ...seal.url.match(/.{1,90}/g)!]) {
    page.drawText(line, { x: 45, y, size: 9 }); y -= 18;
  }
  return Buffer.from(await pdf.save());
}
