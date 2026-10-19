import assert from 'node:assert/strict';
import fs from 'node:fs';
import { automaticConsolidatedInputs } from '../src/lib/consolidated/automaticReport';
import { prepareConsolidatedData } from '../src/lib/consolidated/buildConsolidatedData';
import { fillConsolidatedTemplate } from '../src/lib/consolidated/consolidatedDocx';
import type { ConsolidatedPreview } from '../src/lib/consolidated/buildConsolidatedData';
const base = process.env.CONSOLIDATED_TEST_URL || 'http://localhost:3004';
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)) throw new Error('Local API check refuses remote hosts');
const headers = (role: string) => ({'X-NMC-User-ID':role==='company'?'user-co-001':role==='admin'?'user-ad-001':'user-sa-001',
  'X-NMC-Username':role==='company'?'company01':role,'X-NMC-User-Role':role});
const path = '/api/consolidated/preview?period_type=MONTH&year=2026&index=4';
assert.equal((await fetch(base+path)).status,401);
assert.equal((await fetch(base+path,{headers:headers('company')})).status,403);
for (const role of ['admin','superadmin']) {
  const response = await fetch(base+path,{headers:headers(role)});
  const payload = await response.json();
  assert.equal(response.status,200,JSON.stringify(payload));
  const preview = payload as ConsolidatedPreview;
  assert.ok(['mysql','postgresql'].includes(preview.source));
  assert.equal(preview.period.key,'2026-04');
  const now = new Date();
  const data = prepareConsolidatedData(preview.data,preview.period,automaticConsolidatedInputs(preview.data,preview.period,{},now));
  fs.mkdirSync('test-output',{recursive:true});
  if (role==='superadmin') {
    fs.writeFileSync('test-output/Consolidated_LOCAL_DATABASE.docx',fillConsolidatedTemplate(fs.readFileSync('public/templates/Consolidated_template_v1.docx'),data).getZip().generate({type:'nodebuffer',compression:'DEFLATE'}));
    console.log(JSON.stringify({source:preview.source,period:preview.period.key,active:preview.data.sub_active_total,manufactured:preview.data.total_m,installed:preview.data.total_i,repaired:preview.data.total_r,data_as_of:preview.data_as_of}));
  }
}
assert.equal((await fetch(base+'/api/consolidated/preview?period_type=MONTH&year=0&index=14',{headers:headers('superadmin')})).status,400);
console.log('PASS: local API anonymous 401/company 403/admin+superadmin 200/invalid period 400; Word filled from existing operational local data without writes.');
