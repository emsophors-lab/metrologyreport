import { getActiveSupabaseClient } from './supabaseSync';

export async function getApiAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const client = getActiveSupabaseClient();
  if (!client) return headers;

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!token && typeof sessionStorage !== 'undefined') {
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
