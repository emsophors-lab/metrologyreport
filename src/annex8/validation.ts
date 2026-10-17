/**
 * Annex 8 validation — V01–V11 from the "Validation rules" sheet, plus the
 * field-level requirements (R-codes) ported from the reference form.
 *
 * Pure and isomorphic. The client runs it for live step dots; the server runs
 * the same function as the authority and rejects blocking issues with 422.
 *
 * Rules that need the database (V03 notification register, V06 licence scope,
 * V07 cross-system duplicates) read from `Annex8ValidationContext`, which the
 * server fills in and the client supplies partially.
 */

import {
  CAMBODIA_BOUNDS,
  DEADLINE_DAY,
  MIN_REPAIR_DESCRIPTION_LENGTH,
  EVENTS,
} from './constants';
import {
  Annex8Issue,
  Annex8State,
  Annex8ValidationContext,
} from './types';
import {
  deadlineFor,
  hasAnyFailed,
  isWithinPeriod,
  periodBounds,
  toIsoDate,
  toKhmerDigits,
} from './summary';

/** Step indices in the full (unfiltered) wizard, used to colour the rail dots. */
export const STEP_INDEX = {
  PART1: 0,
  PART3: 1,
  PART3A: 2,
  PART4: 3,
  PART5: 4,
  PART6: 5,
  REVIEW: 6,
} as const;

const isBlank = (value: unknown) => String(value ?? '').trim() === '';

function insideCambodia(lat: string, lng: string): boolean {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return (
    a >= CAMBODIA_BOUNDS.minLat && a <= CAMBODIA_BOUNDS.maxLat &&
    b >= CAMBODIA_BOUNDS.minLng && b <= CAMBODIA_BOUNDS.maxLng
  );
}

export function validateAnnex8(
  state: Annex8State,
  context: Annex8ValidationContext,
): Annex8Issue[] {
  const issues: Annex8Issue[] = [];
  const add = (
    severity: Annex8Issue['severity'],
    code: string,
    step: number,
    message: string,
    path = '',
  ) => issues.push({ severity, code, step, message, path });

  const now = context.now ?? new Date();
  const period = state.meta.period_month;
  const [, periodEnd] = periodBounds(period);
  const isNil = state.meta.report_type === 'NIL';
  const scope = context.licence?.scope ?? [];

  /* ---------- Part 1 — header ---------- */

  // V06 (first half): the licence must still be valid at the end of the period.
  if (context.licence?.licence_valid_to && context.licence.licence_valid_to < toIsoDate(periodEnd)) {
    add('block', 'V06', STEP_INDEX.PART1,
      'អាជ្ញាប័ណ្ណផុតសុពលភាព មុនចុងខែរាយការណ៍', 'meta.period_month');
  }

  if (state.meta.report_type === 'AMENDMENT' && isBlank(state.meta.original_report_id)) {
    add('block', 'R01', STEP_INDEX.PART1,
      'សូមបញ្ចូលលេខរបាយការណ៍ដើម', 'meta.original_report_id');
  }

  if (isBlank(state.meta.contact.name)) {
    add('block', 'R01', STEP_INDEX.PART1,
      'សូមបំពេញព័ត៌មានអ្នកទទួលខុសត្រូវ (ឈ្មោះ)', 'meta.contact.name');
  }
  if (isBlank(state.meta.contact.phone)) {
    add('block', 'R01', STEP_INDEX.PART1,
      'សូមបំពេញព័ត៌មានអ្នកទទួលខុសត្រូវ (ទូរសព្ទ)', 'meta.contact.phone');
  }
  if (!isBlank(state.meta.contact.email) && !/^\S+@\S+\.\S+$/.test(state.meta.contact.email)) {
    add('block', 'R02', STEP_INDEX.PART1, 'អ៊ីម៉ែលមិនត្រឹមត្រូវ', 'meta.contact.email');
  }

  if (isNil) {
    // V05 — a nil report cannot carry rows in Parts 3–5.
    if (state.instruments.length || state.modules.length || state.repairs.length || state.standards.length) {
      add('block', 'V05', STEP_INDEX.PART1,
        'របាយការណ៍គ្មានសកម្មភាព មិនអាចមានជួរទិន្នន័យក្នុងផ្នែកទី៣–៥ ទេ — សូមលុបជួរ ឬប្ដូរប្រភេទរបាយការណ៍');
    }
  } else {
    if (!state.instruments.length && !state.repairs.length) {
      add('block', 'R03', STEP_INDEX.PART1,
        'គ្មានជួរទិន្នន័យ — បើគ្មានសកម្មភាព សូមជ្រើស «គ្មានសកម្មភាព (Nil report)»', 'meta.report_type');
    }

    validateInstruments(state, context, scope, period, add);
    validateRepairs(state, context, period, add);
    validateModules(state, add);
    validateStandards(state, add);
  }

  /* ---------- Carry-over ---------- */

  state.carry_over.forEach((item, i) => {
    if (item.status !== 'PENDING' && (isBlank(item.cert_no) || isBlank(item.date))) {
      add('block', 'R07', STEP_INDEX.REVIEW,
        `ឧបករណ៍រង់ចាំពីខែមុន ${item.serial_no}៖ ខ្វះលេខ/ថ្ងៃផ្ទៀងផ្ទាត់`, `carry_over.${i}.cert_no`);
    }
    // V10 — flag items pending for more than 30 days.
    if (item.status === 'PENDING' && item.since) {
      const since = new Date(item.since);
      if (!Number.isNaN(since.getTime())) {
        const days = Math.floor((now.getTime() - since.getTime()) / 86400000);
        if (days > 30) {
          add('warn', 'V10', STEP_INDEX.REVIEW,
            `${item.serial_no}៖ រង់ចាំលើសពី ៣០ ថ្ងៃ (${days} ថ្ងៃ)`, `carry_over.${i}.status`);
        }
      }
    }
  });

  /* ---------- Part 6 — events ---------- */

  EVENTS.forEach(({ key, no }) => {
    const event = state.events[key];
    if (!event || event.yes === null) {
      add('block', 'R09', STEP_INDEX.PART6, `ចំណុច ${no}៖ សូមជ្រើស មាន ឬគ្មាន`, `events.${key}.yes`);
    } else if (event.yes && isBlank(event.details)) {
      add('block', 'R09', STEP_INDEX.PART6, `ចំណុច ${no}៖ សូមបញ្ជាក់ព័ត៌មានលម្អិត`, `events.${key}.details`);
    }
  });

  if (hasAnyFailed(state) && state.events.e6_5?.yes === false) {
    add('block', 'R10', STEP_INDEX.PART6,
      'មានឧបករណ៍ «មិនឆ្លង» — ចំណុច ៦.៥ ត្រូវជ្រើស «មាន» ហើយបញ្ជាក់វិធានការ', 'events.e6_5.yes');
  }

  /* ---------- Part 7 — declaration & timing ---------- */

  // V11 — late submission is recorded, not blocked.
  if (now > deadlineFor(period)) {
    add('info', 'V11', STEP_INDEX.REVIEW,
      `ការដាក់ជូនយឺត — ថិរវេលាគឺថ្ងៃទី${toKhmerDigits(DEADLINE_DAY)} នៃខែបន្ទាប់ (ប្រការ២១)`);
  }

  // V04 — the declaration must be ticked.
  if (!state.declaration) {
    add('block', 'V04', STEP_INDEX.REVIEW, 'សូមគូសយល់ព្រមលើសេចក្ដីប្រកាសអះអាង', 'declaration');
  }

  return issues;
}

/* ------------------------------------------------------------------ */

type AddFn = (
  severity: Annex8Issue['severity'],
  code: string,
  step: number,
  message: string,
  path?: string,
) => void;

const REQUIRED_INSTRUMENT_FIELDS: Array<[string, string]> = [
  ['category', 'ប្រភេទ'],
  ['instrument_name', 'ឈ្មោះឧបករណ៍'],
  ['model', 'ម៉ូដែល'],
  ['serial_no', 'លេខស៊េរី'],
  ['manufacturer', 'សហគ្រាសផលិត'],
  ['country', 'ប្រទេសផលិត'],
  ['max', 'Max'],
  ['type_approval_no', 'លេខអនុម័តគំរូ'],
  ['completion_date', 'ថ្ងៃបញ្ចប់'],
  ['label_qr_no', 'លេខស្លាក/QR'],
];

function validateInstruments(
  state: Annex8State,
  context: Annex8ValidationContext,
  scope: string[],
  period: string,
  add: AddFn,
) {
  const seenInReport: Record<string, boolean> = {};

  state.instruments.forEach((row, i) => {
    const p = `instruments.${i}.`;
    const label = `ផ្នែកទី៣ ជួរ ${i + 1}`;

    REQUIRED_INSTRUMENT_FIELDS.forEach(([field, name]) => {
      if (isBlank((row as any)[field])) {
        add('block', 'R01', STEP_INDEX.PART3, `${label}៖ ខ្វះ ${name}`, p + field);
      }
    });

    if (row.category === 'OTHER' && isBlank(row.category_other)) {
      add('block', 'R01', STEP_INDEX.PART3, `${label}៖ សូមបញ្ជាក់ប្រភេទ «ផ្សេងៗ»`, p + 'category_other');
    }

    // V06 (second half) — category must be inside the licence scope.
    if (row.category && scope.length > 0 && !scope.includes(row.category)) {
      add('block', 'V06', STEP_INDEX.PART3,
        `${label}៖ ប្រភេទឧបករណ៍ ក្រៅវិសាលភាពអាជ្ញាប័ណ្ណ`, p + 'category');
    }

    if (row.max !== '' && row.min !== '' && !(Number(row.max) > Number(row.min) && Number(row.min) >= 0)) {
      add('block', 'R04', STEP_INDEX.PART3, `${label}៖ Max ត្រូវធំជាង Min`, p + 'min');
    }
    if (isBlank(row.e) && isBlank(row.accuracy_class)) {
      add('block', 'R04', STEP_INDEX.PART3, `${label}៖ ត្រូវមាន e ឬថ្នាក់សុក្រឹតភាព`, p + 'e');
    }
    if (row.completion_date && !isWithinPeriod(row.completion_date, period)) {
      add('block', 'R05', STEP_INDEX.PART3,
        `${label}៖ ថ្ងៃបញ្ចប់ មិនស្ថិតក្នុងខែរាយការណ៍`, p + 'completion_date');
    }

    if (row.op_code === 'I') {
      ([['customer_name', 'ឈ្មោះអតិថិជន'], ['province', 'រាជធានី/ខេត្ត'], ['lat', 'និយាមការ']] as Array<[string, string]>)
        .forEach(([field, name]) => {
          if (isBlank((row as any)[field])) {
            add('block', 'R01', STEP_INDEX.PART3, `${label}៖ ខ្វះ ${name}`, p + field);
          }
        });
    }

    if ((row.lat !== '' || row.long !== '') && !insideCambodia(row.lat, row.long)) {
      add('block', 'R06', STEP_INDEX.PART3, `${label}៖ និយាមការនៅក្រៅព្រំដែនកម្ពុជា`, p + 'lat');
    }

    if (row.verification_status !== 'PENDING' && (isBlank(row.verification_cert_no) || isBlank(row.verification_date))) {
      add('block', 'R07', STEP_INDEX.PART3,
        `${label}៖ ខ្វះលេខ/ថ្ងៃវិញ្ញាបនបត្រផ្ទៀងផ្ទាត់`, p + 'verification_cert_no');
    }

    // V07 — duplicate serial inside this report, or already known system-wide.
    if (row.serial_no) {
      const key = `${row.manufacturer}|${row.model}|${row.serial_no}`.toLowerCase();
      if (seenInReport[key]) {
        add('warn', 'V07', STEP_INDEX.PART3, `${label}៖ លេខស៊េរីស្ទួន ក្នុងរបាយការណ៍នេះ`, p + 'serial_no');
      }
      seenInReport[key] = true;

      if (context.knownDuplicateSerials?.includes(row.serial_no)) {
        add('warn', 'V07', STEP_INDEX.PART3,
          `${label}៖ លេខស៊េរីនេះមានរួចក្នុងប្រព័ន្ធ`, p + 'serial_no');
      }
    }
    if (row.label_qr_no && context.knownDuplicateLabels?.includes(row.label_qr_no)) {
      add('warn', 'V07', STEP_INDEX.PART3,
        `${label}៖ លេខស្លាក/QR នេះមានរួចក្នុងប្រព័ន្ធ`, p + 'label_qr_no');
    }
  });
}

const REQUIRED_REPAIR_FIELDS: Array<[string, string]> = [
  ['category', 'ប្រភេទ'],
  ['instrument_name', 'ឈ្មោះឧបករណ៍'],
  ['serial_no', 'លេខស៊េរី'],
  ['customer_name', 'ឈ្មោះអតិថិជន'],
  ['province', 'រាជធានី/ខេត្ត'],
  ['repair_from', 'ថ្ងៃចាប់ផ្ដើម'],
  ['repair_to', 'ថ្ងៃបញ្ចប់'],
  ['technician', 'អ្នកបច្ចេកទេស'],
];

function validateRepairs(
  state: Annex8State,
  context: Annex8ValidationContext,
  period: string,
  add: AddFn,
) {
  state.repairs.forEach((row, i) => {
    const p = `repairs.${i}.`;
    const label = `ផ្នែកទី៤ ជួរ ${i + 1}`;

    REQUIRED_REPAIR_FIELDS.forEach(([field, name]) => {
      if (isBlank((row as any)[field])) {
        add('block', 'R01', STEP_INDEX.PART4, `${label}៖ ខ្វះ ${name}`, p + field);
      }
    });

    if (row.repair_description.trim().length < MIN_REPAIR_DESCRIPTION_LENGTH) {
      add('block', 'R01', STEP_INDEX.PART4,
        `${label}៖ ខ្លឹមសារនៃការជួសជុល ត្រូវយ៉ាងតិច ២០ តួអក្សរ`, p + 'repair_description');
    }
    if (row.repair_from && row.repair_to && row.repair_from > row.repair_to) {
      add('block', 'R05', STEP_INDEX.PART4, `${label}៖ ថ្ងៃចាប់ផ្ដើម ក្រោយថ្ងៃបញ្ចប់`, p + 'repair_from');
    }
    if (row.repair_to && !isWithinPeriod(row.repair_to, period)) {
      add('block', 'R05', STEP_INDEX.PART4,
        `${label}៖ ថ្ងៃបញ្ចប់ការជួសជុល មិនស្ថិតក្នុងខែរាយការណ៍`, p + 'repair_to');
    }

    // V03 — a broken seal requires an Annex 10 notification number.
    if (row.seal_broken && isBlank(row.seal_removed_no)) {
      add('block', 'R01', STEP_INDEX.PART4, `${label}៖ ខ្វះលេខ Sticker/Seal ដែលបានដក`, p + 'seal_removed_no');
    }
    if (row.seal_broken && isBlank(row.notification_no)) {
      add('block', 'V03', STEP_INDEX.PART4,
        `${label}៖ បានដកសញ្ញាត្រួតពិនិត្យ ត្រូវមានលេខសេចក្ដីជូនដំណឹង (ឧបសម្ព័ន្ធទី១០)`, p + 'notification_no');
    }
    if (row.notification_no && context.knownNotificationNos &&
        !context.knownNotificationNos.includes(row.notification_no)) {
      add('warn', 'V03', STEP_INDEX.PART4,
        `${label}៖ រកមិនឃើញលេខសេចក្ដីជូនដំណឹងនេះ`, p + 'notification_no');
    }

    if ((row.lat !== '' || row.long !== '') && !insideCambodia(row.lat, row.long)) {
      add('block', 'R06', STEP_INDEX.PART4, `${label}៖ និយាមការនៅក្រៅព្រំដែនកម្ពុជា`, p + 'lat');
    }
    if (row.verification_status !== 'PENDING' && (isBlank(row.verification_cert_no) || isBlank(row.verification_date))) {
      add('block', 'R07', STEP_INDEX.PART4,
        `${label}៖ ខ្វះលេខ/ថ្ងៃផ្ទៀងផ្ទាត់បន្ទាប់`, p + 'verification_cert_no');
    }
    // Technician must be registered staff of the licensee.
    if (row.technician && context.licence?.staff?.length &&
        !context.licence.staff.includes(row.technician)) {
      add('warn', 'R11', STEP_INDEX.PART4,
        `${label}៖ អ្នកបច្ចេកទេសមិនមានក្នុងបញ្ជីបុគ្គលិកចុះបញ្ជី`, p + 'technician');
    }
  });
}

/** Part 3A host serials must exist in Part 3 or Part 4 of the same report. */
export function hostOptions(state: Annex8State) {
  return [
    ...state.instruments.filter((x) => x.serial_no).map((x) => ({
      serial_no: x.serial_no,
      label: `${x.serial_no} — ${x.instrument_name || x.category} (ផ្នែកទី៣)`,
      part: 'P3' as const,
    })),
    ...state.repairs.filter((x) => x.serial_no).map((x) => ({
      serial_no: x.serial_no,
      label: `${x.serial_no} — ${x.instrument_name || x.category} (ផ្នែកទី៤)`,
      part: 'P4' as const,
    })),
  ];
}

export function hostPart(state: Annex8State, serial: string): 'P3' | 'P4' | '' {
  if (state.repairs.some((x) => x.serial_no === serial)) return 'P4';
  if (state.instruments.some((x) => x.serial_no === serial)) return 'P3';
  return '';
}

const REQUIRED_MODULE_FIELDS: Array<[string, string]> = [
  ['module_name', 'ឈ្មោះម៉ូឌុល'],
  ['model', 'ម៉ូដែល'],
  ['serial_no', 'លេខស៊េរី'],
  ['manufacturer', 'សហគ្រាសផលិត'],
  ['country', 'ប្រទេសផលិត'],
  ['cert_no', 'លេខវិញ្ញាបនបត្រ'],
];

function validateModules(state: Annex8State, add: AddFn) {
  const hosts = hostOptions(state).map((h) => h.serial_no);

  state.modules.forEach((row, i) => {
    const p = `modules.${i}.`;
    const label = `ផ្នែកទី៣ក ជួរ ${i + 1}`;

    // V02 — every module references a host serial in Part 3 or Part 4.
    if (!hosts.includes(row.host_serial_no)) {
      add('block', 'V02', STEP_INDEX.PART3A,
        `${label}៖ លេខស៊េរីឧបករណ៍មេ មិនមានក្នុងផ្នែកទី៣ ឬទី៤`, p + 'host_serial_no');
    }

    REQUIRED_MODULE_FIELDS.forEach(([field, name]) => {
      if (isBlank((row as any)[field])) {
        add('block', 'R01', STEP_INDEX.PART3A, `${label}៖ ខ្វះ ${name}`, p + field);
      }
    });

    if (row.new_or_replacement === 'REPLACEMENT' && hostPart(state, row.host_serial_no) !== 'P4') {
      add('block', 'R08', STEP_INDEX.PART3A,
        `${label}៖ «ជំនួស» អនុញ្ញាតតែសម្រាប់ឧបករណ៍ក្នុងផ្នែកទី៤ (ជួសជុល)`, p + 'new_or_replacement');
    }
  });
}

const REQUIRED_STANDARD_FIELDS: Array<[string, string]> = [
  ['equipment', 'ឈ្មោះឧបករណ៍'],
  ['serial_no', 'លេខស៊េរី'],
  ['cal_cert_no', 'លេខវិញ្ញាបនបត្រ'],
  ['lab', 'មន្ទីរពិសោធន៍'],
  ['due_date', 'ថ្ងៃកំណត់'],
];

function validateStandards(state: Annex8State, add: AddFn) {
  const activityDates = [
    ...state.instruments.map((x) => x.completion_date),
    ...state.repairs.map((x) => x.repair_to),
  ].filter(Boolean);

  state.standards.forEach((row, i) => {
    const p = `standards.${i}.`;
    const label = `ផ្នែកទី៥ ជួរ ${i + 1}`;

    REQUIRED_STANDARD_FIELDS.forEach(([field, name]) => {
      if (isBlank((row as any)[field])) {
        add('block', 'R01', STEP_INDEX.PART5, `${label}៖ ខ្វះ ${name}`, p + field);
      }
    });

    // V09 — traceability lapse: a standard past its due date on an activity date.
    if (row.due_date && activityDates.some((d) => d > row.due_date)) {
      add('warn', 'V09', STEP_INDEX.PART5,
        `${label}៖ ឧបករណ៍ស្ដង់ដារផុតកំណត់ព្យាសកម្ម មុនថ្ងៃអនុវត្តសកម្មភាពមួយចំនួន`, p + 'due_date');
    }
  });
}

export const blockingIssues = (issues: Annex8Issue[]) => issues.filter((i) => i.severity === 'block');
export const warningIssues = (issues: Annex8Issue[]) => issues.filter((i) => i.severity === 'warn');
