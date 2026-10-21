import type { AuditData, AuditRow } from './auditTypes';

export interface BriefingTarget { reportId: string; instrumentId: string; licence: string; category: string; serial: string }
export interface BriefingAction {
  id: string; priority: 'Critical' | 'High' | 'Medium';
  category: 'Calibration Interval' | 'Audit Investigation' | 'Environmental Control' | 'Model Retraining';
  action: string; quantified_impact: string; targets: BriefingTarget[];
}
export interface ExecutiveBriefing {
  engine: 'deterministic-v1'; headline_status: string; summary_paragraph: string;
  supervised_findings: string[]; unsupervised_findings: string[]; action_items: BriefingAction[];
  evidence: { report_count: number; enterprise_count: number; high_risk_enterprises: number; outlier_reports: number;
    recent_severe_reports: number; model_version: string; source_fingerprint: string; generated_at: string };
  limitations: string[];
}
const unique = (rows: AuditRow[], key: keyof AuditRow) => new Set(rows.map(r => r[key]).filter(v => v !== '' && v !== 'N/A' && v !== null)).size;
const percent = (value: number | null) => value !== null && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'unavailable';
const metric = (value: number | null) => value !== null && Number.isFinite(value) ? value.toFixed(3) : 'unavailable';
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const targets = (rows: AuditRow[]): BriefingTarget[] => [...new Map(rows.map(r => [JSON.stringify([r.reportId, r.instrumentId, r.licence]),
  { reportId: r.reportId, instrumentId: r.instrumentId, licence: r.licence, category: r.category, serial: r.serial }])).values()]
  .sort((a, b) => a.reportId.localeCompare(b.reportId) || a.instrumentId.localeCompare(b.instrumentId));

/** Evidence-only statements. No network calls, prompts, generated causal claims or automatic regulatory decisions. */
export function generateExecutiveBriefing(data: AuditData): ExecutiveBriefing {
  const trained = data.status === 'Active (Trained)';
  const high = trained ? data.rows.filter(r => r.riskProbability !== null && Number.isFinite(r.riskProbability) && r.riskProbability >= 0.6) : [];
  const outliers = trained ? data.rows.filter(r => r.outlier === true && r.anomalyScore !== null && Number.isFinite(r.anomalyScore)) : [];
  const now = Date.parse(data.generatedAt);
  const recent = outliers.filter(r => r.anomalyScore! > 85 && Number.isFinite(Date.parse(r.timestamp)) &&
    Date.parse(r.timestamp) <= now && now - Date.parse(r.timestamp) <= 30 * 86400000);
  const highCount = unique(high, 'licence'), outlierCount = unique(outliers, 'reportId'), severeCount = unique(recent, 'reportId');
  const validMonths = data.history.filter(h => h.rate !== null && Number.isFinite(h.rate)).slice().sort((a,b)=>a.month.localeCompare(b.month));
  const trend = validMonths.length < 2 ? 'An observed reporting trajectory cannot be estimated from fewer than two populated reporting months.' : (() => {
    const previous = validMonths.at(-2)!, last = validMonths.at(-1)!;
    const difference = (last.rate! - previous.rate!) * 100;
    return `Observed on-time reporting ${difference > 0 ? 'increased' : difference < 0 ? 'decreased' : 'was unchanged'} by ${Math.abs(difference).toFixed(1)} percentage points from ${previous.month} to ${last.month}; this is historical, not a future forecast.`;
  })();
  const categories = [...new Set(high.map(r=>r.category))].map(category => ({category, count: unique(high.filter(r=>r.category===category),'licence')}))
    .sort((a,b)=>b.count-a.count||a.category.localeCompare(b.category));
  const departures = [...new Set(high.map(r=>r.topFeature).filter(v=>v && v!=='Unavailable'))]
    .map(feature=>({feature,count:unique(high.filter(r=>r.topFeature===feature),'licence')}))
    .sort((a,b)=>b.count-a.count||a.feature.localeCompare(b.feature));
  const supervised = [trained
    ? `${count(highCount,'distinct enterprise')} ${highCount===1?'has':'have'} inspection-priority probability at or above 60%; these are enterprise reporting-behavior scores, not instrument failure probabilities.`
    : 'No active trained model is available. Supervised probabilities, physical drift velocity and tolerance-breach projections are unavailable.',
    `Supervised cross-validation accuracy: ${percent(data.metrics.accuracy)}; F1: ${metric(data.metrics.f1)}. Label provenance: ${data.metrics.labelSource}.`,
    categories.length ? `The largest high-priority category grouping is ${categories[0].category}, covering ${categories[0].count} distinct enterprises. This grouping does not establish a causal driver.`
      : 'No high-priority enterprise category grouping is supported by the current scope.',
    departures.length ? `The most frequently recorded largest standardized departure is ${departures[0].feature}, recorded for ${count(departures[0].count,'high-priority enterprise')}. This is not model feature importance or a causal failure contribution.`
      : 'No standardized feature departure is available for high-priority enterprises.',
    trend,
    'Measured error ratios, MPE breach dates, drift velocities, manufacturer effects and environmental feature importances are not supplied by this model. Calibration stability cannot be concluded.',
  ];
  const occupied = trained ? data.clusters.filter(c=>c.count>0) : [];
  const unsupervised = [trained
    ? `${count(outlierCount,'distinct report')} ${outlierCount===1?'carries':'carry'} an enterprise-level IsolationForest outlier flag; ${severeCount} ${severeCount===1?'has':'have'} scores above 85/100 and submission timestamps within the past 30 days.`
    : 'IsolationForest outlier scores and fitted cluster assignments are unavailable in cold-start mode.',
    `${occupied.length} fitted cluster groups contain scoped evidence. Silhouette score: ${metric(data.metrics.silhouette)}. Cluster labels describe numeric group assignments, not diagnosed equipment faults.`,
    ...occupied.map(c=>`${c.label}: ${c.enterpriseCount} enterprises and ${c.count} instrument/report rows; mean anomaly score ${metric(c.averageAnomaly)}/100. Enterprise membership can repeat across instrument rows.`),
    'An outlier flag does not establish a transcription error, sensor fault, thermal drift or laboratory environmental cause; source evidence must be reviewed.',
  ];
  const action_items: BriefingAction[] = [];
  if (severeCount) action_items.push({id:'severe-review',priority:'Critical',category:'Audit Investigation',
    action:'Arrange four-eyes verification of the recent high-anomaly reports and their source records. Confirm data accuracy before deciding on re-inspection.',
    quantified_impact:`${count(severeCount,'distinct recent report')}; ${count(unique(recent,'instrumentId'),'linked instrument row')}. No reduction in failures is asserted.`,targets:targets(recent)});
  else action_items.push({id:'outlier-review',priority:outlierCount?'High':'Medium',category:'Audit Investigation',
    action:outlierCount?'Review the flagged reports against their source evidence; escalate only after a reviewer confirms a discrepancy.':
      'Continue routine source-evidence review. No current outlier flag is a guarantee of calibration stability.',
    quantified_impact:`${outlierCount} flagged reports in a scope of ${data.reportCount} accepted reports.`,targets:targets(outliers)});
  if (highCount) action_items.push({id:'priority-review',priority:'High',category:'Audit Investigation',
    action:'Prioritize reporting and inspection evidence review for the high-priority enterprises; do not interpret this probability as physical equipment failure.',
    quantified_impact:`${count(highCount,'distinct enterprise')}; ${count(unique(high,'reportId'),'accepted report')} linked to this scope.`,targets:targets(high)});
  action_items.push({id:'interval-evidence',priority:'Medium',category:'Calibration Interval',
    action:'Retain the approved recalibration schedule unless authorized staff establish measured-error, MPE and interval evidence supporting a change. No automatic interval reduction is justified.',
    quantified_impact:`${unique(data.rows,'instrumentId')} linked instrument rows; 0 evidence-backed interval changes calculated by this model.`,targets:targets(high)});
  action_items.push({id:'model-readiness',priority:!trained || (data.metrics.f1 !== null && data.metrics.f1<0.5)?'High':'Medium',category:'Model Retraining',
    action:trained?'Monitor verified-data growth and model validation gates; request retraining when lifecycle readiness or drift thresholds are met.':
      'Collect verified, representative examples and request model training after lifecycle readiness checks. Until then, use reviewed baseline evidence only.',
    quantified_impact:`Active model: ${data.modelVersion}; ${data.trainedReportCount} reports in its training snapshot; no promised accuracy gain.`,targets:[]});
  const order = {Critical:0,High:1,Medium:2};
  action_items.sort((a,b)=>order[a.priority]-order[b.priority] || a.id.localeCompare(b.id));
  const result: ExecutiveBriefing = {engine:'deterministic-v1',
    headline_status:!data.reportCount?'No accepted evidence in scope':!trained?'Cold-start: evidence review required':severeCount?'Critical review priority':highCount||outlierCount?'Elevated review priority':'Routine monitoring',
    summary_paragraph:`The current scope contains ${count(data.reportCount,'accepted report')} across ${count(data.enterpriseCount,'enterprise')}; the observed on-time reporting rate is ${percent(data.onTimeRate)}. ${trained
      ? `${count(highCount,'enterprise')} ${highCount===1?'meets':'meet'} the high-priority review threshold and ${count(outlierCount,'distinct report')} ${outlierCount===1?'carries an outlier flag':'carry outlier flags'}.`
      : 'No active trained model is available, so predictive risk and anomaly conclusions are withheld.'} Physical calibration drift and future tolerance compliance cannot be inferred from the available reporting-behavior data.`,
    supervised_findings:supervised,unsupervised_findings:unsupervised,action_items:action_items.slice(0,5),
    evidence:{report_count:data.reportCount,enterprise_count:data.enterpriseCount,high_risk_enterprises:highCount,outlier_reports:outlierCount,
      recent_severe_reports:severeCount,model_version:data.modelVersion,source_fingerprint:data.sourceFingerprint,generated_at:data.generatedAt},
    limitations:[...data.limitations,'Generated offline from deterministic rules; no external LLM receives report data. Recommendations require named staff review.']};
  return result;
}
export function briefingText(briefing: ExecutiveBriefing) {
  return [briefing.headline_status,briefing.summary_paragraph,'Supervised findings',...briefing.supervised_findings,
    'Unsupervised findings',...briefing.unsupervised_findings,'Prioritized recommendations',
    ...briefing.action_items.map((a,i)=>`${i+1}. ${a.priority} | ${a.category}: ${a.action} Impact: ${a.quantified_impact}`),
    `Model: ${briefing.evidence.model_version} | Evidence: ${briefing.evidence.source_fingerprint}`].join('\n\n');
}
