import { collectDataset } from './dataset';
import { LifecycleStore } from './lifecycle';
import { anomalyScore, clusterIndex, featureVector, probability } from './portable';
import { riskLevelFromScore } from '../utils/mlRiskFeatures';
import { issueReportArtifact, sha256 } from '../reports/issuance';
import type { AuditData, AuditFilters, AuditRow } from './auditTypes';
import { renderAuditExcel, renderAuditPdf } from './auditRender';
import { generateExecutiveBriefing } from './narrative';

export class AuditExportError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new AuditExportError(400, 'Use valid YYYY-MM-DD dates.');
  return value;
}
export function parseAuditFilters(query: Record<string, unknown>): AuditFilters {
  const allowed = ['from', 'to', 'instrument_type', 'organization_id', 'risk_level', 'q'];
  const result: AuditFilters = {};
  for (const key of Object.keys(query)) {
    if (!allowed.includes(key)) throw new AuditExportError(400, `Unknown export filter: ${key}`);
    const value = query[key];
    if (typeof value !== 'string' || value.length > 200) throw new AuditExportError(400, 'Invalid export filter.');
    if (value.trim()) result[key] = value.trim();
  }
  if (result.from) date(result.from);
  if (result.to) date(result.to);
  if (result.from && result.to && result.from > result.to) throw new AuditExportError(400, 'Start date must not follow end date.');
  if (result.risk_level && !['Low', 'Medium', 'High', 'Critical'].includes(result.risk_level)) throw new AuditExportError(400, 'Invalid risk level.');
  return result;
}
const normalize = (v: unknown) => String(v ?? '').normalize('NFKC').toLowerCase();
export async function collectAuditData(db: any, filters: AuditFilters): Promise<AuditData> {
  const dataset = await collectDataset(db);
  const active = process.env.ML_LIFECYCLE_ENABLED === 'true' ? (await new LifecycleStore(db).read()).state.active : undefined;
  const features = new Map(dataset.inferenceFeatures.map(f => [f.licenseNumber, f]));
  const licenses = new Map(dataset.evidence.licenses.map(l => [l.license_number, l]));
  const selected = new Map<string, any>();
  const rows: AuditRow[] = [];
  for (const report of dataset.evidence.accepted) {
    const stamp = report.submitted_at || report.created_at || `${String(report.period_month).slice(0, 7)}-01T00:00:00+07:00`;
    const time = Date.parse(stamp);
    if (!Number.isFinite(time)) continue;
    if (filters.from && time < Date.parse(`${filters.from}T00:00:00+07:00`)) continue;
    if (filters.to && time > Date.parse(`${filters.to}T23:59:59.999+07:00`)) continue;
    const license = licenses.get(report.licence_no);
    if (filters.organization_id && ![license?.id, license?.company_id, license?.company_user_id].includes(filters.organization_id)) continue;
    const feature = features.get(report.licence_no);
    const x = feature ? featureVector(feature) : null;
    const score = active && x ? probability(active.model, x) : null;
    const anomaly = active && x ? anomalyScore(active.model, x) : null;
    const level = score === null ? 'Unavailable' : riskLevelFromScore(score * 100);
    if (filters.risk_level && level !== filters.risk_level) continue;
    const cluster = active && x ? `Cluster ${clusterIndex(active.model, x) + 1}` : 'Unavailable';
    let pca: number[] | null = null, topFeature = 'Unavailable';
    if (active && x) {
      const z = x.map((v, i) => (v - active.model.mean[i]) / active.model.scale[i]);
      const index = z.reduce((best, v, i) => Math.abs(v) > Math.abs(z[best]) ? i : best, 0);
      topFeature = active.model.features[index];
      if (active.model.pca) pca = active.model.pca.components.map(component => component.reduce((s, c, i) => s + c * (z[i] - active.model.pca!.mean[i]), 0));
    }
    const work = [...dataset.evidence.instruments.filter(r => r.report_uuid === report.id),
      ...dataset.evidence.repairs.filter(r => r.report_uuid === report.id)];
    // Empty monthly reports remain auditable even when no instrument rows exist.
    for (const instrument of work.length ? work : [{ id: '', instrument_name: '', category: 'No instrument rows' }]) {
      const category = String(instrument.category || license?.measuring_instrument_type || 'Unspecified');
      if (filters.instrument_type && !normalize([category, instrument.instrument_name].join(' ')).includes(normalize(filters.instrument_type))) continue;
      const row: AuditRow = {
        reportId: String(report.report_id || report.id), instrumentId: String(instrument.id || 'N/A'),
        timestamp: new Date(time).toISOString(), organizationId: String(license?.id || ''), licence: String(report.licence_no),
        company: String(license?.company_name_en || license?.company_name || report.enterprise_name_en || report.enterprise_name_kh || report.licence_no),
        category, instrument: String(instrument.instrument_name || ''), serial: String(instrument.serial_no || ''),
        riskProbability: score, riskLevel: level, anomalyScore: anomaly === null ? null : Math.round(anomaly * 10000) / 100,
        outlier: anomaly === null ? null : anomaly > active!.model.anomalyThreshold, cluster, pca,
        reason: anomaly === null ? 'No trained model available' : anomaly > active!.model.anomalyThreshold
          ? 'IsolationForest enterprise-level behavioral deviation' : 'No enterprise-level outlier flag',
        action: score === null ? 'Review reporting evidence; model unavailable' : score >= 0.6
          ? 'Prioritize evidence review; verify recalibration need against actual measurements' : 'Routine evidence review',
        topFeature, currentErrorRatio: null, driftForecast: null, calibrationInterval: null,
      };
      if (filters.q && !normalize(Object.values(row).filter(v => typeof v === 'string').join(' ')).includes(normalize(filters.q))) continue;
      rows.push(row); selected.set(String(report.id), report);
      if (rows.length > 10000) throw new AuditExportError(413, 'Export exceeds 10,000 rows. Narrow the date or organization filters.');
    }
  }
  rows.sort((a, b) => (b.riskProbability ?? -1) - (a.riskProbability ?? -1) || a.reportId.localeCompare(b.reportId) || a.instrumentId.localeCompare(b.instrumentId));
  const history = new Map<string, any[]>();
  for (const r of selected.values()) { const month = String(r.period_month).slice(0, 7); history.set(month, [...(history.get(month) || []), r]); }
  const onTimeRate = (items: any[]) => { const known = items.filter(r => r.on_time === true || r.on_time === false);
    return known.length ? known.filter(r => r.on_time).length / known.length : null; };
  const clusters = active ? active.model.centers.map((centroid, i) => {
    const members = rows.filter(r => r.cluster === `Cluster ${i + 1}`);
    return { label: `Cluster ${i + 1}`, count: members.length, enterpriseCount: new Set(members.map(r => r.licence)).size,
      averageAnomaly: members.length ? members.reduce((n, r) => n + (r.anomalyScore || 0), 0) / members.length : null, centroid };
  }) : [];
  const metrics = active?.metrics || { accuracy: null, f1: null, silhouette: null, labelSource: 'No trained model; scores unavailable' };
  const limitations = [
    'Accepted monthly reports only. Scope dates use submission timestamps in GMT+7; historical periods are reporting months.',
    'Predictions and anomalies are enterprise-level reporting-behavior scores repeated beside related instrument rows, not instrument pass/fail probabilities.',
    'No measured-error/MPE time series, physical drift forecasts or validated recalibration intervals are stored. These fields are unavailable, not zero.',
    'The compliance chart is observed on-time reporting, not a measurement-tolerance curve or a validated future compliance forecast.',
    'Top feature means largest standardized departure, not a causal explanation or SHAP contribution.',
    active?.metrics.labelSource || 'Cold-start baseline: no fitted ML model.',
    'PCA uses the fitted standardized enterprise feature projection. It is not a laboratory-error embedding; unavailable for older models without PCA.',
    'All scores are advisory. A named reviewer must verify evidence before regulatory action.',
  ];
  const result: AuditData = { generatedAt: new Date().toISOString(), filters, sourceFingerprint: sha256(JSON.stringify({ fingerprint: dataset.fingerprint, filters, version: active?.id || null, rows })),
    modelVersion: active?.id || 'Cold-Start Baseline', lastTrainedAt: active?.trainedAt || null,
    trainedReportCount: active?.trainedReportCount || 0, status: active ? 'Active (Trained)' : 'Cold-Start Baseline',
    metrics, rows, reportCount: selected.size, enterpriseCount: new Set(rows.map(r => r.licence)).size,
    highRiskCount: new Set(rows.filter(r => ['High', 'Critical'].includes(r.riskLevel)).map(r => r.licence)).size,
    anomalyCount: new Set(rows.filter(r => r.outlier).map(r => r.reportId)).size,
    onTimeRate: onTimeRate([...selected.values()]), history: [...history].sort(([a], [b]) => a.localeCompare(b)).map(([month, records]) => ({ month, count: records.length, rate: onTimeRate(records) })),
    clusters, featureNames: active?.model.features || [], limitations };
  result.executive_briefing = generateExecutiveBriefing(result);
  return result;
}

export async function createMlAuditExport(db: any, filters: AuditFilters, format: 'pdf' | 'xlsx', issuer: string) {
  if (process.env.REPORT_QR_ENABLED !== 'true') throw new AuditExportError(503, 'Registered QR issuance must be enabled before exporting audit reports.');
  const data = await collectAuditData(db, filters);
  if (format === 'pdf' && data.rows.length > 500) throw new AuditExportError(413, 'PDF exports are limited to 500 rows. Narrow the scope or use Excel for up to 10,000 rows.');
  return issueReportArtifact(db, { kind: 'ml-audit', format, title: 'Metrology Machine Learning & Predictive Quality Audit Report',
    issuer, basis: 'database', period: [filters.from || 'All dates', filters.to || 'present'].join(' to '), snapshot: data },
    seal => format === 'pdf' ? renderAuditPdf(data, seal) : renderAuditExcel(data, seal));
}
