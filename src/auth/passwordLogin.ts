import type { RequestHandler } from 'express';

export function accountAuthEmail(user: any): string {
  const email = String(user.email || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  const username = String(user.username || 'user').trim().toLowerCase()
    .replace(/[^a-z0-9._+-]/g, '_').replace(/^_+|_+$/g, '') || 'user';
  return `${username}@nmc.gov.kh`;
}

interface LoginDependencies {
  db: any;
  signIn: (email: string, password: string) => Promise<any>;
  publicUser: (user: any) => any;
  verifyLegacyPassword: (password: string, user: any) => boolean;
}

// Resolve the private registry on the server, never by publishing accounts or
// password hashes to unauthenticated browsers. Signing in does not reset,
// provision, confirm or otherwise change an authentication account.
export function createPasswordLoginHandler(deps: LoginDependencies): RequestHandler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const fail = (status: number, code: string) => res.status(status).json({ success: false, code });
    const identifier = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!identifier || !password || identifier.length > 254 || password.length > 4096) {
      fail(400, 'INVALID_INPUT');
      return;
    }
    if (!deps.db) {
      fail(503, 'AUTH_UNAVAILABLE');
      return;
    }
    try {
      const column = identifier.includes('@') ? 'email' : 'username';
      const escaped = identifier.replace(/[\\%_]/g, '\\$&');
      const { data, error } = await deps.db.from('users').select('*').ilike(column, escaped);
      if (error) throw error;
      const matches = (data || []).filter((user: any) => String(user[column] || '').trim().toLowerCase() === identifier);
      if (matches.length !== 1 || matches[0].is_active === false) {
        fail(401, 'INVALID_CREDENTIALS');
        return;
      }
      const user = matches[0];
      const result = await deps.signIn(accountAuthEmail(user), password);
      if (result.error || !result.data?.session?.access_token || !result.data?.session?.refresh_token) {
        const error = result.error;
        if (error?.status === 429) {
          fail(429, 'TOO_MANY_ATTEMPTS');
        } else if (!error || !error.status || error.status >= 500) {
          fail(503, 'AUTH_UNAVAILABLE');
        } else if (deps.verifyLegacyPassword(password, user)) {
          // A valid legacy password is not a signed session. Do not silently
          // overwrite the provider's password just to get past this failure.
          fail(409, 'AUTH_ACCOUNT_NOT_READY');
        } else {
          fail(401, 'INVALID_CREDENTIALS');
        }
        return;
      }
      const { access_token, refresh_token } = result.data.session;
      res.json({ success: true, session: { access_token, refresh_token }, user: deps.publicUser(user) });
    } catch {
      // Never log the submitted password, provider response or private row.
      fail(503, 'AUTH_UNAVAILABLE');
    }
  };
}
