import { randomUUID } from 'node:crypto';
import type { PortableModel } from './portable';

export interface Version {
  id: string; trainedAt: string; trainedReportCount: number; reportIds: string[];
  fingerprint: string; metrics: { f1: number; accuracy: number; silhouette: number; anomalyStability: number; labelSource: string };
  model: PortableModel;
}
export interface LifecycleState {
  active?: Version; previous?: Version; lock?: { token: string; until: number };
  requested?: string; manual?: string; lastFingerprint?: string; lastAttemptAt?: number;
  lastError?: string; lastOutcome?: string;
  workerSeenAt?: number;
}
export class LifecycleStore {
  constructor(private db: any) {}
  async read(): Promise<{ revision: number; state: LifecycleState }> {
    const { data, error } = await this.db.from('ml_lifecycle').select('*').eq('id', 'main').single();
    if (error || !data) throw new Error('ML lifecycle storage unavailable; apply the ML migration.');
    return { revision: Number(data.revision), state: typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload };
  }
  async mutate(change: (state: LifecycleState) => LifecycleState | null) {
    for (let i = 0; i < 12; i++) {
      const { revision, state } = await this.read();
      const next = change(state); if (!next) return false;
      if (typeof this.db.compareAndSwapMlState === 'function') {
        if (await this.db.compareAndSwapMlState(revision, next)) return true;
        continue;
      }
      const { data, error } = await this.db.from('ml_lifecycle').update({ revision: revision + 1, payload: next })
        .eq('id', 'main').eq('revision', revision).select('id');
      if (error) throw new Error('ML lifecycle write failed.');
      if (data?.length) return true;
    }
    throw new Error('ML lifecycle contention; retry later.');
  }
  async signal(manual = false) {
    return this.mutate(s => ({ ...s, requested: randomUUID(), ...(manual ? { manual: randomUUID() } : {}) }));
  }
  async claim(now = Date.now(), ttl = 120000) {
    const token = randomUUID();
    const ok = await this.mutate(s => s.lock && s.lock.until > now ? null : { ...s, workerSeenAt: now, lock: { token, until: now + ttl } });
    return ok ? token : null;
  }
  async heartbeat(token: string, ttl = 120000) {
    return this.mutate(s => s.lock?.token === token && s.lock.until > Date.now()
      ? { ...s, workerSeenAt: Date.now(), lock: { token, until: Date.now() + ttl } } : null);
  }
  async finish(token: string, patch: Partial<LifecycleState>) {
    return this.mutate(s => s.lock?.token === token && s.lock.until > Date.now() ? { ...s, ...patch, lock: undefined } : null);
  }
}
export function retrainReason(state: LifecycleState, input: { reportIds: string[]; fingerprint: string; anomalyRate: number },
  config: { threshold: number; drift: number; recentMinimum: number; cooldownMs: number }, now = Date.now()) {
  if (state.manual) return 'manual';
  if (state.lastError && now - (state.lastAttemptAt || 0) < config.cooldownMs) return null;
  if (state.lastFingerprint === input.fingerprint) return null;
  const old = new Set(state.active?.reportIds || []);
  const pending = input.reportIds.filter(id => !old.has(id)).length;
  if (pending >= config.threshold) return 'volume';
  if (pending >= config.recentMinimum && input.anomalyRate > config.drift &&
      now - (state.lastAttemptAt || 0) >= config.cooldownMs) return 'drift';
  // Corrections/withdrawals need reconciliation, not 25 new UUIDs. Small new
  // batches still wait for volume/drift, so this does not train on every upload.
  if (pending === 0 && state.active && state.active.fingerprint !== input.fingerprint &&
      now - (state.lastAttemptAt || 0) >= config.cooldownMs) return 'changed_evidence';
  return null;
}
export function promotionAllowed(next: Version, current?: Version) {
  const m = next.metrics;
  if (![m.f1, m.accuracy, m.silhouette, m.anomalyStability].every(Number.isFinite)) return false;
  if (m.f1 < 0.5 || m.silhouette <= 0 || m.anomalyStability < 0.8) return false;
  return !current || m.f1 >= current.metrics.f1 - 0.02 || next.trainedReportCount > current.trainedReportCount * 1.2;
}
