import assert from 'node:assert/strict';
import express from 'express';
import { createPasswordLoginHandler, accountAuthEmail } from '../src/auth/passwordLogin';
import { signInWithServer, LoginFailure } from '../src/auth/browserLogin';

// All credentials, tokens, users and providers in this check are test doubles.
// No production requests, account repairs or database writes are performed.
const user = { id: 'test-sa', username: 'superadmin', email: 'actual-admin@example.test', role: 'superadmin',
  password: 'test-legacy', password_hash: 'private-test-hash', is_active: true };
let rows: any[] = [user];
let lookupError: any = null;
let providerError: any = null;
let providerSession: any = { access_token: 'test-access', refresh_token: 'test-refresh' };
let seenEmail = '';
let lookupColumn = '';
let lookupValue = '';
let signIns = 0;
const db = { from: (table: string) => {
  assert.equal(table, 'users');
  return { select: () => ({ ilike: async (column: string, value: string) => {
    lookupColumn = column; lookupValue = value;
    return { data: rows, error: lookupError };
  } }) };
} };
const app = express();
app.use(express.json());
app.post('/api/auth/login', createPasswordLoginHandler({
  db,
  signIn: async (email, password) => {
    signIns++; seenEmail = email;
    return { data: { session: providerSession }, error: providerError };
  },
  publicUser: ({ password, password_hash, ...safe }) => safe,
  verifyLegacyPassword: (password, row) => password === row.password,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const request: typeof fetch = (url, options) => fetch(base + url, options);
const post = (body: any) => request('/api/auth/login', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
let savedSession: any = null;
const client = { auth: { setSession: async (session: any) => {
  savedSession = session; return { data: { session }, error: null };
} } };
try {
  // No browser registry is passed: a fresh browser can resolve the real email.
  const profile = await signInWithServer(client, '  SUPERADMIN  ', 'test-provider-password', request);
  assert.equal(seenEmail, 'actual-admin@example.test');
  assert.equal(lookupColumn, 'username');
  assert.equal(lookupValue, 'superadmin');
  assert.equal(profile.role, 'superadmin');
  assert.equal('password' in profile, false);
  assert.equal('password_hash' in profile, false);
  assert.deepEqual(savedSession, providerSession);
  await signInWithServer(client, 'ACTUAL-ADMIN@example.test', 'test-provider-password', request);
  assert.equal(lookupColumn, 'email');
  const response = await post({ username: 'superadmin', password: 'test-provider-password' });
  assert.equal(response.headers.get('cache-control'), 'no-store');

  providerError = { status: 400, code: 'invalid_credentials' };
  savedSession = null;
  await assert.rejects(() => signInWithServer(client, 'superadmin', 'wrong', request),
    (error: any) => error instanceof LoginFailure && error.code === 'INVALID_CREDENTIALS');
  assert.equal(savedSession, null);
  const legacy = await post({ username: 'superadmin', password: 'test-legacy' });
  assert.equal(legacy.status, 409);
  assert.equal((await legacy.json()).code, 'AUTH_ACCOUNT_NOT_READY');
  providerError = { status: 429 };
  assert.equal((await post({ username: 'superadmin', password: 'test' })).status, 429);
  providerError = { status: 503 };
  assert.equal((await post({ username: 'superadmin', password: 'test' })).status, 503);
  providerError = null;
  providerSession = null;
  assert.equal((await post({ username: 'superadmin', password: 'test' })).status, 503);
  providerSession = savedSession = { access_token: 'test-access', refresh_token: 'test-refresh' };

  const count = signIns;
  rows = [{ ...user, is_active: false }];
  assert.equal((await post({ username: 'superadmin', password: 'test' })).status, 401);
  rows = [];
  assert.equal((await post({ username: 'unknown', password: 'test' })).status, 401);
  rows = [user, { ...user, id: 'duplicate' }];
  assert.equal((await post({ username: 'superadmin', password: 'test' })).status, 401);
  assert.equal(signIns, count);
  rows = [user];
  assert.equal((await post({ username: '%', password: 'test' })).status, 401);
  assert.equal(lookupValue, '\\%');
  lookupError = new Error('test database unavailable');
  assert.equal((await post({ username: 'superadmin', password: 'test' })).status, 503);
  assert.equal((await post({ username: {}, password: 'test' })).status, 400);
  assert.equal((await post({ username: 'superadmin', password: '' })).status, 400);

  assert.equal(accountAuthEmail({ username: 'Legacy User', email: '' }), 'legacy_user@nmc.gov.kh');
  await assert.rejects(() => signInWithServer({ auth: { setSession: async () => ({ error: {} }) } },
    'superadmin', 'test', async () => new Response(JSON.stringify({ success: true, user,
      session: providerSession }), { status: 200 })), LoginFailure);
  await assert.rejects(() => signInWithServer(client, 'superadmin', 'test',
    async () => new Response('<html>Unavailable</html>', { status: 502 })), LoginFailure);
  console.log('PASS: fresh-browser username/email login, private registry, signed session, wrong password, inactive/unknown/ambiguous users, legacy mismatch, unavailable provider, input validation. No real accounts or data changed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
