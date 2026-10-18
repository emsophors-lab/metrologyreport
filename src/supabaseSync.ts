import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MetrologyUser, MetrologyReport, SupabaseConfig, EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, TelegramBotSetting, EnterpriseLicenseAttachment } from './types';
import { INITIAL_USERS, INITIAL_REPORTS, INITIAL_LICENSES, INITIAL_REMINDER_LOGS, INITIAL_RENEWAL_HISTORIES, INITIAL_BOT_SETTINGS, isDemoDataEnabled } from './demoData';
import { hashPassword } from './utils/passwordUtils';

// Dynamic config cache
let supabaseInstance: SupabaseClient | null = null;
let activeConfig: SupabaseConfig = {
  url: '',
  anonKey: '',
  isConnected: false,
  useFallback: true
};

function isMissingPasswordMetadataColumn(error: any): boolean {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return text.includes('password_hash') || text.includes('password_updated_at') || text.includes('must_change_password') || text.includes('last_password_change_by');
}

function withoutPasswordMetadata<T extends Record<string, any>>(record: T): T {
  const copy = { ...record };
  delete copy.password_hash;
  delete copy.password_updated_at;
  delete copy.must_change_password;
  delete copy.last_password_change_by;
  return copy;
}

async function getApiJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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
    (typeof sessionStorage !== 'undefined' || typeof localStorage !== 'undefined')
  ) {
    try {
      const rawSession = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('nmc_active_user_session') : null) || (typeof localStorage !== 'undefined' ? localStorage.getItem('nmc_active_user_session') : null);
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

const isProtectedBotSecret = (value?: string | null) =>
  !value || ['PROTECTED_UNCHANGED', 'PROTECTED_SERVER_SIDE'].includes(value) || /^[*•●]+$/.test(value.trim());

const isUuid = (value?: string | null) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

function stripProtectedBotSecrets(setting: TelegramBotSetting): Partial<TelegramBotSetting> {
  const payload: Partial<TelegramBotSetting> = { ...setting };
  if (!isUuid(payload.id)) {
    delete payload.id;
  }
  if (isProtectedBotSecret(payload.bot_token_encrypted)) {
    delete payload.bot_token_encrypted;
  }
  if (isProtectedBotSecret(payload.webhook_secret_encrypted)) {
    delete payload.webhook_secret_encrypted;
  }
  return payload;
}

/**
 * Calls one of our own API routes.
 *
 * The browser no longer reaches the database directly: every read and write
 * goes through server.ts, which holds the service-role key and enforces the
 * permissions. That is what lets the database move to MISTI's own PostgreSQL
 * server later — supabase-js speaks to PostgREST, our API speaks to whatever
 * the server is connected to. See docs/database-portability.md.
 */
export async function apiRequest<T = any>(
  path: string,
  init: { method?: string; body?: any } = {},
): Promise<T> {
  const headers = await getApiJsonHeaders();
  const response = await fetch(path, {
    method: init.method || 'GET',
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const payload = await readJsonResponseSafely(response);
  if (!response.ok || payload?.success === false) {
    const message = payload?.error || payload?.message || `${response.status} ${response.statusText}`;
    throw new Error(`${init.method || 'GET'} ${path} failed: ${message}`);
  }
  return (payload || {}) as T;
}

/**
 * Whether the app is running against a real backend rather than the
 * localStorage demo mode. The Supabase config still answers this, because it
 * is what the deployment sets; it no longer means the browser talks to
 * Supabase itself.
 */
function isCloudBacked(): boolean {
  return !!getActiveSupabaseClient();
}

async function readJsonResponseSafely(response: Response): Promise<any | null> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!text || !contentType.toLowerCase().includes('application/json')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Automatically load environment variables or user-configured localStorage values
 */
export function getActiveSupabaseConfig(): SupabaseConfig {
  // 1. Check system environment variables (ideal for Vercel production hosting)
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey && envUrl !== 'YOUR_SUPABASE_URL' && envKey !== 'YOUR_SUPABASE_ANON_KEY') {
    return {
      url: envUrl,
      anonKey: envKey,
      isConnected: true,
      useFallback: false
    };
  }

  // 2. Check localStorage custom runtime settings input via Dev Console
  const stored = localStorage.getItem('nmc_db_config');
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as SupabaseConfig;
      if (parsed.url && parsed.anonKey && parsed.url !== 'YOUR_SUPABASE_URL') {
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse local supabase configuration:', e);
    }
  }

  // 3. Unconfigured default state
  return {
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
    isConnected: false,
    useFallback: true
  };
}

/**
 * Get or initialize active Supabase client connection
 */
export function getActiveSupabaseClient(): SupabaseClient | null {
  const cfg = getActiveSupabaseConfig();
  if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_SUPABASE_URL') || cfg.useFallback) {
    supabaseInstance = null;
    return null;
  }

  // Cache client instantiations
  if (supabaseInstance && activeConfig.url === cfg.url && activeConfig.anonKey === cfg.anonKey) {
    return supabaseInstance;
  }

  try {
    supabaseInstance = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    activeConfig = cfg;
    console.log('Established new connection to Supabase instance:', cfg.url);
    return supabaseInstance;
  } catch (error) {
    console.error('Supabase connection instantiation crash:', error);
    return null;
  }
}

/**
 * Seed Supabase tables with initial metrology data if brand new
 */
export async function seedSupabaseIfEmpty(_client?: SupabaseClient) {
  try {
    // Seeding goes through the API like everything else, so the browser needs
    // no write access to the database. Each row is upserted on its own: one
    // demo account the server rejects must not stop the others.
    for (const u of INITIAL_USERS) {
      try {
        await apiRequest('/api/users', {
          method: 'POST',
          body: {
            user: {
              id: u.id,
              license_number: u.license_number,
              company_name_kh: u.company_name_kh,
              company_name_en: u.company_name_en,
              address: u.address,
              phone: u.phone,
              email: u.email,
              legal_representative: u.legal_representative,
              representative_position: u.representative_position,
              username: u.username,
              password: u.password || 'admin123',
              password_hash: u.password_hash || null,
              password_updated_at: u.password_updated_at || null,
              must_change_password: u.must_change_password ?? false,
              last_password_change_by: u.last_password_change_by || null,
              role: u.role,
              can_view: u.can_view,
              can_edit: u.can_edit,
              can_save: u.can_save,
              can_delete: u.can_delete,
              created_at: u.created_at || new Date().toISOString(),
            },
          },
        });
      } catch (err) {
        console.warn('Could not seed demo user', u.username, err);
      }
    }

    if (!isDemoDataEnabled()) return;

    for (const r of INITIAL_REPORTS) {
      try {
        await apiRequest('/api/reports', { method: 'POST', body: { report: r } });
      } catch (err) {
        console.warn('Could not seed demo report', r.id, err);
      }
    }
  } catch (error) {
    console.warn('Background database seeding check complete:', error);
  }
}

/**
 * Fetch list of users from Supabase with safe offline fallback
 * Implements automatic chunking/pagination to query more than 1,000 records safely.
 */
export async function fetchUsersFromSupabase(): Promise<MetrologyUser[]> {
  if (!isCloudBacked()) return [];

  try {
    // Through our own API. The server decides what this account may see — a
    // company user gets only its own row — and strips password material, so
    // no hash ever reaches the browser.
    const { users } = await apiRequest<{ users: MetrologyUser[] }>('/api/users');
    if (users && users.length > 0) return users;

    // An empty registry on a fresh database: seed the demo accounts.
    const client = getActiveSupabaseClient();
    if (client) await seedSupabaseIfEmpty(client);
    return INITIAL_USERS;
  } catch (e) {
    console.warn('Falling back to local storage registries on user fetch failure:', e);
    throw e;
  }
}

/**
 * Save user profile to Supabase (Upsert pattern)
 */
export async function saveUserToSupabase(user: MetrologyUser): Promise<void> {
  const client = getActiveSupabaseClient();
  if (!client) return;

  const payload = {
    id: user.id,
    license_number: user.license_number,
    company_name_kh: user.company_name_kh,
    company_name_en: user.company_name_en,
    address: user.address,
    phone: user.phone,
    email: user.email,
    legal_representative: user.legal_representative,
    representative_position: user.representative_position,
    username: user.username,
    password: user.password || 'admin123',
    password_hash: user.password_hash || null,
    password_updated_at: user.password_updated_at || null,
    must_change_password: user.must_change_password ?? false,
    last_password_change_by: user.last_password_change_by || null,
    role: user.role,
    can_view: user.can_view,
    can_edit: user.can_edit,
    can_save: user.can_save,
    can_delete: user.can_delete,
    created_at: user.created_at || new Date().toISOString(),
    admin_can_add_company_user: user.admin_can_add_company_user ?? false,
    admin_can_add_admin_user: user.admin_can_add_admin_user ?? false,
    admin_can_edit_users: user.admin_can_edit_users ?? false,
    admin_can_deactivate_users: user.admin_can_deactivate_users ?? false,
    admin_can_view_all_users: user.admin_can_view_all_users ?? false,
    is_active: user.is_active ?? true
  };

  try {
    // The server drops columns this database does not have, so the password
    // metadata retry that used to live here is no longer needed.
    await apiRequest('/api/users', { method: 'POST', body: { user: payload } });
  } catch (e) {
    console.warn('Failed to save the user account:', e);
    throw e;
  }
}

export async function changeOwnPasswordInSupabase(
  user: MetrologyUser,
  newPassword: string
): Promise<MetrologyUser> {
  const changedAt = new Date().toISOString();
  const passwordHash = await hashPassword(newPassword);
  const updatedUser: MetrologyUser = {
    ...user,
    password_hash: passwordHash,
    password_updated_at: changedAt,
    must_change_password: false,
    last_password_change_by: user.id,
  };

  if (!isCloudBacked()) return updatedUser;

  // The server checks that the row being written is the caller's own.
  await apiRequest('/api/users/change-password', {
    method: 'POST',
    body: { user_id: user.id, password_hash: passwordHash },
  });

  return updatedUser;
}

/**
 * Delete user profile from Supabase
 */
export async function deleteUserFromSupabase(userId: string): Promise<void> {
  if (!isCloudBacked()) return;

  try {
    await apiRequest(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('Failed to delete the user account:', e);
    throw e;
  }
}

/**
 * Fetch all monthly metrology reports from Supabase
 * Implements automatic chunking/pagination to query more than 1,000 records safely.
 */
export async function fetchReportsFromSupabase(currentUser?: MetrologyUser, options: { allowFallback?: boolean } = {}): Promise<MetrologyReport[]> {
  const localCopy = () => {
    const local = localStorage.getItem('nmc_reports');
    const all: MetrologyReport[] = local ? JSON.parse(local) : INITIAL_REPORTS;
    if (currentUser && currentUser.role === 'company') {
      return all.filter(r => isReportOwnedByCurrentCompany(r, currentUser));
    }
    return all;
  };

  if (!isCloudBacked()) return localCopy();

  try {
    // The server sees every report through the service role and scopes a
    // company account to its own records.
    const { reports } = await apiRequest<{ reports: MetrologyReport[] }>('/api/reports');
    if (reports && reports.length > 0) return reports;

    // An empty table on a fresh database: seed the demo rows if enabled.
    if (isDemoDataEnabled()) {
      await seedSupabaseIfEmpty();
      const seeded = INITIAL_REPORTS;
      if (currentUser && currentUser.role === 'company') {
        return seeded.filter(r => isReportOwnedByCurrentCompany(r, currentUser));
      }
      return seeded;
    }
    return [];
  } catch (e) {
    if (options.allowFallback === false) {
      console.warn('Reports fetch failed without dashboard fallback:', e);
      throw e;
    }
    console.warn('Falling back to local storage on reports fetch failure:', e);
    return localCopy();
  }
}

/**
 * Crypotgraphically hashes strings using SHA-256 with robust iframe failsafe fallback
 */
export async function sha256(message: string): Promise<string> {
  try {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    // secure hash fallback for iframe sandboxing environments
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}

/**
 * Secure QR query resolver
 */
export async function verifyReportBySecureToken(token: string): Promise<MetrologyReport | null> {
  // Public endpoint: a phone scanning the printed QR has no session at all, so
  // this is the one lookup that must work for an anonymous visitor. The server
  // does the token hashing and the lookup.
  try {
    const response = await fetch(`/api/verify-report?token=${encodeURIComponent(token)}`);
    if (response.ok) {
      const data = await response.json().catch(() => null);
      return (data?.report as MetrologyReport) || null;
    }
    if (response.status !== 404) {
      console.warn('Report verification lookup failed with status', response.status);
    }
    return null;
  } catch (err) {
    console.warn('verifyReportBySecureToken error:', err);
    return null;
  }
}

/**
 * Save metrology report to Supabase (Upsert pattern)
 */
export async function saveReportToSupabase(report: MetrologyReport): Promise<void> {
  const client = getActiveSupabaseClient();
  if (!client) return;

  // Ensure a secure validation token exits and generate its hash for database storage
  const activeToken = report.verification_token || crypto.randomUUID().replace(/-/g, '');
  const hashedToken = await sha256(activeToken);

  const payload = {
    id: report.id,
    user_id: report.user_id,
    license_number: report.license_number,
    company_name_kh: report.company_name_kh,
    customer_name: report.customer_name,
    customer_address: report.customer_address,
    measuring_instrument: report.measuring_instrument,
    instrument_serial_number: report.instrument_serial_number,
    scope_of_weight_measure: report.scope_of_weight_measure,
    spare_parts: report.spare_parts || '',
    spare_part_serial_number: report.spare_part_serial_number || '',
    service_type: report.service_type,
    service_start_date: report.service_start_date,
    service_end_date: report.service_end_date,
    report_month: report.report_month,
    report_year: report.report_year,
    
    // Secure workflow fields
    report_status: report.report_status || 'Submitted',
    rejection_reason: report.rejection_reason || null,
    approved_by: report.approved_by || null,
    approved_at: report.approved_at || null,
    
    // Secure QR Tokening
    verification_token_hash: hashedToken,

    created_at: report.created_at || new Date().toISOString(),
    updated_at: report.updated_at || new Date().toISOString()
  };

  // Saved through the backend: the service role holds the credentials and
  // decides whether this account may write this report.
  await apiRequest('/api/reports', { method: 'POST', body: { report: payload } });
}

/**
 * Delete metrology report from Supabase
 */
export async function deleteReportFromSupabase(reportId: string): Promise<void> {
  if (!isCloudBacked()) return;

  // The server decides whether this account may delete this report; there is
  // no second path that could bypass that decision.
  await apiRequest(`/api/reports?id=${encodeURIComponent(reportId)}`, { method: 'DELETE' });
}

/**
 * Fetch licenses from Supabase with safe offline fallback
 */
export async function fetchLicensesFromSupabase(currentUser?: MetrologyUser, options: { allowFallback?: boolean } = {}): Promise<EnterpriseLicense[]> {
  const localCopy = () => {
    const local = localStorage.getItem('nmc_licenses');
    const all = local ? JSON.parse(local) : INITIAL_LICENSES;
    if (currentUser && currentUser.role === 'company') {
      return all.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
    }
    return all;
  };

  if (!isCloudBacked()) return localCopy();

  try {
    // The server scopes a company account to its own licence, so the filter
    // below is belt and braces for an older server, not the actual boundary.
    const { licenses } = await apiRequest<{ licenses: EnterpriseLicense[] }>('/api/licenses');
    const records = licenses || [];
    if (records.length > 0) {
      if (currentUser && currentUser.role === 'company') {
        return records.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
      }
      return records;
    }

    // Seed only when demo data is explicitly enabled; an empty table is a real empty state.
    if (isDemoDataEnabled()) {
      const seeded = localCopy();
      for (const license of seeded) {
        await apiRequest('/api/licenses', { method: 'POST', body: { license } });
      }
      return seeded;
    }
    return [];
  } catch (e) {
    if (options.allowFallback === false) {
      console.warn('License fetch failed without dashboard fallback:', e);
      throw e;
    }
    console.warn('Failed to fetch licenses from the API. Using local storage fallback.', e);
    return localCopy();
  }
}

const STANDARD_LICENSE_COLUMNS = new Set([
  'id',
  'company_user_id',
  'company_id',
  'company_name',
  'license_number',
  'license_owner_name',
  'license_owner_position',
  'phone_number',
  'email',
  'telegram_chat_id',
  'telegram_username',
  'telegram_first_name',
  'telegram_last_name',
  'telegram_connected_at',
  'telegram_connection_status',
  'telegram_registration_token_hash',
  'telegram_registration_token_expires_at',
  'company_address',
  'company_name_kh',
  'province_city',
  'district_khan',
  'commune_sangkat',
  'village',
  'license_owner_national_id',
  'license_owner_phone',
  'license_owner_email',
  'service_fee_amount',
  'service_fee_currency',
  'payment_status',
  'payment_reference',
  'payment_date',
  'payment_notes',
  'business_type',
  'service_scope',
  'measuring_instrument_type',
  'license_issue_date',
  'license_expiry_date',
  'license_validity_years',
  'license_status',
  'last_90_day_reminder_sent_at',
  'last_60_day_reminder_sent_at',
  'last_30_day_reminder_sent_at',
  'last_15_day_reminder_sent_at',
  'last_7_day_reminder_sent_at',
  'expired_reminder_sent_at',
  'notes',
  'representative_date_of_birth',
  'representative_gender',
  'representative_nationality',
  'business_latitude',
  'business_longitude',
  'business_location_source',
  'business_geo_address',
  'location_updated_at',
  'license_owner_photo_url',
  'license_owner_photo_path',
  'license_owner_photo_file_name',
  'license_owner_photo_uploaded_at',
  'client_username',
  'client_password',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at'
]);

const UI_ONLY_LICENSE_COLUMNS = new Set([
  'service_fee',
  'photo_base64',
  'attached_doc_base64',
  'attached_doc_name',
  'username',
  'password'
]);

function createSupabaseLicensePayload(license: EnterpriseLicense): Record<string, any> {
  const payload = Object.keys(license).reduce((acc: Record<string, any>, key) => {
    if (!UI_ONLY_LICENSE_COLUMNS.has(key)) {
      acc[key] = (license as any)[key];
    }
    return acc;
  }, {});

  if ((license as any).service_fee !== undefined) {
    payload.service_fee_amount = (license as any).service_fee;
  }
  if ((license as any).username !== undefined) {
    payload.client_username = (license as any).username;
  }
  if ((license as any).password !== undefined) {
    payload.client_password = (license as any).password;
  }

  return payload;
}

/**
 * Save enterprise license to Supabase (Upsert pattern)
 */
export async function saveLicenseToSupabase(license: EnterpriseLicense): Promise<void> {
  const client = getActiveSupabaseClient();
  
  // Update local storage first
  const local = localStorage.getItem('nmc_licenses');
  let list: EnterpriseLicense[] = local ? JSON.parse(local) : INITIAL_LICENSES;
  const idx = list.findIndex(l => l.id === license.id);
  if (idx !== -1) {
    list[idx] = license;
  } else {
    list.unshift(license);
  }
  try {
    localStorage.setItem('nmc_licenses', JSON.stringify(list));
  } catch (quotaError) {
    console.warn('LocalStorage save failed due to quota limit. Pruning old licenses from localStorage to free space...', quotaError);
    try {
      const prunedList = list.map((item) => {
        if (item.id !== license.id) {
          return {
            ...item,
            photo_base64: '',
            attached_doc_base64: ''
          };
        }
        return item;
      });
      localStorage.setItem('nmc_licenses', JSON.stringify(prunedList));
      console.log('Successfully saved to LocalStorage after pruning old base64 weights!');
    } catch (innerError) {
      console.error('Final fallback local storage save attempt failed. Continuing to cloud save directly...', innerError);
    }
  }

  if (!isCloudBacked()) return;

  // The server drops columns this database does not have, so the pruning that
  // used to happen here is gone; only the UI-only fields are stripped.
  try {
    await apiRequest('/api/licenses', {
      method: 'POST',
      body: { license: createSupabaseLicensePayload(license) },
    });
  } catch (e) {
    console.warn('License save failed, retrying with only the standard columns...', e);
    const schemaPayload = createSupabaseLicensePayload(license);
    const pruned = Object.keys(schemaPayload).reduce((acc: any, key) => {
      if (STANDARD_LICENSE_COLUMNS.has(key)) acc[key] = schemaPayload[key];
      return acc;
    }, {});
    await apiRequest('/api/licenses', { method: 'POST', body: { license: pruned } });
  }
}

/**
 * Delete enterprise license from Supabase
 */
export async function deleteLicenseFromSupabase(licenseId: string): Promise<void> {
  const local = localStorage.getItem('nmc_licenses');
  let list: EnterpriseLicense[] = local ? JSON.parse(local) : INITIAL_LICENSES;
  list = list.filter(l => l.id !== licenseId);
  try {
    localStorage.setItem('nmc_licenses', JSON.stringify(list));
  } catch (quotaError) {
    console.warn('LocalStorage delete write failed due to quota. Pruning base64 fields...', quotaError);
    try {
      const prunedList = list.map(item => ({
        ...item,
        photo_base64: '',
        attached_doc_base64: ''
      }));
      localStorage.setItem('nmc_licenses', JSON.stringify(prunedList));
    } catch (innerError) {
      console.error('Final local storage save attempt failed during delete:', innerError);
    }
  }

  if (!isCloudBacked()) return;

  await apiRequest(`/api/licenses/${encodeURIComponent(licenseId)}`, { method: 'DELETE' });
}

/**
 * Fetch reminder logs
 */
export async function fetchReminderLogsFromSupabase(licenseId?: string, currentUser?: MetrologyUser): Promise<LicenseReminderLog[]> {
  const localCopy = () => {
    const local = localStorage.getItem('nmc_reminder_logs');
    let logs: LicenseReminderLog[] = local ? JSON.parse(local) : INITIAL_REMINDER_LOGS;
    if (licenseId) logs = logs.filter(l => l.license_id === licenseId);
    if (currentUser && currentUser.role === 'company') {
      const ownedIds = INITIAL_LICENSES
        .filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser))
        .map((o: any) => o.id);
      logs = logs.filter(l => ownedIds.includes(l.license_id));
    }
    return logs;
  };

  if (!isCloudBacked()) return localCopy();

  try {
    // A company account is scoped to its own licences by the server.
    const query = licenseId ? `?license_id=${encodeURIComponent(licenseId)}` : '';
    const { logs } = await apiRequest<{ logs: LicenseReminderLog[] }>(`/api/reminder-logs${query}`);
    return logs || [];
  } catch (e) {
    console.warn('Failed to fetch reminder logs, resorting to local storage.', e);
    return localCopy();
  }
}

/**
 * Save reminder log
 */
export async function saveReminderLogToSupabase(log: LicenseReminderLog): Promise<void> {
  const local = localStorage.getItem('nmc_reminder_logs');
  const list: LicenseReminderLog[] = local ? JSON.parse(local) : INITIAL_REMINDER_LOGS;
  list.unshift(log);
  localStorage.setItem('nmc_reminder_logs', JSON.stringify(list));

  if (!isCloudBacked()) return;

  try {
    await apiRequest('/api/reminder-logs', { method: 'POST', body: { log } });
  } catch (e) {
    console.error('Failed to record the reminder log:', e);
  }
}

/**
 * Fetch license renewal history
 */
export async function fetchRenewalHistoryFromSupabase(licenseId?: string, currentUser?: MetrologyUser): Promise<LicenseRenewalHistory[]> {
  const localCopy = () => {
    const local = localStorage.getItem('nmc_renewal_history');
    let histories: LicenseRenewalHistory[] = local ? JSON.parse(local) : INITIAL_RENEWAL_HISTORIES;
    if (licenseId) histories = histories.filter(h => h.license_id === licenseId);
    if (currentUser && currentUser.role === 'company') {
      const ownedIds = INITIAL_LICENSES
        .filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser))
        .map((o: any) => o.id);
      histories = histories.filter(h => ownedIds.includes(h.license_id));
    }
    return histories;
  };

  if (!isCloudBacked()) return localCopy();

  try {
    const query = licenseId ? `?license_id=${encodeURIComponent(licenseId)}` : '';
    const { history } = await apiRequest<{ history: LicenseRenewalHistory[] }>(`/api/renewal-history${query}`);
    return history || [];
  } catch (e) {
    console.warn('Failed to fetch renewal history, resorting to local storage.', e);
    return localCopy();
  }
}

/**
 * Save renewal history record
 */
export async function saveRenewalHistoryToSupabase(history: LicenseRenewalHistory): Promise<void> {
  const local = localStorage.getItem('nmc_renewal_history');
  const list: LicenseRenewalHistory[] = local ? JSON.parse(local) : INITIAL_RENEWAL_HISTORIES;
  list.unshift(history);
  localStorage.setItem('nmc_renewal_history', JSON.stringify(list));

  if (!isCloudBacked()) return;

  try {
    await apiRequest('/api/renewal-history', { method: 'POST', body: { history } });
  } catch (e) {
    console.error('Failed to record the renewal history entry:', e);
  }
}

/**
 * Fetch bot settings from Supabase or localStorage fallback
 */
export async function fetchBotSettingsFromSupabase(): Promise<TelegramBotSetting[]> {
  const client = getActiveSupabaseClient();
  if (!client) {
    return getLocalBotSettingsFallback();
  }

  const headers = await getApiJsonHeaders();
  if (!headers.Authorization) {
    return getLocalBotSettingsFallback();
  }

  const response = await fetch('/api/telegram-bot-settings', {
    headers,
  });
  const data = await readJsonResponseSafely(response);
  if (!response.ok || !data) {
    if (response.status === 401 || response.status === 403) {
      return getLocalBotSettingsFallback();
    }
    const message = data?.message || data?.error || `Failed to fetch Telegram bot settings: ${response.status}`;
    throw new Error(`Unable to load Telegram bot settings from Supabase. ${message}`);
  }

  const safeRecords = (data.bots || []).map(sanitizeBotSettingForBrowserStorage);
  localStorage.setItem('nmc_bot_settings', JSON.stringify(safeRecords));
  return safeRecords;
}

export async function fetchActiveReminderBotPublic(): Promise<TelegramBotSetting | null> {
  try {
    const response = await fetch('/api/active-telegram-bot?purpose=license_reminder', {
      headers: await getApiJsonHeaders(),
    });
    const data = await readJsonResponseSafely(response);
    if (response.ok && data) {
      return data.bot ? sanitizeBotSettingForBrowserStorage(data.bot) : null;
    }
  } catch (e) {
    console.warn('Active Telegram bot lookup failed; using the local copy:', e);
  }

  // Only the demo copy as a fallback. The direct database query that used to
  // live here read bot_token_encrypted into the browser, which the server
  // endpoint never does — bot tokens belong on the server.
  try {
    const local = localStorage.getItem('nmc_bot_settings');
    const records: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
    const migrated = records.map(migrateLegacyDemoBotUsername);
    localStorage.setItem('nmc_bot_settings', JSON.stringify(migrated));
    const activeReminder = migrated.find(b => b.is_active && ['license_reminder', 'both'].includes(b.bot_purpose || 'license_reminder'));
    const active = activeReminder || migrated.find(b => b.is_active && String(b.bot_username || '').trim());
    return active ? sanitizeBotSettingForBrowserStorage(active) : null;
  } catch (e) {
    console.warn('Failed to read the local Telegram bot copy:', e);
    return null;
  }
}

function migrateLegacyDemoBotUsername(setting: TelegramBotSetting): TelegramBotSetting {
  const username = String(setting.bot_username || '').trim().replace(/^@+/, '');
  if (!['NMC_License_Bot', 'NMC_Reminder_Bot'].includes(username)) return setting;
  return {
    ...setting,
    bot_name: setting.bot_name === 'NMC License Reminder Bot' ? 'License report' : setting.bot_name,
    bot_display_name: setting.bot_display_name === 'NMC License Reminder Bot' ? 'License report' : setting.bot_display_name,
    bot_username: 'Licensingreport_bot'
  };
}

function sanitizeBotSettingForBrowserStorage(setting: TelegramBotSetting, preserveSecrets = false): TelegramBotSetting {
  const migrated = migrateLegacyDemoBotUsername(setting);
  return {
    ...migrated,
    bot_purpose: migrated.bot_purpose || 'license_reminder',
    connection_status: migrated.connection_status || (migrated.last_test_status === 'Success' ? 'connected' : migrated.last_test_status === 'Failed' ? 'error' : 'not_verified'),
    webhook_status: migrated.webhook_status || (migrated.webhook_url ? 'configured' : 'not_configured'),
    bot_token_encrypted: preserveSecrets ? migrated.bot_token_encrypted : (migrated.bot_token_encrypted ? 'PROTECTED_SERVER_SIDE' : ''),
    webhook_secret_encrypted: preserveSecrets ? (migrated.webhook_secret_encrypted || null) : (migrated.webhook_secret_encrypted ? 'PROTECTED_SERVER_SIDE' : null),
  };
}

function getLocalBotSettingsFallback(): TelegramBotSetting[] {
  const local = localStorage.getItem('nmc_bot_settings');
  const records: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
  const migrated = records.map(migrateLegacyDemoBotUsername);
  localStorage.setItem('nmc_bot_settings', JSON.stringify(migrated));
  return migrated;
}

/**
 * Save bot setting to Supabase or localStorage
 */
export async function saveBotSettingToSupabase(setting: TelegramBotSetting): Promise<void> {
  const client = getActiveSupabaseClient();
  if (client) {
    const payload = stripProtectedBotSecrets(setting);
    const response = await fetch('/api/telegram-bot-settings', {
      method: 'POST',
      headers: await getApiJsonHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await readJsonResponseSafely(response);
    if (!response.ok || !data) {
      const message = data?.message || data?.error || `Failed to save Telegram bot setting: ${response.status}`;
      throw new Error(message);
    }

    const safeSetting = sanitizeBotSettingForBrowserStorage(data.bot || setting);
    const local = localStorage.getItem('nmc_bot_settings');
    let list: TelegramBotSetting[] = local ? JSON.parse(local) : [];
    const settingPurpose = safeSetting.bot_purpose || 'license_reminder';
    const settingCapabilities = settingPurpose === 'both'
      ? ['license_reminder', 'report_group', 'report_notification', 'both']
      : settingPurpose === 'report_group' || settingPurpose === 'report_notification'
        ? ['report_group', 'report_notification', 'both']
        : ['license_reminder', 'both'];
    if (safeSetting.is_active) {
      list = list.map(b => ({
        ...b,
        is_active: settingCapabilities.includes(b.bot_purpose || 'license_reminder') ? b.id === safeSetting.id : b.is_active
      }));
    }
    const idx = list.findIndex(b => b.id === safeSetting.id || (!isUuid(setting.id) && b.id === setting.id));
    if (idx !== -1) {
      list[idx] = safeSetting;
    } else {
      list.unshift(safeSetting);
    }
    localStorage.setItem('nmc_bot_settings', JSON.stringify(list));
    return;
  }

  const local = localStorage.getItem('nmc_bot_settings');
  let list: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
  const safeSetting = sanitizeBotSettingForBrowserStorage(setting, !client);
  const settingPurpose = setting.bot_purpose || 'license_reminder';
  const settingCapabilities = settingPurpose === 'both'
    ? ['license_reminder', 'report_group', 'report_notification', 'both']
    : settingPurpose === 'report_group' || settingPurpose === 'report_notification'
      ? ['report_group', 'report_notification', 'both']
      : ['license_reminder', 'both'];
  
  if (setting.is_active) {
    // Deactivate other bots that overlap this purpose/capability.
    list = list.map(b => ({
      ...b,
      is_active: settingCapabilities.includes(b.bot_purpose || 'license_reminder') ? b.id === setting.id : b.is_active
    }));
  }
  
  const idx = list.findIndex(b => b.id === setting.id);
  if (idx !== -1) {
    list[idx] = safeSetting;
  } else {
    list.unshift(safeSetting);
  }
  localStorage.setItem('nmc_bot_settings', JSON.stringify(list));

  if (!client) return;
}

/**
 * Delete bot setting from Supabase or localStorage
 */
export async function deleteBotSettingFromSupabase(botId: string): Promise<void> {
  const client = getActiveSupabaseClient();
  if (client) {
    const response = await fetch(`/api/telegram-bot-settings/${encodeURIComponent(botId)}`, {
      method: 'DELETE',
      headers: await getApiJsonHeaders(),
    });
    const data = await readJsonResponseSafely(response);
    if (!response.ok) {
      const message = data?.message || data?.error || `Failed to delete Telegram bot setting: ${response.status}`;
      throw new Error(message);
    }
    const local = localStorage.getItem('nmc_bot_settings');
    let list: TelegramBotSetting[] = local ? JSON.parse(local) : [];
    list = list.filter(b => b.id !== botId);
    localStorage.setItem('nmc_bot_settings', JSON.stringify(list));
    return;
  }

  const local = localStorage.getItem('nmc_bot_settings');
  let list: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
  list = list.filter(b => b.id !== botId);
  localStorage.setItem('nmc_bot_settings', JSON.stringify(list));

  if (!client) return;
}

/**
 * Robust check if licensing tables exist in Supabase
 */
export async function checkIfLicensingTablesExist(): Promise<{
  enterprise_licenses: boolean;
  telegram_bot_settings: boolean;
  license_reminder_logs: boolean;
  license_renewal_history: boolean;
  allExist: boolean;
}> {
  const client = getActiveSupabaseClient();
  if (!client) {
    return {
      enterprise_licenses: false,
      telegram_bot_settings: false,
      license_reminder_logs: false,
      license_renewal_history: false,
      allExist: false
    };
  }

  const status = {
    enterprise_licenses: true,
    telegram_bot_settings: true,
    license_reminder_logs: true,
    license_renewal_history: true,
    allExist: true
  };

  try {
    const checkTable = async (tableName: string) => {
      try {
        const { error } = await client.from(tableName).select('id').limit(0);
        if (error) {
          if (
            error.code === '42P01' ||
            error.code === 'PGRST116' ||
            error.message?.toLowerCase().includes('could not find') ||
            error.message?.toLowerCase().includes('does not exist') ||
            error.message?.toLowerCase().includes('schema cache')
          ) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    };

    // Parallel checks to ensure rapid loading without sequential blocking
    const [lic, bot, log, renew] = await Promise.all([
      checkTable('enterprise_licenses'),
      checkTable('telegram_bot_settings'),
      checkTable('license_reminder_logs'),
      checkTable('license_renewal_history')
    ]);

    status.enterprise_licenses = lic;
    status.telegram_bot_settings = bot;
    status.license_reminder_logs = log;
    status.license_renewal_history = renew;
    status.allExist = lic && bot && log && renew;
  } catch {
    status.allExist = false;
  }

  return status;
}

/**
 * Enterprise Licensing Authorization Helpers
 * TODO before production: replace permissive enterprise_licenses RLS policies with
 * database-level row policies matching this ownership check for company users.
 */
export function isLicenseOwnedByCurrentCompany(license: any, currentUser: any): boolean {
  if (!license || !currentUser) return false;

  const normalize = (v: any) => String(v || '').trim().toLowerCase();

  return (
    (license.user_id && currentUser.id && normalize(license.user_id) === normalize(currentUser.id)) ||
    (license.company_user_id && currentUser.id && normalize(license.company_user_id) === normalize(currentUser.id)) ||
    (license.company_id && currentUser.id && normalize(license.company_id) === normalize(currentUser.id)) ||
    (license.company_id && currentUser.company_id && normalize(license.company_id) === normalize(currentUser.company_id)) ||
    (license.client_username && currentUser.username && normalize(license.client_username) === normalize(currentUser.username)) ||
    (license.username && currentUser.username && normalize(license.username) === normalize(currentUser.username)) ||
    (license.linked_user_id && currentUser.id && normalize(license.linked_user_id) === normalize(currentUser.id)) ||
    (license.id && currentUser.license_id && normalize(license.id) === normalize(currentUser.license_id)) ||
    (license.id && currentUser.linked_license_id && normalize(license.id) === normalize(currentUser.linked_license_id)) ||
    (license.id && currentUser.linked_enterprise_license_id && normalize(license.id) === normalize(currentUser.linked_enterprise_license_id)) ||
    (license.license_number && currentUser.license_number && normalize(license.license_number) === normalize(currentUser.license_number)) ||
    (license.license_number && currentUser.business_license_number && normalize(license.license_number) === normalize(currentUser.business_license_number))
  );
}

export function isReportOwnedByCurrentCompany(report: any, currentUser: any): boolean {
  if (!report || !currentUser) return false;
  const normalize = (v: any) => String(v || '').trim().toLowerCase();

  return (
    (report.user_id && currentUser.id && normalize(report.user_id) === normalize(currentUser.id)) ||
    (report.license_number && currentUser.license_number && normalize(report.license_number) === normalize(currentUser.license_number)) ||
    (report.company_name_kh && currentUser.company_name_kh && normalize(report.company_name_kh) === normalize(currentUser.company_name_kh)) ||
    (report.company_name_kh && currentUser.company_name_en && normalize(report.company_name_kh) === normalize(currentUser.company_name_en))
  );
}

/**
 * Fetch attachments from Supabase for a specific license ID
 */
export async function fetchAttachmentsFromSupabase(licenseId: string): Promise<EnterpriseLicenseAttachment[]> {
  const localCopy = () => {
    const local = localStorage.getItem('nmc_license_attachments');
    const all: EnterpriseLicenseAttachment[] = local ? JSON.parse(local) : [];
    return all.filter(a => a.license_id === licenseId);
  };

  if (!isCloudBacked()) return localCopy();

  try {
    const { attachments } = await apiRequest<{ attachments: EnterpriseLicenseAttachment[] }>(
      `/api/license-attachments?license_id=${encodeURIComponent(licenseId)}`,
    );
    return attachments || [];
  } catch (e) {
    console.error('Failed to fetch attachments:', e);
    return localCopy();
  }
}

/**
 * Save attachment metadata
 */
export async function saveAttachmentToSupabase(attachment: EnterpriseLicenseAttachment): Promise<void> {
  // Update local storage first
  const local = localStorage.getItem('nmc_license_attachments');
  const list: EnterpriseLicenseAttachment[] = local ? JSON.parse(local) : [];
  const idx = list.findIndex(a => a.id === attachment.id);
  if (idx !== -1) list[idx] = attachment;
  else list.unshift(attachment);
  try {
    localStorage.setItem('nmc_license_attachments', JSON.stringify(list));
  } catch (quotaError) {
    console.warn('LocalStorage save failed for attachments due to quota limit:', quotaError);
  }

  if (!isCloudBacked()) return;

  await apiRequest('/api/license-attachments', { method: 'POST', body: { attachment } });
}

/**
 * Delete attachment
 */
export async function deleteAttachmentFromSupabase(attachmentId: string): Promise<void> {
  const local = localStorage.getItem('nmc_license_attachments');
  let list: EnterpriseLicenseAttachment[] = local ? JSON.parse(local) : [];
  list = list.filter(a => a.id !== attachmentId);
  try {
    localStorage.setItem('nmc_license_attachments', JSON.stringify(list));
  } catch (quotaError) {
    console.warn('LocalStorage delete failed for attachments:', quotaError);
  }

  if (!isCloudBacked()) return;

  await apiRequest(`/api/license-attachments/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' });
}

/**
 * Upload a file to a specific Supabase storage bucket
 */
export async function uploadFileToSupabase(
  bucketName: string,
  filePath: string,
  file: File
): Promise<{ url: string; path: string }> {
  const client = getActiveSupabaseClient();
  if (!client) {
    // Demo/offline mode: store as base64 data URL in localStorage
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Url = reader.result as string;
        const storageKey = `nmc_file_${bucketName}_${filePath.replace(/\//g, '_')}`;
        try {
          localStorage.setItem(storageKey, base64Url);
          resolve({ url: base64Url, path: `local://${bucketName}/${filePath}` });
        } catch (e: any) {
          reject(new Error(`localStorage full or unavailable: ${e.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file for local storage'));
      reader.readAsDataURL(file);
    });
  }

  try {
    const { data, error } = await client.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      if (error.message && (
        error.message.includes('not found') || 
        error.message.includes('does not exist') || 
        error.message.includes('bucket') ||
        error.message.includes('No bucket found')
      )) {
        throw new Error(`Storage bucket "${bucketName}" not found. Please create it first in your Supabase Storage.`);
      }
      throw error;
    }

    const { data: urlData } = client.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return {
      url: urlData.publicUrl || '',
      path: data.path
    };
  } catch (err: any) {
    console.error(`Supabase upload failed for bucket "${bucketName}":`, err);
    throw err;
  }
}
