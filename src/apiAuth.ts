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

  return headers;
}
