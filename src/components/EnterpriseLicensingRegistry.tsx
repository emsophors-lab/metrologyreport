import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft,
  Building2, 
  Award, 
  Calendar, 
  Send, 
  ShieldCheck, 
  RefreshCw, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Filter, 
  AlertTriangle, 
  MessageSquare, 
  Check, 
  X, 
  Copy,
  QrCode, 
  Bot, 
  Info, 
  Clock, 
  ExternalLink,
  Lock,
  UserCheck,
  User,
  Smartphone,
  Mail,
  MapPin,
  Map,
  FileText,
  Download,
  Printer,
  Upload,
  Camera,
  Eye
} from 'lucide-react';
import { MetrologyUser, EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, TelegramBotSetting, EnterpriseLicenseAttachment } from '../types';
import {
  fetchLicensesFromSupabase,
  saveLicenseToSupabase,
  deleteLicenseFromSupabase,
  fetchReminderLogsFromSupabase,
  saveReminderLogToSupabase,
  fetchRenewalHistoryFromSupabase,
  saveRenewalHistoryToSupabase,
  saveUserToSupabase,
  fetchBotSettingsFromSupabase,
  fetchActiveReminderBotPublic,
  saveBotSettingToSupabase,
  deleteBotSettingFromSupabase,
  checkIfLicensingTablesExist,
  isLicenseOwnedByCurrentCompany,
  fetchAttachmentsFromSupabase,
  saveAttachmentToSupabase,
  deleteAttachmentFromSupabase,
  uploadFileToSupabase,
  getActiveSupabaseClient
} from '../supabaseSync';
import { getApiAuthHeaders } from '../apiAuth';
import { logAuditEvent } from '../services/loginHistoryService';
import { jsPDF } from 'jspdf';
import { BusinessLocationMap } from './BusinessLocationMap';
import { EnterpriseLicenseMapView } from './EnterpriseLicenseMapView';
import { MiniLocationMap } from './MiniLocationMap';


const LICENSING_SQL_MIGRATION = `-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - LICENSING & TELEGRAM BOT SQL
-- =========================================================================

-- 1. Create Enterprise Licenses TABLE
CREATE TABLE IF NOT EXISTS enterprise_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_user_id TEXT,
  company_id TEXT,
  company_name TEXT NOT NULL,
  company_name_kh TEXT,
  license_number TEXT NOT NULL UNIQUE,
  company_address TEXT,
  province_city TEXT,
  district_khan TEXT,
  commune_sangkat TEXT,
  village TEXT,
  phone_number TEXT,
  email TEXT,
  business_type TEXT,
  service_scope TEXT,
  measuring_instrument_type TEXT,
  license_owner_name TEXT,
  license_owner_position TEXT,
  license_owner_national_id TEXT,
  license_owner_phone TEXT,
  license_owner_email TEXT,
  license_owner_photo_url TEXT,
  license_owner_photo_path TEXT,
  license_issue_date DATE NOT NULL,
  license_expiry_date DATE NOT NULL,
  license_validity_years INTEGER DEFAULT 3,
  license_status TEXT DEFAULT 'Active',
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  service_fee_amount NUMERIC,
  service_fee_currency TEXT DEFAULT 'USD',
  payment_status TEXT DEFAULT 'Pending',
  payment_reference TEXT,
  payment_date DATE,
  payment_notes TEXT,
  client_username TEXT,
  client_password TEXT,
  certificate_pdf_url TEXT,
  certificate_pdf_path TEXT,
  qr_verification_token TEXT,
  qr_verification_url TEXT,
  qr_code_data TEXT,
  certificate_generated_at TIMESTAMP WITH TIME ZONE,
  certificate_generated_by TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  telegram_connected_at TIMESTAMP WITH TIME ZONE,
  telegram_connection_status TEXT DEFAULT 'Not Connected',
  telegram_registration_token_hash TEXT,
  telegram_registration_token_expires_at TIMESTAMP WITH TIME ZONE,
  telegram_bot_setting_id UUID,
  last_60_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_30_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_7_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  expired_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Create Attachments Table
CREATE TABLE IF NOT EXISTS enterprise_license_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  file_url TEXT,
  file_path TEXT,
  attachment_category TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);

-- 3. Create Telegram Bot Settings Table
CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name TEXT,
  bot_username TEXT NOT NULL,
  bot_token_encrypted TEXT NOT NULL,
  bot_purpose TEXT DEFAULT 'license_reminder',
  default_chat_id TEXT,
  default_group_chat_id TEXT,
  webhook_url TEXT,
  webhook_secret_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  last_test_status TEXT,
  last_test_message TEXT,
  last_tested_at TIMESTAMP WITH TIME ZONE,
  connection_status TEXT DEFAULT 'not_verified',
  last_error TEXT,
  webhook_status TEXT DEFAULT 'not_configured',
  bot_display_name TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Create Reminder Logs Table
CREATE TABLE IF NOT EXISTS license_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
  telegram_bot_setting_id UUID REFERENCES telegram_bot_settings(id) ON DELETE SET NULL,
  reminder_type TEXT,
  reminder_days INTEGER,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  message_text TEXT,
  send_status TEXT DEFAULT 'Skipped',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Create Renewal History Table
CREATE TABLE IF NOT EXISTS license_renewal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
  old_issue_date DATE,
  old_expiry_date DATE,
  new_issue_date DATE,
  new_expiry_date DATE,
  renewed_by TEXT,
  renewed_by_role TEXT,
  renewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);

-- 6. Indexes for Performance Optimization
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_license_number ON enterprise_licenses(license_number);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_company_name ON enterprise_licenses(company_name);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_expiry_date ON enterprise_licenses(license_expiry_date);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_status ON enterprise_licenses(license_status);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_qr_token ON enterprise_licenses(qr_verification_token);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_telegram_chat_id ON enterprise_licenses(telegram_chat_id);

-- 7. Enable RLS
ALTER TABLE enterprise_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_license_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_renewal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_settings ENABLE ROW LEVEL SECURITY;

-- 8. Setup permissive sandbox read/write policies (Active when ENABLE_DEMO_LOGIN=true)
CREATE POLICY "Public read/write access for licensing" ON enterprise_licenses FOR ALL USING (true);
CREATE POLICY "Public read/write access for attachments" ON enterprise_license_attachments FOR ALL USING (true);
CREATE POLICY "Public read/write access for reminder logs" ON license_reminder_logs FOR ALL USING (true);
CREATE POLICY "Public read/write access for renewal history" ON license_renewal_history FOR ALL USING (true);
CREATE POLICY "Public read/write access for telegram bot settings" ON telegram_bot_settings FOR ALL USING (true);

ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_purpose TEXT DEFAULT 'license_reminder';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS default_group_chat_id TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'not_verified';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'not_configured';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_display_name TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
`;

const safeConfirm = (message: string): boolean => {
  try {
    if (typeof window !== 'undefined' && 'confirm' in window) {
      return window.confirm(message);
    }
  } catch (err) {
    console.warn("Blocked native window.confirm call in sandboxed preview:", err);
  }
  return true; // default to true so users can still proceed in embedded preview
};

const safePrompt = (message: string, defaultValue?: string): string | null => {
  try {
    if (typeof window !== 'undefined' && 'prompt' in window) {
      return window.prompt(message, defaultValue);
    }
  } catch (err) {
    console.warn("Blocked native window.prompt call in sandboxed preview:", err);
  }
  return defaultValue !== undefined ? defaultValue : null;
};

const isProtectedTokenPlaceholder = (token?: string | null) =>
  !token || ['PROTECTED_UNCHANGED', 'PROTECTED_SERVER_SIDE'].includes(token) || /^[*•●]+$/.test(token.trim());

const isSupabaseUuid = (value?: string | null) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const hasUsableBotToken = (bot?: TelegramBotSetting | null) =>
  !!bot && !!String(bot.bot_token_encrypted || '').trim() && !isProtectedTokenPlaceholder(bot.bot_token_encrypted);

const hasUsableBotIdentity = (bot?: TelegramBotSetting | null, allowProtectedToken = false) =>
  !!bot &&
  bot.is_active === true &&
  !!String(bot.bot_username || '').trim() &&
  (allowProtectedToken || hasUsableBotToken(bot));

const normalizeBotPurpose = (purpose?: string | null) =>
  purpose === 'report_notification' ? 'report_group' : (purpose || 'license_reminder');

const botSupportsPurpose = (bot: TelegramBotSetting, purpose: 'license_reminder' | 'report_group') => {
  const normalized = normalizeBotPurpose(bot.bot_purpose);
  return normalized === purpose || normalized === 'both';
};

const botRequiresGroupChat = (bot: TelegramBotSetting) => {
  const normalized = normalizeBotPurpose(bot.bot_purpose);
  return normalized === 'report_group' || normalized === 'both';
};

const getBotGroupChatId = (bot: TelegramBotSetting) =>
  (bot.default_group_chat_id || bot.default_chat_id || '').trim();

const getBotPurposeLabel = (bot: TelegramBotSetting) => {
  const normalized = normalizeBotPurpose(bot.bot_purpose);
  if (normalized === 'both') return 'Both: License Reminder + Report Group Notification';
  if (normalized === 'report_group') return 'Report Group Notification Bot';
  return 'License Reminder Bot';
};

const getBotConnectionStatus = (bot: TelegramBotSetting): 'connected' | 'not_verified' | 'error' | 'inactive' => {
  if (!bot.is_active) return 'inactive';
  const status = String(bot.connection_status || '').toLowerCase();
  if (status === 'connected' || bot.last_test_status === 'Success') return 'connected';
  if (status === 'error' || bot.last_test_status === 'Failed') return 'error';
  return 'not_verified';
};

const maskBotToken = (token?: string | null) => {
  if (!token) return 'Not Specified';
  if (isProtectedTokenPlaceholder(token)) return 'Protected';
  if (token.length <= 10) return 'Protected';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
};

const readResponseJsonSafely = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const sanitizeTelegramError = (message: string, token?: string | null) => {
  let safe = message || 'Telegram getMe failed.';
  if (token) safe = safe.replaceAll(token, '[REDACTED]');
  return safe.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]');
};

const fetchRealBotTokenForLocalTest = async (bot: TelegramBotSetting): Promise<string> => {
  if (bot.bot_token_encrypted && !isProtectedTokenPlaceholder(bot.bot_token_encrypted)) {
    return bot.bot_token_encrypted;
  }

  const client = getActiveSupabaseClient();
  if (!client) return '';
  if (!isSupabaseUuid(bot.id)) return '';

  const { data, error } = await client
    .from('telegram_bot_settings')
    .select('bot_token_encrypted')
    .eq('id', bot.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('Unable to read Telegram Bot token for local getMe test:', error.message);
    return '';
  }
  return String(data?.bot_token_encrypted || '').trim();
};

const buildReportGroupTestPayload = async (bot: TelegramBotSetting, customMessage: string) => {
  const token = await fetchRealBotTokenForLocalTest(bot);
  const payload: Record<string, string> = {
    botPurpose: 'report_group',
    chatId: getBotGroupChatId(bot),
    customMessage
  };

  if (isSupabaseUuid(bot.id)) {
    payload.botId = bot.id;
  }

  if (token && !isProtectedTokenPlaceholder(token)) {
    payload.botToken = token;
    payload.botUsername = bot.bot_username;
  }

  return payload;
};

let serverSecretLookupAvailableCache: boolean | null = null;

const canServerUseStoredBotSecrets = async () => {
  if (serverSecretLookupAvailableCache !== null) return serverSecretLookupAvailableCache;
  try {
    const response = await fetch('/api/health');
    const data = await readResponseJsonSafely(response);
    serverSecretLookupAvailableCache = response.ok && data?.supabase === 'connected';
  } catch {
    serverSecretLookupAvailableCache = false;
  }
  return serverSecretLookupAvailableCache;
};

const getBotConnectionLabel = (status: ReturnType<typeof getBotConnectionStatus>) => {
  if (status === 'connected') return 'Connected';
  if (status === 'error') return 'Error';
  if (status === 'inactive') return 'Inactive';
  return 'Not Verified';
};

const getWebhookStatusLabel = (bot: TelegramBotSetting, remoteStatus?: string) => {
  const normalizedRemote = String(remoteStatus || '').toLowerCase();
  if (normalizedRemote === 'active' || normalizedRemote === 'configured') return 'Configured';
  if (bot.webhook_status === 'configured' || bot.webhook_url) return 'Configured';
  return 'Not Configured';
};

interface EnterpriseLicensingRegistryProps {
  currentUser: MetrologyUser;
  usersList: MetrologyUser[];
  toastMsg: (msg: string, type: 'success' | 'error') => void;
}

export default function EnterpriseLicensingRegistry({
  currentUser,
  usersList,
  toastMsg
}: EnterpriseLicensingRegistryProps) {
  const isCompanyUser = currentUser?.role?.toLowerCase() === 'company';

  // Database States
  const [licenses, setLicenses] = useState<EnterpriseLicense[]>([]);
  const [reminderLogs, setReminderLogs] = useState<LicenseReminderLog[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<LicenseRenewalHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTelegram, setFilterTelegram] = useState<string>('all');

  // Form States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLicense, setEditingLicense] = useState<EnterpriseLicense | null>(null);
  const [showRenewModal, setShowRenewModal] = useState<EnterpriseLicense | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState<EnterpriseLicense | null>(null);

  // Add/Edit License form fields
  const [companyUserId, setCompanyUserId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseOwnerName, setLicenseOwnerName] = useState('');
  const [licenseOwnerPosition, setLicenseOwnerPosition] = useState('នាយកប្រតិបត្តិ (CEO)');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [businessType, setBusinessType] = useState('សហគ្រាសឯកបុគ្គល (Sole Proprietorship)');
  const [serviceScope, setServiceScope] = useState('');
  const [measuringInstrumentType, setMeasuringInstrumentType] = useState('');
  const [licenseIssueDate, setLicenseIssueDate] = useState('');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');
  const [customExpiry, setCustomExpiry] = useState(false);
  const [notes, setNotes] = useState('');

  // Government-style license details states
  const [companyNameKh, setCompanyNameKh] = useState('');
  const [provinceCity, setProvinceCity] = useState('');
  const [districtKhan, setDistrictKhan] = useState('');
  const [communeSangkat, setCommuneSangkat] = useState('');
  const [village, setVillage] = useState('');
  const [licenseOwnerNationalId, setLicenseOwnerNationalId] = useState('');
  const [licenseOwnerPhone, setLicenseOwnerPhone] = useState('');
  const [licenseOwnerEmail, setLicenseOwnerEmail] = useState('');
  const [serviceFeeCurrency, setServiceFeeCurrency] = useState('USD');
  const [paymentStatus, setPaymentStatus] = useState('Pending');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [activeFormStep, setActiveFormStep] = useState(1);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showClearFormModal, setShowClearFormModal] = useState(false);

  // New Legal Representative and Business location states
  const [representativeDateOfBirth, setRepresentativeDateOfBirth] = useState('');
  const [representativeGender, setRepresentativeGender] = useState('');
  const [representativeNationality, setRepresentativeNationality] = useState('Cambodian / ខ្មែរ');
  const [businessLatitude, setBusinessLatitude] = useState<number | null>(null);
  const [businessLongitude, setBusinessLongitude] = useState<number | null>(null);
  const [businessLocationSource, setBusinessLocationSource] = useState<string>('');
  const [businessGeoAddress, setBusinessGeoAddress] = useState<string | null>(null);
  const [locationUpdatedAt, setLocationUpdatedAt] = useState<string | null>(null);
  const [isLocationLocked, setIsLocationLocked] = useState(false);

  // 1. Photo and Service Fee and Attached Document and Credentials State
  const [serviceFee, setServiceFee] = useState('');
  const [photoBase64, setPhotoBase64] = useState('');
  const [attachedDocBase64, setAttachedDocBase64] = useState('');
  const [attachedDocName, setAttachedDocName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Enhanced Owner Photo & Reference Documents States
  const [licenseOwnerPhotoUrl, setLicenseOwnerPhotoUrl] = useState('');
  const [licenseOwnerPhotoPath, setLicenseOwnerPhotoPath] = useState('');
  const [ownerPhotoFile, setOwnerPhotoFile] = useState<File | null>(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  // Image Cropper states
  const [showCropModal, setShowCropModal] = useState(false);
  const [tempPhotoSrc, setTempPhotoSrc] = useState('');
  const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState('');
  const [imgNaturalWidth, setImgNaturalWidth] = useState(0);
  const [imgNaturalHeight, setImgNaturalHeight] = useState(0);
  const cropViewportRef = useRef<HTMLDivElement | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropRotation, setCropRotation] = useState(0);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStartCrop, setDragStartCrop] = useState({ x: 0, y: 0 });
  const [cropImageError, setCropImageError] = useState(false);
  const [originalFileName, setOriginalFileName] = useState('');
  const [originalFileType, setOriginalFileType] = useState('image/jpeg');

  const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  const createInitialFormAttachments = () => [
    { id: 'initial-1', document_type: "ពាក្យស្នើសុំអាជ្ញាប័ណ្ណ", document_number: "", document_date: "", file: null, file_name: "", file_type: "", file_size: 0, file_url: "", file_path: "", isUploaded: false },
    { id: 'initial-2', document_type: "វិញ្ញាបនបត្រចុះបញ្ជីក្រុមហ៊ុន", document_number: "", document_date: "", file: null, file_name: "", file_type: "", file_size: 0, file_url: "", file_path: "", isUploaded: false },
    { id: 'initial-3', document_type: "អត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែនម្ចាស់សហគ្រាស", document_number: "", document_date: "", file: null, file_name: "", file_type: "", file_size: 0, file_url: "", file_path: "", isUploaded: false },
    { id: 'initial-4', document_type: "ឯកសារបញ្ជាក់ទីតាំងអាជីវកម្ម", document_number: "", document_date: "", file: null, file_name: "", file_type: "", file_size: 0, file_url: "", file_path: "", isUploaded: false },
    { id: 'initial-5', document_type: "បង្កាន់ដៃបង់ប្រាក់ / វិក្កយបត្រ", document_number: "", document_date: "", file: null, file_name: "", file_type: "", file_size: 0, file_url: "", file_path: "", isUploaded: false }
  ];

  const [formAttachments, setFormAttachments] = useState<Array<{
    id: string;
    document_type: string;
    document_number: string;
    document_date: string;
    file: File | null;
    file_name: string;
    file_type: string;
    file_size: number;
    file_url: string;
    file_path: string;
    isUploading?: boolean;
    uploadError?: string;
    isUploaded?: boolean;
    isDeleted?: boolean;
  }>>(() => createInitialFormAttachments());

  // Renewal form fields
  const [renewalIssueDate, setRenewalIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [renewalExpiryDate, setRenewalExpiryDate] = useState('');
  const [renewalNotes, setRenewalNotes] = useState('');

  // Telegram deep-link registration tokens
  const [generatedTokens, setGeneratedTokens] = useState<Record<string, { token: string; expiresAt: string }>>(() => {
    const rawSaved = localStorage.getItem('nmc_raw_tokens');
    return rawSaved ? JSON.parse(rawSaved) : {};
  });

  // Save to localStorage whenever updated
  useEffect(() => {
    localStorage.setItem('nmc_raw_tokens', JSON.stringify(generatedTokens));
  }, [generatedTokens]);

  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const handleCopyBotLink = (link: string, licId: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLinkId(licId);
      toastMsg('ចម្លងតំណភ្ជាប់បានជោគជ័យ / Copied Telegram Link to clipboard!', 'success');
      setTimeout(() => setCopiedLinkId(null), 3000);
    }).catch(err => {
      console.error('Could not copy link:', err);
      toastMsg('Failed to copy link', 'error');
    });
  };

  // Database table existence states for graceful fallback
  const [tableStatus, setTableStatus] = useState<{
    enterprise_licenses: boolean;
    telegram_bot_settings: boolean;
    license_reminder_logs: boolean;
    license_renewal_history: boolean;
    allExist: boolean;
  }>({
    enterprise_licenses: true,
    telegram_bot_settings: true,
    license_reminder_logs: true,
    license_renewal_history: true,
    allExist: true
  });
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Active view tab (licenses, logs, configurations)
  const [activeSubTab, setActiveSubTab] = useState<'registry' | 'logs' | 'renewal-history' | 'bot-settings' | 'map'>('registry');

  // Bot settings state
  const [botSettings, setBotSettings] = useState<TelegramBotSetting[]>([]);
  const activeReminderBot = botSettings.find(b =>
    botSupportsPurpose(b, 'license_reminder') &&
    hasUsableBotIdentity(b, isCompanyUser)
  );
  const [showBotModal, setShowBotModal] = useState(false);
  const [editingBot, setEditingBot] = useState<TelegramBotSetting | null>(null);
  
  // Telegram connection guidance modal state
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [connectionLic, setConnectionLic] = useState<EnterpriseLicense | null>(null);
  const [isWaitingConnection, setIsWaitingConnection] = useState(false);
  
  // Protection logic: Force close any modal or view if a company user accesses a license they do not own
  useEffect(() => {
    if (currentUser && isCompanyUser) {
      if (showCertificateModal && !isLicenseOwnedByCurrentCompany(showCertificateModal, currentUser)) {
        setShowCertificateModal(null);
        toastMsg('លោកអ្នកមិនមានសិទ្ធិមើលព័ត៌មានអាជ្ញាប័ណ្ណនេះទេ។ / You do not have permission to view this license information.', 'error');
      }
      if (showRenewModal && !isLicenseOwnedByCurrentCompany(showRenewModal, currentUser)) {
        setShowRenewModal(null);
        toastMsg('លោកអ្នកមិនមានសិទ្ធិមើលព័ត៌មានអាជ្ញាប័ណ្ណនេះទេ។ / You do not have permission to view this license information.', 'error');
      }
      if (connectionLic && !isLicenseOwnedByCurrentCompany(connectionLic, currentUser)) {
        setConnectionLic(null);
        setConnectionModalOpen(false);
        toastMsg('លោកអ្នកមិនមានសិទ្ធិមើលព័ត៌មានអាជ្ញាប័ណ្ណនេះទេ។ / You do not have permission to view this license information.', 'error');
      }
    }
  }, [showCertificateModal, showRenewModal, connectionLic, currentUser, isCompanyUser]);
  
  // Bot form state
  const [botName, setBotName] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [botToken, setBotToken] = useState('');
  const [botPurpose, setBotPurpose] = useState<'report_group' | 'license_reminder' | 'both'>('license_reminder');
  const [botDescription, setBotDescription] = useState('');
  const [defaultChatId, setDefaultChatId] = useState('');
  const [isBotActive, setIsBotActive] = useState(true);

  // Load datasets initially and whenever tab swaps
  useEffect(() => {
    loadRegistryData();
  }, [usersList]);

  useEffect(() => {
    if (isCompanyUser && activeSubTab !== 'registry') {
      setActiveSubTab('registry');
    }
  }, [activeSubTab, isCompanyUser]);

  // Set default credentials from license number
  useEffect(() => {
    if (licenseNumber && !username) {
      setUsername(licenseNumber.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
    if (licenseNumber && !password) {
      setPassword(licenseNumber);
    }
  }, [licenseNumber, username, password]);

  const loadRegistryData = async () => {
    setIsLoading(true);
    try {
      // Gracefully probe table presence in Supabase first
      let dbStatus = {
        enterprise_licenses: true,
        telegram_bot_settings: true,
        license_reminder_logs: true,
        license_renewal_history: true,
        allExist: true
      };
      
      try {
        dbStatus = await checkIfLicensingTablesExist();
      } catch (err) {
        console.warn('Proactive database status checking failed:', err);
        dbStatus.allExist = false;
      }
      
      setTableStatus(dbStatus);
      const someTablesMissing = !dbStatus.allExist;
      setIsDemoMode(someTablesMissing);

      const [lics, logs, history, bots] = await Promise.all([
        fetchLicensesFromSupabase(currentUser),
        isCompanyUser ? Promise.resolve([]) : fetchReminderLogsFromSupabase(undefined, currentUser),
        isCompanyUser ? Promise.resolve([]) : fetchRenewalHistoryFromSupabase(undefined, currentUser),
        isCompanyUser ? fetchActiveReminderBotPublic().then(bot => bot ? [bot] : []) : fetchBotSettingsFromSupabase()
      ]);
      
      // Dynamic date status auto-repair check
      const todayString = new Date().toISOString().split('T')[0];
      const today = new Date(todayString);
      
      const resolvedLics = lics.map(l => {
        const expiry = new Date(l.license_expiry_date);
        const diffMs = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        let resolvedStatus: typeof l.license_status = l.license_status;
        
        if (l.license_status !== 'Suspended' && l.license_status !== 'Cancelled') {
          if (diffDays < 0) {
            resolvedStatus = 'Expired';
          } else if (diffDays <= 60) {
            resolvedStatus = 'Expiring Soon';
          } else {
            resolvedStatus = 'Active';
          }
        }
        
        if (resolvedStatus !== l.license_status) {
          // Send background status auto-repair update only if database is connected
          const updated = { ...l, license_status: resolvedStatus };
          if (!someTablesMissing) {
            saveLicenseToSupabase(updated).catch(err => console.warn('Background status syncing bypassed:', err));
          }
          return updated;
        }
        
        return l;
      });
      
      setLicenses(resolvedLics);
      setReminderLogs(logs);
      setRenewalHistory(history);
      setBotSettings(bots);
    } catch (e) {
      console.warn('Graceful database recovery initialized inside registry UI:', e);
      // Suppress annoying toast errors during preview or if running under local storage
      if (!isDemoMode) {
        toastMsg('មិនអាចទាញយកទិន្នន័យអាជ្ញាប័ណ្ណបានឡើយ / Failed to load licensing data.', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Pre-calculate 3-year expiry date naturally when issue date is tweaked
  useEffect(() => {
    if (licenseIssueDate && !customExpiry) {
      const d = new Date(licenseIssueDate);
      d.setFullYear(d.getFullYear() + 3);
      // adjust day minus 1 for standard licensing intervals
      d.setDate(d.getDate() - 1);
      setLicenseExpiryDate(d.toISOString().split('T')[0]);
    }
  }, [licenseIssueDate, customExpiry]);

  // Pre-calculate 3-year renewal expiry date naturally
  useEffect(() => {
    if (renewalIssueDate) {
      const d = new Date(renewalIssueDate);
      d.setFullYear(d.getFullYear() + 3);
      d.setDate(d.getDate() - 1);
      setRenewalExpiryDate(d.toISOString().split('T')[0]);
    }
  }, [renewalIssueDate]);

  // Link company user selection to pre-fill known values
  const handleCompanyUserChange = (uId: string) => {
    setCompanyUserId(uId);
    if (!uId) return;
    
    const matchedUser = usersList.find(u => u.id === uId);
    if (matchedUser) {
      setCompanyName(matchedUser.company_name_kh || matchedUser.company_name_en);
      setLicenseNumber(matchedUser.license_number || '');
      setPhoneNumber(matchedUser.phone || '');
      setEmail(matchedUser.email || '');
      setCompanyAddress(matchedUser.address || '');
      setLicenseOwnerName(matchedUser.legal_representative || '');
      setLicenseOwnerPosition(matchedUser.representative_position || 'CEO');
      setUsername(matchedUser.username || '');
      setPassword(matchedUser.password || '');
    }
  };

  // Base64 file loaders
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toastMsg('ទម្រង់រូបភាពមិនត្រឹមត្រូវ។ សូមប្រើប្រាស់ប្រភេទ JPG, JPEG, PNG, ឬ WebP។ / Invalid image format. Please use JPG, JPEG, PNG, or WebP.', 'error');
        return;
      }

      if (file.size > 2 * 1024 * 1024) { // limit to 2MB as requested
        toastMsg('រូបថតដើមត្រូវតែតូចជាង 2MB / Original photo must be smaller than 2MB.', 'error');
        return;
      }

      setOriginalFileName(file.name);
      setOriginalFileType(file.type);

      // Clean up previous blob URL if any
      if (selectedPhotoPreviewUrl && selectedPhotoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(selectedPhotoPreviewUrl);
      }

      const previewUrl = URL.createObjectURL(file);
      setSelectedPhotoPreviewUrl(previewUrl);
      setTempPhotoSrc(previewUrl);
      setCropScale(1);
      setCropRotation(0);
      setCropPosition({ x: 0, y: 0 });
      setCropImageError(false);
      setShowCropModal(true);

      e.target.value = ''; // Reset
    }
  };

  const handleRemovePhoto = () => {
    setPhotoBase64('');
    setOwnerPhotoFile(null);
    setLicenseOwnerPhotoUrl('');
    setLicenseOwnerPhotoPath('');
    setPhotoLoadError(false);
    setCropImageError(false);
    if (selectedPhotoPreviewUrl && selectedPhotoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(selectedPhotoPreviewUrl);
    }
    setSelectedPhotoPreviewUrl('');
    setTempPhotoSrc('');
  };

  const handleCropMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingCrop(true);
    setDragStartCrop({
      x: e.clientX - cropPosition.x,
      y: e.clientY - cropPosition.y
    });
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCrop) return;
    setCropPosition({
      x: e.clientX - dragStartCrop.x,
      y: e.clientY - dragStartCrop.y
    });
  };

  const handleCropMouseUpOrLeave = () => {
    setIsDraggingCrop(false);
  };

  const handleCropTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDraggingCrop(true);
      setDragStartCrop({
        x: e.touches[0].clientX - cropPosition.x,
        y: e.touches[0].clientY - cropPosition.y
      });
    }
  };

  const handleCropTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingCrop || e.touches.length !== 1) return;
    setCropPosition({
      x: e.touches[0].clientX - dragStartCrop.x,
      y: e.touches[0].clientY - dragStartCrop.y
    });
  };

  const handleApplyCrop = () => {
    if (!selectedPhotoPreviewUrl) {
      toastMsg('សូមជ្រើសរើសរូបថតជាមុនសិន / Please select a photo first.', 'error');
      return;
    }

    const imgElement = new Image();
    imgElement.onload = () => {
      const canvas = document.createElement('canvas');
      // Set to high resolution square style (600x600 px) for portrait/avatar format
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Fill canvas background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Translate to canvas center to scale and rotate about the center
      ctx.translate(canvas.width / 2, canvas.height / 2);

      // Apply rotation & zoom/scale
      if (cropRotation) {
        ctx.rotate((cropRotation * Math.PI) / 180);
      }
      ctx.scale(cropScale, cropScale);
      ctx.translate(cropPosition.x, cropPosition.y);

      // Emulate object-fit: cover inside a 1:1 square canvas
      const naturalW = imgElement.naturalWidth;
      const naturalH = imgElement.naturalHeight;
      const imageRatio = naturalW / naturalH;
      let renderWidth = 0;
      let renderHeight = 0;

      if (imageRatio > 1) {
        // Landscape: fit height, scale width
        renderHeight = 600;
        renderWidth = 600 * imageRatio;
      } else {
        // Portrait or Square: fit width, scale height
        renderWidth = 600;
        renderHeight = 600 / imageRatio;
      }

      ctx.drawImage(imgElement, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);

      // Convert cropped canvas output to compact JPEG representation
      const croppedBase64 = canvas.toDataURL(originalFileType || 'image/jpeg', 0.85);

      try {
        const croppedFile = dataURLtoFile(croppedBase64, originalFileName || 'owner_photo.jpg');
        setPhotoBase64(croppedBase64);
        setOwnerPhotoFile(croppedFile);
        setShowCropModal(false);
        toastMsg('✓ បានកាត់តម្រឹមរូបថតជោគជ័យ / Portrait Photo cropped successfully!', 'success');
      } catch (err: any) {
        console.error('Error generating cropped file:', err);
        toastMsg(`មិនអាចកាត់តម្រឹមរូបថតបានឡើយ៖ ${err.message}`, 'error');
      }
    };
    imgElement.onerror = () => {
      toastMsg('មិនអាចដំណើរការរូបភាពបានឡើយ / Failed to process image.', 'error');
    };
    imgElement.src = selectedPhotoPreviewUrl;
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toastMsg('ឯកសារត្រូវតែតូចជាង 10MB / Attached document must be smaller than 10MB.', 'error');
        return;
      }
      setAttachedDocName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedDocBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddAttachmentRow = () => {
    setFormAttachments(prev => [
      ...prev,
      {
        id: 'new-' + crypto.randomUUID(),
        document_type: "ផ្សេងៗ",
        document_number: "",
        document_date: "",
        file: null,
        file_name: "",
        file_type: "",
        file_size: 0,
        file_url: "",
        file_path: "",
        isUploaded: false
      }
    ]);
  };

  const handleUpdateAttachmentRow = (id: string, field: string, value: any) => {
    setFormAttachments(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleAttachmentFileChange = (id: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toastMsg(`ឯកសារត្រូវតែតូចជាង 5MB / Document must be smaller than 5MB.`, 'error');
      return;
    }
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.xls', '.xlsx'];
    const fileExt = ('.' + file.name.split('.').pop()).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      toastMsg(`ប្រភេទឯកសារមិនត្រូវបានអនុញ្ញាតទេ / File format not supported.`, 'error');
      return;
    }

    setFormAttachments(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          file: file,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          isUploaded: false
        };
      }
      return item;
    }));
  };

  const handleRemoveAttachmentRow = (id: string) => {
    setFormAttachments(prev => prev.map(item => {
      if (item.id === id) {
        if (item.isUploaded) {
          return { ...item, isDeleted: true };
        } else {
          return null;
        }
      }
      return item;
    }).filter(Boolean) as any);
  };

  const handleClearAttachmentFile = (id: string) => {
    setFormAttachments(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          file: null,
          file_name: "",
          file_type: "",
          file_size: 0,
          file_url: "",
          file_path: "",
          isUploaded: false,
          isDeleted: item.isUploaded ? true : false
        };
      }
      return item;
    }));
  };

  // Add or Update License submission
  const handleSaveLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Missing required field validation
    if (!companyName || !licenseNumber || !licenseIssueDate || !licenseExpiryDate) {
      setShowValidationErrors(true);
      toastMsg('សូមបំពេញព័ត៌មានដែលមានសញ្ញា * ជាមុនសិន។ / Please complete all required fields marked with *.', 'error');
      const pane = document.getElementById('modal-scroll-pane');
      if (pane) {
        pane.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // 2. Duplicate license number validation
    const belongsToSelf = editingLicense?.id;
    const isDuplicate = licenses.some(lic => 
      lic.license_number.trim().toLowerCase() === licenseNumber.trim().toLowerCase() && 
      lic.id !== (belongsToSelf || '')
    );
    if (isDuplicate) {
      setShowValidationErrors(true);
      toastMsg('លេខអាជ្ញាប័ណ្ណនេះមានរួចហើយ។ / This license number already exists.', 'error');
      const pane = document.getElementById('modal-scroll-pane');
      if (pane) {
        pane.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // 3. Expiry date after issue date validation
    if (new Date(licenseExpiryDate) <= new Date(licenseIssueDate)) {
      setShowValidationErrors(true);
      toastMsg('កាលបរិច្ឆេទផុតកំណត់ត្រូវតែក្រោយកាលបរិច្ឆេទចេញអាជ្ញាប័ណ្ណ។ / The expiry date must be after the issue date.', 'error');
      const pane = document.getElementById('modal-scroll-pane');
      if (pane) {
        pane.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    setShowValidationErrors(false);

    // 4. Custom validation for Legal Representative Date of Birth, Gender, and Nationality
    if (representativeDateOfBirth) {
      const dobDate = new Date(representativeDateOfBirth);
      const todayDate = new Date();
      if (isNaN(dobDate.getTime())) {
        setShowValidationErrors(true);
        toastMsg('ថ្ងៃខែឆ្នាំកំណើតរបស់តំណាងមិនត្រឹមត្រូវ។ / Legal representative Date of Birth is invalid.', 'error');
        const pane = document.getElementById('modal-scroll-pane');
        if (pane) {
          pane.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
      if (dobDate > todayDate) {
        setShowValidationErrors(true);
        toastMsg('ថ្ងៃខែឆ្នាំកំណើតមិនអាចស្ថិតក្នុងអនាគតបានទេ។ / Legal representative Date of Birth cannot be in the future.', 'error');
        const pane = document.getElementById('modal-scroll-pane');
        if (pane) {
          pane.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
    }

    if (representativeGender) {
      const validGenders = ['Male', 'Female', 'Other', 'ប្រុស', 'ស្រី', 'ផ្សេងទៀត'];
      if (!validGenders.includes(representativeGender)) {
        setShowValidationErrors(true);
        toastMsg('ភេទអ្នកតំណាងមិនត្រឹមត្រូវ។ / Representative gender is invalid.', 'error');
        const pane = document.getElementById('modal-scroll-pane');
        if (pane) {
          pane.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
    }

    setIsLoading(true);

    const todayString = new Date().toISOString().split('T')[0];
    const today = new Date(todayString);
    const expiry = new Date(licenseExpiryDate);
    const diffMs = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let computedStatus: EnterpriseLicense['license_status'] = 'Active';
    if (diffDays < 0) {
      computedStatus = 'Expired';
    } else if (diffDays <= 60) {
      computedStatus = 'Expiring Soon';
    }

    const targetCompanyUserId = companyUserId || crypto.randomUUID();

    // 1. Sync User account so they can log in immediately
    if (username && password) {
      const userPayload: MetrologyUser = {
        id: targetCompanyUserId,
        license_number: licenseNumber.trim(),
        company_name_kh: companyName.trim(),
        company_name_en: companyName.trim(),
        address: companyAddress.trim() || 'Cambodia',
        phone: phoneNumber.trim() || 'N/A',
        email: email.trim() || 'N/A',
        legal_representative: licenseOwnerName.trim() || 'Representative',
        representative_position: licenseOwnerPosition.trim() || 'Director',
        username: username.trim(),
        password: password.trim(),
        role: 'company',
        can_view: true,
        can_edit: true,
        can_save: true,
        can_delete: true,
        created_at: editingLicense?.created_at || new Date().toISOString()
      };

      try {
        await saveUserToSupabase(userPayload);
        const currentUsersStr = localStorage.getItem('nmc_users');
        let currentUsers: MetrologyUser[] = [];
        if (currentUsersStr) {
          try { currentUsers = JSON.parse(currentUsersStr); } catch (e) {}
        }
        const existingIdx = currentUsers.findIndex(u => u.username === userPayload.username || u.license_number === userPayload.license_number);
        if (existingIdx !== -1) {
          currentUsers[existingIdx] = { ...currentUsers[existingIdx], ...userPayload };
        } else {
          currentUsers.push(userPayload);
        }
        localStorage.setItem('nmc_users', JSON.stringify(currentUsers));
      } catch (err) {
        console.warn('Syncing user account during license creation had background error:', err);
      }
    }

    const licenseId = editingLicense ? editingLicense.id : crypto.randomUUID();

    // Keep existing metadata or set new fallbacks
    let finalPhotoUrl = licenseOwnerPhotoUrl || null;
    let finalPhotoPath = licenseOwnerPhotoPath || null;
    let finalPhotoFileName = editingLicense?.license_owner_photo_file_name || null;
    let finalPhotoUploadedAt = editingLicense?.license_owner_photo_uploaded_at || null;

    const payload: EnterpriseLicense = {
      id: licenseId,
      company_user_id: targetCompanyUserId,
      company_id: targetCompanyUserId,
      company_name: companyName.trim(),
      license_number: licenseNumber.trim(),
      license_owner_name: licenseOwnerName.trim() || null,
      license_owner_position: licenseOwnerPosition.trim() || null,
      phone_number: phoneNumber.trim() || null,
      email: email.trim() || null,
      
      // Government-style license details fields
      company_name_kh: companyNameKh.trim() || null,
      province_city: provinceCity.trim() || null,
      district_khan: districtKhan.trim() || null,
      commune_sangkat: communeSangkat.trim() || null,
      village: village.trim() || null,
      license_owner_national_id: licenseOwnerNationalId.trim() || null,
      license_owner_phone: licenseOwnerPhone.trim() || null,
      license_owner_email: licenseOwnerEmail.trim() || null,
      service_fee_currency: serviceFeeCurrency || 'USD',
      payment_status: paymentStatus || 'Pending',
      payment_reference: paymentReference.trim() || null,
      payment_date: paymentDate || null,
      payment_notes: paymentNotes.trim() || null,

      // Photos and fees
      service_fee: serviceFee ? Number(serviceFee) : null,
      photo_base64: photoBase64 || null,
      license_owner_photo_url: finalPhotoUrl,
      license_owner_photo_path: finalPhotoPath,
      license_owner_photo_file_name: finalPhotoFileName,
      license_owner_photo_uploaded_at: finalPhotoUploadedAt,
      attached_doc_base64: attachedDocBase64 || null,
      attached_doc_name: attachedDocName || null,
      username: username.trim() || null,
      password: password.trim() || null,

      representative_date_of_birth: representativeDateOfBirth || null,
      representative_gender: representativeGender || null,
      representative_nationality: representativeNationality?.trim() || null,
      business_latitude: businessLatitude !== null ? Number(businessLatitude) : null,
      business_longitude: businessLongitude !== null ? Number(businessLongitude) : null,
      business_location_source: businessLocationSource || null,
      business_geo_address: businessGeoAddress || null,
      location_updated_at: locationUpdatedAt || null,

      // Keep existing Telegram details if we are editing
      telegram_chat_id: editingLicense ? editingLicense.telegram_chat_id : null,
      telegram_username: editingLicense ? editingLicense.telegram_username : null,
      telegram_first_name: editingLicense ? editingLicense.telegram_first_name : null,
      telegram_last_name: editingLicense ? editingLicense.telegram_last_name : null,
      telegram_connected_at: editingLicense ? editingLicense.telegram_connected_at : null,
      telegram_connection_status: editingLicense ? editingLicense.telegram_connection_status : 'Not Connected',
      telegram_registration_token_hash: editingLicense ? editingLicense.telegram_registration_token_hash : null,
      telegram_registration_token_expires_at: editingLicense ? editingLicense.telegram_registration_token_expires_at : null,

      company_address: companyAddress.trim() || null,
      business_type: businessType.trim() || null,
      service_scope: serviceScope.trim() || null,
      measuring_instrument_type: measuringInstrumentType.trim() || null,
      license_issue_date: licenseIssueDate,
      license_expiry_date: licenseExpiryDate,
      license_validity_years: 3,
      license_status: editingLicense ? (editingLicense.license_status === 'Suspended' || editingLicense.license_status === 'Cancelled' ? editingLicense.license_status : computedStatus) : computedStatus,
      
      last_90_day_reminder_sent_at: editingLicense ? editingLicense.last_90_day_reminder_sent_at : null,
      last_60_day_reminder_sent_at: editingLicense ? editingLicense.last_60_day_reminder_sent_at : null,
      last_30_day_reminder_sent_at: editingLicense ? editingLicense.last_30_day_reminder_sent_at : null,
      last_15_day_reminder_sent_at: editingLicense ? editingLicense.last_15_day_reminder_sent_at : null,
      last_7_day_reminder_sent_at: editingLicense ? editingLicense.last_7_day_reminder_sent_at : null,
      expired_reminder_sent_at: editingLicense ? editingLicense.expired_reminder_sent_at : null,

      notes: notes.trim() || null,
      created_by: editingLicense ? editingLicense.created_by : currentUser.id,
      updated_by: currentUser.id,
      created_at: editingLicense ? editingLicense.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let mainLicenseSaved = false;
    let photoFailed = false;
    let attachmentsFailed = false;
    let failedAttachmentNames: string[] = [];

    try {
      // Save Main License to database FIRST to verify column safety
      await saveLicenseToSupabase(payload);
      mainLicenseSaved = true;
    } catch (saveError: any) {
      console.error("Main license database save failed:", saveError);
      setIsLoading(false);
      
      const errStr = String(saveError?.message || saveError?.details || saveError || '').toLowerCase();
      if (
        errStr.includes('representative_date_of_birth') ||
        errStr.includes('representative_gender') ||
        errStr.includes('representative_nationality') ||
        errStr.includes('schema cache') ||
        errStr.includes('column')
      ) {
        toastMsg('Database column សម្រាប់ព័ត៌មានអ្នកតំណាងស្របច្បាប់មិនទាន់បានបង្កើតទេ។ សូមដំណើរការ SQL migration ជាមុនសិន។ / Database columns for legal representative information have not been created yet. Please run the SQL migration first.', 'error');
      } else {
        toastMsg('រក្សាទុកព័ត៌មានអាជ្ញាប័ណ្ណមិនបានទេ។ សូមពិនិត្យទិន្នន័យ និងព្យាយាមម្តងទៀត។ / Failed to save license information. Please check the data and try again.', 'error');
      }
      return; // HALT THE FLOW
    }

    if (mainLicenseSaved) {
      // 1. Upload owner photo to storage if changed
      if (ownerPhotoFile) {
        try {
          const fileExt = ownerPhotoFile.name.split('.').pop();
          const filePath = `${licenseId}/owner_photo_${Date.now()}.${fileExt}`;
          const uploadResult = await uploadFileToSupabase('license-owner-photos', filePath, ownerPhotoFile);
          
          finalPhotoUrl = uploadResult.url;
          finalPhotoPath = uploadResult.path;
          finalPhotoFileName = ownerPhotoFile.name;
          finalPhotoUploadedAt = new Date().toISOString();

          // Bind back photo parameters to Enterprise License row
          const updatedPayload: EnterpriseLicense = {
            ...payload,
            license_owner_photo_url: finalPhotoUrl,
            license_owner_photo_path: finalPhotoPath,
            license_owner_photo_file_name: finalPhotoFileName,
            license_owner_photo_uploaded_at: finalPhotoUploadedAt
          };

          await saveLicenseToSupabase(updatedPayload);
          setLicenseOwnerPhotoUrl(finalPhotoUrl || '');
          setLicenseOwnerPhotoPath(finalPhotoPath || '');
          setOwnerPhotoFile(null); // Clear file context since it was safely saved!
        } catch (photoError: any) {
          console.error("Owner photo upload failed:", photoError);
          photoFailed = true;
          toastMsg(`មិនអាច Upload រូបថតបានទេ។ / Unable to upload photo. Reason: ${photoError.message}`, 'error');
        }
      }

      // 2. Attachments Syncing
      // First, delete removed attachments from database
      const deletedAttachments = formAttachments.filter(a => a.isDeleted && a.isUploaded);
      for (const del of deletedAttachments) {
        try {
          await deleteAttachmentFromSupabase(del.id);
        } catch (delError) {
          console.warn('Failed to delete attachment metadata:', delError);
        }
      }

      // Upload and bind active attachments
      const activeFormAttachments = formAttachments.filter(a => !a.isDeleted);
      const attachmentsAfterUpload = [...formAttachments];

      for (let i = 0; i < activeFormAttachments.length; i++) {
        const att = activeFormAttachments[i];
        
        if (att.file && !att.isUploaded) {
          try {
            const fileExt = att.file.name.split('.').pop();
            const filePath = `${licenseId}/${crypto.randomUUID()}_${att.file.name}`;
            const uploadResult = await uploadFileToSupabase('enterprise-license-attachments', filePath, att.file);
            
            const attachmentPayload: EnterpriseLicenseAttachment = {
              id: att.id.startsWith('initial-') ? crypto.randomUUID() : att.id,
              license_id: licenseId,
              document_type: att.document_type || null,
              document_number: att.document_number || null,
              document_date: att.document_date || null,
              file_name: att.file.name,
              file_type: att.file.type,
              file_size: att.file.size,
              file_url: uploadResult.url,
              file_path: uploadResult.path,
              attachment_category: 'Reference Document',
              uploaded_by: currentUser.id,
              uploaded_at: new Date().toISOString(),
              notes: null
            };

            await saveAttachmentToSupabase(attachmentPayload);

            // Mark this attachment item as fully uploaded in our temporary React state
            const stateIdx = attachmentsAfterUpload.findIndex(item => item.id === att.id);
            if (stateIdx !== -1) {
              attachmentsAfterUpload[stateIdx] = {
                ...attachmentsAfterUpload[stateIdx],
                id: attachmentPayload.id,
                isUploaded: true,
                file: null, // Wipe file so it is not double-uploaded
                file_name: attachmentPayload.file_name,
                file_type: attachmentPayload.file_type || '',
                file_size: Number(attachmentPayload.file_size || 0),
                file_url: attachmentPayload.file_url || '',
                file_path: attachmentPayload.file_path || ''
              };
            }
          } catch (uploadError: any) {
            console.error(`Attachment upload/save failed for ${att.document_type}:`, uploadError);
            attachmentsFailed = true;
            failedAttachmentNames.push(att.document_type || att.file_name || 'Document');
            
            const errStr = String(uploadError?.message || uploadError?.details || uploadError || '').toLowerCase();
            if (errStr.includes('schema cache') || errStr.includes('column') || errStr.includes('document_date')) {
              toastMsg(`Database column សម្រាប់ឯកសារភ្ជាប់មិនទាន់បានបង្កើតទេ។ សូមដំណើរការ SQL migration ជាមុនសិន។ / Database columns for attachments have not been created yet. Please run the SQL migration first.`, 'error');
            } else {
              toastMsg(`មិនអាចដំឡើងឯកសារ ${att.document_type}៖ ${uploadError.message} / Failed to upload document ${att.document_type}: ${uploadError.message}`, 'error');
            }
          }
        } else if (att.isUploaded) {
          // If metadata changed on an already uploaded document
          try {
            const attachmentPayload: EnterpriseLicenseAttachment = {
              id: att.id,
              license_id: licenseId,
              document_type: att.document_type || null,
              document_number: att.document_number || null,
              document_date: att.document_date || null,
              file_name: att.file_name,
              file_type: att.file_type || '',
              file_size: Number(att.file_size || 0),
              file_url: att.file_url,
              file_path: att.file_path,
              attachment_category: 'Reference Document',
              uploaded_by: currentUser.id,
              uploaded_at: new Date().toISOString(),
              notes: null
            };

            await saveAttachmentToSupabase(attachmentPayload);
          } catch (updateError: any) {
            console.warn('Failed to update attachment metadata:', updateError);
            attachmentsFailed = true;
            failedAttachmentNames.push(att.document_type || att.file_name || 'Document');
            
            const errStr = String(updateError?.message || updateError?.details || updateError || '').toLowerCase();
            if (errStr.includes('schema cache') || errStr.includes('column') || errStr.includes('document_date')) {
              toastMsg(`Database column សម្រាប់ឯកសារភ្ជាប់មិនទាន់បានបង្កើតទេ។ សូមដំណើរការ SQL migration ជាមុនសិន។ / Database columns for attachments have not been created yet. Please run the SQL migration first.`, 'error');
            }
          }
        }
      }

      // Update the active state so the files aren't dropped visually if we enter a partial failure state
      setFormAttachments(attachmentsAfterUpload);

      // Audit Logging
      await logAuditEvent(
        currentUser,
        editingLicense ? 'LICENSE_UPDATED' : 'LICENSE_CREATED',
        `License: ${payload.license_number} for ${payload.company_name} (Fee: ${payload.service_fee || 'N/A'} USD)`,
        payload.company_user_id || undefined,
        payload.telegram_username || undefined
      );

      setIsLoading(false);

      if (photoFailed || attachmentsFailed) {
        // Clear warning for partial failure
        toastMsg(
          'អាជ្ញាប័ណ្ណត្រូវបានរក្សាទុក ប៉ុន្តែមានឯកសារ ឬរូបថតមួយចំនួន Upload មិនបាន។ សូមព្យាយាម Upload ម្តងទៀត។ / License was saved, but some photos or documents failed to upload. Please try uploading them again.',
          'error'
        );
      } else {
        // Completed success
        toastMsg(
          'អាជ្ញាប័ណ្ណត្រូវបានរក្សាទុកដោយជោគជ័យ។ / License saved successfully.',
          'success'
        );
        resetForm();
        loadRegistryData();
      }
    }
  };

  // Submit license extension
  const handleRenewLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRenewModal || !renewalIssueDate || !renewalExpiryDate || !renewalNotes) {
      toastMsg('សូមបំពេញរយៈពេលបន្តសុពលភាពឲ្យបានពេញលេញ / Please complete renewal terms.', 'error');
      return;
    }

    try {
      const updatedLicense: EnterpriseLicense = {
        ...showRenewModal,
        license_issue_date: renewalIssueDate,
        license_expiry_date: renewalExpiryDate,
        license_status: 'Active', // force active
        // clear old reminders
        last_90_day_reminder_sent_at: null,
        last_60_day_reminder_sent_at: null,
        last_30_day_reminder_sent_at: null,
        last_15_day_reminder_sent_at: null,
        last_7_day_reminder_sent_at: null,
        expired_reminder_sent_at: null,
        updated_at: new Date().toISOString(),
        updated_by: currentUser.id
      };

      const renewalRecord: LicenseRenewalHistory = {
        id: crypto.randomUUID(),
        license_id: showRenewModal.id,
        old_issue_date: showRenewModal.license_issue_date,
        old_expiry_date: showRenewModal.license_expiry_date,
        new_issue_date: renewalIssueDate,
        new_expiry_date: renewalExpiryDate,
        renewed_by: currentUser.legal_representative || currentUser.username,
        renewed_by_role: currentUser.role,
        renewed_at: new Date().toISOString(),
        notes: renewalNotes.trim()
      };

      await Promise.all([
        saveLicenseToSupabase(updatedLicense),
        saveRenewalHistoryToSupabase(renewalRecord)
      ]);

      // Audit Log
      await logAuditEvent(
        currentUser,
        'LICENSE_RENEWED',
        `Renewed License: ${updatedLicense.license_number} until ${renewalExpiryDate}`,
        updatedLicense.company_user_id || undefined,
        updatedLicense.telegram_username || undefined
      );

      toastMsg('បានបន្តសុពលភាពអាជ្ញាប័ណ្ណជោគជ័យ / License renewed successfully for 3 years.', 'success');
      setShowRenewModal(null);
      setRenewalNotes('');
      loadRegistryData();
    } catch (err: any) {
      console.error(err);
      toastMsg('បរាជ័យក្នុងការបន្តសុពលភាព / Renewal process failed.', 'error');
    }
  };

  const handleDeleteLicense = async (licId: string, licNum: string) => {
    if (!safeConfirm(`តើលោកអ្នកពិតជាចង់លុបអាជ្ញាប័ណ្ណលេខ [${licNum}] នេះចេញពីប្រព័ន្ធមែនទេ? / Are you sure you want to delete this license?`)) {
      return;
    }

    try {
      await deleteLicenseFromSupabase(licId);
      
      // Audit Log
      await logAuditEvent(
        currentUser,
        'LICENSE_DELETED',
        `Deleted license: ${licNum} (id: ${licId})`
      );

      toastMsg('បានលុបអាជ្ញាប័ណ្ណចេញពីប្រព័ន្ធជោគជ័យ / Deleted license successfully.', 'success');
      loadRegistryData();
    } catch (e: any) {
      console.error(e);
      toastMsg('បរាជ័យក្នុងការលុបអាជ្ញាប័ណ្ណ / Could not remove license.', 'error');
    }
  };

  // Generate deep-link registration tokens and hash
  const handleGenerateBotLink = async (licId: string) => {
    const found = licenses.find(l => l.id === licId);
    if (!found) return;
    if (!isCompanyUser || !isLicenseOwnedByCurrentCompany(found, currentUser)) {
      toastMsg('ម្ចាស់សហគ្រាសត្រូវភ្ជាប់ Telegram ដោយខ្លួនឯង។ / Only the logged-in company user can connect Telegram for this license.', 'error');
      return;
    }

    const activeBot = activeReminderBot;
    if (!activeBot) {
      toastMsg('សូមកំណត់ License Reminder Bot សកម្ម ឬ Bot ដែលមាន Purpose Both ជាមុនសិន។ / Please configure an active License Reminder Bot or a bot with purpose Both.', 'error');
      return;
    }

    const rawToken = 'NMC_REG_' + Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    // Hash the token using Web Crypto API
    const msgBuffer = new TextEncoder().encode(rawToken);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    setGeneratedTokens(prev => ({
      ...prev,
      [licId]: { token: rawToken, expiresAt }
    }));

    const updated: EnterpriseLicense = {
      ...found,
      telegram_connection_status: 'Not Connected', 
      telegram_registration_token_hash: hashHex,
      telegram_registration_token_expires_at: expiresAt,
      telegram_bot_setting_id: activeBot.id,
      updated_at: new Date().toISOString()
    };

    try {
      await saveLicenseToSupabase(updated);
      toastMsg('បង្កើតតំណភ្ជាប់តេឡេក្រាមដោយជោគជ័យ / Created Telegram Connection Link.', 'success');
      setLicenses(prev => prev.map(l => l.id === licId ? updated : l));
    } catch (err) {
      console.error(err);
      toastMsg('Failed to create Telegram connection link.', 'error');
    }
  };

  // Dispatch a manual test reminder notification to a specific license holder
  const handleSendLicenseTestReminder = async (lic: EnterpriseLicense) => {
    if (!lic.telegram_chat_id) {
      toastMsg('សហគ្រាសនេះមិនទាន់ភ្ជាប់តេឡេក្រាមនៅឡើយទេ / This enterprise is not yet connected to Telegram.', 'error');
      return;
    }
    
    const activeBot = activeReminderBot;
    if (!activeBot) {
      toastMsg('សូមកំណត់ License Reminder Bot សកម្ម ឬ Bot ដែលមាន Purpose Both ជាមុនសិន។ / Please configure an active License Reminder Bot or a bot with purpose Both.', 'error');
      return;
    }
    
    toastMsg('កំពុងផ្ញើសារសាកល្បងទៅកាន់សហគ្រាស... / Dispatching test notification...', 'success');
    try {
      const response = await fetch('/api/test-telegram-reminder', {
        method: 'POST',
        headers: await getApiAuthHeaders(),
        body: JSON.stringify({
          licenseId: lic.id,
          chatId: lic.telegram_chat_id,
          botPurpose: 'license_reminder',
          customMessage: `🧪 <b>ការសាកល្បងសាររំលឹក / License Reminder Test Alert</b>\n\nសហគ្រាស៖ <b>${lic.company_name}</b> (License: ${lic.license_number})\n\nការភ្ជាប់ជាមួយប្រព័ន្ធជូនដំណឹងរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិគឺមានសុពលភាពនិងដំណើរការល្អ។\nYour connection to the National Metrology Center reminder system is active and working perfectly.`
        })
      });
      
      if (response.ok) {
        toastMsg('ផ្ញើសារសាកល្បងដោយជោគជ័យ! / Test notification dispatched successfully!', 'success');
        // Reload all data so logs and status update immediately
        loadRegistryData();
        // If the details modal is open on this license, refresh our modal local state context if needed
        if (showCertificateModal && showCertificateModal.id === lic.id) {
          const freshLicObj = await fetchLicensesFromSupabase();
          const targetFresh = freshLicObj.find(l => l.id === lic.id);
          if (targetFresh) {
            setShowCertificateModal(targetFresh);
          }
        }
      } else {
        const errData = await readResponseJsonSafely(response);
        toastMsg(`ផ្ញើសារសាកល្បងបរាជ័យ៖ ${errData?.message || errData?.error || 'Server error'}`, 'error');
      }
    } catch (err: any) {
      console.error(err);
      toastMsg(`បរាជ័យក្នុងការផ្ញើសារសាកល្បង៖ ${err.message || 'Network error'}`, 'error');
    }
  };

  // SIMULATOR WEBHOOK TRIGGER: Lets companies test bot start code instantly!
  const handleSimulateBotStartCommand = async (licId: string, customChatId = '') => {
    const found = licenses.find(l => l.id === licId);
    if (!found) return;
    if (!isCompanyUser || !isLicenseOwnedByCurrentCompany(found, currentUser)) {
      toastMsg('ម្ចាស់សហគ្រាសត្រូវភ្ជាប់ Telegram ដោយខ្លួនឯង។ / Only the logged-in company user can connect Telegram for this license.', 'error');
      return;
    }

    const activeToken = generatedTokens[licId]?.token || found.telegram_registration_token_hash;
    
    if (!activeToken) {
      toastMsg('សូមបង្កើតតំណភ្ជាប់ Bot Link ជាមុនសិន / Please generate Bot Link first.', 'error');
      return;
    }

    const testChatId = customChatId || String(Math.floor(100000000 + Math.random() * 900000000));
    const testUsername = found.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_admin';
    
    const updatedLicense: EnterpriseLicense = {
      ...found,
      telegram_chat_id: testChatId,
      telegram_username: testUsername,
      telegram_first_name: 'Simulated',
      telegram_last_name: 'Officer',
      telegram_connected_at: new Date().toISOString(),
      telegram_connection_status: 'Connected',
      telegram_registration_token_hash: null,
      telegram_registration_token_expires_at: null,
      updated_at: new Date().toISOString()
    };

    const reminderLog: LicenseReminderLog = {
      id: crypto.randomUUID(),
      license_id: found.id,
      reminder_type: 'TEST',
      reminder_days: 0,
      telegram_chat_id: testChatId,
      telegram_username: testUsername,
      message_text: `🎉 ការតភ្ជាប់ប្រព័ន្ធតេឡេក្រាមបានជោគជ័យ! សហគ្រាស៖ "${found.company_name}" នឹងទទួលសាររំលឹកកាលបរិច្ឆេទផុតកំណត់នៅរយៈពេល 60 ថ្ងៃ, 30 ថ្ងៃ, និង 7 ថ្ងៃមុន។`,
      send_status: 'Sent',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    try {
      await Promise.all([
        saveLicenseToSupabase(updatedLicense),
        saveReminderLogToSupabase(reminderLog)
      ]);

      toastMsg('🤖 [Simulator] Telegram Bot Webhook Triggered! Account linked successfully.', 'success');
      loadRegistryData();
    } catch (e) {
      console.error(e);
      toastMsg('Simulator failure connecting bot.', 'error');
    }
  };

  const handleDisconnectTelegram = async (licId: string) => {
    const found = licenses.find(l => l.id === licId);
    if (!found) return;
    if (!isCompanyUser || !isLicenseOwnedByCurrentCompany(found, currentUser)) {
      toastMsg('លោកអ្នកមិនមានសិទ្ធិផ្តាច់ការភ្ជាប់ Telegram នេះទេ។ / You do not have permission to disconnect this Telegram account.', 'error');
      return;
    }
    if (!safeConfirm('តើលោកអ្នកពិតជាចង់ផ្តាច់ការភ្ជាប់ Telegram មែនទេ? / Are you sure you want to disconnect Telegram?')) {
      return;
    }

    const updatedLicense: EnterpriseLicense = {
      ...found,
      telegram_chat_id: null,
      telegram_username: null,
      telegram_first_name: null,
      telegram_last_name: null,
      telegram_connected_at: null,
      telegram_connection_status: 'Disconnected',
      updated_at: new Date().toISOString()
    };

    try {
      await saveLicenseToSupabase(updatedLicense);
      toastMsg('បានផ្តាច់ការតភ្ជាប់តេឡេក្រាម / Disconnected Telegram integration.', 'success');
      loadRegistryData();
    } catch (e) {
      console.error(e);
    }
  };

  // Evaluate precise Telegram connection state
  const getTelegramStatus = (lic: EnterpriseLicense) => {
    if (lic.telegram_connection_status === 'Connected' || lic.telegram_chat_id) {
      return 'Connected';
    }
    
    if (lic.telegram_registration_token_hash && lic.telegram_registration_token_expires_at) {
      const expiresAt = new Date(lic.telegram_registration_token_expires_at);
      if (expiresAt < new Date()) {
        return 'Expired';
      }
      return 'Waiting';
    }
    
    return 'NotConnected';
  };

  // Launch guided connection wizard (modal overlay)
  const handleStartConnectionWizard = async (lic: EnterpriseLicense) => {
    if (!isCompanyUser || !isLicenseOwnedByCurrentCompany(lic, currentUser)) {
      toastMsg('ម្ចាស់ក្រុមហ៊ុន ឬសហគ្រាស ត្រូវភ្ជាប់ Telegram ដោយខ្លួនឯង។ / The enterprise owner must connect Telegram personally.', 'error');
      return;
    }

    if (!activeReminderBot) {
      toastMsg('សូមកំណត់ License Reminder Bot សកម្ម ឬ Bot ដែលមាន Purpose Both ជាមុនសិន។ / Please configure an active License Reminder Bot or a bot with purpose Both.', 'error');
      return;
    }

    let currentToken = generatedTokens[lic.id];
    let isExpiredEx = false;
    if (currentToken) {
      if (new Date(currentToken.expiresAt) < new Date()) {
        isExpiredEx = true;
      }
    }

    if (!currentToken || isExpiredEx || !lic.telegram_registration_token_hash) {
      await handleGenerateBotLink(lic.id);
    }

    const latestFresh = licenses.find(l => l.id === lic.id);
    setConnectionLic(latestFresh || lic);
    setIsWaitingConnection(false);
    setConnectionModalOpen(true);
  };

  // Open bot settings configuration dialog
  const handleOpenBotModal = (bot: TelegramBotSetting | null) => {
    setEditingBot(bot);
    if (bot) {
      setBotName(bot.bot_name);
      setBotUsername(bot.bot_username);
      // NEVER show the full real Telegram Bot token in cleartext
      setBotToken('PROTECTED_UNCHANGED');
      setBotPurpose(normalizeBotPurpose(bot.bot_purpose) as 'report_group' | 'license_reminder' | 'both');
      setDefaultChatId(bot.default_group_chat_id || bot.default_chat_id || '');
      setBotDescription(bot.description || '');
      setIsBotActive(bot.is_active);
    } else {
      setBotName('');
      setBotUsername('');
      setBotToken('');
      setBotPurpose('license_reminder');
      setDefaultChatId('');
      setBotDescription('');
      setIsBotActive(true);
    }
    setShowBotModal(true);
  };

  // Create or Update Registered Telegram Bot
  const handleSaveBotSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    const tokenInput = botToken.trim();
    const shouldKeepExistingToken = !!editingBot && (!tokenInput || isProtectedTokenPlaceholder(tokenInput));
    if (!botName || !botUsername || (!tokenInput && !editingBot)) {
      toastMsg('សូមបំពេញព័ត៌មានដែលចាំបាច់ / Please fill in all required fields.', 'error');
      return;
    }
    if ((botPurpose === 'report_group' || botPurpose === 'both') && !defaultChatId.trim()) {
      toastMsg('សូមបញ្ចូល Default Group Chat ID សម្រាប់ Report Group Notification។ / Default Group Chat ID is required for Report Group notifications.', 'error');
      return;
    }
    
    setIsLoading(true);
    try {
      const id = editingBot ? editingBot.id : 'bot-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      
      let finalToken = tokenInput;
      if (shouldKeepExistingToken && editingBot) {
        finalToken = editingBot.bot_token_encrypted;
      }
      const normalizedUsername = botUsername.replace(/^@/, '').trim();
      const tokenChanged = !editingBot || !shouldKeepExistingToken;
      const usernameChanged = !editingBot || normalizedUsername !== editingBot.bot_username;
      const shouldResetVerification = tokenChanged || usernameChanged || isBotActive !== editingBot?.is_active;

      const newBot: TelegramBotSetting = {
        id,
        bot_name: botName,
        bot_username: normalizedUsername,
        bot_token_encrypted: finalToken,
        bot_purpose: botPurpose,
        default_chat_id: defaultChatId || null,
        default_group_chat_id: defaultChatId || null,
        is_active: isBotActive,
        description: botDescription || null,
        connection_status: shouldResetVerification ? 'not_verified' : (editingBot?.connection_status || 'not_verified'),
        last_test_status: shouldResetVerification ? null : (editingBot?.last_test_status || null),
        last_test_message: shouldResetVerification ? null : (editingBot?.last_test_message || null),
        last_error: shouldResetVerification ? null : (editingBot?.last_error || null),
        last_tested_at: shouldResetVerification ? null : (editingBot?.last_tested_at || null),
        webhook_status: editingBot?.webhook_status || (editingBot?.webhook_url ? 'configured' : 'not_configured'),
        webhook_url: editingBot?.webhook_url || null,
        bot_display_name: shouldResetVerification ? null : (editingBot?.bot_display_name || null),
        created_at: editingBot?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      await saveBotSettingToSupabase(newBot);
      
      await logAuditEvent(
        currentUser,
        'LICENSE_UPDATED',
        `Registered/updated Telegram Bot: ${botName} (@${newBot.bot_username})`
      );
      
      toastMsg('រក្សាទុកកំណត់ពត៌មានលោកអ្នករួចរាល់ / Saved Telegram Bot successfully.', 'success');
      setShowBotModal(false);
      loadRegistryData();
    } catch (err) {
      console.error(err);
      toastMsg('បរាជ័យក្នុងការរក្សាទុក / Failed to save Telegram Bot setting.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Remove Bot Config completely from database
  const handleDeleteBotSetting = async (id: string) => {
    if (!safeConfirm('តើអ្នកពិតជាចង់លុបប៊ូតនេះមែនទេ? / Are you sure you want to delete this bot setting?')) {
      return;
    }
    setIsLoading(true);
    try {
      await deleteBotSettingFromSupabase(id);
      await logAuditEvent(currentUser, 'LICENSE_UPDATED', `Deleted Telegram Bot config ID: ${id}`);
      toastMsg('បានលុបប៊ូតជោគជ័យ / Bot setting deleted successfully.', 'success');
      loadRegistryData();
    } catch (err) {
      console.error(err);
      toastMsg('មិនអាចលុបប៊ូតនេះបានទេ / Failed to delete bot setting.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Webhook statuses dictionary
  const [webhookStatuses, setWebhookStatuses] = useState<Record<string, { status: string; url?: string; last_error_message?: string; last_configured_date?: string }>>({});

  const fetchWebhookStatus = async (botId: string) => {
    if (!isSupabaseUuid(botId) && await canServerUseStoredBotSecrets()) {
      setWebhookStatuses(prev => ({
        ...prev,
        [botId]: {
          status: 'Not Configured',
          last_error_message: 'Invalid Telegram bot ID. Please refresh bot settings from Supabase.'
        }
      }));
      return;
    }
    try {
      const response = await fetch(`/api/get-telegram-webhook-status?botId=${botId}`, {
        headers: await getApiAuthHeaders(),
      });
      if (response.ok) {
        const data = await readResponseJsonSafely(response);
        setWebhookStatuses(prev => ({
          ...prev,
          [botId]: {
            status: data.status,
            url: data.url,
            last_error_message: data.last_error_message,
            last_configured_date: data.last_configured_date
          }
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch webhook status:', err);
    }
  };

  useEffect(() => {
    botSettings.forEach(bot => {
      if (!webhookStatuses[bot.id]) {
        fetchWebhookStatus(bot.id);
      }
    });
  }, [botSettings]);

  const handleConfigureWebhook = async (botId: string) => {
    if (!isSupabaseUuid(botId) && await canServerUseStoredBotSecrets()) {
      toastMsg('Invalid Telegram bot ID. Please refresh bot settings from Supabase.', 'error');
      loadRegistryData();
      return;
    }

    const domainInput = safePrompt(
      "សូមបញ្ចូល domain ឬ URL អាសយដ្ឋានសម្រាប់ webhook របស់លោកអ្នក / Please enter your domain or URL for the Telegram Webhook:\n\nលទ្ធផលលំនាំដើមផលិតកម្ម (Recommended Default):\nhttps://metrologyreport.vercel.app/api/telegram-webhook", 
      "https://metrologyreport.vercel.app/api/telegram-webhook"
    );
    
    if (domainInput === null) return; // user cancelled
    const trimmedUrl = domainInput.trim();
    if (!trimmedUrl) {
      toastMsg("មិនអាចបញ្ចូលទទេបានឡើយ / Webhook URL cannot be empty.", "error");
      return;
    }

    toastMsg("កំពុងកំណត់ប្រព័ន្ធ Webhook... / Setting webhook URL...", "success");
    try {
      const response = await fetch('/api/set-telegram-webhook', {
        method: 'POST',
        headers: await getApiAuthHeaders(),
        body: JSON.stringify({
          bot_id: botId,
          webhook_url: trimmedUrl
        })
      });

      const resData = await readResponseJsonSafely(response);
      if (!response.ok) {
        throw new Error(resData?.message || resData?.error || `Request failed: ${response.status}`);
      }
      if (response.ok && resData.status === 'success') {
        toastMsg("កំណត់ Webhook ជោគជ័យ! / Webhook configured successfully!", "success");
        fetchWebhookStatus(botId);
        loadRegistryData();
      } else {
        toastMsg(`កំណត់ Webhook បរាជ័យ៖ ${resData.error || 'Server error'}`, "error");
      }
    } catch (err: any) {
      console.error(err);
      toastMsg(`បរាជ័យក្នុងការកំណត់ Webhook៖ ${err.message || 'Network error'}`, "error");
    }
  };

  // Verify the Telegram Bot token with Telegram getMe.
  const handleTestBotConnection = async (bot: TelegramBotSetting) => {
    if (!bot.is_active || !String(bot.bot_username || '').trim()) {
      toastMsg('សូមកំណត់ Active Bot ដែលមាន Bot Username និង Bot Token ជាមុនសិន។ / Please configure an active bot with both Bot Username and Bot Token first.', 'error');
      return;
    }

    const updateConnectionState = async (updates: Partial<TelegramBotSetting>) => {
      const safeUpdates = {
        ...updates,
        updated_at: new Date().toISOString()
      };
      setBotSettings(prev => prev.map(item => item.id === bot.id ? { ...item, ...safeUpdates } : item));

      const client = getActiveSupabaseClient();
      if (!client) return;
      if (!isSupabaseUuid(bot.id)) return;
      try {
        await client
          .from('telegram_bot_settings')
          .update(safeUpdates)
          .eq('id', bot.id);
      } catch (err: any) {
        console.warn('Unable to save Telegram Bot connection metadata:', err?.message || err);
      }
    };

    if (botRequiresGroupChat(bot)) {
      if (!getBotGroupChatId(bot)) {
        toastMsg('Bot connected, but Default Group Chat ID is missing for group notifications.', 'error');
        return;
      }

      toastMsg('Sending Telegram group test message...', 'success');
      try {
        const payload = await buildReportGroupTestPayload(
          bot,
          `<b>NMC Report Group Notification Test</b>\n\nSystem linked successfully with bot @${bot.bot_username}.`
        );
        if (!payload.botId && await canServerUseStoredBotSecrets()) {
          throw new Error('Invalid Telegram bot ID. Please refresh bot settings from Supabase.');
        }
        if (!payload.botToken && isProtectedTokenPlaceholder(bot.bot_token_encrypted) && !(await canServerUseStoredBotSecrets())) {
          throw new Error('Bot token is protected in this local session. Please edit this bot, paste the Bot Token once, save it, then send the test group message again.');
        }
        const groupResponse = await fetch('/api/test-telegram-reminder', {
          method: 'POST',
          headers: await getApiAuthHeaders(),
          body: JSON.stringify(payload)
        });

        const groupData = await readResponseJsonSafely(groupResponse);
        if (!groupResponse.ok) {
          throw new Error(groupData?.message || groupData?.error || `Request failed: ${groupResponse.status}`);
        }

        await updateConnectionState({
          connection_status: 'connected',
          last_test_status: 'Success',
          last_test_message: 'Telegram group sendMessage verified successfully.',
          last_error: null,
          last_tested_at: new Date().toISOString()
        });
        toastMsg('បានផ្ញើសារសាកល្បងទៅក្រុម Telegram ដោយជោគជ័យ។ / Group notification test sent successfully.', 'success');
        loadRegistryData();
      } catch (err: any) {
        const safeMessage = sanitizeTelegramError(err?.message || String(err || 'Telegram group sendMessage failed.'));
        await updateConnectionState({
          connection_status: 'error',
          last_test_status: 'Failed',
          last_test_message: 'Telegram sendMessage failed.',
          last_error: safeMessage,
          last_tested_at: new Date().toISOString()
        });
        toastMsg(safeMessage, 'error');
      }
      return;
    }

    const testDirectlyWithTelegramGetMe = async () => {
      toastMsg('មិនមាន API endpoint សម្រាប់សាកល្បង Telegram Bot នៅ local development ទេ។ ប្រព័ន្ធនឹងសាកល្បងដោយផ្ទាល់តាម Telegram getMe។ / Local API endpoint for Telegram Bot test is unavailable. The system will test directly using Telegram getMe.', 'success');

      const token = await fetchRealBotTokenForLocalTest(bot);
      if (!token) {
        await updateConnectionState({
          connection_status: 'error',
          last_test_status: 'Failed',
          last_test_message: 'Bot token missing',
          last_error: 'Bot token missing',
          last_tested_at: new Date().toISOString()
        });
        throw new Error('Bot token missing');
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await readResponseJsonSafely(response);
      if (!response.ok || !data?.ok) {
        throw new Error(sanitizeTelegramError(data?.description || `Telegram getMe failed: ${response.status}`, token));
      }

      await updateConnectionState({
        connection_status: 'connected',
        last_test_status: 'Success',
        last_test_message: 'Telegram getMe verified successfully.',
        last_error: null,
        last_tested_at: new Date().toISOString(),
        bot_display_name: data.result?.first_name || data.result?.username || bot.bot_display_name || bot.bot_name || null
      });
    };
    
    toastMsg('កំពុងតេស្តការតភ្ជាប់ Telegram Bot... / Testing Telegram Bot connection...', 'success');
    try {
      if (!isSupabaseUuid(bot.id) && await canServerUseStoredBotSecrets()) {
        throw new Error('Invalid Telegram bot ID. Please refresh bot settings from Supabase.');
      }
      const response = await fetch('/api/test-telegram-bot-connection', {
        method: 'POST',
        headers: await getApiAuthHeaders(),
        body: JSON.stringify({ bot_id: bot.id })
      });

      const contentType = response.headers.get('content-type') || '';
      const resData = await readResponseJsonSafely(response);
      const endpointUnavailable = response.status === 404 || !contentType.toLowerCase().includes('application/json') || !resData;
      const missingServerEnv = response.status === 400 && /missing supabase server environment variables/i.test(String(resData?.message || resData?.error || ''));
      if (resData?.bot) {
        setBotSettings(prev => prev.map(item => item.id === bot.id ? { ...item, ...resData.bot } : item));
      }
      if (endpointUnavailable || missingServerEnv) {
        await testDirectlyWithTelegramGetMe();
        toastMsg('បានតភ្ជាប់ Telegram Bot ដោយជោគជ័យ។ / Telegram Bot connected successfully.', 'success');
        return;
      }
      if (!response.ok) {
        throw new Error(resData?.message || resData?.error || `Request failed: ${response.status}`);
      }
      
      if (response.ok) {
        toastMsg('បានតភ្ជាប់ Telegram Bot ដោយជោគជ័យ។ / Telegram Bot connected successfully.', 'success');
        if (botRequiresGroupChat(bot)) {
          if (!getBotGroupChatId(bot)) {
            toastMsg('Bot connected, but Default Group Chat ID is missing for group notifications.', 'error');
            return;
          }

          try {
            if (!isSupabaseUuid(bot.id) && await canServerUseStoredBotSecrets()) {
              throw new Error('Invalid Telegram bot ID. Please refresh bot settings from Supabase.');
            }
            const groupResponse = await fetch('/api/test-telegram-reminder', {
              method: 'POST',
              headers: await getApiAuthHeaders(),
              body: JSON.stringify({
                botId: bot.id,
                botPurpose: 'report_group',
                customMessage: `🧪 <b>សាកល្បងការតភ្ជាប់ / Connection Verification</b>\n\nប្រព័ន្ធបានភ្ជាប់ជាមួយប៊ូត [@${bot.bot_username}] ដោយជោគជ័យ!\nSystem linked successfully with bot [@${bot.bot_username}]!`
              })
            });

            const groupData = await readResponseJsonSafely(groupResponse);
            if (groupResponse.ok) {
              if (groupData?.bot) {
                setBotSettings(prev => prev.map(item => item.id === bot.id ? { ...item, ...groupData.bot } : item));
              } else {
                setBotSettings(prev => prev.map(item => item.id === bot.id ? {
                  ...item,
                  connection_status: 'connected',
                  last_test_status: 'Success',
                  last_test_message: 'Telegram group sendMessage verified successfully.',
                  last_error: null,
                  last_tested_at: new Date().toISOString()
                } : item));
              }
              toastMsg('បានផ្ញើសារសាកល្បងទៅក្រុម Telegram ដោយជោគជ័យ។ / Group notification test sent successfully.', 'success');
            } else {
              toastMsg(`Bot connected, but group notification failed: ${groupData?.message || groupData?.error || 'Send failed'}`, 'error');
            }
          } catch (groupErr: any) {
            console.error('Telegram group notification test failed:', groupErr?.message || groupErr);
            toastMsg(`Bot connected, but group notification failed: ${groupErr?.message || 'Network error'}`, 'error');
          }
        }
        loadRegistryData();
      } else {
        toastMsg('មិនអាចតភ្ជាប់ Telegram Bot បានទេ។ សូមពិនិត្យ Bot Token។ / Unable to connect Telegram Bot. Please check the Bot Token.', 'error');
      }
    } catch (err: any) {
      const safeMessage = sanitizeTelegramError(err?.message || String(err || 'Telegram Bot connection test failed.'));
      await updateConnectionState({
        connection_status: 'error',
        last_test_status: 'Failed',
        last_test_message: 'Telegram getMe failed.',
        last_error: safeMessage,
        last_tested_at: new Date().toISOString()
      });
      console.error('Telegram Bot connection test failed:', safeMessage);
      toastMsg('មិនអាចតភ្ជាប់ Telegram Bot បានទេ។ សូមពិនិត្យ Bot Token។ / Unable to connect Telegram Bot. Please check the Bot Token.', 'error');
    }
  };

  // Trigger simulated Daily Cron reminder tracker job manually with 60/30/7/Expired parameters
  const handleTriggerSimulatedReminderCron = async () => {
    toastMsg('🚀 កំពុងដំណើរការត្រួតពិនិត្យប្រព័ន្ធរំលឹក (Daily Reminder Check)...', 'success');
    
    const today = new Date();
    let sentCount = 0;
    const todayStr = today.toISOString().split('T')[0];

    const freshestLicenses = await fetchLicensesFromSupabase();
    const activeBot = activeReminderBot;
    if (activeBot && getBotConnectionStatus(activeBot) === 'error') {
      toastMsg('Active bot exists but connection has error.', 'error');
    }
    
    for (const lic of freshestLicenses) {
      if (!lic.telegram_chat_id || lic.telegram_connection_status !== 'Connected') {
        continue; // skip if no Telegram chat is connected!
      }

      const expiry = new Date(lic.license_expiry_date);
      const diffMs = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let shouldSend = false;
      let intervalKey: number = 0;
      let checkField: 'last_60_day_reminder_sent_at' | 'last_30_day_reminder_sent_at' | 'last_7_day_reminder_sent_at' | 'expired_reminder_sent_at' | 'created_at' = 'created_at';

      if (diffDays === 60) {
        intervalKey = 60;
        checkField = 'last_60_day_reminder_sent_at';
        if (!lic.last_60_day_reminder_sent_at || !lic.last_60_day_reminder_sent_at.startsWith(todayStr)) {
          shouldSend = true;
        }
      } else if (diffDays === 30) {
        intervalKey = 30;
        checkField = 'last_30_day_reminder_sent_at';
        if (!lic.last_30_day_reminder_sent_at || !lic.last_30_day_reminder_sent_at.startsWith(todayStr)) {
          shouldSend = true;
        }
      } else if (diffDays === 7) {
        intervalKey = 7;
        checkField = 'last_7_day_reminder_sent_at';
        if (!lic.last_7_day_reminder_sent_at || !lic.last_7_day_reminder_sent_at.startsWith(todayStr)) {
          shouldSend = true;
        }
      } else if (diffDays <= 0) {
        // Expired alert
        intervalKey = -1; // expired
        checkField = 'expired_reminder_sent_at';
        if (lic.license_status === 'Active' || lic.license_status === 'Expiring Soon') {
          if (!lic.expired_reminder_sent_at || !lic.expired_reminder_sent_at.startsWith(todayStr)) {
            shouldSend = true;
          }
        }
      }

      if (shouldSend) {
        let textMsg = '';
        if (intervalKey > 0) {
          textMsg = `🔔 <b>សេចក្តីជូនដំណឹងអំពីអាជ្ញាប័ណ្ណ (NMC License Expiring Soon)</b>\n\n` +
            `សូមជម្រាបជូន លោក/លោកស្រីតំណាងសហគ្រាស <b>${lic.company_name}</b>\n\n` +
            `អាជ្ញាប័ណ្ណអាជីវកម្ម មាត្រាសាស្ត្ររបស់លោកអ្នក (លេខ៖ <code>${lic.license_number}</code>) នឹងត្រូវពេលវេលាផុតកំណត់ក្នុងរយៈពេល <b>${intervalKey} ថ្ងៃ</b> ទៀតហើយ គឺស្របត្រូវនឹងថ្ងៃទី <b>${lic.license_expiry_date}</b>\n\n` +
            `សូមមេត្តារៀបចំឯកសារ ឬអញ្ជើញមកដោះស្រាយពាក្យស្នើសុំបន្តសុពលភាពនៅស្នាក់ការកណ្តាលមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC) ឲ្យបានមុនកាលផុតកំណត់។\n\n` +
            `សូមអរគុណ។\n<i>NMC Automated Notification Service</i>`;
        } else {
          textMsg = `🚨 <b>ប្រកាសអាជ្ញាប័ណ្ណហួសសុពលភាព (NMC License EXPIRED)</b>\n\n` +
            `សហគ្រាស៖ <b>${lic.company_name}</b>\n` +
            `លេខអាជ្ញាប័ណ្ណ៖ <code>${lic.license_number}</code>\n` +
            `កាលបរិច្ឆេទផុតកំណត់៖ <b>${lic.license_expiry_date}</b>\n\n` +
            `🚨 អាជ្ញាប័ណ្ណរបស់លោកអ្នកបានផុតកំណត់ហើយ! សូមអញ្ជើញមកបំពេញបែបបទបន្តជាប្រញាប់ដើម្បីជៀសវាងការផ្អាកអាជីវកម្ម ឬពិន័យផ្សេងៗតាមច្បាប់មាត្រាសាស្ត្រជាតិ។`;
        }

        const logId = crypto.randomUUID();
        let currentSendStatus: 'Sent' | 'Failed' = 'Sent';
        let currentErrorMessage: string | null = null;

        // Trigger real Telegram message through the backend so bot tokens never run in browser-side requests.
        if (activeBot && lic.telegram_chat_id) {
          try {
            const tgResponse = await fetch('/api/test-telegram-reminder', {
              method: 'POST',
              headers: await getApiAuthHeaders(),
              body: JSON.stringify({
                licenseId: lic.id,
                chatId: lic.telegram_chat_id.trim(),
                botId: activeBot.id,
                botUsername: activeBot.bot_username,
                botPurpose: 'license_reminder',
                customMessage: textMsg
              })
            });
            const tgData = await readResponseJsonSafely(tgResponse);
            if (!tgResponse.ok) {
              currentSendStatus = 'Failed';
              currentErrorMessage = tgData?.message || tgData?.error || 'API send error';
              console.warn('Simulated scheduler: Telegram message send failed:', currentErrorMessage);
            }
          } catch (err: any) {
            currentSendStatus = 'Failed';
            currentErrorMessage = err.message || 'Network error';
            console.error('Simulated scheduler: Network error sending Telegram:', err);
          }
        }

        const reminderLog: LicenseReminderLog = {
          id: logId,
          license_id: lic.id,
          reminder_type: intervalKey === 60 ? '60_DAYS_BEFORE_EXPIRY' : intervalKey === 30 ? '30_DAYS_BEFORE_EXPIRY' : intervalKey === 7 ? '7_DAYS_BEFORE_EXPIRY' : 'EXPIRED',
          reminder_days: intervalKey === -1 ? 0 : intervalKey,
          telegram_chat_id: lic.telegram_chat_id,
          telegram_username: lic.telegram_username,
          message_text: textMsg,
          send_status: currentSendStatus,
          error_message: currentErrorMessage,
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        const updatedLicense = {
          ...lic,
          license_status: intervalKey === -1 ? 'Expired' as const : lic.license_status,
          [checkField === 'created_at' ? 'updated_at' : checkField]: new Date().toISOString()
        };

        await Promise.all([
          saveLicenseToSupabase(updatedLicense),
          saveReminderLogToSupabase(reminderLog)
        ]);
        
        sentCount++;
      }
    }

    await loadRegistryData();
    toastMsg(`🔔 ម៉ាស៊ីនរំលឹកពិនិត្យរួចរាល់! បានផ្ញើសារសរុប៖ ${sentCount} គ្រឿង។ / Reminder run complete. Logs added.`, 'success');
  };

  const handleEditClick = (lic: EnterpriseLicense) => {
    setEditingLicense(lic);
    setCompanyUserId(lic.company_user_id || '');
    setCompanyName(lic.company_name);
    setLicenseNumber(lic.license_number);
    setLicenseOwnerName(lic.license_owner_name || '');
    setLicenseOwnerPosition(lic.license_owner_position || 'CEO');
    setPhoneNumber(lic.phone_number || '');
    setEmail(lic.email || '');
    setCompanyAddress(lic.company_address || '');
    setBusinessType(lic.business_type || 'សហគ្រាសឯកបុគ្គល (Sole Proprietorship)');
    setServiceScope(lic.service_scope || '');
    setMeasuringInstrumentType(lic.measuring_instrument_type || '');
    setLicenseIssueDate(lic.license_issue_date);
    setLicenseExpiryDate(lic.license_expiry_date);
    setCustomExpiry(true);
    setNotes(lic.notes || '');

    // Map new government-style fields
    setCompanyNameKh(lic.company_name_kh || '');
    setProvinceCity(lic.province_city || '');
    setDistrictKhan(lic.district_khan || '');
    setCommuneSangkat(lic.commune_sangkat || '');
    setVillage(lic.village || '');
    setLicenseOwnerNationalId(lic.license_owner_national_id || '');
    setLicenseOwnerPhone(lic.license_owner_phone || '');
    setLicenseOwnerEmail(lic.license_owner_email || '');
    setServiceFeeCurrency(lic.service_fee_currency || 'USD');
    setPaymentStatus(lic.payment_status || 'Pending');
    setPaymentReference(lic.payment_reference || '');
    setPaymentDate(lic.payment_date || '');
    setPaymentNotes(lic.payment_notes || '');

    // set photo & fee fields
    setServiceFee(lic.service_fee ? String(lic.service_fee) : '');
    setPhotoBase64(lic.photo_base64 || '');
    setAttachedDocBase64(lic.attached_doc_base64 || '');
    setAttachedDocName(lic.attached_doc_name || '');
    setUsername(lic.username || lic.license_number.toLowerCase().replace(/[^a-z0-9]/g, ''));
    setPassword(lic.password || lic.license_number);

    setLicenseOwnerPhotoUrl(lic.license_owner_photo_url || '');
    setLicenseOwnerPhotoPath(lic.license_owner_photo_path || '');
    setOwnerPhotoFile(null);
    setPhotoLoadError(false);

    // Fetch attachments for editing license
    fetchAttachmentsFromSupabase(lic.id).then((serverAttachments) => {
      if (serverAttachments && serverAttachments.length > 0) {
        // Sort attachments by display_order (asc) then uploaded_at (desc)
        const sortedAttachments = [...serverAttachments].sort((a, b) => {
          const orderA = (a as any).display_order ?? 999;
          const orderB = (b as any).display_order ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          const timeA = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
          const timeB = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
          return timeB - timeA;
        });

        setFormAttachments(sortedAttachments.map(a => ({
          id: a.id,
          document_type: a.document_type || '',
          document_number: a.document_number || '',
          document_date: a.document_date || '',
          file: null,
          file_name: a.file_name || '',
          file_type: a.file_type || '',
          file_size: Number(a.file_size || 0),
          file_url: a.file_url || '',
          file_path: a.file_path || '',
          isUploaded: true
        })));
      } else {
        setFormAttachments(createInitialFormAttachments());
      }
    }).catch(err => {
      console.warn("Failed to load attachments in edit mode:", err);
      setFormAttachments(createInitialFormAttachments());
    });

    setRepresentativeDateOfBirth(lic.representative_date_of_birth || '');
    setRepresentativeGender(lic.representative_gender || '');
    setRepresentativeNationality(lic.representative_nationality || 'Cambodian / ខ្មែរ');
    setBusinessLatitude(lic.business_latitude !== undefined && lic.business_latitude !== null ? Number(lic.business_latitude) : null);
    setBusinessLongitude(lic.business_longitude !== undefined && lic.business_longitude !== null ? Number(lic.business_longitude) : null);
    setBusinessLocationSource(lic.business_location_source || '');
    setBusinessGeoAddress(lic.business_geo_address || null);
    setLocationUpdatedAt(lic.location_updated_at || null);
    
    // Lock location on edit if coordinates exist
    const hasCoordinates = lic.business_latitude !== undefined && lic.business_latitude !== null &&
                           lic.business_longitude !== undefined && lic.business_longitude !== null;
    setIsLocationLocked(hasCoordinates);

    setShowAddModal(true);
  };

  const isFormDirty = () => {
    const hasPhotoUploaded = ownerPhotoFile !== null;
    const hasFileUploaded = formAttachments.some(att => att.file !== null || att.isDeleted);

    if (!editingLicense) {
      return !!(
        companyUserId ||
        companyName || 
        licenseNumber || 
        licenseOwnerName || 
        phoneNumber || 
        email || 
        companyAddress || 
        serviceScope || 
        measuringInstrumentType || 
        companyNameKh || 
        provinceCity || 
        districtKhan || 
        communeSangkat || 
        village || 
        licenseOwnerNationalId || 
        licenseOwnerPhone || 
        licenseOwnerEmail || 
        serviceFee || 
        photoBase64 || 
        attachedDocBase64 || 
        username || 
        password ||
        representativeDateOfBirth ||
        representativeGender ||
        representativeNationality !== 'Cambodian / ខ្មែរ' ||
        businessLatitude !== null ||
        businessLongitude !== null ||
        businessLocationSource ||
        hasPhotoUploaded ||
        hasFileUploaded
      );
    } else {
      return (
        companyUserId !== (editingLicense.company_user_id || '') ||
        companyName !== editingLicense.company_name ||
        licenseNumber !== editingLicense.license_number ||
        licenseOwnerName !== (editingLicense.license_owner_name || '') ||
        licenseOwnerPosition !== (editingLicense.license_owner_position || 'CEO') ||
        phoneNumber !== (editingLicense.phone_number || '') ||
        email !== (editingLicense.email || '') ||
        companyAddress !== (editingLicense.company_address || '') ||
        businessType !== (editingLicense.business_type || 'សហគ្រាសឯកបុគ្គល (Sole Proprietorship)') ||
        serviceScope !== (editingLicense.service_scope || '') ||
        measuringInstrumentType !== (editingLicense.measuring_instrument_type || '') ||
        licenseIssueDate !== editingLicense.license_issue_date ||
        licenseExpiryDate !== editingLicense.license_expiry_date ||
        notes !== (editingLicense.notes || '') ||
        companyNameKh !== (editingLicense.company_name_kh || '') ||
        provinceCity !== (editingLicense.province_city || '') ||
        districtKhan !== (editingLicense.district_khan || '') ||
        communeSangkat !== (editingLicense.commune_sangkat || '') ||
        village !== (editingLicense.village || '') ||
        licenseOwnerNationalId !== (editingLicense.license_owner_national_id || '') ||
        licenseOwnerPhone !== (editingLicense.license_owner_phone || '') ||
        licenseOwnerEmail !== (editingLicense.license_owner_email || '') ||
        serviceFeeCurrency !== (editingLicense.service_fee_currency || 'USD') ||
        paymentStatus !== (editingLicense.payment_status || 'Pending') ||
        paymentReference !== (editingLicense.payment_reference || '') ||
        paymentDate !== (editingLicense.payment_date || '') ||
        paymentNotes !== (editingLicense.payment_notes || '') ||
        serviceFee !== (editingLicense.service_fee ? String(editingLicense.service_fee) : '') ||
        photoBase64 !== (editingLicense.photo_base64 || '') ||
        attachedDocBase64 !== (editingLicense.attached_doc_base64 || '') ||
        username !== (editingLicense.username || '') ||
        password !== (editingLicense.password || '') ||
        representativeDateOfBirth !== (editingLicense.representative_date_of_birth || '') ||
        representativeGender !== (editingLicense.representative_gender || '') ||
        representativeNationality !== (editingLicense.representative_nationality || 'Cambodian / ខ្មែរ') ||
        businessLatitude !== (editingLicense.business_latitude !== undefined && editingLicense.business_latitude !== null ? Number(editingLicense.business_latitude) : null) ||
        businessLongitude !== (editingLicense.business_longitude !== undefined && editingLicense.business_longitude !== null ? Number(editingLicense.business_longitude) : null) ||
        businessLocationSource !== (editingLicense.business_location_source || '') ||
        hasPhotoUploaded ||
        hasFileUploaded
      );
    }
  };

  const handleBackClick = () => {
    if (isFormDirty()) {
      setShowUnsavedConfirm(true);
    } else {
      resetForm();
    }
  };

  const resetForm = () => {
    setEditingLicense(null);
    setCompanyUserId('');
    setCompanyName('');
    setLicenseNumber('');
    setLicenseOwnerName('');
    setLicenseOwnerPosition('CEO');
    setPhoneNumber('');
    setEmail('');
    setCompanyAddress('');
    setBusinessType('សហគ្រាសឯកបុគ្គល (Sole Proprietorship)');
    setServiceScope('');
    setMeasuringInstrumentType('');
    setLicenseIssueDate('');
    setLicenseExpiryDate('');
    setCustomExpiry(false);
    setNotes('');

    // Reset new government-style fields
    setCompanyNameKh('');
    setProvinceCity('');
    setDistrictKhan('');
    setCommuneSangkat('');
    setVillage('');
    setLicenseOwnerNationalId('');
    setLicenseOwnerPhone('');
    setLicenseOwnerEmail('');
    setServiceFeeCurrency('USD');
    setPaymentStatus('Pending');
    setPaymentReference('');
    setPaymentDate('');
    setPaymentNotes('');

    setServiceFee('');
    setPhotoBase64('');
    setAttachedDocBase64('');
    setAttachedDocName('');
    setUsername('');
    setPassword('');

    setLicenseOwnerPhotoUrl('');
    setLicenseOwnerPhotoPath('');
    setOwnerPhotoFile(null);
    setPhotoLoadError(false);
    setFormAttachments(createInitialFormAttachments());

    setRepresentativeDateOfBirth('');
    setRepresentativeGender('');
    setRepresentativeNationality('Cambodian / ខ្មែរ');
    setBusinessLatitude(null);
    setBusinessLongitude(null);
    setBusinessLocationSource('');
    setBusinessGeoAddress(null);
    setLocationUpdatedAt(null);
    setIsLocationLocked(false);

    setShowValidationErrors(false);
    setActiveFormStep(1);

    setShowAddModal(false);
  };

  const clearAllFormInputs = () => {
    setEditingLicense(null);
    setCompanyUserId('');
    setCompanyName('');
    setLicenseNumber('');
    setLicenseOwnerName('');
    setLicenseOwnerPosition('CEO');
    setPhoneNumber('');
    setEmail('');
    setCompanyAddress('');
    setBusinessType('សហគ្រាសឯកបុគ្គល (Sole Proprietorship)');
    setServiceScope('');
    setMeasuringInstrumentType('');
    setLicenseIssueDate('');
    setLicenseExpiryDate('');
    setCustomExpiry(false);
    setNotes('');

    setCompanyNameKh('');
    setProvinceCity('');
    setDistrictKhan('');
    setCommuneSangkat('');
    setVillage('');
    setLicenseOwnerNationalId('');
    setLicenseOwnerPhone('');
    setLicenseOwnerEmail('');
    setServiceFeeCurrency('USD');
    setPaymentStatus('Pending');
    setPaymentReference('');
    setPaymentDate('');
    setPaymentNotes('');

    setServiceFee('');
    setPhotoBase64('');
    setAttachedDocBase64('');
    setAttachedDocName('');
    setUsername('');
    setPassword('');

    setLicenseOwnerPhotoUrl('');
    setLicenseOwnerPhotoPath('');
    setOwnerPhotoFile(null);
    setPhotoLoadError(false);
    setFormAttachments(createInitialFormAttachments());

    setRepresentativeDateOfBirth('');
    setRepresentativeGender('');
    setRepresentativeNationality('Cambodian / ខ្មែរ');
    setBusinessLatitude(null);
    setBusinessLongitude(null);
    setBusinessLocationSource('');
    setBusinessGeoAddress(null);
    setLocationUpdatedAt(null);
    setIsLocationLocked(false);

    setShowValidationErrors(false);
    setActiveFormStep(1);
  };

  // Export PDF template
  const handleDownloadPDF = (lic: EnterpriseLicense) => {
    try {
      if (isCompanyUser && !isLicenseOwnedByCurrentCompany(lic, currentUser)) {
        toastMsg('លោកអ្នកមិនមានសិទ្ធិទាញយកអាជ្ញាប័ណ្ណនេះទេ។ / You do not have permission to download this license.', 'error');
        return;
      }

      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      // Gold frameborder
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(1.5);
      doc.rect(8, 8, 194, 281);
      
      doc.setDrawColor(27, 38, 59);
      doc.setLineWidth(0.5);
      doc.rect(10, 10, 190, 277);

      // Header English equivalents
      doc.setTextColor(27, 38, 59);
      doc.setFont('Helvetica', 'Bold');
      doc.setFontSize(14);
      doc.text('KINGDOM OF CAMBODIA', 105, 22, { align: 'center' });
      doc.setFontSize(11);
      doc.text('NATION RELIGION KING', 105, 28, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text('MINISTRY OF INDUSTRY, SCIENCE, TECHNOLOGY & INNOVATION', 105, 38, { align: 'center' });
      doc.setFontSize(11);
      doc.text('NATIONAL METROLOGY CENTER (NMC)', 105, 44, { align: 'center' });
      
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.8);
      doc.line(50, 48, 150, 48);

      doc.setFontSize(15);
      doc.text('ELECTRONIC METROLOGY LICENSE CERTIFICATE', 105, 60, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('Helvetica', 'Oblique');
      doc.text(`Official Register Number: ${lic.license_number}`, 105, 66, { align: 'center' });

      // Info Blocks
      doc.setFont('Helvetica', 'Bold');
      doc.setFontSize(11);
      doc.setTextColor(40, 50, 60);

      const startY = 82;
      const stepY = 11;
      
      doc.text('Enterprise Name / ឈ្មោះសហគ្រាស:', 20, startY);
      doc.setFont('Helvetica', 'Normal');
      doc.text(lic.company_name, 85, startY);

      doc.setFont('Helvetica', 'Bold');
      doc.text('Business Type / ទម្រង់គតិយុត្តិ:', 20, startY + stepY);
      doc.setFont('Helvetica', 'Normal');
      doc.text(lic.business_type || 'N/A', 85, startY + stepY);

      doc.setFont('Helvetica', 'Bold');
      doc.text('Legal Representative / តំណាងស្របច្បាប់:', 20, startY + stepY * 2);
      doc.setFont('Helvetica', 'Normal');
      doc.text(`${lic.license_owner_name || 'N/A'} (${lic.license_owner_position || 'Director'})`, 85, startY + stepY * 2);

      // Representative details subline (Gender, DOB, Nationality)
      const detailsList: string[] = [];
      if (lic.representative_gender) {
        detailsList.push(`Gender: ${lic.representative_gender === 'Male' ? 'Male/ប្រុស' : lic.representative_gender === 'Female' ? 'Female/ស្រី' : 'Other'}`);
      }
      if (lic.representative_date_of_birth) {
        detailsList.push(`DOB: ${lic.representative_date_of_birth}`);
      }
      if (lic.representative_nationality) {
        detailsList.push(`Nationality: ${lic.representative_nationality}`);
      }
      if (detailsList.length > 0) {
        doc.setFont('Helvetica', 'Oblique');
        doc.setFontSize(8.5);
        doc.text(`(${detailsList.join(' | ')})`, 85, startY + stepY * 2 + 4.5);
        doc.setFontSize(11);
      }

      doc.setFont('Helvetica', 'Bold');
      doc.text('Address / អាសយដ្ឋាន:', 20, startY + stepY * 3);
      doc.setFont('Helvetica', 'Normal');
      const addrLines = doc.splitTextToSize(lic.company_address || 'Cambodia', 100);
      doc.text(addrLines, 85, startY + stepY * 3);

      // Business GPS coordinates subline
      if (lic.business_latitude !== null && lic.business_longitude !== null && lic.business_latitude !== undefined) {
        doc.setFont('Helvetica', 'Bold');
        doc.text('GPS Location / កូអរដោនេភូមិសាស្ត្រ:', 20, startY + stepY * 4.3);
        doc.setFont('Helvetica', 'Normal');
        doc.setFontSize(9);
        doc.text(`Lat: ${lic.business_latitude}, Lon: ${lic.business_longitude} (source: ${lic.business_location_source || 'OSM Map'})`, 85, startY + stepY * 4.3);
        doc.setFontSize(11);
      }

      doc.setFont('Helvetica', 'Bold');
      doc.text('Service Scope / វិសាលភាពសេវា:', 20, startY + stepY * 5);
      doc.setFont('Helvetica', 'Normal');
      const scopeLines = doc.splitTextToSize(lic.service_scope || 'All metrology scaling operations', 100);
      doc.text(scopeLines, 85, startY + stepY * 5);

      doc.setFont('Helvetica', 'Bold');
      doc.text('Measuring Instruments / ឧបករណ៍មាត្រាសាស្ត្រ:', 20, startY + stepY * 7);
      doc.setFont('Helvetica', 'Normal');
      const instLines = doc.splitTextToSize(lic.measuring_instrument_type || 'N/A', 100);
      doc.text(instLines, 85, startY + stepY * 7);

      doc.setFont('Helvetica', 'Bold');
      doc.text('Issue Date / ថ្ងៃចេញអាជ្ញាប័ណ្ណ:', 20, startY + stepY * 9);
      doc.setFont('Helvetica', 'Normal');
      doc.text(lic.license_issue_date, 85, startY + stepY * 9);

      doc.setFont('Helvetica', 'Bold');
      doc.text('Expiry Date / ថ្ងៃផុតកំណត់:', 20, startY + stepY * 10);
      doc.setFont('Helvetica', 'Normal');
      doc.text(lic.license_expiry_date, 85, startY + stepY * 10);

      doc.setFont('Helvetica', 'Bold');
      doc.text('Official Service Fee / តម្លៃសេវាកម្ម:', 20, startY + stepY * 11);
      doc.setFont('Helvetica', 'Normal');
      doc.text(lic.service_fee ? `${Number(lic.service_fee).toLocaleString()} USD` : 'NMC Complimentary', 85, startY + stepY * 11);

      // Embed photo
      const imgToUse = lic.photo_base64 || lic.license_owner_photo_url;
      if (imgToUse) {
        try {
          doc.addImage(imgToUse, 'JPEG', 158, 77, 32, 40);
          doc.setDrawColor(180, 180, 180);
          doc.rect(158, 77, 32, 40);
        } catch (imgErr) {
          console.warn('Pdf photo export issue:', imgErr);
        }
      }

      // Security dynamic validation stamp block
      doc.setDrawColor(27, 38, 59);
      doc.setFillColor(248, 250, 252);
      doc.rect(155, 215, 35, 35, 'FD');
      
      doc.setFont('Helvetica', 'Bold');
      doc.setFontSize(8);
      doc.text('NMC SYSTEM', 172.5, 222, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('Helvetica', 'Normal');
      doc.text('ELECTRONICALLY', 172.5, 230, { align: 'center' });
      doc.text('AUTHORIZED', 172.5, 235, { align: 'center' });
      doc.setFontSize(6);
      doc.text(lic.license_number, 172.5, 245, { align: 'center' });

      // Bottom disclaimer
      doc.setFontSize(9);
      doc.setFont('Helvetica', 'Bold');
      doc.text('APPROVED AND ISSUED BY THE NATIONAL METROLOGY CENTER OF CAMBODIA', 105, 264, { align: 'center' });
      
      doc.save(`NMC-Electronic-License-${lic.license_number}.pdf`);
      toastMsg('ទាញយកវិញ្ញាបនបត្រអេឡិចត្រូនិចជោគជ័យ! / Generated PDF certificate successfully.', 'success');
    } catch (pdfErr: any) {
      console.error(pdfErr);
      toastMsg('បរាជ័យក្នុងការទាញយក PDF, សូមប្រើមុខងារ Print ជំនួសវិញ។', 'error');
    }
  };

  // Filter Logic
  const filteredLicenses = licenses.filter(lic => {
    // 1. Role Restrictions: If logged in user is a 'company' context, they should ONLY view their own license!
    if (isCompanyUser) {
      if (!isLicenseOwnedByCurrentCompany(lic, currentUser)) return false;
    }

    // 2. Search Query (Search license number, company name, representative)
    const matchSearch = searchQuery.trim() === '' || 
      lic.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lic.license_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lic.license_owner_name && lic.license_owner_name.toLowerCase().includes(searchQuery.toLowerCase()));

    // 3. Status filter
    const matchStatus = filterStatus === 'all' || lic.license_status === filterStatus;

    // 4. Telegram filter
    let matchTelegram = true;
    if (filterTelegram === 'connected') {
      matchTelegram = lic.telegram_connection_status === 'Connected';
    } else if (filterTelegram === 'not_connected') {
      matchTelegram = lic.telegram_connection_status !== 'Connected';
    }

    return matchSearch && matchStatus && matchTelegram;
  });

  // KPI calculations based on all accessible licenses (before search filtering, but respecting role visibility scope)
  const roleAccessibleLicenses = licenses.filter(lic => {
    if (isCompanyUser) {
      return isLicenseOwnedByCurrentCompany(lic, currentUser);
    }
    return true;
  });

  const totalStatsCount = roleAccessibleLicenses.length;
  const activeStatsCount = roleAccessibleLicenses.filter(l => l.license_status === 'Active').length;
  const expiringSoonStatsCount = roleAccessibleLicenses.filter(l => l.license_status === 'Expiring Soon').length;
  const expiredStatsCount = roleAccessibleLicenses.filter(l => l.license_status === 'Expired').length;
  const telegramConnRatio = roleAccessibleLicenses.length > 0 
    ? Math.round((roleAccessibleLicenses.filter(l => l.telegram_connection_status === 'Connected').length / roleAccessibleLicenses.length) * 100)
    : 0;
  const companyVisibleLicenses = isCompanyUser ? roleAccessibleLicenses : filteredLicenses;

  return (
    <div className="min-h-screen pb-24">
      {!showAddModal && (
        <div className="space-y-6 animate-fade-in duration-200">
      
      {/* Dynamic Header Description Cards */}
      <div 
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-nmc-header text-white p-6 rounded-xl border border-[#3F7C9B]/30 shadow-md" 
        style={{ backgroundColor: '#4F6F8D' }}
        id="registry-header-container"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Award className="h-6 w-6 text-yellow-300 animate-bounce" />
            <h1 className="text-xl md:text-2xl font-bold font-muol leading-relaxed tracking-wide text-white">
              {isCompanyUser ? 'អាជ្ញាប័ណ្ណរបស់ខ្ញុំ (My License)' : 'បញ្ជីអាជ្ញាប័ណ្ណសហគ្រាស (Enterprise Licensing Registry)'}
            </h1>
          </div>
          <p className="text-xs text-white/95 font-sans leading-relaxed max-w-4xl">
            {isCompanyUser ? (
              <span>មើលព័ត៌មានអាជ្ញាប័ណ្ណដែលបានភ្ជាប់ជាមួយគណនីរបស់លោកអ្នកប៉ុណ្ណោះ។ / View only the license information linked to your account.</span>
            ) : (
              <>
                ប្រព័ន្ធគ្រប់គ្រងអាជ្ញាប័ណ្ណសហគ្រាសវាស់ស្ទង់មាត្រាសាស្ត្រ និងការរំលឹកផុតកំណត់ស្វ័យប្រវត្តិតាមរយៈ <span className="text-sky-200 font-bold">Telegram Bot</span>។  
                សុពលភាពអាជ្ញាប័ណ្ណមានរយៈពេល ៣ ឆ្នាំ (៣៦ខែ)។ ប្រព័ន្ធនឹងធ្វើការរំលឹកសហគ្រាសមុនថ្ងៃផុតកំណត់ <span className="font-bold text-yellow-300">៦០ថ្ងៃ, ៣០ថ្ងៃ និង ៧ថ្ងៃ</span>។
              </>
            )}
          </p>
        </div>

        {!isCompanyUser && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => {
                if (!activeReminderBot) {
                  toastMsg('សូមកំណត់ License Reminder Bot សកម្ម ឬ Bot ដែលមាន Purpose Both ជាមុនសិន។ / Please configure an active License Reminder Bot or a bot with purpose Both.', 'error');
                  return;
                }
                handleTriggerSimulatedReminderCron();
              }}
              disabled={!activeReminderBot}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all border cursor-pointer shadow-md active:scale-95 ${
                activeReminderBot 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400' 
                  : 'bg-slate-750/30 text-slate-400 border-slate-700/40 cursor-not-allowed opacity-50'
              }`}
              id="trigger-reminder-check-btn"
              title={!activeReminderBot ? "Please configure an active License Reminder Bot or a bot with purpose Both." : "Check and send reminders"}
            >
              <Send className="h-3.5 w-3.5" />
              <span>ពិនិត្យការរំលឹក (Daily Reminder Check)</span>
            </button>

            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#39789A] hover:bg-[#2F6682] active:scale-95 text-white text-xs font-semibold rounded transition-all border border-[#3F7C9B] cursor-pointer shadow-md"
              id="add-new-license-btn"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>ចុះបញ្ជីថ្មី (Add License)</span>
            </button>
          </div>
        )}
      </div>

      {/* Dynamic Graceful Warning Alert Banner for Database Table Presence */}
      {isDemoMode && (
        <div className="bg-amber-900/10 border border-amber-500/25 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-700 dark:text-amber-400 shadow-3xs" id="demo-mode-alert">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 animate-pulse" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold font-muol text-amber-600">
                តារាងទិន្នន័យអាជ្ញាប័ណ្ណមិនទាន់ត្រូវបានបង្កើតនៅក្នុង Supabase ទេ។ សូមដំណើរការ SQL Migration ជាមុនសិន។
              </p>
              <p className="font-bold text-amber-500">
                License database tables have not been created in Supabase yet. Please run the SQL migration first.
              </p>
              <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 bg-yellow-400 text-slate-950 font-black rounded-full font-mono text-[9px] uppercase tracking-wide">
                ⚠️ កំពុងប្រើទិន្នន័យសាកល្បង / Using demo fallback data
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Superadmin Database Management Panel */}
      {(currentUser.role === 'superadmin' || currentUser.role === 'admin') && (
        <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-5 shadow-lg space-y-4 font-sans" id="database-setup-panel">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-gold" />
              <h2 className="text-sm font-bold font-muol text-amber-400">
                ការរៀបចំ Database (Database Setup & Synchronization Controller)
              </h2>
            </div>
            <span className="text-[10px] bg-indigo-900/40 text-indigo-300 font-extrabold p-1 px-2.5 rounded-full uppercase border border-indigo-750 font-mono">
              System Console
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-slate-400 font-bold opacity-75">Enterprise Licenses</p>
                <p className="text-[10px] font-mono mt-0.5 text-slate-600">enterprise_licenses</p>
              </div>
              {tableStatus.enterprise_licenses ? (
                <span className="bg-emerald-950/80 text-emerald-400 p-1 px-2 rounded font-black text-[9px] border border-emerald-900/50">ACTIVE</span>
              ) : (
                <span className="bg-red-950/80 text-red-400 p-1 px-2 rounded font-black text-[9px] border border-red-900/50">MISSING</span>
              )}
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-slate-400 font-bold opacity-75">Bot Settings</p>
                <p className="text-[10px] font-mono mt-0.5 text-slate-600">telegram_bot_settings</p>
              </div>
              {tableStatus.telegram_bot_settings ? (
                <span className="bg-emerald-950/80 text-emerald-400 p-1 px-2 rounded font-black text-[9px] border border-emerald-900/50">ACTIVE</span>
              ) : (
                <span className="bg-red-950/80 text-red-400 p-1 px-2 rounded font-black text-[9px] border border-red-900/50">MISSING</span>
              )}
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-slate-400 font-bold opacity-75">Reminder Logs</p>
                <p className="text-[10px] font-mono mt-0.5 text-slate-600">license_reminder_logs</p>
              </div>
              {tableStatus.license_reminder_logs ? (
                <span className="bg-emerald-950/80 text-emerald-400 p-1 px-2 rounded font-black text-[9px] border border-emerald-900/50">ACTIVE</span>
              ) : (
                <span className="bg-red-950/80 text-red-400 p-1 px-2 rounded font-black text-[9px] border border-red-900/50">MISSING</span>
              )}
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-slate-400 font-bold opacity-75">Renewal History</p>
                <p className="text-[10px] font-mono mt-0.5 text-slate-600">license_renewal_history</p>
              </div>
              {tableStatus.license_renewal_history ? (
                <span className="bg-emerald-950/80 text-emerald-400 p-1 px-2 rounded font-black text-[9px] border border-emerald-900/50">ACTIVE</span>
              ) : (
                <span className="bg-red-950/80 text-red-400 p-1 px-2 rounded font-black text-[9px] border border-red-900/50">MISSING</span>
              )}
            </div>
          </div>

          {!tableStatus.allExist && (
            <div className="bg-amber-950/40 border border-amber-900/30 p-4 rounded-xl flex flex-col md:flex-row justify-between gap-3 text-amber-300">
              <div className="space-y-1">
                <p className="font-extrabold flex items-center gap-1.5 text-xs text-amber-400 uppercase tracking-wider">
                  <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse" />
                  ត្រូវការធ្វើសមកាលកម្មតារាងទិន្នន័យ (Database Tables Desynchronized)
                </p>
                <p className="text-[11px] leading-relaxed max-w-3xl font-medium text-slate-350">
                  ប្រព័ន្ធបានប្តូរទៅកាន់ <span className="text-gold font-bold">ទិន្នន័យសាកល្បង (Local Fallback Cache Mode)</span> ដោយស្វ័យប្រវត្តិ។ សូមធ្វើការចម្លងរចនាសម្ព័ន្ធ SQL Migration យកទៅរត់ក្នុង Supabase SQL Editor ដើម្បីដោះស្រាយ។
                </p>
              </div>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(LICENSING_SQL_MIGRATION);
                  toastMsg('ចម្លងកូដ SQL Migration រួចរាល់! / Copied SQL Migration to clipboard!', 'success');
                }}
                className="self-center flex items-center gap-1 px-4 py-2 bg-amber-500 hover:bg-amber-450 text-slate-950 text-xs font-black rounded-lg transition-transform active:scale-95 border-0 cursor-pointer shadow"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>ចម្លងកូដ SQL (Copy Integration SQL)</span>
              </button>
            </div>
          )}

          <div className="text-[11px] leading-relaxed text-slate-400 space-y-1.5 p-3.5 bg-slate-950 rounded-lg border border-slate-850">
            <p className="font-extrabold text-slate-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              ការណែនាំរៀបចំ (Database Schema Initialization Guide):
            </p>
            <ol className="list-decimal pl-4 space-y-1 text-slate-350 font-medium font-sans">
              <li>ចុចប៊ូតុង <span className="text-amber-400 font-bold">"ចម្លងកូដ SQL (Copy Integration SQL)"</span> ខាងលើ។</li>
              <li>ចូលទៅកាន់ <span className="text-cyan-400 font-black">Supabase Dashboard</span> នៃគម្រោងរបស់លោកអ្នក។</li>
              <li>ជ្រើសរើសមឺនុយ <span className="text-white font-bold">SQL Editor</span> រួចចុច <span className="text-white font-bold">New Query</span>។</li>
              <li>បិទភ្ជាប់ (Paste) កូដដែលបានចម្លង រួចចុច <span className="text-emerald-400 font-bold">Run</span>។</li>
              <li>បន្ទាប់ពីដំណើរការចប់រួចរាល់ សូមធ្វើការ <span className="text-gold font-bold">Refresh</span> កម្មវិធីនេះ។</li>
            </ol>
          </div>
        </div>
      )}


      {/* KPI Bento Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="license-kpi-grid">
        {/* Total Card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-slate-100 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-[10px] text-slate-400 uppercase font-black font-sans">សរុប (Total)</p>
            <p className="text-2xl font-extrabold text-white">{totalStatsCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        {/* Active Card */}
        <div className="bg-emerald-950 border border-emerald-900/60 p-4 rounded-xl text-emerald-100 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-[10px] text-emerald-400 uppercase font-bold font-sans">សកម្ម (Active)</p>
            <p className="text-2xl font-extrabold text-emerald-400">{activeStatsCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-900/40 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        {/* Expiring Soon Card */}
        <div className="bg-amber-950 border border-amber-900/60 p-4 rounded-xl text-amber-100 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-[10px] text-amber-400 uppercase font-bold font-sans">ជិតផុតកំណត់ (Expiring)</p>
            <p className="text-2xl font-extrabold text-amber-400">{expiringSoonStatsCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-900/40 text-amber-450">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
          </div>
        </div>

        {/* Expired Card */}
        <div className="bg-red-950 border border-red-900/60 p-4 rounded-xl text-red-100 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-[10px] text-red-400 uppercase font-bold font-sans">ហួសកំណត់ (Expired)</p>
            <p className="text-2xl font-extrabold text-red-450">{expiredStatsCount}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-red-900/40 text-red-400">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        {/* Telegram Channels Active Status */}
        <div className="bg-sky-950 border border-sky-900/50 p-4 rounded-xl text-sky-100 col-span-2 lg:col-span-1 flex items-center justify-between shadow-xs">
          <div className="space-y-1 w-full">
            <div className="flex justify-between items-center text-[10px] text-sky-400 uppercase font-bold font-sans">
              <span>តេឡេក្រាម (Telegram)</span>
              <span>{telegramConnRatio}%</span>
            </div>
            <p className="text-sm font-bold text-white mt-1">
              {roleAccessibleLicenses.filter(l => l.telegram_connection_status === 'Connected').length} / {roleAccessibleLicenses.length} ភ្ជាប់រួច
            </p>
            <div className="w-full bg-sky-900/50 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div className="bg-sky-400 h-full transition-all duration-500" style={{ width: `${telegramConnRatio}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs and Filter Area */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200" id="registry-navigator-wrapper bg-white">
        
        {/* Tab Anchors */}
        <div className="flex border-b border-slate-200 bg-slate-50 rounded-t-xl overflow-hidden text-xs">
          <button
            onClick={() => setActiveSubTab('registry')}
            className={`flex items-center gap-2 px-5 py-3 font-bold border-r border-slate-200 transition-all cursor-pointer ${
              activeSubTab === 'registry' 
                ? 'bg-[#353C96] text-white font-black' 
                : 'bg-white text-[#353C96] hover:bg-slate-50'
            }`}
            type="button"
          >
            <Building2 className={`h-4 w-4 ${activeSubTab === 'registry' ? 'text-white' : 'text-[#353C96]'}`} />
            <span>{isCompanyUser ? 'អាជ្ញាប័ណ្ណរបស់ខ្ញុំ (My License)' : 'បញ្ជីឈ្មោះសហគ្រាស (Licensing Registry)'}</span>
          </button>

          {!isCompanyUser && (
            <>
              <button
                onClick={() => setActiveSubTab('logs')}
                className={`flex items-center gap-2 px-5 py-3 font-bold border-r border-slate-200 transition-all cursor-pointer ${
                  activeSubTab === 'logs' 
                    ? 'bg-[#353C96] text-white font-black' 
                    : 'bg-white text-[#353C96] hover:bg-slate-50'
                }`}
                type="button"
              >
                <MessageSquare className={`h-4 w-4 ${activeSubTab === 'logs' ? 'text-white' : 'text-[#353C96]'}`} />
                <span>ប្រវត្តិផ្ញើសាររំលឹក (Notification logs)</span>
              </button>

              <button
                onClick={() => setActiveSubTab('renewal-history')}
                className={`flex items-center gap-2 px-5 py-3 font-bold border-r border-slate-200 transition-all cursor-pointer ${
                  activeSubTab === 'renewal-history' 
                    ? 'bg-[#353C96] text-white font-black' 
                    : 'bg-white text-[#353C96] hover:bg-slate-50'
                }`}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${activeSubTab === 'renewal-history' ? 'text-white' : 'text-[#353C96]'}`} />
                <span>ប្រវត្តិនៃការបន្តអាជ្ញាប័ណ្ណ (Renewal history)</span>
              </button>

              <button
                onClick={() => setActiveSubTab('map')}
                className={`flex items-center gap-2 px-5 py-3 font-bold border-r border-slate-200 transition-all cursor-pointer ${
                  activeSubTab === 'map' 
                    ? 'bg-[#353C96] text-white font-black' 
                    : 'bg-white text-[#353C96] hover:bg-slate-50'
                }`}
                type="button"
              >
                <Map className={`h-4 w-4 ${activeSubTab === 'map' ? 'text-white' : 'text-[#353C96]'}`} />
                <span>ផែនទីទីតាំងអាជ្ញាប័ណ្ណ (License Map)</span>
              </button>
            </>
          )}

          {currentUser.role === 'superadmin' && (
            <button
              onClick={() => setActiveSubTab('bot-settings')}
              className={`flex items-center gap-2 px-5 py-3 font-bold border-r border-slate-100 transition-all cursor-pointer ${
                activeSubTab === 'bot-settings' 
                  ? 'bg-[#353C96] text-white font-black' 
                  : 'bg-white text-[#353C96] hover:bg-slate-50'
              }`}
              type="button"
            >
              <Bot className={`h-4 w-4 ${activeSubTab === 'bot-settings' ? 'text-white' : 'text-[#353C96]'}`} />
              <span>ការកំណត់ប៊ូតតេឡេក្រាម (Telegram Bot Settings)</span>
            </button>
          )}
        </div>

        {activeSubTab === 'registry' && (
          <div className="p-5 space-y-4">
            
            {/* Filter controls column */}
            {!isCompanyUser && (
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="ស្វែងរកតាម ឈ្មោះសហគ្រាស ឬ លេខអាជ្ញាប័ណ្ណ... / Search name, license..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-navy focus:outline-hidden"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                
                {/* Status Filter */}
                <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2 bg-amber-50/10">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="text-xs bg-transparent border-0 focus:ring-0 py-1.5 focus:outline-hidden text-slate-700"
                  >
                    <option value="all">ស្ថានភាពទាំងអស់ (All Status)</option>
                    <option value="Active">សកម្ម (Active)</option>
                    <option value="Expiring Soon">ជិតផុតកំណត់ (Expiring Soon)</option>
                    <option value="Expired">ហួសកំណត់ (Expired)</option>
                    <option value="Suspended">ផ្អាកបណ្តោះអាសន្ន (Suspended)</option>
                  </select>
                </div>

                {/* Telegram connected filter */}
                <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2 bg-amber-50/10">
                  <Bot className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={filterTelegram}
                    onChange={(e) => setFilterTelegram(e.target.value)}
                    className="text-xs bg-transparent border-0 focus:ring-0 py-1.5 focus:outline-hidden text-slate-700"
                  >
                    <option value="all">តេឡេក្រាមទាំងអស់ (All Telegram)</option>
                    <option value="connected">ភ្ជាប់រួច (Connected)</option>
                    <option value="not_connected">មិនទាន់ភ្ជាប់ (Not Connected)</option>
                  </select>
                </div>

                <button
                  onClick={loadRegistryData}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all cursor-pointer border border-slate-300 active:scale-95 flex items-center justify-center font-bold"
                  title="ទាញទិន្នន័យឡើងវិញ / Refresh Data"
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
            )}

            {/* List Table Area */}
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="h-8 w-8 text-navy animate-spin" />
                <p className="text-xs text-slate-400 font-bold">កំពុងទាញទិន្នន័យអាជ្ញាប័ណ្ណ... / Loading enterprise licenses...</p>
              </div>
            ) : companyVisibleLicenses.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Award className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                {isCompanyUser ? (
                  <>
                    <p className="text-sm font-bold text-slate-500 font-muol leading-loose px-4">
                      មិនទាន់មានអាជ្ញាប័ណ្ណភ្ជាប់ជាមួយគណនីនេះទេ។ សូមទាក់ទងមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ។
                    </p>
                    <p className="text-xs text-slate-400 mt-2 px-4 font-bold">
                      No license is linked to this account yet. Please contact the National Metrology Center.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-500 font-muol leading-loose">រកមិនឃើញអាជ្ញាប័ណ្ណឡើយ / No License Records Found</p>
                    <p className="text-xs text-slate-400">សូមបង្កើតអាជ្ញាប័ណ្ណថ្មី ឬកែសម្រួលលក្ខខណ្ឌស្វែងរក។</p>
                  </>
                )}
              </div>
            ) : isCompanyUser ? (
              <div className="grid grid-cols-1 gap-4">
                {companyVisibleLicenses.map((lic) => (
                  <div key={lic.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3">
                        {(lic.photo_base64 || lic.license_owner_photo_url) ? (
                          <img
                            src={lic.photo_base64 || lic.license_owner_photo_url}
                            alt="Representative"
                            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
                            <Award className="h-7 w-7" />
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-[11px] font-black uppercase tracking-wide text-[#353C96]">អាជ្ញាប័ណ្ណរបស់ខ្ញុំ / My License</p>
                          <h3 className="text-lg font-black text-slate-900">{lic.company_name}</h3>
                          <p className="font-mono text-xs font-bold text-slate-500">{lic.license_number}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCertificateModal(lic)}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#353C96] px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#2D327F] active:scale-95"
                        >
                          <Eye className="h-4 w-4" />
                          <span>មើលវិញ្ញាបនបត្រ / View Certificate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadPDF(lic)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 active:scale-95"
                        >
                          <Download className="h-4 w-4" />
                          <span>ទាញយក PDF / Download PDF</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase text-slate-400">ថ្ងៃចេញ / Issue Date</p>
                        <p className="mt-1 font-mono text-sm font-black text-slate-800">{lic.license_issue_date}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase text-slate-400">ថ្ងៃផុតកំណត់ / Expiry Date</p>
                        <p className="mt-1 font-mono text-sm font-black text-red-650">{lic.license_expiry_date}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase text-slate-400">ស្ថានភាព / Status</p>
                        <p className="mt-1 text-sm font-black text-slate-800">{lic.license_status}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase text-slate-400">ការរំលឹក / Reminder</p>
                        <p className="mt-1 text-sm font-black text-slate-800">{lic.telegram_connection_status || 'Not Connected'}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 p-4">
                      {(() => {
                        const telegramStatus = getTelegramStatus(lic);
                        const isConnected = telegramStatus === 'Connected';
                        const canLaunchBot = !!activeReminderBot;

                        return (
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-start gap-3">
                              <span className="rounded-full bg-[#229ED9] p-2.5 text-white shadow-sm">
                                <Bot className="h-5 w-5" />
                              </span>
                              <div className="space-y-1">
                                <p className="text-sm font-black text-slate-900">ការភ្ជាប់ Telegram</p>
                                <p className="text-xs font-bold text-[#229ED9]">Telegram Connection</p>
                                <p className="max-w-2xl text-[11px] font-semibold leading-relaxed text-slate-600">
                                  ម្ចាស់ក្រុមហ៊ុន ឬសហគ្រាស ត្រូវភ្ជាប់ Telegram ដោយខ្លួនឯង ដើម្បីទទួលបានការជូនដំណឹងដោយផ្ទាល់។ / The enterprise owner must connect Telegram personally in order to receive direct notifications.
                                </p>
                                {!canLaunchBot && (
                                  <p className="text-[11px] font-bold leading-relaxed text-rose-700">
                                    មិនទាន់កំណត់ Telegram Bot នៅក្នុងប្រព័ន្ធទេ។ សូមទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ។ / Telegram Bot is not configured yet. Please contact the system administrator.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
                              {isConnected ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                                  <Check className="h-3.5 w-3.5" />
                                  <span>បានភ្ជាប់ Telegram / Telegram Connected</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-500">
                                  <Info className="h-3.5 w-3.5" />
                                  <span>មិនទាន់ភ្ជាប់ / Not Connected</span>
                                </span>
                              )}

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={!canLaunchBot}
                                  onClick={() => handleStartConnectionWizard(lic)}
                                  className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2 text-xs font-black text-white shadow transition hover:bg-[#168AC0] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Bot className="h-4 w-4" />
                                  <span>{isConnected ? 'ភ្ជាប់ឡើងវិញ / Reconnect' : 'ភ្ជាប់ Telegram / Connect Telegram'}</span>
                                </button>

                                {isConnected && (
                                  <button
                                    type="button"
                                    onClick={() => handleDisconnectTelegram(lic.id)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                                  >
                                    <X className="h-4 w-4" />
                                    <span>ផ្តាច់ការភ្ជាប់ / Disconnect</span>
                                  </button>
                                )}
                              </div>

                              {lic.telegram_username && (
                                <p className="font-mono text-[10px] font-semibold text-slate-500">@{lic.telegram_username}</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                      <p><strong>តំណាង / Representative:</strong> {lic.license_owner_name || 'N/A'} {lic.license_owner_position ? `(${lic.license_owner_position})` : ''}</p>
                      <p className="mt-1"><strong>អាសយដ្ឋាន / Address:</strong> {lic.company_address || 'N/A'}</p>
                      <p className="mt-1"><strong>វិសាលភាពសេវា / Service Scope:</strong> {lic.service_scope || 'N/A'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-slate-700 border-collapse">
                  <thead>
                    <tr className="bg-[#353C96] text-white text-[11px] font-extrabold text-left border-b border-slate-300 uppercase tracking-wider">
                      <th className="py-3 px-4">សហគ្រាស (Enterprise & License No)</th>
                      <th className="py-3 px-4">តំណាង / ទីតាំង (Rep & Sector)</th>
                      <th className="py-3 px-4">សុពលភាព (Validity Period)</th>
                      <th className="py-3 px-4">តម្លៃសេវា និងឯកសារ (Fee & File)</th>
                      <th className="py-3 px-4">ស្ថានភាព (Status)</th>
                      <th className="py-3 px-4">តេឡេក្រាម (Telegram Status)</th>
                      <th className="py-3 px-4">ការរំលឹក (Reminder Status)</th>
                      <th className="py-3 px-4 text-center">សកម្មភាព (Actions)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredLicenses.map((lic) => {
                      const isExpiring = lic.license_status === 'Expiring Soon';
                      const isExpired = lic.license_status === 'Expired';

                      return (
                        <tr key={lic.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Company Name & License No */}
                          <td className="py-3 px-4 space-y-1">
                            <div className="flex items-center gap-2">
                              {(lic.photo_base64 || lic.license_owner_photo_url) && (
                                <img 
                                  src={lic.photo_base64 || lic.license_owner_photo_url} 
                                  alt="Representative Avatar" 
                                  className="h-8 w-8 rounded-full object-cover border border-slate-300 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                              <div>
                                <p className="font-bold text-slate-900 leading-normal">{lic.company_name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-[10px] text-slate-550 bg-slate-100 p-0.5 px-1.5 rounded border border-slate-200">
                                    {lic.license_number}
                                  </span>
                                  {lic.business_type && (
                                    <span className="text-[9px] text-[#353C96] bg-slate-50 p-0.5 px-1 rounded font-bold">
                                      {lic.business_type.split(' ')[0]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Representative, instrument category */}
                          <td className="py-3 px-4 space-y-1">
                            <p className="text-slate-800 text-[11px]">
                              <strong>{lic.license_owner_name || 'N/A'}</strong> ({lic.license_owner_position || 'CEO'})
                            </p>
                            <p className="text-slate-450 text-[10px] line-clamp-1" title={lic.measuring_instrument_type || ''}>
                              {lic.measuring_instrument_type || 'No instruments listed'}
                            </p>
                          </td>

                          {/* Issue & Expiry Date */}
                          <td className="py-3 px-4 space-y-1 font-mono text-[11px]">
                            <div className="flex items-center gap-1 text-slate-500">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>ចេញ៖ {lic.license_issue_date}</span>
                            </div>
                            <div className={`flex items-center gap-1 font-bold ${isExpired ? 'text-red-500' : isExpiring ? 'text-amber-500':'text-slate-700'}`}>
                              <Calendar className="h-3.5 w-3.5" />
                              <span>ផុត៖ {lic.license_expiry_date}</span>
                            </div>
                          </td>

                          {/* Value/Service Fee and Attachments */}
                          <td className="py-3 px-4 space-y-1.5">
                            <p className="font-bold text-slate-800 font-mono">
                              {lic.service_fee ? `$${Number(lic.service_fee).toLocaleString()}` : '$0 (Exempted)'}
                            </p>
                            {lic.attached_doc_base64 ? (
                              <a
                                href={lic.attached_doc_base64}
                                download={lic.attached_doc_name || 'licensing_document'}
                                className="inline-flex items-center gap-1 text-[9px] text-[#353C96] hover:text-indigo-800 font-extrabold bg-slate-50 border border-[#C9D2E3] p-0.5 px-1.5 rounded transition-colors"
                              >
                                <FileText className="h-2.5 w-2.5" />
                                <span className="max-w-[100px] truncate">{lic.attached_doc_name || 'Download Doc'}</span>
                              </a>
                            ) : (
                              <span className="text-[9px] text-slate-400 italic">គ្មានឯកសារគាំទ្រ</span>
                            )}
                          </td>

                          {/* License status Badge */}
                          <td className="py-3 px-4">
                            {lic.license_status === 'Active' ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 p-1 px-2.5 rounded-full border border-emerald-200/50 text-[10px] font-black">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                <span>សកម្ម (Active)</span>
                              </span>
                            ) : isExpiring ? (
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 p-1 px-2.5 rounded-full border border-amber-200/50 text-[10px] font-black animate-pulse">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                                <span>ជិតផុតកំណត់ (Expiring)</span>
                              </span>
                            ) : isExpired ? (
                              <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 p-1 px-2.5 rounded-full border border-red-200/50 text-[10px] font-black">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                                <span>ហួសកំណត់ (Expired)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-655 p-1 px-2.5 rounded-full border border-slate-200 text-[10px] font-black">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                                <span>{lic.license_status}</span>
                              </span>
                            )}
                          </td>

                          {/* Telegram Status Column */}
                          <td className="py-3 px-4">
                            {(() => {
                              const status = getTelegramStatus(lic);

                              if (!activeReminderBot) {
                                return (
                                  <div className="text-slate-500 text-[10px] bg-slate-100 border border-slate-300 rounded p-1.5 flex flex-col items-start gap-1 leading-normal max-w-[155px]">
                                    <span className="font-extrabold text-[#353C96] flex items-center gap-1 font-muol leading-loose">
                                      <Bot className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                      Bot មិនបានកំណត់
                                    </span>
                                    <span className="text-[9px] italic text-slate-500 font-medium font-sans">Reminder bot not configured.</span>
                                  </div>
                                );
                              }

                              if (status === 'Connected') {
                                return (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 p-0.5 px-2 rounded-full border border-emerald-150 text-[9px] font-bold">
                                      <Bot className="h-3 w-3 text-emerald-500" />
                                      <span>ភ្ជាប់រួច (Linked) ✓</span>
                                    </span>
                                    <p className="font-mono text-[9px] text-slate-500 line-clamp-1">
                                      @{lic.telegram_username || 'user'} ({lic.telegram_chat_id})
                                    </p>
                                  </div>
                                );
                              }

                              if (status === 'Waiting') {
                                return (
                                  <div className="space-y-1.5">
                                    <div className="p-1.5 bg-amber-50 text-[9.5px] leading-normal font-bold text-amber-800 rounded border border-amber-100 flex flex-col space-y-1.5 shadow-3xs">
                                      <span className="inline-flex items-center gap-1 text-[9px] font-sans">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                        រង់ចាំការចុច START
                                      </span>
                                      <p className="line-clamp-1 text-[8px] font-mono text-slate-400 font-medium font-sans leading-none">Waiting for START</p>
                                      
                                      <span className="text-[8.5px] text-slate-500">រង់ចាំម្ចាស់សហគ្រាសបើក Telegram / Waiting for company owner</span>
                                    </div>
                                  </div>
                                );
                              }

                              if (status === 'Expired') {
                                return (
                                  <div className="space-y-1.5">
                                    <div className="p-1 px-1.5 bg-red-50 text-[9.5px] leading-normal font-bold text-red-700 rounded border border-red-100 flex flex-col space-y-1.5">
                                      <span className="inline-flex items-center gap-1 text-[9px]">
                                        ❌ តំណភ្ជាប់វាហួសកំណត់ / Link Expired
                                      </span>
                                      
                                      <span className="text-[8.5px] text-slate-400">ម្ចាស់សហគ្រាសត្រូវភ្ជាប់ឡើងវិញដោយខ្លួនឯង / Company owner must reconnect personally</span>
                                    </div>
                                  </div>
                                );
                              }

                              // NotConnected
                              return (
                                <div className="space-y-1">
                                  <span className="text-slate-400 italic text-[10px]">មិនទាន់ភ្ជាប់ / Not Connected</span>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Reminder Status Column */}
                          <td className="py-3 px-4">
                            {(() => {
                              const reminderMilestones: { label: string; date: string | null }[] = [
                                { label: '60d', date: lic.last_60_day_reminder_sent_at },
                                { label: '30d', date: lic.last_30_day_reminder_sent_at },
                                { label: '7d', date: lic.last_7_day_reminder_sent_at },
                                { label: 'Exp', date: lic.expired_reminder_sent_at }
                              ];

                              const sentItems = reminderMilestones.filter(m => m.date);

                              if (sentItems.length === 0) {
                                return (
                                  <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200/60 rounded px-1.5 py-0.5 font-medium leading-normal inline-block">
                                    គ្មាន (None)
                                  </span>
                                );
                              }

                              return (
                                <div className="flex flex-wrap gap-1 max-w-[120px]">
                                  {sentItems.map(m => (
                                    <span
                                      key={m.label}
                                      title={`Sent at: ${m.date ? new Date(m.date).toLocaleString():''}`}
                                      className="inline-flex items-center gap-0.5 bg-slate-50 border border-indigo-150 text-[#353C96] text-[9px] font-extrabold px-1 py-0.5 rounded shadow-3xs"
                                    >
                                      <Send className="h-2 w-2 shrink-0 text-[#353C96]" />
                                      <span>{m.label}</span>
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Actions Column */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Open Details & Certificate Action */}
                              <button
                                onClick={() => setShowCertificateModal(lic)}
                                className="p-1 bg-sky-50 border border-sky-150 text-sky-700 hover:bg-sky-100 rounded-lg font-black hover:border-sky-355 transition-all cursor-pointer inline-flex items-center justify-center active:scale-95 shadow-3xs"
                                title="មើលលម្អិត និងវិញ្ញាបនបត្រ / View Details & Certificate"
                                type="button"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>

                              {/* Edit Action (Restricted/Allowed depending on Admin roles) */}
                              {(currentUser.role === 'superadmin' || currentUser.role === 'admin') && (
                                <button
                                  onClick={() => handleEditClick(lic)}
                                  className="p-1 bg-slate-50 border border-slate-200 text-slate-705 hover:bg-slate-100 rounded-lg hover:text-navy hover:border-slate-300 transition-colors cursor-pointer"
                                  title="កែសម្រួល / Edit"
                                  type="button"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Renew Action (Admin & Superadmin only) */}
                              {(currentUser.role === 'superadmin' || currentUser.role === 'admin') && (
                                <button
                                  onClick={() => {
                                    setShowRenewModal(lic);
                                    setRenewalIssueDate(new Date().toISOString().split('T')[0]);
                                    setRenewalNotes('');
                                  }}
                                  className="p-1 bg-slate-50 border border-[#C9D2E3] text-[#353C96] hover:bg-slate-100 rounded-lg font-bold hover:border-[#C9D2E3] transition-colors cursor-pointer"
                                  title="បន្តសុពលភាព / Renew"
                                  type="button"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Delete Action (Superadmin only) */}
                              {currentUser.role === 'superadmin' && (
                                <button
                                  onClick={() => handleDeleteLicense(lic.id, lic.license_number)}
                                  className="p-1 bg-red-50 border border-red-105 text-red-650 hover:bg-red-100 rounded-lg hover:border-red-250 transition-colors cursor-pointer"
                                  title="លុបចោល / Delete"
                                  type="button"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* B. REGISTRY NOTIFICATION LOGS TAB */}
        {activeSubTab === 'logs' && !isCompanyUser && (
          <div className="p-5 space-y-4 text-xs font-sans">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 text-white p-4 rounded-xl shadow-xs gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Bot className="h-4.5 w-4.5 text-sky-400" />
                  <p className="font-bold text-sm">ប្រវត្តិការផ្ញើការរំលឹកស្វ័យប្រវត្តិតាមតេឡេក្រាម (Telegram Bot Reminder Delivery Logs)</p>
                </div>
                <p className="text-[10px] text-slate-400">ប្រវត្តិនិងរបាយការណ៍សកម្មភាពនៃការផ្ញើសាររំលឹកផុតកំណត់ស្វ័យប្រវត្តិ។ / Full delivery records of bot auto notification broadcasts.</p>
              </div>
              <button
                onClick={loadRegistryData}
                className="py-1.5 px-3 bg-slate-850 hover:bg-slate-700 border border-slate-650 rounded text-[10px] font-bold text-white transition-colors cursor-pointer active:scale-95 flex items-center gap-1.5"
                type="button"
              >
                <RefreshCw className="h-3 w-3" />
                <span>បន្ទាន់សម័យ (Refresh Delivery Status)</span>
              </button>
            </div>

            {reminderLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic bg-white border rounded-xl">
                មិនទាន់មានកំណត់ត្រាផ្ញើការរំលឹកនៅឡើយទេ / No notification delivery logs found.
              </div>
            ) : (
              <div className="space-y-3">
                {reminderLogs.map((log) => {
                  const targetLic = licenses.find((l) => l.id === log.license_id);
                  return (
                    <div key={log.id} className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-xs flex flex-col md:flex-row justify-between gap-4 font-sans items-start md:items-center text-white">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-200 text-[11px] bg-slate-800 p-0.5 px-2 rounded-sm text-gold">
                            {targetLic ? targetLic.company_name : 'Unknown Enterprise'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            (Lic: {targetLic ? targetLic.license_number : 'N/A'})
                          </span>
                          {log.reminder_days > 0 ? (
                            <span className="bg-amber-600 text-[10px] font-extrabold text-white p-0.5 px-1.5 rounded-sm shadow-xs border border-amber-450">
                              រំលឹក {log.reminder_days} ថ្ងៃមុនផុតកំណត់
                            </span>
                          ) : (
                            <span className="bg-[#353C96] text-[10px] font-extrabold text-white p-0.5 px-1.5 rounded-sm">
                              ការតភ្ជាប់តេឡេក្រាមជោគជ័យ (Bot Webhook Link)
                            </span>
                          )}
                        </div>

                        <p className="text-[11.5px] p-2 bg-black/40 rounded border border-slate-800 font-sans text-slate-300 leading-relaxed max-w-5xl" dangerouslySetInnerHTML={{ __html: log.message_text }} />
                      </div>

                      <div className="text-right shrink-0 space-y-1 font-mono text-[10px] text-slate-400 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800 w-full md:w-auto">
                        <p>Chat ID: {log.telegram_chat_id || 'N/A'}</p>
                        <p>User: @{log.telegram_username || 'N/A'}</p>
                        <div className="flex items-center gap-1 justify-end text-emerald-400 text-[9px] font-bold">
                          <Check className="h-3 w-3" />
                          <span>SENT SUCCESS ({log.sent_at.split('T')[0]})</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* C. RENEWAL HISTORY TAB */}
        {activeSubTab === 'renewal-history' && !isCompanyUser && (
          <div className="p-5 space-y-4 text-xs font-sans">
            <div className="flex justify-between items-center bg-slate-900 border border-slate-850 text-white p-3 rounded-lg leading-relaxed shadow-sm">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4.5 w-4.5 text-gold" />
                <p className="font-bold">ប្រវត្តិបន្តសុពលភាពអាជ្ញាប័ណ្ណ (License Renewal & Extension History)</p>
              </div>
              <button
                onClick={loadRegistryData}
                className="py-1 px-3 bg-slate-850 hover:bg-slate-700 border border-slate-600 rounded text-[10px] font-bold text-white transition-colors cursor-pointer"
                type="button"
              >
                Refresh Hist
              </button>
            </div>

            {renewalHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic bg-white border rounded-xl">
                មិនទាន់មានប្រវត្តិបន្តសុពលភាពនៅឡើយទេ / No license extensions recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {renewalHistory.map((hist) => {
                  const targetLic = licenses.find(l => l.id === hist.license_id);
                  return (
                    <div key={hist.id} className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg shadow-sm flex flex-col md:flex-row justify-between gap-4 font-sans items-start md:items-center text-white">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-100">{targetLic ? targetLic.company_name : 'N/A'}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                          <span className="font-mono text-gold bg-gold/10 p-0.5 px-2 border border-gold/15 rounded-sm">
                            Lic No: {targetLic ? targetLic.license_number : 'N/A'}
                          </span>
                          <span>&bull;</span>
                          <span>ចាស់៖ {hist.old_issue_date} ដល់ {hist.old_expiry_date}</span>
                          <span>&rarr;</span>
                          <span className="font-bold text-emerald-400 bg-emerald-950/20 p-0.5 px-2 border border-emerald-900/40 rounded-sm">
                            ថ្មី៖ {hist.new_issue_date} ដល់ {hist.new_expiry_date}
                          </span>
                        </div>
                        {hist.notes && (
                          <p className="text-[11px] text-slate-300 bg-slate-900 p-2 rounded mt-1.5 leading-normal max-w-4xl border border-slate-850">
                            📝 {hist.notes}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0 space-y-1 font-mono text-[9px] text-slate-400 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800 w-full md:w-auto">
                        <p>មន្ត្រីអនុញ្ញាត៖ <strong className="text-slate-300">{hist.renewed_by}</strong> ({hist.renewed_by_role.toUpperCase()})</p>
                        <p>កាលបរិច្ឆេទប្រត្តិបត្តិ៖ {new Date(hist.renewed_at).toLocaleString()}</p>
                        <div className="inline-flex items-center gap-1 bg-emerald-950 text-emerald-400 border border-emerald-900 text-[8.5px] font-black p-0.5 px-2 rounded-full mt-1.5 uppercase">
                          <Check className="h-3 w-3" />
                          <span>Renewed</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* D. TELEGRAM BOT SETTINGS TAB */}
        {activeSubTab === 'bot-settings' && currentUser.role === 'superadmin' && (
          <div className="p-5 space-y-4 text-xs font-sans">
            {/* Header banner */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 text-white p-4 rounded-xl shadow-xs gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Bot className="h-4.5 w-4.5 text-sky-400" />
                  <p className="font-bold text-sm">ការកំណត់ប៊ូតតេឡេក្រាមសំរាប់ប្រព័ន្ធជូនដំណឹងជាស្វ័យប្រវត្តិ (Telegram Notification Bot Settings)</p>
                </div>
                <p className="text-[10px] text-slate-400">ប្រព័ន្ធផ្លាស់ប្តូរប៊ូតជាស្វ័យប្រវត្តិ។ នៅពេលអភិបាលជាន់ខ្ពស់បើកដំណើរការប៊ូតមួយ ប៊ូតចាស់គឺត្រូវបានបិទដោយស្វ័យប្រវត្តិ។ / Auto deactivates others once a primary bot is toggled Active.</p>
              </div>
              <button
                onClick={() => handleOpenBotModal(null)}
                className="py-2 px-4 bg-[#353C96] hover:bg-[#2D327F] text-white text-[11px] font-black rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1 hover:border-indigo-400 shadow-sm self-end md:self-auto shrink-0"
                type="button"
              >
                <Plus className="h-3 w-3" />
                <span>ចុះឈ្មោះប៊ូតតេឡេក្រាម / Register Telegram Bot</span>
              </button>
            </div>
            
            {/* Security Warning Notice */}
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-900 leading-relaxed text-[11.5px] flex items-start gap-3 shadow-3xs font-medium">
              <span className="text-lg text-amber-500 font-bold shrink-0">⚠️</span>
              <div className="space-y-1">
                <p className="font-bold text-amber-950 font-muol leading-loose">ការណែនាំអំពីសុវត្ថិភាព / Important Security Advice:</p>
                <p className="font-sans leading-relaxed">ប្រសិនបើ Bot Token ត្រូវបានបង្ហាញ ឬចែករំលែក សូមបង្កើត Token ថ្មីតាមរយៈ @BotFather ភ្លាមៗ។</p>
                <p className="text-[10px] text-amber-800 italic">If the Bot Token has been exposed or shared, please regenerate a new token through @BotFather immediately.</p>
              </div>
            </div>

            {botSettings.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic bg-white border rounded-xl">
                មិនទាន់មានការកំណត់ប៊ូតតេឡេក្រាមនៅឡើយទេ / No Telegram bots registered.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {botSettings.map((bot) => {
                  const botConnectionStatus = getBotConnectionStatus(bot);
                  const botIsConfiguredActive = hasUsableBotIdentity(bot, true);
                  const activeBadgeLabel = bot.is_active ? (botIsConfiguredActive ? 'Active' : 'Active - Missing Config') : 'Inactive';

                  return (
                  <div key={bot.id} className="bg-white border rounded-xl p-4 shadow-2xs space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                          <Bot className="h-4 w-4 text-sky-500" />
                          <span>{bot.bot_name || 'NMC Notification Bot'}</span>
                        </h4>
                        <p className="text-xs text-sky-600 font-mono mt-0.5">@{bot.bot_username}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        botIsConfiguredActive
                          ? 'bg-emerald-100 text-emerald-800' 
                          : bot.is_active
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-505'
                      }`}>
                        {activeBadgeLabel}
                      </span>
                    </div>

                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black border ${
                      normalizeBotPurpose(bot.bot_purpose) === 'both'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : normalizeBotPurpose(bot.bot_purpose) === 'report_group'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                    }`}>
                      {getBotPurposeLabel(bot)}
                    </span>

                    <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">
                      {bot.description || 'គ្មានការពិពណ៌នា / No description provided.'}
                    </p>

                    <div className="space-y-1.5 pt-2 border-t text-[11px]">
                      <p className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">Bot Token:</span>
                        <span className="font-mono font-bold text-slate-700 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">
                          {maskBotToken(bot.bot_token_encrypted)}
                        </span>
                      </p>
                      <p className="flex justify-between">
                        <span className="text-slate-400">Bot Display Name:</span>
                        <span className="font-bold text-slate-700">{bot.bot_display_name || bot.bot_name || 'N/A'}</span>
                      </p>
                      <p className="flex justify-between">
                        <span className="text-slate-400">Default Group Chat ID:</span>
                        <span className="font-mono font-bold text-slate-700">
                          {botRequiresGroupChat(bot) ? (getBotGroupChatId(bot) || 'Required') : (getBotGroupChatId(bot) || 'Optional')}
                        </span>
                      </p>
                      {botRequiresGroupChat(bot) && !getBotGroupChatId(bot) && (
                        <p className="text-[10px] font-bold text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-100">
                          Default Group Chat ID is required for report group notifications. Negative group IDs are allowed.
                        </p>
                      )}
                      <p className="flex justify-between items-center">
                        <span className="text-slate-400">Connection Status:</span>
                        <span className={`font-bold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${
                          botConnectionStatus === 'connected' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : botConnectionStatus === 'error' 
                              ? 'bg-red-50 text-red-700' 
                              : botConnectionStatus === 'inactive'
                                ? 'bg-slate-50 text-slate-500'
                                : 'bg-amber-50 text-amber-700'
                        }`}>
                          {getBotConnectionLabel(botConnectionStatus)}
                        </span>
                      </p>
                      <p className="flex justify-between">
                        <span className="text-slate-400">Last Tested:</span>
                        <span className="font-medium text-slate-600">{bot.last_tested_at ? new Date(bot.last_tested_at).toLocaleString() : 'N/A'}</span>
                      </p>
                      {(bot.last_error || bot.last_test_message) && (
                        <p className="text-[10px] text-slate-400 italic bg-slate-50 p-1.5 rounded border">
                          {bot.last_error || bot.last_test_message}
                        </p>
                      )}

                      {/* Webhook Settings Section */}
                      <div className="pt-2 border-t mt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-[#353C96] uppercase tracking-wider">
                            ប្រព័ន្ធ Webhook (Webhook Settings)
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConfigureWebhook(bot.id)}
                            className="px-2 py-0.5 bg-slate-50 hover:bg-slate-100 border border-[#C9D2E3] text-[#353C96] font-black rounded text-[9.5px] transition-all cursor-pointer shadow-3xs"
                          >
                            កំណត់ Webhook / Set Webhook
                          </button>
                        </div>

                        {(() => {
                          const ws = webhookStatuses[bot.id] || { status: getWebhookStatusLabel(bot) };
                          const webhookLabel = getWebhookStatusLabel(bot, ws.status);
                          let statusColor = 'text-slate-500 bg-slate-50 border-slate-200';
                          if (webhookLabel === 'Configured') statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                          if (ws.status === 'Failed') statusColor = 'text-red-700 bg-red-50 border-red-200';

                          return (
                            <div className="mt-1.5 space-y-1 bg-slate-50/50 p-2 rounded-lg border border-slate-100 text-[10px] leading-relaxed">
                              <p className="flex justify-between items-center">
                                <span className="text-slate-400 font-medium">Webhook Status:</span>
                                <span className={`font-black px-1.5 py-0.2 rounded border text-[9px] ${statusColor}`}>
                                  {ws.status === 'Failed' ? 'Error' : webhookLabel}
                                </span>
                              </p>
                              <p className="flex justify-between items-center font-mono">
                                <span className="text-slate-400 font-sans">Webhook URL:</span>
                                <span className="text-slate-700 font-bold truncate max-w-[170px]" title={ws.url || 'Not configured'}>
                                  {ws.url || 'Not configured'}
                                </span>
                              </p>
                              <p className="flex justify-between items-center">
                                <span className="text-slate-400 font-sans">Last Setup:</span>
                                <span className="text-slate-500 font-medium">
                                  {ws.url ? (ws.last_configured_date ? new Date(ws.last_configured_date).toLocaleDateString() : 'Active') : 'N/A'}
                                </span>
                              </p>
                              {ws.last_error_message && (
                                <p className="text-[9px] text-red-500 italic bg-red-50 p-1 rounded border border-red-100 text-justify font-sans">
                                  {ws.last_error_message}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t font-sans">
                      {botRequiresGroupChat(bot) && (
                        <button
                          type="button"
                          onClick={() => handleTestBotConnection(bot)}
                          disabled={!botIsConfiguredActive}
                          className="p-1.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50 border border-sky-200 rounded transition-colors cursor-pointer font-sans"
                        >
                          Send Test Group Message
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTestBotConnection(bot)}
                        disabled={!botIsConfiguredActive}
                        style={{ display: botRequiresGroupChat(bot) ? 'none' : undefined }}
                        className="p-1.5 text-[10px] font-bold text-sky-700 hover:bg-sky-50 border border-sky-200 rounded transition-colors cursor-pointer font-sans"
                      >
                        តេស្តការតភ្ជាប់ (Test Connection)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenBotModal(bot)}
                        className="p-1.5 text-[10px] font-bold text-[#39789A] hover:bg-slate-50 border border-[#C9D2E3] rounded transition-colors cursor-pointer font-sans"
                      >
                        កែប្រែ (Edit)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBotSetting(bot.id)}
                        className="p-1.5 text-[10px] font-bold text-red-650 hover:bg-red-50 border border-red-200 rounded transition-colors cursor-pointer font-sans"
                      >
                        លុប (Delete)
                      </button>
                    </div>
                  </div>
                );
                })}
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'map' && !isCompanyUser && (
          <div className="p-5">
            <EnterpriseLicenseMapView
              licenses={roleAccessibleLicenses}
              onViewLicense={(lic) => setShowCertificateModal(lic)}
            />
          </div>
        )}
      </div>
      </div>
      )}

      {showAddModal && (() => {
        // Compute date status for live preview & summary card
        const getLicenseDateStatus = (expiryDateStr: string) => {
          if (!expiryDateStr) return { days: 0, labelKh: 'មិនទាន់កំណត់', labelEn: 'Not Set', colorClass: 'bg-slate-100 text-slate-500 border-slate-200 font-sans' };
          const today = new Date(new Date().toISOString().split('T')[0]);
          const expiry = new Date(expiryDateStr);
          const diffMs = expiry.getTime() - today.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          
          if (diffDays < 0) {
            return { days: diffDays, labelKh: 'ហួសសុពលភាព', labelEn: 'Expired', colorClass: 'bg-red-50 text-red-700 border-red-200 font-sans' };
          } else if (diffDays <= 60) {
            return { days: diffDays, labelKh: 'ជិតហួសកំណត់', labelEn: 'Expiring Soon', colorClass: 'bg-amber-50 text-amber-700 border-amber-200' };
          } else {
            return { days: diffDays, labelKh: 'សកម្ម / មានសុពលភាព', labelEn: 'Active', colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
          }
        };

        const dateStatus = getLicenseDateStatus(licenseExpiryDate);
        
        const isStepCompleted = (idx: number) => {
          if (idx === 0) return companyNameKh !== '' && companyName !== '' && licenseNumber !== '';
          if (idx === 1) return licenseOwnerName !== '';
          if (idx === 2) return licenseIssueDate !== '' && licenseExpiryDate !== '';
          if (idx === 3) return serviceFee !== '' || username !== '' || password !== '';
          if (idx === 4) return attachedDocName !== '';
          if (idx === 5) return companyNameKh !== '' && companyName !== '' && licenseNumber !== '' && licenseOwnerName !== '' && licenseIssueDate !== '' && licenseExpiryDate !== '';
          return false;
        };

        const formSteps = [
          { key: 'company', labelKh: 'ព័ត៌មានក្រុមហ៊ុន', labelEn: 'Company Info', id: 'sec-company' },
          { key: 'owner', labelKh: 'ម្ចាស់អាជ្ញាប័ណ្ណ', labelEn: 'License Owner', id: 'sec-owner' },
          { key: 'license', labelKh: 'ព័ត៌មានអាជ្ញាប័ណ្ណ', labelEn: 'License Info', id: 'sec-license' },
          { key: 'payment', labelKh: 'តម្លៃសេវា និងគណនី', labelEn: 'Fee & Account', id: 'sec-payment' },
          { key: 'docs', labelKh: 'ឯកសារភ្ជាប់', labelEn: 'Documents', id: 'sec-docs' },
          { key: 'review', labelKh: 'ពិនិត្យ និងរក្សាទុក', labelEn: 'Review & Save', id: 'sec-review' },
        ];

        const scrollToSection = (id: string) => {
          const element = document.getElementById(id);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };

        return (
          <div className="min-h-screen bg-[#F5F7FB] pb-32 font-sans animate-fade-in duration-200 p-6 rounded-2xl border border-[#C9D2E3]" id="enterprise-license-form-page">
            {/* Unsaved Changes Confirmation Dialog */}
            {showUnsavedConfirm && (
              <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white text-slate-800 rounded-2xl max-w-sm w-full border border-slate-300 overflow-hidden shadow-2xl animate-fade-in duration-200 font-sans">
                  <div className="bg-amber-600 text-white p-4 flex justify-between items-center border-b border-amber-700">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-300" />
                      <h3 className="font-bold text-xs font-muol leading-loose">
                        ទិន្នន័យមិនទាន់បានរក្សាទុក (Unsaved Changes)
                      </h3>
                    </div>
                  </div>
                  <div className="p-5 space-y-3 text-xs leading-relaxed">
                    <p className="font-bold text-slate-800 text-[12px]">
                      ទិន្នន័យដែលអ្នកបានបំពេញ មិនទាន់ត្រូវបានរក្សាទុកទេ។ តើអ្នកចង់ចាកចេញពិតប្រាកដមែនទេ?
                    </p>
                    <p className="text-slate-550 text-[11px] leading-relaxed font-sans">
                      You have unsaved changes in the licensing registration form. If you leave now, your input will be discarded.
                    </p>
                    <div className="flex justify-end gap-2 pt-3 border-t font-sans">
                      <button
                        type="button"
                        onClick={() => setShowUnsavedConfirm(false)}
                        className="p-2 px-4 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer border-0"
                      >
                        បន្តកែប្រែ (Stay & Edit)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowUnsavedConfirm(false);
                          resetForm();
                        }}
                        className="p-2 px-4 text-[10px] font-bold text-white bg-red-650 hover:bg-red-700 rounded transition-colors cursor-pointer border-0"
                      >
                        ចាកចេញដោយមិនរក្សាទុក (Discard & Leave)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clear Form Confirmation Dialog */}
            {showClearFormModal && (
              <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white text-slate-800 rounded-2xl max-w-sm w-full border border-slate-300 overflow-hidden shadow-2xl animate-fade-in duration-200 font-sans">
                  <div className="bg-[#353C96] text-white p-4 flex justify-between items-center border-b border-[#2D327F]">
                    <div className="flex items-center gap-2">
                      <Trash2 className="h-5 w-5 text-yellow-300" />
                      <h3 className="font-bold text-xs font-muol leading-loose">
                        សម្អាតទម្រង់ (Clear Form)
                      </h3>
                    </div>
                  </div>
                  <div className="p-5 space-y-3 text-xs leading-relaxed">
                    <p className="font-bold text-slate-800 text-[12px]">
                      តើអ្នកពិតជាចង់សម្អាតទិន្នន័យទាំងអស់ក្នុងទម្រង់នេះមែនទេ?
                    </p>
                    <p className="text-slate-550 text-[11px] leading-relaxed font-sans">
                      Are you sure you want to clear all data in this form?
                    </p>
                    <div className="flex justify-end gap-2 pt-3 border-t font-sans">
                      <button
                        type="button"
                        onClick={() => setShowClearFormModal(false)}
                        className="p-2 px-4 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer border-0"
                      >
                        បោះបង់ (Cancel)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearAllFormInputs();
                          setShowClearFormModal(false);
                          toastMsg('បានសម្អាតទម្រង់ / Cleared form.', 'success');
                        }}
                        className="p-2 px-4 text-[10px] font-bold text-white bg-red-650 hover:bg-red-700 rounded transition-colors cursor-pointer border-0"
                      >
                        សម្អាតទម្រង់ (Clear Form)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Back Button & Top Navigation Area */}
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBackClick}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-705 hover:text-slate-950 font-sans text-xs font-bold rounded-lg border border-[#CBD5E1] shadow-xs cursor-pointer hover:bg-slate-50 transition-colors active:scale-95 leading-none"
              >
                <ArrowLeft className="h-4 w-4 text-slate-550" />
                <span>ត្រឡប់ទៅបញ្ជីអាជ្ញាប័ណ្ណ (Back to License Registry)</span>
              </button>
            </div>

            {/* Official Cambodian National Logo Header & Back to List Banner */}
            <div className="bg-nmc-header text-white p-6 rounded-xl border border-[#3F7C9B]/30 shadow-md mb-6" id="form-top-header" style={{ backgroundColor: '#4F6F8D' }}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 bg-yellow-400/10 text-yellow-300 border border-yellow-400/30 font-black text-[9.5px] p-1 px-2 rounded-full uppercase tracking-wider font-sans leading-none">
                    NMC Official Form
                  </span>
                  <h2 className="text-base md:text-lg font-bold font-muol leading-loose text-yellow-300">
                    {editingLicense ? 'កែសម្រួលព័ត៌មានអាជ្ញាប័ណ្ណសហគ្រាស (Edit Enterprise License)' : 'ចុះបញ្ជីអាជ្ញាប័ណ្ណថ្មី'}
                  </h2>
                  <p className="text-[11px] text-slate-100 font-sans leading-relaxed">
                    បំពេញព័ត៌មានក្រុមហ៊ុន ឬសហគ្រាសសម្រាប់បង្កើតអាជ្ញាប័ណ្ណអេឡិចត្រូនិក / Complete company/enterprise information to generate an electronic license certificate.
                  </p>
                </div>
                
                {/* Download PDF button shortcut if editing */}
                {editingLicense && (
                  <button
                    type="button"
                    onClick={() => handleDownloadPDF(editingLicense)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#168A2F] hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all border border-emerald-600 active:scale-95 shadow cursor-pointer self-start md:self-center"
                  >
                    <Download className="h-4 w-4 text-white animate-bounce" />
                    <span>ទាញយកវិញ្ញាបនបត្រ PDF</span>
                  </button>
                )}
              </div>
            </div>

            {/* Progress Step Navigator */}
            <div className="bg-white text-slate-800 border border-[#C9D2E3] rounded-xl p-4 mb-6 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 mb-3 border-b border-slate-150 pb-2">
                <Clock className="h-4 w-4 text-[#353C96] animate-pulse" />
                <span className="font-sans text-[11px] font-bold text-slate-800">លំដាប់លំដោយទម្រង់ចុះបញ្ជីជាជំហានៗ / Government Registration Steps</span>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-left">
                {formSteps.map((step, idx) => {
                  const stepNum = idx + 1;
                  const isActive = activeFormStep === stepNum;
                  const isCompleted = isStepCompleted(idx);
                  
                  let circleBgClass = '';
                  let containerBorderClass = '';
                  let containerBgClass = '';
                  let textKhClass = '';
                  let textEnClass = '';
                  
                  if (isActive) {
                    circleBgClass = 'bg-[#353C96] text-white border-[#353C96] font-extrabold shadow-sm';
                    containerBorderClass = 'border-[#353C96] ring-2 ring-[#353C96]/20';
                    containerBgClass = 'bg-blue-50/70 font-black';
                    textKhClass = 'text-[#1F2D5A] font-bold';
                    textEnClass = 'text-[#353C96] font-semibold';
                  } else if (isCompleted) {
                    circleBgClass = 'bg-[#353C96]/10 text-[#353C96] border-[#353C96]/30';
                    containerBorderClass = 'border-blue-200';
                    containerBgClass = 'bg-blue-50/10';
                    textKhClass = 'text-blue-800 font-semibold';
                    textEnClass = 'text-blue-650/90';
                  } else {
                    circleBgClass = 'bg-slate-50 border border-slate-300 text-slate-500 group-hover:border-blue-450 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors duration-200';
                    containerBorderClass = 'border-slate-200 group-hover:border-blue-300';
                    containerBgClass = 'bg-white group-hover:bg-blue-50/30';
                    textKhClass = 'text-slate-600 font-medium group-hover:text-blue-800 transition-colors duration-200';
                    textEnClass = 'text-slate-400 group-hover:text-blue-600 transition-colors duration-200';
                  }

                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => {
                        setActiveFormStep(stepNum);
                        scrollToSection(step.id);
                      }}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all duration-200 cursor-pointer text-left h-full group ${containerBorderClass} ${containerBgClass}`}
                    >
                      <span className={`flex items-center justify-center text-[10.5px] h-6 w-6 font-black rounded-full border shrink-0 transition-all duration-200 ${circleBgClass}`}>
                        {stepNum}
                      </span>
                      <div className="leading-tight overflow-hidden">
                        <p className={`text-[10px] truncate transition-all duration-200 ${textKhClass}`}>{step.labelKh}</p>
                        <p className={`text-[8.5px] font-sans truncate transition-all duration-200 ${textEnClass}`}>{step.labelEn}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

              {/* Bilingual Error Banner when data has issues */}
              {(() => {
                const missingFs = [];
                if (!companyNameKh) missingFs.push("ឈ្មោះសហគ្រាស (ខ្មែរ)");
                if (!companyName) missingFs.push("ឈ្មោះសហគ្រាស (English)");
                if (!licenseNumber) missingFs.push("លេខអាជ្ញាប័ណ្ណអាជីវកម្ម");
                if (!licenseOwnerName) missingFs.push("ឈ្មោះតំណាងស្របច្បាប់");
                if (!licenseIssueDate) missingFs.push("កាលបរិច្ឆេទចេញអាជ្ញាប័ណ្ណ");
                if (!licenseExpiryDate) missingFs.push("កាលបរិច្ឆេទផុតកំណត់");

                const isDupNumber = licenseNumber && licenses.some(lic => 
                  lic.license_number.trim().toLowerCase() === licenseNumber.trim().toLowerCase() && 
                  lic.id !== (editingLicense?.id || '')
                );
                const isInvalidDates = licenseIssueDate && licenseExpiryDate && new Date(licenseExpiryDate) <= new Date(licenseIssueDate);

                const hasError = showValidationErrors && (missingFs.length > 0 || isDupNumber || isInvalidDates);

                if (hasError) {
                  return (
                    <div className="bg-red-50 border-b border-red-200 p-4 px-6 shrink-0 transition-all font-sans">
                      <div className="flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-red-900 font-extrabold text-[12px]">
                            ⚠️ រកឃើញកំហុសឆ្គងក្នុងការបំពេញទម្រង់សុំចុះបញ្ជី / Registration Validation Errors Detected
                          </p>
                          <ul className="list-disc pl-5 text-[11px] text-red-750 font-medium space-y-1 mt-1.5">
                            {missingFs.length > 0 && (
                              <li>
                                <strong>មិនទាន់បំពេញវាលចាំបាច់៖</strong> សូមបំពេញវាលដែលមានសញ្ញា (*) នាម៖ {missingFs.join(', ')} / <span className="italic text-red-650 font-normal">Missing required fields: {missingFs.map(f => `'${f}'`).join(', ')}.</span>
                              </li>
                            )}
                            {isDupNumber && (
                              <li>
                                <strong>លេខអាជ្ញាប័ណ្ណជាន់គ្នា៖</strong> លេខអាជ្ញាប័ណ្ណ "<strong>{licenseNumber}</strong>" ត្រូវបានចុះបញ្ជីរួចរាល់ហើយក្នុងប្រព័ន្ធ។ សូមពិនិត្យឡើងវិញ / <span className="italic text-red-650 font-normal">License number already exists. Please choose a unique registry number.</span>
                              </li>
                            )}
                            {isInvalidDates && (
                              <li>
                                <strong>កាលបរិច្ឆេទមិនត្រឹមត្រូវ៖</strong> កាលបរិច្ឆេទផុតកំណត់ត្រូវតែនៅក្រោយកាលបរិច្ឆេទចេញអាជ្ញាប័ណ្ណជានិច្ច / <span className="italic text-red-650 font-normal">Expiration date must be strictly after the issue date.</span>
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })()}

              {/* Main Contents Panel (2 columns layout on desktop) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-6 w-full">
                
                {/* Scrollable Form Cards Left Side */}
                <div className="col-span-1 lg:col-span-12 space-y-6">
                  
                  {/* Top info notice */}
                  <div className="bg-[#F5F7FB] border border-[#C9D2E3] p-4 rounded-xl text-xs leading-relaxed text-[#353C96] font-sans flex gap-3.5 items-start shadow-xs">
                    <Info className="h-5 w-5 text-[#353C96] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[12.5px] flex items-center gap-1">
                        <span>📌 ព័ត៌មានចុះបញ្ជី និងការបង្កើតគណនីសហគ្រាស</span>
                      </p>
                      <p className="mt-1 text-[#2D327F] text-[11px] leading-relaxed">
                        ការបង្កើតអាជ្ញាប័ណ្ណនេះនឹងចុះបញ្ជីទិន្នន័យជាមួយប្រព័ន្ធស្វ័យប្រវត្ត។ ទន្ទឹមនឹងនេះ គណនីចូលប្រើប្រាស់នឹងត្រូវបង្កើតជូនសហគ្រាសនេះភ្លាមៗ ដើម្បីប្រើសម្រាប់ផ្ញើរបាយការណ៍បច្ចេកទេសប្រចាំខែ និងការបង់ប្រាក់សេវាផ្សេងៗ។
                      </p>
                    </div>
                  </div>

                  {/* FORM WRAPPER */}
                  <form onSubmit={handleSaveLicenseSubmit} id="nmc-active-license-form" className="space-y-6">
                    
                    {/* SECTION 1: COMPANY / ENTERPRISE INFORMATION */}
                    <div id="sec-company" className="bg-white border border-[#C9D2E3] rounded-xl overflow-hidden shadow-xs transition-colors hover:border-[#353C96]/60">
                      <div className="bg-[#353C96] text-white p-3.5 px-4 flex items-center justify-between border-b border-[#2D327F]">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4.5 w-4.5 text-yellow-300" />
                          <h4 className="font-bold text-[11px] md:text-xs font-muol tracking-wide text-white">
                            ផ្នែកទី ១៖ ព័ត៌មានក្រុមហ៊ុន / សហគ្រាស (Company / Enterprise Information)
                          </h4>
                        </div>
                        <span className="bg-white/10 text-white text-[9px] font-bold p-0.5 px-2 rounded-full font-mono">SEC. 1</span>
                      </div>

                      <div className="p-5 space-y-4 font-sans">
                        
                        {/* Company Linking selector (only on write state) */}
                        {!editingLicense && (
                          <div className="border bg-[#F5F7FB] border-[#C9D2E3] p-4 rounded-lg space-y-1.5">
                            <label className="text-[11.5px] font-black text-[#353C96] flex items-center gap-1.5">
                              <UserCheck className="h-4 w-4 text-[#353C96]" />
                              <span>ភ្ជាប់ជាមួយគណនីសហគ្រាសដែលមានស្រាប់ (Link with Existing Registered Account)</span>
                            </label>
                            <p className="text-[10px] text-[#5B6785] leading-normal font-semibold">
                              ជ្រើសរើសក្រុមហ៊ុនដែលមានគណនីរួចស្រាប់ដើម្បីបំពេញទិន្នន័យស្វ័យប្រវត្ត ឬជ្រើសរើសជម្រើសខាងក្រោមដើម្បីបង្កើតថ្មី។
                            </p>
                            <select
                              value={companyUserId}
                              onChange={(e) => handleCompanyUserChange(e.target.value)}
                              className="w-full text-xs p-2.5 bg-white border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-bold text-[#1F2A44]"
                            >
                              <option value="">-- បង្កើតសហគ្រាសថ្មីទាំងស្រុង (Manual Input & Auto Create Account) --</option>
                              {usersList.filter(u => u.role === 'company').map(u => (
                                <option key={u.id} value={u.id}>
                                  🏢 {u.company_name_kh} {u.license_number ? `(លេខអាជ្ញាប័ណ្ណ៖ ${u.license_number})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Company name Khmer */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] flex items-center gap-1">
                              ឈ្មោះសហគ្រាស / ក្រុមហ៊ុន (ភាសាខ្មែរ) <span className="text-[#DC2626] font-bold">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={companyNameKh}
                              onChange={(e) => setCompanyNameKh(e.target.value)}
                              placeholder="ឧ. សហគ្រាសផលិតទឹកស្អាត ឡុង ឡៃ"
                              className={`w-full text-xs p-3 border rounded-lg focus:outline-hidden font-sans font-bold text-[#1F2A44] transition-all ${
                                showValidationErrors && !companyNameKh
                                  ? 'border-[#DC2626] bg-red-50/10 focus:ring-1 focus:ring-[#DC2626] focus:border-[#DC2626] animate-pulse'
                                  : 'border-[#C9D2E3] focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96]'
                              }`}
                            />
                            {showValidationErrors && !companyNameKh && (
                              <p className="text-[10px] text-[#DC2626] font-medium">⚠ សូមបញ្ចូលឈ្មោះសហគ្រាសជាភាសាខ្មែរ / Please enter Khmer business name.</p>
                            )}
                          </div>

                          {/* Company name English */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] flex items-center gap-1">
                              ឈ្មោះសហគ្រាស / ក្រុមហ៊ុន (English) <span className="text-[#DC2626] font-bold">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={companyName}
                              onChange={(e) => setCompanyName(e.target.value)}
                              placeholder="e.g. LONG LAY WATER PRODUCTION ENTERPRISE"
                              className={`w-full text-xs p-3 border rounded-lg focus:outline-hidden font-sans font-semibold uppercase text-[#1F2A44] transition-all ${
                                showValidationErrors && !companyName
                                  ? 'border-[#DC2626] bg-red-50/10 focus:ring-1 focus:ring-[#DC2626] focus:border-[#DC2626] animate-pulse'
                                  : 'border-[#C9D2E3] focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96]'
                              }`}
                            />
                            {showValidationErrors && !companyName && (
                              <p className="text-[10px] text-[#DC2626] font-medium">⚠ សូមបញ្ចូលឈ្មោះសហគ្រាសជាអក្សរឡាតាំង / Please enter English business name.</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* License number */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] flex items-center gap-1">
                              លេខអាជ្ញាប័ណ្ណអាជីវកម្ម (Business License Number) <span className="text-[#DC2626] font-bold">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={licenseNumber}
                              onChange={(e) => setLicenseNumber(e.target.value)}
                              placeholder="ឧ. LIC-NMC-2026M"
                              className={`w-full text-xs p-3 border rounded-lg font-mono font-bold text-[#2D327F] focus:outline-hidden transition-all ${
                                showValidationErrors && (!licenseNumber || licenses.some(lic => lic.license_number.trim().toLowerCase() === licenseNumber.trim().toLowerCase() && lic.id !== (editingLicense?.id || '')))
                                  ? 'border-[#DC2626] bg-red-50/10 focus:ring-1 focus:ring-[#DC2626] focus:border-[#DC2626] animate-pulse'
                                  : 'border-[#C9D2E3] focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96]'
                              }`}
                            />
                            {showValidationErrors && !licenseNumber && (
                              <p className="text-[10px] text-[#DC2626] font-medium">⚠ សូមបញ្ចូលលេខអាជ្ញាប័ណ្ណអាជីវកម្ម / Please enter business license number.</p>
                            )}
                            {showValidationErrors && licenseNumber && licenses.some(lic => lic.license_number.trim().toLowerCase() === licenseNumber.trim().toLowerCase() && lic.id !== (editingLicense?.id || '')) && (
                              <p className="text-[10px] text-[#DC2626] font-medium">⚠ លេខអាជ្ញាប័ណ្ណនេះត្រូវបានប្រើប្រាស់រួចហើយ / License number already registered.</p>
                            )}
                          </div>

                          {/* Business type */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ទម្រង់អាជីវកម្ម / សហគ្រាស (Business Type)
                            </label>
                            <input
                              type="text"
                              value={businessType}
                              onChange={(e) => setBusinessType(e.target.value)}
                              placeholder="ឧ. សហគ្រាសឯកបុគ្គល (e.g. Sole Proprietorship)"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] bg-white font-sans font-semibold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Service scope */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              វិសាលភាពសេវាកម្មវាស់វែង (Service Scope)
                            </label>
                            <input
                              type="text"
                              value={serviceScope}
                              onChange={(e) => setServiceScope(e.target.value)}
                              placeholder="ឧ. ការផលិត ដំឡើង និងជួសជុលឧបករណ៍វាស់រាវ"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] bg-white font-sans font-semibold"
                            />
                          </div>

                          {/* Measuring instruments allowed */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ប្រភេទឧបករណ៍វាស់វែងដែលអនុញ្ញាត (Measuring Instruments Allowed)
                            </label>
                            <input
                              type="text"
                              value={measuringInstrumentType}
                              onChange={(e) => setMeasuringInstrumentType(e.target.value)}
                              placeholder="ឧ. Truck Scale, Fuel Dispensers, Platform Balance"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] bg-white font-sans font-semibold"
                            />
                          </div>
                        </div>

                        {/* Contacts */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              លេខទូរស័ព្ទសហគ្រាស (Company Phone Number)
                            </label>
                            <div className="relative">
                              <Smartphone className="absolute left-3 top-3.5 h-4 w-4 text-[#353C96]" />
                              <input
                                type="text"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="ឧ. +855 12 345 678"
                                className="w-full text-xs pl-9 p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-bold text-[#1F2A44] bg-white"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              អ៊ីមែលសហគ្រាស/ក្រុមហ៊ុន (Company Email Address)
                            </label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-[#353C96]" />
                              <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="example@company.com"
                                className="w-full text-xs pl-9 p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] bg-white font-sans font-semibold"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Company Address */}
                        <div className="space-y-1">
                          <label className="text-[12px] font-bold text-[#353C96] block justify-between items-center sm:flex">
                            <span>អាសយដ្ឋានលម្អិតសហគ្រាស (Business Address Details) <span className="text-[#DC2626] font-bold">*</span></span>
                            <span className="text-[10px] text-slate-400 font-medium normal-case sm:mt-0 mt-0.5 block italic">(អាចទាញគែមខាងក្រោមដើម្បីពង្រីកបាន / Drag bottom corner to resize)</span>
                          </label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-[#353C96]" />
                            <textarea
                              value={companyAddress}
                              onChange={(e) => setCompanyAddress(e.target.value)}
                              rows={4}
                              placeholder="លេខផ្ទះ ផ្លូវ សង្កាត់ ខណ្ឌ រាជធានី/ខេត្ត (House #, Street, Sangkat, Khan, Province)"
                              className="w-full text-xs pl-9 pr-3 py-2.5 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] bg-white font-sans font-semibold h-28 min-h-[110px] resize-y shadow-xs"
                            />
                          </div>
                        </div>

                        {/* Interactive Business Map */}
                        <div className="mt-4">
                          <BusinessLocationMap
                            latitude={businessLatitude}
                            longitude={businessLongitude}
                            locationSource={businessLocationSource}
                            onSourceChange={(source) => {
                              setBusinessLocationSource(source);
                              setLocationUpdatedAt(new Date().toISOString());
                            }}
                            onChange={(lat, lon, address) => {
                              setBusinessLatitude(lat);
                              setBusinessLongitude(lon);
                              if (address) {
                                setBusinessGeoAddress(address);
                                if (!companyAddress) {
                                  setCompanyAddress(address);
                                }
                              }
                            }}
                            isLocationLocked={isLocationLocked}
                            setIsLocationLocked={setIsLocationLocked}
                          />
                        </div>

                      </div>
                    </div>

                    {/* SECTION 2: REPRESENTATIVE / OWNER INFORMATION */}
                    <div id="sec-representative" className="bg-white border border-[#C9D2E3] rounded-xl overflow-hidden shadow-xs transition-colors hover:border-[#353C96]/60">
                      <div className="bg-[#353C96] text-white p-3.5 px-4 flex items-center justify-between border-b border-[#2D327F]">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4.5 w-4.5 text-yellow-300" />
                          <h4 className="font-bold text-[11px] md:text-xs font-muol tracking-wide text-white">
                            ផ្នែកទី ២៖ ព័ត៌មានតំណាងស្របច្បាប់សហគ្រាស (Representative / Owner Details)
                          </h4>
                        </div>
                        <span className="bg-white/10 text-white text-[9px] font-bold p-0.5 px-2 rounded-full font-mono">SEC. 2</span>
                      </div>

                      <div className="p-5 space-y-4 font-sans">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ឈ្មោះតំណាងស្របច្បាប់ (Legal Representative Name) <span className="text-[#DC2626] font-bold">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={licenseOwnerName}
                              onChange={(e) => setLicenseOwnerName(e.target.value)}
                              placeholder="ឈ្មោះម្ចាស់អាជ្ញាប័ណ្ណផ្លូវការ"
                              className={`w-full text-xs p-3 border rounded-lg focus:outline-hidden font-sans font-bold text-[#1F2A44] transition-all ${
                                showValidationErrors && !licenseOwnerName
                                  ? 'border-[#DC2626] bg-red-50/10 focus:ring-1 focus:ring-[#DC2626] focus:border-[#DC2626] animate-pulse'
                                  : 'border-[#C9D2E3] focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96]'
                              }`}
                            />
                            {showValidationErrors && !licenseOwnerName && (
                              <p className="text-[10px] text-[#DC2626] font-medium">⚠ សូមបញ្ចូលឈ្មោះតំណាងស្របច្បាប់ / Please enter representative name.</p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              តួនាទី / ឋានៈអ្នកតំណាង (Representative Position)
                            </label>
                            <input
                              type="text"
                              value={licenseOwnerPosition}
                              onChange={(e) => setLicenseOwnerPosition(e.target.value)}
                              placeholder="ឧ. នាយកប្រតិបត្តិ / CEO / អគ្គនាយក"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] bg-white font-sans font-semibold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ថ្ងៃខែឆ្នាំកំណើត (Date of Birth)
                            </label>
                            <input
                              type="date"
                              value={representativeDateOfBirth}
                              onChange={(e) => setRepresentativeDateOfBirth(e.target.value)}
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-sans font-bold text-[#1F2A44] bg-white h-[44px]"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ភេទ (Gender)
                            </label>
                            <select
                              value={representativeGender}
                              onChange={(e) => setRepresentativeGender(e.target.value)}
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-sans font-bold text-[#1F2A44] bg-white h-[44px]"
                            >
                              <option value="">-- ជ្រើសរើសភេទ (Select Gender) --</option>
                              <option value="Male">ប្រុស (Male)</option>
                              <option value="Female">ស្រី (Female)</option>
                              <option value="Other">ផ្សេងៗ (Other)</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              សញ្ជាតិ (Nationality)
                            </label>
                            <input
                              type="text"
                              value={representativeNationality}
                              onChange={(e) => setRepresentativeNationality(e.target.value)}
                              placeholder="ខ្មែរ / Cambodian"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-sans font-semibold text-[#1F2A44] bg-white h-[44px]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              អត្តសញ្ញាណប័ណ្ណ / លិខិតឆ្លងដែន (National ID / Passport)
                            </label>
                            <input
                              type="text"
                              value={licenseOwnerNationalId}
                              onChange={(e) => setLicenseOwnerNationalId(e.target.value)}
                              placeholder="ឧ. ០៩៨៧៦៥៤៣២"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-mono font-bold text-[#1F2A44] bg-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ទូរស័ព្ទផ្ទាល់ខ្លួន (Owner Phone)
                            </label>
                            <input
                              type="text"
                              value={licenseOwnerPhone}
                              onChange={(e) => setLicenseOwnerPhone(e.target.value)}
                              placeholder="ឧ. ០១២ ៣៤៥ ៦៧៨"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-mono font-bold text-[#1F2A44] bg-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              អ៊ីមែលផ្ទាល់ខ្លួន (Owner Email)
                            </label>
                            <input
                              type="email"
                              value={licenseOwnerEmail}
                              onChange={(e) => setLicenseOwnerEmail(e.target.value)}
                              placeholder="owner@company.com"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-sans font-semibold text-[#1F2A44] bg-white"
                            />
                          </div>
                        </div>

                        {/* Owner Photo Avatar Upload Field */}
                        <div className="pt-2 border-t border-[#C9D2E3]/50">
                          <label className="text-[12px] font-bold text-[#353C96] block mb-2">
                            រូបថតផ្ទាល់ខ្លួនរបស់ម្ចាស់ក្រុមហ៊ុន/សហគ្រាស (Owner Photo / Avatar Upload)
                          </label>
                          <div className="flex items-center gap-4 bg-[#F5F7FB] border border-[#C9D2E3] rounded-xl p-4">
                            <div className="relative h-20 w-20 rounded-lg bg-white border border-[#C9D2E3] overflow-hidden shrink-0 flex items-center justify-center text-[#353C96] shadow-2xs">
                              {(photoBase64 || licenseOwnerPhotoUrl) && !photoLoadError ? (
                                <img 
                                  src={photoBase64 || licenseOwnerPhotoUrl} 
                                  alt="Owner Avatar" 
                                  className="h-full w-full object-cover" 
                                  referrerPolicy="no-referrer" 
                                  onError={() => setPhotoLoadError(true)}
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center text-center p-1 text-[#353C96]/40">
                                  <User className="h-8 w-8 text-[#353C96]/40" />
                                  {photoLoadError && (
                                    <span className="text-[7px] text-red-500 font-bold leading-none mt-1">
                                      រូបថតមិនអាចផ្ទុកបានទេ<br/>Photo could not be loaded.
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 space-y-2">
                              <p className="text-[10px] text-[#2D327F] font-bold leading-normal">
                                សូមភ្ជាប់រូបថតបញ្ឈរជាផ្លូវការ បំភ្លឺច្បាស់ ផ្ទៃពណ៌ស ឬខៀវ (ទំហំអតិបរមា 2MB)
                                <span className="block text-[#5B6785] font-normal font-sans text-[9px] mt-0.5">Please attach a formal portrait photo (Max: 2MB, formats: .jpg, .png)</span>
                              </p>
                              <div className="flex gap-2">
                                <label
                                  htmlFor="owner-photo-upload"
                                  style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                                  className="relative inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all shadow-2xs border-0"
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                  <span>ជ្រើសរើសរូបថត / Select Photo</span>
                                </label>
                                <input
                                  id="owner-photo-upload"
                                  type="file"
                                  accept="image/*"
                                  onChange={handlePhotoUpload}
                                  className="hidden"
                                />
                                {(photoBase64 || licenseOwnerPhotoUrl) && (
                                  <button
                                    type="button"
                                    onClick={handleRemovePhoto}
                                    className="px-2.5 py-1.5 border border-red-300 hover:bg-red-50 text-red-600 text-[10px] font-bold rounded-lg cursor-pointer transition-all font-bold"
                                  >
                                    លុបចេញ / Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#F5F7FB] border border-[#C9D2E3] p-3.5 rounded-lg text-[10.5px] leading-relaxed text-[#5B6785] font-sans space-y-1">
                          <p className="font-bold text-[#353C96]">🧑‍💼 សេចក្តីជូនដំណឹងស្តីពីម្ចាស់សហគ្រាស៖</p>
                          <p className="font-semibold text-[#2D327F]">គណនីបច្ចេកទេសសហគ្រាសនឹងត្រូវបានចងភ្ជាប់ជាមួយព័ត៌មានអត្តសញ្ញាណនេះ ដើម្បីងាយស្រួលផ្ទៀងផ្ទាត់ និងទាក់ទងដោយផ្ទាល់ពីមន្ត្រីនៃអគ្គនាយកដ្ឋាន។</p>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3: LICENSE INFORMATION */}
                    <div id="sec-license" className="bg-white border border-[#C9D2E3] rounded-xl overflow-hidden shadow-xs transition-colors hover:border-[#353C96]/60">
                      <div className="bg-[#353C96] text-white p-3.5 px-4 flex items-center justify-between border-b border-[#2D327F]">
                        <div className="flex items-center gap-2">
                          <Award className="h-4.5 w-4.5 text-yellow-300" />
                          <h4 className="font-bold text-[11px] md:text-xs font-muol tracking-wide text-white">
                            ផ្នែកទី ៣៖ ព័ត៌មានអាជ្ញាប័ណ្ណ (License Terms & Expiration Limits)
                          </h4>
                        </div>
                        <span className="bg-white/10 text-white text-[9px] font-bold p-0.5 px-2 rounded-full font-mono">SEC. 3</span>
                      </div>

                      <div className="p-5 space-y-4 font-sans">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Issue Date */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              កាលបរិច្ឆេទចេញអាជ្ញាប័ណ្ណ (License Issue Date) <span className="text-[#DC2626] font-bold">*</span>
                            </label>
                            <input
                              type="date"
                              required
                              value={licenseIssueDate}
                              onChange={(e) => setLicenseIssueDate(e.target.value)}
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-bold text-[#1F2A44] bg-white h-[44px]"
                            />
                          </div>

                          {/* Expiration date */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center mb-0.5">
                              <label className="text-[12px] font-bold text-[#353C96] block">
                                កាលបរិច្ឆេទផុតកំណត់ (Expiration Expiry Date) <span className="text-[#DC2626] font-bold">*</span>
                              </label>
                              
                              <div className="flex items-center gap-1.5 bg-[#F5F7FB] p-0.5 px-2 rounded-full border border-[#C9D2E3]">
                                <input
                                  type="checkbox"
                                  id="customExpiryChecked"
                                  checked={customExpiry}
                                  onChange={(e) => setCustomExpiry(e.target.checked)}
                                  className="h-3 w-3 rounded text-[#353C96] focus:ring-[#353C96] cursor-pointer pointer-events-auto"
                                />
                                <label htmlFor="customExpiryChecked" className="text-[9.5px] text-[#353C96] font-bold cursor-pointer select-none">កែប្រែដោយដៃ</label>
                              </div>
                            </div>
                            
                            <input
                              type="date"
                              required
                              disabled={!customExpiry}
                              value={licenseExpiryDate}
                              onChange={(e) => setLicenseExpiryDate(e.target.value)}
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden disabled:bg-[#F5F7FB] disabled:text-[#5B6785] font-bold text-[#1F2A44] h-[44px]"
                            />
                            {!customExpiry && (
                              <p className="text-[10px] text-[#5B6785] italic mt-0.5 leading-tight font-semibold">គណនាស្វ័យប្រវត្តិ ៣ ឆ្នាំដក ១ ថ្ងៃ / Auto-computed 3 years based on National Metrology requirements.</p>
                            )}
                          </div>
                        </div>

                        {/* Live validity preview card */}
                        <div className="bg-[#F5F7FB] border border-[#C9D2E3] rounded-xl p-4 space-y-3">
                          <p className="text-[10px] text-[#353C96] font-extrabold uppercase tracking-wider font-sans">ការបង្ហាញគំនិតវិភាគបឋម / Live Validity Status Indicator</p>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-white border border-[#C9D2E3] p-2 px-3 rounded-lg flex flex-col justify-center">
                              <span className="text-[10px] text-[#5B6785] block font-bold leading-normal">Issue Date / ការចេញ</span>
                              <span className="font-mono text-xs font-black text-[#1F2A44] mt-0.5">{licenseIssueDate || '---'}</span>
                            </div>
                            <div className="bg-white border border-[#C9D2E3] p-2 px-3 rounded-lg flex flex-col justify-center">
                              <span className="text-[10px] text-[#5B6785] block font-bold leading-normal">Expiry Date / ផុតកំណត់</span>
                              <span className="font-mono text-xs font-black text-[#1F2A44] mt-0.5">{licenseExpiryDate || '---'}</span>
                            </div>
                            <div className="bg-white border border-[#C9D2E3] p-2 px-3 rounded-lg flex flex-col justify-center">
                              <span className="text-[10px] text-[#5B6785] block font-bold leading-normal">Validity / រយៈពេល</span>
                              <span className="text-xs font-black text-[#353C96] mt-0.5">៣ ឆ្នាំ (3 Years)</span>
                            </div>
                            <div className={`border p-2 px-3 rounded-lg flex flex-col justify-center font-sans font-bold text-center ${dateStatus.colorClass}`}>
                              <span className="text-[10px] block leading-normal opacity-80">Days Left / សល់</span>
                              <span className="font-mono text-[11px] font-black leading-tight mt-0.5 uppercase">
                                {dateStatus.days !== null ? `${dateStatus.days} ថ្ងៃ (${dateStatus.days < 0 ? 'Overdue' : 'Days'})` : 'No dates'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Notes / Official annotations */}
                        <div className="space-y-1">
                          <label className="text-[12px] font-bold text-[#353C96] block">
                            កំណត់សម្គាល់បន្ថែមពីមន្ត្រី (Official Notes & Annotations)
                          </label>
                          <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="កំណត់ត្រាបន្ថែមស្តីពីការត្រួតពិនិត្យ ឧបករណ៍ ឬលក្ខខណ្ឌពិសេស..."
                            className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] bg-white h-[44px] font-semibold"
                          />
                        </div>

                      </div>
                    </div>

                    {/* SECTION 4: SERVICE FEE / PAYMENT */}
                    <div id="sec-payment" className="bg-white border border-[#C9D2E3] rounded-xl overflow-hidden shadow-xs transition-colors hover:border-[#353C96]/60">
                      <div className="bg-[#353C96] text-white p-3.5 px-4 flex items-center justify-between border-b border-[#2D327F]">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4.5 w-4.5 text-yellow-300" />
                          <h4 className="font-bold text-[11px] md:text-xs font-muol tracking-wide text-white">
                            ផ្នែកទី ៤៖ ព័ត៌មានតម្លៃសេវា និងការបង់ប្រាក់ (Service Fee / Payment Information)
                          </h4>
                        </div>
                        <span className="bg-white/10 text-white text-[9px] font-bold p-0.5 px-2 rounded-full font-mono">SEC. 4</span>
                      </div>

                      <div className="p-5 space-y-4 font-sans">
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Payment amount */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              តម្លៃសេវាអាជ្ញាប័ណ្ណ (Service Fee Amount)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-3.5 text-xs font-extrabold text-[#353C96] font-mono">
                                {serviceFeeCurrency === 'USD' ? '$' : '៛'}
                              </span>
                              <input 
                                type="number"
                                value={serviceFee}
                                onChange={(e) => setServiceFee(e.target.value)}
                                placeholder="ឧ. 150"
                                className="w-full text-xs pl-7 p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#15803D] font-extrabold font-mono h-[44px] bg-white"
                              />
                            </div>
                          </div>

                          {/* Currency select */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              រូបិយប័ណ្ណផ្លូវការ (Allowed Currency)
                            </label>
                            <select
                              value={serviceFeeCurrency}
                              onChange={(e) => setServiceFeeCurrency(e.target.value)}
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] text-[#1F2A44] font-bold bg-white h-[44px]"
                            >
                              <option value="USD">USD ($) - ដុល្លារអាមេរិក</option>
                              <option value="KHR">KHR (៛) - រៀលខ្មែរ</option>
                            </select>
                          </div>

                          {/* Payment status select */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ស្ថានភាពការបង់ប្រាក់ (Payment Status)
                            </label>
                            <select
                              value={paymentStatus}
                              onChange={(e) => setPaymentStatus(e.target.value)}
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] text-[#1F2A44] font-bold bg-white h-[44px]"
                            >
                              <option value="Paid">✓ បានបង់ប្រាក់ទាំងស្រុង (Paid & Settled)</option>
                              <option value="Pending">⌛ រង់ចាំការផ្ទៀងផ្ទាត់ (Pending Verification)</option>
                              <option value="Refunded">↺ បានបង្វិលសងវិញ (Refunded)</option>
                              <option value="Cancelled">✗ ត្រូវបានលុបចោល (Cancelled / Unpaid)</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Payment Reference */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              លេខយោងវិក្កយបត្របង់ប្រាក់ (Invoice / Voucher Reference #)
                            </label>
                            <input 
                              type="text"
                              value={paymentReference}
                              onChange={(e) => setPaymentReference(e.target.value)}
                              placeholder="ឧ. INV-NMC-23423 OR ABA Transaction ID"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] font-mono font-bold h-[44px] bg-white"
                            />
                          </div>

                          {/* Payment Date */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              កាលបរិច្ឆេទបង់ប្រាក់ (Payment Date)
                            </label>
                            <input 
                              type="date"
                              value={paymentDate}
                              onChange={(e) => setPaymentDate(e.target.value)}
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] font-bold h-[44px] bg-white"
                            />
                          </div>
                        </div>

                        {/* Payment notes */}
                        <div className="space-y-1">
                          <label className="text-[12px] font-bold text-[#353C96] block">
                            កំណត់សម្គាល់ការទូទាត់ប្រាក់ (Payment Annotation Notes)
                          </label>
                          <input 
                            type="text"
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            placeholder="បញ្ជាក់ការត្រួតពិនិត្យ ឈ្មោះធនាគារ ឬសេចក្តីលម្អិតបន្ថែម..."
                            className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden text-[#1F2A44] h-[44px] bg-white font-semibold"
                          />
                        </div>

                        <div className="bg-[#F5F7FB] border border-[#C9D2E3] p-3.5 rounded-lg text-emerald-850 space-y-1 text-[11px] leading-relaxed">
                          <p className="font-extrabold flex items-center gap-1.5 text-[#353C96]">
                            <Check className="h-4 w-4 text-[#353C96] shrink-0" />
                            <span>ការបង់ប្រាក់សេវាត្រូវបានអនុញ្ញាត និងផ្ទៀងផ្ទាត់ដោយប្រព័ន្ធ (Official treasury validation)</span>
                          </p>
                          <p className="text-[#2D327F] text-[10.5px] font-semibold">
                            រាល់អាជ្ញាប័ណ្ណដែលចេញផ្សាយ និងមានលេខសម្គាល់ត្រូវបានចាត់ទុកជាការបង់ថ្លៃរួចរាល់ និងមានសុពលភាពស្របច្បាប់រហូតដល់ផុតកំណត់។
                          </p>
                        </div>

                      </div>
                    </div>

                    {/* SECTION 5: CLIENT PORTAL ACCOUNT */}
                    <div id="sec-account" className="bg-white border border-[#C9D2E3] rounded-xl overflow-hidden shadow-xs transition-colors hover:border-[#353C96]/60">
                      <div className="bg-[#353C96] text-white p-3.5 px-4 flex items-center justify-between border-b border-[#2D327F]">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4.5 w-4.5 text-yellow-300" />
                          <h4 className="font-bold text-[11px] md:text-xs font-muol tracking-wide text-white">
                            ផ្នែកទី ៥៖ គណនីចូលប្រព័ន្ធប្រើប្រាស់ (Client Portal Accounts Credentials)
                          </h4>
                        </div>
                        <span className="bg-white/10 text-white text-[9px] font-bold p-0.5 px-2 rounded-full font-mono">SEC. 5</span>
                      </div>

                      <div className="p-5 space-y-4 font-sans">
                        
                        <div className="bg-[#F5F7FB] border border-[#C9D2E3] p-4 rounded-xl text-[#353C96] text-xs leading-relaxed space-y-1 flex gap-3 shadow-xs">
                          <Info className="h-5 w-5 text-[#353C96] shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-[11.5px]">🔑 គណនីប្រើប្រាស់របស់សហគ្រាសក្នុងប្រព័ន្ធ៖</p>
                            <p className="mt-0.5 text-[10.5px] text-[#2D327F] leading-relaxed font-bold">
                              «គណនីនេះប្រើសម្រាប់ឱ្យសហគ្រាសចូលប្រព័ន្ធ និងបញ្ចូលរបាយការណ៍ប្រចាំខែ។ / This account is used by the enterprise to access the system and submit monthly reports.»
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Portal username */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              ឈ្មោះគណនីចូលប្រើប្រាស់ (Client Username) <span className="text-[#DC2626] font-bold">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder="ឧ. l_lai_co"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-mono font-bold text-[#1F2A44] bg-white h-[44px]"
                            />
                          </div>

                          {/* Portal password */}
                          <div className="space-y-1">
                            <label className="text-[12px] font-bold text-[#353C96] block">
                              លេខសម្ងាត់គណនី (Client Account Password) <span className="text-[#DC2626] font-bold">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="បញ្ចូលលេខសម្ងាត់"
                              className="w-full text-xs p-3 border border-[#C9D2E3] rounded-lg focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-mono font-bold text-[#1F2A44] bg-white h-[44px]"
                            />
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* SECTION 6: SUPPORTING DOCUMENTS */}
                    <div id="sec-docs" className="bg-white border border-[#C9D2E3] rounded-xl overflow-hidden shadow-xs transition-colors hover:border-[#353C96]/60">
                      <div className="bg-[#353C96] text-white p-3.5 px-4 flex items-center justify-between border-b border-[#2D327F]">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4.5 w-4.5 text-yellow-300" />
                          <h4 className="font-bold text-[11px] md:text-xs font-muol tracking-wide text-white">
                            ផ្នែកទី ៦៖ ឯកសារយោង និងលិខិតសម្រេចភ្ជាប់ (Supporting Reference Documents)
                          </h4>
                        </div>
                        <span className="bg-white/10 text-white text-[9px] font-bold p-0.5 px-2 rounded-full font-mono">SEC. 6</span>
                      </div>

                      <div className="p-5 space-y-4 font-sans">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <span className="text-[14px] font-extrabold text-[#353C96] block">ឯកសារយោង / Reference Documents</span>
                            <span className="block text-[10.5px] text-[#5B6785] font-sans mt-0.5 font-semibold">
                              សូមភ្ជាប់ឯកសារពិគ្រោះ វិញ្ញាបនបត្រ ឬលិខិតសម្រេចពាក់ព័ន្ធ (ទំហំអតិបរមា 5MB ក្នុងមួយឯកសារ) / Please attach application files, company certificates or official receipts (Max 5MB each).
                            </span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={handleAddAttachmentRow}
                            className="bg-[#353C96] hover:bg-[#2D327F] text-white px-3 py-1.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0 shadow-2xs self-start md:self-center h-[34px]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>បន្ថែមឯកសារយោង / Add supporting file</span>
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-[#C9D2E3] rounded-xl shadow-3xs">
                          <table className="w-full text-xs text-left border-collapse bg-white leading-normal font-sans">
                            <thead>
                              <tr className="bg-slate-50 border-b border-[#C9D2E3] text-[#353C96] font-bold">
                                <th className="p-3 text-center w-[40px] border-r border-[#C9D2E3]">ល.រ</th>
                                <th className="p-3 w-[260px] border-r border-[#C9D2E3]">ប្រភេទឯកសារយោង (Document Type)</th>
                                <th className="p-3 w-[150px] border-r border-[#C9D2E3]">លេខឯកសារ</th>
                                <th className="p-3 w-[150px] border-r border-[#C9D2E3]">កាលបរិច្ឆេទ</th>
                                <th className="p-3 border-r border-[#C9D2E3]">ឯកសារភ្ជាប់ (Attachment)</th>
                                <th className="p-3 text-center w-[80px]">ជម្រើស</th>
                              </tr>
                            </thead>
                            <tbody>
                              {formAttachments.filter(att => !att.isDeleted).map((att, idx) => (
                                <tr key={att.id} className="border-b border-slate-200 hover:bg-slate-50/50 transition-colors">
                                  <td className="p-3 text-center font-bold text-[#353C96] border-r border-slate-200 bg-slate-50/20">{idx + 1}</td>
                                  
                                  {/* Document Type input / select dropdown */}
                                  <td className="p-2 border-r border-slate-200">
                                    <select
                                      value={
                                        ["ពាក្យស្នើសុំអាជ្ញាប័ណ្ណ", "វិញ្ញាបនបត្រចុះបញ្ជីក្រុមហ៊ុន", "អត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែនម្ចាស់សហគ្រាស", "ឯកសារបញ្ជាក់ទីតាំងអាជីវកម្ម", "បង្កាន់ដៃបង់ប្រាក់ / វិក្កយបត្រ", "ឯកសារបច្ចេកទេស", "ផ្សេងៗ"].includes(att.document_type)
                                          ? att.document_type
                                          : 'ផ្សេងៗ'
                                      }
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        handleUpdateAttachmentRow(att.id, 'document_type', val);
                                      }}
                                      className="w-full text-[11px] p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#353C96] font-semibold text-[#1F2A44] bg-white h-[36px]"
                                    >
                                      <option value="ពាក្យស្នើសុំអាជ្ញាប័ណ្ណ">ពាក្យស្នើសុំអាជ្ញាប័ណ្ណ (License Application Form)</option>
                                      <option value="វិញ្ញាបនបត្រចុះបញ្ជីក្រុមហ៊ុន">វិញ្ញាបនបត្រចុះបញ្ជីក្រុមហ៊ុន (Company Registration)</option>
                                      <option value="អត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែនម្ចាស់សហគ្រាស">អត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែន (Owner ID/Passport)</option>
                                      <option value="ឯកសារបញ្ជាក់ទីតាំងអាជីវកម្ម">ឯកសារបញ្ជាក់ទីតាំងអាជីវកម្ម (Location Proof)</option>
                                      <option value="បង្កាន់ដៃបង់ប្រាក់ / វិក្កយបត្រ">បង្កាន់ដៃបង់ប្រាក់ / វិក្កយបត្រ (Payment Receipt)</option>
                                      <option value="ឯកសារបច្ចេកទេស">ឯកសារបច្ចេកទេស (Technical Spec)</option>
                                      <option value="ផ្សេងៗ">ផ្សេងៗ (Other Support Attachment)</option>
                                    </select>
                                    
                                    {!["ពាក្យស្នើសុំអាជ្ញាប័ណ្ណ", "វិញ្ញាបនបត្រចុះបញ្ជីក្រុមហ៊ុន", "អត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែនម្ចាស់សហគ្រាស", "ឯកសារបញ្ជាក់ទីតាំងអាជីវកម្ម", "បង្កាន់ដៃបង់ប្រាក់ / វិក្កយបត្រ", "ឯកសារបច្ចេកទេស"].includes(att.document_type) && (
                                      <input
                                        type="text"
                                        placeholder="បញ្ចូលឈ្មោះប្រភេទឯកសារ / Enter other type"
                                        value={att.document_type}
                                        onChange={(e) => handleUpdateAttachmentRow(att.id, 'document_type', e.target.value)}
                                        className="w-full text-[11px] mt-1.5 p-1 px-2 border border-[#C9D2E3] rounded-md font-medium text-[#1F2A44] bg-white text-xs"
                                      />
                                    )}
                                  </td>
                                  
                                  {/* Document No */}
                                  <td className="p-2 border-r border-slate-200">
                                    <input
                                      type="text"
                                      placeholder="លេខ / No."
                                      value={att.document_number}
                                      onChange={(e) => handleUpdateAttachmentRow(att.id, 'document_number', e.target.value)}
                                      className="w-full text-[11px] p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#353C96] text-[#1F2A44] font-semibold h-[36px]"
                                    />
                                  </td>

                                  {/* Document Date */}
                                  <td className="p-2 border-r border-slate-200">
                                    <input
                                      type="date"
                                      value={att.document_date || ''}
                                      onChange={(e) => handleUpdateAttachmentRow(att.id, 'document_date', e.target.value)}
                                      className="w-full text-[11px] p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-[#353C96] text-[#1F2A44] font-semibold font-mono h-[36px]"
                                    />
                                  </td>

                                  {/* Attachment Upload / Current Status */}
                                  <td className="p-2 border-r border-slate-200 bg-[#F8FAFC]/30">
                                    {att.file_name ? (
                                      <div className="flex flex-col gap-1 text-[11px] leading-snug">
                                        <div className="flex items-center gap-1.5 font-bold text-[#1F2A44] max-w-[200px] shrink-0">
                                          <FileText className="h-3.5 w-3.5 shrink-0 text-[#353C96]" />
                                          <span className="truncate" title={att.file_name}>{att.file_name}</span>
                                        </div>
                                        {att.file_size > 0 && (
                                          <span className="text-[10px] text-slate-400 font-mono">({(att.file_size / (1024 * 1024)).toFixed(2)} MB)</span>
                                        )}
                                        <span className="text-[9.5px] text-[#15803D] font-bold flex items-center gap-0.5 mt-0.5">
                                          <Check className="h-3 w-3 shrink-0" />
                                          <span>បានភ្ជាប់ជោគជ័យ / Attached</span>
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="relative flex items-center justify-center border-dashed border border-slate-300 rounded-lg p-2 hover:bg-slate-50 transition-colors cursor-pointer bg-white">
                                        <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#353C96]">
                                          <Upload className="h-3.5 w-3.5 shrink-0 text-[#353C96]" />
                                          <span>ភ្ជាប់ឯកសារ / Select File</span>
                                        </div>
                                        <input
                                          type="file"
                                          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleAttachmentFileChange(att.id, file);
                                          }}
                                        />
                                      </div>
                                    )}
                                  </td>

                                  {/* Action options */}
                                  <td className="p-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {att.file_name && (
                                        <button
                                          type="button"
                                          onClick={() => handleClearAttachmentFile(att.id)}
                                          className="p-1 text-amber-600 hover:bg-amber-50 rounded-md border border-amber-200 transition-colors"
                                          title="លុបឯកសារភ្ជាប់តែរក្សាចំណងជើង / Remove file attachment"
                                        >
                                          <RefreshCw className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveAttachmentRow(att.id)}
                                        className="p-1 text-red-500 hover:bg-red-50 rounded-md border border-red-200 transition-colors"
                                        title="លុបបន្ទាត់នេះស្អុយ / Delete document category row"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                      </div>
                    </div>

                  </form>
                </div>

                {/* Right-Side Summary Panel (Col span 4) */}
                <div className="col-span-1 lg:col-span-12 bg-white border border-[#C9D2E3] rounded-xl p-6 shadow-xs flex flex-col justify-between" id="sec-review">
                  
                  <div className="space-y-6">
                    <div className="border-b border-[#C9D2E3] pb-3 flex items-center justify-between">
                      <p className="font-bold text-[12px] font-muol text-[#353C96] flex items-center gap-1.5">
                        <Award className="h-4.5 w-4.5 text-yellow-300" />
                        <span>សង្ខេបព័ត៌មានអាជ្ញាប័ណ្ណ (License Summary)</span>
                      </p>
                      <span className="bg-[#353C96]/10 text-[#353C96] text-[8.5px] font-black uppercase p-0.5 px-1.5 rounded-full">Live Review</span>
                    </div>

                    {/* Summary cards representation */}
                    <div className="bg-[#F5F7FB] border border-[#C9D2E3] rounded-xl p-4 shadow-2xs space-y-4">
                      
                      {/* Logo avatar of owner */}
                      <div className="flex items-center gap-3 border-b border-[#C9D2E3]/50 pb-3">
                        <div className="h-12 w-12 rounded-lg bg-white border border-[#C9D2E3] overflow-hidden shrink-0 flex items-center justify-center text-[#353C96] shadow-2xs">
                          {photoBase64 ? (
                            <img src={photoBase64} alt="Company Logo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Building2 className="h-6 w-6 text-[#353C96]/60" />
                          )}
                        </div>
                        <div className="overflow-hidden leading-tight">
                          <p className="text-[9px] text-[#5B6785] font-extrabold uppercase">អ្នកកាន់កាប់ / Licensee Holder</p>
                          <p className="text-xs font-black text-[#1F2A44] truncate" title={companyName || undefined}>{companyName || '(មិនទាន់បំពេញក្រុមហ៊ុន)'}</p>
                          <p className="text-[10px] text-[#2D327F] truncate font-bold" title={licenseOwnerName || undefined}>ដោយ៖ {licenseOwnerName || 'មិនទាន់បញ្ជាក់'} ({licenseOwnerPosition || 'CEO'})</p>
                        </div>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-1 gap-2.5 text-[11px] leading-relaxed">
                        
                        <div>
                          <span className="text-[10px] text-[#5B6785] block font-bold leading-none">លេខអាជ្ញាប័ណ្ណ / License Number:</span>
                          <span className="font-mono font-bold text-[#1F2A44] text-xs">{licenseNumber || '---'}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#C9D2E3]/50">
                          <div>
                            <span className="text-[10px] text-[#5B6785] block font-bold leading-none">Issue Date / ចេញផ្សាយ៖</span>
                            <span className="font-mono font-extrabold text-[#1F2A44]">{licenseIssueDate || 'Not selected'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#5B6785] block font-bold leading-none">Expiry / ផុតកំណត់៖</span>
                            <span className="font-mono font-extrabold text-[#1F2A44]">{licenseExpiryDate || 'Not calculated'}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#C9D2E3] grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-[#5B6785] block font-bold leading-none">Service Fee / តម្លៃសេវា៖</span>
                            <span className="font-mono text-xs font-black text-[#15803D]">{serviceFee ? `${serviceFeeCurrency === 'USD' ? '$' : '៛'}${Number(serviceFee).toFixed(2)}` : '---'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#5B6785] block font-bold leading-none">Receipt / ការទូទាត់៖</span>
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-white bg-[#15803D] px-1.5 rounded border border-[#15803D] mt-0.5 uppercase">Approved</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#C9D2E3]">
                          <span className="text-[10px] text-[#5B6785] block font-bold leading-none">Portal Credentials / គណនីប្រើប្រាស់៖</span>
                          <span className="font-mono text-[10.5px] text-[#353C96] font-bold block truncate">
                            {username ? `👤 ${username} | 🔑 ${'*'.repeat(password.length || 6)}` : 'No portal account generated'}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-[#C9D2E3] grid grid-cols-2 gap-2 font-bold text-[10px]">
                          <div>
                            <span className="text-[9.5px] text-[#5B6785] block font-medium leading-none">Photo Avatar:</span>
                            <span className={photoBase64 ? 'text-[#15803D]' : 'text-[#5B6785]'}>{photoBase64 ? '✓ Loaded (Yes)' : '✗ No Photo'}</span>
                          </div>
                          <div>
                            <span className="text-[9.5px] text-[#5B6785] block font-medium leading-none">Attached Ref:</span>
                            <span className={attachedDocName ? 'text-[#15803D] truncate block' : 'text-[#5B6785] block'}>
                              {attachedDocName ? `✓ ${attachedDocName}` : '✗ No Documents'}
                            </span>
                          </div>
                        </div>

                      </div>
                    </div>

                    <div className="bg-[#353C96]/5 border border-[#C9D2E3] rounded-xl p-4 text-[10.5px] leading-relaxed text-[#2D327F] space-y-1.5">
                      <p className="font-extrabold text-[#353C96]">🎖️ បញ្ជាក់សិទ្ធិអំណាចមជ្ឈមណ្ឌល NMC:</p>
                      <p className="font-bold text-[#2D327F]">
                        រាល់អាជ្ញាប័ណ្ណទាំងអស់ត្រូវបានរក្សាទុកក្នុងឃ្លាំងទិន្នន័យជាតិ សំរាប់ធ្វើការបញ្ជាក់សិទ្ធិដំណើរការវាស់វែង សេវាកម្មវាស់រាវ និងទំនិញជាក់លាក់។ ក្រុមហ៊ុននឹងទទួលបានសេចក្តីជូនដំណឹងតាម Telegram automatically។
                      </p>
                    </div>
                  </div>

                </div>

              </div>

              {/* STICKY ACTION BAR FOOTER */}
              <div className="bg-white border-t border-slate-250 p-4.5 px-6 flex flex-col sm:flex-row justify-between items-center shrink-0 shadow-sm gap-4">
                
                {/* Left actions */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleBackClick}
                    style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-[#353C96] hover:bg-[#2D327F] text-white text-xs font-black rounded-xl transition-all cursor-pointer pointer-events-auto active:scale-95 border-0 shadow-sm"
                  >
                    ត្រឡប់ទៅបញ្ជីអាជ្ញាប័ណ្ណ / Back to License Registry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowClearFormModal(true);
                    }}
                    style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-[#353C96] hover:bg-[#2D327F] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer pointer-events-auto border-0 shadow-sm"
                  >
                    សម្អាតទម្រង់ / Clear Form
                  </button>
                </div>

                {/* Right actions: Save License with loading states */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {editingLicense && (
                    <button
                      type="button"
                      onClick={() => handleDownloadPDF(editingLicense)}
                      className="w-full sm:w-auto px-4 py-2.5 bg-[#1D4ED8] hover:bg-[#1e40af] text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer pointer-events-auto active:scale-95 flex items-center gap-1.5 justify-center"
                    >
                      <Download className="h-4 w-4 text-gold" />
                      <span>ទាញយកវិញ្ញាបនបត្រ PDF / Download License Certificate</span>
                    </button>
                  )}
                  
                  <button
                    type="submit"
                    form="nmc-active-license-form"
                    disabled={isLoading}
                    style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#353C96] hover:bg-[#2D327F] text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer pointer-events-auto active:scale-95 disabled:bg-slate-350 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-0"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-white" />
                        <span>កំពុងរក្សាទុកអាជ្ញាប័ណ្ណ... / Saving license...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4.5 w-4.5 text-yellow-300" />
                        <span>
                          {editingLicense ? 'រក្សាទុកការផ្លាស់ប្តូរអាជ្ញាប័ណ្ណ / Save License Updates' : 'ចុះបញ្ជីអាជ្ញាប័ណ្ណផ្លូវការ / Save Official License'}
                        </span>
                      </>
                    )}
                  </button>
                </div>

              </div>

              <div className="bg-white px-6 pb-5 pt-3 border-t border-[#C9D2E3] text-center text-[10px] sm:text-[11px] leading-relaxed text-[#5B6785] font-sans font-bold">
                <p>ឆ្នាំ២០២៦ © រក្សាសិទ្ធិគ្រប់យ៉ាងដោយ៖ ​នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម | មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
              </div>

            </div>
         );
       })()}

      {/* MODAL 2: LICENSE RENEWAL MODAL (LOCKABLE PANEL - ADMINISTRATOR USE ONLY) */}
      {showRenewModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white text-slate-800 rounded-xl max-w-lg w-full border border-slate-200 overflow-hidden shadow-2xl animate-fade-in duration-200">
            {/* Modal Header */}
            <div className="bg-emerald-800 text-white p-4 flex justify-between items-center border-b border-emerald-950">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4.5 w-4.5 text-gold animate-spin" style={{ animationDuration: '4s' }} />
                <h3 className="font-bold text-sm font-muol leading-loose">
                  បន្តសុពលភាពអាជ្ញាប័ណ្ណ (Renew Operation License)
                </h3>
              </div>
              <button onClick={() => setShowRenewModal(null)} className="text-white hover:text-slate-250 transition-colors cursor-pointer pointer-events-auto border-0 bg-transparent" type="button">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRenewLicenseSubmit} className="p-6 space-y-4 font-sans">
              
              {(currentUser.role !== 'superadmin' && currentUser.role !== 'admin') ? (
                <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-lg text-xs flex gap-2">
                  <Lock className="h-5 w-5 text-red-500 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-bold">សិទ្ធិចូលប្រើប្រាស់ត្រូវបានចាក់សោ (Access Restricted)</p>
                    <p>មុខងារបន្តអាជ្ញាប័ណ្ណនេះសម្រាប់តែមន្ត្រីរដ្ឋបាល (Admin / Superadmin) នៃមជ្ឈមណ្ឌលប៉ុណ្ណោះ។ ក្រុមហ៊ុន ឬអ្នកប្រើប្រាស់ទូទៅមិនអាចអនុវត្តបានទេ។</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1 bg-slate-905 text-slate-100 p-3.5 rounded-lg border border-slate-850 text-xs bg-slate-900">
                    <p className="font-bold font-muol leading-loose text-gold">សហគ្រាស៖ {showRenewModal.company_name}</p>
                    <p className="font-mono text-[10px] text-slate-400">លេខអាជ្ញាប័ណ្ណបច្ចុប្បន្ន៖ {showRenewModal.license_number}</p>
                    <p className="font-mono text-[10px] text-slate-405">សុពលភាពចាស់៖ {showRenewModal.license_issue_date} ដល់ {showRenewModal.license_expiry_date}</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700 block">
                      ថ្ងៃចាប់ផ្តើមបន្តសុពលភាព (Renewal Effective Issue Date) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={renewalIssueDate}
                      onChange={(e) => setRenewalIssueDate(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700 block">
                      ថ្ងៃផុតកំណត់ថ្មី (New Expiration Expiry Date - Pre-calculated 3 years) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={renewalExpiryDate}
                      onChange={(e) => setRenewalExpiryDate(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700 block">
                      កំណត់សម្គាល់ការបន្ត (Renewal Notes / Audit Remarks) <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      value={renewalNotes}
                      onChange={(e) => setRenewalNotes(e.target.value)}
                      placeholder="ពាក្យស្នើសុំផ្លូវការ ចុះថ្ងៃទី..."
                      rows={3}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setShowRenewModal(null)}
                      className="px-4 py-2 hover:bg-slate-100 text-slate-650 text-xs font-bold rounded-lg border border-slate-300 transition-all cursor-pointer"
                    >
                      បោះបង់ (Cancel)
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg border border-emerald-500 transition-all cursor-pointer shadow-md inline-flex items-center gap-1"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>យល់ព្រមបន្ត (Apply Renewal)</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ELECTRONIC LICENSE CERTIFICATE (PDF DESIGN & PRINT VIEWER ACCESSIBLE TO OWNER / CLIENT AS WELL) */}
      {showCertificateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 flex flex-col items-center justify-start p-4 md:py-8 pt-10">
          
          {/* Action Header Menu for Certificate */}
          <div className="bg-slate-900 border border-slate-800 text-white px-5 py-4 max-w-4xl w-full rounded-t-xl flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-gold animate-pulse" />
              <div className="leading-tight">
                <h4 className="font-bold text-xs font-muol text-slate-100">
                  វិញ្ញាបនបត្រអាជ្ញាប័ណ្ណអេឡិចត្រូនិច (Electronic License Certificate)
                </h4>
                <p className="text-[9.5px] text-slate-400 font-mono">License Register No: {showCertificateModal.license_number}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadPDF(showCertificateModal)}
                className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-extrabold rounded-lg transition-all active:scale-95 cursor-pointer shadow-md"
                title="Download certified digital file as PDF"
                type="button"
              >
                <Download className="h-3 w-3" />
                <span>ទាញយកជា PDF (Download PDF)</span>
              </button>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-extrabold rounded-lg transition-all active:scale-95 cursor-pointer shadow-md"
                title="Print this official certificate layout directly"
                type="button"
              >
                <Printer className="h-3 w-3" />
                <span>បោះពុម្ពវិញ្ញាបនបត្រ (Print License)</span>
              </button>

              <button
                onClick={() => setShowCertificateModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-full cursor-pointer ml-1 transition-colors border-0 bg-transparent"
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Golden A4 high fidelity Certificate body layout */}
          <div className="bg-white text-slate-900 p-8 md:p-12 max-w-4xl w-full border-x border-b border-slate-200 rounded-b-xl shadow-2xl overflow-y-auto leading-relaxed relative print:border-0 print:shadow-none font-sans" id="certified-nmc-license-sheet">
            
            {/* Outer dual line golden borders */}
            <div className="border-4 border-amber-500/70 p-6 md:p-10 relative">
              <div className="border border-navy/30 p-2 md:p-4">
                
                {/* Official National Emblem and Kingdoms headliner */}
                <div className="text-center space-y-1">
                  <h2 className="text-xs md:text-sm font-bold font-muol text-navy tracking-widest text-[#102a43] leading-loose">
                    ព្រះរាជាណាចក្រកម្ពុជា
                  </h2>
                  <h3 className="text-[11px] md:text-sm font-bold font-muol text-navy text-[#102a43] leading-loose">
                    ជាតិ សាសនា ព្រះមហាក្សត្រ
                  </h3>
                  <div className="flex justify-center py-1">
                    <span className="text-amber-500 text-xs font-bold">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
                  </div>
                  
                  {/* Ministry context */}
                  <h4 className="text-[10px] md:text-[11px] font-bold text-slate-700 uppercase tracking-wider font-sans">
                    Ministry of Industry, Science, Technology & Innovation
                  </h4>
                  <h1 className="text-xs md:text-[13px] font-bold text-slate-900 tracking-wide font-muol leading-loose">
                    មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC)
                  </h1>
                </div>

                {/* Left/Right floating passport-like Photo box and certification label */}
                <div className="flex flex-col md:flex-row justify-between items-start my-8 gap-4 border-t border-slate-200 pt-6">
                  
                  {/* License Info numbers */}
                  <div className="space-y-1 text-slate-650 text-[11px] md:text-xs">
                    <p>អាជ្ញាប័ណ្ណលេខ (License ID No): <strong className="font-mono text-navy text-xs md:text-sm font-black">{showCertificateModal.license_number}</strong></p>
                    <p>ថ្ងៃចេញ (Date of Issue): <span className="font-mono">{showCertificateModal.license_issue_date}</span></p>
                    <p>ថ្ងៃផុតកំណត់ (Date of Expiry): <span className="font-mono text-red-650 font-bold">{showCertificateModal.license_expiry_date}</span></p>
                    <p>សុពលភាព (Duration): <span className="font-bold">៣ ឆ្នាំ (3 Years Validity)</span></p>
                  </div>

                  {/* Representative photo on the upper right */}
                  <div className="shrink-0 flex flex-col items-center text-center">
                    <div className="h-28 w-24 border border-slate-300 bg-slate-50 rounded shadow-xs overflow-hidden flex items-center justify-center text-slate-350">
                      {showCertificateModal.photo_base64 || showCertificateModal.license_owner_photo_url ? (
                        <img 
                          src={showCertificateModal.photo_base64 || showCertificateModal.license_owner_photo_url} 
                          alt="Legal Representative" 
                          className="h-full w-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="p-2 text-center text-[10px]">
                          <Camera className="h-5 w-5 mx-auto mb-1 text-slate-300" />
                          <span>រូបថតតំណាង (Photo)</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 font-bold mt-1.5 uppercase tracking-wider">Representative Image</span>
                  </div>
                </div>

                {/* Big Certificate Title */}
                <div className="text-center my-6">
                  <h1 className="text-lg md:text-2xl font-black font-muol text-[#1E3A8A] leading-loose tracking-wide">
                    វិញ្ញាបនបត្រអាជ្ញាប័ណ្ណមាត្រាសាស្ត្រ
                  </h1>
                  <h2 className="text-xs md:text-sm font-extrabold text-navy tracking-wider uppercase font-sans mt-1">
                    Electronic Business Metrology License
                  </h2>
                </div>

                {/* Certificate Core Statement */}
                <div className="space-y-4 md:space-y-6 text-xs md:text-sm leading-relaxed text-slate-800">
                  <p className="text-justify font-sans">
                    មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ នៃព្រះរាជាណាចក្រកម្ពុជា សូមបញ្ជាក់ជូនថា សហគ្រាស/ក្រុមហ៊ុន ដែលមានឈ្មោះលម្អិតខាងក្រោម ត្រូវបានពិនត្យ ដោះស្រាយបែបបទ និងផ្តល់សិទ្ធិអនុញ្ញាតធ្វើសកម្មភាពវាស់ស្ទង់ស្របតាមលក្ខខណ្ឌច្បាប់មាត្រាសាស្ត្រជាតិ៖
                  </p>

                  {/* Grid table details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-y-3.5 border-t border-b border-dashed border-slate-300 py-4 font-sans text-xs md:text-sm">
                    {/* Company name */}
                    <div className="font-bold text-slate-600">សហគ្រាស / Company Name:</div>
                    <div className="md:col-span-2 font-black text-navy text-sm md:text-base">{showCertificateModal.company_name}</div>

                    {/* Legal Form legal representative */}
                    <div className="font-bold text-slate-600">តំណាងច្បាប់ / Representative:</div>
                    <div className="md:col-span-2 text-slate-900 font-bold">
                      {showCertificateModal.license_owner_name || 'N/A'} ({showCertificateModal.license_owner_position || 'CEO'})
                      {(showCertificateModal.representative_date_of_birth || showCertificateModal.representative_gender || showCertificateModal.representative_nationality) && (
                        <div className="mt-1 text-[11px] font-normal text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                          {showCertificateModal.representative_date_of_birth && (
                            <span><strong>ថ្ងៃកំណើត៖</strong> {showCertificateModal.representative_date_of_birth}</span>
                          )}
                          {showCertificateModal.representative_gender && (
                            <span><strong>ភេទ៖</strong> {showCertificateModal.representative_gender === 'Male' ? 'ប្រុស' : showCertificateModal.representative_gender === 'Female' ? 'ស្រី' : 'ផ្សេងៗ'}</span>
                          )}
                          {showCertificateModal.representative_nationality && (
                            <span><strong>សញ្ជាតិ៖</strong> {showCertificateModal.representative_nationality}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Business type */}
                    <div className="font-bold text-slate-600">ទម្រង់អាជីវកម្ម / Business Type:</div>
                    <div className="md:col-span-2 text-slate-850 font-bold">{showCertificateModal.business_type || 'N/A'}</div>

                    {/* Service scope */}
                    <div className="font-bold text-slate-600">វិសាលភាពអនុញ្ញាត / Scope of Work:</div>
                    <div className="md:col-span-2 text-slate-800 font-medium">{showCertificateModal.service_scope || 'All standard metrology instrumentation operations.'}</div>

                    {/* Allowed instruments */}
                    <div className="font-bold text-slate-600">ឧបករណ៍វាស់វែង / Devices Allowed:</div>
                    <div className="md:col-span-2 text-slate-800 font-mono font-bold leading-normal">{showCertificateModal.measuring_instrument_type || 'Unspecified Devices'}</div>

                    {/* Address place */}
                    <div className="font-bold text-slate-600">អាសយដ្ឋាន / Business Address:</div>
                    <div className="md:col-span-2 text-slate-800 text-xs space-y-3">
                      <p>{showCertificateModal.company_address || 'Cambodia'}</p>
                      
                      {showCertificateModal.business_latitude !== undefined && 
                       showCertificateModal.business_latitude !== null && (
                        <div className="space-y-2">
                          <MiniLocationMap
                            latitude={Number(showCertificateModal.business_latitude)}
                            longitude={Number(showCertificateModal.business_longitude)}
                            companyName={showCertificateModal.company_name_kh || showCertificateModal.company_name}
                            licenseStatus={showCertificateModal.license_status}
                            onOpenFullMap={() => {
                              if (isCompanyUser) return;
                              setShowCertificateModal(null);
                              setActiveSubTab('map');
                            }}
                          />
                          <div className="p-2 bg-slate-50 border border-slate-205 rounded-md flex flex-wrap items-center justify-between gap-1 text-[10.5px]">
                            <span className="font-mono text-navy font-bold flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-[#353C96]" />
                              GPS: {showCertificateModal.business_latitude}, {showCertificateModal.business_longitude}
                              {showCertificateModal.business_location_source && (
                                <span className="text-[9px] text-[#5B6785] font-normal bg-[#353C96]/10 px-1 py-0.2 rounded font-sans">source: {showCertificateModal.business_location_source}</span>
                              )}
                            </span>
                            <a 
                              href={`https://www.google.com/maps?q=${showCertificateModal.business_latitude},${showCertificateModal.business_longitude}`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sky-650 hover:underline hover:text-sky-800 inline-flex items-center gap-0.5 font-bold"
                            >
                              <ExternalLink className="h-3 w-3" /> មើលលើ Google Maps (Open GMap)
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* License fee */}
                    <div className="font-bold text-slate-600">តម្លៃសេវាកម្ម / Official Fee:</div>
                    <div className="md:col-span-2 text-emerald-700 font-bold font-mono text-sm">
                      {showCertificateModal.service_fee ? `$${Number(showCertificateModal.service_fee).toLocaleString()} USD` : 'Complimentary / NMC Exempted'}
                    </div>
                  </div>
                </div>

                {/* Footer validation and stamps */}
                <div className="flex flex-col md:flex-row justify-between items-center mt-10 md:mt-14 gap-6">
                  
                  {/* Bottom Left: QR Code Verification block */}
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-3 rounded-lg max-w-sm">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/verify-license/${showCertificateModal.license_number}`)}`} 
                      alt="Verification Token Scan" 
                      className="h-16 w-16 bg-white border border-slate-300 p-0.5"
                      referrerPolicy="no-referrer"
                    />
                    <div className="space-y-0.5 flex-1">
                      <p className="text-[10px] font-black font-muol text-navy leading-loose text-slate-900">ប្រព័ន្ធផ្ទៀងផ្ទាត់ផ្លូវការ</p>
                      <p className="text-[9px] text-slate-500 leading-normal font-sans text-justify">
                        ស្កែន QR Code ដើម្បីពិនិត្យស្ថានភាពផ្លូវការ សុពលភាព និងព័ត៌មានដើមនៃវិញ្ញាបនបត្រអាជ្ញាប័ណ្ណនេះចេញពីម៉ាស៊ីន NMC ផ្ទាល់។
                      </p>
                    </div>
                  </div>

                  {/* Bottom Right: Stamp Sign placeholders */}
                  <div className="text-center font-sans space-y-1 border border-slate-200 p-4 bg-slate-50 rounded-lg min-w-[200px]">
                    <p className="text-[10.5px] text-slate-400 font-mono font-bold">REGISTRY AUTH CODE</p>
                    <p className="text-[11px] font-bold font-mono text-[#353C96] font-black tracking-widest">{showCertificateModal.id.split('-')[0].toUpperCase()}</p>
                    <div className="h-10"></div>
                    <p className="text-[11px] font-bold text-slate-800 font-muol leading-loose">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
                    <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">National Metrology Center</p>
                  </div>
                </div>

                {/* Legal compliance notice */}
                <div className="mt-8 border-t border-slate-200 pt-4 text-center">
                  <p className="text-[9px] md:text-[10px] text-slate-400 italic">
                    វិញ្ញាបនបត្រនេះត្រូវបានបង្កើតឡើងតាមទម្រង់អេឡិចត្រូនិកទំនើបរបស់ NMC។ រាល់ការបន្លំ ឬកែសម្រួលខុសច្បាប់នឹងត្រូវដោះស្រាយតាម قانون មាត្រាសាស្ត្រនៃព្រះរាជាណាចក្រកម្ពុជា។
                  </p>
                </div>

              </div>
            </div>

          </div>

          {/* Actions Footer Menu */}
          <div className="bg-slate-900 border border-slate-800 text-white p-3.5 max-w-4xl w-full rounded-b-xl flex justify-between items-center text-xs shadow-lg mt-0">
            <span className="text-slate-450 italic">Verified Electronic Metrology Document</span>
            <button
              onClick={() => setShowCertificateModal(null)}
              className="py-1 px-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 font-extrabold cursor-pointer border-0"
              type="button"
            >
              បិទ (Close Preview)
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: REGISTER / EDIT TELEGRAM BOT (RESTRICTED TO ADMIN/SUPERADMIN) */}
      {showBotModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white text-slate-800 rounded-xl max-w-xl w-full border border-slate-200 overflow-hidden shadow-2xl animate-fade-in duration-200">
            {/* Modal Header */}
            <div className="bg-navy p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-sky-400" />
                <h3 className="font-bold text-xs font-muol leading-loose">
                  {editingBot ? 'កែសម្រួលព័ត៌មានប៊ូតតេឡេក្រាម (Edit Telegram Bot)' : 'ចុះឈ្មោះប៊ូតតេឡេក្រាមថ្មី (Register New Telegram Bot)'}
                </h3>
              </div>
              <button 
                onClick={() => setShowBotModal(false)} 
                className="text-white hover:text-slate-350 transition-colors pointer-events-auto cursor-pointer border-0 bg-transparent" 
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveBotSetting} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto font-sans text-xs">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[11px] leading-relaxed text-slate-600 font-sans">
                ⚠️ <strong>លក្ខខណ្ឌកំណត់ / Notes:</strong> ដើម្បីទទួលបានការជូនដំណឹងពីប្រព័ន្ធ លោកអ្នកចាំបាច់ត្រូវបង្កើត Telegram Bot ផ្ទាល់ខ្លួនតាមរយៈ <strong>@BotFather</strong> ក្នុងតេឡេក្រាមជាមុនសិន។ / To receive system notification events, you must register a bot via <strong>@BotFather</strong> first.
              </div>

              {/* Security Leaked Warning */}
              <div className="bg-red-50 border border-red-100 p-3.5 rounded-xl leading-relaxed text-red-900 font-sans space-y-1">
                <p className="font-bold text-red-950 font-muol flex items-center gap-1.5 leading-loose">
                  <span>⚠️</span> ការណែនាំអំពីសុវត្ថិភាព / Important Security Advice:
                </p>
                <p className="font-medium">ប្រសិនបើ Bot Token ត្រូវបានបង្ហាញ ឬចែករំលែក សូមបង្កើត Token ថ្មីតាមរយៈ @BotFather ភ្លាមៗ។</p>
                <p className="text-[10px] text-red-750 italic font-sans leading-tight block">If the Bot Token has been exposed or shared, please regenerate a new token through @BotFather immediately.</p>
              </div>

              {/* Bot Name */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">ឈ្មោះប៊ូតតេឡេក្រាម (Bot Name) *</label>
                <input
                  type="text"
                  required
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder="ឧទាហរណ៍៖ NMC Notification Bot"
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-navy focus:outline-hidden"
                />
              </div>

              {/* Bot Username */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">ស្មោះគណនីប៊ូត (Bot Username) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-400 text-xs">@</span>
                  <input
                    type="text"
                    required
                    value={botUsername}
                    onChange={(e) => setBotUsername(e.target.value)}
                    placeholder="NMC_License_Bot (must end in `_bot` or `Bot`)"
                    className="w-full text-xs pl-7 p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-navy focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Bot Purpose */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">គោលបំណងប៊ូត (Bot Purpose) *</label>
                <select
                  required
                  value={botPurpose}
                  onChange={(e) => setBotPurpose(e.target.value as 'report_group' | 'license_reminder' | 'both')}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-navy focus:outline-hidden bg-white font-bold text-slate-700"
                >
                  <option value="license_reminder">License Reminder Bot</option>
                  <option value="report_group">Report Group Notification Bot</option>
                  <option value="both">Both: License Reminder + Report Group Notification</option>
                </select>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Use Both when the same Telegram bot should send license reminders and report group notifications.
                </p>
              </div>

              {/* Bot Token */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">លេខកូដសម្ងាត់ប៊ូត (Bot Token API Key) *</label>
                <input
                  type="password"
                  required={!editingBot}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  onFocus={() => {
                    if (botToken === 'PROTECTED_UNCHANGED') {
                      setBotToken('');
                    }
                  }}
                  placeholder={botToken === 'PROTECTED_UNCHANGED' ? "••••••••••••••••••••••••••••••••••••" : "ឧទាហរណ៍៖ 123456789:ABCdefGhIJKlmNoPQRst... (Never share this)"}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-navy focus:outline-hidden font-mono text-xs"
                />
                {botToken === 'PROTECTED_UNCHANGED' && (
                  <span className="text-[10px] text-emerald-600 block leading-tight mt-0.5 font-sans font-medium">
                    ✓ លេខកូដគឺត្រូវបានរក្សាទុកដោយសុវត្ថិភាព។ ចុចដើម្បីវាយលេខកូដថ្មីជំនួស។ / Token is securely stored. Click/Focus to enter a new one.
                  </span>
                )}
              </div>

              {/* Default Chat ID */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Default Group Chat ID {(botPurpose === 'report_group' || botPurpose === 'both') ? '*' : '(Optional for License Reminder only)'}
                </label>
                <input
                  type="text"
                  required={botPurpose === 'report_group' || botPurpose === 'both'}
                  value={defaultChatId}
                  onChange={(e) => setDefaultChatId(e.target.value)}
                  placeholder="ឧទាហរណ៍៖ -5108947922 or -10012345678"
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-navy focus:outline-hidden font-mono text-xs"
                />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Required only for Report Group or Both. License reminders are sent to each company Telegram chat ID.
                </p>
              </div>

              {/* Bot Description */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">ការពិពណ៌នាពីប៊ូត (Bot Description)</label>
                <textarea
                  value={botDescription}
                  onChange={(e) => setBotDescription(e.target.value)}
                  placeholder="សំរាប់សម្គាល់ ឬពិពណ៌នាការប្រើប្រាស់ប៊ូតនេះ..."
                  rows={2}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-navy focus:outline-hidden font-sans"
                />
              </div>

              {/* Is Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is-bot-active"
                  checked={isBotActive}
                  onChange={(e) => setIsBotActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-navy focus:ring-navy cursor-pointer"
                />
                <label htmlFor="is-bot-active" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  កំណត់ជាប៊ូតសកម្មសម្រាប់គោលបំណងនេះ (Set as active bot for this purpose)
                </label>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBotModal(false)}
                  className="px-4 py-2 hover:bg-slate-100 text-slate-650 text-xs font-bold rounded-lg border border-slate-300 transition-all cursor-pointer"
                >
                  បោះបង់ (Cancel)
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#353C96] hover:bg-[#2D327F] text-white text-xs font-bold rounded-lg border border-[#353C96] transition-all cursor-pointer shadow-md inline-flex items-center gap-1"
                >
                  <Bot className="h-4 w-4" />
                  <span>រក្សាទុកប៊ូត (Save Bot Configuration)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: GUIDED TELEGRAM CONNECTION WIZARD */}
      {connectionModalOpen && connectionLic && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white text-slate-800 rounded-2xl max-w-lg w-full border border-slate-100 overflow-hidden shadow-2xl animate-fade-in duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-sky-800 to-sky-900 p-4.5 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Bot className="h-5.5 w-5.5 text-sky-305 shrink-0" />
                <div>
                  <h3 className="font-bold text-xs font-muol leading-loose">
                    ការណែនាំអំពីការភ្ជាប់ Telegram Bot សម្រាប់ការរំលឹក
                  </h3>
                  <p className="text-[10px] text-sky-100 font-medium font-sans mt-0.5 tracking-wide">
                    Telegram Bot Connection Guidance for Reminders
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setConnectionModalOpen(false)} 
                className="text-white/80 hover:text-white transition-colors cursor-pointer border-0 bg-transparent p-1" 
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto font-sans text-xs">
              {/* Introduction Alert box */}
              <div className="bg-sky-50 border border-sky-100 p-4 rounded-xl leading-relaxed text-sky-900">
                <p className="font-bold font-muol leading-loose text-sky-950">សេចក្តីជូនដំណឹង / Notice:</p>
                <p className="font-medium text-[11px]">
                  ដើម្បីទទួលបានសាររំលឹកអំពីសុពលភាពអាជ្ញាប័ណ្ណមាត្រាសាស្ត្ររបស់សហគ្រាសលោកអ្នកដោយស្វ័យប្រវត្តិ សូមអនុវត្តតាមការណែនាំខាងក្រោម៖
                </p>
                <p className="text-[10.5px] text-sky-800 italic mt-0.5 font-medium leading-tight">
                  To configure automatic validity reminders for your metrology license, please strictly complete the steps below:
                </p>
              </div>

              {/* Instructions list */}
              <div className="space-y-4">
                {/* Step 1 */}
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h4 className="font-bold text-slate-800 text-[11px]">ចម្លងកូដចុះឈ្មោះ (Copy Registration Code)</h4>
                    <p className="text-slate-500 text-[10.5px]">ចម្លង ឬកត់ត្រាកូដសម្ងាត់នេះដើម្បីផ្ញើទៅកាន់ប៊ូត៖ / Copy or note this register token:</p>
                    
                    {(() => {
                      const licId = connectionLic.id;
                      const rawTok = generatedTokens[licId]?.token || 'NMC_TOKEN_REQUIRED';
                      return (
                        <div className="flex items-center gap-1">
                          <code className="bg-slate-100 border border-slate-200 text-[#353C96] p-2 rounded-lg font-mono text-xs select-all flex-1 tracking-wider text-center font-bold">
                            {rawTok}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(rawTok);
                              toastMsg('បានចម្លងកូដសម្ងាត់សម្រាប់ Telegram! / Copied registration code!', 'success');
                            }}
                            className="p-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Copy to Clipboard"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h4 className="font-bold text-slate-800 text-[11px]">បើកការពិភាក្សាជាមួយ Bot (Launch Telegram)</h4>
                    <p className="text-slate-500 text-[10.5px]">ចុចលើតំណភ្ជាប់តេឡេក្រាមខាងក្រោមដើម្បីបើកកម្មវិធី Telegram៖ / Tap this link to launch the application:</p>
                    
                    {(() => {
                      const licId = connectionLic.id;
                      const rawTok = generatedTokens[licId]?.token || '';
                      const botUser = activeReminderBot?.bot_username || 'NMC_Reminder_Bot';
                      const link = `https://t.me/${botUser}?start=${rawTok}`;
                      return (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold cursor-pointer text-center select-none shadow-sm transition-all"
                        >
                          <Send className="h-4 w-4 text-sky-100" />
                          <span>បើកកម្មវិធីតេឡេក្រាម (Open Telegram t.me)</span>
                          <ExternalLink className="h-3.5 w-3.5 text-sky-200" />
                        </a>
                      );
                    })()}
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div className="space-y-1 flex-1">
                    <h4 className="font-bold text-slate-800 text-[11px]">ផ្ញើសារ START (Send Start Message)</h4>
                    <p className="text-slate-500 text-[10.5px]">
                      ចុចលើប៊ូតុង <strong>START</strong> ឬ <strong>SEND MESSAGE</strong> ក្នុងតេឡេក្រាម។ ប្រព័ន្ធនឹងភ្ជាប់គណនីតេឡេក្រាមរបស់អ្នកដោយស្វ័យប្រវត្តិ។
                    </p>
                    <p className="text-slate-400 text-[10px] italic">
                      Click the <strong>START</strong> or <strong>SEND MESSAGE</strong> command in Telegram. The system will complete registration immediately.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Verification Panel */}
              <div className="bg-slate-550/5 border border-slate-200/80 p-4.5 rounded-2xl flex flex-col items-center justify-center text-center space-y-3.5">
                <div>
                  <h4 className="font-extrabold text-slate-850 text-[11px]">ការបញ្ជាក់ស្ថានភាពគណនី (Verify Active Handshake)</h4>
                  <p className="text-slate-500 text-[10px] mt-0.5">បន្ទាប់ពីចុច START ក្នុងតេឡេក្រាម សូមចុចប៊ូតុងខាងក្រោមដើម្បីផ្ទៀងផ្ទាត់ការតភ្ជាប់៖</p>
                  <p className="text-slate-400 text-[9px] italic">Once you click START inside Telegram, verify system connection status below:</p>
                </div>

                {isWaitingConnection ? (
                  <div className="flex items-center gap-2 font-black text-[#353C96] text-xs py-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-[#353C96]" />
                    <span>កំពុងទាញយកស្ថានភាពថ្មី... / Re-fetching active status...</span>
                  </div>
                ) : (
                  <div className="w-full flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsWaitingConnection(true);
                        await loadRegistryData();
                        setTimeout(() => {
                          setIsWaitingConnection(false);
                          
                          // Check if the current license is now connected
                          const reLic = licenses.find(l => l.id === connectionLic.id);
                          if (reLic && (reLic.telegram_connection_status === 'Connected' || reLic.telegram_chat_id)) {
                            toastMsg('✓ ជោគជ័យ! តេឡេក្រាមត្រូវបានតភ្ជាប់ដោយជោគជ័យ។ / Telegram connected successfully!', 'success');
                            setConnectionLic(reLic);
                          } else {
                            toastMsg('✕ រកមិនឃើញគណនីតភ្ជាប់ទេ។ សូមចុច START ក្នុងតេឡេក្រាមជាមុនសិន។ / No active handshake yet. Did you click START?', 'error');
                          }
                        }, 1500);
                      }}
                      className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 font-extrabold text-[#ffffff] rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 border-0"
                    >
                      <Bot className="h-4 w-4 text-white" />
                      <span>ពិនិត្យស្ថានភាពការតភ្ជាប់ (Verify Connection)</span>
                    </button>
                    
                    {currentUser.role !== 'company' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await handleSimulateBotStartCommand(connectionLic.id);
                          const reLic = licenses.find(l => l.id === connectionLic.id);
                          if (reLic) setConnectionLic(reLic);
                        }}
                        className="py-1 px-3 bg-slate-50 hover:bg-slate-100 text-[#353C96] border border-[#C9D2E3]/80 rounded-lg text-[10.5px] font-bold cursor-pointer"
                      >
                        🤖 សាកល្បងម៉ាស៊ីនក្លែងធ្វើ (Trigger Simulator Client)
                      </button>
                    )}
                  </div>
                )}

                {/* Show dynamic connection success badge */}
                {(connectionLic.telegram_connection_status === 'Connected' || connectionLic.telegram_chat_id) && (
                  <div className="bg-emerald-50 border border-emerald-250 p-3 rounded-xl w-full flex items-center justify-center gap-2 text-emerald-800">
                    <span className="text-[14px]">✓</span>
                    <div className="text-left">
                      <p className="font-extrabold text-[11px] leading-tight">បានតភ្ជាប់និងដំណើរការ! (Connected & Live)</p>
                      <p className="text-[9px] text-emerald-650 font-mono">Chat ID: {connectionLic.telegram_chat_id} (@{connectionLic.telegram_username})</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end">
              <button
                onClick={() => setConnectionModalOpen(false)}
                className="py-2 px-5 bg-slate-900 text-white font-extrabold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer text-xs border-0"
                type="button"
              >
                បិទបញ្ជីណែនាំ (Close Wizard & Return)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: PORTRAIT IMAGE CROPPER TOOL */}
      {showCropModal && (() => {
        const zoom = cropScale;
        const rotation = cropRotation;
        return (
          <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white text-slate-800 rounded-2xl max-w-sm w-full border border-slate-300 overflow-hidden shadow-2xl animate-fade-in duration-200">
              {/* Modal Header */}
              <div className="bg-[#353C96] p-4 flex justify-between items-center text-white border-b border-[#2D327F]">
                <div className="flex items-center gap-2">
                  <Camera className="h-4.5 w-4.5 text-yellow-300 shrink-0" />
                  <div>
                    <h3 className="font-bold text-xs font-muol leading-loose">
                      កាត់តម្រឹមរូបថតផ្លូវការ (Portrait Image Cropper)
                    </h3>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCropModal(false)}
                  className="text-white hover:text-slate-200 transition-colors cursor-pointer border-0 bg-transparent p-1" 
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 flex flex-col items-center space-y-5">
                {selectedPhotoPreviewUrl && !cropImageError ? (
                  <>
                    {/* Crop Area */}
                    <div 
                      ref={cropViewportRef}
                      className="bg-[#f8fafc] border border-[#C9D2E3] rounded-xl overflow-hidden relative mx-auto w-[260px] h-[260px] md:w-[320px] md:h-[320px] shadow-sm"
                      onMouseDown={handleCropMouseDown}
                      onMouseMove={handleCropMouseMove}
                      onMouseUp={handleCropMouseUpOrLeave}
                      onMouseLeave={handleCropMouseUpOrLeave}
                      onTouchStart={handleCropTouchStart}
                      onTouchMove={handleCropTouchMove}
                      onTouchEnd={handleCropMouseUpOrLeave}
                    >
                      <img
                        src={selectedPhotoPreviewUrl}
                        alt="Owner photo preview"
                        draggable={false}
                        onLoad={(e) => {
                          setCropImageError(false);
                          setImgNaturalWidth(e.currentTarget.naturalWidth);
                          setImgNaturalHeight(e.currentTarget.naturalHeight);
                        }}
                        onError={() => setCropImageError(true)}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                          transformOrigin: "center center",
                          cursor: isDraggingCrop ? "grabbing" : "grab",
                          userSelect: "none",
                          touchAction: "none"
                        }}
                      />
                    </div>

                    {/* Controls */}
                    <div className="w-full space-y-3.5 font-sans text-xs">
                      {/* Zoom range slider */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[#353C96] font-bold text-[11px]">
                          <span>ការពង្រីក (Zoom Scale)</span>
                          <span className="font-mono bg-[#F5F7FB] border border-[#C9D2E3] px-1.5 py-0.5 rounded text-slate-700">
                            {zoom.toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          step="0.05"
                          value={cropScale}
                          onChange={(e) => setCropScale(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#353C96]"
                        />
                      </div>

                      {/* Rotation controls */}
                      <button
                        type="button"
                        onClick={() => setCropRotation(prev => (prev + 90) % 360)}
                        className="w-full py-2 border border-[#C9D2E3] rounded-lg hover:bg-slate-50 text-[10.5px] font-bold text-[#353C96] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>បង្វិល 90° (Rotate 90°)</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-red-500 font-bold text-xs p-4 leading-normal">
                    {cropImageError
                      ? 'មិនអាចបង្ហាញរូបថតបានទេ។ សូមជ្រើសរើសរូបថតផ្សេងទៀត / Unable to preview this image. Please choose another photo.'
                      : 'សូមជ្រើសរើសរូបថតជាមុនសិន / Please select a photo first.'}
                  </div>
                )}
              </div>

              {/* Modal Actions Footer */}
              <div className="bg-slate-50 border-t border-slate-100 p-4 flex gap-2 justify-end font-sans">
                <button
                  onClick={() => setShowCropModal(false)}
                  className="py-2 px-4 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer text-xs"
                  type="button"
                >
                  បោះបង់ (Cancel)
                </button>
                
                <button
                  onClick={handleApplyCrop}
                  className="py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1 shadow-md border-0"
                  type="button"
                >
                  <Check className="h-4 w-4" />
                  <span>កាត់តម្រឹម & រក្សាទុក (Crop & Save)</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
