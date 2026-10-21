import { createHash } from 'node:crypto';
import { accountAuthEmail } from './passwordLogin';

/** Stable internal identity, independent of editable/shared company contact email. */
export function legacyCompanyEmail(user: any): string {
  return `mlrs-${createHash('sha256').update(String(user.id)).digest('hex').slice(0, 48)}@nmc.gov.kh`;
}

export interface CompanyMigrationDependencies {
  listUsers: (page: number) => Promise<any>;
  createUser: (attributes: any) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
}

/** Called only after the current registry password has been verified server-side. */
export async function migrateMissingCompanyAuth(user: any, password: string, deps: CompanyMigrationDependencies) {
  if (user.role !== 'company' || user.is_active === false || !user.id || !user.username) return null;
  const alias = legacyCompanyEmail(user);
  const signInMigrated = async () => {
    const result = await deps.signIn(alias, password);
    if (!result.error && String(result.data?.user?.app_metadata?.mlrs_user_id || '') !== String(user.id)) return null;
    return result;
  };
  const email = accountAuthEmail(user);
  const username = String(user.username).trim().toLowerCase();
  // A complete lookup is required. Provider outages/truncation never mean "missing".
  let complete = false;
  for (let page = 1; page <= 50; page++) {
    const result = await deps.listUsers(page);
    if (result.error || !Array.isArray(result.data?.users)) throw new Error('Authentication lookup unavailable.');
    for (const auth of result.data.users) {
      const bound = String(auth.app_metadata?.mlrs_user_id || '') === String(user.id);
      const sameUsername = String(auth.user_metadata?.username || '').trim().toLowerCase() === username;
      const authEmail = String(auth.email || '').trim().toLowerCase();
      if (bound || sameUsername || auth.id === user.id || authEmail === email || authEmail === alias) {
        // Never update/reset/unban/confirm an existing account, including races.
        return null;
      }
    }
    if (result.data.users.length < 1000) { complete = true; break; }
  }
  if (!complete) throw new Error('Authentication lookup is incomplete.');
  const created = await deps.createUser({
    email: alias, password,
    // This is an internal username identity, not verification of the contact email.
    email_confirm: true,
    app_metadata: { mlrs_user_id: String(user.id) },
    user_metadata: { username: user.username },
  });
  if (created.error) {
    if (['email_exists', 'user_already_exists'].includes(created.error.code)) {
      // Another login may have created the exact same internal identity.
      return signInMigrated();
    }
    if (!created.error.status || created.error.status >= 500 || created.error.status === 429) {
      throw new Error('Authentication creation unavailable.');
    }
    return null; // Keep provider password policy; never weaken it to import a password.
  }
  if (!created.data?.user?.id) throw new Error('Authentication creation was not confirmed.');
  return signInMigrated();
}
