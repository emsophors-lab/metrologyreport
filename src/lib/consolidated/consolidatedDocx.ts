import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { dataProblems, TEMPLATE_PATH, TEMPLATE_SHA256 } from './contract';
import type { ConsolidatedData } from './contract';
import type { ReportingPeriod } from './periods';

export function fillConsolidatedTemplate(template: ArrayBuffer | Uint8Array, data: ConsolidatedData) {
  const problems = dataProblems(data);
  if (problems.length) throw new Error(problems.join('\n'));
  const document = new Docxtemplater(new PizZip(template), {
    paragraphLoop: true, linebreaks: true, nullGetter: () => '',
  });
  document.render(data);
  return document;
}

export async function renderConsolidatedDocx(data: ConsolidatedData): Promise<Blob> {
  const response = await fetch(TEMPLATE_PATH, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Consolidated template fetch failed: HTTP ${response.status}`);
  const template = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', template));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== TEMPLATE_SHA256) throw new Error('The consolidated template differs from the approved v1 file.');
  return fillConsolidatedTemplate(template, data).getZip().generate({
    type: 'blob', compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function consolidatedFileName(period: ReportingPeriod, now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return `Consolidated_${period.type}_${period.key}_${date}.docx`;
}

export async function downloadConsolidatedDocx(data: ConsolidatedData, filename: string): Promise<void> {
  const blob = await renderConsolidatedDocx(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^A-Za-z0-9._-]/g, '_').replace(/(?:\.docx)?$/, '.docx');
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
