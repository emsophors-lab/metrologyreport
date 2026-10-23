/**
 * Where an administrator configures the AI analyst's provider.
 *
 * Gemini, Claude or ChatGPT, with a key and a model list, so changing
 * provider is a form rather than a redeployment.
 *
 * The key is never shown back. The server replaces it with a placeholder and
 * reports only the last four characters, which is enough to tell two keys
 * apart and not enough to use. Saving without touching the key field keeps
 * the stored one.
 *
 * Superadmin only, because this holds a credential the Centre pays for.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Save, Sparkles, Zap } from 'lucide-react';

import { apiRequest } from '../supabaseSync';
import { MetrologyUser } from '../types';

const PROTECTED = 'PROTECTED_SERVER_SIDE';

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-900 outline-none focus:border-[#0B2A66]';
const label = 'mb-1 block text-[10px] font-bold text-slate-500';

interface ProviderInfo { label: string; keyUrl: string; defaultModels: string; keyHint: string }

export default function AnalyticsAiSettings(
  { currentUser, toastMsg }:
  { currentUser: MetrologyUser; toastMsg: (m: string, t: 'success' | 'error') => void },
) {
  const isSuperadmin = currentUser.role === 'superadmin';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [ready, setReady] = useState(false);
  const [envFallback, setEnvFallback] = useState(false);
  const [form, setForm] = useState({
    provider: 'gemini', models: '', api_key: '', is_active: false,
  });
  const [keySet, setKeySet] = useState(false);
  const [keyHint, setKeyHint] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [lastTest, setLastTest] = useState<{ status: string | null; message: string | null }>(
    { status: null, message: null });

  /**
   * The toast callback, held by reference.
   *
   * App defines showToast as a plain function in its body, so it is a new
   * value on every App render. Naming it as a dependency of `load` made
   * `load` new on every App render too, which re-fired the effect below,
   * which called setLoading(true) again — so this panel sat on "កំពុងអាន…"
   * for ever and shook the page while it did it. The ref keeps the latest
   * callback without making anything depend on its identity.
   */
  const toast = useRef(toastMsg);
  useEffect(() => { toast.current = toastMsg; }, [toastMsg]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<any>('/api/analytics/ai-settings');
      const s = res.settings || {};
      setProviders(s.providers || {});
      setReady(!!res.ready);
      setEnvFallback(!!res.env_fallback);
      setForm({
        provider: s.provider || 'gemini',
        models: s.models || '',
        api_key: '',
        is_active: !!s.is_active,
      });
      setKeySet(!!s.key_set);
      setKeyHint(s.key_hint || '');
      setKeyTouched(false);
      setLastTest({ status: s.last_test_status || null, message: s.last_test_message || null });
    } catch (err: any) {
      toast.current(err?.message || 'មិនអាចអានការកំណត់បានទេ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy('save');
    setTest(null);
    try {
      const res = await apiRequest<any>('/api/analytics/ai-settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider: form.provider,
          models: form.models,
          // Untouched means "keep the key you have".
          api_key: keyTouched ? form.api_key : PROTECTED,
          is_active: form.is_active,
        }),
      });
      const s = res.settings || {};
      setReady(!!res.ready);
      setKeySet(!!s.key_set);
      setKeyHint(s.key_hint || '');
      setForm(f => ({ ...f, api_key: '' }));
      setKeyTouched(false);
      setLastTest({ status: s.last_test_status || null, message: s.last_test_message || null });
      toastMsg('បានរក្សាទុកការកំណត់', 'success');
    } catch (err: any) {
      toastMsg(err?.message || 'មិនអាចរក្សាទុកបានទេ', 'error');
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    setBusy('test');
    setTest(null);
    try {
      const res = await apiRequest<any>('/api/analytics/ai-settings/test', { method: 'POST' });
      setTest({ ok: !!res.ok, message: String(res.message || '') });
      setLastTest({ status: res.ok ? 'ok' : 'failed', message: String(res.message || '') });
    } catch (err: any) {
      setTest({ ok: false, message: err?.message || 'មិនអាចសាកល្បងបានទេ' });
    } finally {
      setBusy(null);
    }
  };

  if (!isSuperadmin) return null;

  const info = providers[form.provider];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#0B2A66]" />
        <h3 className="text-[12px] font-black text-[#0B1A35]">
          ភ្នាក់ងារ AI សម្រាប់តាក់តែងអត្ថបទ / AI analyst provider
        </h3>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
          ready ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
          {ready ? 'ដំណើរការ / active' : 'បិទ / off'}
        </span>
      </header>

      <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold leading-relaxed text-slate-600">
        ភ្នាក់ងារ AI តាក់តែងតែអត្ថបទអធិប្បាយប៉ុណ្ណោះ។ តួលេខ ពិន្ទុហានិភ័យ និងការសម្រេចចិត្តទាំងអស់
        មកពីម៉ូដែល និងវិធានរបស់ប្រព័ន្ធ។ ប្រសិនបើគ្មានភ្នាក់ងារ AI របាយការណ៍នឹងត្រូវតាក់តែងដោយប្រព័ន្ធដូចដើម។
        ឈ្មោះក្រុមហ៊ុន លេខអាជ្ញាប័ណ្ណ និងលេខស៊េរី មិនត្រូវបានផ្ញើទៅ AI ទេ។
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-[11px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> កំពុងអាន…
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>ក្រុមហ៊ុនផ្ដល់សេវា / Provider</label>
              <select
                className={input}
                value={form.provider}
                onChange={e => {
                  const provider = e.target.value;
                  setForm(f => ({
                    ...f, provider,
                    // Model names are provider-specific; carrying Gemini's
                    // over to Claude would only produce a 404 later.
                    models: providers[provider]?.defaultModels || '',
                  }));
                  setTest(null);
                }}
              >
                {Object.keys(providers).map(key => (
                  <option key={key} value={key}>{providers[key]?.label || key}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={label}>
                ម៉ូដែល / Models
                <span className="ml-1 font-semibold text-slate-400">(បែងចែកដោយ comma, សាកល្បងតាមលំដាប់)</span>
              </label>
              <input
                className={input}
                value={form.models}
                placeholder={info?.defaultModels || ''}
                onChange={e => setForm(f => ({ ...f, models: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className={label}>
              API key
              {keySet && !keyTouched && (
                <span className="ml-1 font-semibold text-green-700">
                  (បានរក្សាទុករួច {keyHint} — ទុកវាងនេះទំនេរដើម្បីរក្សាទុកដូចដើម)
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                className={input}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                value={form.api_key}
                placeholder={keySet ? '••••••••' : (info?.keyHint || '')}
                onChange={e => { setKeyTouched(true); setForm(f => ({ ...f, api_key: e.target.value })); }}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                title={showKey ? 'លាក់' : 'បង្ហាញ'}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 text-slate-600 hover:bg-slate-100"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {info?.keyUrl && (
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                យកកូនសោនៅ{' '}
                <a className="text-[#0B2A66] underline" href={info.keyUrl} target="_blank" rel="noreferrer">
                  {info.keyUrl}
                </a>
              </p>
            )}
            <p className="mt-1 text-[10px] font-semibold text-amber-700">
              កូនសោត្រូវរក្សាទុកក្នុងមូលដ្ឋានទិន្នន័យ ហើយមិនបញ្ជូនត្រឡប់ទៅ browser ទេ។
              សូមចាត់ទុក database backup ថាមានកូនសោនេះ។
            </p>
          </div>

          <label className="flex items-center gap-2 text-[11px] font-bold text-[#0B1A35]">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            />
            បើកដំណើរការភ្នាក់ងារ AI / Switch the AI analyst on
          </label>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg border border-[#0B2A66] bg-[#0B2A66] px-4 py-2 text-[11px] font-black text-white hover:bg-[#123a85] disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              រក្សាទុក / Save
            </button>
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={!!busy || !ready}
              title={ready ? '' : 'រក្សាទុក និងបើកដំណើរការជាមុន'}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              សាកល្បងការតភ្ជាប់ / Test
            </button>
            {envFallback && !form.is_active && (
              <span className="text-[10px] font-semibold text-slate-500">
                កំពុងប្រើការកំណត់ពី environment។
              </span>
            )}
          </div>

          {(test || lastTest.status) && (() => {
            const ok = test ? test.ok : lastTest.status === 'ok';
            const message = test ? test.message : lastTest.message;
            return (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[10px] font-semibold ${
                ok ? 'border-green-200 bg-green-50 text-green-800'
                   : 'border-red-200 bg-red-50 text-red-800'}`}>
                {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {/* The provider's own words: a retired model name or an
                    exhausted quota says so precisely, and flattening it to
                    "failed" has cost time before. */}
                <span className="break-words [overflow-wrap:anywhere]">{message}</span>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
