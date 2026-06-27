export type UserRole = 'superadmin' | 'admin' | 'company';

export interface MetrologyUser {
  id: string;
  license_number: string;
  company_name_kh: string;
  company_name_en: string;
  address: string;
  phone: string;
  email: string;
  legal_representative: string;
  representative_position: string;
  username: string;
  password?: string; // plain text in local state/sim for convenience, but labeled insecure
  password_hash?: string | null;
  password_updated_at?: string | null;
  must_change_password?: boolean;
  last_password_change_by?: string | null;
  role: UserRole;
  can_view: boolean;
  can_edit: boolean;
  can_save: boolean;
  can_delete: boolean;
  created_at: string;
  
  // Admin permission settings (added for Role/Permission Admin Control)
  admin_can_add_company_user?: boolean;
  admin_can_add_admin_user?: boolean;
  admin_can_edit_users?: boolean;
  admin_can_deactivate_users?: boolean;
  admin_can_view_all_users?: boolean;
  admin_can_view_licenses?: boolean;
  admin_can_create_licenses?: boolean;
  admin_can_edit_licenses?: boolean;
  admin_can_export_licenses?: boolean;
  admin_can_print_licenses?: boolean;
  admin_can_renew_licenses?: boolean;
  is_active?: boolean;
}

export type ServiceType = 'Manufacture' | 'Installation' | 'Repair';

export interface MetrologyReport {
  id: string;
  user_id: string; // references owner User.id
  license_number: string;
  company_name_kh: string;
  customer_name: string;
  customer_address: string;
  measuring_instrument: string;
  instrument_serial_number: string;
  scope_of_weight_measure: string;
  spare_parts: string;
  spare_part_serial_number: string;
  service_type: ServiceType;
  service_start_date: string;
  service_end_date: string;
  report_month: string; // "មករា" to "ធ្នូ" or numbers
  report_year: string;
  created_at: string;
  updated_at: string;
  
  // Secure Workflow Status & Verification Parameters (Added for Section D & G)
  report_status?: 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected';
  rejection_reason?: string;
  approved_by?: string;
  approved_at?: string;
  verification_token?: string; // raw secret random token for scanning (client)
  verification_token_hash?: string; // sha-256 hash stored in DB
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  useFallback: boolean;
}

export function generateYearOptions(startYear = 2020, endYear = 2050): number[] {
  const years: number[] = [];
  const start = Math.min(startYear, 2020); // standard safety check
  for (let year = start; year <= endYear; year++) {
    years.push(year);
  }
  return years;
}

export interface LoginHistory {
  id?: string;
  user_id: string;
  user_email: string;
  user_role: string;
  company_id: string;
  company_name: string;
  login_status: string;
  ip_address: string;
  user_agent: string;
  device_info: string;
  login_at: string;
}

export interface EnterpriseLicense {
  id: string;
  company_user_id?: string | null;
  company_id?: string | null;
  company_name: string;
  license_number: string;
  license_owner_name?: string | null;
  license_owner_position?: string | null;
  phone_number?: string | null;
  email?: string | null;

  // Telegram fields
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
  telegram_last_name?: string | null;
  telegram_connected_at?: string | null;
  telegram_connection_status?: 'Not Connected' | 'Connected' | 'Disconnected' | 'Failed';
  telegram_registration_token_hash?: string | null;
  telegram_registration_token_expires_at?: string | null;

  // License fields
  company_address?: string | null;
  company_name_kh?: string | null;
  province_city?: string | null;
  district_khan?: string | null;
  commune_sangkat?: string | null;
  village?: string | null;
  license_owner_national_id?: string | null;
  license_owner_phone?: string | null;
  license_owner_email?: string | null;
  service_fee_currency?: string | null;
  payment_status?: string | null;
  payment_reference?: string | null;
  payment_date?: string | null;
  payment_notes?: string | null;
  business_type?: string | null;
  service_scope?: string | null;
  measuring_instrument_type?: string | null;
  license_issue_date: string;
  license_expiry_date: string;
  license_validity_years?: number;
  license_status: 'Active' | 'Expiring Soon' | 'Expired' | 'Suspended' | 'Cancelled' | 'Renewed';
  
  // New Fields requested: Service Fee, Photo, Attachments, Credentials
  service_fee?: number | null;
  photo_base64?: string | null;
  attached_doc_base64?: string | null;
  attached_doc_name?: string | null;
  username?: string | null;
  password?: string | null;
  license_owner_photo_url?: string | null;
  license_owner_photo_path?: string | null;
  license_owner_photo_file_name?: string | null;
  license_owner_photo_uploaded_at?: string | null;
  
  last_90_day_reminder_sent_at?: string | null;
  last_60_day_reminder_sent_at?: string | null;
  last_30_day_reminder_sent_at?: string | null;
  last_15_day_reminder_sent_at?: string | null;
  last_7_day_reminder_sent_at?: string | null;
  expired_reminder_sent_at?: string | null;
  telegram_bot_setting_id?: string | null;

  notes?: string | null;
  representative_date_of_birth?: string | null;
  representative_gender?: string | null;
  representative_nationality?: string | null;
  business_latitude?: number | null;
  business_longitude?: number | null;
  business_location_source?: string | null;
  business_geo_address?: string | null;
  location_updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelegramBotSetting {
  id: string;
  bot_name?: string | null;
  bot_username: string;
  bot_token_encrypted: string; // Used securely in backend and masked in frontend
  bot_purpose?: 'report_notification' | 'report_group' | 'license_reminder' | 'both' | null;
  default_chat_id?: string | null;
  default_group_chat_id?: string | null;
  webhook_url?: string | null;
  webhook_secret_encrypted?: string | null;
  is_active: boolean;
  description?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  last_tested_at?: string | null;
  connection_status?: 'connected' | 'not_verified' | 'error' | string | null;
  last_error?: string | null;
  webhook_status?: 'configured' | 'not_configured' | string | null;
  bot_display_name?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseReminderLog {
  id: string;
  license_id: string;
  telegram_bot_setting_id?: string | null;
  reminder_type: '60_DAYS_BEFORE_EXPIRY' | '30_DAYS_BEFORE_EXPIRY' | '7_DAYS_BEFORE_EXPIRY' | 'EXPIRED' | 'TEST';
  reminder_days: number;
  telegram_chat_id?: string;
  telegram_username?: string | null;
  message_text: string;
  send_status: 'Sent' | 'Failed' | 'Skipped';
  error_message?: string | null;
  sent_at: string;
  created_at: string;
}

export interface LicenseRenewalHistory {
  id: string;
  license_id: string;
  old_issue_date: string;
  old_expiry_date: string;
  new_issue_date: string;
  new_expiry_date: string;
  renewed_by: string;
  renewed_by_role: string;
  renewed_at: string;
  notes?: string | null;
}

export interface EnterpriseLicenseAttachment {
  id: string;
  license_id: string;
  document_type: string;
  document_number?: string | null;
  document_date?: string | null;
  document_status?: string | null;
  display_order?: number | null;
  is_required?: boolean | null;
  is_verified?: boolean | null;
  verified_by?: string | null;
  verified_at?: string | null;
  file_name: string;
  file_type?: string | null;
  file_size?: number | null;
  file_url?: string | null;
  file_path?: string | null;
  attachment_category?: string | null;
  uploaded_by?: string | null;
  uploaded_at: string;
  notes?: string | null;
}
