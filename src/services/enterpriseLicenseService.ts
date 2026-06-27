import { EnterpriseLicense, LicenseRenewalHistory, MetrologyUser } from '../types';
import { getActiveSupabaseClient } from '../supabaseSync';

const LICENSES_KEY = 'nmc_enterprise_licenses';
const HISTORY_KEY = 'nmc_license_renewal_history';
export const LICENSE_PHOTO_BUCKET = 'license-owner-photos';

export type LicenseAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'print' | 'renew';

export function canManageLicense(user: MetrologyUser, action: LicenseAction): boolean {
  if (user.role === 'superadmin') return true;
  if (user.role === 'company') return action === 'view' && user.can_view !== false;
  const permissions: Record<Exclude<LicenseAction, 'delete'>, boolean> = {
    view: !!user.admin_can_view_licenses,
    create: !!user.admin_can_create_licenses,
    edit: !!user.admin_can_edit_licenses,
    export: !!user.admin_can_export_licenses,
    print: !!user.admin_can_print_licenses,
    renew: !!user.admin_can_renew_licenses,
  };
  return action === 'delete' ? false : permissions[action];
}

function requirePermission(user: MetrologyUser, action: LicenseAction) {
  if (!canManageLicense(user, action)) throw new Error(`Unauthorized license action: ${action}`);
}

function readLocal<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as T[]; } catch { return []; }
}

function writeLocal<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function addYears(dateString: string, years = 3): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  // Feb 29 expires on Feb 28 when the target year is not a leap year.
  if (date.getUTCMonth() !== month - 1) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export function calculateLicenseStatus(expiry: string, current?: string): EnterpriseLicense['license_status'] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(`${expiry}T00:00:00`);
  if (current === 'Suspended' || current === 'Cancelled') return current;
  if (end < today) return 'Expired';
  const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  return days <= 90 ? 'Expiring Soon' : current === 'Renewed' ? 'Renewed' : 'Active';
}

export async function fetchEnterpriseLicenses(user: MetrologyUser): Promise<EnterpriseLicense[]> {
  requirePermission(user, 'view');
  const client = getActiveSupabaseClient();
  let data: EnterpriseLicense[] = [];
  if (client) {
    const result = await client.from('enterprise_licenses').select('*').order('license_expiry_date');
    if (result.error) throw result.error;
    data = (result.data || []) as EnterpriseLicense[];
    writeLocal(LICENSES_KEY, data);
  } else data = readLocal<EnterpriseLicense>(LICENSES_KEY);
  const visible = user.role === 'company'
    ? data.filter(x => x.company_user_id === user.id || x.company_id === user.id || x.license_number === user.license_number)
    : data;
  return visible.map(x => ({ ...x, license_status: calculateLicenseStatus(x.license_expiry_date, x.license_status) }));
}

export async function saveEnterpriseLicense(user: MetrologyUser, license: EnterpriseLicense, isNew: boolean): Promise<void> {
  requirePermission(user, isNew ? 'create' : 'edit');
  if (user.role === 'company') throw new Error('Company users cannot modify official licenses.');
  if (!license.company_name.trim() || !license.license_number.trim()) throw new Error('Company name and license number are required.');
  if (license.license_expiry_date <= license.license_issue_date) throw new Error('Expiry date must be after issue date.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const payload = { ...license, company_user_id: license.company_user_id && uuid.test(license.company_user_id) ? license.company_user_id : null, company_id: license.company_id && uuid.test(license.company_id) ? license.company_id : null, license_status: calculateLicenseStatus(license.license_expiry_date, license.license_status), updated_by: uuid.test(user.id) ? user.id : null, created_by: license.created_by && uuid.test(license.created_by) ? license.created_by : null, updated_at: new Date().toISOString() };
  const local = readLocal<EnterpriseLicense>(LICENSES_KEY);
  if (local.some(x => x.license_number.toLowerCase() === payload.license_number.toLowerCase() && x.id !== payload.id)) throw new Error('License number already exists.');
  const client = getActiveSupabaseClient();
  if (client) {
    const { error } = await client.from('enterprise_licenses').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  }
  writeLocal(LICENSES_KEY, isNew ? [payload, ...local] : local.map(x => x.id === payload.id ? payload : x));
}

export async function deleteEnterpriseLicense(user: MetrologyUser, license: EnterpriseLicense): Promise<void> {
  requirePermission(user, 'delete');
  const client = getActiveSupabaseClient();
  if (client) {
    const { error } = await client.from('enterprise_licenses').delete().eq('id', license.id);
    if (error) throw error;
    if (license.license_owner_photo_path) await client.storage.from(LICENSE_PHOTO_BUCKET).remove([license.license_owner_photo_path]);
  }
  writeLocal(LICENSES_KEY, readLocal<EnterpriseLicense>(LICENSES_KEY).filter(x => x.id !== license.id));
}

export async function renewEnterpriseLicense(user: MetrologyUser, license: EnterpriseLicense, issueDate: string, notes: string): Promise<EnterpriseLicense> {
  requirePermission(user, 'renew');
  if (!['admin', 'superadmin'].includes(user.role)) throw new Error('Only an administrator can renew licenses.');
  if (calculateLicenseStatus(license.license_expiry_date, license.license_status) !== 'Expired') throw new Error('Only expired licenses can be renewed.');
  const expiryDate = addYears(issueDate, 3);
  const now = new Date().toISOString();
  const renewed: EnterpriseLicense = { ...license, license_issue_date: issueDate, license_expiry_date: expiryDate, license_validity_years: 3, license_status: 'Renewed', notes: notes || license.notes, updated_by: user.id, updated_at: now };
  const history: LicenseRenewalHistory = { id: crypto.randomUUID(), license_id: license.id, old_issue_date: license.license_issue_date, old_expiry_date: license.license_expiry_date, new_issue_date: issueDate, new_expiry_date: expiryDate, renewed_by: user.id, renewed_by_role: user.role, renewed_at: now, notes };
  const client = getActiveSupabaseClient();
  if (client) {
    const renewedBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id) ? user.id : null;
    const { error } = await client.rpc('renew_enterprise_license', { p_license_id: license.id, p_new_issue_date: issueDate, p_renewed_by: renewedBy, p_renewed_by_role: user.role, p_notes: notes || null });
    if (error) throw error;
  }
  writeLocal(LICENSES_KEY, readLocal<EnterpriseLicense>(LICENSES_KEY).map(x => x.id === license.id ? renewed : x));
  writeLocal(HISTORY_KEY, [history, ...readLocal<LicenseRenewalHistory>(HISTORY_KEY)]);
  return renewed;
}

export async function fetchRenewalHistory(user: MetrologyUser, licenseId: string): Promise<LicenseRenewalHistory[]> {
  requirePermission(user, 'view');
  const client = getActiveSupabaseClient();
  if (client) {
    const { data, error } = await client.from('license_renewal_history').select('*').eq('license_id', licenseId).order('renewed_at', { ascending: false });
    if (error) throw error;
    return (data || []) as LicenseRenewalHistory[];
  }
  return readLocal<LicenseRenewalHistory>(HISTORY_KEY).filter(x => x.license_id === licenseId);
}

export async function uploadLicenseOwnerPhoto(user: MetrologyUser, licenseId: string, file: File): Promise<{ url: string; path: string }> {
  if (!canManageLicense(user, 'create') && !canManageLicense(user, 'edit')) throw new Error('Unauthorized license photo upload.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Only JPG, JPEG, PNG, or WebP files are allowed.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Photo must be 5MB or smaller.');
  const client = getActiveSupabaseClient();
  if (!client) throw new Error('Photo upload requires an active Supabase connection.');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${licenseId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client.storage.from(LICENSE_PHOTO_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return { path, url: client.storage.from(LICENSE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl };
}
