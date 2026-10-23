/**
 * The trained machine-learning model's signals, per licensee.
 *
 * The Smart Analytics report began as rule-based scoring only, and the rules
 * stay: every point a licensee carries is a sentence an officer can check
 * against a return. What this file adds is the trained model that the ML
 * lifecycle already maintains from the same Annex 8 accepted reports — the
 * classifier's probability, the IsolationForest's outlier score, the k-means
 * cluster, and which standardized feature departed furthest.
 *
 * Two decisions worth stating, because both are visible in the output:
 *
 *  1. The model ESCALATES and never discounts. The rule score is the floor;
 *     a high model probability adds points on top, capped. A model that
 *     thinks a licensee is fine cannot talk the rules down, because the
 *     rules are the part NMC can defend in front of the licensee.
 *
 *  2. Every ML contribution arrives with its own factor sentence naming the
 *     probability and the feature behind it. "Top feature" means the largest
 *     standardized departure from the training mean — a pointer to look at,
 *     not a cause. Nothing here triggers a sanction; a named officer reviews
 *     before anything follows.
 *
 * Returns null, quietly, whenever there is no trained model to speak for:
 * the lifecycle disabled, the migration not applied, the model still cold.
 * A report without ML says so in its limitations rather than failing.
 */
import { collectDataset } from '../ml/dataset';
import { LifecycleStore } from '../ml/lifecycle';
import { anomalyScore, clusterIndex, featureVector, probability } from '../ml/portable';

/** Khmer labels for the model's features, so a factor reads as a sentence. */
const FEATURE_KH: Record<string, string> = {
  missingReportsLast3Months: 'ការខកខានដាក់របាយការណ៍ ៣ ខែចុងក្រោយ',
  missingReportsLast6Months: 'ការខកខានដាក់របាយការណ៍ ៦ ខែចុងក្រោយ',
  lateReportsLast3Months: 'ការដាក់របាយការណ៍យឺត ៣ ខែចុងក្រោយ',
  averageSubmissionDelayDays: 'រយៈពេលយឺតជាមធ្យម',
  lastReportAgeDays: 'អាយុរបាយការណ៍ចុងក្រោយ',
  consecutiveMissingMonths: 'ខែខកខានជាប់ៗគ្នា',
  reportSubmissionRate: 'អត្រាដាក់របាយការណ៍',
  daysUntilExpiry: 'រយៈពេលដល់ពេលផុតកំណត់អាជ្ញាប័ណ្ណ',
  profileCompletenessScore: 'ភាពពេញលេញនៃព័ត៌មានសហគ្រាស',
  instrumentDemandTrendScore: 'និន្នាការតម្រូវការឧបករណ៍',
  serviceTypeCount: 'ចំនួនប្រភេទសេវា',
  instrumentTypeCount: 'ចំនួនប្រភេទឧបករណ៍',
  provinceReportComplianceRate: 'អត្រាអនុលោមតាមខេត្ត',
};

export const featureLabelKh = (name: string) => FEATURE_KH[name] || name;

export interface LicenceSignal {
  licence_no: string;
  /** 0–1, the classifier's probability of high inspection priority. */
  probability: number;
  /** 0–1, IsolationForest. Higher is more unusual. */
  anomaly: number;
  /** Above the model's own fitted threshold. */
  outlier: boolean;
  /** 1-based, for printing. */
  cluster: number;
  /** Feature with the largest standardized departure, and that departure. */
  topFeature: string;
  topFeatureZ: number;
}

export interface MlSignals {
  modelId: string;
  trainedAt: string;
  trainedReportCount: number;
  metrics: { f1: number; accuracy: number; silhouette: number; anomalyStability: number; labelSource: string };
  byLicence: Map<string, LicenceSignal>;
}

/**
 * The active model's signals, or null when there is no model to ask.
 *
 * Never throws: an analytics report must still be produceable on a system
 * where the ML migration has not been applied. The caller distinguishes
 * "no model" from "model says low risk" — they are not the same claim.
 */
export async function collectMlSignals(db: any): Promise<MlSignals | null> {
  if (process.env.ML_LIFECYCLE_ENABLED !== 'true') return null;
  try {
    const { state } = await new LifecycleStore(db).read();
    const active = state.active;
    if (!active) return null;

    const dataset = await collectDataset(db);
    const byLicence = new Map<string, LicenceSignal>();

    for (const feature of dataset.inferenceFeatures) {
      const licence = String((feature as any).licenseNumber || '').trim();
      if (!licence) continue;
      const x = featureVector(feature);
      const z = x.map((v, i) => {
        const scale = active.model.scale[i];
        return Number.isFinite(scale) && scale !== 0 ? (v - active.model.mean[i]) / scale : 0;
      });
      const top = z.reduce((best, v, i) => (Math.abs(v) > Math.abs(z[best]) ? i : best), 0);
      const anomaly = anomalyScore(active.model, x);
      byLicence.set(licence, {
        licence_no: licence,
        probability: probability(active.model, x),
        anomaly,
        outlier: anomaly > active.model.anomalyThreshold,
        cluster: clusterIndex(active.model, x) + 1,
        topFeature: active.model.features[top] || '',
        topFeatureZ: z[top] ?? 0,
      });
    }

    return {
      modelId: active.id,
      trainedAt: active.trainedAt,
      trainedReportCount: active.trainedReportCount,
      metrics: active.metrics,
      byLicence,
    };
  } catch {
    // An unavailable model is a limitation to state, not an error to raise.
    return null;
  }
}

/** How many points the model may add on top of the rules. */
export const ML_MAX_POINTS = 20;

/**
 * The model's contribution to a licensee's score, as points and a sentence.
 *
 * Below 0.5 the model is not claiming anything worth printing, so it adds
 * nothing and says nothing — a factor list padded with non-findings is how
 * officers learn to stop reading it.
 */
export function mlRiskContribution(signal: LicenceSignal | undefined): { points: number; factor: string | null } {
  if (!signal || !Number.isFinite(signal.probability) || signal.probability < 0.5) {
    return { points: 0, factor: null };
  }
  const points = Math.round(signal.probability * ML_MAX_POINTS);
  const percent = (signal.probability * 100).toFixed(0);
  const feature = signal.topFeature ? `ចំណុចសំខាន់៖ ${featureLabelKh(signal.topFeature)}` : '';
  return {
    points,
    factor: `ម៉ូដែល ML ប៉ាន់ប្រមាណហានិភ័យ ${percent}%${feature ? ` (${feature})` : ''}`,
  };
}
