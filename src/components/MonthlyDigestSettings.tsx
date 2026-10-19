import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Eye, Loader2, RefreshCw, Send, Settings2 } from 'lucide-react';
import { apiRequest } from '../supabaseSync';
import { previousPeriod } from '../annex8/monthlyDigest';

interface Props {
  configurationKey: string;
  onConfigureBot: (id: string | null) => void;
}

export default function MonthlyDigestSettings({ configurationKey, onConfigureBot }: Props) {
  const [settings, setSettings] = useState<any>(null);
  const [period, setPeriod] = useState(() => previousPeriod());
  const [busy, setBusy] = useState<'' | 'loading' | 'preview' | 'sending'>('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [outcome, setOutcome] = useState('');
  const [force, setForce] = useState(false);
  const load = useCallback(async () => {
    setBusy('loading');
    setError('');
    try { setSettings(await apiRequest('/api/monthly-report-digest/settings')); }
    catch (err: any) { setError(err.message || 'Unable to load monthly digest settings.'); }
    finally { setBusy(''); }
  }, []);
  useEffect(() => { void load(); }, [load, configurationKey]);

  const run = async (dryRun: boolean) => {
    if (busy || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return;
    if (!dryRun && !window.confirm(
      `${force ? 'ផ្ញើម្តងទៀត / Resend' : 'ផ្ញើ / Send'} របាយការណ៍សរុប ${period}\n\nTelegram group: ${settings?.bot?.group_chat_id || ''}\n\nបញ្ជីក្រុមហ៊ុនដែលបានដាក់ជូន និងមិនទាន់ដាក់ជូននឹងត្រូវចែករំលែកទៅក្រុមនេះ។ / The company compliance list will be shared with this group.`,
    )) return;
    setBusy(dryRun ? 'preview' : 'sending');
    setError(''); setOutcome('');
    try {
      const query = new URLSearchParams({ period, ...(dryRun ? { dry_run: '1' } : {}), ...(force && !dryRun ? { force: '1' } : {}) });
      const result = await apiRequest(`/api/monthly-report-digest?${query}`, { method: 'POST',
        ...(dryRun ? {} : { body: { expected_bot_id: settings.bot.id, expected_group_chat_id: settings.bot.group_chat_id } }) });
      if (dryRun) setPreview(result);
      else {
        setOutcome(result.status === 'Success' ? `បានផ្ញើរបាយការណ៍ ${period} ទៅ Telegram / Sent (${result.delivered_as}).`
          : result.message || result.status);
        setForce(false);
        await load();
      }
    } catch (err: any) { setError(err.message || 'Unable to process monthly digest.'); }
    finally { setBusy(''); }
  };
  const bot = settings?.bot;
  const ready = !!bot?.token_configured && !!bot?.group_chat_id && settings?.delivery_log_ready;
  const automated = ready && settings?.cron_secret_configured && settings?.hosted_scheduler;
  const schedule = settings?.schedule;
  return <section aria-labelledby="monthly-digest-title" className="border-y border-slate-200 bg-white py-4 text-slate-700">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="monthly-digest-title" className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock className="h-4 w-4" />របាយការណ៍សរុបប្រចាំខែទៅ Telegram</h3>
        <p className="mt-1 text-xs text-slate-500">Monthly Telegram digest</p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!!busy} onClick={() => onConfigureBot(bot?.id || null)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold disabled:opacity-50"><Settings2 className="h-4 w-4" />កំណត់ Bot និងក្រុម Telegram</button>
        <button type="button" disabled={!!busy} onClick={() => void load()} title="Refresh monthly digest settings" aria-label="Refresh monthly digest settings" className="rounded-md border p-2 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === 'loading' ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>
    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
      <div className="min-w-0"><dt className="text-slate-500">Bot</dt><dd className="mt-1 break-words font-bold">{bot?.name || 'មិនទាន់កំណត់ / Not configured'}</dd></div>
      <div className="min-w-0"><dt className="text-slate-500">Telegram Group Chat ID</dt><dd className="mt-1 break-all font-mono font-bold">{bot?.group_chat_id || '—'}</dd></div>
      <div><dt className="text-slate-500">កាលវិភាគតាមម៉ោងកម្ពុជា</dt><dd className="mt-1 font-bold">{schedule ? `ថ្ងៃទី ${schedule.day} · ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')} · GMT+7` : '—'}</dd></div>
    </dl>
    <div className="mt-3 space-y-1 text-xs" role="status">
      <p className={automated ? 'text-emerald-700' : 'text-amber-800'}>{automated ? 'ការកំណត់ផ្ញើស្វ័យប្រវត្តិរួចរាល់ / Automatic delivery configured' : 'ការផ្ញើស្វ័យប្រវត្តិមិនទាន់រួចរាល់ / Automatic delivery not ready'}</p>
      {settings && !settings.cron_secret_configured && <p className="text-amber-800">CRON_SECRET មិនទាន់កំណត់នៅ server។ / Server cron authorization is not configured.</p>}
      {settings && !settings.hosted_scheduler && <p className="text-slate-500">Local environment · កាលវិភាគស្វ័យប្រវត្តិដំណើរការលើ Vercel production។</p>}
      {settings && !settings.delivery_log_ready && <p className="text-red-700">មិនអាចអានកំណត់ហេតុផ្ញើប្រចាំខែបានទេ។ / Monthly delivery log is unavailable.</p>}
      {settings && <p className="text-slate-500">{settings.pdf_configured ? 'PDF ជាមួយសារសង្ខេប / PDF with summary' : 'សារអត្ថបទ / Text summary (PDF service not configured)'} · របាយការណ៍សម្រាប់ខែមុន / Previous reporting month</p>}
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
      <label className="text-xs font-bold">ខែរបាយការណ៍ / Reporting month<input type="month" value={period} disabled={!!busy} onChange={e => { setPeriod(e.target.value); setPreview(null); setOutcome(''); setForce(false); }} className="mt-1 block min-h-10 max-w-full rounded-md border border-slate-300 px-3 py-2" /></label>
      <button type="button" disabled={!!busy || !period} onClick={() => void run(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold disabled:opacity-50">{busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}មើលមុន / Preview</button>
      <button type="button" disabled={!!busy || !period || !ready} onClick={() => void run(false)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[#353C96] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}ផ្ញើឥឡូវ / Send now</button>
      <label className="inline-flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={force} disabled={!!busy} onChange={e => setForce(e.target.checked)} />ផ្ញើម្តងទៀត ទោះធ្លាប់ផ្ញើរួច / Allow resend</label>
    </div>
    {error && <p role="alert" className="mt-3 break-words text-xs text-red-700">{error}</p>}
    {outcome && <p role="status" className="mt-3 break-words text-xs text-slate-700">{outcome}</p>}
    {preview && <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="text-xs font-bold">{preview.period} · បានដាក់ជូន {preview.submitted} · មិនទាន់ដាក់ជូន {preview.missing} · {preview.compliance_rate}%</p>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-xs">{(preview.messages || []).map((message: string) => new DOMParser().parseFromString(message, 'text/html').body.textContent).join('\n\n')}</pre>
    </div>}
    {!!settings?.logs?.length && <div className="mt-4 overflow-x-auto border-t border-slate-100 pt-3">
      <h4 className="mb-2 text-xs font-bold">ប្រវត្តិផ្ញើប្រចាំខែ / Monthly delivery history</h4>
      <table className="w-full min-w-[400px] text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-2">ខែ / Period</th><th>ស្ថានភាព / Status</th><th>ពេលផ្ញើ / Sent (GMT+7)</th></tr></thead><tbody>{settings.logs.map((log: any) => <tr key={log.id} className="border-b border-slate-100"><td className="py-2">{log.period_month}</td><td>{log.send_status}</td><td>{new Date(log.sent_at).toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', hour12: false })}</td></tr>)}</tbody></table>
    </div>}
  </section>;
}
