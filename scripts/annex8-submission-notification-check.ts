import assert from 'node:assert/strict';
import fs from 'node:fs';
import { captureSubmissionLocation, normalizeSubmissionLocation } from '../src/annex8/submissionLocation';
import { notifyAnnex8Submission, submissionTelegramText } from '../src/annex8/submissionNotification';

const now = Date.now();
const location = normalizeSubmissionLocation({ status: 'captured', latitude: 11.55, longitude: 104.92,
  accuracy_m: 12.3, captured_at: new Date(now).toISOString(), source: 'browser_geolocation', consent: true }, now);
assert.equal(location.status, 'captured');
assert.equal(location.accuracy_m, 12);
for (const patch of [{ consent: false }, { latitude: 91 }, { longitude: 181 }, { latitude: '11.55' },
  { accuracy_m: -1 }, { latitude: NaN }, { source: 'ip' }, { captured_at: new Date(now - 130000).toISOString() },
  { captured_at: new Date(now + 40000).toISOString() }, { captured_at: 'invalid' }]) {
  assert.equal(normalizeSubmissionLocation({ ...location, ...patch }, now).status, 'unavailable');
}
assert.deepEqual(normalizeSubmissionLocation({ status: 'denied', latitude: 11, longitude: 104 }), { status: 'denied' });
assert.deepEqual(normalizeSubmissionLocation(null), { status: 'not_requested' });
let calls = 0;
const geo = { getCurrentPosition: (success: PositionCallback, failure: PositionErrorCallback, options: PositionOptions) => {
  calls++; assert.equal(options.maximumAge, 0); assert.equal(options.timeout, 8000);
  success({ coords: { latitude: 11.55, longitude: 104.92, accuracy: 10 }, timestamp: now } as GeolocationPosition);
} };
assert.equal((await captureSubmissionLocation(false, geo)).status, 'not_requested');
assert.equal(calls, 0);
assert.equal((await captureSubmissionLocation(true, geo)).status, 'captured');
assert.equal(calls, 1);
for (const [code, expected] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']] as const) {
  const failure = { getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => fail({ code } as GeolocationPositionError) };
  assert.equal((await captureSubmissionLocation(true, failure)).status, expected);
}
assert.equal((await captureSubmissionLocation(true, { getCurrentPosition: () => { throw new Error('blocked'); } })).status, 'unavailable');

const notice = { report: { enterprise_name_kh: 'Test <company> & name', licence_no: 'LIC-TEST',
  report_id: 'NMC-RPT-TEST', period_month: '2026-10', report_type: 'REGULAR', on_time: true,
  part2_summary: { total: { manufactured: 1, installed: 2, repaired: 3 } } },
  submittedAt: '2026-10-19T12:00:00.000Z', location };
const text = submissionTelegramText(notice);
assert.ok(text.includes('Test &lt;company&gt; &amp; name'));
assert.ok(text.includes('19:00:00 (GMT+7)'));
assert.ok(text.includes('https://www.google.com/maps?q=11.55,104.92'));
assert.ok(text.includes('browser-reported, not verified'));
const noLocation = submissionTelegramText({ ...notice, location: { status: 'denied' } });
assert.ok(!noLocation.includes('google.com/maps'));
assert.ok(noLocation.includes('denied'));
const long = '"'.repeat(10000);
assert.ok(submissionTelegramText({ ...notice, report: { ...notice.report,
  enterprise_name_kh: long, licence_no: long, report_id: long, period_month: long, report_type: long } }).length < 4096);

const bot = { bot_token_encrypted: '123456:test-double', default_group_chat_id: '-100999', is_active: true };
let deliveries = 0;
const deps = { getBot: async () => bot, send: async (token: string, chatId: string, message: string) => {
  deliveries++; assert.equal(token, bot.bot_token_encrypted); assert.equal(chatId, '-100999');
  assert.equal(message, text); return { ok: true, result: { message_id: 42 } };
} };
assert.deepEqual(await notifyAnnex8Submission(notice, deps), { status: 'sent', message_id: 42 });
for (const missing of [null, { ...bot, is_active: false }, { ...bot, default_group_chat_id: '' },
  { ...bot, bot_token_encrypted: 'PROTECTED_SERVER_SIDE' }]) {
  assert.deepEqual(await notifyAnnex8Submission(notice, { ...deps, getBot: async () => missing }), { status: 'not_configured' });
}
assert.equal(deliveries, 1);
assert.deepEqual(await notifyAnnex8Submission(notice, { ...deps, send: async () => { throw new Error('test network failure containing secrets'); } }), { status: 'failed' });
assert.deepEqual(await notifyAnnex8Submission(notice, { ...deps, send: async () => ({ ok: false }) }), { status: 'failed' });
const server = fs.readFileSync('server.ts', 'utf8');
const submitRoute = server.slice(server.indexOf("app.post('/api/annex8/month/submit'"), server.indexOf('/*', server.indexOf("app.post('/api/annex8/month/submit'") + 50));
assert.ok(submitRoute.includes(".eq('status', report.status)"), 'Concurrent submissions must not both notify');
assert.ok(submitRoute.indexOf('if (!submitted)') < submitRoute.indexOf('await notifyAnnex8Submission'));
assert.ok(submitRoute.includes('submission_location: submissionLocation'));
assert.ok(submitRoute.includes("getBot: () => getActiveBot('report_group')"));
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.ok(config.headers[0].headers.find((h: any) => h.key === 'Permissions-Policy').value.includes('geolocation=(self)'));
const review = fs.readFileSync('src/components/Annex8MonthReview.tsx', 'utf8');
assert.ok(review.includes('await captureSubmissionLocation(true)'), 'Submission requests a fresh fix automatically');
assert.ok(!review.includes('shareSubmissionLocation'), 'No separate location checkbox or opt-in gate');
assert.ok(review.includes('Browser location permission is required.'), 'The form discloses browser permission and Telegram sharing');
assert.ok(review.indexOf('window.confirm(') < review.indexOf('await captureSubmissionLocation(true)'), 'Location is requested only after the disclosed submission confirmation');
console.log('PASS: automatic disclosed GPS request after submission confirmation, browser permission, denial/timeout/invalid/stale handling, private server-configured Telegram destination, HTML escaping/length, GMT+7, delivery failure, submission race guard. No real GPS, Telegram messages or database writes.');
