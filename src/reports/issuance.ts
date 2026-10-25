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

/**
 * The page an inspector sees after scanning a report's QR code.
 *
 * This is the public face of the Centre's verification and often the only
 * part of the system an outside party ever sees — usually on a phone, at a
 * counter, in a hurry. So it answers the one question that matters, is this
 * document genuine, before any detail, and it answers in Khmer and English
 * because the people reading it are Cambodian officials and licensees.
 *
 * Everything is inline. This endpoint serves a strict `default-src 'none'`
 * policy, which rules out web fonts and image files, so the icons are inline
 * SVG — markup, not an image request — and the type is a system stack with
 * Khmer faces first. The page therefore renders instantly on a weak mobile
 * connection, which is the condition it will usually be read in.
 *
 * The caveat about copied QR codes is kept and given its own place rather
 * than buried: a matching issuance proves this record exists, not that the
 * paper in someone's hand is unaltered.
 */
export function verificationPage(token: string, nonce: string) {
  const safeToken = /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ការផ្ទៀងផ្ទាត់របាយការណ៍ | NMC Report Verification</title>
<style>
:root{
  --navy:#0B2A66; --navy-deep:#081D48; --ink:#17212E; --muted:#5B6B7C; --line:#DCE4EC;
  --page:#EDF1F6; --card:#FFFFFF;
  /* The gold hairline under the masthead is what reads as official on a
     Cambodian government document; it is the only ornament on the page. */
  --gold:#C8A24A;
  --ok:#0F7B4F; --ok-bg:#EAF7F0; --ok-line:#BCE3CE;
  --bad:#B42318; --bad-bg:#FDF0EF; --bad-line:#F3C3BE;
  --warn:#B54708; --warn-bg:#FFF8EC; --warn-line:#F2D8A8;
}
*{box-sizing:border-box}
body{
  margin:0;background:var(--page);color:var(--ink);
  font:16px/1.65 "Khmer OS Battambang","Noto Sans Khmer","Khmer OS",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  -webkit-text-size-adjust:100%;
}
main{max-width:620px;margin:0 auto;padding:22px 16px 44px}

/* A full-bleed masthead band. On a phone this is the first thing on
   screen above the verdict, and it is what makes the page read as a
   government record rather than a web form. */
.band{background:linear-gradient(180deg,var(--navy) 0%,var(--navy-deep) 100%);border-bottom:3px solid var(--gold)}
.band-inner{max-width:620px;margin:0 auto;padding:22px 16px 19px;text-align:center}
.kingdom{font-size:11.5px;letter-spacing:.05em;color:#A9BEE2;margin:0}
.centre{font-size:19px;font-weight:700;color:#fff;margin:8px 0 4px;line-height:1.45}
.centre-en{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:#C3D4EE;margin:0}

.status{
  display:flex;gap:14px;align-items:flex-start;
  border:1px solid var(--line);border-left-width:5px;border-radius:14px;
  background:var(--card);padding:18px;margin:0 0 16px;
}
.status svg{flex:none;width:34px;height:34px;margin-top:1px}
.status .kh{font-size:18px;font-weight:700;margin:0;line-height:1.45}
.status .en{font-size:13px;color:var(--muted);margin:4px 0 0}
/* The tone colours the whole block, so the icon inherits it too. */
.status.ok{color:var(--ok);border-left-color:var(--ok);background:var(--ok-bg);border-color:var(--ok-line)}
.status.bad{color:var(--bad);border-left-color:var(--bad);background:var(--bad-bg);border-color:var(--bad-line)}
.status.warn{color:var(--warn);border-left-color:var(--warn);background:var(--warn-bg);border-color:var(--warn-line)}
.status.pending{color:var(--muted);border-left-color:var(--muted)}

.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:0 0 16px}
/* Khmer and Latin on one line wrap into each other and read badly at
   phone width, so every bilingual heading stacks instead. */
.card h2{margin:0 0 15px;padding-left:13px;position:relative}
/* A navy tick against each section heading, the way a stamped form is
   ruled. Decorative only, so it is hidden from the reading order. */
.card h2::before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:3px;border-radius:2px;background:var(--navy)}
.card h2 .kh{display:block;font-size:14.5px;font-weight:700;color:var(--navy);line-height:1.5}
.card h2 .en{display:block;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:3px}
.doc-title{font-size:16.5px;font-weight:700;color:var(--ink);margin:0 0 15px;padding:0 0 14px;line-height:1.5;border-bottom:2px solid var(--gold)}

.row{padding:11px 0;border-top:1px solid var(--line)}
.row:first-child{border-top:0;padding-top:0}
.label{font-size:12px;color:var(--muted);margin:0 0 2px}
.value{margin:0;font-weight:600;overflow-wrap:anywhere}
.value.mono{font:600 12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.value.none{font-weight:400;color:var(--muted)}

/* Collapsed by default. Most people reach this page by scanning a QR code
   printed on paper, where there is no file to check and a printed copy
   would fail the hash anyway. They should see a verdict and stop. The
   officer holding the electronic file opens it with one tap. */
details.file{padding:0}
details.file > summary{
  list-style:none;cursor:pointer;padding:16px 18px;
  display:flex;gap:12px;align-items:flex-start;justify-content:space-between;
}
details.file > summary::-webkit-details-marker{display:none}
details.file > summary:focus-visible{outline:2px solid var(--navy);outline-offset:-3px;border-radius:14px}
.sum-text{position:relative;padding-left:13px;min-width:0}
.sum-text::before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:3px;border-radius:2px;background:var(--navy)}
.sum-text .kh{display:block;font-size:14.5px;font-weight:700;color:var(--navy);line-height:1.5}
.sum-text .en{display:block;font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.5}
.chev{flex:none;width:20px;height:20px;margin-top:4px;color:var(--navy);transition:transform .15s ease}
details.file[open] .chev{transform:rotate(180deg)}
.file-body{padding:0 18px 18px}
.hint{margin:0 0 13px;font-size:12.5px;line-height:1.7;color:var(--muted)}
.file label{display:block;margin:0 0 11px;line-height:1.55}
.file label .kh{display:block;font-size:13.5px;color:var(--ink)}
.file label .en{display:block;font-size:12.5px;color:var(--muted);margin-top:2px}
input[type=file]{width:100%;font-size:14px;padding:11px;border:1px dashed var(--line);border-radius:10px;background:#FAFCFE}
#result{margin:14px 0 0;overflow-wrap:anywhere;line-height:1.55;color:var(--muted)}
#result .kh{display:block;font-size:14.5px;font-weight:700}
#result .en{display:block;font-size:12.5px;margin-top:2px;color:var(--muted)}
#result.ok{color:var(--ok)}
#result.bad{color:var(--bad)}
.note{margin:15px 0 0;padding:13px 14px;background:#F5F8FB;border-radius:10px;font-size:12.5px;line-height:1.7;color:var(--muted)}
.foot{text-align:center;font-size:11.5px;color:var(--navy);margin:24px 0 0;padding:16px 0 0;line-height:1.7;border-top:2px solid var(--navy)}
.foot .en{display:block;color:var(--muted);margin-top:3px}
[hidden]{display:none!important}
/* Keep the band's colour when an officer prints the page for a file. */
@media print{body{background:#fff}.file{display:none}
  .band{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body>
<header class="band"><div class="band-inner">
  <p class="kingdom">ព្រះរាជាណាចក្រកម្ពុជា · ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
  <p class="centre">មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ</p>
  <p class="centre-en">National Metrology Center</p>
</div></header>

<main>

<div class="status pending" id="status" role="status" aria-live="polite">
  <svg id="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>
  <div style="min-width:0">
    <p class="kh" id="status-kh">កំពុងពិនិត្យ…</p>
    <p class="en" id="status-en">Checking the issuance record</p>
  </div>
</div>

<section class="card" id="record" hidden>
  <h2><span class="kh">ព័ត៌មានឯកសារ</span><span class="en">Document record</span></h2>
  <p class="doc-title" id="title"></p>
  <div id="details"></div>
</section>

<details class="card file" id="file-check" hidden>
  <summary>
    <span class="sum-text">
      <span class="kh">ផ្ទៀងផ្ទាត់ឯកសារអេឡិចត្រូនិក</span>
      <span class="en">Check an electronic file — only if you have it on this device</span>
    </span>
    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>
  </summary>
  <div class="file-body">
    <p class="hint">បើអ្នកបានស្កេនកូដ QR ពីឯកសារបោះពុម្ព មិនចាំបាច់ប្រើផ្នែកនេះទេ — ច្បាប់ចម្លងបោះពុម្ពនឹងមិនត្រូវគ្នានឹងលេខសម្គាល់ឡើយ។<br>If you scanned a printed report, you do not need this — a printed copy never matches the file hash.</p>
    <label for="file"><span class="kh">ជ្រើសរើសឯកសារដើម្បីប្រៀបធៀបជាមួយកំណត់ត្រានេះ</span><span class="en">Select the file to compare against this record</span></label>
    <input type="file" id="file" aria-label="Downloaded report file">
    <p id="result" role="status" aria-live="polite"></p>
    <p class="note">កូដ QR អាចត្រូវបានចម្លង។ ការផ្គូផ្គងកំណត់ត្រាបញ្ជាក់តែថាកំណត់ត្រានេះមានប៉ុណ្ណោះ មិនបញ្ជាក់ថាខ្លឹមសារឯកសារមិនបានកែប្រែទេ។ ច្បាប់ចម្លងដែលបានបោះពុម្ព ឬរក្សាទុកឡើងវិញ មានលេខសម្គាល់ឯកសារផ្សេងគ្នា។<br><br>A QR code can be copied. An issuance match alone does not establish that surrounding document content is unchanged. Printed or re-saved copies have different file hashes.</p>
  </div>
</details>

<p class="foot">នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម · ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍<span class="en">Department of Industrial Metrology · MISTI</span></p>
</main>
<script nonce="${nonce}">
(function(){
  var endpoint = '/api/report-issuance/verify/${safeToken}';
  var box = document.getElementById('status');
  var icon = document.getElementById('status-icon');
  var kh = document.getElementById('status-kh');
  var en = document.getElementById('status-en');

  var TICK  = '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.6 2.6L16 9.6"/>';
  var CROSS = '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>';
  var BANG  = '<circle cx="12" cy="12" r="9"/><path d="M12 7.4v5.2"/><path d="M12 16.3v.2"/>';

  function setStatus(tone, shape, khText, enText){
    box.className = 'status ' + tone;
    icon.innerHTML = shape;
    kh.textContent = khText;
    en.textContent = enText;
  }

  /** Cambodia time, because that is where this page is read. */
  function when(iso){
    if(!iso) return '';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return String(iso);
    try{
      return new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Phnom_Penh', day:'2-digit',
        month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false
      }).format(d) + ' (UTC+7)';
    }catch(e){ return String(iso); }
  }

  function addRow(labelKh, labelEn, value, mono){
    var row = document.createElement('div'); row.className = 'row';
    var l = document.createElement('p'); l.className = 'label';
    l.textContent = labelKh + ' · ' + labelEn;
    var v = document.createElement('p');
    v.className = 'value' + (mono ? ' mono' : '') + (value ? '' : ' none');
    v.textContent = value ? String(value) : '—';
    row.appendChild(l); row.appendChild(v);
    document.getElementById('details').appendChild(row);
  }

  fetch(endpoint, {cache:'no-store'}).then(function(response){
    return response.json().then(function(data){
      if(!response.ok) throw new Error(data.error || 'unavailable');

      if(data.state === 'revoked'){
        setStatus('bad', CROSS, 'កំណត់ត្រានេះត្រូវបានដកហូត', 'This issuance has been revoked');
      }else if(data.basis === 'draft'){
        setStatus('warn', BANG, 'ជាសេចក្ដីព្រាង មិនមែនឯកសារផ្លូវការ', 'Draft issuance — not a final document');
      }else{
        setStatus('ok', TICK, 'ឯកសារនេះចេញដោយ ម.ម.ជ', 'Issued by the National Metrology Center');
      }

      document.getElementById('record').hidden = false;
      document.getElementById('file-check').hidden = false;
      document.getElementById('title').textContent = data.title || '';

      addRow('ក្រុមហ៊ុន', 'Company', data.company);
      addRow('លេខអាជ្ញាប័ណ្ណ', 'Licence', data.licence);
      addRow('រយៈពេលរបាយការណ៍', 'Reporting period', data.period);
      addRow('កាលបរិច្ឆេទចេញ', 'Issued', when(data.issued_at));
      addRow('ប្រភេទឯកសារ', 'File format', data.format ? String(data.format).toUpperCase() : '');
      addRow('លេខសម្គាល់', 'Issuance ID', data.id, true);
    });
  }).catch(function(){
    setStatus('bad', CROSS, 'រកមិនឃើញកំណត់ត្រានេះទេ', 'No issuance record matches this code');
  });

  /** Khmer over English, for the same reason the headings stack. */
  function say(output, tone, khText, enText){
    output.className = tone;
    output.textContent = '';
    var a = document.createElement('span'); a.className = 'kh'; a.textContent = khText;
    var b = document.createElement('span'); b.className = 'en'; b.textContent = enText;
    output.appendChild(a); output.appendChild(b);
  }

  document.getElementById('file').addEventListener('change', function(event){
    var output = document.getElementById('result');
    var file = event.target.files[0];
    if(!file) return;
    if(file.size > 50 * 1024 * 1024){
      say(output, 'bad', 'ឯកសារធំជាង ៥០ MB', 'File exceeds the 50 MB limit');
      return;
    }
    say(output, '', 'កំពុងពិនិត្យ…', 'Checking the file…');
    file.arrayBuffer().then(function(buffer){
      return crypto.subtle.digest('SHA-256', buffer);
    }).then(function(hash){
      var hex = Array.from(new Uint8Array(hash)).map(function(b){
        return b.toString(16).padStart(2, '0');
      }).join('');
      return fetch(endpoint + '?sha256=' + hex, {cache:'no-store'});
    }).then(function(response){
      return response.json().then(function(data){
        if(!response.ok) throw new Error('unavailable');
        if(data.file_match){
          say(output, 'ok', 'ត្រូវគ្នាជាមួយឯកសារដែលបានចេញ', 'Exact match with the issued file');
        }else if(data.state === 'revoked'){
          say(output, 'bad', 'កំណត់ត្រានេះត្រូវបានដកហូត', 'This issuance is revoked');
        }else{
          say(output, 'bad', 'ឯកសារនេះមិនត្រូវគ្នានឹងកំណត់ត្រាទេ', 'This file does not match the registered download');
        }
      });
    }).catch(function(){
      say(output, 'bad', 'មិនអាចផ្ទៀងផ្ទាត់បានទេ', 'File verification is unavailable');
    });
  });
})();
</script></body></html>`;
}
