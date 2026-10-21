import { createHash } from 'node:crypto';
import { buildTrainingDataset } from '../services/mlTrainingDataService';
import { buildMlFeatures } from '../services/mlFeatureEngineering';
import { featureVector } from './portable';

export async function allRows(db: any, table: string, filter: (q: any) => any = q => q) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await filter(db.from(table).select('*')).order('id').range(offset, offset + 499);
    if (error) throw new Error(`ML dataset read failed: ${table}`);
    rows.push(...data); if (data.length < 500) return rows;
  }
}
export async function collectDataset(db: any) {
  const accepted = await allRows(db, 'annex8_reports', q => q.eq('status', 'ACCEPTED'));
  const licenses = await allRows(db, 'enterprise_licenses');
  const instruments: any[] = [], repairs: any[] = [];
  for (let i = 0; i < accepted.length; i += 200) {
    const ids = accepted.slice(i, i + 200).map(r => r.id);
    instruments.push(...await allRows(db, 'annex8_report_instruments', q => q.in('report_uuid', ids)));
    repairs.push(...await allRows(db, 'annex8_report_repairs', q => q.in('report_uuid', ids)));
  }
  const reports = accepted.map(r => ({ ...r, license_number: r.licence_no,
    company_name_kh: r.enterprise_name_kh, report_month: Number(String(r.period_month).slice(5, 7)),
    report_year: Number(String(r.period_month).slice(0, 4)), created_at: r.submitted_at || r.created_at }));
  // One observation per enterprise prevents multiple monthly rows leaking an
  // enterprise into both validation and training folds.
  const inferenceFeatures = buildMlFeatures({ licenses, reports } as any);
  const reportLicence = new Map(accepted.map(r => [r.id, r.licence_no]));
  for (const f of inferenceFeatures) {
    const work = instruments.filter(r => reportLicence.get(r.report_uuid) === f.licenseNumber);
    const fixes = repairs.filter(r => reportLicence.get(r.report_uuid) === f.licenseNumber);
    const types = new Set([...work, ...fixes].map(r => String(r.instrument_name || r.category || '').trim()).filter(Boolean));
    f.instrumentTypeCount = types.size;
    f.instrumentDemandTrendScore = Math.min(100, types.size * 10);
    f.serviceTypeCount = new Set([...work.map(r => r.op_code), ...(fixes.length ? ['R'] : [])].filter(Boolean)).size;
  }
  const records = buildTrainingDataset({ licenses, reports } as any)
    .filter(r => accepted.some(a => a.licence_no === r.features.licenseNumber));
  for (const record of records) record.features = inferenceFeatures.find(f => f.licenseId === record.features.licenseId)!;
  const samples = records.map(r => ({ id: r.features.licenseId,
    reportIds: accepted.filter(a => a.licence_no === r.features.licenseNumber).map(a => String(a.id)), x: featureVector(r.features),
    y: r.labels.highInspectionPriority ? 1 : 0 }));
  const reportIds = accepted.map(r => String(r.id)).sort();
  const licenseFields = ['id', 'license_number', 'company_name', 'company_name_kh', 'company_id', 'company_user_id',
    'business_latitude', 'business_longitude', 'business_type', 'company_address', 'email', 'license_expiry_date',
    'license_issue_date', 'license_owner_email', 'license_owner_name', 'license_owner_phone', 'measuring_instrument_type',
    'phone_number', 'province_city', 'service_scope', 'telegram_chat_id', 'telegram_connected_at', 'telegram_username'];
  const fingerprint = createHash('sha256').update(JSON.stringify({
    accepted: accepted.map(r => [r.id, r.licence_no, r.period_month, r.submitted_at || r.created_at]),
    licenses: licenses.map(l => licenseFields.map(k => l[k] ?? null)),
    instruments: instruments.map(r => [r.id, r.report_uuid, r.op_code, r.instrument_name, r.category]),
    repairs: repairs.map(r => [r.id, r.report_uuid, r.instrument_name, r.category]),
  })).digest('hex');
  return { samples, reportIds, fingerprint, inferenceFeatures, evidence: { accepted, licenses, instruments, repairs } };
}
