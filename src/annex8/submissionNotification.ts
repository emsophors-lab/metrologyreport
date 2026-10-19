import type { SubmissionLocation } from './submissionLocation';

const html = (value: unknown, limit = 80) => String(value ?? '').slice(0, limit)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SubmissionNotice {
  report: any;
  submittedAt: string;
  location: SubmissionLocation;
}

export function submissionTelegramText({ report, submittedAt, location }: SubmissionNotice): string {
  const time = new Date(submittedAt).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', hour12: false });
  const total = report.part2_summary?.total || {};
  const count = (key: string) => Number.isFinite(Number(total[key])) ? Math.max(0, Number(total[key])) : 0;
  const lines = [
    '<b>របាយការណ៍ថ្មី / New Annex 8 submission</b>',
    `ក្រុមហ៊ុន / Enterprise: ${html(report.enterprise_name_kh || report.enterprise_name_en || report.licence_no, 160)}`,
    `អាជ្ញាបណ្ណ / Licence: ${html(report.licence_no)}`,
    `លេខរបាយការណ៍ / Receipt: ${html(report.report_id)}`,
    `ខែ / Period: ${html(report.period_month)} · ${html(report.report_type)}`,
    `ដាក់ជូន / Submitted: ${html(time)} (GMT+7)`,
    `Manufactured: ${count('manufactured')} · Installed: ${count('installed')} · Repaired: ${count('repaired')}`,
    `On time: ${report.on_time ? 'Yes' : 'No'}`,
  ];
  if (location.status === 'captured') {
    const coordinates = `${location.latitude},${location.longitude}`;
    lines.push(`Submission device location (browser-reported, not verified): ${html(coordinates)}`,
      `Accuracy: approximately ${location.accuracy_m} m`,
      `<a href="https://www.google.com/maps?q=${coordinates}">ទីតាំងពេលដាក់ជូន / Submission location</a>`);
  } else {
    lines.push(`Submission location: ${html(location.status)} (not the registered business address)`);
  }
  return lines.join('\n');
}

export type SubmissionNotificationResult = { status: 'sent' | 'not_configured' | 'failed'; message_id?: number };

export async function notifyAnnex8Submission(notice: SubmissionNotice, deps: {
  getBot: () => Promise<any>;
  send: (token: string, chatId: string, text: string) => Promise<any>;
}): Promise<SubmissionNotificationResult> {
  try {
    const bot = await deps.getBot();
    const chatId = String(bot?.default_group_chat_id || bot?.default_chat_id || '').trim();
    const token = String(bot?.bot_token_encrypted || '').trim();
    if (!bot || bot.is_active === false || !chatId || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      return { status: 'not_configured' };
    }
    // The destination and secret always come from server-side configuration,
    // never the submit payload. Failure does not undo an accepted report.
    const result = await deps.send(token, chatId, submissionTelegramText(notice));
    if (result?.ok !== true) return { status: 'failed' };
    return { status: 'sent', ...(Number.isInteger(result.result?.message_id)
      ? { message_id: result.result.message_id } : {}) };
  } catch { return { status: 'failed' }; }
}
