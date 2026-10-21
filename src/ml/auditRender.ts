import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { Jimp, loadFont } from 'jimp';
import { SANS_16_BLACK } from 'jimp/fonts';
import type { AuditData, AuditRow } from './auditTypes';
import type { ReportSeal } from '../reports/issuance';
import { generateExecutiveBriefing } from './narrative';

const BLUE = '#174B78', GOLD = '#BA913B', INK = '#223544', LIGHT = '#E9EFF4';
const RED = '#B13C46', GREEN = '#238575', GREY = '#71818D';
const TITLE = 'Metrology Machine Learning & Predictive Quality Audit Report';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: number | null | undefined, digits = 3) => finite(v) ? v.toFixed(digits) : 'N/A';
const pct = (v: number | null | undefined) => finite(v) ? `${(v * 100).toFixed(1)}%` : 'N/A';
const english = (v: unknown) => String(v ?? 'N/A').replace(/[^\x20-\x7E\n]+/g, '[Unicode: see Excel]');
const high = (r: AuditRow) => /high|critical/i.test(r.riskLevel);
const rankedAnomalies = (rows: AuditRow[]) => rows.slice().sort((a, b) =>
  (finite(b.anomalyScore) ? b.anomalyScore : -Infinity) - (finite(a.anomalyScore) ? a.anomalyScore : -Infinity)
  || a.reportId.localeCompare(b.reportId) || a.instrumentId.localeCompare(b.instrumentId));
const outliers = (data: AuditData) => rankedAnomalies(data.rows.filter(r => r.outlier === true));
const reference = (r: AuditRow) => `Report: ${r.reportId}\nInstrument: ${r.instrumentId}\nEnterprise: ${r.organizationId}\nSubmitted: ${r.timestamp}`;
const note = 'Reporting compliance and enterprise risk are not instrument error, MPE, or probability of instrument failure. Current error, drift forecast and calibration interval are unavailable.';
const unicodeNote = 'Unicode names are preserved in Excel. This English PDF uses report, instrument and enterprise reference IDs; non-ASCII text is marked rather than rendered with an unsupported font.';

type Shape = { kind: 'line' | 'rect' | 'dot'; x: number; y: number; x2: number; y2: number; color: string }
  | { kind: 'text'; x: number; y: number; value: string };
type Plot = { title: string; caption: string; shapes: Shape[] };
const PW = 1000, PH = 280;

function plots(data: AuditData): Plot[] {
  const base = (title: string, caption: string): Plot => ({ title, caption, shapes: [] });
  const line = (p: Plot, x: number, y: number, x2: number, y2: number, color = LIGHT) =>
    p.shapes.push({ kind: 'line', x, y, x2, y2, color });
  const label = (p: Plot, x: number, y: number, value: string) => p.shapes.push({ kind: 'text', x, y, value });
  const dot = (p: Plot, x: number, y: number, color: string) => p.shapes.push({ kind: 'dot', x, y, x2: 4, y2: 4, color });
  const history = base('Reporting Compliance History', 'Monthly on-time reporting rate (%), from data.history; not error/MPE. Gaps mean unavailable rates. Counts and exact rates are listed below.');
  for (let i = 0; i <= 4; i++) {
    const y = 225 - i * 50;
    line(history, 70, y, 955, y); label(history, 8, y - 8, `${i * 25}%`);
  }
  let previous: { x: number; y: number } | null = null;
  data.history.forEach((h, i) => {
    const x = 85 + i * 850 / Math.max(1, data.history.length - 1);
    if (i % Math.max(1, Math.ceil(data.history.length / 8)) === 0 || i === data.history.length - 1)
      label(history, Math.min(895, x - 18), 245, english(h.month).slice(0, 12));
    if (!finite(h.rate) || h.rate < 0 || h.rate > 1) { previous = null; return; }
    const y = 225 - h.rate * 200;
    if (previous) line(history, previous.x, previous.y, x, y, BLUE);
    dot(history, x, y, BLUE); previous = { x, y };
  });
  if (!data.history.some(h => finite(h.rate) && h.rate >= 0 && h.rate <= 1)) label(history, 280, 120, 'Reporting compliance history unavailable');

  const distribution = base('Anomaly Distribution', 'Record counts by explicit outlier flag. Unavailable flags are not classified as normal.');
  const bins = [data.rows.filter(r => r.outlier === true).length, data.rows.filter(r => r.outlier === false).length,
    data.rows.filter(r => r.outlier !== true && r.outlier !== false).length];
  const maximum = Math.max(1, ...bins);
  ['Outlier', 'Not outlier', 'Unavailable'].forEach((name, i) => {
    const x = 150 + i * 280, height = bins[i] / maximum * 175;
    distribution.shapes.push({ kind: 'rect', x, y: 220 - height, x2: 140, y2: height, color: [RED, GREEN, GREY][i] });
    label(distribution, x, 240, `${name}: ${bins[i]}`);
  });
  line(distribution, 70, 220, 955, 220, GREY);
  if (!data.rows.length) label(distribution, 380, 60, 'No records in selected scope');

  const pca = base('PCA Projection', 'PC1 (horizontal) / PC2 (vertical), supplied row.pca coordinates only. Red: outlier; teal: not outlier; grey: unavailable flag.');
  const points = data.rows.filter(r => r.pca && finite(r.pca[0]) && finite(r.pca[1]));
  if (!points.length) label(pca, 270, 120, 'PCA unavailable: no valid supplied coordinates');
  else {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const r of points) {
      minX = Math.min(minX, r.pca![0]); maxX = Math.max(maxX, r.pca![0]);
      minY = Math.min(minY, r.pca![1]); maxY = Math.max(maxY, r.pca![1]);
    }
    if (minX === maxX) { minX -= 0.5; maxX += 0.5; }
    if (minY === maxY) { minY -= 0.5; maxY += 0.5; }
    for (let i = 0; i <= 4; i++) {
      line(pca, 100 + i * 205, 25, 100 + i * 205, 220);
      line(pca, 100, 25 + i * 48.75, 920, 25 + i * 48.75);
    }
    for (const r of points) dot(pca, 100 + (r.pca![0] - minX) / (maxX - minX) * 820,
      220 - (r.pca![1] - minY) / (maxY - minY) * 195, r.outlier === true ? RED : r.outlier === false ? GREEN : GREY);
    label(pca, 100, 246, `PC1: ${num(minX)} to ${num(maxX)}`);
    label(pca, 540, 246, `PC2: ${num(minY)} to ${num(maxY)}`);
    pca.caption += ` ${points.length}/${data.rows.length} records have valid coordinates; other records omitted.`;
  }
  return [history, distribution, pca];
}

function metadata(data: AuditData, seal: ReportSeal): [string, string | number][] {
  return [
    ['Generated at', data.generatedAt], ['Issued at', seal.issuedAt], ['Issuance ID', seal.id],
    ['Verification URL', seal.url], ['Issuer', seal.details.issuer], ['Basis', seal.details.basis],
    ['Source fingerprint (full)', data.sourceFingerprint], ['Model version', data.modelVersion],
    ['Model status', data.status], ['Last trained at', data.lastTrainedAt ?? 'N/A'], ['Training reports', data.trainedReportCount],
    ...Object.entries(data.filters).map(([k, v]): [string, string] => [`Filter: ${k}`, String(v ?? 'All')]),
    ['Filter scope', Object.keys(data.filters).length ? 'See specified filters; unspecified filters are unrestricted.' : 'All records (no filters)'],
    ['Accuracy', pct(data.metrics.accuracy)], ['F1', num(data.metrics.f1)], ['Silhouette', num(data.metrics.silhouette)],
    ['Label source', data.metrics.labelSource], ['Interpretation', note], ['PDF language policy', unicodeNote],
    ...data.limitations.map((v, i): [string, string] => [`Limitation ${i + 1}`, v]),
  ];
}

/** Official, English, reference-based report. No measurement values are synthesized. */
export async function renderAuditPdf(data: AuditData, seal: ReportSeal): Promise<Buffer> {
  const logo = await readFile(path.resolve(process.cwd(), 'public/logo-pwa.png'));
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: TITLE, author: english(seal.details.issuer), subject: 'Reporting compliance and enterprise risk audit' });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const left = 12, usable = width - 24, bottom = height - 22;
  let y = 43, section = 'Executive Summary';
  function header() {
    doc.setFillColor(BLUE); doc.rect(0, 0, width, 3, 'F');
    doc.addImage(logo, 'PNG', left, 7, 23, 23);
    doc.setTextColor(BLUE); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('NATIONAL METROLOGY CENTER', 40, 13);
    doc.setFontSize(11); doc.text(TITLE, 40, 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(INK);
    doc.text(section, 40, 27);
    doc.addImage(seal.png, 'PNG', width - 40, 6, 28, 28);
    doc.link(width - 40, 6, 28, 28, { url: seal.url });
    doc.setDrawColor(GOLD); doc.setLineWidth(0.7); doc.line(left, 36, width - left, 36);
    y = 43;
  }
  function page(title = section) { section = title; doc.addPage(); header(); }
  function paragraph(text: unknown, size = 9) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(INK);
    const lines = doc.splitTextToSize(english(text), usable) as string[];
    for (const line of lines) {
      if (y + 5 > bottom) page();
      doc.text(line, left, y); y += 4.5;
    }
    y += 2;
  }
  function table(title: string, headers: string[], widths: number[], rows: unknown[][], inline = false) {
    if (inline) paragraph(title, 10); else page(title);
    const lineHeight = 3.6;
    function tableHeader() {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      const lines = headers.map((v, i) => doc.splitTextToSize(v, widths[i] - 4) as string[]);
      const h = Math.max(...lines.map(v => v.length)) * lineHeight + 5;
      doc.setFillColor(BLUE); doc.rect(left, y - 3, usable, h, 'F');
      doc.setTextColor('#FFFFFF'); let x = left;
      lines.forEach((v, i) => { doc.text(v, x + 2, y + 1, { lineHeightFactor: 1.36 }); x += widths[i]; });
      y += h;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(INK);
    }
    tableHeader();
    if (!rows.length) { paragraph('No records in the selected scope.'); return; }
    rows.forEach((row, index) => {
      doc.setFontSize(7.5);
      const cells = headers.map((_, i) => doc.splitTextToSize(english(row[i]), widths[i] - 4) as string[]);
      const count = Math.max(1, ...cells.map(c => c.length));
      const fullHeight = count * lineHeight + 4;
      if (y + fullHeight > bottom && fullHeight < bottom - 63) { page(); tableHeader(); }
      let offset = 0;
      while (offset < count) {
        const capacity = Math.floor((bottom - y - 4) / lineHeight);
        if (capacity < 1) { page(); tableHeader(); continue; }
        const take = Math.min(count - offset, capacity), h = take * lineHeight + 4;
        doc.setFillColor(index % 2 ? '#FFFFFF' : '#F0F4F7'); doc.rect(left, y - 2, usable, h, 'F');
        doc.setDrawColor('#D5DFE7'); doc.line(left, y + h - 2, width - left, y + h - 2);
        let x = left;
        cells.forEach((c, i) => {
          // Explicit line baselines keep oversized rows safely inside every page fragment.
          c.slice(offset, offset + take).forEach((text, j) => doc.text(text, x + 2, y + 1 + j * lineHeight));
          x += widths[i];
        });
        y += h; offset += take;
        if (offset < count) { page(`${title} (continued record ${index + 1})`); tableHeader(); }
      }
    });
  }
  header();
  const kpis = [['Reports', data.reportCount], ['Enterprises', data.enterpriseCount], ['High risk', data.highRiskCount],
    ['Anomalies', data.anomalyCount], ['On-time rate', pct(data.onTimeRate)]];
  kpis.forEach(([label, value], i) => {
    const x = left + i * usable / 5;
    doc.setFillColor(LIGHT); doc.rect(x, y, usable / 5 - 3, 23, 'F');
    doc.setFontSize(8); doc.setTextColor(INK); doc.text(String(label), x + 3, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(BLUE); doc.text(String(value), x + 3, y + 17);
    doc.setFont('helvetica', 'normal');
  });
  y += 31;
  const briefing = data.executive_briefing || generateExecutiveBriefing(data);
  paragraph(`Executive Briefing: ${briefing.headline_status}`, 11);
  paragraph(briefing.summary_paragraph);
  table('Prioritized Recommendations - Staff Verification Required', ['Priority', 'Category', 'Action', 'Quantified scope / impact'],
    [19,34,132,usable-185], briefing.action_items.map(a=>[a.priority,a.category,a.action,a.quantified_impact]), true);
  paragraph(note); paragraph(unicodeNote);
  paragraph(`Generated: ${data.generatedAt} | Model: ${data.modelVersion} | Status: ${data.status}`);
  paragraph(`Model provenance: trained ${data.lastTrainedAt || 'not trained'} on ${data.trainedReportCount} reports. Validation accuracy ${pct(data.metrics.accuracy)}; F1 ${num(data.metrics.f1)}; silhouette ${num(data.metrics.silhouette)}.`);
  paragraph(`Scope: ${data.rows.length} instrument/report records; ${data.enterpriseCount} enterprises. Enterprise probabilities may repeat across instrument records.`);
  paragraph(`Issuance: ${seal.id} | Basis: ${seal.details.basis}`);
  paragraph('Prepared By: System ML Engine    Reviewed / Verified By: ____________________    Date: __________');
  table('Executive Briefing: Supporting Findings', ['Section','Evidence-based narrative'], [42,usable-42],
    [...briefing.supervised_findings.map(v=>['Supervised',v]),...briefing.unsupervised_findings.map(v=>['Unsupervised',v]),
      ['Briefing engine',briefing.engine],...briefing.limitations.map(v=>['Limitation',v])]);
  table('Provenance and Model Metadata', ['Field', 'Value'], [60, usable - 60], metadata(data, seal));
  for (const p of plots(data)) {
    page(p.title);
    const chartY = y, scale = usable / PW;
    for (const s of p.shapes) {
      if (s.kind === 'text') {
        doc.setTextColor(INK); doc.setFontSize(8); doc.text(s.value, left + s.x * scale, chartY + (s.y + 14) * scale);
      } else {
        doc.setDrawColor(s.color); doc.setFillColor(s.color); doc.setLineWidth(0.5);
        if (s.kind === 'line') doc.line(left + s.x * scale, chartY + s.y * scale, left + s.x2 * scale, chartY + s.y2 * scale);
        else if (s.kind === 'rect') doc.rect(left + s.x * scale, chartY + s.y * scale, s.x2 * scale, s.y2 * scale, 'F');
        else doc.circle(left + s.x * scale, chartY + s.y * scale, 1, 'F');
      }
    }
    y += PH * scale + 10; paragraph(p.caption);
  }
  table('Monthly Reporting Compliance: Source Values', ['Month', 'Report count', 'On-time reporting rate'], [90, 80, usable - 170],
    data.history.map(h => [h.month, h.count, pct(h.rate)]));
  table('Supervised Enterprise Risk Predictions', ['Reference IDs', 'Category', 'Current error', 'Enterprise risk probability', 'Risk level', 'Recommended action / top feature'],
    [66, 31, 22, 32, 25, usable - 176], data.rows.map(r => [reference(r), r.category, 'N/A', pct(r.riskProbability), r.riskLevel,
      `${r.action || 'N/A'}\nTop feature: ${r.topFeature || 'N/A'}`]));
  table('Unsupervised Anomalies: All Outliers, Score Descending', ['Reference IDs', 'Category', 'Anomaly score', 'Cluster', 'Reason / recommended action'],
    [66, 36, 30, 30, usable - 162], outliers(data).map(r => [reference(r), r.category, num(r.anomalyScore), r.cluster || 'N/A',
      `${r.reason || 'N/A'}\nAction: ${r.action || 'N/A'}`]));
  table('Cluster Profiles', ['Cluster', 'Records', 'Enterprises', 'Mean anomaly score', 'Feature centroids'], [35, 25, 28, 35, usable - 123],
    data.clusters.map(c => [c.label, c.count, c.enterpriseCount, num(c.averageAnomaly),
      c.centroid.map((v, i) => `${data.featureNames[i] || `Feature ${i + 1}`}: ${num(v)}`).join('\n') || 'N/A']));
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setDrawColor(GOLD); doc.line(left, height - 18, width - left, height - 18);
    doc.setTextColor(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(`NMC | Fingerprint: ${english(data.sourceFingerprint).slice(0, 20)} | Reviewer sign-off: __________________`, left, height - 12);
    doc.text(`Page ${i} of ${pages}`, width - left, height - 12, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}

async function plotPng(plot: Plot): Promise<Buffer> {
  const image = new Jimp({ width: PW, height: PH, color: 0xffffffff });
  const font = await loadFont(SANS_16_BLACK);
  const pixel = (x: number, y: number, color: number) => {
    if (x >= 0 && x < PW && y >= 0 && y < PH) image.setPixelColor(color, x, y);
  };
  for (const s of plot.shapes) {
    if (s.kind === 'text') { image.print({ font, x: Math.round(s.x), y: Math.round(s.y), text: s.value }); continue; }
    const color = Number.parseInt(`${s.color.slice(1)}ff`, 16);
    if (s.kind === 'line') {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(s.x2 - s.x), Math.abs(s.y2 - s.y))));
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(s.x + (s.x2 - s.x) * i / steps), y = Math.round(s.y + (s.y2 - s.y) * i / steps);
        pixel(x, y, color); pixel(x, y + 1, color);
      }
    } else if (s.kind === 'rect') {
      for (let y = Math.round(s.y); y < s.y + s.y2; y++) for (let x = Math.round(s.x); x < s.x + s.x2; x++) pixel(x, y, color);
    } else {
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 16) pixel(Math.round(s.x) + x, Math.round(s.y) + y, color);
    }
  }
  return image.getBuffer('image/png');
}

/** Four analysis worksheets, with Unicode preserved and all user strings stored as text, never formulas. */
export async function renderAuditExcel(data: AuditData, seal: ReportSeal): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'National Metrology Center'; book.title = TITLE;
  const created = new Date(data.generatedAt); if (Number.isFinite(created.getTime())) book.created = created;
  function sheet(name: string, headers: string[], widths: number[], headerRow = 1) {
    const ws = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: headerRow }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerRow}:${headerRow}` } });
    ws.columns = widths.map(width => ({ width }));
    const row = ws.getRow(headerRow); row.values = headers; row.height = 34;
    row.eachCell(c => { c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174B78' } };
      c.alignment = { wrapText: true, vertical: 'middle' }; });
    ws.headerFooter.oddFooter = `&LNMC | ${data.sourceFingerprint.slice(0, 20).replace(/&/g, '&&')}&RPage &P of &N`;
    return ws;
  }
  function add(ws: ExcelJS.Worksheet, values: (string | number | boolean | null | undefined)[], flagged = false) {
    // ExcelJS plain strings serialize as shared strings, including leading =, +, -, and @.
    const row = ws.addRow(values.map(v => typeof v === 'number' && !finite(v) ? 'N/A' : v ?? 'N/A'));
    let lines = 1;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF223544' } };
      cell.alignment = { wrapText: true, vertical: 'top' };
      const text = String(cell.value ?? '');
      lines = Math.max(lines, ...text.split('\n').map(v => Math.max(1, Math.ceil(v.length / Math.max(8, (ws.getColumn(col).width ?? 20) - 2)))));
      if (flagged) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE3E4' } };
      else if (row.number % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F7' } };
    });
    row.height = Math.min(409, Math.max(24, lines * 15 + 6));
    return row;
  }
  function filter(ws: ExcelJS.Worksheet, start = 1) { ws.autoFilter = { from: { row: start, column: 1 }, to: { row: Math.max(start, ws.rowCount), column: ws.columnCount } }; }
  const summary = sheet('Executive_Summary_&_Metadata', ['Field / metric', 'Value'], [38, 100, 12, 12, 12, 12, 12, 12], 9);
  summary.mergeCells('A1:F2'); summary.getCell('A1').value = `NATIONAL METROLOGY CENTER\n${TITLE}`;
  summary.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF174B78' } };
  summary.getCell('A1').alignment = { wrapText: true, vertical: 'middle' }; summary.getRow(1).height = 28; summary.getRow(2).height = 28;
  summary.mergeCells('A4:F5'); summary.getCell('A4').value = note;
  summary.getCell('A4').alignment = { wrapText: true, vertical: 'top' }; summary.getRow(4).height = 30; summary.getRow(5).height = 24;
  summary.mergeCells('A7:F7'); summary.getCell('A7').value = `Issuance: ${seal.id}`;
  const qr = book.addImage({ buffer: seal.png as any, extension: 'png' });
  summary.addImage(qr, { tl: { col: 6, row: 0 }, ext: { width: 150, height: 150 } });
  const briefing = data.executive_briefing || generateExecutiveBriefing(data);
  add(summary, ['Executive briefing', briefing.headline_status]);
  add(summary, ['Management summary', briefing.summary_paragraph]);
  for (const finding of briefing.supervised_findings) add(summary, ['Supervised finding', finding]);
  for (const finding of briefing.unsupervised_findings) add(summary, ['Unsupervised finding', finding]);
  for (const action of briefing.action_items) {
    const row = add(summary, [`${action.priority} | ${action.category}`,`${action.action}\nQuantified scope: ${action.quantified_impact}`]);
    row.getCell(1).font = {bold:true,color:{argb:action.priority==='Critical'?'FFB13C46':action.priority==='High'?'FF95670C':'FF174B78'}};
  }
  add(summary, ['Narrative engine', briefing.engine]);
  for (const values of [['Reports', data.reportCount], ['Enterprises', data.enterpriseCount], ['High-risk enterprises', data.highRiskCount],
    ['Anomalies', data.anomalyCount], ['On-time reporting rate', data.onTimeRate ?? 'N/A'],
    ['Instrument/report rows', data.rows.length], ['Scope note', 'Enterprise probabilities may repeat across instrument/report records.'],
    ...metadata(data, seal)] as [string, string | number][]) {
    const row = add(summary, values); if (values[0] === 'On-time reporting rate') row.getCell(2).numFmt = '0.0%';
  }
  filter(summary, 9);
  add(summary, ['Review disposition', '____________________']); add(summary, ['Authorized reviewer / date', '____________________']);
  for (const p of plots(data)) {
    const titleRow = summary.rowCount + 2;
    summary.mergeCells(titleRow, 1, titleRow, 8); summary.getCell(titleRow, 1).value = p.title;
    summary.getCell(titleRow, 1).font = { bold: true, size: 14, color: { argb: 'FF174B78' } }; summary.getRow(titleRow).height = 26;
    const id = book.addImage({ buffer: await plotPng(p) as any, extension: 'png' });
    summary.addImage(id, { tl: { col: 0, row: titleRow }, ext: { width: 1000, height: 280 } });
    for (let i = 1; i <= 15; i++) summary.getRow(titleRow + i).height = 15;
    const captionRow = titleRow + 16;
    summary.mergeCells(captionRow, 1, captionRow, 8); summary.getCell(captionRow, 1).value = p.caption;
    summary.getCell(captionRow, 1).alignment = { wrapText: true, vertical: 'top' }; summary.getRow(captionRow).height = 36;
  }
  add(summary, ['Monthly source values', 'Month | count | on-time reporting rate']);
  for (const h of data.history) add(summary, [h.month, `${h.count} | ${pct(h.rate)}`]);

  const supervised = sheet('Supervised_Predictions', ['Report ID', 'Instrument ID', 'Enterprise ID', 'Timestamp', 'Licence', 'Company', 'Category',
    'Instrument', 'Serial', 'Current error (unavailable)', 'Enterprise risk probability (not failure)', 'Risk level', 'Recommended action', 'Top feature', 'Drift forecast', 'Calibration interval'],
  [38, 38, 38, 25, 22, 38, 28, 30, 24, 22, 26, 18, 55, 36, 20, 22]);
  for (const r of data.rows) {
    const row = add(supervised, [r.reportId, r.instrumentId, r.organizationId, r.timestamp, r.licence, r.company, r.category,
      r.instrument, r.serial, 'N/A', r.riskProbability, r.riskLevel, r.action, r.topFeature, 'N/A', 'N/A'], high(r));
    row.getCell(11).numFmt = '0.0%';
  }
  filter(supervised);
  const anomalies = sheet('Unsupervised_Anomalies', ['Report ID', 'Instrument ID', 'Enterprise ID', 'Company', 'Category', 'Submitted timestamp', 'Anomaly score', 'Outlier', 'Cluster', 'Reason', 'Recommended action', 'Top feature', 'PC1', 'PC2'],
    [38, 38, 38, 38, 28, 26, 20, 14, 22, 55, 55, 36, 18, 18]);
  for (const r of rankedAnomalies(data.rows)) {
    const row = add(anomalies, [r.reportId, r.instrumentId, r.organizationId, r.company, r.category, r.timestamp, r.anomalyScore, r.outlier,
      r.cluster, r.reason, r.action, r.topFeature, r.pca?.[0], r.pca?.[1]], r.outlier === true);
    for (const col of [7, 13, 14]) row.getCell(col).numFmt = '0.000';
  }
  filter(anomalies);
  const profiles = sheet('Cluster_Profiles', ['Cluster', 'Record count', 'Enterprise count', 'Mean anomaly score', 'Standardized feature centroids (model feature order)'], [30, 20, 22, 24, 100]);
  for (const c of data.clusters) {
    const row = add(profiles, [c.label, c.count, c.enterpriseCount, c.averageAnomaly,
      c.centroid.map((v, i) => `${data.featureNames[i] || `Feature ${i + 1}`}: ${num(v, 6)}`).join('\n') || 'N/A']);
    row.getCell(4).numFmt = '0.000'; row.getCell(2).numFmt = '0'; row.getCell(3).numFmt = '0';
  }
  filter(profiles);
  return Buffer.from(await book.xlsx.writeBuffer());
}
