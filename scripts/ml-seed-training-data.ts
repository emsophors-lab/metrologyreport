/**
 * Development seed: enough licensees for the ML model to train on.
 *
 *   npm run ml:seed -- --yes          create it
 *   npm run ml:seed -- --remove       take it all out again
 *
 * WHY THIS EXISTS
 *
 * The lifecycle refuses to train below 20 enterprises with accepted Annex 8
 * reports, and with at least 3 enterprises on each side of the proxy label.
 * That floor is right — a model fitted on four companies would produce
 * confident scores about nothing. But it means that on a development machine,
 * and on a production database in its first months, the trained-model path
 * cannot be exercised at all: every report says "cold-start" and the ML code
 * is never run.
 *
 * So this writes a synthetic cohort to a LOCAL MySQL database, lets the real
 * worker train on it, and lets you see the real thing end to end.
 *
 * WHAT IT IS NOT
 *
 * These are not NMC's figures and no report built from them means anything.
 * Every row it writes is marked:
 *
 *   - licence numbers begin DEV-ML-
 *   - company names begin [DEV]
 *   - `notes` and `nmc_remarks` say so in words
 *
 * so nobody can mistake one for a return, and --remove can find every one.
 *
 * SAFETY
 *
 * Refuses unless DB_DRIVER=mysql. It will not run against Supabase — the
 * production database holds real licensees' returns, and seeding synthetic
 * companies into it would corrupt the evidence base the reports are built on.
 * Also refuses without --yes, so it cannot happen by autocomplete.
 */
import 'dotenv/config';
import crypto from 'node:crypto';

import { createMysqlClient } from '../src/db/mysqlClient';

const PREFIX = 'DEV-ML-';
const MARK = '[DEV] ';
const NOTE = 'Synthetic development data for ML training. Not an NMC return.';

/* ------------------------------------------------------------------ *
 * Guard rails
 * ------------------------------------------------------------------ */

const args = new Set(process.argv.slice(2));
const remove = args.has('--remove');

if (process.env.DB_DRIVER !== 'mysql') {
  console.error('Refusing to run: DB_DRIVER is not "mysql".');
  console.error('This writes synthetic companies and must never touch the production database.');
  process.exit(2);
}
if (!process.env.MYSQL_URL) {
  console.error('Refusing to run: MYSQL_URL is not set.');
  process.exit(2);
}
if (!remove && !args.has('--yes')) {
  console.error('Refusing to run without --yes.');
  console.error('  npm run ml:seed -- --yes       create the development cohort');
  console.error('  npm run ml:seed -- --remove    remove it');
  process.exit(2);
}

const db: any = createMysqlClient(process.env.MYSQL_URL);
const fail = (what: string, error: any) => {
  if (error) throw new Error(`${what}: ${error.message || error}`);
};

/* ------------------------------------------------------------------ *
 * Removal
 * ------------------------------------------------------------------ */

async function removeCohort() {
  const { data: licences, error } = await db.from('enterprise_licenses').select('*');
  fail('read licences', error);
  const mine = (licences || []).filter((l: any) => String(l.license_number || '').startsWith(PREFIX));

  const { data: reports, error: reportError } = await db.from('annex8_reports').select('*');
  fail('read reports', reportError);
  const myReports = (reports || []).filter((r: any) => String(r.licence_no || '').startsWith(PREFIX));

  // Children first: a report row removed before its entries would leave
  // orphans that the aggregation would still count.
  for (const table of ['annex8_report_instruments', 'annex8_report_repairs']) {
    for (const report of myReports) {
      fail(table, (await db.from(table).delete().eq('report_uuid', report.id)).error);
    }
  }
  for (const report of myReports) {
    fail('delete report', (await db.from('annex8_reports').delete().eq('id', report.id)).error);
  }
  for (const licence of mine) {
    fail('delete licence', (await db.from('enterprise_licenses').delete().eq('id', licence.id)).error);
  }
  console.log(`Removed ${mine.length} development licensees and ${myReports.length} reports.`);
}

/* ------------------------------------------------------------------ *
 * The cohort
 * ------------------------------------------------------------------ */

/**
 * Behaviour profiles.
 *
 * The proxy label is: expired licence, OR two or more of the last three
 * months missing, OR a profile under 65% complete, OR a high-risk instrument
 * with no GPS. The mix below is chosen to put at least three enterprises on
 * each side of it — not to flatter the model. `compliant` are the negatives;
 * the other three kinds are positives arrived at by three different routes,
 * so the classifier has to learn more than one signal.
 */
type Kind = 'compliant' | 'lapsed' | 'expired' | 'incomplete';
const COHORT: Array<{ kind: Kind; count: number }> = [
  { kind: 'compliant', count: 10 },
  { kind: 'lapsed', count: 8 },
  { kind: 'expired', count: 3 },
  { kind: 'incomplete', count: 3 },
];

const PROVINCES = ['រាជធានីភ្នំពេញ', 'ខេត្តកណ្ដាល', 'ខេត្តបាត់ដំបង', 'ខេត្តសៀមរាប',
  'ខេត្តកំពង់ចាម', 'ខេត្តព្រះសីហនុ', 'ខេត្តតាកែវ', 'ខេត្តកំពត'];
const CATEGORIES = ['NAWI', 'WEIGHBRIDGE', 'FUEL_DISPENSER', 'LPG_DISPENSER', 'WATER_METER', 'ELEC_METER'];

/** The six months ending with the current one, oldest first. */
function recentMonths(count = 6): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * A deterministic pseudo-random stream.
 *
 * Seeded so two runs produce the same cohort: a model whose measured F1
 * changes every time the seed is re-created cannot be compared with the one
 * before it, and the first thing anyone does with this script is run it
 * twice.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function seedCohort() {
  const months = recentMonths(6);
  const random = rng(20261023);
  const today = new Date();

  let index = 0;
  let reportCount = 0;
  let entryCount = 0;
  const summary: Record<Kind, number> = { compliant: 0, lapsed: 0, expired: 0, incomplete: 0 };

  // Two licensees will report the same serial, so the rule-based duplicate
  // anomaly has something real to find alongside the model's outliers.
  const sharedSerial = 'DEV-SER-DUP-0001';

  for (const { kind, count } of COHORT) {
    for (let n = 0; n < count; n++) {
      index++;
      const licenceNo = `${PREFIX}${String(index).padStart(3, '0')}`;
      const province = PROVINCES[index % PROVINCES.length];
      const complete = kind !== 'incomplete';
      const expired = kind === 'expired';

      const issue = new Date(Date.UTC(today.getUTCFullYear() - 2, index % 12, 1));
      // Expiry spread across the next three years rather than landing on one
      // date. daysUntilExpiry is a model feature, and a cohort where every
      // licence expires in the same month gives it nothing to separate.
      const expiry = expired
        ? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2 - (index % 3), 10))
        : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 4 + (index * 5) % 32, 1 + (index % 20)));

      /**
       * How late this licensee files, in days past the Article 21 deadline.
       *
       * Spread deliberately, because the first cohort was too tidy: four
       * behaviour kinds with near-identical features inside each one gave
       * k-means two real groups and a singleton, and the trainer rejected
       * the model — correctly. Real licensees sit on a continuum, so the
       * seed has to as well.
       */
      const delayBias = kind === 'compliant' ? (index % 4) - 1 : 2 + (index * 7) % 26;
      /** 1–6 distinct instrument categories, so the type-count features vary. */
      const typeSpread = 1 + (index % 6);

      const licence: Record<string, unknown> = {
        id: crypto.randomUUID(),
        license_number: licenceNo,
        company_name: `${MARK}Development Enterprise ${index}`,
        company_name_kh: `${MARK}សហគ្រាសសាកល្បង ${index}`,
        license_issue_date: ymd(issue),
        license_expiry_date: ymd(expiry),
        license_status: expired ? 'Expired' : 'Active',
        province_city: province,
        measuring_instrument_type: CATEGORIES[index % CATEGORIES.length],
        notes: NOTE,
        created_by: 'ml-seed',
        created_at: iso(today),
        updated_at: iso(today),
      };
      // The incomplete kind is incomplete on purpose: it is one of the four
      // routes to a positive label, and the thinnest profile the registry
      // actually allows.
      if (complete) {
        const optional: Record<string, unknown> = {
          license_owner_name: `Owner ${index}`,
          phone_number: `012${String(100000 + index).slice(-6)}`,
          email: `dev${index}@example.test`,
          company_address: `No. ${index}, Development Road, ${province}`,
          service_scope: ['ផលិត', 'ដំឡើង', 'ជួសជុល'].slice(0, 1 + (index % 3)).join(' '),
          business_type: 'Manufacturing and installation',
          business_latitude: 11.5 + (index % 20) * 0.05,
          business_longitude: 104.8 + (index % 20) * 0.05,
          telegram_username: `dev_${index}`,
        };
        // A few profiles short of one or two optional fields, so
        // profileCompletenessScore is a range and not two values. Never
        // enough to drop a compliant licensee below the 65% label threshold.
        const drop = kind === 'compliant' ? index % 3 : 0;
        for (const key of ['telegram_username', 'business_type'].slice(0, drop)) delete optional[key];
        Object.assign(licence, optional);
      }
      fail('insert licence', (await db.from('enterprise_licenses').insert(licence)).error);
      summary[kind]++;

      /**
       * Which months this licensee filed.
       *
       * `lapsed` stops 2–4 months short, so two or more of the last three
       * are missing by different amounts. A compliant licensee may still
       * have skipped one older month — that happens, and it keeps
       * missingReportsLast6Months from being constant at 1 across ten
       * enterprises without crossing the label threshold.
       */
      const filed = kind === 'lapsed'
        ? months.slice(0, months.length - (2 + (index % 3)))
        : kind === 'compliant' && index % 5 === 0
          ? months.filter((_, i) => i !== 1)
          : months;

      for (const period of filed) {
        const [year, month] = period.split('-').map(Number);
        // Article 21: due by the 7th of the following month.
        const due = new Date(Date.UTC(year, month, 7));
        const lateDays = delayBias + Math.floor(random() * 5) - 2;
        const submitted = new Date(due.getTime() + lateDays * 86400000);
        const reportId = crypto.randomUUID();

        fail('insert report', (await db.from('annex8_reports').insert({
          id: reportId,
          report_id: `DEV-${period.replace('-', '')}-${String(index).padStart(5, '0')}`,
          licence_no: licenceNo,
          licence_type: 'MANUF_INSTALL',
          enterprise_name_kh: licence.company_name_kh,
          enterprise_name_en: licence.company_name,
          operating_address: licence.company_address ?? null,
          period_month: period,
          report_type: 'REGULAR',
          contact_name: `Owner ${index}`,
          declaration_accepted: 1,
          status: 'ACCEPTED',
          on_time: lateDays <= 0 ? 1 : 0,
          submitted_at: iso(submitted),
          submitted_by: 'ml-seed',
          received_at: iso(submitted),
          reviewer: 'ml-seed',
          nmc_remarks: NOTE,
          is_complete: 1,
          created_at: iso(submitted),
          updated_at: iso(submitted),
        })).error);
        reportCount++;

        const rows = 2 + Math.floor(random() * 3);
        for (let r = 0; r < rows; r++) {
          // Compliant licensees fail verification rarely; the rest more
          // often, so the fail-rate factor in the rule score has a range.
          const roll = random();
          const status = kind === 'compliant'
            ? (roll < 0.04 ? 'FAILED' : roll < 0.1 ? 'PENDING' : 'PASSED')
            : (roll < 0.18 ? 'FAILED' : roll < 0.3 ? 'PENDING' : 'PASSED');
          const serial = index === 2 && period === months[0] && r === 0 ? sharedSerial
            : index === 7 && period === months[0] && r === 0 ? sharedSerial
            : `DEV-SER-${index}-${period.replace('-', '')}-${r}`;

          fail('insert instrument', (await db.from('annex8_report_instruments').insert({
            id: crypto.randomUUID(),
            report_uuid: reportId,
            row_no: r + 1,
            op_code: random() < 0.4 ? 'M' : 'I',
            category: CATEGORIES[(index + (r % typeSpread)) % CATEGORIES.length],
            instrument_name: `Development instrument ${index}-${r % typeSpread}`,
            model: `DEV-M${(index % 5) + 1}`,
            serial_no: serial,
            manufacturer: `Development Works ${(index % 4) + 1}`,
            country: 'KH',
            province,
            // A few rows with no GPS, so records_no_gps is not always zero.
            latitude: random() < 0.9 ? 11.5 + random() : null,
            longitude: random() < 0.9 ? 104.8 + random() : null,
            completion_date: `${period}-15`,
            verification_status: status,
            // PASSED with no certificate is one of the consistency anomalies.
            // Left possible on purpose, rarely, so that rule has something
            // to find; a seed where nothing is ever wrong tests nothing.
            verification_cert_no: status === 'PASSED' && random() > 0.05
              ? `DEV-CERT-${index}-${period.replace('-', '')}-${r}` : null,
            verification_date: status === 'PASSED' ? `${period}-20` : null,
            created_by: 'ml-seed',
          })).error);
          entryCount++;
        }

        if (random() < 0.35) {
          const sealBroken = random() < 0.3;
          fail('insert repair', (await db.from('annex8_report_repairs').insert({
            id: crypto.randomUUID(),
            report_uuid: reportId,
            row_no: 1,
            category: CATEGORIES[index % CATEGORIES.length],
            instrument_name: `Development repair ${index}`,
            serial_no: `DEV-REP-${index}-${period.replace('-', '')}`,
            province,
            repair_from: `${period}-16`,
            repair_to: `${period}-18`,
            repair_description: 'Development repair record.',
            seal_broken: sealBroken ? 1 : 0,
            // Article 25: a broken seal needs an Annex 10 notification.
            // Sometimes absent, so that anomaly is exercised too.
            notification_no: sealBroken && random() > 0.4 ? `DEV-NOTIF-${index}` : null,
            verification_status: random() < 0.85 ? 'PASSED' : 'FAILED',
            verification_cert_no: `DEV-RCERT-${index}-${period.replace('-', '')}`,
            created_by: 'ml-seed',
          })).error);
          entryCount++;
        }
      }
    }
  }

  console.log(`Seeded ${index} development licensees `
    + `(${Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(', ')}), `
    + `${reportCount} accepted reports, ${entryCount} entries.`);
  console.log(`Months covered: ${months[0]} to ${months.at(-1)}.`);
  console.log('Remove with: npm run ml:seed -- --remove');
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

try {
  if (remove) await removeCohort();
  else {
    await removeCohort();   // idempotent: a second --yes replaces, not doubles
    await seedCohort();
  }
  process.exit(0);
} catch (err: any) {
  console.error(err?.message || err);
  process.exit(1);
}
