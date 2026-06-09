import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MetrologyUser, MetrologyReport, SupabaseConfig } from './types';
import { INITIAL_USERS, INITIAL_REPORTS } from './demoData';

// Dynamic config cache
let supabaseInstance: SupabaseClient | null = null;
let activeConfig: SupabaseConfig = {
  url: '',
  anonKey: '',
  isConnected: false,
  useFallback: true
};

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
  if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR_SUPABASE_URL')) {
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
        role: u.role,
        can_view: u.can_view,
        can_edit: u.can_edit,
        can_save: u.can_save,
        can_delete: u.can_delete,
        created_at: u.created_at || new Date().toISOString()
      }));

      const { error: seedUsersErr } = await client.from('users').insert(mappedUsers);
      if (seedUsersErr) {
        console.warn('Could not seed users table (Row Level Security may be active or columns mismatched):', seedUsersErr);
      }
    }

    // Check reports
    const { count: reportCount, error: rErr } = await client
      .from('reports')
      .select('*', { count: 'exact', head: true });

    if (!rErr && (reportCount === 0 || reportCount === null)) {
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
      console.error('Supabase upsert error on users table:', error);
      throw error;
    }
    console.log('Synchronized licensee user successfully to Supabase:', user.username);
  } catch (e) {
    console.warn('Failed to upsert user to Supabase:', e);
    throw e;
  }
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
export async function fetchReportsFromSupabase(): Promise<MetrologyReport[]> {
  const client = getActiveSupabaseClient();
  if (!client) return [];

  try {
    let allReports: MetrologyReport[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await client
        .from('reports')
        .select('*')
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
    await seedSupabaseIfEmpty(client);
    return INITIAL_REPORTS;
  } catch (e) {
    console.warn('Falling back to local storage databases on Supabase reports fetch failure:', e);
    throw e;
  }
}

/**
 * Save metrology report to Supabase (Upsert pattern)
 */
export async function saveReportToSupabase(report: MetrologyReport): Promise<void> {
  const client = getActiveSupabaseClient();
  if (!client) return;

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
