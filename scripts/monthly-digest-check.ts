import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMonthlyDigest, previousPeriod, renderDigestMessages } from '../src/annex8/monthlyDigest';

const licences = Array.from({ length: 1055 }, (_, index) => ({ license_number: `LIC-${index}`, company_name: `Company ${index}` }));
const reports = [
  { licence_no: 'LIC-0', status: 'OPEN', report_id: null },
  { licence_no: 'LIC-1', status: 'DRAFT', report_id: null },
  { licence_no: 'LIC-2', status: 'SUBMITTED', report_id: 'OLD', on_time: true, submitted_at: '2026-10-03', part2_summary: { total: { installed: 5 } } },
  { licence_no: 'LIC-2', status: 'ACCEPTED', report_id: 'LATEST', on_time: false, submitted_at: '2026-10-09', part2_summary: { total: { installed: 7 } } },
  { licence_no: 'LIC-3', status: 'RETURNED', report_id: 'RETURNED', on_time: true },
  { licence_no: 'LIC-4', status: 'SUBMITTED', report_type: 'NIL', report_id: 'NIL', on_time: true },
  { licence_no: 'NOT-ACTIVE', status: 'SUBMITTED', part2_summary: { total: { installed: 9999 } } },
];
const digest = buildMonthlyDigest({ period: '2026-09', licences, annex8Reports: reports,
  legacyReports: [{ license_number: 'LIC-5', report_month: '09', report_year: '2026' }] });
assert.equal(digest.licensees, 1055);
assert.equal(digest.submitted.length, 4);
assert.equal(digest.missing.length, 1051);
assert.equal(digest.onTime.length, 2);
assert.equal(digest.late.length, 1);
assert.equal(digest.totals.installed, 7);
assert.ok(digest.missing.some(entry => entry.licence_no === 'LIC-1054'));
assert.ok(digest.missing.some(entry => entry.licence_no === 'LIC-0'));
assert.equal(digest.deadline, '2026-10-07');
assert.equal(buildMonthlyDigest({ period: '2026-12', licences: [], annex8Reports: [] }).deadline, '2027-01-07');
assert.equal(previousPeriod(new Date('2026-09-30T18:00:00Z')), '2026-09');
assert.equal(previousPeriod(new Date('2026-01-01T00:00:00Z')), '2025-12');
const messages = renderDigestMessages(digest);
assert.ok(messages.length > 1);
assert.ok(messages.every(message => message.length <= 4096));

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.ok(config.crons.some((cron: any) => cron.path === '/api/monthly-report-digest' && cron.schedule === '0 1 8 * *'));
const server = fs.readFileSync('server.ts', 'utf8');
const handler = server.slice(server.indexOf('const runMonthlyReportDigest'), server.indexOf('/** The headline numbers'));
assert.ok(handler.includes("app.get('/api/monthly-report-digest'"), 'GET cron registration');
assert.ok(handler.includes("app.post('/api/monthly-report-digest'"), 'Explicit POST manual send');
assert.ok(handler.includes('req.headers.authorization !== `Bearer ${secret}`'), 'Cron authentication');
assert.ok(!handler.includes('req.query.secret'), 'Secrets must not be placed in URLs');
assert.ok(handler.indexOf('if (dryRun)') < handler.indexOf('await convertHtmlToPdf'), 'Preview must not contact PDF service');
assert.ok(handler.indexOf('if (dryRun)') < handler.indexOf('await sendTelegramDocument'), 'Preview must not send');
assert.ok(handler.indexOf('if (logError)') < handler.indexOf('await sendTelegramDocument'), 'Missing duplicate log must block delivery');
assert.ok(handler.includes('Telegram destination changed'), 'Manual recipient confirmation is checked');
const settings = handler.slice(handler.indexOf("app.get('/api/monthly-report-digest/settings'"));
assert.ok(!settings.includes('bot_token_encrypted:'));
assert.ok(!settings.includes('secret: process.env.CRON_SECRET'));
assert.ok(handler.includes("selectAllRows('annex8_reports'"));
console.log('PASS: monthly digest over 1000 companies, open/draft exclusion, latest amendment, NIL/returned/legacy, scoped totals, deadlines, GMT+7, Telegram limits, cron GET/auth/config, read-only preview, fail-closed log, destination validation. No network or database writes.');
