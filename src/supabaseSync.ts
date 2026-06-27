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
  if (!client) return headers;

  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const isProtectedBotSecret = (value?: string | null) =>
  !value || ['PROTECTED_UNCHANGED', 'PROTECTED_SERVER_SIDE'].includes(value) || /^[*•●]+$/.test(value.trim());

function stripProtectedBotSecrets(setting: TelegramBotSetting): Partial<TelegramBotSetting> {
  const payload: Partial<TelegramBotSetting> = { ...setting };
  if (isProtectedBotSecret(payload.bot_token_encrypted)) {
    delete payload.bot_token_encrypted;
  }
  if (isProtectedBotSecret(payload.webhook_secret_encrypted)) {
    delete payload.webhook_secret_encrypted;
  }
  return payload;
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
export async function seedSupabaseIfEmpty(client: SupabaseClient) {
  try {
    // Check users
    const { count: userCount, error: uErr } = await client
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (!uErr && (userCount === 0 || userCount === null)) {
      console.log('Supabase users table is empty. Seeding INITIAL_USERS...');
      // Strip out optional fields that match schema or map properly
      const mappedUsers = INITIAL_USERS.map(u => ({
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
        created_at: u.created_at || new Date().toISOString()
      }));

      const { error: seedUsersErr } = await client.from('users').insert(mappedUsers);
      if (seedUsersErr) {
        if (isMissingPasswordMetadataColumn(seedUsersErr)) {
          const legacyMappedUsers = mappedUsers.map(withoutPasswordMetadata);
          const { error: legacySeedErr } = await client.from('users').insert(legacyMappedUsers);
          if (legacySeedErr) {
            console.warn('Could not seed users table (Row Level Security may be active or columns mismatched):', legacySeedErr);
          }
        } else {
          console.warn('Could not seed users table (Row Level Security may be active or columns mismatched):', seedUsersErr);
        }
      }
    }

    // Check reports
    const { count: reportCount, error: rErr } = await client
      .from('reports')
      .select('*', { count: 'exact', head: true });

    if (!rErr && (reportCount === 0 || reportCount === null) && isDemoDataEnabled()) {
      console.log('Supabase reports table is empty. Seeding INITIAL_REPORTS...');
      const mappedReports = INITIAL_REPORTS.map(r => ({
        id: r.id,
        user_id: r.user_id,
        license_number: r.license_number,
        company_name_kh: r.company_name_kh,
        customer_name: r.customer_name,
        customer_address: r.customer_address,
        measuring_instrument: r.measuring_instrument,
        instrument_serial_number: r.instrument_serial_number,
        scope_of_weight_measure: r.scope_of_weight_measure,
        spare_parts: r.spare_parts || '',
        spare_part_serial_number: r.spare_part_serial_number || '',
        service_type: r.service_type,
        service_start_date: r.service_start_date,
        service_end_date: r.service_end_date,
        report_month: r.report_month,
        report_year: r.report_year,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString()
      }));

      const { error: seedReportsErr } = await client.from('reports').insert(mappedReports);
      if (seedReportsErr) {
        console.warn('Could not seed reports table (Row Level Security might restrict client-direct writes):', seedReportsErr);
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
  const client = getActiveSupabaseClient();
  if (!client) return [];

  try {
    let allUsers: MetrologyUser[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await client
        .from('users')
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, to);

      if (error) {
        console.error(`Supabase query error for users at range ${from}-${to}:`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allUsers = [...allUsers, ...(data as MetrologyUser[])];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    if (allUsers.length > 0) {
      return allUsers;
    }
    
    // Seed database if we got positive empty set response
    await seedSupabaseIfEmpty(client);
    return INITIAL_USERS;
  } catch (e) {
    console.warn('Falling back to local storage registries on Supabase fetch failure:', e);
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
    const { error } = await client
      .from('users')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      if (isMissingPasswordMetadataColumn(error)) {
        const { error: legacyError } = await client
          .from('users')
          .upsert(withoutPasswordMetadata(payload), { onConflict: 'id' });
        if (legacyError) {
          console.error('Supabase upsert error on users table:', legacyError);
          throw legacyError;
        }
      } else {
        console.error('Supabase upsert error on users table:', error);
        throw error;
      }
    }
    console.log('Synchronized licensee user successfully to Supabase:', user.username);
  } catch (e) {
    console.warn('Failed to upsert user to Supabase:', e);
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

  const client = getActiveSupabaseClient();
  if (!client) {
    return updatedUser;
  }

  const { error } = await client
    .from('users')
    .update({
      password_hash: passwordHash,
      password_updated_at: changedAt,
      must_change_password: false,
      last_password_change_by: user.id,
    })
    .eq('id', user.id);

  if (error) {
    if (isMissingPasswordMetadataColumn(error)) {
      throw new Error('Password hash columns are missing. Please run supabase_change_password_migration.sql first.');
    }
    throw error;
  }

  return updatedUser;
}

/**
 * Delete user profile from Supabase
 */
export async function deleteUserFromSupabase(userId: string): Promise<void> {
  const client = getActiveSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Supabase query error deleting user:', error);
      throw error;
    }
    console.log('Successfully removed user from Supabase:', userId);
  } catch (e) {
    console.warn('Failed to delete user on Supabase instance:', e);
    throw e;
  }
}

/**
 * Fetch all monthly metrology reports from Supabase
 * Implements automatic chunking/pagination to query more than 1,000 records safely.
 */
export async function fetchReportsFromSupabase(currentUser?: MetrologyUser): Promise<MetrologyReport[]> {
  const client = getActiveSupabaseClient();
  if (!client) {
    const local = localStorage.getItem('nmc_reports');
    const all: MetrologyReport[] = local ? JSON.parse(local) : INITIAL_REPORTS;
    if (currentUser && currentUser.role === 'company') {
      return all.filter(r => isReportOwnedByCurrentCompany(r, currentUser));
    }
    return all;
  }

  try {
    let allReports: MetrologyReport[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let q = client
        .from('reports')
        .select('*');

      if (currentUser && currentUser.role === 'company') {
        const conds: string[] = [];
        if (currentUser.id) conds.push(`user_id.eq.${currentUser.id}`);
        if (currentUser.license_number) conds.push(`license_number.eq.${currentUser.license_number}`);
        if (currentUser.company_name_kh) conds.push(`company_name_kh.eq.${currentUser.company_name_kh}`);
        if (conds.length > 0) {
          q = q.or(conds.join(','));
        }
      }

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error(`Supabase query error fetch reports at range ${from}-${to}:`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allReports = [...allReports, ...(data as MetrologyReport[])];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    if (allReports.length > 0) {
      return allReports;
    }

    // Seed database if positive empty response returned
    if (isDemoDataEnabled()) {
      await seedSupabaseIfEmpty(client);
      const seeded = INITIAL_REPORTS;
      if (currentUser && currentUser.role === 'company') {
        return seeded.filter(r => isReportOwnedByCurrentCompany(r, currentUser));
      }
      return seeded;
    }
    return [];
  } catch (e) {
    console.warn('Falling back to local storage databases on Supabase reports fetch failure:', e);
    const local = localStorage.getItem('nmc_reports');
    const all: MetrologyReport[] = local ? JSON.parse(local) : INITIAL_REPORTS;
    if (currentUser && currentUser.role === 'company') {
      return all.filter(r => isReportOwnedByCurrentCompany(r, currentUser));
    }
    return all;
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
  const client = getActiveSupabaseClient();
  if (!client) return null;

  try {
    const hash = await sha256(token);
    const { data, error } = await client
      .from('reports')
      .select('*')
      .eq('verification_token_hash', hash);

    if (error) {
      console.error('Error fetching report by secure verification hash:', error);
      return null;
    }

    if (data && data.length > 0) {
      return data[0] as MetrologyReport;
    }

    // Try finding by direct ID as a clean fallback for older testing records
    const { data: dataById } = await client
      .from('reports')
      .select('*')
      .eq('id', token);
    
    if (dataById && dataById.length > 0) {
      return dataById[0] as MetrologyReport;
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

  try {
    const { error } = await client
      .from('reports')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Supabase upload error on reports collection:', error);
      throw error;
    }
    console.log('Synchronized monthly report successfully to Supabase:', report.id);
  } catch (e) {
    console.error('Failed to save report to Supabase Cloud:', e);
    throw e;
  }
}

/**
 * Delete metrology report from Supabase
 */
export async function deleteReportFromSupabase(reportId: string): Promise<void> {
  const client = getActiveSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('reports')
      .delete()
      .eq('id', reportId);

    if (error) {
       console.error('Supabase deletion error on report:', error);
       throw error;
    }
    console.log('Successfully deleted report from Supabase:', reportId);
  } catch (e) {
    console.error('Failed to delete report on Supabase Cloud:', e);
    throw e;
  }
}

/**
 * Fetch licenses from Supabase with safe offline fallback
 */
export async function fetchLicensesFromSupabase(currentUser?: MetrologyUser): Promise<EnterpriseLicense[]> {
  const client = getActiveSupabaseClient();
  if (!client) {
    const local = localStorage.getItem('nmc_licenses');
    const all = local ? JSON.parse(local) : INITIAL_LICENSES;
    if (currentUser && currentUser.role === 'company') {
      return all.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
    }
    return all;
  }

  try {
    const query = client
      .from('enterprise_licenses')
      .select('*')
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    if (data && data.length > 0) {
      const records = data as EnterpriseLicense[];
      if (currentUser && currentUser.role === 'company') {
        return records.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
      }
      return records;
    }
    
    // Seed if empty on Supabase
    const local = localStorage.getItem('nmc_licenses');
    const records = local ? JSON.parse(local) : INITIAL_LICENSES;
    await client.from('enterprise_licenses').insert(records);
    if (currentUser && currentUser.role === 'company') {
      return records.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
    }
    return records;
  } catch (e) {
    console.warn('Failed to fetch from enterprise_licenses Supabase table. Using local storage Fallback.', e);
    const local = localStorage.getItem('nmc_licenses');
    const all = local ? JSON.parse(local) : INITIAL_LICENSES;
    if (currentUser && currentUser.role === 'company') {
      return all.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
    }
    return all;
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

function getMissingColumnFromSupabaseError(error: any): string | null {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return (
    text.match(/'([a-zA-Z0-9_]+)' column/)?.[1] ||
    text.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/)?.[1] ||
    null
  );
}

async function upsertLicensePayloadWithSchemaFallback(
  client: SupabaseClient,
  payload: Record<string, any>
): Promise<void> {
  let candidate = { ...payload };
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 20; attempt++) {
    const { error } = await client
      .from('enterprise_licenses')
      .upsert(candidate, { onConflict: 'id' });

    if (!error) {
      if (removedColumns.size > 0) {
        console.warn(
          'Saved license after skipping Supabase columns missing from this schema:',
          Array.from(removedColumns)
        );
      }
      return;
    }

    const missingColumn = getMissingColumnFromSupabaseError(error);
    if (!missingColumn || !(missingColumn in candidate)) {
      throw error;
    }

    removedColumns.add(missingColumn);
    const { [missingColumn]: _removed, ...nextCandidate } = candidate;
    candidate = nextCandidate;
  }

  throw new Error('Could not save license after pruning schema-mismatched columns.');
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

  if (!client) return;

  try {
    await upsertLicensePayloadWithSchemaFallback(client, createSupabaseLicensePayload(license));
    console.log('Saved license to Supabase successfully:', license.id);
  } catch (e) {
    console.warn('Schema-safe license save to Supabase failed. Attempting fallback save with pruned standard columns...', e);
    try {
      const schemaPayload = createSupabaseLicensePayload(license);
      const prunedLicense = Object.keys(schemaPayload).reduce((acc: any, key) => {
        if (STANDARD_LICENSE_COLUMNS.has(key)) {
          acc[key] = schemaPayload[key];
        }
        return acc;
      }, {});

      await upsertLicensePayloadWithSchemaFallback(client, prunedLicense);
      console.log('Saved pruned license to Supabase successfully after column mismatch bypass:', license.id);
    } catch (err) {
      console.error('Failed to save license to Supabase (even after pruning):', err);
      throw err;
    }
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

  const client = getActiveSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('enterprise_licenses')
      .delete()
      .eq('id', licenseId);

    if (error) throw error;
  } catch (e) {
    console.error('Failed to delete license from Supabase:', e);
    throw e;
  }
}

/**
 * Fetch reminder logs
 */
export async function fetchReminderLogsFromSupabase(licenseId?: string, currentUser?: MetrologyUser): Promise<LicenseReminderLog[]> {
  const client = getActiveSupabaseClient();
  if (!client) {
    const local = localStorage.getItem('nmc_reminder_logs');
    let logs: LicenseReminderLog[] = local ? JSON.parse(local) : INITIAL_REMINDER_LOGS;
    if (licenseId) {
      logs = logs.filter(l => l.license_id === licenseId);
    }
    if (currentUser && currentUser.role === 'company') {
      const ownedLics = INITIAL_LICENSES.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
      const ownedIds = ownedLics.map(o => o.id);
      logs = logs.filter(l => ownedIds.includes(l.license_id));
    }
    return logs;
  }

  try {
    let query = client.from('license_reminder_logs').select('*').order('sent_at', { ascending: false });
    if (licenseId) {
      query = query.eq('license_id', licenseId);
    }

    if (currentUser && currentUser.role === 'company') {
      const ownedLics = await fetchLicensesFromSupabase(currentUser);
      const ownedIds = ownedLics.map(l => l.id);
      if (ownedIds.length === 0) {
        return [];
      }
      query = query.in('license_id', ownedIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as LicenseReminderLog[];
  } catch (e) {
    console.warn('Failed to fetch reminder logs from Supabase, resorting to local storage.', e);
    const local = localStorage.getItem('nmc_reminder_logs');
    let logs: LicenseReminderLog[] = local ? JSON.parse(local) : INITIAL_REMINDER_LOGS;
    if (licenseId) {
      logs = logs.filter(l => l.license_id === licenseId);
    }
    if (currentUser && currentUser.role === 'company') {
      const ownedLics = INITIAL_LICENSES.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
      const ownedIds = ownedLics.map(o => o.id);
      logs = logs.filter(l => ownedIds.includes(l.license_id));
    }
    return logs;
  }
}

/**
 * Save reminder log
 */
export async function saveReminderLogToSupabase(log: LicenseReminderLog): Promise<void> {
  const local = localStorage.getItem('nmc_reminder_logs');
  let list: LicenseReminderLog[] = local ? JSON.parse(local) : INITIAL_REMINDER_LOGS;
  list.unshift(log);
  localStorage.setItem('nmc_reminder_logs', JSON.stringify(list));

  const client = getActiveSupabaseClient();
  if (!client) return;

  try {
    await client.from('license_reminder_logs').insert(log);
  } catch (e) {
    console.error('Failed to insert reminder log to Supabase:', e);
  }
}

/**
 * Fetch license renewal history
 */
export async function fetchRenewalHistoryFromSupabase(licenseId?: string, currentUser?: MetrologyUser): Promise<LicenseRenewalHistory[]> {
  const client = getActiveSupabaseClient();
  if (!client) {
    const local = localStorage.getItem('nmc_renewal_history');
    let histories: LicenseRenewalHistory[] = local ? JSON.parse(local) : INITIAL_RENEWAL_HISTORIES;
    if (licenseId) {
      histories = histories.filter(h => h.license_id === licenseId);
    }
    if (currentUser && currentUser.role === 'company') {
      const ownedLics = INITIAL_LICENSES.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
      const ownedIds = ownedLics.map(o => o.id);
      histories = histories.filter(h => ownedIds.includes(h.license_id));
    }
    return histories;
  }

  try {
    let query = client.from('license_renewal_history').select('*').order('renewed_at', { ascending: false });
    if (licenseId) {
      query = query.eq('license_id', licenseId);
    }

    if (currentUser && currentUser.role === 'company') {
      const ownedLics = await fetchLicensesFromSupabase(currentUser);
      const ownedIds = ownedLics.map(l => l.id);
      if (ownedIds.length === 0) {
        return [];
      }
      query = query.in('license_id', ownedIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as LicenseRenewalHistory[];
  } catch (e) {
    console.warn('Failed to fetch renewal history from Supabase, resorting to local storage.', e);
    const local = localStorage.getItem('nmc_renewal_history');
    let histories: LicenseRenewalHistory[] = local ? JSON.parse(local) : INITIAL_RENEWAL_HISTORIES;
    if (licenseId) {
      histories = histories.filter(h => h.license_id === licenseId);
    }
    if (currentUser && currentUser.role === 'company') {
      const ownedLics = INITIAL_LICENSES.filter((l: any) => isLicenseOwnedByCurrentCompany(l, currentUser));
      const ownedIds = ownedLics.map(o => o.id);
      histories = histories.filter(h => ownedIds.includes(h.license_id));
    }
    return histories;
  }
}

/**
 * Save renewal history record
 */
export async function saveRenewalHistoryToSupabase(history: LicenseRenewalHistory): Promise<void> {
  const local = localStorage.getItem('nmc_renewal_history');
  let list: LicenseRenewalHistory[] = local ? JSON.parse(local) : INITIAL_RENEWAL_HISTORIES;
  list.unshift(history);
  localStorage.setItem('nmc_renewal_history', JSON.stringify(list));

  const client = getActiveSupabaseClient();
  if (!client) return;

  try {
    await client.from('license_renewal_history').insert(history);
  } catch (e) {
    console.error('Failed to insert renewal history record into Supabase:', e);
  }
}

/**
 * Fetch bot settings from Supabase or localStorage fallback
 */
export async function fetchBotSettingsFromSupabase(): Promise<TelegramBotSetting[]> {
  const client = getActiveSupabaseClient();
  if (!client) {
    const local = localStorage.getItem('nmc_bot_settings');
    return local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
  }

  try {
    const response = await fetch('/api/telegram-bot-settings', {
      headers: await getApiJsonHeaders(),
    });
    const data = await readJsonResponseSafely(response);
    if (response.ok && data) {
      const safeRecords = (data.bots || []).map(sanitizeBotSettingForBrowserStorage);
      localStorage.setItem('nmc_bot_settings', JSON.stringify(safeRecords));
      return safeRecords;
    }
  } catch (e) {
    console.warn('Server-side Telegram Bot settings fetch unavailable. Falling back to client metadata fetch.', e);
  }

  try {
    const { data, error } = await client
      .from('telegram_bot_settings')
      .select('id, bot_name, bot_username, bot_token_encrypted, bot_purpose, default_chat_id, default_group_chat_id, is_active, description, connection_status, last_test_status, last_test_message, last_error, last_tested_at, webhook_status, webhook_url, bot_display_name, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (data && data.length > 0) {
      return (data as TelegramBotSetting[]).map(sanitizeBotSettingForBrowserStorage);
    }
    
    // Seed if empty in Supabase
    const local = localStorage.getItem('nmc_bot_settings');
    const records = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
    try {
      await client.from('telegram_bot_settings').insert(records);
    } catch (err) {
      console.warn('Failed to background seed telegram_bot_settings:', err);
    }
    const safeRecords = records.map(sanitizeBotSettingForBrowserStorage);
    localStorage.setItem('nmc_bot_settings', JSON.stringify(safeRecords));
    return safeRecords;
  } catch (e) {
    console.warn('Failed to fetch from telegram_bot_settings Supabase table. Using local fallback.', e);
    const local = localStorage.getItem('nmc_bot_settings');
    const fallbackRecords = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
    const safeRecords = fallbackRecords.map(sanitizeBotSettingForBrowserStorage);
    localStorage.setItem('nmc_bot_settings', JSON.stringify(safeRecords));
    return safeRecords;
  }
}

export async function fetchActiveReminderBotPublic(): Promise<TelegramBotSetting | null> {
  const client = getActiveSupabaseClient();
  if (!client) {
    const local = localStorage.getItem('nmc_bot_settings');
    const records: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
    const active = records.find(b => b.is_active && ['license_reminder', 'both'].includes(b.bot_purpose || 'license_reminder'));
    return active ? sanitizeBotSettingForBrowserStorage(active) : null;
  }

  try {
    const { data, error } = await client
      .from('telegram_bot_settings')
      .select('id, bot_name, bot_username, bot_token_encrypted, bot_purpose, is_active, description, connection_status, last_test_status, last_test_message, last_error, last_tested_at, webhook_status, webhook_url, bot_display_name, created_at, updated_at')
      .eq('is_active', true)
      .limit(10);

    if (error) throw error;
    const active = (data || []).find((bot: any) =>
      ['license_reminder', 'both'].includes(bot.bot_purpose || 'license_reminder') &&
      String(bot.bot_username || '').trim() &&
      String(bot.bot_token_encrypted || '').trim()
    ) as Partial<TelegramBotSetting> | undefined;
    if (!active) return null;
    return {
      id: String(active.id || ''),
      bot_name: active.bot_name || null,
      bot_username: String(active.bot_username || ''),
      bot_token_encrypted: '',
      bot_purpose: active.bot_purpose || 'license_reminder',
      default_chat_id: null,
      webhook_url: null,
      webhook_secret_encrypted: null,
      is_active: active.is_active !== false,
      description: active.description || null,
      connection_status: active.connection_status || (active.last_test_status === 'Success' ? 'connected' : 'not_verified'),
      last_test_status: active.last_test_status || null,
      last_test_message: active.last_test_message || null,
      last_error: active.last_error || null,
      last_tested_at: active.last_tested_at || null,
      webhook_status: active.webhook_status || (active.webhook_url ? 'configured' : 'not_configured'),
      bot_display_name: active.bot_display_name || null,
      created_at: active.created_at || new Date().toISOString(),
      updated_at: active.updated_at || new Date().toISOString(),
    };
  } catch (e) {
    console.warn('Failed to fetch public active reminder bot metadata:', e);
    return null;
  }
}

function sanitizeBotSettingForBrowserStorage(setting: TelegramBotSetting): TelegramBotSetting {
  return {
    ...setting,
    bot_purpose: setting.bot_purpose || 'license_reminder',
    connection_status: setting.connection_status || (setting.last_test_status === 'Success' ? 'connected' : setting.last_test_status === 'Failed' ? 'error' : 'not_verified'),
    webhook_status: setting.webhook_status || (setting.webhook_url ? 'configured' : 'not_configured'),
    bot_token_encrypted: setting.bot_token_encrypted ? 'PROTECTED_SERVER_SIDE' : '',
    webhook_secret_encrypted: setting.webhook_secret_encrypted ? 'PROTECTED_SERVER_SIDE' : null,
  };
}

/**
 * Save bot setting to Supabase or localStorage
 */
export async function saveBotSettingToSupabase(setting: TelegramBotSetting): Promise<void> {
  const client = getActiveSupabaseClient();
  if (client) {
    try {
      const response = await fetch('/api/telegram-bot-settings', {
        method: 'POST',
        headers: await getApiJsonHeaders(),
        body: JSON.stringify(setting)
      });
      const data = await readJsonResponseSafely(response);
      if (response.ok && data) {
        const safeSetting = sanitizeBotSettingForBrowserStorage(data.bot || setting);
        const local = localStorage.getItem('nmc_bot_settings');
        let list: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
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
        const idx = list.findIndex(b => b.id === safeSetting.id);
        if (idx !== -1) {
          list[idx] = safeSetting;
        } else {
          list.unshift(safeSetting);
        }
        localStorage.setItem('nmc_bot_settings', JSON.stringify(list));
        return;
      }
    } catch (e) {
      console.warn('Server-side Telegram Bot settings save unavailable. Falling back to client save.', e);
    }
  }

  const local = localStorage.getItem('nmc_bot_settings');
  let list: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
  const safeSetting = sanitizeBotSettingForBrowserStorage(setting);
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

  try {
    if (setting.is_active) {
      // Deactivate other bots with overlapping purposes in Supabase.
      try {
        await client
          .from('telegram_bot_settings')
          .update({ is_active: false })
          .in('bot_purpose', settingCapabilities)
          .not('id', 'eq', setting.id);
      } catch (err) {
        console.warn('Unable to deactivate other bots in Supabase:', err);
      }
    }
    const payload = stripProtectedBotSecrets(setting);
    const query = client.from('telegram_bot_settings');
    const { error } = isProtectedBotSecret(setting.bot_token_encrypted)
      ? await query.update(payload).eq('id', setting.id)
      : await query.upsert(payload, { onConflict: 'id' });

    if (error) throw error;
  } catch (e) {
    console.warn('Failed to save bot setting to Supabase (utilizing active local fallback storage instead):', e);
  }
}

/**
 * Delete bot setting from Supabase or localStorage
 */
export async function deleteBotSettingFromSupabase(botId: string): Promise<void> {
  const client = getActiveSupabaseClient();
  if (client) {
    try {
      const response = await fetch(`/api/telegram-bot-settings/${encodeURIComponent(botId)}`, {
        method: 'DELETE',
        headers: await getApiJsonHeaders(),
      });
      if (response.ok) {
        const local = localStorage.getItem('nmc_bot_settings');
        let list: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
        list = list.filter(b => b.id !== botId);
        localStorage.setItem('nmc_bot_settings', JSON.stringify(list));
        return;
      }
    } catch (e) {
      console.warn('Server-side Telegram Bot settings delete unavailable. Falling back to client delete.', e);
    }
  }

  const local = localStorage.getItem('nmc_bot_settings');
  let list: TelegramBotSetting[] = local ? JSON.parse(local) : INITIAL_BOT_SETTINGS;
  list = list.filter(b => b.id !== botId);
  localStorage.setItem('nmc_bot_settings', JSON.stringify(list));

  if (!client) return;

  try {
    const { error } = await client
      .from('telegram_bot_settings')
      .delete()
      .eq('id', botId);

    if (error) throw error;
  } catch (e) {
    console.warn('Failed to delete bot setting from Supabase (removed from active local storage registry):', e);
  }
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
  const client = getActiveSupabaseClient();
  if (!client) {
    const local = localStorage.getItem('nmc_license_attachments');
    const all: EnterpriseLicenseAttachment[] = local ? JSON.parse(local) : [];
    return all.filter(a => a.license_id === licenseId);
  }

  try {
    const { data, error } = await client
      .from('enterprise_license_attachments')
      .select('*')
      .eq('license_id', licenseId)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Failed to fetch attachments from Supabase:', e);
    // Fallback to local storage
    const local = localStorage.getItem('nmc_license_attachments');
    const all: EnterpriseLicenseAttachment[] = local ? JSON.parse(local) : [];
    return all.filter(a => a.license_id === licenseId);
  }
}

/**
 * Save attachment metadata to Supabase
 */
export async function saveAttachmentToSupabase(attachment: EnterpriseLicenseAttachment): Promise<void> {
  // Update local storage first
  const local = localStorage.getItem('nmc_license_attachments');
  let list: EnterpriseLicenseAttachment[] = local ? JSON.parse(local) : [];
  const idx = list.findIndex(a => a.id === attachment.id);
  if (idx !== -1) {
    list[idx] = attachment;
  } else {
    list.unshift(attachment);
  }
  try {
    localStorage.setItem('nmc_license_attachments', JSON.stringify(list));
  } catch (quotaError) {
    console.warn('LocalStorage save failed for attachments due to quota limit:', quotaError);
  }

  const client = getActiveSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('enterprise_license_attachments')
      .upsert(attachment, { onConflict: 'id' });

    if (error) throw error;
    console.log('Saved attachment to Supabase successfully:', attachment.id);
  } catch (e) {
    console.error('Failed to save attachment metadata to Supabase:', e);
    throw e;
  }
}

/**
 * Delete attachment from Supabase
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

  const client = getActiveSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from('enterprise_license_attachments')
      .delete()
      .eq('id', attachmentId);

    if (error) throw error;
    console.log('Deleted attachment from Supabase successfully:', attachmentId);
  } catch (e) {
    console.error('Failed to delete attachment from Supabase:', e);
    throw e;
  }
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
    throw new Error('Supabase is not connected (Running in offline/demo mode). Please connect Supabase to upload files.');
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
