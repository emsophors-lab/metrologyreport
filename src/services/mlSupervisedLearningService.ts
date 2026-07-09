import { MlTrainingRecord } from '../utils/mlRiskFeatures';
import { evaluatePredictionModels, trainPredictionModels } from './mlModelRegistry';

export function trainSupervisedModels(records: MlTrainingRecord[]) {
  return trainPredictionModels(records);
}

export function evaluateSupervisedModels(records: MlTrainingRecord[]) {
  return evaluatePredictionModels(records);
}
