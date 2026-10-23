/**
 * Filling the Smart Analytics template.
 *
 * Exactly the pattern of src/lib/annex8/annex8Docx.ts and the consolidated
 * report: fetch the template as bytes, check its SHA-256 against the approved
 * file, fill the tags, hand back a .docx. The template is never opened,
 * edited, restyled or regenerated here — this module only supplies values.
 *
 * The hash check is the point. If someone replaces the template with a
 * different file, generation stops with a clear message rather than quietly
 * producing an official document in an unapproved layout.
 */
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { dataProblems, TEMPLATE_PATH, TEMPLATE_SHA256 } from './contract';
import type { AnalyticsData } from './contract';
import type { ReportingPeriod } from '../consolidated/periods';

export class AnalyticsTemplateError extends Error {
  /** Shown to the user in Khmer; `message` carries the technical detail. */
  readonly kh: string;
  constructor(kh: string, message: string) {
    super(message);
    this.name = 'AnalyticsTemplateError';
    this.kh = kh;
  }
}

export function fillAnalyticsTemplate(template: ArrayBuffer | Uint8Array, data: AnalyticsData) {
  const problems = dataProblems(data);
  if (problems.length) {
    throw new AnalyticsTemplateError(
      'ទិន្នន័យរបាយការណ៍មិនពេញលេញ ឬមិនត្រឹមត្រូវ។',
      problems.join('\n'),
    );
  }

  let zip: PizZip;
  try {
    zip = new PizZip(template);
  } catch (err: any) {
    // A .docx is a zip. Anything else here is usually an HTML error page that
    // a dev server returned in place of the file.
    throw new AnalyticsTemplateError(
      'មិនអាចបើកទម្រង់របាយការណ៍បានទេ (ឯកសារមិនមែនជា .docx)។',
      `Template is not a valid .docx package: ${err?.message || err}`,
    );
  }

  const document = new Docxtemplater(zip, {
    paragraphLoop: true, linebreaks: true, nullGetter: () => '',
  });
  try {
    document.render(data);
  } catch (err: any) {
    const detail = (err?.properties?.errors || []).map((e: any) =>
      `${e.properties?.id || e.name}: ${e.properties?.explanation || e.message}`).join('\n');
    throw new AnalyticsTemplateError(
      'មិនអាចបំពេញទម្រង់របាយការណ៍បានទេ។ សូមពិនិត្យស្លាកក្នុងឯកសារ Word។',
      detail || err?.message || String(err),
    );
  }
  return document;
}

/** The approved template, fetched and verified. Browser only. */
export async function fetchAnalyticsTemplate(): Promise<ArrayBuffer> {
  const response = await fetch(TEMPLATE_PATH, { cache: 'no-cache' });
  if (!response.ok) {
    throw new AnalyticsTemplateError(
      'រកមិនឃើញទម្រង់របាយការណ៍វិភាគទេ។',
      `Analytics template fetch failed: HTTP ${response.status} for ${TEMPLATE_PATH}`,
    );
  }
  const template = await response.arrayBuffer();

  const signature = new Uint8Array(template.slice(0, 2));
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new AnalyticsTemplateError(
      'ទម្រង់របាយការណ៍វិភាគមិនត្រឹមត្រូវទេ។',
      `${TEMPLATE_PATH} did not return a .docx — the dev server likely served index.html instead.`,
    );
  }

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', template));
  const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== TEMPLATE_SHA256) {
    throw new AnalyticsTemplateError(
      'ទម្រង់របាយការណ៍វិភាគខុសពីឯកសារដែលបានអនុម័ត។',
      `Analytics template SHA-256 ${hash} does not match the approved ${TEMPLATE_SHA256}.`,
    );
  }
  return template;
}

export async function renderAnalyticsDocx(data: AnalyticsData): Promise<Blob> {
  const template = await fetchAnalyticsTemplate();
  return fillAnalyticsTemplate(template, data).getZip().generate({
    type: 'blob', compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * Analytics_<MONTH|QUARTER|SEMESTER|YEAR>_<period>_<DRAFT|FINAL>_<date>.docx
 *
 * DRAFT is in the name on purpose: a draft that reaches a desk looking like a
 * final report is worse than no report.
 */
export function analyticsFileName(
  period: ReportingPeriod, status: 'DRAFT' | 'FINAL', now = new Date(),
): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return `Analytics_${period.type}_${period.key}_${status}_${date}.docx`;
}

export async function downloadAnalyticsDocx(data: AnalyticsData, filename: string): Promise<void> {
  const blob = await renderAnalyticsDocx(data);
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
