import { apiRequest, getActiveSupabaseClient } from '../supabaseSync';
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

    // Recorded through our own API; the server stamps the real IP and user
    // agent from the connection rather than trusting what the page sends.
    await apiRequest('/api/login-history', { method: 'POST', body: { entry: supabasePayload } });
  } catch (err) {
    console.warn('Error in logLoginHistory logger:', err);
  }
}

/**
 * Log administrative audit activities (added per national requirements)
 */
export async function logAuditEvent(
  actorUser: MetrologyUser,
  actionType: 'ADMIN_PERMISSION_UPDATED' | 'USER_CREATED_BY_ADMIN' | 'USER_CREATED_BY_SUPERADMIN' | 'UNAUTHORIZED_USER_CREATE_ATTEMPT' | 'USER_DEACTIVATED' | 'REPORT_APPROVED' | 'REPORT_REJECTED' | 'BACKUP_CREATED' | 'LICENSE_CREATED' | 'LICENSE_UPDATED' | 'LICENSE_RENEWED' | 'LICENSE_DELETED' | 'CHANGE_OWN_PASSWORD',
  details: string,
  targetUserId?: string,
  targetUsername?: string
): Promise<void> {
  try {
    const ipAddress = await fetchIpAddressSafe();
    
    // Create the structure matching the LoginHistory type
    const auditItem: LoginHistory = {
      id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
      user_id: actorUser.id ? String(actorUser.id) : actorUser.username ? String(actorUser.username) : '',
      user_email: actorUser.email || actorUser.username || '',
      user_role: actorUser.role || '',
      company_id: targetUserId ? String(targetUserId) : '',
      company_name: `[AUDIT: ${actionType}] ${details}`,
      login_status: actionType,
      ip_address: ipAddress || '127.0.0.1',
      user_agent: navigator.userAgent || '',
      device_info: targetUsername ? `Target: @${targetUsername}` : `System Activity`,
      login_at: new Date().toISOString()
    };

    // 1. Save to local storage cache
    const localStored = localStorage.getItem('nmc_login_history');
    let localHistoryList: LoginHistory[] = [];
    if (localStored) {
      try {
        localHistoryList = JSON.parse(localStored);
      } catch (e) {
        // Ignored
      }
    }
    localHistoryList.unshift(auditItem);
    if (localHistoryList.length > 300) {
      localHistoryList = localHistoryList.slice(0, 300);
    }
    localStorage.setItem('nmc_login_history', JSON.stringify(localHistoryList));

    // 2. Save directly to Supabase if config is connected
    const client = getActiveSupabaseClient();
    if (!client) return;

    const supabasePayload = {
      user_id: actorUser.id ? String(actorUser.id) : actorUser.username ? String(actorUser.username) : null,
      user_email: actorUser.email || actorUser.username || null,
      user_role: actorUser.role || null,
      company_id: targetUserId ? String(targetUserId) : null,
      company_name: `[AUDIT: ${actionType}] ${details}`,
      login_status: actionType,
      ip_address: ipAddress || null,
      user_agent: navigator.userAgent || null,
      device_info: targetUsername ? `Target: @${targetUsername}` : `System Activity`,
      login_at: new Date().toISOString()
    };

    await apiRequest('/api/login-history', {
      method: 'POST',
      body: {
        entry: supabasePayload,
        // The server writes this to audit_logs when that table exists.
        ...(actionType === 'CHANGE_OWN_PASSWORD' ? {
          audit: {
            actor_email: actorUser.email || actorUser.username || 'unknown',
            actor_role: actorUser.role || 'unknown',
            action_type: actionType,
            details,
            target_user_id: targetUserId || actorUser.id || null,
          },
        } : {}),
      },
    });
  } catch (err) {
    console.warn('Error inside logAuditEvent:', err);
  }
}

export async function fetchLoginHistory(): Promise<LoginHistory[]> {
  try {
    // 1. Fetch through our own API if this deployment has a backend
    if (getActiveSupabaseClient()) {
      try {
        const { history } = await apiRequest<{ history: LoginHistory[] }>('/api/login-history');
        if (history) return history;
      } catch (error) {
        console.warn('Login history fetch failed, falling back to local storage:', error);
      }
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
