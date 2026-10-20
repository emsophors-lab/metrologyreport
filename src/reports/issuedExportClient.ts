import { getApiAuthHeaders } from '../apiAuth';

export const qrExportsEnabled = () => (import.meta as any).env?.VITE_REPORT_QR_ENABLED === 'true';
export async function runReportExport(action: () => Promise<unknown>) {
  try { await action(); } catch (error: any) { window.alert(error?.message || 'Report export failed.'); }
}
export async function issuedExportBlob(request: Record<string, unknown>): Promise<Blob | null> {
  if (!qrExportsEnabled()) return null;
  const response = await fetch('/api/report-issuance/export', {
    method: 'POST', headers: await getApiAuthHeaders(), body: JSON.stringify(request), cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Verified report generation is unavailable.');
  }
  return response.blob();
}
export function saveReportBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function downloadIssuedExport(request: Record<string, unknown>, name: string) {
  const blob = await issuedExportBlob(request);
  if (!blob) return false;
  saveReportBlob(blob, name); return true;
}
export async function downloadIssuedWorkbook(workbook: any, title: string, name: string) {
  if (!qrExportsEnabled()) return false;
  const XLSX = await import('xlsx');
  const sheets = workbook.SheetNames.map((sheet: string) => ({ name: sheet,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '', raw: true }),
  }));
  return downloadIssuedExport({ kind: 'staff-workbook', format: 'xlsx', title, sheets }, name);
}

export async function printIssuedReport(request: Record<string, unknown>) {
  if (!qrExportsEnabled()) { window.print(); return; }
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Please allow pop-ups to print the report.');
  try {
    const blob = await issuedExportBlob({ ...request, format: 'html' });
    popup.document.open(); popup.document.write(await blob!.text()); popup.document.close();
    if (popup.document.readyState !== 'complete') await new Promise<void>(resolve => popup.addEventListener('load', () => resolve(), { once: true }));
    await popup.document.fonts.ready;
    if (!popup.closed) { popup.focus(); popup.print(); }
  } catch (error) { popup.close(); throw error; }
}
