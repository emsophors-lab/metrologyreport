import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { MlPredictionResult } from '../utils/mlRiskFeatures';

interface PredictionExplanationPanelProps {
  prediction: MlPredictionResult;
}

export default function PredictionExplanationPanel({ prediction }: PredictionExplanationPanelProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="font-black text-slate-900">{prediction.companyName}</p>
          <p className="font-mono text-[10px] text-slate-500">{prediction.licenseNumber} · {prediction.province}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 font-black ${
          prediction.riskLevel === 'Critical' ? 'bg-red-100 text-red-700' :
          prediction.riskLevel === 'High' ? 'bg-orange-100 text-orange-700' :
          prediction.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-700' :
          'bg-emerald-100 text-emerald-700'
        }`}>
          {prediction.riskLevel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-white p-2" title={`Exact value: ${Math.round(prediction.missReportProbability * 100)}%`}>
          <span className="block text-[10px] font-bold text-slate-400">Miss report</span>
          <strong className="text-slate-900">{Math.round(prediction.missReportProbability * 100)}%</strong>
        </div>
        <div className="rounded-md bg-white p-2" title={`Exact value: ${Math.round(prediction.lateReportProbability * 100)}%`}>
          <span className="block text-[10px] font-bold text-slate-400">Late report</span>
          <strong className="text-slate-900">{Math.round(prediction.lateReportProbability * 100)}%</strong>
        </div>
        <div className="rounded-md bg-white p-2" title={`Exact value: ${Math.round(prediction.licenseExpiryRiskProbability * 100)}%`}>
          <span className="block text-[10px] font-bold text-slate-400">Expiry risk</span>
          <strong className="text-slate-900">{Math.round(prediction.licenseExpiryRiskProbability * 100)}%</strong>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <p className="flex items-center gap-1.5 font-black text-slate-700"><Info className="h-3.5 w-3.5" /> Top factors</p>
        {(prediction.topFactors.length > 0 ? prediction.topFactors : ['Insufficient historical data for reliable ML prediction']).map((factor, index) => (
          <p key={factor} className="text-slate-600">{index + 1}. {factor}</p>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-2">
        <p className="flex items-center gap-1.5 font-black text-blue-800"><CheckCircle2 className="h-3.5 w-3.5" /> Recommended for review</p>
        <p className="text-blue-800">{prediction.recommendedAction} / {prediction.recommendedActionKm}</p>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[10px] font-semibold text-slate-500">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        Predictions are advisory and require official verification. ការព្យាករណ៍នេះគឺជាជំនួយតាមដាន ហើយត្រូវការការពិនិត្យផ្លូវការ។
      </p>
    </div>
  );
}
