import type { MlCompanyFeatures } from '../utils/mlRiskFeatures';

export const FEATURE_KEYS = ['missingReportsLast3Months', 'missingReportsLast6Months',
  'lateReportsLast3Months', 'averageSubmissionDelayDays', 'lastReportAgeDays',
  'consecutiveMissingMonths', 'reportSubmissionRate', 'daysUntilExpiry',
  'profileCompletenessScore', 'instrumentDemandTrendScore', 'serviceTypeCount',
  'instrumentTypeCount', 'provinceReportComplianceRate'] as const;
export const featureVector = (f: MlCompanyFeatures) => FEATURE_KEYS.map(k => {
    const n = Number(f[k]); return Number.isFinite(n) ? Math.fround(n) : 0;
});
export interface Tree { left: number[]; right: number[]; feature: number[]; threshold: number[]; value: number[]; samples: number[] }
export interface PortableModel {
  schema: 1; features: string[]; forest: Tree[]; isolation: Tree[]; isolationSamples: number;
  anomalyThreshold: number; centers: number[][]; mean: number[]; scale: number[];
  pca?: { mean: number[]; components: number[][]; explainedVariance: number[] };
}
function leaf(tree: Tree, x: number[]) {
  let i = 0;
  while (tree.left[i] !== -1) i = x[tree.feature[i]] <= tree.threshold[i] ? tree.left[i] : tree.right[i];
  return i;
}
export function probability(model: PortableModel, x: number[]) {
  return model.forest.reduce((s, t) => s + t.value[leaf(t, x)], 0) / model.forest.length;
}
const pathCorrection = (n: number) => n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + 0.5772156649015329) - 2 * (n - 1) / n;
export function anomalyScore(model: PortableModel, x: number[]) {
  const depths = model.isolation.map(t => {
    let i = 0, depth = 0;
    while (t.left[i] !== -1) { i = x[t.feature[i]] <= t.threshold[i] ? t.left[i] : t.right[i]; depth++; }
    return depth + pathCorrection(t.samples[i]);
  });
  return 2 ** (-depths.reduce((s, d) => s + d, 0) / (depths.length * pathCorrection(model.isolationSamples)));
}
export function clusterIndex(model: PortableModel, x: number[]) {
  const z = x.map((v, i) => (v - model.mean[i]) / model.scale[i]);
  const distances = model.centers.map(c => c.reduce((s, v, i) => s + (v - z[i]) ** 2, 0));
  return distances.indexOf(Math.min(...distances));
}
