import { getActiveSupabaseClient } from './supabaseSync';

export async function getApiAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // The local header fallback must not depend on there being a Supabase
  // client. Under DB_DRIVER=mysql there is no Supabase at all, and returning
  // early here left every request unauthenticated — which is the one case the
  // fallback exists for.
  const client = getActiveSupabaseClient();
  let token: string | undefined;
  if (client) {
    const { data } = await client.auth.getSession();
    token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const viteEnv = (import.meta as any).env || {};
  if (
    !token &&
    viteEnv.DEV &&
    viteEnv.VITE_ALLOW_LEGACY_API_HEADER_AUTH === 'true' &&
    typeof sessionStorage !== 'undefined'
  ) {
    try {
      const rawSession = sessionStorage.getItem('nmc_active_user_session');
      const sessionUser = rawSession ? JSON.parse(rawSession) : null;
      if (sessionUser?.id && sessionUser?.username && sessionUser?.role) {
        headers['X-NMC-User-ID'] = String(sessionUser.id);
        headers['X-NMC-Username'] = String(sessionUser.username);
        headers['X-NMC-User-Role'] = String(sessionUser.role);
      }
    } catch {
      // Ignore malformed local session data; the API will require normal auth.
    }
  }

  return headers;
}
