import React, { useState, useEffect } from 'react';
import { 
  LogOut, 
  Award,
  User, 
  MapPin, 
  Building2, 
  ShieldCheck, 
  SlidersHorizontal, 
  Search, 
  NotebookTabs,
  Users, 
  Settings2, 
  FileCheck2, 
  Share2, 
  ArrowLeftRight, 
  Activity, 
  Database,
  CornerDownRight, 
  ChevronsUpDown,
  FileSpreadsheet,
  FileText,
  Clock,
  BriefcaseBusiness,
  Landmark,
  KeyRound,
  Menu,
  X,
  Languages
} from 'lucide-react';

// Import Types
import { MetrologyUser, MetrologyReport, SupabaseConfig, ServiceType, generateYearOptions } from './types';

// Import Demo Data
import { INITIAL_USERS, INITIAL_REPORTS, isDemoDataEnabled } from './demoData';

// Import Export Utils
import { 
  getServiceTypeKH, 
  getMonthNameKH, 
  exportReportsToExcel, 
  exportToWordDoc 
} from './exportUtils';

// Import Supabase
import { getSupabaseClient } from './supabaseClient';
import { 
  getActiveSupabaseConfig,
  fetchUsersFromSupabase,
  saveUserToSupabase,
  deleteUserFromSupabase,
  fetchReportsFromSupabase,
  saveReportToSupabase,
  deleteReportFromSupabase,
  isReportOwnedByCurrentCompany,
  isLicenseOwnedByCurrentCompany
} from './supabaseSync';

// Import Modular Components
import LoginScreen from './components/LoginScreen';
import UserManagement from './components/UserManagement';
import ReportForm from './components/ReportForm';
import ExcelReportUpload from './components/ExcelReportUpload';
import DashboardStats from './components/DashboardStats';
import SuperadminDashboard from './components/SuperadminDashboard';
import DeveloperConsole from './components/DeveloperConsole';
import ReportPrintLayout from './components/ReportPrintLayout';
import TopServiceCompanies from './components/TopServiceCompanies';
import { logLoginHistory, fetchLoginHistory, logAuditEvent } from './services/loginHistoryService';
import LoginHistoryView from './components/LoginHistoryView';
import BackupData from './components/BackupData';
import EnterpriseLicensingRegistry from './components/EnterpriseLicensingRegistry';
import ChangePasswordModal from './components/ChangePasswordModal';

// Import Logo Asset
import nmcLogo from './NMClogo.png';

// Import Telegram Utils
import { sendTelegramNotification } from './telegramUtils';

type AppLanguage = 'km' | 'en';

const KHMER_PATTERN = /[\u1780-\u17FF]/;
const LATIN_PATTERN = /[A-Za-z]/;
const TEXT_ORIGINALS = new WeakMap<Text, string>();
const ATTRIBUTE_ORIGINALS = new WeakMap<Element, Record<string, string>>();

function resolveLanguageText(value: string, language: AppLanguage): string {
  if (!KHMER_PATTERN.test(value) || !LATIN_PATTERN.test(value)) return value;

  const slashMatch = value.match(/^\s*(.+?)\s*\/\s*(.+?)\s*$/);
  if (slashMatch && KHMER_PATTERN.test(slashMatch[1]) && LATIN_PATTERN.test(slashMatch[2])) {
    return language === 'km' ? slashMatch[1].trim() : slashMatch[2].trim();
  }
  if (slashMatch && LATIN_PATTERN.test(slashMatch[1]) && KHMER_PATTERN.test(slashMatch[2])) {
    return language === 'km' ? slashMatch[2].trim() : slashMatch[1].trim();
  }

  const parentheticalMatch = value.match(/^\s*(.+?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$/);
  if (parentheticalMatch && KHMER_PATTERN.test(parentheticalMatch[1])) {
    return language === 'km' ? parentheticalMatch[1].trim() : parentheticalMatch[2].trim();
  }
  const inverseParentheticalMatch = value.match(/^\s*([^()]*[A-Za-z][^()]*)\s*\(([^()]*[\u1780-\u17FF][^()]*)\)\s*$/);
  if (inverseParentheticalMatch && LATIN_PATTERN.test(inverseParentheticalMatch[1])) {
    return language === 'km' ? inverseParentheticalMatch[2].trim() : inverseParentheticalMatch[1].trim();
  }

  const dashMatch = value.match(/^\s*(.+?)\s+[-–—]\s+([A-Za-z][\s\S]*)$/);
  if (dashMatch && KHMER_PATTERN.test(dashMatch[1])) {
    return language === 'km' ? dashMatch[1].trim() : dashMatch[2].trim();
  }

  return value;
}

function useSingleLanguageDisplay(language: AppLanguage) {
  useEffect(() => {
    const translatableAttributes = ['placeholder', 'title', 'aria-label'];

    const processTextNode = (node: Text) => {
      const current = node.nodeValue ?? '';
      let original = TEXT_ORIGINALS.get(node);
      if (!original || (KHMER_PATTERN.test(current) && LATIN_PATTERN.test(current) && current !== resolveLanguageText(original, language))) {
        original = current;
        TEXT_ORIGINALS.set(node, original);
      }
      TEXT_ORIGINALS.set(node, original);
      const next = resolveLanguageText(original, language);
      if (node.nodeValue !== next) node.nodeValue = next;
    };

    const processElementAttributes = (element: Element) => {
      let originals = ATTRIBUTE_ORIGINALS.get(element);
      if (!originals) {
        originals = {};
        ATTRIBUTE_ORIGINALS.set(element, originals);
      }

      translatableAttributes.forEach((attr) => {
        const current = element.getAttribute(attr);
        if (!current) return;
        let original = originals![attr];
        if (!original || (KHMER_PATTERN.test(current) && LATIN_PATTERN.test(current) && current !== resolveLanguageText(original, language))) {
          original = current;
          originals![attr] = original;
        }
        originals![attr] = original;
        const next = resolveLanguageText(original, language);
        if (current !== next) element.setAttribute(attr, next);
      });
    };

    const processRoot = (root: ParentNode) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        processTextNode(current as Text);
        current = walker.nextNode();
      }

      if (root instanceof Element) processElementAttributes(root);
      root.querySelectorAll?.('*').forEach(processElementAttributes);
    };

    processRoot(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            processTextNode(node as Text);
          } else if (node instanceof Element) {
            processRoot(node);
          }
        });

        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          processTextNode(mutation.target as Text);
        }

        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          processElementAttributes(mutation.target);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: translatableAttributes,
    });

    return () => observer.disconnect();
  }, [language]);
}

function LanguageSwitch({
  language,
  onChange,
  dark = false,
}: {
  language: AppLanguage;
  onChange: (language: AppLanguage) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg border p-1 ${
        dark ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-white'
      }`}
      aria-label="Language switch"
    >
      <Languages className={`h-3.5 w-3.5 ${dark ? 'text-gold' : 'text-[#353C96]'}`} />
      {(['km', 'en'] as AppLanguage[]).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={`rounded-md px-2 py-1 text-[10px] font-black transition-colors cursor-pointer ${
            language === code
              ? dark
                ? 'bg-gold text-navy'
                : 'bg-[#353C96] text-white'
              : dark
                ? 'text-slate-300 hover:bg-white/10'
                : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {code === 'km' ? 'ខ្មែរ' : 'EN'}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  // Session authentication state
  const [sessionUser, setSessionUser] = useState<MetrologyUser | null>(null);
  
  // Public verification via QR code query parameters
  const [verifyReportId, setVerifyReportId] = useState<string | null>(null);
  const [verifiedReport, setVerifiedReport] = useState<MetrologyReport | null>(null);
  const [verifiedCompany, setVerifiedCompany] = useState<MetrologyUser | null>(null);
  const [verifiedReportsList, setVerifiedReportsList] = useState<MetrologyReport[]>([]);
  
  // Public enterprise license verification states
  const [verifyLicenseNo, setVerifyLicenseNo] = useState<string | null>(null);
  const [verifiedLicense, setVerifiedLicense] = useState<any | null>(null);
  const [isLicenseVerifying, setIsLicenseVerifying] = useState<boolean>(false);
  
  // Database datasets states
  const [users, setUsers] = useState<MetrologyUser[]>([]);
  const [reports, setReports] = useState<MetrologyReport[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  
  // App navigation state: 'dashboard' | 'reports' | 'users' | 'developer' | 'history' | 'backup' | 'licenses'
  const [activeTab, setActiveTab ] = useState<'dashboard' | 'reports' | 'users' | 'developer' | 'history' | 'backup' | 'licenses'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const saved = localStorage.getItem('nmc_app_language');
    return saved === 'en' ? 'en' : 'km';
  });
  useSingleLanguageDisplay(language);

  useEffect(() => {
    document.documentElement.lang = language === 'km' ? 'km' : 'en';
  }, [language]);

  const handleLanguageChange = (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    localStorage.setItem('nmc_app_language', nextLanguage);
  };
  
  // PWA installation states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Supabase dynamic config
  const [dbConfig, setDbConfig] = useState<SupabaseConfig>({
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
    isConnected: false,
    useFallback: true
  });

  // Active items state
  const [selectedEditReport, setSelectedEditReport] = useState<MetrologyReport | null>(null);
  const [addReportMethod, setAddReportMethod] = useState<'manual' | 'excel'>('manual');
  const [selectedPrintReport, setSelectedPrintReport] = useState<MetrologyReport | null>(null);
  const [isPrintAllPreview, setIsPrintAllPreview] = useState(false);

  // Search/Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterServiceType, setFilterServiceType] = useState('all');
  const [filterCompanyId, setFilterCompanyId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Custom Toast notification
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Dynamic Cambodia Time (GMT+7)
  const [systemTime, setSystemTime] = useState<string>(() => {
    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Phnom_Penh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      const second = parts.find(p => p.type === 'second')?.value;
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch (e) {
      return now.toISOString().replace('T', ' ').substring(0, 19);
    }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Phnom_Penh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        const parts = formatter.formatToParts(now);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        const hour = parts.find(p => p.type === 'hour')?.value;
        const minute = parts.find(p => p.type === 'minute')?.value;
        const second = parts.find(p => p.type === 'second')?.value;
        setSystemTime(`${year}-${month}-${day} ${hour}:${minute}:${second}`);
      } catch (e) {
        setSystemTime(now.toISOString().replace('T', ' ').substring(0, 19));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for PWA installation events
  useEffect(() => {
    const handleBeforePrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    const handleAppInstalledListener = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
      setShowInstallBanner(false);
      showToast('ដំឡើងកម្មវិធីបានជោគជ័យ! PWA Installed Successfully', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforePrompt);
    window.addEventListener('appinstalled', handleAppInstalledListener);

    // Initial display mode check
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsAppInstalled(true);
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforePrompt);
      window.removeEventListener('appinstalled', handleAppInstalledListener);
    };
  }, []);

  // Handle custom install trigger action
  const handlePwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          setShowInstallBanner(false);
        }
      } catch (err) {
        console.warn('Installation prompt deferred choice failed:', err);
      }
    } else {
      // Show an elegant and helpful toast guiding the user to use the browser-native install option
      showToast('សូមចុចលើរូបសញ្ញា "ដំឡើង" (Install) នៅលើរបារអាសយដ្ឋាន (Address Bar) នៃ Chrome/Edge របស់អ្នក ឬចុចសញ្ញាចុចបី (...) → "ដំឡើងកម្មវិធី (Install app)"។', 'success');
    }
  };

  // Trigger Toast Notification
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Defensive navigation guard checking role authorization for restricted views
  useEffect(() => {
    if (sessionUser) {
      if (activeTab === 'users' && sessionUser.role !== 'superadmin' && sessionUser.role !== 'admin') {
        setActiveTab('dashboard');
        showToast('សិទ្ធិមិនគ្រប់គ្រាន់ដើម្បីចូលប្រើប្រាស់ទំព័រនេះទេ (Unauthorized access to Users management)', 'error');
      } else if (activeTab === 'history' && sessionUser.role !== 'superadmin') {
        setActiveTab('dashboard');
        showToast('សិទ្ធិមិនគ្រប់គ្រាន់ដើម្បីចូលប្រើប្រាស់ទំព័រនេះទេ (Unauthorized access to Login History)', 'error');
      } else if (activeTab === 'backup' && sessionUser.role !== 'superadmin') {
        setActiveTab('dashboard');
        showToast('សិទ្ធិមិនគ្រប់គ្រាន់ដើម្បីចូលប្រើប្រាស់ទំព័រនេះទេ (Unauthorized access to Backup Data)', 'error');
      } else if (activeTab === 'developer' && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin') {
        setActiveTab('dashboard');
      }
    }
  }, [activeTab, sessionUser]);

  // 1. Initial State Hydration / Fallback Database
  useEffect(() => {
    // Check for cached dynamic Supabase credentials
    const cachedConfig = localStorage.getItem('nmc_db_config');
    if (cachedConfig) {
      try {
        setDbConfig(JSON.parse(cachedConfig));
      } catch (e) {
        console.error(e);
      }
    }

    // Load LocalStorage initially for immediate smooth paint
    const cachedUsers = localStorage.getItem('nmc_users');
    let initialUsers = INITIAL_USERS;
    if (cachedUsers) {
      try {
        initialUsers = JSON.parse(cachedUsers);
      } catch (e) {
        initialUsers = INITIAL_USERS;
      }
    }
    setUsers(initialUsers);

    const cachedReports = localStorage.getItem('nmc_reports');
    let initialReports = isDemoDataEnabled() ? INITIAL_REPORTS : [];
    if (cachedReports) {
      try {
        initialReports = JSON.parse(cachedReports);
      } catch (e) {
        initialReports = isDemoDataEnabled() ? INITIAL_REPORTS : [];
      }
    }
    setReports(initialReports);

    // Load Active User session if exists
    const savedSession = sessionStorage.getItem('nmc_active_user_session');
    if (savedSession) {
      try {
        setSessionUser(JSON.parse(savedSession));
      } catch (e) {
        console.error(e);
      }
    }

    // Load live Supabase Cloud database asynchronously in the background
    const loadSupabaseCloudData = async () => {
      const activeCfg = getActiveSupabaseConfig();
      setDbConfig(activeCfg);

      if (!activeCfg.url || !activeCfg.anonKey || activeCfg.url.includes('YOUR_SUPABASE_URL')) {
        console.log('Supabase database has not been linked yet. System is operating on local storage schemas.');
        return;
      }

      try {
        setIsUsersLoading(true);
        // Sync users registry from Supabase
        const cloudUsers = await fetchUsersFromSupabase();
        if (cloudUsers && cloudUsers.length > 0) {
          setUsers(cloudUsers);
          localStorage.setItem('nmc_users', JSON.stringify(cloudUsers));
        }

        // Sync metrology reports from Supabase
        const cloudReports = await fetchReportsFromSupabase();
        if (cloudReports) {
          setReports(cloudReports);
          localStorage.setItem('nmc_reports', JSON.stringify(cloudReports));
        }
        
        setDbConfig({
          ...activeCfg,
          isConnected: true
        });
        console.log('Supabase Cloud database synchronized successfully.');
      } catch (error) {
        console.warn('Unable to sync live Supabase data, staying on secure local storage database:', error);
        setDbConfig({
          ...activeCfg,
          isConnected: false
        });
      } finally {
        setIsUsersLoading(false);
      }
    };
    
    loadSupabaseCloudData();
  }, []);

  // Enforce secure query-level data filtering upon user login or session state changes
  useEffect(() => {
    const syncDatabaseOnLogin = async () => {
      const activeCfg = getActiveSupabaseConfig();
      if (activeCfg.url && activeCfg.anonKey && !activeCfg.url.includes('YOUR_SUPABASE_URL')) {
        try {
          const cloudReports = await fetchReportsFromSupabase(sessionUser || undefined);
          if (cloudReports) {
            setReports(cloudReports);
            localStorage.setItem('nmc_reports', JSON.stringify(cloudReports));
          }
        } catch (e) {
          console.warn('Could not refresh session reports list:', e);
        }
      }
    };
    syncDatabaseOnLogin();
  }, [sessionUser]);

  // 1.1 Public Verification via scanned QR-code URL query param checking
  useEffect(() => {
    const runVerification = async () => {
      const params = new URLSearchParams(window.location.search);
      const verifyId = params.get('verifyReport');
      if (verifyId) {
        setVerifyReportId(verifyId);
        
        // Try live production database verification lookup first using secure token (hashing match)
        try {
          const { verifyReportBySecureToken } = await import('./supabaseSync');
          const liveReport = await verifyReportBySecureToken(verifyId);
          
          if (liveReport) {
            setVerifiedReport(liveReport);
            const usersSource = (users && users.length > 0) ? users : INITIAL_USERS;
            const comp = usersSource.find(u => u.license_number === liveReport.license_number || u.company_name_kh === liveReport.company_name_kh);
            setVerifiedCompany(comp || null);
            return;
          }
        } catch (dbErr) {
          console.warn('Live verification check bypassed or timed out, loading local memory storage:', dbErr);
        }

        // Falls back to memory-based local checking if offline or in testing mode
        const reportsSource = (reports && reports.length > 0) ? reports : (isDemoDataEnabled() ? INITIAL_REPORTS : []);
        const usersSource = (users && users.length > 0) ? users : INITIAL_USERS;
        
        if (verifyId === 'filtered') {
          const filterM = params.get('month') || 'all';
          const filterY = params.get('year') || 'all';
          const filterC = params.get('companyId') || 'all';
          const filterS = params.get('serviceType') || 'all';
          const filterQ = params.get('searchQuery') || '';

          let list = [...reportsSource];
          if (filterC !== 'all') {
            list = list.filter(r => r.user_id === filterC);
          }
          if (filterM !== 'all') {
            list = list.filter(r => r.report_month === filterM);
          }
          if (filterY !== 'all') {
            list = list.filter(r => r.report_year === filterY);
          }
          if (filterS !== 'all') {
            list = list.filter(r => r.service_type === filterS);
          }
          if (filterQ.trim()) {
            const q = filterQ.toLowerCase().trim();
            list = list.filter(r => 
              r.customer_name.toLowerCase().includes(q) ||
              r.customer_address.toLowerCase().includes(q) ||
              r.measuring_instrument.toLowerCase().includes(q) ||
              r.instrument_serial_number.toLowerCase().includes(q) ||
              r.company_name_kh.toLowerCase().includes(q)
            );
          }
          setVerifiedReportsList(list);
          if (filterC !== 'all') {
            const comp = usersSource.find(u => u.id === filterC);
            setVerifiedCompany(comp || null);
          } else {
            setVerifiedCompany(null);
          }
        } else {
          // Attempt resolving target report from memory database lists
          const rep = reportsSource.find(r => r.id === verifyId || r.verification_token === verifyId);
          if (rep) {
            setVerifiedReport(rep);
            const comp = usersSource.find(u => u.license_number === rep.license_number || u.company_name_kh === rep.company_name_kh);
            setVerifiedCompany(comp || null);
          } else if (isDemoDataEnabled() && INITIAL_REPORTS && INITIAL_REPORTS.length > 0) {
            const backupRep = INITIAL_REPORTS.find(r => r.id === verifyId || r.verification_token === verifyId);
            if (backupRep) {
              setVerifiedReport(backupRep);
              const backupComp = INITIAL_USERS.find(u => u.license_number === backupRep.license_number || u.company_name_kh === backupRep.company_name_kh);
              setVerifiedCompany(backupComp || null);
            }
          }
        }
      }
    };

    runVerification();
  }, [reports, users]);

  // 1.2 Public License Verification via scanned QR-code URL check
  useEffect(() => {
    const runLicenseVerification = async () => {
      const params = new URLSearchParams(window.location.search);
      let licNum = params.get('verifyLicense');
      
      if (!licNum && window.location.pathname.startsWith('/verify-license/')) {
        const parts = window.location.pathname.split('/');
        licNum = decodeURIComponent(parts[parts.length - 1]);
      }
      
      if (licNum) {
        setVerifyLicenseNo(licNum);
        setIsLicenseVerifying(true);
        
        try {
          const { fetchLicensesFromSupabase } = await import('./supabaseSync');
          const licenses = await fetchLicensesFromSupabase();
          const target = licenses.find(l => l.license_number === licNum || l.id === licNum);
          if (target) {
            setVerifiedLicense(target);
          } else {
            setVerifiedLicense(null);
          }
        } catch (err) {
          console.error('Error verifying license:', err);
          setVerifiedLicense(null);
        } finally {
          setIsLicenseVerifying(false);
        }
      }
    };

    runLicenseVerification();
  }, []);

  // Update localStorage database helpers
  const saveUsersToStore = (newList: MetrologyUser[]) => {
    setUsers(newList);
    localStorage.setItem('nmc_users', JSON.stringify(newList));
  };

  const saveReportsToStore = (newList: MetrologyReport[]) => {
    setReports(newList);
    localStorage.setItem('nmc_reports', JSON.stringify(newList));
  };

  // Auth logins
  const handleLoginSession = (user: MetrologyUser) => {
    setSessionUser(user);
    sessionStorage.setItem('nmc_active_user_session', JSON.stringify(user));
    showToast(`ស្វាគមន៍ការមកកាន់ ឯកឧត្តម/លោក/លោកស្រី៖ ${user.legal_representative || user.username} !`, 'success');
    
    // Call logLoginHistory safely in background without blocking login UI
    logLoginHistory(user).catch(err => {
      console.warn('Logging session history failed:', err);
    });
    
    // Automatically redirect to appropriate page
    if (user.role === 'company') {
      setActiveTab('dashboard');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setSessionUser(null);
    sessionStorage.removeItem('nmc_active_user_session');
    showToast('គណនីរបស់លោកអ្នកបានចាកចេញដោយសុវត្ថិភាពពីប្រព័ន្ធ!', 'success');
  };

  const handlePasswordChanged = (updatedUser: MetrologyUser) => {
    const mergedUser = { ...updatedUser };
    const updatedList = users.map(u => u.id === updatedUser.id ? mergedUser : u);
    saveUsersToStore(updatedList);
    const sessionSafeUser = { ...mergedUser, password: undefined };
    setSessionUser(sessionSafeUser);
    sessionStorage.setItem('nmc_active_user_session', JSON.stringify(sessionSafeUser));
    showToast('ពាក្យសម្ងាត់ត្រូវបានប្តូរដោយជោគជ័យ។ / Password changed successfully.', 'success');
  };

  // User Management callbacks (Superadmin)
  const handleSaveOrUpdateUser = async (newUser: MetrologyUser) => {
    if (!sessionUser) return;

    const exists = users.some(u => u.id === newUser.id);
    const existingUser = users.find(u => u.id === newUser.id);

    // Security check & Role validation
    if (sessionUser.role === 'admin') {
      if (!exists) {
        // Adding new user
        if (newUser.role === 'company' && !sessionUser.admin_can_add_company_user) {
          await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to create company user without permission: @${newUser.username}`);
          showToast('អ្នកមិនមានសិទ្ធិបង្កើតគណនីក្រុមហ៊ុនទេ! / You have no permission to create company users.', 'error');
          return;
        }
        if (newUser.role === 'admin' && !sessionUser.admin_can_add_admin_user) {
          await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to create admin user without permission: @${newUser.username}`);
          showToast('អ្នកមិនមានសិទ្ធិបង្កើតគណនីមន្ត្រីទេ! / You have no permission to create admin users.', 'error');
          return;
        }
      } else {
        // Editing existing user
        if (!sessionUser.admin_can_edit_users) {
          await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to edit user without permission: @${newUser.username}`);
          showToast('អ្នកមិនមានសិទ្ធិកែប្រែព័ត៌មានគណនីទេ! / You do not have permission to edit users.', 'error');
          return;
        }

        // Prevent editing Superadmin accounts by Admins
        if (existingUser?.role === 'superadmin') {
          await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to edit Superadmin account: @${existingUser.username}`);
          showToast('អ្នកមិនអាចកែប្រែគណនី Super Admin បានទេ! / Admin cannot modify Superadmin accounts.', 'error');
          return;
        }

        // Prevent Admin from changing their own role or permissions
        if (newUser.id === sessionUser.id) {
          if (newUser.role !== sessionUser.role || 
              newUser.admin_can_add_company_user !== sessionUser.admin_can_add_company_user ||
              newUser.admin_can_add_admin_user !== sessionUser.admin_can_add_admin_user ||
              newUser.admin_can_edit_users !== sessionUser.admin_can_edit_users ||
              newUser.admin_can_deactivate_users !== sessionUser.admin_can_deactivate_users ||
              newUser.admin_can_view_all_users !== sessionUser.admin_can_view_all_users) {
            await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to modify their own role/permissions: @${newUser.username}`);
            showToast('អ្នកមិនអាចកែប្រែតួនាទី ឬសិទ្ធិផ្ទាល់ខ្លួនបានទេ! / You cannot edit your own role or permissions.', 'error');
            return;
          }
        }

        // Prevent deactivating Superadmin
        if (existingUser?.role === 'superadmin' && newUser.is_active === false) {
          await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to deactivate Superadmin account: @${existingUser.username}`);
          showToast('អ្នកមិនអាចផ្អាកគណនី Super Admin បានទេ! / Cannot deactivate Superadmin account.', 'error');
          return;
        }

        // Admin deactivating users check
        if (existingUser && existingUser.is_active !== false && newUser.is_active === false) {
          if (!sessionUser.admin_can_deactivate_users) {
            await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to deactivate user @${newUser.username} without permission.`);
            showToast('អ្នកមិនមានសិទ្ធិផ្អាកដំណើរការគណនីទេ! / You do not have permission to deactivate users.', 'error');
            return;
          }
        }
      }

      // Admins cannot create Superadmins!
      if (newUser.role === 'superadmin') {
        await logAuditEvent(sessionUser, 'UNAUTHORIZED_USER_CREATE_ATTEMPT', `Admin tried to create or upgrade user @${newUser.username} to superadmin`);
        showToast('អ្នកមិនអាចបង្កើត ឬដំឡើងឋានៈជា Super Admin បានទេ! / Cannot escalate privileges to Superadmin.', 'error');
        return;
      }
    }

    // Capture Audit trail events
    if (!exists) {
      if (sessionUser.role === 'superadmin') {
        await logAuditEvent(sessionUser, 'USER_CREATED_BY_SUPERADMIN', `Superadmin created user account: @${newUser.username}`, newUser.id, newUser.username);
      } else if (sessionUser.role === 'admin') {
        await logAuditEvent(sessionUser, 'USER_CREATED_BY_ADMIN', `Admin created user account: @${newUser.username}`, newUser.id, newUser.username);
      }
    } else {
      if (existingUser) {
        // Detect Deactivation
        if (existingUser.is_active !== false && newUser.is_active === false) {
          await logAuditEvent(sessionUser, 'USER_DEACTIVATED', `Deactivated user account: @${newUser.username}`, newUser.id, newUser.username);
        }

        // Detect Permission Updates for Admin by Superadmin
        if (newUser.role === 'admin' && sessionUser.role === 'superadmin') {
          const permChanged = 
            existingUser.admin_can_add_company_user !== newUser.admin_can_add_company_user ||
            existingUser.admin_can_add_admin_user !== newUser.admin_can_add_admin_user ||
            existingUser.admin_can_edit_users !== newUser.admin_can_edit_users ||
            existingUser.admin_can_deactivate_users !== newUser.admin_can_deactivate_users ||
            existingUser.admin_can_view_all_users !== newUser.admin_can_view_all_users;
            
          if (permChanged) {
            await logAuditEvent(sessionUser, 'ADMIN_PERMISSION_UPDATED', `Superadmin updated permissions for Admin: @${newUser.username}`, newUser.id, newUser.username);
          }
        }
      }
    }

    let updatedList: MetrologyUser[] = [];
    if (exists) {
      updatedList = users.map(u => u.id === newUser.id ? newUser : u);
      showToast(`កែសម្រួលគណនី ${newUser.username} បានសម្រេច!`, 'success');
    } else {
      updatedList = [...users, newUser];
      showToast(`បង្កើតគណនីថ្មី @${newUser.username} បានជោគជ័យ!`, 'success');
    }
    saveUsersToStore(updatedList);

    // Synchronize to Supabase Cloud
    try {
      await saveUserToSupabase(newUser);
    } catch (e) {
      console.warn('Supabase users sync issue:', e);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const updated = users.filter(u => u.id !== userId);
    saveUsersToStore(updated);
    // Also clear associated reports if cascading
    const updatedReports = reports.filter(r => r.user_id !== userId);
    saveReportsToStore(updatedReports);

    // Synchronize deletes to Supabase Cloud
    try {
      await deleteUserFromSupabase(userId);
      // Cascading deletes for reports from Cloud
      const reportsToDelete = reports.filter(r => r.user_id === userId);
      for (const r of reportsToDelete) {
        await deleteReportFromSupabase(r.id);
      }
    } catch (e) {
      console.warn('Supabase users cascading deletes sync issue:', e);
    }
  };

  // Report Form actions
  const handleSaveOrUpdateReport = async (newRecord: MetrologyReport) => {
    const exists = reports.some(r => r.id === newRecord.id);
    let updatedReports: MetrologyReport[] = [];
    if (exists) {
      updatedReports = reports.map(r => r.id === newRecord.id ? newRecord : r);
      showToast('បានកែប្រែព័ត៌មានរបាយការណ៍រួចរាល់!', 'success');
    } else {
      updatedReports = [newRecord, ...reports];
      showToast('បានរក្សាទុករបាយការណ៍ថ្មីក្នុងប្រព័ន្ធជោគជ័យ!', 'success');
    }
    saveReportsToStore(updatedReports);
    setSelectedEditReport(null);

    // Synchronize report to Supabase Cloud
    try {
      await saveReportToSupabase(newRecord);
    } catch (e) {
      console.warn('Supabase reports sync issue:', e);
    }

    // Trigger Telegram Push Notification in the background asynchronously
    sendTelegramNotification(newRecord, exists, users, (msg, type) => showToast(msg, type));
  };

  const handleImportExcelSuccess = async (importedList: MetrologyReport[], summaryText: string) => {
    // 1. Bulk combine reports to state and local storage registry
    const updatedList = [...importedList, ...reports];
    saveReportsToStore(updatedList);

    // 2. Synchronize reports to Supabase Cloud on successful local persistence
    try {
      for (const rep of importedList) {
        await saveReportToSupabase(rep);
      }
    } catch (e) {
      console.warn('Supabase sync bulk load error:', e);
    }

    // 3. Register standard IMPORT_EXCEL_REPORT log
    const storedLogs = localStorage.getItem('nmc_import_history');
    let historyList: any[] = [];
    if (storedLogs) {
      try {
        historyList = JSON.parse(storedLogs);
      } catch (e) {
        // ignore
      }
    }
    const logItem = {
      id: 'import_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      user_id: sessionUser?.id || 'unknown',
      user_email: sessionUser?.email || sessionUser?.username || 'unknown',
      action: 'IMPORT_EXCEL_REPORT',
      description: 'User imported reports from Excel template',
      total_rows: importedList.length,
      success_rows: importedList.length,
      failed_rows: 0,
      timestamp: new Date().toISOString()
    };
    historyList.unshift(logItem);
    localStorage.setItem('nmc_import_history', JSON.stringify(historyList.slice(0, 150)));

    showToast(`ជោគជ័យ៖ បាននាំចូលរបាយការណ៍ចំនួន ${importedList.length} ជួរ!`, 'success');
  };

  const handleDeleteReport = async (id: string) => {
    try {
      // Synchronize report deletion to Supabase Cloud first
      await deleteReportFromSupabase(id);

      // Remove from UI only after Supabase delete succeeds
      const updated = reports.filter(r => r.id !== id);
      saveReportsToStore(updated);
      setSelectedEditReport(null);
      showToast('លុបរបាយការណ៍បានជោគជ័យ! / Deleted report successfully!', 'success');

      // After delete, refetch reports from Supabase to keep state in sync
      const activeCfg = getActiveSupabaseConfig();
      if (activeCfg.url && activeCfg.anonKey && !activeCfg.url.includes('YOUR_SUPABASE_URL')) {
        const cloudReports = await fetchReportsFromSupabase();
        if (cloudReports) {
          setReports(cloudReports);
          localStorage.setItem('nmc_reports', JSON.stringify(cloudReports));
        }
      }
    } catch (e) {
      console.error('Supabase reports deletion sync issue:', e);
      showToast('លុបរបាយការណ៍មិនបានជោគជ័យ៖ សេវាអ៊ីនធឺណិតមានបញ្ហា! / Could not delete report!', 'error');
    }
  };

  // Developer config updater
  const handleUpdateConfig = async (newCfg: Partial<SupabaseConfig>) => {
    const updated = { ...dbConfig, ...newCfg };
    setDbConfig(updated);
    localStorage.setItem('nmc_db_config', JSON.stringify(updated));

    // Force synchronization immediately when credentials are saved or sync is turned on
    if (updated.url && updated.anonKey && !updated.url.includes('YOUR_SUPABASE_URL') && !updated.useFallback) {
      showToast('កំពុងព្យាយាមតភ្ជាប់ និងទាញយកទិន្នន័យពី Supabase Cloud...', 'success');
      try {
        // Fetch active lists
        const cloudUsers = await fetchUsersFromSupabase();
        if (cloudUsers && cloudUsers.length > 0) {
          setUsers(cloudUsers);
          localStorage.setItem('nmc_users', JSON.stringify(cloudUsers));
        }

        const cloudReports = await fetchReportsFromSupabase();
        if (cloudReports) {
          setReports(cloudReports);
          localStorage.setItem('nmc_reports', JSON.stringify(cloudReports));
        }

        setDbConfig({
          ...updated,
          isConnected: true
        });
        showToast('សមកាលកម្មទិន្នន័យជាមួយ Supabase បានជោគជ័យ!', 'success');
      } catch (error) {
        console.error('Supabase updateConfig sync error:', error);
        showToast('ការតភ្ជាប់ទៅកាន់ Supabase បរាជ័យ! សូមពិនិត្យមើល URL, Anon Key, ឬតារាងក្នុង Supabase របស់លោកអ្នក។', 'error');
        setDbConfig({
          ...updated,
          isConnected: false
        });
      }
    } else {
      // Revert/Fallback to local storage states
      const cachedUsers = localStorage.getItem('nmc_users');
      if (cachedUsers) {
        try { setUsers(JSON.parse(cachedUsers)); } catch (e) { setUsers(INITIAL_USERS); }
      } else {
        setUsers(INITIAL_USERS);
      }

      const cachedReports = localStorage.getItem('nmc_reports');
      if (cachedReports) {
        try { setReports(JSON.parse(cachedReports)); } catch (e) { setReports(isDemoDataEnabled() ? INITIAL_REPORTS : []); }
      } else {
        setReports(isDemoDataEnabled() ? INITIAL_REPORTS : []);
      }
    }
  };

  // Filtered reports computed selector
  const getFilteredReports = (): MetrologyReport[] => {
    if (!sessionUser) return [];

    let list = [...reports];

    // Company user can ONLY view their own records as requested in chapter 14:
    // "កុំអនុញ្ញាតឱ្យ User មើលទិន្នន័យក្រុមហ៊ុនផ្សេង"
    if (sessionUser.role === 'company') {
      list = list.filter(r => isReportOwnedByCurrentCompany(r, sessionUser));
    }

    // Apply company selection filter for Admin
    if (sessionUser.role !== 'company' && filterCompanyId !== 'all') {
      list = list.filter(r => r.user_id === filterCompanyId);
    }

    // Month filter
    if (filterMonth !== 'all') {
      list = list.filter(r => r.report_month === filterMonth);
    }

    // Year filter
    if (filterYear !== 'all') {
      list = list.filter(r => r.report_year === filterYear);
    }

    // Service type filter
    if (filterServiceType !== 'all') {
      list = list.filter(r => r.service_type === filterServiceType);
    }

    // Status filter
    if (filterStatus !== 'all') {
      list = list.filter(r => (r.report_status || 'Approved') === filterStatus);
    }

    // Search query query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => 
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_address.toLowerCase().includes(q) ||
        r.measuring_instrument.toLowerCase().includes(q) ||
        r.instrument_serial_number.toLowerCase().includes(q) ||
        r.company_name_kh.toLowerCase().includes(q)
      );
    }

    return list;
  };

  const filteredReportsList = getFilteredReports();
  
  // Pagination helpers
  const totalPages = Math.ceil(filteredReportsList.length / itemsPerPage) || 1;
  const paginatedReports = filteredReportsList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const activeCompanyList = users.filter(u => u.role === 'company');

  // Multi-format export actions
  const handleExportExcel = () => {
    const title = sessionUser?.role === 'company' 
      ? `របាយការណ៍_${sessionUser.company_name_kh}` 
      : 'របាយការណ៍មាត្រាសាស្ត្ររួម_ជាតិ';
    exportReportsToExcel(filteredReportsList, title);
    showToast('សំណុំទិន្នន័យ Excel ត្រូវបានបង្កើត និងទាញយក!', 'success');
  };

  const handleExportWord = async () => {
    const selectedCompany = sessionUser?.role === 'company' 
      ? sessionUser 
      : filterCompanyId !== 'all' 
        ? users.find(u => u.id === filterCompanyId) || null 
        : null;
    await exportToWordDoc(
      filteredReportsList, 
      selectedCompany, 
      sessionUser, 
      filterMonth, 
      filterYear,
      filterServiceType,
      searchQuery
    );
    showToast('ឯកសារសេវាកម្ម Word (.doc) ត្រូវបានទាញយកដោយជោគជ័យ!', 'success');
  };

  // Quick state monitoring values for current view
  const currentLocalTime = systemTime; // dynamic Cambodia Time formatted for aesthetics as requested

  // Render License Verification View if we are verifying a license QR code scan
  if (verifyLicenseNo) {
    const isVerifying = isLicenseVerifying;
    const lic = verifiedLicense;
    
    // Status Logic inside App.tsx
    const getLicenseStatus = () => {
      if (!lic) return { labelKh: 'មិនរកឃើញ', labelEn: 'Not Found', color: 'text-red-500 bg-red-100/10 border-red-500/20' };
      
      const expiryDateStr = lic.license_expiry_date;
      if (!expiryDateStr) return { labelKh: 'មិនទាន់កំណត់', labelEn: 'Not Set', color: 'text-slate-400 bg-slate-900/40 border-slate-800' };
      
      const today = new Date(new Date().toISOString().split('T')[0]);
      const expiry = new Date(expiryDateStr);
      const diffMs = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (lic.license_status === 'Suspended') {
        return { labelKh: 'ផ្អាកជាបណ្តោះអាសន្ន', labelEn: 'Suspended', color: 'text-orange-500 bg-orange-500/10 border-orange-500/25' };
      }
      if (lic.license_status === 'Cancelled') {
        return { labelKh: 'លុបចោល', labelEn: 'Cancelled', color: 'text-red-500 bg-red-500/10 border-red-500/25' };
      }
      
      if (diffDays < 0) {
        return { labelKh: 'ហួសសុពលភាព', labelEn: 'Expired', color: 'text-red-500 bg-red-500/10 border-red-500/25' };
      } else if (diffDays <= 60) {
        return { labelKh: 'ជិតហួសកំណត់', labelEn: 'Expiring Soon', color: 'text-amber-500 bg-amber-550/10 border-amber-550/25' };
      } else {
        return { labelKh: 'សកម្ម / មានសុពលភាព', labelEn: 'Active', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25' };
      }
    };
    
    const statusInfo = getLicenseStatus();
    
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        {isVerifying ? (
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 text-center rounded-2xl p-8 shadow-2xl flex flex-col items-center">
            <span className="animate-spin h-8 w-8 border-4 border-gold border-t-transparent rounded-full mb-3" />
            <p className="text-slate-400 text-xs font-bold">កំពុងផ្ទៀងផ្ទាត់អាជ្ញាប័ណ្ណ... / Verifying license...</p>
          </div>
        ) : lic ? (
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden select-text text-white">
            {/* Top gold bar border */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-500 via-gold to-indigo-600" />
            
            {/* National Metrology Center (NMC) Header in Khmer/English */}
            <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
              <img src={nmcLogo} alt="NMC Logo" className="h-14 w-14 shrink-0 object-contain" referrerPolicy="no-referrer" />
              <div>
                <h1 className="text-xs font-extrabold text-gold tracking-wide leading-tight">ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍</h1>
                <h2 className="text-sm font-black text-slate-100 leading-tight">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC)</h2>
                <p className="text-[9px] text-slate-400 font-mono tracking-wider font-extrabold uppercase mt-0.5">National Metrology Center of Cambodia</p>
              </div>
            </div>

            {/* Title and Badge */}
            <div className="space-y-2 text-center md:text-left">
              <span className="px-3 py-1 bg-[#353C96]/10 text-[#353C96] border border-[#353C96]/20 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono">
                Official Digital Verification ✓
              </span>
              <h3 className="text-lg font-black text-slate-105 mt-2 font-muol leading-relaxed">
                ផ្ទៀងផ្ទាត់អាជ្ញាប័ណ្ណសហគ្រាស
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                ENTERPRISE LICENSE VERIFICATION
              </p>
            </div>

            {/* Alert Status */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${statusInfo.color} font-mono text-xs leading-tight font-black`}>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">ស្ថានភាពផ្លូវការ / License Status</p>
                <p className="text-sm font-black">{statusInfo.labelKh} ({statusInfo.labelEn})</p>
              </div>
              <p className="text-[10px] text-slate-400 italic font-medium hidden sm:block">NMC Public Verification</p>
            </div>

            {/* License Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium font-sans">
              
              <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">ឈ្មោះក្រុមហ៊ុន (Company EN)</span>
                <p className="text-slate-100 text-sm font-extrabold">{lic.company_name}</p>
              </div>

              {lic.company_name_kh && (
                <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">ឈ្មោះក្រុមហ៊ុនជាភាសាខ្មែរ (Company KH)</span>
                  <p className="text-slate-100 text-sm font-bold font-muol leading-loose text-gold">{lic.company_name_kh}</p>
                </div>
              )}

              <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">លេខអាជ្ញាប័ណ្ណ (License Number)</span>
                <p className="text-slate-100 text-sm font-bold font-mono text-[#353C96]">{lic.license_number}</p>
              </div>

              <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">រយៈពេលសុពលភាព (Validity Period)</span>
                <p className="text-slate-100 text-sm font-bold font-sans">3 ឆ្នាំ (3 Years)</p>
              </div>

              <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 col-span-1 md:col-span-2">
                <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">អាសយដ្ឋានសហគ្រាស (Business Address)</span>
                <p className="text-slate-200 text-xs leading-relaxed">{lic.company_address || 'មិនកំណត់ / Not specified'}</p>
              </div>

              <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">កាលបរិច្ឆេទចេញ (Issue Date)</span>
                <p className="text-slate-100 text-sm font-bold font-mono">{lic.license_issue_date}</p>
              </div>

              <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">កាលបរិច្ឆេទផុតកំណត់ (Expiry Date)</span>
                <p className="text-slate-100 text-sm font-bold font-mono text-red-400">{lic.license_expiry_date}</p>
              </div>

              {lic.business_type && (
                <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">ប្រភេទអាជីវកម្ម (Business Type)</span>
                  <p className="text-slate-200 text-xs">{lic.business_type}</p>
                </div>
              )}

              {lic.service_scope && (
                <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">វិសាលភាពសេវាកម្ម (Service Scope)</span>
                  <p className="text-slate-200 text-xs">{lic.service_scope}</p>
                </div>
              )}

              {lic.measuring_instrument_type && (
                <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 col-span-1 md:col-span-2">
                  <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">ឧបករណ៍វាស់វែង (Measuring Instrument)</span>
                  <p className="text-slate-200 text-xs font-semibold">{lic.measuring_instrument_type}</p>
                </div>
              )}

            </div>

            {/* Official seal footer statement */}
            <div className="pt-4 border-t border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center text-[10px] text-slate-400 gap-2">
              <p>កាលបរិច្ឆេទផ្ទៀងផ្ទាត់ផ្លូវការ / Official verification time:</p>
              <p className="font-mono text-slate-400">{new Date().toLocaleString('km-KH')} (GMT+7)</p>
            </div>

            {/* Close button */}
            <button
              onClick={() => {
                setVerifyLicenseNo(null);
                setVerifiedLicense(null);
                window.history.replaceState({}, '', '/');
              }}
              className="w-full py-3 bg-[#353C96] hover:bg-[#2D327F] text-white border border-[#C9D2E3]/30 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 mt-4"
            >
              <span>ត្រឡប់ក្រោយ (Go to Portal Login)</span>
            </button>
            
          </div>
        ) : (
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 text-center rounded-2xl p-8 shadow-2xl relative select-text text-white">
            <div className="mx-auto h-16 w-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-5 border border-red-500/20">
              <span className="text-2xl font-bold font-mono">✕</span>
            </div>
            <h2 className="text-lg font-bold leading-snug">រកមិនឃើញទិន្នន័យអាជ្ញាប័ណ្ណនេះទេ / Record Not Found</h2>
            <p className="text-xs text-slate-400 font-medium leading-relaxed mt-3">
              លេខកូដស្កេនដែលលោកអ្នកកំពុងផ្ទៀងផ្ទាត់ មិនមាននៅក្នុងសំណុំទិន្នន័យអាជ្ញាប័ណ្ណសហគ្រាសផ្លូវការរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិឡើយ។
            </p>
            <div className="bg-black/20 font-mono text-[10px] text-slate-500 p-2.5 rounded-lg border border-slate-800 mt-4 break-all">
              License Reference: {verifyLicenseNo}
            </div>
            <button
              onClick={() => {
                setVerifyLicenseNo(null);
                setVerifiedLicense(null);
                window.history.replaceState({}, '', '/');
              }}
              className="mt-6 w-full py-2 bg-[#353C96] hover:bg-[#2D327F] text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              ត្រឡប់ក្រោយ / Close Verify
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render Verification View if we are verifying a QR code scan
  if (verifyReportId) {
    const hasData = verifiedReport || verifiedReportsList.length > 0;
    const searchParams = new URLSearchParams(window.location.search);
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        {hasData ? (
          <ReportPrintLayout 
            reports={verifiedReport ? [verifiedReport] : verifiedReportsList}
            selectedUser={verifiedCompany}
            currentUser={null}
            filterMonth={verifiedReport ? verifiedReport.report_month : (searchParams.get('month') || 'all')}
            filterYear={verifiedReport ? verifiedReport.report_year : (searchParams.get('year') || 'all')}
            filterServiceType={verifiedReport ? verifiedReport.service_type : (searchParams.get('serviceType') || 'all')}
            searchQuery={verifiedReport ? '' : (searchParams.get('searchQuery') || '')}
            isPublicVerify={true}
            onClose={() => {
              setVerifyReportId(null);
              setVerifiedReport(null);
              setVerifiedCompany(null);
              setVerifiedReportsList([]);
              window.history.replaceState({}, '', window.location.pathname);
            }}
          />
        ) : (
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 text-center rounded-2xl p-8 shadow-2xl relative">
            <div className="mx-auto h-16 w-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-5 border border-red-500/20">
              <span className="text-2xl font-bold font-mono">✕</span>
            </div>
            <h2 className="text-lg font-bold text-white leading-snug">រកមិនឃើញទិន្នន័យរបាយការណ៍ / Record Not Found</h2>
            <p className="text-xs text-slate-400 font-medium leading-relaxed mt-3">
              កូដស្កេនដែលលោកអ្នកកំពុងផ្ទៀងផ្ទាត់មិនមាននៅក្នុងសំណុំទិន្នន័យផ្លូវការរបស់មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិឡើយ។
            </p>
            <div className="bg-black/20 font-mono text-[10px] text-slate-500 p-2.5 rounded-lg border border-slate-800 mt-4 break-all">
              Record ID: {verifyReportId}
            </div>
            <button
              onClick={() => {
                setVerifyReportId(null);
                setVerifiedReport(null);
                setVerifiedCompany(null);
                setVerifiedReportsList([]);
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className="mt-6 w-full py-2 bg-[#353C96] hover:bg-[#2D327F] text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              ត្រឡប់ក្រោយ / Close Verify
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render Login page if not authenticated
  if (!sessionUser) {
    return (
      <div className="relative min-h-screen">
        <div className="fixed right-4 top-4 z-[1000]">
          <LanguageSwitch language={language} onChange={handleLanguageChange} />
        </div>
        <LoginScreen 
          onLoginSuccess={handleLoginSession} 
          usersList={users} 
          isUsersLoading={isUsersLoading}
        />
      </div>
    );
  }

  return (
    <div id="application-container" className={`nmc-official-system nmc-page ${sessionUser.role === 'superadmin' ? 'nmc-superadmin-theme' : ''} min-h-screen bg-slate-100 flex flex-col justify-between selection:bg-slate-100 selection:text-[#2D327F] font-sans`}>
      
      {/* Toast alert notifications system */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl p-4 shadow-2xl border flex gap-3 text-xs font-semibold leading-relaxed animate-bounce bg-white border-slate-200">
          <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
          <div>
            <p className={`${toast.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
              {toast.msg}
            </p>
          </div>
        </div>
      )}

      {showChangePassword && sessionUser && (
        <ChangePasswordModal
          currentUser={sessionUser}
          usersList={users}
          onClose={() => setShowChangePassword(false)}
          onPasswordChanged={handlePasswordChanged}
        />
      )}

      {/* Main Administrative Layout View */}
      <div className="flex-1 flex flex-col md:flex-row">
        
        {/* Mobile Navigation Header Bar */}
        <div className="nmc-sidebar md:hidden bg-navy text-slate-200 border-b border-slate-800 flex flex-col select-none shrink-0 w-full">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h4 className="font-bold text-[11px] text-gold tracking-wide font-muol leading-loose">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h4>
                <p className="text-[9px] text-slate-400 font-medium tracking-wide">National Metrology Center of Cambodia</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <LanguageSwitch language={language} onChange={handleLanguageChange} dark />
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-1.5 rounded-lg bg-white/5 border border-slate-800 text-slate-300 hover:text-white"
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Collapsible Mobile Navigation Links & Session */}
          {isMobileMenuOpen && (
            <div className="border-t border-slate-800 bg-black/10 divide-y divide-slate-850 px-4 py-2 space-y-4">
              {/* Profile card */}
              <div className="py-2 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-gold/10 border border-gold/25 text-gold">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-black text-slate-200">{sessionUser.legal_representative || sessionUser.username}</span>
                </div>
                
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <p>សិទ្ធិ៖ <strong className="text-gold">{sessionUser.role.toUpperCase()}</strong></p>
                </div>
                
                {sessionUser.role === 'company' && (
                  <div className="text-[10px] bg-black/20 p-2 rounded border border-slate-800/80 leading-relaxed font-sans text-slate-300">
                    <p className="font-bold">ក្រុមហ៊ុន៖ {sessionUser.company_name_kh}</p>
                    <p className="font-mono text-[9px] text-gold/90 mt-0.5">អាជ្ញាប័ណ្ណ៖ {sessionUser.license_number}</p>
                  </div>
                )}
              </div>

              {/* Navigation Anchors */}
              <nav className="py-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('dashboard');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer justify-start ${
                    activeTab === 'dashboard' 
                      ? 'bg-gold/10 text-gold border-r-4 border-gold' 
                      : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                  }`}
                >
                  <Activity className="h-4 w-4 shrink-0 text-gold" />
                  <span>ផ្ទាំងគ្រប់គ្រង (Dashboard)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('reports');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer justify-start ${
                    activeTab === 'reports' 
                      ? 'bg-gold/10 text-gold border-r-4 border-gold' 
                      : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                  }`}
                >
                  <NotebookTabs className="h-4 w-4 shrink-0 text-gold" />
                  <span>របាយការណ៍ប្រចាំខែ (Reports)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('licenses');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer justify-start ${
                    activeTab === 'licenses' 
                      ? 'bg-gold/10 text-gold border-r-4 border-gold' 
                      : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                  }`}
                >
                  <Award className="h-4 w-4 shrink-0 text-gold" />
                  <span>បញ្ជីអាជ្ញាប័ណ្ណសហគ្រាស (Licenses)</span>
                </button>

                {(sessionUser.role === 'superadmin' || sessionUser.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('users');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer justify-start ${
                      activeTab === 'users' 
                        ? 'bg-gold/10 text-gold border-r-4 border-gold' 
                        : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                    }`}
                  >
                    <Users className="h-4 w-4 shrink-0 text-gold" />
                    <span>គ្រប់គ្រងគណនីក្រុមហ៊ុន (Users)</span>
                  </button>
                )}

                {sessionUser.role === 'superadmin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('history');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer justify-start ${
                      activeTab === 'history' 
                        ? 'bg-gold/10 text-gold border-r-4 border-gold' 
                        : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                    }`}
                  >
                    <Clock className="h-4 w-4 shrink-0 text-gold" />
                    <span>ប្រវត្តិចូលប្រើប្រាស់ (Login History)</span>
                  </button>
                )}

                {sessionUser.role === 'superadmin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('backup');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer justify-start ${
                      activeTab === 'backup' 
                        ? 'bg-gold/10 text-gold border-r-4 border-gold' 
                        : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                    }`}
                  >
                    <Database className="h-4 w-4 shrink-0 text-gold" />
                    <span>បម្រុងទុកទិន្នន័យ (Backup Data)</span>
                  </button>
                )}

                {sessionUser.role !== 'company' && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('developer');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer justify-start ${
                      activeTab === 'developer' 
                        ? 'bg-gold/10 text-gold border-r-4 border-gold' 
                        : 'text-slate-400 hover:bg-white/[0.02] hover:text-white'
                    }`}
                  >
                    <Settings2 className="h-4 w-4 shrink-0 text-gold" />
                    <span>សមកាលកម្ម Supabase (Sync)</span>
                  </button>
                )}
              </nav>

              {/* Timezone & Logout */}
              <div className="py-3 space-y-3">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-550 font-mono">
                  <Clock className="h-3.5 w-3.5" />
                  <span>GMT+7 : {systemTime.split(' ')[0]}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setShowChangePassword(true);
                  }}
                  className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 text-slate-200 border border-slate-800 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>ប្តូរពាក្យសម្ងាត់ / Change Password</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full py-2 px-3 bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/15 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 animate-pulse"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>ចាកចេញពីប្រព័ន្ធ / Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Sidebar Drawer - Section 13 */}
        <aside className="nmc-sidebar hidden md:flex md:w-64 bg-navy text-slate-300 flex-col justify-between border-r border-slate-800/80 shrink-0 select-none">
          <div>
            {/* National Metrology Center sidebar brand */}
            <div className="p-5 border-b border-slate-850 bg-black/10">
              <div>
                <h4 className="font-bold text-[12px] text-gold tracking-wide font-muol leading-loose">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</h4>
                <p className="text-[9px] text-slate-400 font-medium tracking-wide">National Metrology Center of Cambodia</p>
              </div>
            </div>

            {/* Current authenticated member Profile info card - Section 6.1 */}
            <div className="p-4 bg-black/20 border-b border-slate-850 space-y-2">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-gold/10 border border-gold/25 text-gold">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-black text-slate-200 line-clamp-1">{sessionUser.legal_representative || sessionUser.username}</span>
              </div>
              
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="line-clamp-1">សិទ្ធិ៖ <strong className="text-gold">{sessionUser.role.toUpperCase()}</strong></p>
              </div>
              
              {sessionUser.role === 'company' && (
                <div className="text-[10px] bg-black/20 p-2 rounded border border-slate-800/80 leading-relaxed font-sans text-slate-300">
                  <p className="font-bold line-clamp-1">ក្រុមហ៊ុន៖ {sessionUser.company_name_kh}</p>
                  <p className="font-mono text-[9px] text-gold/90 mt-0.5">អាជ្ញាប័ណ្ណ៖ {sessionUser.license_number}</p>
                </div>
              )}
            </div>

            {/* Nav anchors list */}
            <nav className="p-0 py-2 space-y-0.5">
              {/* Dashboard tab anchor */}
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold transition-all cursor-pointer justify-start rounded-none ${
                  activeTab === 'dashboard' 
                    ? 'bg-white/5 text-white border-r-4 border-gold shadow-xs' 
                    : 'text-slate-400 hover:bg-white/[0.02] hover:text-white border-r-4 border-transparent'
                }`}
              >
                <Activity className="h-4 w-4 shrink-0 text-gold" />
                <span>ផ្ទាំងគ្រប់គ្រង (Dashboard)</span>
              </button>

              {/* Reports input entry tab anchor */}
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold transition-all cursor-pointer justify-start rounded-none ${
                  activeTab === 'reports' 
                    ? 'bg-white/5 text-white border-r-4 border-gold shadow-xs' 
                    : 'text-slate-400 hover:bg-white/[0.02] hover:text-white border-r-4 border-transparent'
                }`}
              >
                <NotebookTabs className="h-4 w-4 shrink-0 text-gold" />
                <span>របាយការណ៍ប្រចាំខែ (Reports)</span>
              </button>

              {/* Licenses Registry Tab Anchor */}
              <button
                type="button"
                onClick={() => setActiveTab('licenses')}
                className={`w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold transition-all cursor-pointer justify-start rounded-none ${
                  activeTab === 'licenses' 
                    ? 'bg-white/5 text-white border-r-4 border-gold shadow-xs' 
                    : 'text-slate-400 hover:bg-white/[0.02] hover:text-white border-r-4 border-transparent'
                }`}
              >
                <Award className="h-4 w-4 shrink-0 text-gold" />
                <span>បញ្ជីអាជ្ញាប័ណ្ណសហគ្រាស (Licenses)</span>
              </button>

              {/* User management tab anchor (Restricted to Admins!) */}
              {(sessionUser.role === 'superadmin' || sessionUser.role === 'admin') && (
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold transition-all cursor-pointer justify-start rounded-none ${
                    activeTab === 'users' 
                      ? 'bg-white/5 text-white border-r-4 border-gold shadow-xs' 
                      : 'text-slate-400 hover:bg-white/[0.02] hover:text-white border-r-4 border-transparent'
                  }`}
                >
                  <Users className="h-4 w-4 shrink-0 text-gold" />
                  <span>គ្រប់គ្រងគណនីក្រុមហ៊ុន (Users)</span>
                </button>
              )}

              {sessionUser.role === 'superadmin' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold transition-all cursor-pointer justify-start rounded-none ${
                    activeTab === 'history' 
                      ? 'bg-white/5 text-white border-r-4 border-gold shadow-xs' 
                      : 'text-slate-400 hover:bg-white/[0.02] hover:text-white border-r-4 border-transparent'
                  }`}
                >
                  <Clock className="h-4 w-4 shrink-0 text-gold" />
                  <span>ប្រវត្តិចូលប្រើប្រាស់ (Login History)</span>
                </button>
              )}

              {sessionUser.role === 'superadmin' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('backup')}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold transition-all cursor-pointer justify-start rounded-none ${
                    activeTab === 'backup' 
                      ? 'bg-white/5 text-white border-r-4 border-gold shadow-xs' 
                      : 'text-slate-400 hover:bg-white/[0.02] hover:text-white border-r-4 border-transparent'
                  }`}
                >
                  <Database className="h-4 w-4 shrink-0 text-gold" />
                  <span>បម្រុងទុកទិន្នន័យ (Backup Data)</span>
                </button>
              )}

              {/* Developer integration panel (Hidden for company context) */}
              {sessionUser.role !== 'company' && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('developer')}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold transition-all cursor-pointer justify-start rounded-none ${
                    activeTab === 'developer' 
                      ? 'bg-white/5 text-white border-r-4 border-gold shadow-xs' 
                      : 'text-slate-400 hover:bg-white/[0.02] hover:text-white border-r-4 border-transparent'
                  }`}
                >
                  <Settings2 className="h-4 w-4 shrink-0 text-gold" />
                  <span>សមកាលកម្ម Supabase (Sync)</span>
                </button>
              )}
            </nav>
          </div>

          {/* Logout column footer */}
          <div className="p-4 border-t border-slate-850 space-y-3">
            <LanguageSwitch language={language} onChange={handleLanguageChange} dark />

            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
              <Clock className="h-3.5 w-3.5" />
              <span>GMT+7 : {systemTime.split(' ')[0]}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="w-full py-2 px-3 hover:bg-white/5 text-slate-300 hover:text-white border border-slate-800 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>ប្តូរពាក្យសម្ងាត់ / Change Password</span>
            </button>
            
            <button
              type="button"
              id="logout-button-sidebar"
              onClick={handleLogout}
              className="w-full py-2 px-3 hover:bg-red-500/10 text-red-400 hover:text-red-300 border border-slate-800 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>ចាកចេញពីប្រព័ន្ធ / Logout</span>
            </button>
          </div>
        </aside>

        {/* Dashboard Context content panel */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Dashboard Header Bar */}
          <header className="nmc-official-header nmc-superadmin-header text-white py-5 px-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md shrink-0 border-b border-[#3F7C9B]/30">
            <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
              <img 
                src={nmcLogo} 
                alt="NMC Logo" 
                className="nmc-official-header__logo object-contain shrink-0 drop-shadow-md" 
                referrerPolicy="no-referrer"
              />
              <div className="space-y-1">
                <h1 className="nmc-official-header__title-kh font-bold tracking-wide text-white drop-shadow-xs" style={{ fontFamily: '"Khmer OS Muol Light", "Khmer OS Moul Light", "Khmer OS Muol", "Noto Serif Khmer", serif' }}>
                  ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍
                </h1>
                <h2 className="nmc-official-header__title-en font-semibold text-slate-100/90 font-muol tracking-wide leading-relaxed">
                  មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ - National Metrology Center of Cambodia
                </h2>
              </div>
            </div>
            
            <div className="flex items-center gap-2.5">
              <LanguageSwitch language={language} onChange={handleLanguageChange} dark />

              <span className="nmc-superadmin-profile hidden lg:inline-flex items-center gap-2.5 text-[10px] font-bold text-white">
                <BriefcaseBusiness className="h-4 w-4 text-[#F2B632]" />
                <span className="leading-tight">
                  <strong className="block text-sm font-black">{sessionUser?.legal_representative || sessionUser?.username}</strong>
                  <small className="block text-[10px] text-white/75">{sessionUser.role === 'superadmin' ? 'Superadmin' : sessionUser.role}</small>
                </span>
              </span>
            </div>
          </header>

          {sessionUser.role === 'superadmin' && (
            <div className="nmc-superadmin-strip">
              <div className="nmc-superadmin-breadcrumb">ទំព័រដើម / Dashboard</div>
              <div className="nmc-superadmin-date">
                <span>{systemTime.split(' ')[0]} (GMT+7)</span>
                <strong>{systemTime.split(' ')[1] || systemTime}</strong>
              </div>
            </div>
          )}

          {/* Interactive tabs details viewer */}
          <main className="nmc-content flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
            
            {/* A. DASHBOARD VIEW: Summary analysis */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-fade-in duration-300">
                {sessionUser.role === 'superadmin' ? (
                  <SuperadminDashboard
                    currentUser={sessionUser}
                    reports={reports}
                    users={users}
                    activeCompanyList={activeCompanyList}
                  />
                ) : (
                  <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-lg">ផ្ទាំងគ្រប់គ្រងទិន្នន័យរួម (Overall State Analyst)</h3>
                    <p className="text-xs text-slate-400 mt-0.5">ស្ថិតិសង្ខេបនៃការផ្គត់ផ្គង់ និងផលិត តម្លើង ជួសជុលឧបករណ៍មាត្រាសាស្ត្រ</p>
                  </div>
                  
                  {sessionUser.role === 'company' && (
                    <button
                      onClick={() => setActiveTab('reports')}
                      className="px-4 py-2 bg-[#353C96] hover:bg-[#2D327F] text-white rounded-lg text-xs font-bold shadow transition-all cursor-pointer"
                    >
                      + បំពេញរបាយការណ៍ថ្មី
                    </button>
                  )}
                </div>

                {/* Main Stats widgets */}
                <DashboardStats 
                  currentUser={sessionUser} 
                  reports={filteredReportsList} 
                  allUsersCount={activeCompanyList.length}
                />

                {/* Superadmin Exclusive: Top 3 Company Services Ranking */}
                {sessionUser.role === 'superadmin' && (
                  <TopServiceCompanies 
                    reports={reports} 
                    users={users} 
                  />
                )}

                {/* Dashboard bottom quick insights panel */}
                <div className="bg-slate-900 rounded-xl p-6 text-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#353C96]/10 rounded-full blur-3xl"></div>
                  <div className="space-y-2">
                    <p className="text-amber-500 text-xs font-bold uppercase tracking-wider">សេចក្ដីណែនាំព័ត៌មានប្រចាំខែ (National Instructions Update)</p>
                    <h4 className="text-sm font-black md:text-base leading-relaxed">ដើម្បីរក្សាសន្តិសុខទន្នន័យ និងលេខកូដសម្ងាត់សហគ្រាសទទួលបានអាជ្ញាប័ណ្ណ ៖</h4>
                    <p className="text-[11px] text-slate-350 leading-relaxed max-w-xl font-normal">
                      រាល់សហគ្រាសទាំងអស់ត្រូវបំពេញព័ត៌មានអំពីឧបករណ៍មាត្រាសាស្ត្រ អតិថិជន និងគ្រឿងបន្លាស់ឱ្យបានគ្រប់ជ្រុងជ្រោយបំផុត។ របាយការណ៍នីមួយៗអាចទាញយកជាទម្រង់ឯកសាររដ្ឋបាលផ្លូវការ PDF, Word ឬ Excel សម្រាប់យកទៅដាក់ជូននាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម។
                    </p>
                  </div>
                  <div className="shrink-0 flex gap-2">
                    <button
                      onClick={handleExportExcel}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                      ទាញយក Excel រួម
                    </button>
                    <button
                      onClick={() => setIsPrintAllPreview(true)}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 border border-transparent text-xs font-bold rounded-lg transition-all shadow shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="h-4 w-4" />
                      បោះពុម្ព PDF សរុប
                    </button>
                  </div>
                </div>
                  </>
                )}
              </div>
            )}

            {/* B. REPORT PORTAL: Submission & tables */}
            {activeTab === 'reports' && (
              <div className="space-y-6 animate-fade-in duration-300">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-lg">រៀបចំ និងបំពេញរបាយការណ៍ប្រចាំខែ</h3>
                    <p className="text-xs text-slate-400 mt-0.5">បញ្ចូលថ្មី ឬកែប្រែទិន្នន័យសេវាកម្មមាត្រាសាស្ត្រ</p>
                  </div>
                  
                  {/* Quick toggle list printable */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={handleExportExcel}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                      <span>Export Excel</span>
                    </button>
                    <button
                      onClick={handleExportWord}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                      <span>Export Word</span>
                    </button>
                    <button
                      onClick={() => setIsPrintAllPreview(true)}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow transition-colors cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-amber-400" />
                      <span>Print PDF</span>
                    </button>
                  </div>
                </div>

                {/* Addition Switch Toggles */}
                {sessionUser.can_save && !selectedEditReport && (
                  <div className="flex bg-slate-100 p-1 rounded-lg max-w-sm">
                    <button
                      onClick={() => setAddReportMethod('manual')}
                      className={`flex-1 text-center py-2 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                        addReportMethod === 'manual'
                          ? 'bg-white text-slate-800 shadow-xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      បញ្ចូលម្តងមួយ / Add One by One
                    </button>
                    <button
                      onClick={() => setAddReportMethod('excel')}
                      className={`flex-1 text-center py-2 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                        addReportMethod === 'excel'
                          ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Upload Excel Template
                    </button>
                  </div>
                )}

                {/* Form or Excel Upload column based on permission view */}
                {selectedEditReport ? (
                  <ReportForm 
                    currentUser={sessionUser}
                    selectedReport={selectedEditReport}
                    onSubmitReport={handleSaveOrUpdateReport}
                    onDeleteReport={handleDeleteReport}
                    onClearActiveEdit={() => setSelectedEditReport(null)}
                    toastMsg={showToast}
                  />
                ) : sessionUser.can_save ? (
                  addReportMethod === 'excel' ? (
                    <ExcelReportUpload
                      currentUser={sessionUser}
                      allUsers={users}
                      existingReports={reports}
                      onImportSuccess={handleImportExcelSuccess}
                      toastMsg={showToast}
                    />
                  ) : (
                    <ReportForm 
                      currentUser={sessionUser}
                      selectedReport={null}
                      onSubmitReport={handleSaveOrUpdateReport}
                      onDeleteReport={handleDeleteReport}
                      onClearActiveEdit={() => setSelectedEditReport(null)}
                      toastMsg={showToast}
                    />
                  )
                ) : (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs text-slate-500 font-medium">
                    ⚠️ គណនីរបស់អ្នកត្រូវបានកំណត់សិទ្ធិមិនឱ្យបំពេញ ឬកែព័ត៌មានថ្មីឡើយ។ ប្រសិនបើត្រូវការសិទ្ធិបន្ថែម សូមទាក់ទងមកមជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ។
                  </div>
                )}

                {/* 8. User Reports tabular data list */}
                <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
                  
                  {/* Dynamic Database filters & search layout */}
                  <div className="p-5 border-b border-slate-100 space-y-4">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">តារាងរបាយការណ៍លម្អិត ({filteredReportsList.length} កំណត់ត្រា)</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">ចម្រោះ និងស្វែងរកព័ត៌មានលម្អិត</p>
                      </div>

                      {/* Main global Search box - section 8 & 9.2 */}
                      <div className="relative max-w-sm w-full">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#353C96]"
                          placeholder="ស្វែងរកតាម អតិថិជន លេខស៊េរី ឧបករណ៍ ក្រុមហ៊ុន..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1); // Back to page 1
                          }}
                        />
                      </div>
                    </div>

                    {/* Extended filters grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 pt-2">
                      
                      {/* Filter by Month */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">ចម្រោះតាមខែ (Month)</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#353C96] focus:bg-white"
                          value={filterMonth}
                          onChange={(e) => {
                            setFilterMonth(e.target.value);
                            setCurrentPage(1);
                          }}
                        >
                          <option value="all">គ្រប់ខែទាំងអស់ / All months</option>
                          <option value="01">មករា (01)</option>
                          <option value="02">កុម្ភៈ (02)</option>
                          <option value="03">មីនា (03)</option>
                          <option value="04">មេសា (04)</option>
                          <option value="05">ឧសភា (05)</option>
                          <option value="06">មិថុនា (06)</option>
                          <option value="07">កក្កដា (07)</option>
                          <option value="08">សីហា (08)</option>
                          <option value="09">កញ្ញា (09)</option>
                          <option value="10">តុលា (10)</option>
                          <option value="11">វិច្ឆិកា (11)</option>
                          <option value="12">ធ្នូ (12)</option>
                        </select>
                      </div>

                      {/* Filter by Year */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">ឆ្នាំរបាយការណ៍ (Year)</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#353C96] focus:bg-white"
                          value={filterYear}
                          onChange={(e) => {
                            setFilterYear(e.target.value);
                            setCurrentPage(1);
                          }}
                        >
                          <option value="all">គ្រប់ឆ្នាំទាំងអស់ / All years</option>
                          <option value="2024">ឆ្នាំ 2024</option>
                          <option value="2025">ឆ្នាំ 2025</option>
                          <option value="2026">ឆ្នាំ 2026</option>
                          <option value="2027">ឆ្នាំ 2027</option>
                        </select>
                      </div>

                      {/* Filter by Service Type */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">ប្រភេទសេវាកម្ម (Service Type)</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#353C96] focus:bg-white"
                          value={filterServiceType}
                          onChange={(e) => {
                            setFilterServiceType(e.target.value);
                            setCurrentPage(1);
                          }}
                        >
                          <option value="all">គ្រប់ប្រភេទទាំងអស់ / All</option>
                          <option value="Manufacture">ផលិត (Manufacture)</option>
                          <option value="Installation">តម្លើង (Installation)</option>
                          <option value="Repair">ជួសជុល (Repair)</option>
                        </select>
                      </div>

                      {/* Filter by Status */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">ស្ថានភាពឯកសារ (Status)</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#353C96] focus:bg-white"
                          value={filterStatus}
                          onChange={(e) => {
                            setFilterStatus(e.target.value);
                            setCurrentPage(1);
                          }}
                        >
                          <option value="all">គ្រប់ស្ថានភាពទាំងអស់ / All</option>
                          <option value="Draft">Draft (ព្រាង)</option>
                          <option value="Submitted">Submitted (បានដាក់ជូន)</option>
                          <option value="Under Review">Under Review (វាយតម្លៃ)</option>
                          <option value="Approved">Approved (អនុម័ត)</option>
                          <option value="Rejected">Rejected (បដិសេធ)</option>
                        </select>
                      </div>

                      {/* Filter by Licensing company -> Only visible to Admins/Superadmins! */}
                      {sessionUser.role !== 'company' && (
                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">ក្រុមហ៊ុន (Company)</label>
                          <select
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#353C96] focus:bg-white"
                            value={filterCompanyId}
                            onChange={(e) => {
                              setFilterCompanyId(e.target.value);
                              setCurrentPage(1);
                            }}
                          >
                            <option value="all">គ្រប់ក្រុមហ៊ុនទាំងអស់ / All companies</option>
                            {activeCompanyList.map(item => (
                              <option key={item.id} value={item.id}>{item.company_name_kh}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Desktop view responsive table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#353C96] text-white text-[10px] font-bold uppercase tracking-wider">
                          <th className="p-4 text-center w-12 text-white">ល.រ</th>
                          {sessionUser.role !== 'company' && <th className="p-4">ក្រុមហ៊ុនទទួលបានអាជ្ញាប័ណ្ណ</th>}
                          <th className="p-4">ឈ្មោះអតិថិជន និងអាសយដ្ឋាន</th>
                          <th className="p-4">ឈ្មោះឧបករណ៍វាស់វែង</th>
                          <th className="p-4 text-center">លេខស៊េរី / វិសាលភាពវាស់</th>
                          <th className="p-4">គ្រឿងបន្លាស់មាត្រាសាស្ត្រ</th>
                          <th className="p-4 text-center">ប្រភេទសេវាកម្ម</th>
                          <th className="p-4 text-center">កាលបរិច្ឆេទធ្វើសេវាកម្ម</th>
                          <th className="p-4 text-center">ស្ថានភាព</th>
                          <th className="p-4 text-center w-36">សកម្មភាព</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedReports.map((r, i) => (
                          <tr
                            key={r.id}
                            className={`hover:bg-slate-50/70 transition-colors ${
                              selectedEditReport?.id === r.id ? 'bg-slate-500/5' : ''
                            }`}
                          >
                            <td className="p-4 text-center font-mono text-slate-400">
                              {(currentPage - 1) * itemsPerPage + i + 1}
                            </td>
                            
                            {sessionUser.role !== 'company' && (
                              <td className="p-4">
                                <div className="font-bold text-slate-900 leading-snug">{r.company_name_kh}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">License: {r.license_number}</div>
                              </td>
                            )}
                            
                            <td className="p-4">
                              <div className="font-bold text-slate-800 leading-snug">{r.customer_name}</div>
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3 inline text-slate-400" />
                                <span className="line-clamp-1">{r.customer_address}</span>
                              </div>
                            </td>
                            
                            <td className="p-4 leading-normal">
                              <div className="font-semibold text-slate-700">{r.measuring_instrument}</div>
                            </td>
                            
                            <td className="p-4 text-center">
                              <div className="font-mono font-bold text-slate-700 text-[10px]">{r.instrument_serial_number}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{r.scope_of_weight_measure}</div>
                            </td>
                            
                            <td className="p-4">
                              <div className="text-slate-600">{r.spare_parts || '-'}</div>
                              {r.spare_part_serial_number && (
                                <div className="text-[9px] font-mono text-slate-400 mt-0.5">S/N: {r.spare_part_serial_number}</div>
                              )}
                            </td>
 
                            <td className="p-4 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.service_type === 'Manufacture'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-500/10'
                                    : r.service_type === 'Installation'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-500/10'
                                    : 'bg-amber-50 text-amber-700 border border-amber-500/10'
                                }`}
                              >
                                {getServiceTypeKH(r.service_type).split(' ')[0]}
                              </span>
                            </td>
 
                            <td className="p-4 text-center text-[10px] font-mono leading-relaxed text-slate-600">
                              {r.service_start_date} <br /> ដល់ {r.service_end_date}
                              <div className="text-[9px] text-slate-400 font-sans mt-0.5">
                                សម្រាប់៖ {getMonthNameKH(r.report_month)} {r.report_year}
                              </div>
                            </td>

                            <td className="p-4 text-center">
                              {(() => {
                                const st = r.report_status || 'Approved';
                                if (st === 'Draft') {
                                  return <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-300">Draft (ព្រាង)</span>;
                                } else if (st === 'Submitted') {
                                  return <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-500/10">Submitted (ផ្ញើជូន)</span>;
                                } else if (st === 'Under Review') {
                                  return <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-500/10">Review (វាយតម្លៃ)</span>;
                                } else if (st === 'Rejected') {
                                  return (
                                    <div className="space-y-1">
                                      <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-500/10">Rejected (បដិសេធ)</span>
                                      {r.rejection_reason && (
                                        <div className="text-[8px] text-rose-500 leading-tight max-w-[120px] mx-auto line-clamp-1" title={r.rejection_reason}>
                                          {r.rejection_reason}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-500/10">Approved (អនុម័ត)</span>;
                              })()}
                            </td>
 
                            <td className="p-4 text-center">
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {sessionUser.role !== 'company' && (r.report_status || 'Approved') !== 'Approved' && (
                                  <button
                                    title="អនុម័តរបាយការណ៍"
                                    onClick={async () => {
                                      const updated: MetrologyReport = {
                                        ...r,
                                        report_status: 'Approved',
                                        approved_at: new Date().toISOString(),
                                        approved_by: sessionUser.id
                                      };
                                      setReports(prev => prev.map(item => item.id === r.id ? updated : item));
                                      try {
                                        await saveReportToSupabase(updated);
                                        const { logAuditEvent } = await import('./services/loginHistoryService');
                                        await logAuditEvent(sessionUser, 'REPORT_APPROVED', `Approved report ID: ${r.id} of company ${r.company_name_kh}`);
                                        showToast('របាយការណ៍ត្រូវបានអនុម័តប្រកបដោយជោគជ័យ!', 'success');
                                      } catch (err) {
                                        showToast('បរាជ័យក្នុងការអនុម័តរបាយការណ៍!', 'error');
                                      }
                                    }}
                                    className="px-1.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded transition-colors cursor-pointer"
                                  >
                                    ✓ អនុម័ត
                                  </button>
                                )}
                                
                                {sessionUser.role !== 'company' && (r.report_status || 'Approved') !== 'Rejected' && (
                                  <button
                                    title="បដិសេធរបាយការណ៍"
                                    onClick={async () => {
                                      const reason = prompt('សូមបញ្ចូលមូលហេតុនៃការបដិសេធ / Enter rejection reason:');
                                      if (reason === null) return;
                                      const updated: MetrologyReport = {
                                        ...r,
                                        report_status: 'Rejected',
                                        rejection_reason: reason
                                      };
                                      setReports(prev => prev.map(item => item.id === r.id ? updated : item));
                                      try {
                                        await saveReportToSupabase(updated);
                                        const { logAuditEvent } = await import('./services/loginHistoryService');
                                        await logAuditEvent(sessionUser, 'REPORT_REJECTED', `Rejected report ID: ${r.id}. Reason: ${reason}`);
                                        showToast('របាយការណ៍ត្រូវបានបដិសេធ!', 'success');
                                      } catch (err) {
                                        showToast('បរាជ័យក្នុងការបដិសេធរបាយការណ៍!', 'error');
                                      }
                                    }}
                                    className="px-1.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[9px] font-bold rounded transition-colors cursor-pointer"
                                  >
                                    ✗ បដិសេធ
                                  </button>
                                )}

                                <button
                                  title="កែសម្រួលរបាយការណ៍"
                                  onClick={() => setSelectedEditReport(r)}
                                  className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors cursor-pointer text-[10px]"
                                >
                                  Edit
                                </button>
                                <button
                                  title="ទាញយក PDF ឯកត្តជន"
                                  onClick={() => setSelectedPrintReport(r)}
                                  className="p-1 bg-slate-50 hover:bg-slate-100 text-[#2D327F] rounded transition-colors cursor-pointer text-[10px]"
                                >
                                  Print
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {paginatedReports.length === 0 && (
                          <tr>
                            <td colSpan={sessionUser.role !== 'company' ? 10 : 9} className="text-center py-12 text-slate-400 font-sans">
                              {reports.length === 0 ? (
                                <div className="space-y-1">
                                  <p className="font-bold text-slate-600">មិនទាន់មានរបាយការណ៍ទេ</p>
                                  <p className="text-xs text-slate-400 font-mono font-medium">No reports found</p>
                                </div>
                              ) : (
                                "មិនមានទិន្នន័យរបាយការណ៍បំពេញស្របនឹងការចម្រោះរបស់អ្នកឡើយ!"
                              )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Responsive Pagination Controls */}
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 font-sans">
                      បង្ហាញលទ្ធផលពី <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> ដល់{' '}
                      <strong>{Math.min(currentPage * itemsPerPage, filteredReportsList.length)}</strong> នៃទិន្នន័យ{' '}
                      <strong>{filteredReportsList.length}</strong> សរុប
                    </p>
                    
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        មុន (Prev)
                      </button>
                      <span className="text-xs font-bold text-slate-700 px-3 font-mono">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        បន្ទាប់ (Next)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* C. USER ACCOUNTS MANAGER */}
            {activeTab === 'users' && (sessionUser.role === 'superadmin' || sessionUser.role === 'admin') && (
              <UserManagement 
                currentUser={sessionUser}
                usersList={users}
                onSaveUser={handleSaveOrUpdateUser}
                onDeleteUser={handleDeleteUser}
                toastMsg={showToast}
              />
            )}

            {/* D. DEVELOPER CONFIG INTEGRATION OPTIONS */}
            {activeTab === 'developer' && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin' && (
              <DeveloperConsole 
                config={dbConfig}
                onUpdateConfig={handleUpdateConfig}
                toastMsg={showToast}
              />
            )}

            {/* E. LOGIN HISTORY VIEW */}
            {activeTab === 'history' && sessionUser.role === 'superadmin' && (
              <LoginHistoryView />
            )}

            {/* F. SYSTEM DATA BACKUP SERVICES */}
            {activeTab === 'backup' && sessionUser.role === 'superadmin' && (
              <BackupData currentUser={sessionUser} />
            )}

            {/* G. ENTERPRISE LICENSING REGISTRY MODULE */}
            {activeTab === 'licenses' && (
              <EnterpriseLicensingRegistry 
                currentUser={sessionUser}
                usersList={users}
                toastMsg={showToast}
              />
            )}

          </main>
        </div>
      </div>

      {/* Official State Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-850 py-4 px-6 text-center text-[10px] flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
        <p className="font-sans">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC) នៃក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍</p>
        <p className="font-mono text-slate-500">System Time Session: {systemTime} (GMT+7)</p>
      </footer>

      {/* Embedded hidden and modal Printable Frame blocks */}
      
      {/* 1. Print all active filtered lists preview modal */}
      {isPrintAllPreview && (
        <ReportPrintLayout 
          reports={filteredReportsList}
          selectedUser={
            sessionUser.role === 'company' 
              ? sessionUser 
              : filterCompanyId !== 'all' 
                ? users.find(u => u.id === filterCompanyId) || null 
                : null
          }
          currentUser={sessionUser}
          filterMonth={filterMonth}
          filterYear={filterYear}
          filterServiceType={filterServiceType}
          searchQuery={searchQuery}
          onClose={() => setIsPrintAllPreview(false)}
        />
      )}

      {/* 2. Print individual single report preview modal */}
      {selectedPrintReport && (
        <ReportPrintLayout 
          reports={[selectedPrintReport]}
          selectedUser={(() => {
            // Find the owner user of this individual report for displaying authentic licensing block
            const owner = users.find(u => u.id === selectedPrintReport.user_id);
            return owner || null;
          })()}
          currentUser={sessionUser}
          filterMonth={selectedPrintReport.report_month}
          filterYear={selectedPrintReport.report_year}
          onClose={() => setSelectedPrintReport(null)}
        />
      )}

      {/* 3. High-Fidelity PWA 'Open in App' & Installation Guide Dialog */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-lg w-full overflow-hidden leading-relaxed animate-fade-in duration-200">
            {/* National Crest & Header */}
            <div className="bg-navy p-6 text-center text-white relative">
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
              
              <div className="w-16 h-16 bg-white/10 rounded-2xl mx-auto flex items-center justify-center border border-white/10 overflow-hidden mb-3">
                <img 
                  src={nmcLogo} 
                  alt="NMC logo" 
                  className="h-12 w-auto object-contain"
                />
              </div>
              <h3 className="font-bold text-sm tracking-wide font-muol mt-2 text-gold">ដំឡើងជាកម្មវិធីទូរស័ព្ទ ឬកុំព្យូទ័រ</h3>
              <p className="text-[10px] text-slate-300 font-sans tracking-wide mt-1 uppercase">Install "NMC Report" Portal as Native App</p>
            </div>

            {/* Steps & Guidelines */}
            <div className="p-6 space-y-5 font-sans">
              <p className="text-xs text-slate-600 text-center leading-relaxed">
                អ្នកអាចដំឡើងកម្មវិធីនេះនៅលើឧបករណ៍របស់អ្នកដើម្បីងាយស្រួលបើកប្រើប្រាស់ (Open in App) ដោយផ្ទាល់ដោយមិនបាច់ចូលតាមកម្មវិធីរុករក (Browser)។
              </p>

              <div className="space-y-4">
                {/* Desktop Option */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                  <span className="p-2 rounded-xl bg-slate-50 text-[#353C96] border border-[#C9D2E3] shrink-0 font-bold text-xs">A</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">សម្រាប់កុំព្យូទ័រ (Desktop Native App)</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      ចុចលើរូបសញ្ញា <strong className="text-[#353C96]">"ដំឡើងកម្មវិធី" (Install / Open in App)</strong> ឬចុចរូប <strong className="font-mono bg-slate-200 px-1 rounded">⊞</strong> នៅលើរបារអាសយដ្ឋាន Chrome/Edge ដូចដែលបានបង្ហាញក្នុងរូបភាព រួចជ្រើសរើស "ដំឡើង" (Install)។
                    </p>
                  </div>
                </div>

                {/* iPhone / iOS Option */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                  <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 shrink-0 font-bold text-xs">B</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">ស្មាតហ្វូន iPhone / iOS (Safari Browser)</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      បើកទំព័រនេះក្នុងកម្មវិធី <strong className="text-slate-850">Safari</strong> &rarr; ចុចប៊ូតុងចែករំលែក <strong className="text-[#353C96] font-bold">"Share" (រូបសញ្ញាព្រួញឡើងលើ &uarr;)</strong> នៅផ្នែកខាងក្រោម &rarr; អូសចុះក្រោមហើយជ្រើសរើស <strong className="text-[#353C96]">"បន្ថែមទៅអេក្រង់ដើម" (Add to Home Screen)</strong>។
                    </p>
                  </div>
                </div>

                {/* Android Option */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                  <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0 font-bold text-xs">C</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">ស្មាតហ្វូន Android (Chrome Browser)</h4>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      ចុចលើប៊ូតុង <strong className="text-emerald-700">"Open in app"</strong> ឬចុចសញ្ញាចុចបី <strong className="font-bold">&bull;&bull;&bull;</strong> នៅជ្រុងខាងលើខាងស្តាំ &rarr; ជ្រើសរើស <strong className="text-emerald-700">"ដំឡើងកម្មវិធី" (Install App / Add to Home Screen)</strong>។
                    </p>
                  </div>
                </div>
              </div>

              {/* native prompt trigger if supported */}
              {deferredPrompt && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInstallGuide(false);
                      handlePwaInstall();
                    }}
                    className="w-full py-3 bg-gold text-slate-900 font-bold rounded-xl shadow hover:bg-yellow-500 hover:scale-[1.02] shadow-gold/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <svg className="h-4 w-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>ចុចទីនេះដើម្បីដំឡើងភ្លាមៗ / Click to Install</span>
                  </button>
                </div>
              )}

              {/* Close footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>NMC Metrology Report Portal PWA</span>
                <button
                  type="button"
                  onClick={() => setShowInstallGuide(false)}
                  className="font-bold text-slate-600 hover:text-slate-900"
                >
                  យល់ព្រម / Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Beautiful Persistent PWA Installation Floating Banner (Bottom-Right, matched to user's screenshot) */}
      {showInstallBanner && !isAppInstalled && (
        <div className="fixed bottom-6 right-6 z-[95] max-w-sm w-full bg-white rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.15)] border border-slate-150 p-4 leading-relaxed transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 select-none">
          <div className="flex gap-3 items-start relative">
            <button
              type="button"
              onClick={() => setShowInstallBanner(false)}
              className="absolute -top-1 -right-1 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            
            {/* App Icon Circle */}
            <div className="h-10 w-10 shrink-0 bg-blue-550/10 border border-blue-500/20 text-blue-600 flex items-center justify-center rounded-xl overflow-hidden shadow-inner">
              <img 
                src={nmcLogo} 
                alt="NMC icon" 
                className="h-7 w-auto object-contain"
              />
            </div>
            
            <div className="flex-1 min-w-0 pr-4">
              <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                ដំឡើង App
              </h4>
              <p className="text-[11px] text-slate-500 font-medium leading-normal mt-0.5">
                Install ប្រព័ន្ធគ្រប់គ្រងរបាយការណ៍ — ប្រើប្រាស់ App ពិតៗ!
              </p>
              
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePwaInstall}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 hover:scale-105 border border-blue-500/40 rounded-lg py-1.5 px-4 transition-all cursor-pointer shadow-md select-none active:scale-95"
                >
                  <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>ដំឡើង App</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowInstallBanner(false)}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded transition-all cursor-pointer"
                >
                  ពេលក្រោយ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
