import { getActiveSupabaseClient } from '../supabaseSync';
import { MetrologyUser, LoginHistory } from '../types';

async function fetchIpAddressSafe(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      return data.ip || 'Unknown IP';
    }
  } catch (error) {
    // silently fail
  }
  return 'Unknown IP';
}

export async function logLoginHistory(user: MetrologyUser): Promise<void> {
  try {
    const ipAddress = await fetchIpAddressSafe();
    
    const loginHistoryItem: LoginHistory = {
      id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
      user_id: user.id ? String(user.id) : user.username ? String(user.username) : '',
      user_email: user.email || user.username || '',
      user_role: user.role || '',
      company_id: (user as any).company_id ? String((user as any).company_id) : (user.role === 'company' ? String(user.id) : ''),
      company_name: user.company_name_kh || (user as any).company_name || (user as any).company || 'គណៈកម្មាធិការមាត្រាសាស្ត្រជាតិ (NMC)',
      login_status: 'success',
      ip_address: ipAddress || '',
      user_agent: navigator.userAgent || '',
      device_info: `${navigator.platform || ""} | ${navigator.language || ""}`,
      login_at: new Date().toISOString()
    };

    // 1. Always save to local backup
    const localStored = localStorage.getItem('nmc_login_history');
    let localHistoryList: LoginHistory[] = [];
    if (localStored) {
      try {
        localHistoryList = JSON.parse(localStored);
      } catch (e) {
        // ignore
      }
    }
    localHistoryList.unshift(loginHistoryItem);
    // Keep max 200 items in local storage
    if (localHistoryList.length > 200) {
      localHistoryList = localHistoryList.slice(0, 200);
    }
    localStorage.setItem('nmc_login_history', JSON.stringify(localHistoryList));

    // 2. Insert to Supabase if connected
    const client = getActiveSupabaseClient();
    if (!client) {
      return;
    }

    // Prepare clean Supabase insert payload WITHOUT 'id' (let Supabase auto-generate its UUID)
    // and using nulls instead of empty strings for missing credentials
    const supabasePayload = {
      user_id: user.id ? String(user.id) : user.username ? String(user.username) : null,
      user_email: user.email || user.username || null,
      user_role: user.role || null,
      company_id: (user as any).company_id ? String((user as any).company_id) : (user.role === 'company' ? String(user.id) : null),
      company_name: user.company_name_kh || (user as any).company_name || (user as any).company || 'គណៈកម្មាធិការមាត្រាសាស្ត្រជាតិ (NMC)',
      login_status: 'success',
      ip_address: ipAddress || null,
      user_agent: navigator.userAgent || null,
      device_info: `${navigator.platform || ""} | ${navigator.language || ""}`,
      login_at: new Date().toISOString()
    };

    const { error } = await client.from('login_history').insert([supabasePayload]);
    if (error) {
      console.warn('Failed to insert login history row into Supabase:', error);
      console.error('Detailed Insert Error Msg:', error.message);
      console.error('Detailed Insert Error Details:', error.details);
      console.error('Detailed Insert Error Hint:', error.hint);
      console.error('Detailed Insert Error Code:', error.code);
    } else {
      console.log('Login history recorded successfully in Supabase.');
    }
  } catch (err) {
    console.warn('Error in logLoginHistory logger:', err);
  }
}

export async function fetchLoginHistory(): Promise<LoginHistory[]> {
  try {
    const client = getActiveSupabaseClient();
    
    // 1. Fetch from Supabase if connected
    if (client) {
      const { data, error } = await client
        .from('login_history')
        .select('*')
        .order('login_at', { ascending: false });

      if (!error && data) {
        return data as LoginHistory[];
      }
      console.warn('Supabase fetch failed, falling back to local history storage:', error);
    }

    // 2. Fallback to localStorage backup
    const localStored = localStorage.getItem('nmc_login_history');
    if (localStored) {
      try {
        return JSON.parse(localStored);
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    console.warn('Error in fetchLoginHistory:', err);
  }
  return [];
}
