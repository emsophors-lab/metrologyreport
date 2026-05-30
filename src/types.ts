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
  role: UserRole;
  can_view: boolean;
  can_edit: boolean;
  can_save: boolean;
  can_delete: boolean;
  created_at: string;
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
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
  useFallback: boolean;
}
