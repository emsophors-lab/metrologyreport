import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  History,
  Info,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { MetrologyUser } from '../types';
import { fetchAllBackupData, executeJsonBackup, executeExcelBackup, BackupPayload } from '../utils/backupUtils';
import { logAuditEvent } from '../services/loginHistoryService';

interface BackupDataProps {
  currentUser: MetrologyUser;
}

type BackupStatus = 'Success' | 'Warning' | 'Failed' | 'Idle';
type BackupType = 'JSON' | 'Excel' | null;

const fontStack = '"Noto Sans Khmer", "Khmer OS Battambang", "Kantumruy Pro", "Inter", Arial, sans-serif';

const progressSteps = [
  'Collecting tables',
  'Sanitizing sensitive data',
  'Building file',
  'Download ready',
];

export default function BackupData({ currentUser }: BackupDataProps) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<BackupPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(
    localStorage.getItem('nmc_last_backup_time')
  );
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString('km-KH'));
  const [lastBackupType, setLastBackupType] = useState<BackupType>(null);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<BackupStatus>('Idle');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString('km-KH'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSummaryStats = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await fetchAllBackupData(currentUser);
      setSummary(data);
    } catch (err: any) {
      console.error('Error compiling backup metadata summary:', err);
      setErrorMessage(err?.message || 'បរាជ័យក្នុងការទាញយកស្ថិតិសង្ខេប / Failed loading backup metadata stats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser.role === 'superadmin') {
      loadSummaryStats();
    }
  }, [currentUser]);

  if (currentUser.role !== 'superadmin') {
    return (
      <div className="max-w-xl mx-auto my-16 p-10 bg-white rounded-2xl border border-rose-200 text-center shadow-xl" style={{ fontFamily: fontStack }}>
        <div className="inline-flex p-5 rounded-full bg-rose-100 text-rose-600 mb-6 border border-rose-200">
          <ShieldAlert size={54} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">សិទ្ធិត្រូវបានបដិសេធ / Access Denied</h2>
        <p className="text-slate-600 mb-8 max-w-sm mx-auto text-sm leading-relaxed">
          លោកអ្នកមិនមានសិទ្ធិគ្រប់គ្រាន់ដើម្បីចូលប្រើប្រាស់ផ្នែកបម្រុងទុកទិន្នន័យប្រព័ន្ធនេះទេ។
        </p>
        <div className="p-3 bg-rose-50 rounded-lg text-xs text-rose-700 font-mono inline-block border border-rose-200 font-bold">
          Security Level: Superadmin Required
        </div>
      </div>
    );
  }

  const completeBackup = async (type: BackupType, runner: (user: MetrologyUser) => Promise<BackupPayload>) => {
    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      setLastStatus('Idle');

      const payload = await runner(currentUser);
      const timeNow = new Date().toLocaleString('km-KH');
      const datePart = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const fileName = type === 'JSON'
        ? `nmc-metrology-backup-${datePart}.json`
        : `nmc-metrology-backup-${datePart}.xlsx`;
      const exportedRecords = Object.values(payload.metadata.total_record_counts).reduce((a, b) => a + b, 0);
      const hasWarnings = Object.keys(payload.errors).length > 0;

      setLastBackupTime(timeNow);
      setLastBackupType(type);
      setLastFileName(fileName);
      setLastStatus(hasWarnings ? 'Warning' : 'Success');
      localStorage.setItem('nmc_last_backup_time', timeNow);

      await logAuditEvent(
        currentUser,
        'BACKUP_CREATED',
        `Generated full system data backup in ${type} format. Included: ${payload.metadata.tables_included.join(', ')}. Mode: ${payload.metadata.mode}. Total records: ${exportedRecords}`
      );

      setSuccessMessage(
        hasWarnings
          ? 'បម្រុងទុកបាន ប៉ុន្តែមានតារាងខ្លះមិនអាចនាំចេញបាន / Backup completed, but some tables could not be exported.'
          : 'បម្រុងទុកទិន្នន័យបានជោគជ័យ / Backup exported successfully.'
      );
      loadSummaryStats();
    } catch (err: any) {
      console.error(err);
      setLastStatus('Failed');
      setErrorMessage(`បម្រុងទុកមិនបានទេ។ សូមព្យាយាមម្តងទៀត។ / Backup failed. Please try again. ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJsonBackup = () => completeBackup('JSON', executeJsonBackup);
  const handleExcelBackup = () => completeBackup('Excel', executeExcelBackup);

  const scopeItems = [
    { kh: 'អាជ្ញាប័ណ្ណសហគ្រាស', en: 'Enterprise Licenses', key: 'enterprise_licenses' },
    { kh: 'គណនីអ្នកប្រើប្រាស់', en: 'Users', key: 'users' },
    { kh: 'របាយការណ៍', en: 'Reports', key: 'reports' },
    { kh: 'ប្រវត្តិចូលប្រើប្រាស់', en: 'Login History', key: 'login_history' },
    { kh: 'ប្រវត្តិបន្តសុពលភាព', en: 'Renewal History', key: 'license_renewal_history' },
    { kh: 'កំណត់ប៊ូតតេឡេក្រាម', en: 'Telegram Bot Settings', key: 'telegram_bot_settings' },
    { kh: 'កំណត់ត្រារំលឹក', en: 'Reminder Logs', key: 'license_reminder_logs' },
    { kh: 'មេតាទិន្នន័យឯកសារភ្ជាប់', en: 'Attachments metadata', key: 'enterprise_license_attachments' },
    { kh: 'ទីតាំងរូបថតម្ចាស់', en: 'Owner photo paths', key: 'enterprise_licenses' },
    { kh: 'និយាមការផែនទី', en: 'Map coordinates', key: 'enterprise_licenses' },
    { kh: 'កំណត់ត្រាសវនកម្ម', en: 'Audit logs', key: 'audit_logs' },
  ];

  const summaryCards = [
    { kh: 'គណនី', en: 'Users', value: summary?.metadata.total_record_counts.users ?? 0, icon: User, status: 'profiles included' },
    { kh: 'របាយការណ៍', en: 'Reports', value: summary?.metadata.total_record_counts.reports ?? 0, icon: FileSpreadsheet, status: 'monthly records' },
    { kh: 'ប្រវត្តិចូល', en: 'Logs', value: summary?.metadata.total_record_counts.login_history ?? 0, icon: History, status: 'access history' },
    { kh: 'តារាង', en: 'Tables', value: summary?.metadata.tables_included.length ?? 0, icon: Layers, status: 'available scope' },
    { kh: 'ចុងក្រោយ', en: 'Last Backup', value: lastBackupTime || 'None', icon: Clock, status: lastBackupType ? `${lastBackupType} export` : 'this session' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6 bg-[#F4F7FB] select-text" style={{ fontFamily: fontStack }}>
      <section className="rounded-[20px] bg-linear-to-br from-[#253B9A] via-[#2454D6] to-[#0B2C5F] text-white shadow-lg overflow-hidden border border-blue-200/40">
        <div className="p-6 md:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-center">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#F4C430] px-3 py-1 text-[11px] font-black text-[#0B1F3A]">
                <ShieldCheck size={14} /> SUPER ADMINISTRATOR ONLY
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-black text-white border border-white/20">
                <Lock size={14} /> NMC Secure Backup Center
              </span>
            </div>

            <div>
              <h1 className="text-[28px] md:text-[40px] leading-tight font-black">ប្រព័ន្ធទិន្នន័យបម្រុងទុក</h1>
              <p className="text-[22px] md:text-[32px] leading-tight font-extrabold text-[#F4C430] mt-1">System Data Backup</p>
            </div>

            <p className="text-white/90 text-sm md:text-base leading-relaxed max-w-3xl">
              Export protected system records for restoration, review, and official archive. Sensitive passwords, API tokens, and secret keys are redacted before download.
            </p>
          </div>

          <div className="rounded-2xl bg-[#0B1F3A]/70 border border-white/20 p-5 shadow-md">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Server Date / Time</p>
            <p className="text-xl font-black text-[#F4C430] font-mono mt-2">{currentTime}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-lg bg-white/10 px-3 py-1 text-[10px] font-black font-mono text-white border border-white/10">NMC-BAC-REG-V2.0</span>
              <span className="rounded-lg bg-[#10B981]/20 px-3 py-1 text-[10px] font-black text-emerald-200 border border-emerald-400/30">SECURITY ACTIVE</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.en} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-[#253B9A]/10 text-[#253B9A] flex items-center justify-center shrink-0">
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-slate-800">{card.kh}</p>
                <p className="text-[11px] font-bold text-slate-500">{card.en}</p>
                <p className="text-xl font-black text-[#0B1F3A] font-mono truncate">{card.value}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{card.status}</p>
              </div>
            </div>
          );
        })}
      </section>

      {(errorMessage || successMessage || loading) && (
        <section className="space-y-3">
          {loading && (
            <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3 text-[#253B9A] font-black">
                <Loader2 className="animate-spin" size={20} />
                <span>កំពុងបង្កើតឯកសារបម្រុងទុក... / Preparing backup file...</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-4">
                {progressSteps.map((step, index) => (
                  <div key={step} className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs font-bold text-slate-700">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#253B9A] text-white mr-2">{index + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3 text-emerald-900">
              <CheckCircle2 size={22} className="shrink-0" />
              <p className="text-sm font-bold leading-relaxed">{successMessage}</p>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3 text-red-900">
              <AlertCircle size={22} className="shrink-0" />
              <p className="text-sm font-bold leading-relaxed">{errorMessage}</p>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <main className="space-y-6">
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 border-b border-slate-100">
              <h2 className="text-xl md:text-2xl font-black text-[#0B1F3A]">ជ្រើសរើសប្រភេទបម្រុងទុក</h2>
              <p className="text-sm font-bold text-slate-500 mt-1">Select Backup Format</p>
            </div>

            <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <BackupActionCard
                title="JSON Backup"
                khTitle="បម្រុងទុកជា JSON"
                accent="gold"
                icon={FileJson}
                fileType=".json"
                bestFor="system restore, technical backup"
                includes="relational tables, metadata"
                description="Full relational data export for system restoration or technical archive."
                buttonText="បម្រុងទុកជា JSON / Export JSON"
                loading={loading}
                onClick={handleJsonBackup}
              />
              <BackupActionCard
                title="Excel Backup"
                khTitle="បម្រុងទុកជា Excel"
                accent="green"
                icon={FileSpreadsheet}
                fileType=".xlsx"
                bestFor="review, reporting, management"
                includes="multiple sheets"
                description="Human-readable workbook for reporting and review."
                buttonText="បម្រុងទុកជា Excel / Export Excel"
                loading={loading}
                onClick={handleExcelBackup}
              />
            </div>
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-[#0B1F3A]">ទិន្នន័យដែលត្រូវបានបម្រុងទុក</h2>
                <p className="text-sm font-bold text-slate-500 mt-1">Backup Scope</p>
              </div>
              <button
                type="button"
                onClick={loadSummaryStats}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-[#253B9A] hover:bg-blue-50 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="p-5 md:p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {scopeItems.map((item) => {
                const available = !!summary?.tables?.[item.key];
                const warning = summary?.errors?.[item.key];
                return (
                  <div key={`${item.en}-${item.key}`} className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 flex items-start gap-3">
                    <div className={`mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${available ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {available ? <CheckCircle2 size={16} /> : <Info size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800">{item.kh}</p>
                      <p className="text-xs font-bold text-slate-500">{item.en}</p>
                      <p className={`mt-1 text-[11px] font-bold ${available ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {available
                          ? `${summary?.tables[item.key]?.length || 0} rows available`
                          : warning
                            ? 'មិនមានតារាងនេះ ឬមិនអាចចូលប្រើបាន / Table unavailable or access denied'
                            : 'Waiting for summary'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-[#0B2C5F] text-white p-5">
              <h2 className="text-lg font-black">ប្រវត្តិបម្រុងទុកថ្មីៗ</h2>
              <p className="text-xs text-white/75 font-bold mt-1">Recent Backup Activity</p>
            </div>
            <div className="p-5 space-y-3">
              {lastBackupType ? (
                <>
                  <ActivityRow label="Last backup time" value={lastBackupTime || 'N/A'} />
                  <ActivityRow label="Last backup type" value={lastBackupType} />
                  <ActivityRow label="Last exported by" value={currentUser.username} />
                  <ActivityRow label="Last file name" value={lastFileName || 'N/A'} />
                  <div className={`rounded-xl px-3 py-2 text-xs font-black border ${
                    lastStatus === 'Success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    lastStatus === 'Warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    Status: {lastStatus}
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm font-bold text-slate-600 leading-relaxed">
                  មិនទាន់មានការបម្រុងទុកក្នុង session នេះទេ
                  <span className="block text-xs text-slate-400 mt-1">No backup in this session yet</span>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-[#0B1F3A] text-white border border-slate-700 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h2 className="text-lg font-black">Security and Operation Profile</h2>
              <p className="text-xs text-white/60 font-bold mt-1">F. Operation Profile</p>
            </div>
            <div className="p-5 space-y-4">
              <ProfileRow icon={User} label="Requesting Administrator" value={currentUser.username} />
              <ProfileRow icon={ShieldCheck} label="Role" value="SUPERADMIN" badge="green" />
              <ProfileRow icon={Database} label="Connection Mode" value={summary?.metadata.mode || 'Loading'} badge={summary?.metadata.mode === 'Supabase Cloud' ? 'green' : 'yellow'} />
              <ProfileRow icon={Lock} label="Data Sanitization Status" value="Sensitive values redacted" badge="green" />
              <ProfileRow icon={ShieldCheck} label="Sensitive Token Protection" value="[REDACTED]" badge="green" />
              <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-4 text-xs leading-relaxed text-amber-100 font-bold">
                API tokens and secret keys must be redacted from backup export.
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BackupActionCard({
  title,
  khTitle,
  accent,
  icon: Icon,
  fileType,
  bestFor,
  includes,
  description,
  buttonText,
  loading,
  onClick,
}: {
  title: string;
  khTitle: string;
  accent: 'gold' | 'green';
  icon: React.ElementType;
  fileType: string;
  bestFor: string;
  includes: string;
  description: string;
  buttonText: string;
  loading: boolean;
  onClick: () => void;
}) {
  const isGold = accent === 'gold';
  return (
    <div className={`rounded-2xl border p-5 md:p-6 shadow-sm ${isGold ? 'border-amber-200 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/40'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${isGold ? 'bg-[#F59E0B] text-white' : 'bg-[#10B981] text-white'}`}>
          <Icon size={26} />
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black font-mono ${isGold ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{fileType}</span>
      </div>
      <h3 className="mt-5 text-xl font-black text-[#0B1F3A]">{khTitle}</h3>
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600 font-semibold">{description}</p>
      <div className="mt-5 space-y-2 text-xs font-bold text-slate-600">
        <p><span className="text-slate-400">Best for:</span> {bestFor}</p>
        <p><span className="text-slate-400">Includes:</span> {includes}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`mt-6 w-full rounded-xl px-4 py-3.5 text-sm md:text-base font-black text-white inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-[0.98] transition ${isGold ? 'bg-[#F59E0B] hover:bg-amber-600' : 'bg-[#10B981] hover:bg-emerald-600'}`}
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        {buttonText}
      </button>
    </div>
  );
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-black">{label}</p>
      <p className="text-xs font-black text-slate-800 break-words mt-0.5">{value}</p>
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  badge?: 'green' | 'yellow' | 'red';
}) {
  const badgeClass = badge === 'green'
    ? 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30'
    : badge === 'yellow'
      ? 'bg-amber-400/15 text-amber-200 border-amber-400/30'
      : badge === 'red'
        ? 'bg-red-400/15 text-red-200 border-red-400/30'
        : 'bg-white/10 text-white border-white/10';

  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-[#F4C430]">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-white/50 font-black">{label}</p>
        <span className={`inline-flex mt-1 rounded-lg border px-2 py-1 text-xs font-black ${badgeClass}`}>{value}</span>
      </div>
    </div>
  );
}
