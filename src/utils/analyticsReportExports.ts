import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import { jsPDF } from 'jspdf';
import pptxgen from 'pptxgenjs';
import { formatKhmerOfficialDateBlock } from './khmerOfficialDate';

export type AnalyticsTableRow = [string, number];

export interface AnalyticsExportData {
  generatedDate: string;
  reportDate?: Date;
  khmerLunarDateOverride?: string;
  total: number;
  active: number;
  activePct: number;
  expiring: number;
  expired: number;
  gps: number;
  noGps: number;
  telegram: number;
  noTelegram: number;
  reportCount: number;
  noReportCount: number;
  criticalRiskCount: number;
  highRiskCount: number;
  statusRows: AnalyticsTableRow[];
  provinceRows: AnalyticsTableRow[];
  serviceRows: AnalyticsTableRow[];
  instrumentRows: AnalyticsTableRow[];
  monthlyRows: AnalyticsTableRow[];
  riskRows: AnalyticsTableRow[];
  topRisks: Array<{ company: string; license: string; level: string; score: number }>;
  exp30: number;
  exp60: number;
  exp90: number;
}

const REPORT_TITLE_KH = 'របាយការណ៍វិភាគទិន្នន័យអាជ្ញាប័ណ្ណមាត្រាសាស្ត្រ';
const REPORT_TITLE_EN = 'Metrology License Data Analytics Report';
const MINISTRY_KH = 'ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍';
const MINISTRY_EN = 'Ministry of Industry, Science, Technology & Innovation';
const NMC_KH = 'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ';
const NMC_EN = 'National Metrology Center of Cambodia';
const BLUE = '003B73';
const GOLD = 'D6A329';
const LIGHT_BLUE = 'EAF2FA';
const LIGHT_GOLD = 'FFF7E2';
const TEXT = '1F2937';
const PPT_RECT = 'rect' as const;
const PPT_ROUND_RECT = 'roundRect' as const;

const BENCHMARK_NOTE =
  'ISO/IEC 17025 supports competence and valid measurement results for testing and calibration laboratories. ILAC P10 emphasizes metrological traceability of measurement results. OIML legal metrology infrastructure supports consumer protection, fair trade, and confidence in measurements. BIPM digital metrology promotes FAIR data, digital calibration certificates, and trustworthy digital transformation in metrology.';

const RECOMMENDATIONS = [
  'Strengthen risk-based supervision of licensed enterprises.',
  'Improve GPS coverage for all licensed enterprises.',
  'Improve Telegram/digital connectivity for timely reminders and reporting.',
  'Strengthen monthly report compliance.',
  'Prioritize inspection of expired, expiring, or non-reporting enterprises.',
  'Develop digital evidence records for repair, installation, and manufacturing of measuring instruments.',
  'Prepare future integration with digital calibration certificates and FAIR metrology data.'
];

function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}

function safeRows(rows: AnalyticsTableRow[], fallback = 'Data not available') {
  return rows.length > 0 ? rows : [[fallback, 0] as AnalyticsTableRow];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function docText(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    size: opts.size || 22,
    color: opts.color || TEXT,
    font: 'Khmer OS Siemreap'
  });
}

function docParagraph(text: string, opts: { heading?: boolean; center?: boolean; color?: string; spacing?: number } = {}) {
  return new Paragraph({
    heading: opts.heading ? HeadingLevel.HEADING_2 : undefined,
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: opts.spacing ?? 160 },
    children: [docText(text, { bold: opts.heading, size: opts.heading ? 28 : 22, color: opts.color })]
  });
}

function docSectionTitle(title: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 120 },
    border: {
      bottom: { color: GOLD, style: BorderStyle.SINGLE, size: 8, space: 2 }
    },
    children: [docText(title, { bold: true, size: 28, color: BLUE })]
  });
}

function docCell(text: string, header = false) {
  return new TableCell({
    shading: header ? { fill: BLUE, type: ShadingType.CLEAR } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'B8C4D6' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'B8C4D6' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'B8C4D6' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'B8C4D6' }
    },
    children: [
      new Paragraph({
        children: [docText(text, { bold: header, color: header ? 'FFFFFF' : TEXT })]
      })
    ]
  });
}

function docTable(headers: string[], rows: string[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(header => docCell(header, true)) }),
      ...rows.map(row => new TableRow({ children: row.map(cell => docCell(cell)) }))
    ]
  });
}

function metricRows(data: AnalyticsExportData) {
  return [
    ['Total licenses / អាជ្ញាប័ណ្ណសរុប', String(data.total)],
    ['Active licenses / កំពុងប្រើប្រាស់', `${data.active} (${data.activePct}%)`],
    ['Expiring soon / ជិតផុតកំណត់', String(data.expiring)],
    ['Expired / ផុតកំណត់', String(data.expired)],
    ['GPS linked / មាន GPS', String(data.gps)],
    ['No GPS / គ្មាន GPS', String(data.noGps)],
    ['Telegram linked / ភ្ជាប់ Telegram', String(data.telegram)],
    ['Telegram not linked / មិនទាន់ភ្ជាប់', String(data.noTelegram)],
    ['Monthly reports / របាយការណ៍ប្រចាំខែ', String(data.reportCount)],
    ['No matching report / គ្មានរបាយការណ៍', String(data.noReportCount)]
  ];
}

function getOfficialDateBlock(data: AnalyticsExportData) {
  return formatKhmerOfficialDateBlock(data.reportDate || new Date(), {
    khmerLunarDateOverride: data.khmerLunarDateOverride,
    location: 'រាជធានីភ្នំពេញ'
  });
}

export async function generateAnalyticsDocxReport(data: AnalyticsExportData) {
  const officialDate = getOfficialDateBlock(data);
  const doc = new Document({
    creator: NMC_EN,
    description: REPORT_TITLE_EN,
    title: REPORT_TITLE_EN,
    styles: {
      default: {
        document: {
          run: { font: 'Khmer OS Siemreap', size: 22, color: TEXT }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1080, bottom: 1080, left: 1080 }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [docText(NMC_EN, { size: 18, color: '64748B' })]
              })
            ]
          })
        },
        children: [
          docParagraph(MINISTRY_KH, { center: true, color: BLUE, spacing: 80 }),
          docParagraph(MINISTRY_EN, { center: true, color: BLUE, spacing: 160 }),
          docParagraph(NMC_KH, { center: true, color: BLUE, spacing: 80 }),
          docParagraph(NMC_EN, { center: true, color: BLUE, spacing: 400 }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { bottom: { color: GOLD, style: BorderStyle.SINGLE, size: 16, space: 6 } },
            spacing: { after: 420 },
            children: [docText(REPORT_TITLE_KH, { bold: true, size: 34, color: BLUE })]
          }),
          docParagraph(REPORT_TITLE_EN, { center: true, color: BLUE, spacing: 320 }),
          docParagraph(`Date generated: ${data.generatedDate}`, { center: true }),
          docParagraph(officialDate.lunarLine, { center: true, color: BLUE, spacing: 80 }),
          docParagraph(officialDate.gregorianLine, { center: true, color: BLUE, spacing: 240 }),
          docParagraph(`Prepared by: ${NMC_EN}`, { center: true }),
          new Paragraph({ children: [new PageBreak()] }),

          docSectionTitle('1. Executive Summary / សេចក្តីសង្ខេប'),
          docParagraph(`This official analytics report summarizes ${data.total} metrology enterprise licenses, ${data.reportCount} monthly reports, and key digital supervision indicators. Active licenses represent ${data.activePct}% of filtered license records.`),
          docParagraph(`GPS coverage is ${data.gps} linked and ${data.noGps} not linked. Telegram connectivity is ${data.telegram} linked and ${data.noTelegram} not linked. Critical risk records: ${data.criticalRiskCount}; high risk records: ${data.highRiskCount}.`),

          docSectionTitle('2. Key Statistics / ស្ថិតិសំខាន់ៗ'),
          docTable(['Metric', 'Value'], metricRows(data)),

          docSectionTitle('3. License Status Analysis'),
          docTable(['Status', 'Count'], safeRows(data.statusRows).map(([label, count]) => [label, String(count)])),

          docSectionTitle('4. GPS and Telegram Connectivity Analysis'),
          docTable(['Indicator', 'Value'], [
            ['GPS linked', String(data.gps)],
            ['No GPS', String(data.noGps)],
            ['Telegram linked', String(data.telegram)],
            ['Telegram not linked', String(data.noTelegram)]
          ]),

          docSectionTitle('5. Compliance and Risk Analysis'),
          docTable(['Risk level', 'Count'], safeRows(data.riskRows).map(([label, count]) => [label, String(count)])),
          docTable(
            ['Enterprise', 'License', 'Risk', 'Score'],
            (data.topRisks.length ? data.topRisks : [{ company: 'Data not available', license: 'Data not available', level: 'Data not available', score: 0 }])
              .map(item => [item.company, item.license, item.level, String(item.score)])
          ),

          docSectionTitle('6. Geography, Service Scope, and Instrument Types'),
          docTable(['Province / Area', 'Count'], safeRows(data.provinceRows).slice(0, 8).map(([label, count]) => [label, String(count)])),
          docTable(['Service type', 'Count'], safeRows(data.serviceRows).map(([label, count]) => [label, String(count)])),
          docTable(['Instrument type', 'Count'], safeRows(data.instrumentRows).slice(0, 8).map(([label, count]) => [label, String(count)])),

          docSectionTitle('7. Monthly Compliance and Expiry Forecast'),
          docParagraph(`${data.noReportCount} licensed enterprises have no matching monthly report in the filtered period.`),
          docTable(['Expiry window', 'License count'], [
            ['Within 30 days', String(data.exp30)],
            ['31-60 days', String(data.exp60)],
            ['61-90 days', String(data.exp90)]
          ]),

          docSectionTitle('8. International Benchmark Note'),
          docParagraph(BENCHMARK_NOTE),

          docSectionTitle('9. Recommendations for MISTI and NMC'),
          ...RECOMMENDATIONS.map((item, index) => docParagraph(`${index + 1}. ${item}`)),

          docSectionTitle('10. Conclusion'),
          docParagraph('The National Metrology Center of Cambodia should continue strengthening digital supervision, risk-based inspection, GPS completeness, Telegram connectivity, and structured reporting records to support fair trade, consumer protection, and trusted national measurement services.'),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 280, after: 80 },
            children: [docText(officialDate.lunarLine, { size: 22, color: BLUE })]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 120 },
            children: [docText(officialDate.gregorianLine, { size: 22, color: BLUE })]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [docText('Prepared by / អ្នករៀបចំរបាយការណ៍', { bold: true, size: 22, color: TEXT })]
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `nmc-data-analytics-${todaySlug()}.docx`);
}

function pdfAddHeader(pdf: jsPDF, title: string, page: number) {
  pdf.setFillColor(0, 59, 115);
  pdf.rect(0, 0, 595, 54, 'F');
  pdf.setDrawColor(214, 163, 41);
  pdf.setLineWidth(3);
  pdf.line(0, 54, 595, 54);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(title, 42, 32);
  pdf.setFontSize(9);
  pdf.text(`Page ${page}`, 520, 32);
  pdf.setTextColor(31, 41, 55);
}

export function generateAnalyticsPdfReport(data: AnalyticsExportData) {
  const officialDate = getOfficialDateBlock(data);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 86;
  let page = 1;
  const left = 42;
  const width = 510;

  const ensure = (space: number) => {
    if (y + space <= 780) return;
    pdf.addPage();
    page += 1;
    pdfAddHeader(pdf, REPORT_TITLE_EN, page);
    y = 84;
  };
  const heading = (text: string) => {
    ensure(42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(0, 59, 115);
    pdf.text(text, left, y);
    y += 8;
    pdf.setDrawColor(214, 163, 41);
    pdf.setLineWidth(1.4);
    pdf.line(left, y, left + width, y);
    y += 22;
  };
  const paragraph = (text: string) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(31, 41, 55);
    const lines = pdf.splitTextToSize(text, width);
    ensure(lines.length * 14 + 12);
    pdf.text(lines, left, y);
    y += lines.length * 14 + 12;
  };
  const table = (headers: string[], rows: string[][]) => {
    const colWidth = width / headers.length;
    ensure(26 + rows.length * 24);
    pdf.setFillColor(0, 59, 115);
    pdf.rect(left, y, width, 24, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    headers.forEach((header, index) => pdf.text(header, left + index * colWidth + 8, y + 16));
    y += 24;
    pdf.setFont('helvetica', 'normal');
    rows.forEach((row, rowIndex) => {
      ensure(24);
      pdf.setFillColor(rowIndex % 2 === 0 ? 248 : 255, rowIndex % 2 === 0 ? 250 : 255, rowIndex % 2 === 0 ? 252 : 255);
      pdf.rect(left, y, width, 24, 'F');
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(left, y, width, 24);
      pdf.setTextColor(31, 41, 55);
      row.forEach((cell, index) => pdf.text(String(cell).slice(0, 42), left + index * colWidth + 8, y + 16));
      y += 24;
    });
    y += 16;
  };

  pdfAddHeader(pdf, REPORT_TITLE_EN, page);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(0, 59, 115);
  pdf.text(REPORT_TITLE_EN, left, y);
  y += 24;
  pdf.setFontSize(11);
  pdf.text(MINISTRY_EN, left, y);
  y += 16;
  pdf.text(NMC_EN, left, y);
  y += 24;
  paragraph(`Date generated: ${data.generatedDate}. Prepared by: ${NMC_EN}.`);
  paragraph(officialDate.fullText);

  heading('1. Executive Summary');
  paragraph(`This formal ministerial analytics report summarizes ${data.total} metrology licenses and ${data.reportCount} monthly reports. Active licenses represent ${data.activePct}% of filtered license records.`);
  paragraph(`GPS linked: ${data.gps}; no GPS: ${data.noGps}. Telegram linked: ${data.telegram}; not linked: ${data.noTelegram}. Critical risk: ${data.criticalRiskCount}; high risk: ${data.highRiskCount}.`);

  heading('2. Key Statistics');
  table(['Metric', 'Value'], metricRows(data));

  heading('3. License Status Analysis');
  table(['Status', 'Count'], safeRows(data.statusRows).map(([label, count]) => [label, String(count)]));

  heading('4. Connectivity and Risk');
  table(['Indicator', 'Value'], [
    ['GPS linked', String(data.gps)],
    ['No GPS', String(data.noGps)],
    ['Telegram linked', String(data.telegram)],
    ['Telegram not linked', String(data.noTelegram)],
    ['No matching monthly report', String(data.noReportCount)]
  ]);
  table(['Risk level', 'Count'], safeRows(data.riskRows).map(([label, count]) => [label, String(count)]));

  heading('5. Findings');
  paragraph(`Top provinces/areas: ${safeRows(data.provinceRows).slice(0, 5).map(([label, count]) => `${label} (${count})`).join(', ')}.`);
  paragraph(`Top instrument types: ${safeRows(data.instrumentRows).slice(0, 5).map(([label, count]) => `${label} (${count})`).join(', ')}.`);

  heading('6. International Benchmark Note');
  paragraph(BENCHMARK_NOTE);

  heading('7. Recommendations');
  RECOMMENDATIONS.forEach((item, index) => paragraph(`${index + 1}. ${item}`));

  heading('8. Conclusion');
  paragraph('NMC should continue strengthening digital evidence records, monthly compliance monitoring, GPS completeness, Telegram connectivity, and risk-based inspection for trusted measurement services.');
  ensure(58);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(0, 59, 115);
  pdf.text(pdf.splitTextToSize(officialDate.lunarLine, 250), 552, y, { align: 'right' });
  y += 16;
  pdf.text(pdf.splitTextToSize(officialDate.gregorianLine, 250), 552, y, { align: 'right' });
  y += 20;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Prepared by / អ្នករៀបចំរបាយការណ៍', 552, y, { align: 'right' });

  pdf.save(`nmc-data-analytics-${todaySlug()}.pdf`);
}

function addPptHeader(slide: pptxgen.Slide, title: string) {
  slide.background = { color: 'F4F7FB' };
  slide.addShape(PPT_RECT, { x: 0, y: 0, w: 13.333, h: 0.62, fill: { color: BLUE }, line: { color: BLUE } });
  slide.addShape(PPT_RECT, { x: 0, y: 0.62, w: 13.333, h: 0.05, fill: { color: GOLD }, line: { color: GOLD } });
  slide.addText(title, { x: 0.45, y: 0.16, w: 10.7, h: 0.3, fontFace: 'Arial', fontSize: 13, bold: true, color: 'FFFFFF' });
  slide.addText(NMC_EN, { x: 10.6, y: 7.08, w: 2.25, h: 0.2, fontSize: 7, color: '64748B', align: 'right' });
}

function pptCard(slide: pptxgen.Slide, label: string, value: string, x: number, y: number, color = BLUE) {
  slide.addShape(PPT_ROUND_RECT, {
    x, y, w: 2.25, h: 1.02,
    rectRadius: 0.08,
    fill: { color: 'FFFFFF' },
    line: { color: 'D7E1EF', width: 1 }
  });
  slide.addText(value, { x: x + 0.15, y: y + 0.16, w: 1.95, h: 0.36, fontSize: 20, bold: true, color, align: 'center' });
  slide.addText(label, { x: x + 0.12, y: y + 0.58, w: 2.0, h: 0.3, fontSize: 8.5, bold: true, color: '475569', align: 'center', fit: 'shrink' });
}

function pptBullets(slide: pptxgen.Slide, lines: string[], x = 0.65, y = 1.3, w = 11.9, h = 4.9) {
  slide.addShape(PPT_ROUND_RECT, { x, y, w, h, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: 'D7E1EF' } });
  slide.addText(lines.map(line => `• ${line}`).join('\n'), {
    x: x + 0.35,
    y: y + 0.35,
    w: w - 0.7,
    h: h - 0.7,
    fontFace: 'Arial',
    fontSize: 17,
    color: TEXT,
    fit: 'shrink',
    breakLine: false
  });
}

function addRowsSlide(pptx: pptxgen, title: string, rows: AnalyticsTableRow[], note?: string) {
  const slide = pptx.addSlide();
  addPptHeader(slide, title);
  slide.addText(title, { x: 0.62, y: 0.95, w: 8.8, h: 0.35, fontSize: 22, bold: true, color: BLUE });
  const shown = safeRows(rows).slice(0, 8);
  const max = Math.max(1, ...shown.map(([, count]) => count));
  shown.forEach(([label, count], index) => {
    const y = 1.62 + index * 0.52;
    slide.addText(label, { x: 0.75, y, w: 3.1, h: 0.25, fontSize: 10.5, bold: true, color: TEXT, fit: 'shrink' });
    slide.addShape(PPT_RECT, { x: 3.95, y: y + 0.03, w: 7.1, h: 0.16, fill: { color: 'E2E8F0' }, line: { color: 'E2E8F0' } });
    slide.addShape(PPT_RECT, { x: 3.95, y: y + 0.03, w: Math.max(0.08, (count / max) * 7.1), h: 0.16, fill: { color: GOLD }, line: { color: GOLD } });
    slide.addText(String(count), { x: 11.25, y: y - 0.02, w: 0.8, h: 0.24, fontSize: 11, bold: true, color: BLUE, align: 'right' });
  });
  if (note) slide.addText(note, { x: 0.75, y: 6.35, w: 11.6, h: 0.35, fontSize: 11, color: '64748B', italic: true });
}

export async function generateAnalyticsPptxBriefing(data: AnalyticsExportData) {
  const officialDate = getOfficialDateBlock(data);
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = NMC_EN;
  pptx.company = NMC_EN;
  pptx.subject = REPORT_TITLE_EN;
  pptx.title = REPORT_TITLE_EN;
  pptx.theme = {
    headFontFace: 'Arial',
    bodyFontFace: 'Arial'
  };

  let slide = pptx.addSlide();
  slide.background = { color: BLUE };
  slide.addShape(PPT_RECT, { x: 0, y: 5.7, w: 13.333, h: 0.08, fill: { color: GOLD }, line: { color: GOLD } });
  slide.addText(REPORT_TITLE_EN, { x: 0.7, y: 1.4, w: 11.8, h: 0.55, fontSize: 30, bold: true, color: 'FFFFFF', align: 'center' });
  slide.addText(REPORT_TITLE_KH, { x: 0.7, y: 2.08, w: 11.8, h: 0.4, fontSize: 18, bold: true, color: 'F8E7B3', align: 'center', fit: 'shrink' });
  slide.addText(`${NMC_EN}\n${MINISTRY_EN}\n${officialDate.fullText}`, { x: 1.25, y: 3.05, w: 10.8, h: 1.55, fontSize: 15, color: 'FFFFFF', align: 'center', breakLine: false, fit: 'shrink' });

  slide = pptx.addSlide();
  addPptHeader(slide, 'Executive Summary');
  slide.addText('Executive Summary', { x: 0.62, y: 0.95, w: 8, h: 0.4, fontSize: 24, bold: true, color: BLUE });
  pptBullets(slide, [
    `${data.total} enterprise licenses analyzed with ${data.reportCount} monthly reports.`,
    `Active licenses: ${data.active} (${data.activePct}%). Expiring soon: ${data.expiring}. Expired: ${data.expired}.`,
    `GPS linked: ${data.gps}; No GPS: ${data.noGps}. Telegram linked: ${data.telegram}; Not linked: ${data.noTelegram}.`,
    `Critical risk: ${data.criticalRiskCount}; High risk: ${data.highRiskCount}.`
  ]);

  slide = pptx.addSlide();
  addPptHeader(slide, 'Key Statistics');
  slide.addText('Key Statistics / ស្ថិតិសំខាន់ៗ', { x: 0.62, y: 0.95, w: 8, h: 0.4, fontSize: 24, bold: true, color: BLUE, fit: 'shrink' });
  pptCard(slide, 'Total licenses', String(data.total), 0.75, 1.65);
  pptCard(slide, 'Active', String(data.active), 3.15, 1.65, '16803A');
  pptCard(slide, 'Expiring soon', String(data.expiring), 5.55, 1.65, 'B7791F');
  pptCard(slide, 'Expired', String(data.expired), 7.95, 1.65, 'B91C1C');
  pptCard(slide, 'GPS linked', String(data.gps), 0.75, 3.1);
  pptCard(slide, 'No GPS', String(data.noGps), 3.15, 3.1, '64748B');
  pptCard(slide, 'Telegram linked', String(data.telegram), 5.55, 3.1, '6D28D9');
  pptCard(slide, 'No report', String(data.noReportCount), 7.95, 3.1, 'B91C1C');

  addRowsSlide(pptx, 'License Status Analysis', data.statusRows);
  addRowsSlide(pptx, 'GPS and Telegram Connectivity', [
    ['GPS linked', data.gps],
    ['No GPS', data.noGps],
    ['Telegram linked', data.telegram],
    ['Telegram not linked', data.noTelegram]
  ]);
  addRowsSlide(pptx, 'Compliance Risk Analysis', data.riskRows, `No matching monthly report: ${data.noReportCount}. Expiring within 30/60/90 days: ${data.exp30}/${data.exp60}/${data.exp90}.`);

  slide = pptx.addSlide();
  addPptHeader(slide, 'Recommendations for MISTI and NMC');
  slide.addText('Recommendations for MISTI and NMC', { x: 0.62, y: 0.95, w: 10, h: 0.4, fontSize: 23, bold: true, color: BLUE });
  pptBullets(slide, RECOMMENDATIONS, 0.65, 1.35, 11.9, 4.9);
  slide.addText(officialDate.fullText, { x: 6.6, y: 6.35, w: 5.75, h: 0.42, fontSize: 8.5, color: BLUE, align: 'right', fit: 'shrink' });

  const output = await pptx.write({ outputType: 'arraybuffer' });
  const blob = new Blob([output as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
  downloadBlob(blob, `nmc-data-analytics-summary-${todaySlug()}.pptx`);
}
