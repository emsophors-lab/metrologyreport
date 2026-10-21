import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw } from 'lucide-react';
import { getApiAuthHeaders } from '../apiAuth';
import type { MetrologyUser } from '../types';
import type { installLifecycleModel } from '../services/mlModelRegistry';

export interface ModelHealth {
  enabled: boolean;
  status: 'cold_start' | 'active' | 'training' | 'queued' | 'failed';
  lastTrainedAt: string | null;
  trainedReportCount: number;
  pendingReports: number;
  threshold: number;
  lastError: string | null;
  workerOnline?: boolean;
  workerLastSeenAt?: string | null;
  lastOutcome?: string | null;
  trainingReady?: boolean;
  readinessMessage?: string | null;
  metrics: {
    f1: number | null;
    accuracy: number | null;
    silhouette: number | null;
    anomalyStability: number | null;
    labelSource: string | null;
  };
  activeModel?: Parameters<typeof installLifecycleModel>[0];
}

interface ModelHealthPanelProps {
  currentUser: MetrologyUser;
  onHealthFetch: (health: ModelHealth) => void;
}

const statusLabels: Record<ModelHealth['status'], string> = {
  cold_start: 'Cold-Start Baseline', active: 'Active (Trained)', training: 'Retraining in Progress...', queued: 'Queued', failed: 'Training failed'
};

function metric(value: number | null | undefined, percent = false) {
  return typeof value === 'number' && Number.isFinite(value)
    ? percent ? `${(value * 100).toFixed(1)}%` : value.toFixed(3)
    : 'Not available';
}

async function responseError(response: Response) {
  if (response.status === 401) return 'Your session has expired. Sign in again, then refresh model health.';
  if (response.status === 403) return 'Staff access is required. Sign in with an admin or superadmin account.';
  if (response.status === 404 || response.status === 503) return 'Model lifecycle is unavailable. Ask an administrator to check the server configuration and worker, then refresh.';
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : `Server request failed (${response.status}). Try again or contact an administrator.`;
}

export default function ModelHealthPanel({ currentUser, onHealthFetch }: ModelHealthPanelProps) {
  const isStaff = currentUser.role === 'admin' || currentUser.role === 'superadmin';
  const [health, setHealth] = useState<ModelHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const callbackRef = useRef(onHealthFetch);
  const requestRef = useRef<AbortController | null>(null);
  const queueRef = useRef<AbortController | null>(null);
  const queuePendingRef = useRef(false);
  const mountedRef = useRef(false);
  callbackRef.current = onHealthFetch;

  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const headers = await getApiAuthHeaders();
      if (signal.aborted) return;
      const response = await fetch('/api/analytics/model-health', { headers, signal, cache: 'no-store' });
      if (!response.ok) throw new Error(await responseError(response));
      const next: ModelHealth = await response.json();
      if (typeof next.enabled !== 'boolean' || !Object.prototype.hasOwnProperty.call(statusLabels, next.status)) {
        throw new Error('Unexpected model health response. Ask an administrator to check the API deployment.');
      }
      if (signal.aborted) return;
      callbackRef.current(next);
      setHealth(next);
      setError('');
      if (next.status !== 'queued' && next.status !== 'training') setNotice('');
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load model health. Try refreshing.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setHealth(null);
    setError('');
    setNotice('');
    setSubmitting(false);
    queuePendingRef.current = false;
    return () => {
      mountedRef.current = false;
      queueRef.current?.abort();
    };
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    if (!isStaff) { setLoading(false); return; }
    const controller = new AbortController();
    requestRef.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 10000);
    };
    setLoading(true);
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [isStaff, currentUser.id, refresh, refreshKey]);

  const handleTrain = async () => {
    if (!isStaff || !health?.enabled || health.trainingReady === false || error || queuePendingRef.current || health.status === 'queued' || health.status === 'training') return;
    const controller = new AbortController();
    queueRef.current = controller;
    queuePendingRef.current = true;
    setSubmitting(true);
    setNotice('');
    try {
      const headers = await getApiAuthHeaders();
      if (controller.signal.aborted) return;
      const response = await fetch('/api/analytics/retrain', { method: 'POST', headers, signal: controller.signal });
      if (response.status !== 202) throw new Error(await responseError(response));
      if (controller.signal.aborted) return;
      setNotice('Training queued on the server. Waiting for worker updates.');
      setHealth(previous => previous ? { ...previous, status: 'queued' } : previous);
      requestRef.current?.abort();
      setRefreshKey(key => key + 1);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to queue training. Try again.');
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        queuePendingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  if (!isStaff) return null;
  const busy = submitting || health?.status === 'queued' || health?.status === 'training';
  const date = health?.lastTrainedAt ? new Date(health.lastTrainedAt) : null;
  const lastTrained = date && Number.isFinite(date.getTime())
    ? date.toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' }) : 'Not trained yet';

  return (
    <section className="border-y border-slate-200 bg-white p-4" aria-labelledby="model-health-heading" aria-busy={loading || submitting}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 id="model-health-heading" className="flex items-center gap-2 text-sm font-black text-[#0B2A66]"><Activity className="h-5 w-5 shrink-0" />Server Model Health</h3>
          <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-600" role="status">
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : health?.enabled && health.status === 'active' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Clock3 className="h-4 w-4 shrink-0" />}
            {error ? 'Health unavailable' : health ? health.enabled ? statusLabels[health.status] : 'Not configured' : 'Loading model health...'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" title="Refresh model health" aria-label="Refresh model health" disabled={loading || submitting} onClick={() => setRefreshKey(key => key + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={() => void handleTrain()} disabled={!health?.enabled || health.trainingReady === false || busy || loading || !!error} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#0B2A66] px-3 py-2 text-xs font-bold text-white hover:bg-[#062B5F] disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 shrink-0 ${busy ? 'animate-spin' : ''}`} />{health?.trainingReady === false ? 'Awaiting verified data' : submitting ? 'Queueing...' : health?.status === 'queued' ? 'Training queued' : health?.status === 'training' ? 'Training...' : health?.status === 'failed' ? 'Retry server training' : 'Train server model'}</button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 flex items-start gap-2 break-words rounded-md bg-red-50 p-3 text-xs text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{error} Use refresh to check again before retrying training.</span></p>}
      {notice && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">{notice}</p>}
      {health && <>
        {health.enabled && !health.workerOnline && <p role="status" className="mt-3 text-xs text-amber-800">Background worker is offline or has not checked in. Queued training will wait until the worker starts.</p>}
        {health.enabled && <p className="mt-3 text-xs text-slate-600">{health.pendingReports} / {health.threshold} new verified reports until next auto-retrain.</p>}
        {health.lastOutcome === 'rejected_quality' && <p className="mt-3 text-xs text-amber-800">The challenger did not pass validation. The previous active model remains in use.</p>}
        {!health.enabled && <p className="mt-3 text-xs text-amber-800">Server training is disabled. Ask an administrator to enable the model lifecycle and configure its training worker, then refresh.</p>}
        {health.enabled && health.readinessMessage && <p role="status" className="mt-3 text-xs text-amber-800">{health.readinessMessage}</p>}
        {health.enabled && health.status === 'cold_start' && health.trainingReady !== false && <p className="mt-3 text-xs text-slate-600">No server model has been trained. Queue the first training run, or collect reports until the automatic training threshold is reached.</p>}
        {health.enabled && health.status === 'failed' && <p role="alert" className="mt-3 break-words text-xs text-red-800">{health.lastError || 'The last server training run failed.'} Ask an administrator to check the worker and training data, then retry.</p>}
        <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
          {[
            ['Last server training', lastTrained], ['Trained reports', health.trainedReportCount],
            ['Pending reports', health.pendingReports], ['Auto-training threshold', health.threshold],
            ['F1', metric(health.metrics?.f1)], ['Accuracy', metric(health.metrics?.accuracy, true)],
            ['Silhouette', metric(health.metrics?.silhouette)], ['Anomaly stability', metric(health.metrics?.anomalyStability)]
          ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-bold text-slate-800">{value ?? 'Not available'}</dd></div>)}
        </dl>
        <p className="mt-3 break-words text-xs text-slate-500">Label source: {health.metrics?.labelSource || 'Not available'}</p>
      </>}
      <p className="mt-3 text-xs text-slate-500">Server lifecycle metrics are separate from browser baseline calibration. Predictions remain advisory.</p>
    </section>
  );
}
