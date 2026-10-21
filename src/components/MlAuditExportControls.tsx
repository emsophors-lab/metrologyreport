import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { getApiAuthHeaders } from '../apiAuth';
import type { EnterpriseLicense, MetrologyUser } from '../types';
import type { MlRiskLevel } from '../utils/mlRiskFeatures';
import type { AuditFilters } from '../ml/auditTypes';

interface MlAuditExportControlsProps {
  currentUser: MetrologyUser;
  licenses: EnterpriseLicense[];
  startDate: string;
  endDate: string;
  onScopeChange?: (scope: AuditFilters) => void;
}

type ExportFormat = 'pdf' | 'excel';

function downloadFilename(disposition: string | null, fallback: string) {
  const encoded = disposition?.match(/filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i);
  const plain = disposition?.match(/filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]+))/i);
  let name = plain?.[1]?.replace(/\\(.)/g, '$1') || plain?.[2]?.trim() || fallback;
  if (encoded) {
    try {
      name = decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // Use the plain filename when an encoded filename is malformed.
    }
  }
  return name.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').replace(/^\.+|[. ]+$/g, '') || fallback;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default function MlAuditExportControls({ currentUser, licenses, startDate, endDate, onScopeChange }: MlAuditExportControlsProps) {
  const [instrumentType, setInstrumentType] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [riskLevel, setRiskLevel] = useState<MlRiskLevel | ''>('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const isStaff = currentUser.role === 'admin' || currentUser.role === 'superadmin';
  const scopeCallbackRef = useRef(onScopeChange);
  scopeCallbackRef.current = onScopeChange;
  useEffect(() => {
    if (!isStaff) return;
    scopeCallbackRef.current?.({
      from: startDate, to: endDate,
      ...(instrumentType && { instrument_type: instrumentType }),
      ...(organizationId && { organization_id: organizationId }),
      ...(riskLevel && { risk_level: riskLevel }),
      ...(search.trim() && { q: search.trim() })
    });
  }, [isStaff, startDate, endDate, instrumentType, organizationId, riskLevel, search]);

  useEffect(() => {
    setPending(null);
    setError('');
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [currentUser.id, currentUser.role]);

  const instruments = useMemo(() => Array.from(new Set(licenses
    .map(license => license.measuring_instrument_type?.trim())
    .filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b)), [licenses]);

  const organizations = useMemo(() => {
    const options = new Map<string, string>();
    licenses.forEach(license => {
      const id = license.company_id || license.company_user_id || license.id;
      options.set(id, license.company_name || license.company_name_kh || license.license_number);
    });
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [licenses]);

  const exportAudit = async (format: ExportFormat) => {
    // The ref locks synchronously, including while authentication is resolving.
    if (!isStaff || requestRef.current) return;
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
      setError('Choose a valid start and end date.');
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(format);
    setError('');
    const params = new URLSearchParams({ from: startDate, to: endDate });
    if (instrumentType) params.set('instrument_type', instrumentType);
    if (organizationId) params.set('organization_id', organizationId);
    if (riskLevel) params.set('risk_level', riskLevel);
    if (search.trim()) params.set('q', search.trim());

    try {
      const headers = await getApiAuthHeaders();
      if (controller.signal.aborted) return;
      const response = await fetch(`/api/analytics/export/${format}?${params}`, {
        method: 'GET', headers, signal: controller.signal, cache: 'no-store'
      });
      if (!response.ok) {
        const message = response.status === 401 ? 'Session expired. Sign in again.'
          : response.status === 403 ? 'Staff access is required.'
            : response.status === 400 ? 'Export filters are invalid. Check the scope.'
              : `Audit export failed (${response.status}). Try again.`;
        throw new Error(message);
      }
      const contentType = response.headers.get('Content-Type') || '';
      if (/json|text\/html/i.test(contentType)) throw new Error('Unexpected export response. Try again.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (!blob.size) throw new Error('The export was empty. Try again.');
      const fallback = `nmc-audit-${startDate}-${endDate}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = downloadFilename(response.headers.get('Content-Disposition'), fallback);
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        // Allow the browser to start consuming the blob before releasing it.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof TypeError ? 'Unable to reach the export service. Try again.'
          : cause instanceof Error ? cause.message : 'Audit export failed. Try again.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(null);
      }
    }
  };

  if (!isStaff) return null;

  const fieldClass = 'min-w-0 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700';
  const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60';

  return (
    <fieldset disabled={pending !== null} className="mt-3 min-w-0 border-t border-slate-200 pt-3" aria-busy={pending !== null}>
      <legend className="px-1 text-xs font-bold text-slate-600">Audit Export Scope</legend>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-500">
          <span>Instrument category</span>
          <input type="search" list="audit-instrument-types" placeholder="All instruments" value={instrumentType} onChange={event => setInstrumentType(event.target.value)} className={fieldClass} />
          <datalist id="audit-instrument-types">{instruments.map(value => <option key={value} value={value} />)}</datalist>
        </label>
        <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-500">
          <span>Organization</span>
          <select value={organizationId} onChange={event => setOrganizationId(event.target.value)} className={fieldClass}>
            <option value="">All organizations</option>
            {organizations.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-500">
          <span>Risk level</span>
          <select value={riskLevel} onChange={event => setRiskLevel(event.target.value as MlRiskLevel | '')} className={fieldClass}>
            <option value="">All risk levels</option>
            {(['Low', 'Medium', 'High', 'Critical'] as const).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-500">
          <span>Search</span>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} className={`${fieldClass} pl-7`} />
          </div>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending !== null} onClick={() => void exportAudit('pdf')} className={buttonClass}>
          {pending === 'pdf' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileDown aria-hidden="true" className="h-4 w-4 text-red-600" />}
          {pending === 'pdf' ? 'Exporting PDF...' : 'Audit PDF'}
        </button>
        <button type="button" disabled={pending !== null} onClick={() => void exportAudit('excel')} className={buttonClass}>
          {pending === 'excel' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-green-700" />}
          {pending === 'excel' ? 'Exporting Excel...' : 'Audit Excel'}
        </button>
        <span role="status" className="text-xs font-semibold text-slate-500">{pending ? 'Preparing audit download...' : ''}</span>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
    </fieldset>
  );
}
