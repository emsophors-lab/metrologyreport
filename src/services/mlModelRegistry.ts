import {
  MlCompanyFeatures,
  MlEvaluationMetrics,
  MlModelMetadata,
  MlPredictionResult,
  MlRiskLevel,
  MlTrainingRecord,
  confidenceFromMonths,
  percentProbability,
  riskLevelFromScore
} from '../utils/mlRiskFeatures';

export const ML_MODEL_VERSION = 'nmc-ml-baseline-2026-07';
const LEARNED_FEATURES = [
  'bias',
  'missingReportsLast3Months',
  'missingReportsLast6Months',
  'lateReportsLast3Months',
  'averageSubmissionDelayDays',
  'lastReportAgeDays',
  'consecutiveMissingMonths',
  'reportSubmissionRateGap',
  'expiryUrgency',
  'isExpired',
  'noGps',
  'noTelegram',
  'profileGap',
  'highRiskInstrumentFlag',
  'provinceComplianceGap',
  'provinceExpiredLicenseRate'
];

function probabilityFromScore(score: number) {
  return percentProbability(1 / (1 + Math.exp(-((score - 50) / 18))));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function learnedFeatureVector(feature: MlCompanyFeatures) {
  return {
    bias: 1,
    missingReportsLast3Months: Math.min(1, feature.missingReportsLast3Months / 3),
    missingReportsLast6Months: Math.min(1, feature.missingReportsLast6Months / 6),
    lateReportsLast3Months: Math.min(1, feature.lateReportsLast3Months / 3),
    averageSubmissionDelayDays: Math.min(1, Math.max(0, feature.averageSubmissionDelayDays) / 30),
    lastReportAgeDays: Math.min(1, Math.max(0, feature.lastReportAgeDays) / 180),
    consecutiveMissingMonths: Math.min(1, feature.consecutiveMissingMonths / 6),
    reportSubmissionRateGap: Math.max(0, 100 - feature.reportSubmissionRate) / 100,
    expiryUrgency: feature.isExpired ? 1 : feature.daysUntilExpiry >= 0 ? Math.max(0, 90 - feature.daysUntilExpiry) / 90 : 0,
    isExpired: feature.isExpired ? 1 : 0,
    noGps: feature.hasGps ? 0 : 1,
    noTelegram: feature.hasTelegram ? 0 : 1,
    profileGap: Math.max(0, 100 - feature.profileCompletenessScore) / 100,
    highRiskInstrumentFlag: feature.highRiskInstrumentFlag ? 1 : 0,
    provinceComplianceGap: Math.max(0, 100 - feature.provinceReportComplianceRate) / 100,
    provinceExpiredLicenseRate: Math.min(1, Math.max(0, feature.provinceExpiredLicenseRate) / 100)
  };
}

function learnedProbability(feature: MlCompanyFeatures, weights?: Record<string, number>) {
  if (!weights) return null;
  const vector = learnedFeatureVector(feature);
  const score = LEARNED_FEATURES.reduce((sum, key) => sum + (weights[key] || 0) * (vector[key as keyof typeof vector] || 0), 0);
  return percentProbability(sigmoid(score));
}

function trainLearnedWeights(records: MlTrainingRecord[]) {
  const labeled = records.filter(record => record.labels.highInspectionPriority !== null);
  if (labeled.length < 10) return undefined;

  const weights = LEARNED_FEATURES.reduce<Record<string, number>>((acc, key) => {
    acc[key] = key === 'bias' ? -0.85 : 0;
    return acc;
  }, {});
  const learningRate = 0.08;

  for (let epoch = 0; epoch < 220; epoch += 1) {
    labeled.forEach(record => {
      const vector = learnedFeatureVector(record.features);
      const actual = record.labels.highInspectionPriority ? 1 : 0;
      const predicted = learnedProbability(record.features, weights) || 0;
      const error = actual - predicted;
      LEARNED_FEATURES.forEach(key => {
        weights[key] += learningRate * error * (vector[key as keyof typeof vector] || 0);
      });
    });
  }

  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.round(value * 1000) / 1000]));
}

function addFactor(condition: boolean, en: string, km: string, factors: string[], factorsKm: string[]) {
  if (condition) {
    factors.push(en);
    factorsKm.push(km);
  }
}

function actionFor(level: MlRiskLevel, missProbability: number, expiryProbability: number) {
  if (level === 'Critical') return ['Prioritize for inspection', 'ផ្តល់អាទិភាពសម្រាប់ត្រួតពិនិត្យ'];
  if (expiryProbability >= 0.65) return ['Verify license renewal status', 'ពិនិត្យស្ថានភាពបន្តសុពលភាពអាជ្ញាប័ណ្ណ'];
  if (missProbability >= 0.55) return ['Send report reminder', 'ផ្ញើការរំលឹករបាយការណ៍'];
  if (level === 'High') return ['Contact company representative', 'ទាក់ទងតំណាងក្រុមហ៊ុន'];
  return ['Normal monitoring', 'តាមដានធម្មតា'];
}

export function predictWithBaselineModel(feature: MlCompanyFeatures, predictionMonth: string): MlPredictionResult {
  const missScore =
    feature.missingReportsLast3Months * 18 +
    feature.consecutiveMissingMonths * 10 +
    (feature.lastReportAgeDays > 45 ? 18 : 0) +
    (!feature.hasTelegram ? 10 : 0) +
    (feature.reportSubmissionRate < 50 ? 16 : 0);
  const lateScore =
    feature.lateReportsLast3Months * 18 +
    Math.min(25, feature.averageSubmissionDelayDays * 1.4) +
    (!feature.hasTelegram ? 8 : 0) +
    (feature.missingReportsLast6Months > 2 ? 10 : 0);
  const expiryScore =
    (feature.isExpired ? 55 : 0) +
    (feature.expiresIn30Days ? 28 : feature.expiresIn60Days ? 20 : feature.expiresIn90Days ? 12 : 0) +
    (feature.previousRenewalCount === 0 ? 10 : 0) +
    (feature.renewalRemindersSent > 0 && feature.daysUntilExpiry < 15 ? 8 : 0);

  const missReportProbability = probabilityFromScore(missScore);
  const lateReportProbability = probabilityFromScore(lateScore);
  const licenseExpiryRiskProbability = probabilityFromScore(expiryScore);
  const baselineInspectionPriorityScore = Math.round(
    missReportProbability * 28 +
    lateReportProbability * 14 +
    licenseExpiryRiskProbability * 34 +
    (!feature.hasGps ? 8 : 0) +
    (!feature.hasTelegram ? 6 : 0) +
    (feature.highRiskInstrumentFlag ? 8 : 0) +
    (feature.profileCompletenessScore < 70 ? 6 : 0)
  );
  const learned = learnedProbability(feature, loadLatestModel()?.learnedWeights);
  const inspectionPriorityScore = learned === null
    ? baselineInspectionPriorityScore
    : Math.round(baselineInspectionPriorityScore * 0.65 + learned * 100 * 0.35);
  const riskLevel = riskLevelFromScore(inspectionPriorityScore);
  const factors: string[] = [];
  const factorsKm: string[] = [];

  addFactor(feature.missingReportsLast3Months > 0, `Missed ${feature.missingReportsLast3Months} of the last 3 monthly reports`, `ខកខាន ${feature.missingReportsLast3Months} ក្នុងចំណោមរបាយការណ៍ ៣ ខែចុងក្រោយ`, factors, factorsKm);
  addFactor(feature.lateReportsLast3Months > 0, `Late submissions in ${feature.lateReportsLast3Months} recent month(s)`, `បានដាក់របាយការណ៍យឺត ${feature.lateReportsLast3Months} ខែចុងក្រោយ`, factors, factorsKm);
  addFactor(feature.isExpired || feature.expiresIn90Days, feature.isExpired ? 'License is already expired' : `License expires in ${feature.daysUntilExpiry} days`, feature.isExpired ? 'អាជ្ញាប័ណ្ណបានផុតកំណត់រួចហើយ' : `អាជ្ញាប័ណ្ណនឹងផុតកំណត់ក្នុង ${feature.daysUntilExpiry} ថ្ងៃ`, factors, factorsKm);
  addFactor(!feature.hasTelegram, 'No Telegram reminder link is recorded', 'មិនទាន់មានការភ្ជាប់ Telegram សម្រាប់ការរំលឹក', factors, factorsKm);
  addFactor(!feature.hasGps, 'GPS/location record is missing', 'មិនទាន់មានទិន្នន័យទីតាំង GPS', factors, factorsKm);
  addFactor(feature.highRiskInstrumentFlag, 'Instrument/service category needs closer monitoring', 'ប្រភេទឧបករណ៍ ឬសេវាកម្មត្រូវការតាមដានជិតស្និទ្ធ', factors, factorsKm);
  addFactor(feature.profileCompletenessScore < 70, `Profile completeness is ${feature.profileCompletenessScore}%`, `ព័ត៌មានប្រវត្តិរូបបំពេញបាន ${feature.profileCompletenessScore}%`, factors, factorsKm);

  addFactor(learned !== null, `Historical model calibration adjusted risk to ${Math.round((learned || 0) * 100)}%`, 'Model learned from historical license/report data', factors, factorsKm);

  const [recommendedAction, recommendedActionKm] = actionFor(riskLevel, missReportProbability, licenseExpiryRiskProbability);

  return {
    companyId: feature.companyId,
    licenseId: feature.licenseId,
    licenseNumber: feature.licenseNumber,
    companyName: feature.companyName,
    province: feature.province,
    predictionMonth,
    missReportProbability,
    lateReportProbability,
    licenseExpiryRiskProbability,
    inspectionPriorityScore,
    riskLevel,
    confidence: confidenceFromMonths(feature.distinctReportMonths),
    topFactors: factors.slice(0, 5),
    topFactorsKm: factorsKm.slice(0, 5),
    recommendedAction,
    recommendedActionKm,
    advisoryNote: 'ML-assisted predictions are advisory and require official review.'
  };
}

export function evaluatePredictionModels(records: MlTrainingRecord[]): MlEvaluationMetrics {
  const labeled = records.filter(record => record.labels.highInspectionPriority !== null);
  if (labeled.length < 10) {
    return {
      recordCount: records.length,
      accuracy: null,
      precision: null,
      recall: null,
      f1: null,
      mae: null,
      mape: null,
      note: 'Not enough historical data to calculate reliable model accuracy.'
    };
  }

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  labeled.forEach(record => {
    const predicted = predictWithBaselineModel(record.features, 'evaluation').inspectionPriorityScore >= 60;
    const actual = record.labels.highInspectionPriority;
    if (predicted && actual) tp += 1;
    else if (!predicted && !actual) tn += 1;
    else if (predicted && !actual) fp += 1;
    else fn += 1;
  });

  const accuracy = (tp + tn) / Math.max(1, labeled.length);
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(0.0001, precision + recall);

  return {
    recordCount: records.length,
    accuracy: Math.round(accuracy * 100) / 100,
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1: Math.round(f1 * 100) / 100,
    mae: null,
    mape: null,
    note: 'Baseline rule-assisted model evaluated against generated historical risk labels.'
  };
}

export function saveModelMetadata(metadata: MlModelMetadata) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem('nmc_ml_model_metadata', JSON.stringify(metadata));
}

export function loadLatestModel(): MlModelMetadata | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem('nmc_ml_model_metadata');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MlModelMetadata;
  } catch {
    return null;
  }
}

export function trainPredictionModels(records: MlTrainingRecord[]): MlModelMetadata {
  const months = Math.max(...records.map(record => record.features.distinctReportMonths), 0);
  const metrics = evaluatePredictionModels(records);
  const learnedWeights = trainLearnedWeights(records);
  const metadata: MlModelMetadata = {
    modelName: 'NMC Transparent Baseline Prediction Model',
    modelVersion: ML_MODEL_VERSION,
    trainedAt: new Date().toISOString(),
    trainingDataStart: null,
    trainingDataEnd: null,
    recordCount: records.length,
    features: [
      ...LEARNED_FEATURES.filter(feature => feature !== 'bias'),
      'instrument_demand_trend_score'
    ],
    learnedWeights,
    metrics,
    status: learnedWeights ? 'baseline_trained' : months < 3 ? 'insufficient_data' : 'rules_only'
  };
  saveModelMetadata(metadata);
  return metadata;
}
