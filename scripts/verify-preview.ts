/**
 * Look at the QR verification page without a database.
 *
 * The page has four states an inspector can land on — issued, draft,
 * revoked, and no such record — and three of them are awkward to reach in a
 * real deployment. Serving them from fixtures makes the design reviewable,
 * and it reproduces the production Content-Security-Policy exactly, so a
 * change that reaches for a web font or an image file fails here rather than
 * in front of a licensee.
 *
 *   npm run reports:qr-preview     then open /?case=ok|draft|revoked|missing
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { verificationPage } from '../src/reports/issuance';

const TOKEN = 'A'.repeat(43);
const PORT = Number(process.env.PORT || 4319);

const FIXTURES: Record<string, any> = {
  ok: {
    id: '24bc804d-9d3d-4847-80d4-2c064e64832a',
    title: 'របាយការណ៍ប្រចាំខែស្តីពីឧបករណ៍មាត្រាសាស្ត្រដែលបានផ្ទៀងផ្ទាត់',
    company: 'Angkor Fuel Distribution Co., Ltd.',
    licence: 'LIC-0031', period: '2026-10',
    issued_at: '2026-10-25T11:30:06.566+00:00',
    format: 'docx', basis: 'database', state: 'issued',
  },
  // No company on the record, to check the muted em dash rather than a blank.
  draft: {
    id: '7f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
    title: 'របាយការណ៍ប្រចាំខែស្តីពីឧបករណ៍មាត្រាសាស្ត្រដែលបានផ្ទៀងផ្ទាត់',
    company: '', licence: 'LIC-0044', period: '2026-10',
    issued_at: '2026-10-25T04:10:00.000+00:00',
    format: 'pdf', basis: 'draft', state: 'issued',
  },
  revoked: {
    id: 'dead0000-0000-4000-8000-000000000001',
    title: 'របាយការណ៍ប្រចាំខែស្តីពីឧបករណ៍មាត្រាសាស្ត្រដែលបានផ្ទៀងផ្ទាត់',
    company: 'Mekong Scales & Measures', licence: 'LIC-0012', period: '2026-09',
    issued_at: '2026-09-30T09:00:00.000+00:00',
    format: 'docx', basis: 'database', state: 'revoked',
  },
};

http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const which = url.searchParams.get('case') || 'ok';

  if (url.pathname.startsWith('/api/report-issuance/verify/')) {
    if (which === 'missing' || !FIXTURES[which]) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not found' }));
    }
    const body: any = { ...FIXTURES[which] };
    // A match only for the issued fixture, so both outcomes are reviewable.
    if (url.searchParams.has('sha256')) body.file_match = which === 'ok';
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(body));
  }

  const nonce = crypto.randomBytes(18).toString('base64');
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    // Byte for byte what server.ts sends. The point of the harness.
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
  });
  // Carry the chosen case through to the stub endpoint.
  res.end(verificationPage(TOKEN, nonce)
    .replace(`/verify/${TOKEN}'`, `/verify/${TOKEN}?case=${which}'`)
    .replace("+ '?sha256=' +", "+ '&sha256=' +"));
}).listen(PORT, () => {
  console.log(`verification page preview: http://localhost:${PORT}/?case=ok`);
  console.log('cases: ok | draft | revoked | missing');
});
