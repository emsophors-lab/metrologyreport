import assert from 'node:assert/strict';
import express from 'express';
import { createPasswordLoginHandler } from '../src/auth/passwordLogin';
import { legacyCompanyEmail, migrateMissingCompanyAuth } from '../src/auth/legacyCompanyLogin';

// Entirely synthetic providers and credentials. No real accounts are read or changed.
const company = { id: 'test-company', username: 'company-test', email: 'contact@example.test', role: 'company',
  is_active: true, password: 'synthetic-current-registry-password' };
const alias = legacyCompanyEmail(company);
assert.ok(alias.split('@')[0].length <= 64);
let rows: any[] = [company];
let authRows: any[] = [];
let lookupError = false;
let providerOutage = false;
let authPassword = company.password;
let creations = 0;
const invalid = () => ({ data: { session: null }, error: { status: 400, code: 'invalid_credentials' } });
const signIn = async (email: string, password: string) => {
  if (providerOutage) return { data: null, error: { status: 503 } };
  const auth = authRows.find(row => row.email === email);
  if (!auth || password !== authPassword) return invalid();
  return { data: { user: auth, session: { access_token: 'fake-access', refresh_token: 'fake-refresh' } }, error: null };
};
const migrationDeps = {
  listUsers: async () => lookupError ? { error: new Error('Unavailable') } : { data: { users: authRows }, error: null },
  createUser: async (attributes: any) => {
    creations++;
    assert.equal(attributes.password, company.password);
    assert.equal(attributes.email, alias);
    assert.notEqual(attributes.email, company.email, 'Never claim ownership of a contact email');
    const auth = { id: 'fake-auth-id', ...attributes };
    authRows.push(auth);
    return { data: { user: auth }, error: null };
  },
  signIn,
};
const app = express();
app.use(express.json());
app.post('/api/login', createPasswordLoginHandler({
  db: { from: () => ({ select: () => ({ ilike: async () => ({ data: rows, error: null }) }) }) },
  signIn,
  publicUser: ({ password, ...safe }: any) => safe,
  verifyLegacyPassword: (password, row) => password === row.password,
  companyAlias: legacyCompanyEmail,
  migrateCompany: (user, password) => migrateMissingCompanyAuth(user, password, migrationDeps),
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const login = (password = company.password) => fetch(`http://127.0.0.1:${address.port}/api/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: company.username, password }),
});
try {
  assert.equal((await login('wrong')).status, 401);
  assert.equal(creations, 0);
  lookupError = true;
  assert.equal((await login()).status, 503);
  assert.equal(creations, 0, 'Lookup failure must not imply an absent account');
  lookupError = false;
  providerOutage = true;
  assert.equal((await login()).status, 503);
  assert.equal(creations, 0);
  providerOutage = false;
  const first = await login();
  assert.equal(first.status, 200);
  const payload = await first.json();
  assert.equal(payload.user.id, company.id);
  assert.equal('password' in payload.user, false);
  assert.ok(payload.session.access_token);
  assert.equal(creations, 1);
  assert.equal((await login()).status, 200);
  assert.equal(creations, 1, 'No repeated provisioning');
  authPassword = 'synthetic-new-auth-password';
  assert.equal((await login()).status, 409, 'A stale registry password cannot reset an existing Auth password');
  assert.equal((await login(authPassword)).status, 200, 'Changed Auth password still works with the internal alias');
  assert.equal(creations, 1);
  rows = [{ ...company, email: 'updated-contact@example.test' }];
  assert.equal((await login(authPassword)).status, 200);
  rows = [{ ...company, is_active: false }];
  assert.equal((await login(authPassword)).status, 401);
  rows = [company];
  authPassword = company.password;
  authRows = [{ id: 'existing', email: company.email, user_metadata: { username: company.username } }];
  authPassword = 'another-current-password';
  assert.equal((await login()).status, 409, 'Existing identity is never overwritten');
  assert.equal(creations, 1);
  authRows = [{ id: 'foreign', email: alias, app_metadata: { mlrs_user_id: 'different-company' } }];
  assert.equal((await login(authPassword)).status, 409, 'Alias must carry the server-issued registry binding');
  assert.equal(creations, 1);
  const pages = [Array.from({ length: 1000 }, (_, i) => ({ id: `other-${i}` })), [{ id: 'found-later', email: company.email }]];
  assert.equal(await migrateMissingCompanyAuth(company, company.password, { ...migrationDeps,
    listUsers: async page => ({ data: { users: pages[page - 1] }, error: null }),
  }), null, 'Lookup includes later pages');
  assert.equal(creations, 1);
  console.log('PASS: legacy company first-login migration, signed session, current password preserved, changed password works, existing accounts never reset, role/inactive/binding checks, failures and pagination. No real accounts changed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
