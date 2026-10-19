import type { MetrologyUser } from '../types';

export class LoginFailure extends Error {
  constructor(public code: string) { super(code); }
}

export async function signInWithServer(
  client: { auth: { setSession: (session: { access_token: string; refresh_token: string }) => Promise<any> } },
  username: string,
  password: string,
  request: typeof fetch = fetch,
): Promise<MetrologyUser> {
  const response = await request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new LoginFailure(payload?.code || 'AUTH_UNAVAILABLE');
  if (!payload.user?.id || !payload.session?.access_token || !payload.session?.refresh_token) {
    throw new LoginFailure('AUTH_UNAVAILABLE');
  }
  const { data, error } = await client.auth.setSession(payload.session);
  if (error || !data?.session) throw new LoginFailure('AUTH_UNAVAILABLE');
  return payload.user;
}
