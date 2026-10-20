import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';

// Run after npm run build. Exercise the actual function entry point with the
// original request URL that Vercel forwards. No real credentials or DB access.
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.DB_DRIVER = 'supabase';
process.env.VITE_SUPABASE_URL = 'https://routing-check.invalid.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'routing-check-placeholder-not-a-real-key';
process.env.ALLOW_LEGACY_API_HEADER_AUTH = 'false';
process.env.CRON_SECRET = 'routing-test-only-not-a-real-secret';

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.deepEqual(config.rewrites[0], { source: '/api/:path*', destination: '/api' });
assert.ok(config.functions['api/index.ts'].includeFiles.includes('dist/server.cjs'));
assert.ok(config.functions['api/index.ts'].includeFiles.includes('dist/templates/**'));
assert.ok(!fs.existsSync('api/[...path].ts'));
assert.ok(config.rewrites.some((rule: any) => rule.source === '/verify-license/:path*' && rule.destination === '/index.html'));
assert.equal(config.crons.length, 2);

const { default: handler } = await import('../api/index');
const server = http.createServer((req, res) => {
  // Fail rather than contacting a configured backend if a route unexpectedly
  // tries to query the database without authenticating first.
  handler(req, res);
});
server.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init: any) => {
  const url = String(input);
  if (!url.startsWith(base + '/')) throw new Error('Routing check must not contact external services');
  return realFetch(input, init);
}) as typeof fetch;
try {
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const qrPage = await fetch(base + '/api/report-issuance/check/' + 'a'.repeat(43));
  assert.equal(qrPage.status, 200, 'Direct scanned QR URLs must reach the API on Vercel');
  assert.match(qrPage.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(qrPage.headers.get('cache-control'), 'no-store');
  assert.ok((await qrPage.text()).includes('Check Downloaded File'));
  assert.equal((await fetch(base + '/api/report-issuance/verify/invalid')).status, 400);
  assert.equal((await fetch(base + '/api/report-issuance/export', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'legacy', format: 'docx', ids: [] }) })).status, 401);
  for (const path of [
    '/api/annex8/overview?year=2026',
    '/api/users/me',
    '/api/annex8/my-reports',
    '/api/consolidated/preview?period_type=MONTH&year=2026&index=4',
    '/api/monthly-report-digest/settings',
    '/api/monthly-report-digest',
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401, `${path}: ${await response.text()}`);
  }
  const review = await fetch(base + '/api/annex8/month/review?period_month=2026-10');
  assert.equal(review.status, 400);
  assert.equal((await review.json()).error, 'report_uuid is required.');
  const unauthorizedDigest = await fetch(base + '/api/monthly-report-digest', { method: 'POST' });
  assert.equal(unauthorizedDigest.status, 401);
  const forcedCron = await fetch(base + '/api/monthly-report-digest?force=1', {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  assert.equal(forcedCron.status, 400);
  const login = await fetch(base + '/api/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(login.status, 400);
  assert.equal((await login.json()).code, 'INVALID_INPUT');
  const missing = '/api/routing-check/not-a-route?year=2026&month=4';
  const response = await fetch(base + missing);
  assert.equal(response.status, 404);
  assert.ok((await response.json()).error.includes(missing), 'Express must retain the full path and query');
  console.log('PASS: explicit API rewrite, bundled entry point, health, nested protected APIs, login body, original query/path, verification route and cron configuration. No external services or data changed.');
} finally {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
