import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, RefreshCw } from 'lucide-react';
import { getApiAuthHeaders } from '../apiAuth';
import type { AuditFilters } from '../ml/auditTypes';
import { briefingText, type BriefingAction, type ExecutiveBriefing } from '../ml/narrative';
import type { MetrologyUser } from '../types';

interface InsightsResponse {
  executive_briefing: ExecutiveBriefing;
  filters: AuditFilters;
  generated_at: string;
  model_version: string;
  source_fingerprint: string;
}

const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const priorityClass = {
  Critical: 'border-red-300 bg-red-50 text-red-800',
  High: 'border-amber-300 bg-amber-50 text-amber-900',
  Medium: 'border-blue-300 bg-blue-50 text-blue-800'
};

function Evidence({ action }: { action: BriefingAction }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const id = useId();
  const totalPages = Math.max(1, Math.ceil(action.targets.length / 10));
  return (
    <div className="mt-3 min-w-0">
      <button type="button" className={buttonClass} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} />
        View evidence ({action.targets.length})
      </button>
      {expanded && <div id={id} className="mt-3 min-w-0">
        {!action.targets.length ? <p className="text-sm text-gray-600">No report or instrument targets supplied for this recommendation.</p> : <>
          <ul className="divide-y divide-gray-200">
            {action.targets.slice((page - 1) * 10, page * 10).map((target, index) => (
              <li key={`${page}-${index}`} className="grid min-w-0 gap-2 py-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
                {([
                  ['Report ID', target.reportId], ['Instrument ID', target.instrumentId], ['Serial', target.serial],
                  ['Licence', target.licence], ['Category', target.category]
                ] as const).map(([label, value]) => <div key={label} className="min-w-0">
                  <span className="block font-semibold text-gray-500">{label}</span>
                  <span className="select-text break-words text-gray-900 [overflow-wrap:anywhere]">{value || 'Not supplied'}</span>
                </div>)}
              </li>
            ))}
          </ul>
          <nav aria-label={`${action.category} evidence pages`} className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" title="Previous evidence page" aria-label="Previous evidence page" className={buttonClass} disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
            <span role="status" className="text-xs text-gray-600">Page {page} of {totalPages} · {action.targets.length} targets</span>
            <button type="button" title="Next evidence page" aria-label="Next evidence page" className={buttonClass} disabled={page === totalPages} onClick={() => setPage(value => value + 1)}><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
          </nav>
        </>}
      </div>}
    </div>
  );
}

function BriefingContent({ data }: { data: InsightsResponse }) {
  const briefing = data.executive_briefing;
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const text = briefingText(briefing);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (mounted.current) setCopyStatus('copied');
    } catch {
      if (mounted.current) setCopyStatus('failed');
    }
  };
  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h3 className="min-w-0 break-words text-xl font-bold text-gray-950">{briefing.headline_status}</h3>
      <button type="button" className={buttonClass} onClick={() => void copy()}>
        {copyStatus === 'copied' ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />} Copy Briefing
      </button>
    </div>
    {copyStatus === 'copied' && <p role="status" className="mt-2 text-xs text-green-700">Briefing copied.</p>}
    {copyStatus === 'failed' && <div className="mt-3">
      <p role="alert" className="mb-2 text-sm text-red-700">Clipboard unavailable. Select the briefing text below to copy manually.</p>
      <textarea aria-label="Briefing text for manual copy" readOnly value={text} onFocus={event => event.currentTarget.select()} rows={10} className="w-full min-w-0 select-text rounded border border-gray-300 bg-white p-3 text-sm text-gray-900" />
    </div>}
    <p className="mt-3 break-words text-sm leading-relaxed text-gray-700">{briefing.summary_paragraph}</p>
    <div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-2">
      {([['Supervised takeaways', briefing.supervised_findings], ['Unsupervised takeaways', briefing.unsupervised_findings]] as const).map(([title, findings]) => <div key={title} className="min-w-0">
        <h4 className="text-sm font-bold text-gray-900">{title}</h4>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">{findings.map((finding, index) => <li key={index} className="break-words">{finding}</li>)}</ul>
      </div>)}
    </div>
    <h4 className="mt-6 text-sm font-bold text-gray-900">Priority actions</h4>
    <ol className="mt-2 divide-y divide-gray-200">
      {briefing.action_items.map(action => <li key={action.id} className="min-w-0 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-2 py-1 text-xs font-bold ${priorityClass[action.priority]}`}>{action.priority}</span>
          <h5 className="text-sm font-bold text-gray-900">{action.category}</h5>
        </div>
        <p className="mt-2 break-words text-sm leading-relaxed text-gray-800">{action.action}</p>
        <p className="mt-1 break-words text-xs leading-relaxed text-gray-600">{action.quantified_impact}</p>
        <Evidence action={action} />
      </li>)}
    </ol>
    <div className="mt-3 border-t border-gray-200 pt-3 text-xs leading-relaxed text-gray-500">
      <p className="break-words [overflow-wrap:anywhere]">Model: {data.model_version} | Generated: {data.generated_at} | Evidence: {data.source_fingerprint}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">{briefing.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
    </div>
  </>;
}

export default function MlExecutiveBriefing({ currentUser, scope }: { currentUser: MetrologyUser; scope: AuditFilters }) {
  const isStaff = currentUser.role === 'admin' || currentUser.role === 'superadmin';
  const params = new URLSearchParams();
  for (const key of ['from', 'to', 'instrument_type', 'organization_id', 'risk_level', 'q'] as const) {
    if (scope[key]) params.set(key, scope[key]!);
  }
  const query = params.toString();
  const requestKey = JSON.stringify([currentUser.id, currentUser.role, query]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: InsightsResponse; error?: string } | null>(null);
  useEffect(() => {
    if (!isStaff) return;
    const controller = new AbortController();
    setResult(null);
    const dates = new URLSearchParams(query);
    const from = dates.get('from') || '';
    const to = dates.get('to') || '';
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(from) || !validDate(to) || from > to) {
      setResult({ key: requestKey, error: 'Choose a valid start and end date for the audit scope.' });
      return () => controller.abort();
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const headers = await getApiAuthHeaders();
          if (controller.signal.aborted) return;
          const response = await fetch(`/api/analytics/ml-insights?${query}`, { method: 'GET', headers, signal: controller.signal, cache: 'no-store' });
          if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Sign in again.'
            : response.status === 403 ? 'Staff access is required.'
              : response.status === 400 ? 'Briefing filters are invalid. Check the audit scope and dates.'
                : `Unable to load executive briefing (${response.status}). Try again.`);
          const data: InsightsResponse = await response.json();
          const briefing = data?.executive_briefing;
          if (!briefing || typeof briefing.headline_status !== 'string' || typeof briefing.summary_paragraph !== 'string'
            || !Array.isArray(briefing.supervised_findings) || !Array.isArray(briefing.unsupervised_findings)
            || !Array.isArray(briefing.limitations) || !briefing.evidence || !Array.isArray(briefing.action_items)
            || briefing.action_items.some(action => !action || !Object.hasOwn(priorityClass, action.priority) || !Array.isArray(action.targets))) {
            throw new Error('Unexpected executive briefing response. Try again or contact an administrator.');
          }
          if (!controller.signal.aborted) setResult({ key: requestKey, data });
        } catch (cause) {
          if (!controller.signal.aborted) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : 'Unable to load executive briefing. Try again.' });
        }
      })();
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [isStaff, requestKey, query, retry]);

  if (!isStaff) return null;
  // Match during render as well as aborting effects, so a prior scope is never presented as current.
  const current = result?.key === requestKey ? result : null;
  return <section aria-label="Executive briefing" aria-busy={!current} className="min-w-0 w-full border-y border-gray-200 py-6 [overflow-wrap:anywhere]">
    <h2 className="mb-4 text-base font-bold text-gray-600">AI Executive Briefing &amp; Prescriptive Recommendations</h2>
    {!current && <p role="status" className="flex items-center gap-2 text-sm text-gray-600"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Preparing briefing for the current audit scope...</p>}
    {current?.error && <div>
      <p role="alert" className="text-sm text-red-700">{current.error}</p>
      <button type="button" className={`${buttonClass} mt-3`} onClick={() => { setResult(null); setRetry(value => value + 1); }}><RefreshCw aria-hidden="true" className="h-4 w-4" /> Retry briefing</button>
    </div>}
    {current?.data && <BriefingContent data={current.data} />}
  </section>;
}
