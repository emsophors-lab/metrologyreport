import assert from 'node:assert/strict';
import { briefingText, generateExecutiveBriefing } from '../src/ml/narrative';
import type { AuditData, AuditRow } from '../src/ml/auditTypes';

const row: AuditRow = {reportId:'REPORT-A',instrumentId:'INSTRUMENT-1',timestamp:'2026-10-15T00:00:00Z',
  organizationId:'org-a',licence:'LIC-A',company:'Example enterprise',category:'Scale',instrument:'Scale',serial:'SN-1',
  riskProbability:0.92,riskLevel:'Critical',anomalyScore:92,outlier:true,cluster:'Cluster 1',
  reason:'Enterprise behavioral anomaly',action:'Review evidence',topFeature:'temperature',pca:[1,2],
  currentErrorRatio:null,driftForecast:null,calibrationInterval:null};
const fixture: AuditData = { generatedAt:'2026-10-21T00:00:00Z',filters:{},sourceFingerprint:'a'.repeat(64),
  modelVersion:'test-model',lastTrainedAt:'2026-10-01T00:00:00Z',trainedReportCount:100,status:'Active (Trained)',
  metrics:{accuracy:0.91,f1:0.85,silhouette:0.65,labelSource:'Derived-rule proxy labels'},
  rows:[row,{...row,instrumentId:'INSTRUMENT-2',serial:'SN-2'}],reportCount:1,enterpriseCount:1,highRiskCount:1,anomalyCount:1,onTimeRate:0.75,
  history:[{month:'2026-08',count:1,rate:0.9},{month:'2026-09',count:1,rate:0.75}],
  clusters:[{label:'Cluster 1',count:2,enterpriseCount:1,averageAnomaly:92,centroid:[1,2]}],featureNames:[],limitations:['Advisory only'] };
const briefing = generateExecutiveBriefing(fixture);
assert.deepEqual(briefing,generateExecutiveBriefing(fixture),'Identical evidence gives identical output');
assert.equal(briefing.evidence.high_risk_enterprises,1,'Do not double count repeated enterprise probabilities');
assert.equal(briefing.evidence.outlier_reports,1);
assert.equal(briefing.evidence.recent_severe_reports,1);
assert.equal(briefing.action_items[0].priority,'Critical');
assert.equal(briefing.action_items[0].targets.length,2);
assert.ok(briefing.supervised_findings.some(s=>s.includes('15.0 percentage points')));
assert.ok(briefing.action_items.length>=3 && briefing.action_items.length<=5);
assert.ok(!briefing.action_items.some(a=>a.category==='Environmental Control'),'A feature label alone is not environmental-causal evidence');
const healthy=generateExecutiveBriefing({...fixture,rows:[{...row,riskProbability:0.2,outlier:false,anomalyScore:30}],highRiskCount:0,anomalyCount:0});
assert.equal(healthy.headline_status,'Routine monitoring');
assert.equal(healthy.evidence.outlier_reports,0);
assert.ok(healthy.action_items.every(a=>a.priority!=='Critical'));
const cold=generateExecutiveBriefing({...fixture,status:'Cold-Start Baseline',modelVersion:'Cold-Start Baseline',
  metrics:{accuracy:null,f1:null,silhouette:null,labelSource:'Unavailable'},trainedReportCount:0,
  rows:[{...row,riskProbability:null,outlier:null,anomalyScore:null,cluster:'Unavailable'}],clusters:[],onTimeRate:null});
assert.match(cold.headline_status,/Cold-start/);
assert.ok(cold.summary_paragraph.includes('conclusions are withheld'));
assert.ok(!briefingText(cold).includes('undefined'));
const empty=generateExecutiveBriefing({...fixture,rows:[],reportCount:0,enterpriseCount:0,history:[],clusters:[],onTimeRate:null});
assert.equal(empty.headline_status,'No accepted evidence in scope');
assert.ok(empty.action_items.every(a=>a.targets.length===0));
const future=generateExecutiveBriefing({...fixture,rows:[{...row,timestamp:'2026-11-01T00:00:00Z'}]});
assert.equal(future.evidence.recent_severe_reports,0);
const stale=generateExecutiveBriefing({...fixture,rows:[{...row,timestamp:'2026-01-01T00:00:00Z'}]});
assert.equal(stale.evidence.recent_severe_reports,0);
const invalid=generateExecutiveBriefing({...fixture,metrics:{...fixture.metrics,accuracy:NaN,f1:NaN,silhouette:NaN},
  rows:[{...row,riskProbability:NaN,anomalyScore:NaN}]});
assert.ok(!briefingText(invalid).includes('NaN'));
const unsupported=generateExecutiveBriefing({...fixture,rows:[{...row,driftForecast:999999,currentErrorRatio:50} as any]});
assert.ok(!briefingText(unsupported).includes('999999'));
assert.ok(!unsupported.action_items.some(a=>/shorten|reduce.*interval.*\d+%/i.test(a.action)));
assert.ok(unsupported.action_items.some(a=>a.action.includes('No automatic interval reduction')));
assert.match(briefingText(briefing),/REPORT|review/i);
console.log('PASS: deterministic briefing, duplicate-safe report/enterprise counts, recent severe anomalies, zero anomalies, cold start, empty scope, historical trend, future/stale timestamps, finite metrics, linked evidence, priority ordering and no unsupported physical/environmental prescriptions. No network, database or LLM requests.');
