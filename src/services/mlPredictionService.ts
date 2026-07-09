import { EnterpriseLicense, LicenseReminderLog, LicenseRenewalHistory, MetrologyReport } from '../types';
import { assessMlDataQuality, buildMlFeatures } from './mlFeatureEngineering';
import { buildTrainingDataset } from './mlTrainingDataService';
import { loadLatestModel, predictWithBaselineModel, trainPredictionModels } from './mlModelRegistry';
import { runUnsupervisedAnalysis } from './mlUnsupervisedLearningService';
import { forecastMonthlyReportVolume } from '../utils/mlTrendForecasting';
import {
  MlForecastPoint,
  MlPredictionBundle,
  MlRiskLevel,
  addMonths,
  monthKey,
  riskLevelFromScore
} from '../utils/mlRiskFeatures';

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, number>();
  items.forEach(item => {
    const key = getKey(item) || 'Unknown';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function forecastExpiryWorkload(licenses: EnterpriseLicense[], now: Date): MlForecastPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const date = addMonths(now, index + 1);
    const key = monthKey(date.getFullYear(), date.getMonth());
    const value = licenses.filter(license => {
      const expiry = String(license.license_expiry_date || '');
      return expiry.startsWith(key);
    }).length;
    return {
      label: key,
      value,
      tooltip: `Licenses expiring in ${key}: ${value}`
    };
  });
}

export function generatePredictions(input: {
  licenses: EnterpriseLicense[];
  reports: MetrologyReport[];
  renewals?: LicenseRenewalHistory[];
  reminders?: LicenseReminderLog[];
  now?: Date;
  train?: boolean;
}): MlPredictionBundle {
  const now = input.now || new Date();
  const predictionDate = addMonths(now, 1);
  const predictionMonth = monthKey(predictionDate.getFullYear(), predictionDate.getMonth());
  const features = buildMlFeatures(input);
  const trainingRecords = buildTrainingDataset(input);
  const modelMetadata = input.train ? trainPredictionModels(trainingRecords) : (loadLatestModel() || trainPredictionModels(trainingRecords));
  const predictions = features
    .map(feature => predictWithBaselineModel(feature, predictionMonth))
    .sort((a, b) => b.inspectionPriorityScore - a.inspectionPriorityScore);
  const dataQuality = assessMlDataQuality(input);
  const unsupervised = runUnsupervisedAnalysis(features);
  const riskDistribution = predictions.reduce<Record<MlRiskLevel, number>>((acc, prediction) => {
    acc[prediction.riskLevel] += 1;
    return acc;
  }, { Low: 0, Medium: 0, High: 0, Critical: 0 });

  const factorCounts = new Map<string, number>();
  predictions.forEach(prediction => {
    prediction.topFactors.forEach(factor => factorCounts.set(factor, (factorCounts.get(factor) || 0) + 1));
  });
  const provinceRiskForecast = countBy(predictions, prediction => prediction.province).map(row => {
    const provincePredictions = predictions.filter(prediction => prediction.province === row.label);
    const riskScore = Math.round(provincePredictions.reduce((sum, item) => sum + item.inspectionPriorityScore, 0) / Math.max(1, provincePredictions.length));
    return {
      province: row.label,
      riskScore,
      riskLevel: riskLevelFromScore(riskScore),
      tooltip: `${row.label}: average predicted risk score ${riskScore} across ${provincePredictions.length} license(s)`
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  return {
    predictions,
    dataQuality,
    modelMetadata,
    clusters: unsupervised.clusters,
    anomalies: unsupervised.anomalies,
    patternInsights: unsupervised.patternInsights,
    reportVolumeForecast: forecastMonthlyReportVolume(input.reports, now),
    expiryWorkloadForecast: forecastExpiryWorkload(input.licenses, now),
    provinceRiskForecast,
    serviceDemandForecast: countBy(input.reports, report => report.service_type).slice(0, 8).map(row => ({
      ...row,
      tooltip: `${row.label}: ${row.value} historical report(s)`
    })),
    instrumentDemandForecast: countBy(input.reports, report => report.measuring_instrument || 'Unknown').slice(0, 8).map(row => ({
      ...row,
      tooltip: `${row.label}: ${row.value} historical report(s)`
    })),
    riskDistribution,
    topRiskFactors: Array.from(factorCounts.entries())
      .map(([label, count]) => ({ label, count, tooltip: `${label}: ${count} company/license prediction(s)` }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  };
}

export function summarizeMlForAi(bundle: MlPredictionBundle) {
  return {
    highRiskCompanies: bundle.predictions.filter(item => item.riskLevel === 'High' || item.riskLevel === 'Critical').length,
    topRiskFactors: bundle.topRiskFactors.slice(0, 5),
    forecastTrend: bundle.reportVolumeForecast,
    confidence: bundle.modelMetadata.status,
    provinceGaps: bundle.provinceRiskForecast.slice(0, 5),
    behaviorClusters: bundle.clusters.slice(0, 5),
    anomalyFindings: bundle.anomalies.slice(0, 5),
    patternInsights: bundle.patternInsights.slice(0, 5),
    recommendations: bundle.predictions.slice(0, 5).map(item => ({
      companyName: item.companyName,
      riskLevel: item.riskLevel,
      recommendedAction: item.recommendedAction
    }))
  };
}
