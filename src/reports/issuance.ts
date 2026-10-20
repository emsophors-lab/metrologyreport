import crypto from 'node:crypto';
import QRCode from 'qrcode';

export interface IssuanceDetails {
  kind: string; format: 'docx' | 'pdf' | 'xlsx' | 'html' | 'pptx'; title: string;
  company?: string; licence?: string; period?: string; issuer: string;
  basis: 'database' | 'staff-prepared' | 'draft'; snapshot: unknown;
}
export interface ReportSeal {
  id: string; url: string; issuedAt: string; png: Buffer; details: IssuanceDetails;
}
export const sha256 = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!));

export function verificationOrigin() {
  const url = new URL(process.env.REPORT_VERIFICATION_ORIGIN || 'https://metrologyreport.vercel.app');
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) && process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1';
  if (url.username || url.password || (!local && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol)) {
    throw new Error('A secure REPORT_VERIFICATION_ORIGIN is required.');
  }
  return url.origin;
}

/** Called by server renderers only. A file is released only after its issuance is saved. */
export async function issueReportArtifact(db: any, details: IssuanceDetails, render: (seal: ReportSeal) => Promise<Buffer>) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const issuedAt = new Date().toISOString();
  const url = `${verificationOrigin()}/api/report-issuance/check/${token}`;
  const seal: ReportSeal = { id, url, issuedAt, details,
    png: await QRCode.toBuffer(url, { type: 'png', width: 384, margin: 4, errorCorrectionLevel: 'M' }),
  };
  const bytes = await render(seal);
  if (!bytes.length) throw new Error('The generated report is empty.');
  const record = {
    id, token_hash: sha256(token), artifact_sha256: sha256(bytes), source_sha256: sha256(JSON.stringify(details.snapshot)),
    report_kind: details.kind, file_format: details.format, title: details.title,
    company_name: details.company || '', licence_no: details.licence || '', period_label: details.period || '',
    issued_at: issuedAt, issued_by: details.issuer, state: 'issued', basis: details.basis,
    source_snapshot: details.snapshot,
  };
  const { error } = await db.from('report_issuances').insert(record);
  if (error) throw new Error('Report issuance could not be saved. Install the approved report_issuances migration before enabling QR exports.');
  return { bytes, seal };
}

export async function lookupIssuance(db: any, token: string, digest?: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || (digest !== undefined && !/^[a-f0-9]{64}$/i.test(digest))) {
    return { status: 400, body: { error: 'Invalid verification request.' } };
  }
  const { data: row, error } = await db.from('report_issuances').select('*').eq('token_hash', sha256(token)).maybeSingle();
  if (error) return { status: 503, body: { error: 'Verification is temporarily unavailable.' } };
  if (!row) return { status: 404, body: { error: 'No issued report matches this QR code.' } };
  return { status: 200, body: {
    id: row.id, title: row.title, kind: row.report_kind, format: row.file_format,
    company: row.company_name, licence: row.licence_no, period: row.period_label,
    issued_at: row.issued_at, state: row.state, basis: row.basis,
    file_match: digest === undefined ? null : row.state === 'issued' && crypto.timingSafeEqual(
      Buffer.from(digest.toLowerCase(), 'hex'), Buffer.from(row.artifact_sha256, 'hex')),
  } };
}

export function sealHtml(seal: ReportSeal) {
  return `<section aria-label="Report verification" style="break-inside:avoid;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:0 0 20px;border-bottom:1px solid #999;padding:0 0 12px;color:#111;font:12px Arial">
    <div style="min-width:0;overflow-wrap:anywhere"><p>NMC Report Verification</p><p>${escapeHtml(seal.id)}</p>
    <p>${escapeHtml(seal.issuedAt)} · ${escapeHtml(seal.details.basis)}</p><a href="${escapeHtml(seal.url)}" rel="noreferrer">Verify report</a></div>
    <img alt="Report verification QR" width="112" height="112" style="flex:none" src="data:image/png;base64,${seal.png.toString('base64')}"></section>`;
}

export function verificationPage(token: string, nonce: string) {
  const safeToken = /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>NMC Report Verification</title><style>body{font:16px Arial,sans-serif;color:#172a38;margin:0;background:#f4f7f9}main{max-width:740px;margin:auto;padding:28px 20px}h1{font-size:24px}h2{font-size:18px}dl{display:grid;grid-template-columns:140px minmax(0,1fr);gap:14px 12px}dd{margin:0;overflow-wrap:anywhere}dt{color:#556674}section{padding:20px 0;border-top:1px solid #cbd5df}#status{font-weight:bold;color:#076b43}#status.error{color:#a52c22}input{max-width:100%}#result{font-weight:bold;overflow-wrap:anywhere}@media(max-width:480px){dl{grid-template-columns:1fr;gap:8px}dd{margin-bottom:12px}}</style></head>
  <body><main><p>National Metrology Center</p><h1>Report Verification</h1><p id="status" role="status">Checking issuance record…</p>
  <section id="record" hidden><h2 id="title"></h2><dl id="details"></dl></section>
  <section id="file-check" hidden><h2>Check Downloaded File</h2><input type="file" id="file" aria-label="Downloaded report file"><p id="result" role="status"></p>
  <p>A QR code can be copied. An issuance match alone does not establish that surrounding document content is unchanged. Printed or re-saved copies have different file hashes.</p></section></main>
  <script nonce="${nonce}">
  const endpoint='/api/report-issuance/verify/${safeToken}';
  const status=document.getElementById('status');
  const showError=text=>{status.textContent=text;status.className='error';};
  fetch(endpoint,{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Verification unavailable');
    status.textContent=data.state==='revoked'?'REVOKED issuance':data.basis==='draft'?'Draft issuance record found':'Issuance record found';
    if(data.state!=='issued')status.className='error';document.getElementById('record').hidden=false;document.getElementById('file-check').hidden=false;
    document.getElementById('title').textContent=data.title;
    for(const [key,value] of [['Issuance ID',data.id],['Company',data.company],['Licence',data.licence],['Period',data.period],['Issued at',data.issued_at],['File format',data.format],['Basis',data.basis],['State',data.state]]){
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value||'—';document.getElementById('details').append(dt,dd);}
  }).catch(()=>showError('Unable to confirm this report. The code is unknown or verification is unavailable.'));
  document.getElementById('file').addEventListener('change',async event=>{const output=document.getElementById('result');const file=event.target.files[0];if(!file)return;
    if(file.size>50*1024*1024){output.textContent='File exceeds the 50 MB verification limit.';return;}
    try{output.textContent='Checking file…';const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const hex=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      const response=await fetch(endpoint+'?sha256='+hex,{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error();
      output.textContent=data.file_match?'Exact issued file match':data.state==='revoked'?'This issuance is revoked':'This file does not match the registered download';
    }catch{output.textContent='File verification is unavailable.';}});
  </script></body></html>`;
}
