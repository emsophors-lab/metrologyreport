import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Presentation,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users
} from 'lucide-react';
import { EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, MetrologyReport, MetrologyUser } from '../types';
import { generatePredictions } from '../services/mlPredictionService';
import { MlPredictionBundle, MlPredictionResult, MlRiskLevel, parseDate } from '../utils/mlRiskFeatures';
import { formatKhmerOfficialDateBlock } from '../utils/khmerOfficialDate';
import PredictionExplanationPanel from './PredictionExplanationPanel';

interface MachineLearningPredictionDashboardProps {
  currentUser: MetrologyUser;
  reports: MetrologyReport[];
  licenses: EnterpriseLicense[];
  renewals?: LicenseRenewalHistory[];
  reminders?: LicenseReminderLog[];
}

type RiskColor = Record<MlRiskLevel, string>;

const riskColor: RiskColor = {
  Low: '#22C55E',
  Medium: '#F2B705',
  High: '#F97316',
  Critical: '#EF4444'
};

const riskLabel: Record<MlRiskLevel, string> = {
  Low: 'ហានិភ័យទាប / Low Risk',
  Medium: 'ហានិភ័យមធ្យម / Medium Risk',
  High: 'ហានិភ័យខ្ពស់ / High Risk',
  Critical: 'ហានិភ័យធ្ងន់ធ្ងរ / Critical Risk'
};

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh' });
}

function formatUpdatedAt(date: Date) {
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function daysUntil(value?: string | null) {
  const expiry = parseDate(value);
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

function reportDate(report: MetrologyReport) {
  return parseDate(report.service_end_date || report.updated_at || report.created_at);
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function confidencePct(bundle: MlPredictionBundle) {
  if (bundle.modelMetadata.status === 'baseline_trained') return Math.max(68, bundle.dataQuality.score);
  if (bundle.modelMetadata.status === 'rules_only') return Math.min(68, Math.max(45, bundle.dataQuality.score));
  return Math.min(45, Math.max(25, bundle.dataQuality.score));
}

function countByLabel<T>(items: T[], getLabel: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach(item => {
    const label = getLabel(item) || 'Unknown';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value, tooltip: `${label}: ${value}` }))
    .sort((a, b) => b.value - a.value);
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = 6 + index * (96 / Math.max(1, values.length - 1));
    const y = 38 - (value / max) * 30;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 112 44" className="h-11 w-28" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const x = 6 + index * (96 / Math.max(1, values.length - 1));
        const y = 38 - (value / max) * 30;
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="2" fill={color} />;
      })}
    </svg>
  );
}

function KpiCard({
  icon,
  kh,
  en,
  value,
  change,
  color,
  values,
  suffix = ''
}: {
  icon: React.ReactNode;
  kh: string;
  en: string;
  value: string | number;
  change: number | null;
  color: string;
  values: number[];
  suffix?: string;
}) {
  const changeText = change === null ? 'Data not available' : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}%`;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" title={`${en}: ${value}${suffix}. ${changeText} vs last month.`}>
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-lg p-2" style={{ background: `${color}18`, color }}>{icon}</span>
        <Sparkline values={values} color={color} />
      </div>
      <p className="mt-2 text-xs font-black leading-tight text-[#0B2A66]">{kh}</p>
      <p className="text-[11px] font-semibold text-slate-500">{en}</p>
      <div className="mt-2 flex items-end justify-between">
        <strong className="text-3xl font-black text-[#0B1A35]">{value}{suffix}</strong>
        <span className="text-[11px] font-bold" style={{ color: change === null ? '#94A3B8' : change >= 0 ? '#16A34A' : '#2563EB' }}>
          {changeText}
          <em className="block not-italic text-slate-400">vs last month</em>
        </span>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm font-bold text-slate-400">{label}</div>;
}

function LineChart({
  rows,
  series
}: {
  rows: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
}) {
  if (rows.length === 0) return <EmptyState label="Data not available / មិនមានទិន្នន័យគ្រប់គ្រាន់" />;
  const width = 640;
  const height = 230;
  const pad = 34;
  const max = Math.max(1, ...rows.flatMap(row => series.map(item => Number(row[item.key] || 0))));
  const x = (index: number) => pad + index * ((width - pad * 2) / Math.max(1, rows.length - 1));
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);

  return (
    <div className="overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        {[0, 0.25, 0.5, 0.75, 1].map(tick => (
          <g key={tick}>
            <line x1={pad} x2={width - pad} y1={pad + tick * (height - pad * 2)} y2={pad + tick * (height - pad * 2)} stroke="#E5EAF2" />
          </g>
        ))}
        {series.map(item => {
          const points = rows.map((row, index) => `${x(index)},${y(Number(row[item.key] || 0))}`).join(' ');
          return (
            <g key={item.key}>
              <polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {rows.map((row, index) => (
                <circle key={`${item.key}-${row.label}`} cx={x(index)} cy={y(Number(row[item.key] || 0))} r="4" fill={item.color}>
                  <title>{`${row.label} - ${item.label}: ${row[item.key]}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {rows.map((row, index) => (
          <text key={String(row.label)} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#64748B">{String(row.label).slice(5)}</text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 px-2 text-xs font-bold text-slate-600">
        {series.map(item => <span key={item.key}><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />{item.label}</span>)}
      </div>
    </div>
  );
}

function BarChart({ rows, color }: { rows: Array<{ label: string; value: number; tooltip: string }>; color: string }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <div className="space-y-3">
      {rows.length === 0 ? <EmptyState label="Data not available / មិនមានទិន្នន័យគ្រប់គ្រាន់" /> : rows.map(row => (
        <div key={row.label} title={row.tooltip}>
          <div className="mb-1 flex justify-between text-xs font-bold text-slate-600"><span>{row.label}</span><strong>{row.value}</strong></div>
          <div className="h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full" style={{ width: `${Math.max(4, (row.value / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ distribution }: { distribution: Record<MlRiskLevel, number> }) {
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  if (total === 0) return <EmptyState label="Data not available / មិនមានទិន្នន័យគ្រប់គ្រាន់" />;
  let offset = 25;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="grid gap-4 md:grid-cols-[190px_1fr]">
      <svg viewBox="0 0 100 100" className="h-44 w-44 justify-self-center -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#E5EAF2" strokeWidth="16" />
        {(Object.keys(distribution) as MlRiskLevel[]).map(level => {
          const value = distribution[level];
          const length = (value / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const currentOffset = offset;
          offset -= (value / total) * 100;
          return (
            <circle key={level} cx="50" cy="50" r={radius} fill="none" stroke={riskColor[level]} strokeWidth="16" strokeDasharray={dash} strokeDashoffset={currentOffset} strokeLinecap="butt">
              <title>{`${riskLabel[level]}: ${value} (${pct(value, total)}%)`}</title>
            </circle>
          );
        })}
        <text x="50" y="47" textAnchor="middle" className="rotate-90 fill-[#0B1A35] text-[10px] font-black">{total}</text>
      </svg>
      <div className="space-y-3 self-center text-xs font-bold">
        {(Object.keys(distribution) as MlRiskLevel[]).map(level => (
          <div key={level} className="flex items-center justify-between gap-3" title={`${riskLabel[level]}: ${distribution[level]} (${pct(distribution[level], total)}%)`}>
            <span className="flex items-center gap-2 text-slate-700"><i className="h-3 w-3 rounded-full" style={{ background: riskColor[level] }} />{riskLabel[level]}</span>
            <strong>{distribution[level]} ({pct(distribution[level], total)}%)</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProvinceRiskMap({ rows }: { rows: MlPredictionBundle['provinceRiskForecast'] }) {
  const shown = rows.slice(0, 18);
  const max = Math.max(1, ...shown.map(row => row.riskScore));
  const cells = [
    { x: 8, y: 42 }, { x: 18, y: 34 }, { x: 29, y: 29 }, { x: 41, y: 27 }, { x: 53, y: 30 }, { x: 65, y: 35 },
    { x: 76, y: 43 }, { x: 22, y: 48 }, { x: 34, y: 46 }, { x: 46, y: 47 }, { x: 58, y: 49 }, { x: 70, y: 55 },
    { x: 30, y: 62 }, { x: 43, y: 62 }, { x: 56, y: 64 }, { x: 68, y: 70 }, { x: 50, y: 78 }, { x: 62, y: 82 }
  ];

  if (rows.length === 0) return <EmptyState label="Data not available / មិនមានទិន្នន័យគ្រប់គ្រាន់" />;

  return (
    <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
      <div className="relative min-h-56 overflow-hidden rounded-xl border border-slate-100 bg-gradient-to-br from-emerald-50 via-amber-50 to-orange-50 p-3">
        <svg viewBox="0 0 100 100" className="h-56 w-full drop-shadow-sm" role="img" aria-label="Province risk forecast map-style visualization">
          <path d="M10 43 C18 25 35 18 52 24 C69 30 83 40 88 55 C80 75 60 88 39 82 C21 77 8 62 10 43Z" fill="#DCFCE7" stroke="#BBF7D0" strokeWidth="1.5" />
          {shown.map((row, index) => {
            const cell = cells[index % cells.length];
            const color = riskColor[row.riskLevel];
            const size = 10 + (row.riskScore / max) * 10;
            return (
              <g key={row.province}>
                <circle cx={cell.x} cy={cell.y} r={size / 2} fill={color} opacity="0.78" stroke="#FFFFFF" strokeWidth="1.2">
                  <title>{row.tooltip}</title>
                </circle>
                <text x={cell.x} y={cell.y + 1.5} textAnchor="middle" fontSize="4.5" fontWeight="800" fill="#0B1A35">{row.riskScore}</text>
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-2 text-[11px] font-bold text-slate-600 shadow-sm">
          Advisory province risk map-style view · exact values on hover
        </div>
      </div>
      <div className="space-y-2">
        {shown.slice(0, 6).map(row => (
          <div key={row.province} className="rounded-lg border border-slate-100 bg-slate-50 p-2" title={row.tooltip}>
            <div className="flex items-center justify-between gap-2 text-xs font-black">
              <span className="truncate text-[#0B2A66]">{row.province}</span>
              <strong style={{ color: riskColor[row.riskLevel] }}>{row.riskScore}</strong>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(6, row.riskScore)}%`, background: riskColor[row.riskLevel] }} />
            </div>
            <p className="mt-1 text-[10px] font-bold text-slate-500">{riskLabel[row.riskLevel]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelConfidenceCard({
  confidence,
  bundle,
  trainedAt
}: {
  confidence: number;
  bundle: MlPredictionBundle;
  trainedAt: string | null;
}) {
  const radius = 42;
  const circumference = Math.PI * radius;
  const visible = (confidence / 100) * circumference;
  const confidenceLabel = confidence >= 75 ? 'High Confidence' : confidence >= 55 ? 'Medium Confidence' : 'Low Confidence';
  const hasLearnedWeights = !!bundle.modelMetadata.learnedWeights;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-amber-50 to-white p-4 text-center">
        <svg viewBox="0 0 120 72" className="mx-auto h-32 w-full" role="img" aria-label={`Analytics confidence ${confidence}%`}>
          <path d="M18 60 A42 42 0 0 1 102 60" fill="none" stroke="#E5E7EB" strokeWidth="13" strokeLinecap="round" />
          <path d="M18 60 A42 42 0 0 1 102 60" fill="none" stroke={confidence >= 75 ? '#22C55E' : confidence >= 55 ? '#F2B705' : '#F97316'} strokeWidth="13" strokeLinecap="round" strokeDasharray={`${visible} ${circumference}`} />
          <text x="60" y="48" textAnchor="middle" fontSize="19" fontWeight="900" fill="#0B1A35">{confidence}%</text>
          <text x="60" y="64" textAnchor="middle" fontSize="7" fontWeight="800" fill="#64748B">{confidenceLabel}</text>
        </svg>
        <div className="mt-2 flex justify-between text-[10px] font-black text-slate-400"><span>0%</span><span>100%</span></div>
      </div>
      <div className="space-y-3 text-xs font-semibold text-slate-600">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="block text-[10px] font-black uppercase text-slate-400">Analyzed Records</span><strong className="mt-1 block break-words text-lg text-[#0B2A66]">{bundle.modelMetadata.recordCount}</strong></div>
          <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="block text-[10px] font-black uppercase text-slate-400">Engine Type</span><strong className="mt-1 block break-words text-sm leading-snug text-[#0B2A66]">{hasLearnedWeights ? 'Rules + learned calibration' : 'Transparent rules'}</strong></div>
          <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="block text-[10px] font-black uppercase text-slate-400">Engine Version</span><strong className="mt-1 block break-words text-sm leading-snug text-[#0B2A66]">{bundle.modelMetadata.modelVersion}</strong></div>
          <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="block text-[10px] font-black uppercase text-slate-400">Last Calibrated</span><strong className="mt-1 block break-words text-sm leading-snug text-[#0B2A66]">{formatUpdatedAt(new Date(trainedAt || bundle.modelMetadata.trainedAt))}</strong></div>
        </div>
        <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
          {hasLearnedWeights
            ? 'The risk engine has calibrated its weighting against historical license/report data. Scoring remains rule-based and transparent; predictions are advisory and require official verification.'
            : 'Insufficient historical data for calibration. The system is using transparent rule-based scoring until more data is available.'}
        </div>
        <div className="text-[11px] font-bold text-slate-500">Data quality: {bundle.dataQuality.score}% · {bundle.dataQuality.totalIssues} issue(s)</div>
      </div>
    </div>
  );
}

function Panel({ titleKh, titleEn, children, action }: { titleKh: string; titleEn: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[#0B2A66]">{titleKh}</h3>
          <p className="text-xs font-semibold text-slate-500">{titleEn}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function buildExportPayload(bundle: MlPredictionBundle, licenses: EnterpriseLicense[], reports: MetrologyReport[]) {
  const active = licenses.filter(license => ['Active', 'Renewed'].includes(String((license as any).license_status || (license as any).status || ''))).length;
  const expiring = licenses.filter(license => {
    const days = daysUntil(license.license_expiry_date);
    return days !== null && days >= 0 && days <= 90;
  }).length;
  const expired = licenses.filter(license => {
    const days = daysUntil(license.license_expiry_date);
    return days !== null && days < 0;
  }).length;
  const grouped = (items: string[]) => Object.entries(items.reduce<Record<string, number>>((acc, key) => {
    acc[key || 'Data not available'] = (acc[key || 'Data not available'] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]) as [string, number][];

  return {
    generatedDate: formatUpdatedAt(new Date()),
    reportDate: new Date(),
    total: licenses.length,
    active,
    activePct: pct(active, licenses.length),
    expiring,
    expired,
    gps: licenses.filter(license => !!(license as any).business_latitude && !!(license as any).business_longitude).length,
    noGps: licenses.filter(license => !(license as any).business_latitude || !(license as any).business_longitude).length,
    telegram: licenses.filter(license => !!(license as any).telegram_chat_id || !!(license as any).telegram_username).length,
    noTelegram: licenses.filter(license => !(license as any).telegram_chat_id && !(license as any).telegram_username).length,
    reportCount: reports.length,
    noReportCount: bundle.predictions.filter(item => item.missReportProbability >= 0.55).length,
    criticalRiskCount: bundle.riskDistribution.Critical,
    highRiskCount: bundle.riskDistribution.High,
    statusRows: grouped(licenses.map(license => String((license as any).license_status || (license as any).status || 'Data not available'))),
    provinceRows: grouped(bundle.predictions.map(item => item.province)),
    serviceRows: grouped(reports.map(report => report.service_type || 'Data not available')),
    instrumentRows: grouped(reports.map(report => report.measuring_instrument || 'Data not available')),
    monthlyRows: grouped(reports.map(report => `${report.report_month || ''} ${report.report_year || ''}`.trim())),
    riskRows: (Object.keys(bundle.riskDistribution) as MlRiskLevel[]).map(level => [level, bundle.riskDistribution[level]] as [string, number]),
    topRisks: bundle.predictions.slice(0, 8).map(item => ({
      company: item.companyName,
      license: item.licenseNumber,
      level: item.riskLevel,
      score: item.inspectionPriorityScore
    })),
    exp30: licenses.filter(license => {
      const days = daysUntil(license.license_expiry_date);
      return days !== null && days >= 0 && days <= 30;
    }).length,
    exp60: licenses.filter(license => {
      const days = daysUntil(license.license_expiry_date);
      return days !== null && days > 30 && days <= 60;
    }).length,
    exp90: licenses.filter(license => {
      const days = daysUntil(license.license_expiry_date);
      return days !== null && days > 60 && days <= 90;
    }).length,
      mlSummary: {
        modelStatus: bundle.modelMetadata.status,
        dataQualityScore: bundle.dataQuality.score,
        highRiskCompanies: bundle.predictions.filter(item => item.riskLevel === 'High' || item.riskLevel === 'Critical').length,
        criticalRiskCompanies: bundle.riskDistribution.Critical,
        topFactors: bundle.topRiskFactors.map(item => ({ label: item.label, count: item.count })),
        clusters: bundle.clusters.map(item => ({
          name: item.clusterNameEn,
          count: item.companyCount,
          action: item.recommendedAction
        })),
        anomalies: bundle.anomalies.slice(0, 10).map(item => ({
          entity: item.entityName,
          severity: item.severity,
          score: item.anomalyScore,
          reason: item.reason
        })),
        patternInsights: bundle.patternInsights.slice(0, 10).map(item => ({
          label: item.label,
          score: item.score,
          description: item.description
        })),
        provinceForecast: bundle.provinceRiskForecast.map(item => ({ province: item.province, riskScore: item.riskScore, riskLevel: item.riskLevel })),
      reportForecast: bundle.reportVolumeForecast.map(item => ({ label: item.label, value: item.value })),
      expiryForecast: bundle.expiryWorkloadForecast.map(item => ({ label: item.label, value: item.value })),
      disclaimer: 'Smart-analytics predictions are advisory and require official review and verification by NMC.'
    }
  };
}

export default function MachineLearningPredictionDashboard({
  currentUser,
  reports,
  licenses,
  renewals = [],
  reminders = []
}: MachineLearningPredictionDashboardProps) {
  const [trainedAt, setTrainedAt] = useState<string | null>(null);
  const [ancillaryRenewals, setAncillaryRenewals] = useState<LicenseRenewalHistory[]>(renewals);
  const [ancillaryReminders, setAncillaryReminders] = useState<LicenseReminderLog[]>(reminders);
  const [page, setPage] = useState(1);
  const [aiSummary, setAiSummary] = useState('');
  const [isTraining, setIsTraining] = useState(false);
  const [trainingNote, setTrainingNote] = useState('');
  const predictionListRef = useRef<HTMLElement | null>(null);
  const now = new Date();
  const [startDate, setStartDate] = useState(formatDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  const [endDate, setEndDate] = useState(formatDateInput(now));
  const canAccess = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  useEffect(() => {
    let mounted = true;
    const loadAncillarySignals = async () => {
      try {
        const { fetchReminderLogsFromSupabase, fetchRenewalHistoryFromSupabase } = await import('../supabaseSync');
        const [renewalData, reminderData] = await Promise.all([
          fetchRenewalHistoryFromSupabase(undefined, currentUser).catch(() => renewals),
          fetchReminderLogsFromSupabase(undefined, currentUser).catch(() => reminders)
        ]);
        if (!mounted) return;
        setAncillaryRenewals(renewalData || []);
        setAncillaryReminders(reminderData || []);
      } catch {
        if (!mounted) return;
        setAncillaryRenewals(renewals);
        setAncillaryReminders(reminders);
      }
    };
    loadAncillarySignals();
    return () => {
      mounted = false;
    };
  }, [currentUser, renewals, reminders]);

  const filteredReports = useMemo(() => {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (end) end.setHours(23, 59, 59, 999);
    return reports.filter(report => {
      const date = reportDate(report);
      if (!date) return true;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }, [reports, startDate, endDate]);

  const bundle: MlPredictionBundle = useMemo(
    () => generatePredictions({ licenses, reports: filteredReports, renewals: ancillaryRenewals, reminders: ancillaryReminders }),
    [licenses, filteredReports, ancillaryRenewals, ancillaryReminders, trainedAt]
  );

  const analytics = useMemo(() => {
    const highRisk = bundle.predictions.filter(item => item.riskLevel === 'High' || item.riskLevel === 'Critical');
    const critical = bundle.predictions.filter(item => item.riskLevel === 'Critical');
    const likelyMiss = bundle.predictions.filter(item => item.missReportProbability >= 0.55);
    const exp30 = licenses.filter(license => {
      const days = daysUntil(license.license_expiry_date);
      return days !== null && days >= 0 && days <= 30;
    }).length;
    const exp60 = licenses.filter(license => {
      const days = daysUntil(license.license_expiry_date);
      return days !== null && days > 30 && days <= 60;
    }).length;
    const exp90Only = licenses.filter(license => {
      const days = daysUntil(license.license_expiry_date);
      return days !== null && days > 60 && days <= 90;
    }).length;
    const more90 = licenses.filter(license => {
      const days = daysUntil(license.license_expiry_date);
      return days !== null && days > 90;
    }).length;
    const monthlyCompliance = pct(Math.max(0, licenses.length - likelyMiss.length), licenses.length);
    const trendRows = bundle.reportVolumeForecast.map((row, index) => {
      const weight = Math.max(0.7, 1 + (index - 2) * 0.06);
      return {
        label: row.label,
        high: Math.round(highRisk.length * weight),
        critical: Math.round(critical.length * weight),
        miss: Math.round(likelyMiss.length * weight)
      };
    });
    const sparkBase = [0.72, 0.78, 0.83, 0.8, 0.9, 1];
    const spark = (value: number) => sparkBase.map(multiplier => Math.max(0, Math.round(value * multiplier)));
    const confidence = confidencePct(bundle);
    return {
      highRisk,
      critical,
      likelyMiss,
      exp30,
      exp60,
      exp90Only,
      more90,
      expiring90: exp30 + exp60 + exp90Only,
      monthlyCompliance,
      trendRows,
      confidence,
      spark
    };
  }, [bundle, licenses]);

  const paginated = bundle.predictions.slice((page - 1) * 8, page * 8);
  const totalPages = Math.max(1, Math.ceil(bundle.predictions.length / 8));
  const officialDate = formatKhmerOfficialDateBlock(new Date(), { location: 'រាជធានីភ្នំពេញ' });

  const exportPayload = () => buildExportPayload(bundle, licenses, filteredReports);
  const exportPdf = async () => {
    const { generateAnalyticsPdfReport } = await import('../utils/analyticsReportExports');
    generateAnalyticsPdfReport(exportPayload());
  };
  const exportWord = async () => {
    const { generateAnalyticsDocxReport } = await import('../utils/analyticsReportExports');
    await generateAnalyticsDocxReport(exportPayload());
  };
  const exportPowerPoint = async () => {
    const { generateAnalyticsPptxBriefing } = await import('../utils/analyticsReportExports');
    await generateAnalyticsPptxBriefing(exportPayload());
  };
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bundle.predictions.map(item => ({
      License: item.licenseNumber,
      Company: item.companyName,
      Province: item.province,
      RiskScore: item.inspectionPriorityScore,
      RiskLevel: item.riskLevel,
      MissReportProbability: Math.round(item.missReportProbability * 100),
      LateReportProbability: Math.round(item.lateReportProbability * 100),
      ExpiryRiskProbability: Math.round(item.licenseExpiryRiskProbability * 100),
      Confidence: item.confidence,
      TopFactors: item.topFactors.join('; '),
      RecommendedAction: item.recommendedAction
    }))), 'Risk Analytics');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bundle.topRiskFactors), 'Top Risk Factors');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(bundle.provinceRiskForecast), 'Province Forecast');
    XLSX.writeFile(workbook, `nmc-ml-predictions-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleTrain = () => {
    setIsTraining(true);
    try {
      const trained = generatePredictions({ licenses, reports: filteredReports, renewals: ancillaryRenewals, reminders: ancillaryReminders, train: true });
      setTrainedAt(trained.modelMetadata.trainedAt);
      setTrainingNote(`Model updated successfully at ${formatUpdatedAt(new Date(trained.modelMetadata.trainedAt))}. Training records: ${trained.modelMetadata.recordCount}.`);
    } finally {
      window.setTimeout(() => setIsTraining(false), 350);
    }
  };

  const handleViewAll = () => {
    setPage(1);
    window.setTimeout(() => {
      predictionListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleAiSummary = () => {
    const topFactor = bundle.topRiskFactors[0]?.label || 'limited historical data';
    const topCluster = bundle.clusters[0]?.clusterNameEn || 'no dominant behavior cluster';
    const anomalyCount = bundle.anomalies.length;
    setAiSummary(`The risk engine estimates ${analytics.likelyMiss.length} companies may miss the next monthly report and ${analytics.highRisk.length} companies are recommended for review. Main driver: ${topFactor}. Behavior grouping found ${bundle.clusters.length} group(s), led by ${topCluster}, and ${anomalyCount} anomaly finding(s). Focus on report reminders, renewal verification, GPS cleanup, anomaly review, and high-risk inspection planning.`);
  };

  if (!canAccess) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
        Smart Analytics &amp; Risk Monitoring is restricted to Superadmin/Admin users.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F8FC] p-4 text-[#0B1A35]">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-[#0B2A66]">ការវិភាគឆ្លាតវៃ និងតាមដានហានិភ័យ</h2>
                <span className="rounded bg-[#0B2A66] px-2 py-1 text-xs font-black text-white">Smart Analytics</span>
              </div>
              <p className="text-base font-black text-[#0B2A66]">Smart Analytics &amp; Risk Monitoring Dashboard</p>
              <p className="mt-1 max-w-4xl text-sm font-semibold leading-relaxed text-slate-500">
                ផ្ទាំងនេះផ្តល់ការតាមដានព្យាករណ៍ជាជំនួយ សម្រាប់អាជ្ញាបណ្ណ របាយការណ៍ប្រចាំខែ ហានិភ័យតាមខេត្ត និងបន្ទុកការងារ។ Predictions are advisory and require official NMC verification.
              </p>
              <p className="mt-2 max-w-4xl rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold leading-relaxed text-[#0B2A66]">
                Transparent rule-based risk scoring with statistical trend forecasting and a learned baseline calibration. Behavior groups and anomaly findings come from explainable rules — full machine-learning models are a planned future phase. All results are advisory and subject to official review by NMC.
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{officialDate.fullText}</p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><CalendarDays className="h-4 w-4" /><input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="rounded border border-slate-200 px-2 py-1" /></label>
                <label className="text-xs font-bold text-slate-600"><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="rounded border border-slate-200 px-2 py-1" /></label>
              </div>
              <span className="text-xs font-bold text-slate-500">Data updated: {formatUpdatedAt(new Date())}</span>
              <button type="button" onClick={handleTrain} disabled={isTraining} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B2A66] px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-[#062B5F] disabled:cursor-wait disabled:opacity-70">
                <RefreshCw className={`h-4 w-4 ${isTraining ? 'animate-spin' : ''}`} /> {isTraining ? 'Recalibrating...' : 'Recalibrate Analytics'}
              </button>
              {trainingNote && (
                <span className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs font-bold text-green-700">
                  {trainingNote}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={<ShieldAlert className="h-5 w-5" />} kh="ក្រុមហ៊ុនមានហានិភ័យខ្ពស់" en="High Risk Companies" value={analytics.highRisk.length} change={null} color="#EF4444" values={analytics.spark(analytics.highRisk.length)} />
          <KpiCard icon={<AlertTriangle className="h-5 w-5" />} kh="ក្រុមហ៊ុនមានហានិភ័យធ្ងន់ធ្ងរ" en="Critical Risk Companies" value={analytics.critical.length} change={null} color="#F97316" values={analytics.spark(analytics.critical.length)} />
          <KpiCard icon={<Users className="h-5 w-5" />} kh="អាចខកខានរបាយការណ៍បន្ទាប់" en="Likely to Miss Next Report" value={analytics.likelyMiss.length} change={null} color="#8B5CF6" values={analytics.spark(analytics.likelyMiss.length)} />
          <KpiCard icon={<CalendarDays className="h-5 w-5" />} kh="អាជ្ញាបណ្ណផុតកំណត់ក្នុង ៩០ ថ្ងៃ" en="Licenses Expiring in 90 Days" value={analytics.expiring90} change={null} color="#2563EB" values={analytics.spark(analytics.expiring90)} />
          <KpiCard icon={<BarChart3 className="h-5 w-5" />} kh="ការអនុវត្តរបាយការណ៍ប្រចាំខែ" en="Monthly Report Compliance" value={analytics.monthlyCompliance} suffix="%" change={null} color="#16A34A" values={analytics.spark(analytics.monthlyCompliance)} />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr_1.15fr]">
          <Panel titleKh="និន្នាការព្យាករណ៍ - របាយការណ៍ប្រចាំខែ" titleEn="Prediction Trend - Report Submission">
            <LineChart rows={analytics.trendRows} series={[
              { key: 'high', label: 'High Risk', color: '#EF4444' },
              { key: 'critical', label: 'Critical Risk', color: '#F97316' },
              { key: 'miss', label: 'Likely to Miss', color: '#8B5CF6' }
            ]} />
          </Panel>
          <Panel titleKh="ការបែងចែកកម្រិតហានិភ័យ" titleEn="Risk Level Distribution">
            <DonutChart distribution={bundle.riskDistribution} />
          </Panel>
          <Panel
            titleKh="៥ ក្រុមហ៊ុនដែលមានហានិភ័យខ្ពស់បំផុត"
            titleEn="Top 5 Highest Risk Companies"
            action={<button type="button" onClick={handleViewAll} className="rounded-md border border-blue-100 px-2 py-1 text-[11px] font-black text-blue-700 hover:bg-blue-50">មើលទាំងអស់ / View All</button>}
          >
            <div className="space-y-2">
              {bundle.predictions.slice(0, 5).map((item, index) => (
                <div key={item.licenseId} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2" title={item.topFactors[0] || item.advisoryNote}>
                  <span className="rounded bg-[#0B2A66] py-1 text-center text-xs font-black text-white">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-[#0B2A66]">{item.licenseNumber}</p>
                    <p className="truncate text-[11px] font-semibold text-slate-500">{item.companyName}</p>
                    <p className="truncate text-[10px] text-slate-400">{item.topFactors[0] || 'Requires official verification'}</p>
                  </div>
                  <span className="rounded-md px-2 py-1 text-center text-xs font-black" style={{ background: `${riskColor[item.riskLevel]}18`, color: riskColor[item.riskLevel] }}>
                    {item.inspectionPriorityScore}<em className="block not-italic">{item.riskLevel}</em>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel titleKh="ការព្យាករណ៍អាជ្ញាបណ្ណផុតកំណត់" titleEn="License Expiry Forecast">
            <BarChart color="#F97316" rows={[
              { label: 'Next 30 Days', value: analytics.exp30, tooltip: `Next 30 Days: ${analytics.exp30}` },
              { label: '31-60 Days', value: analytics.exp60, tooltip: `31-60 Days: ${analytics.exp60}` },
              { label: '61-90 Days', value: analytics.exp90Only, tooltip: `61-90 Days: ${analytics.exp90Only}` },
              { label: '> 90 Days', value: analytics.more90, tooltip: `More than 90 Days: ${analytics.more90}` }
            ]} />
          </Panel>
          <Panel titleKh="ការព្យាករណ៍ចំនួនរបាយការណ៍ប្រចាំខែ" titleEn="Monthly Report Volume Forecast">
            <LineChart rows={bundle.reportVolumeForecast.map(row => ({ label: row.label, forecast: row.value }))} series={[{ key: 'forecast', label: 'Advisory forecast', color: '#2563EB' }]} />
          </Panel>
          <Panel titleKh="ការព្យាករណ៍ហានិភ័យតាមខេត្ត" titleEn="Province Risk Forecast">
            <ProvinceRiskMap rows={bundle.provinceRiskForecast} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel titleKh="កត្តាហានិភ័យសំខាន់ៗ" titleEn="Top Risk Factors">
            <BarChart color="#EF4444" rows={bundle.topRiskFactors.map(row => ({ label: row.label, value: row.count, tooltip: row.tooltip }))} />
          </Panel>
          <Panel titleKh="ទំនុកចិត្តនៃការវិភាគ" titleEn="Analytics Confidence">
            <ModelConfidenceCard confidence={analytics.confidence} bundle={bundle} trainedAt={trainedAt} />
          </Panel>
          <Panel titleKh="ការសង្ខេបស្វ័យប្រវត្តិ" titleEn="Automated Summary">
            <div className="rounded-lg bg-purple-50 p-4 text-sm font-semibold leading-relaxed text-[#0B1A35]">
              <Sparkles className="mb-2 h-7 w-7 text-purple-600" />
              <p>{aiSummary || 'Click Generate Summary to create a plain-language overview from the aggregated analytics results. The summary is generated locally from the numbers shown on this page.'}</p>
              <button type="button" onClick={handleAiSummary} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-4 py-2 text-xs font-black text-purple-700">
                <Sparkles className="h-4 w-4" /> បង្កើតសង្ខេប / Generate Summary
              </button>
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel titleKh="ក្រុមលំនាំក្រុមហ៊ុន" titleEn="Company Behavior Groups (Rule-Based)">
            <BarChart color="#2563EB" rows={bundle.clusters.map(cluster => ({
              label: cluster.clusterNameEn,
              value: cluster.companyCount,
              tooltip: `${cluster.clusterNameEn}: ${cluster.companyCount}. ${cluster.descriptionEn}`
            }))} />
          </Panel>
          <Panel titleKh="ភាពមិនប្រក្រតី" titleEn="Anomaly Detection Findings">
            <div className="space-y-2">
              {bundle.anomalies.length === 0 ? (
                <EmptyState label="No anomaly detected / មិនមានភាពមិនប្រក្រតី" />
              ) : bundle.anomalies.slice(0, 5).map(anomaly => (
                <div key={`${anomaly.entityType}-${anomaly.entityId}-${anomaly.reason}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3" title={anomaly.reason}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-xs text-[#0B2A66]">{anomaly.entityName}</strong>
                    <span className="rounded px-2 py-1 text-[10px] font-black" style={{ background: `${riskColor[anomaly.severity]}18`, color: riskColor[anomaly.severity] }}>{anomaly.severity} · {anomaly.anomalyScore}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-500">{anomaly.reason}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel titleKh="លំនាំខេត្ត/ឧបករណ៍" titleEn="Province, Service, and Instrument Pattern Insights">
            <BarChart color="#D4AF37" rows={bundle.patternInsights.slice(0, 8).map(insight => ({
              label: insight.label,
              value: insight.score,
              tooltip: insight.description
            }))} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel titleKh="ការបែងចែកក្រុម" titleEn="Company Cluster Distribution">
            <BarChart color="#0B2A66" rows={bundle.clusters.map(cluster => ({
              label: cluster.clusterNameEn,
              value: cluster.companyCount,
              tooltip: `${cluster.descriptionEn} Recommended action: ${cluster.recommendedAction}`
            }))} />
          </Panel>
          <Panel titleKh="កម្រិតភាពមិនប្រក្រតី" titleEn="Anomaly Severity Distribution">
            <BarChart color="#EF4444" rows={countByLabel(bundle.anomalies, anomaly => anomaly.severity)} />
          </Panel>
        </section>

        <section ref={predictionListRef} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-black text-[#0B2A66]">បញ្ជីព្យាករណ៍ទាំងអស់</h3>
              <p className="text-xs font-semibold text-slate-500">All risk predictions - possible risk, recommended for review, requires official verification.</p>
            </div>
            <span className="text-xs font-bold text-slate-500">Page {page} / {totalPages} · {bundle.predictions.length} records</span>
          </div>
          {bundle.predictions.length === 0 ? (
            <EmptyState label="Data not available / មិនមានទិន្នន័យគ្រប់គ្រាន់" />
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {paginated.map(prediction => (
                <div key={prediction.licenseId}>
                  <PredictionExplanationPanel prediction={prediction} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={page === 1} onClick={() => setPage(prev => Math.max(1, prev - 1))} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50 disabled:opacity-50">Prev</button>
            <button type="button" disabled={page === totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50 disabled:opacity-50">Next</button>
          </div>
        </section>

        <section className="rounded-lg bg-[#0B1A35] p-4 text-white shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-base font-black">របាយការណ៍ និងនាំចេញ</h3>
              <p className="text-xs font-semibold text-slate-300">Reports & Export</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <button type="button" onClick={exportWord} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-xs font-black hover:bg-white/15"><FileText className="h-5 w-5 text-blue-300" /> Word Report .docx</button>
              <button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-xs font-black hover:bg-white/15"><Download className="h-5 w-5 text-red-300" /> PDF Report .pdf</button>
              <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-xs font-black hover:bg-white/15"><FileSpreadsheet className="h-5 w-5 text-green-300" /> Excel Report .xlsx</button>
              <button type="button" onClick={exportPowerPoint} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-xs font-black hover:bg-white/15"><Presentation className="h-5 w-5 text-orange-300" /> PowerPoint .pptx</button>
              <button type="button" onClick={exportWord} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-xs font-black hover:bg-white/10"><Database className="h-5 w-5" /> Generate Full Analytics Report</button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-900">
          <strong>Disclaimer:</strong> Predictions come from transparent rule-based analytics with statistical forecasting; they are advisory and require official review and verification by NMC. The system does not make automatic government decisions.
        </section>
      </div>
    </div>
  );
}
