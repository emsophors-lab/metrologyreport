# Annex 8 migration plan (A8-2026.2)

Status: **proposal — awaiting approval. No code or data has been changed.**

Sources read: `CLAUDE_CODE_PROMPT_annex8.md`, `MLRS_Annex8_field_spec.xlsx`
(sheets: Fields / Validation rules / Lists), `mlrs_annex8_report_form.html` (799 lines),
and `ឧបសម្ព័ន្ធទី៨_របាយការណ៍ប្រចាំខែ_បញ្ចូលគ្នា.docx` (the official paper layout).

Division of authority between the three:

- **`mlrs_annex8_report_form.html` is the form specification** — steps, fields,
  validation, Part 2 computation, carry-over, state shape and JSON payload. The form is
  built to follow it (behaviour ported, not HTML pasted).
- **`MLRS_Annex8_field_spec.xlsx`** is the field dictionary and rule list.
- **The `.docx`** governs the print/PDF output only.

---

## 1. What the repo looks like today

| Concern | Current implementation |
|---|---|
| Framework | React 19 + TypeScript + Vite 6 |
| Server | Express (`server.ts`), bundled by esbuild, deployed on Vercel |
| Data | Supabase (Postgres). Writes go through service-role routes in `server.ts`; RLS blocks direct client writes |
| Auth | Supabase Auth bearer token; roles `superadmin` / `admin` / `company` resolved in `requireApiRole()` |
| Routing | No router. `activeTab` state in `App.tsx` (`'dashboard' \| 'reports' \| … \| 'ml'`) |
| i18n | Hand-rolled: `UI_TEXT` + `t(key, language)` in `App.tsx`, `DASH_TEXT`/`dt()` in the dashboard, plus a runtime `resolveLanguageText()` that splits `"ខ្មែរ / English"` strings |
| Styling | Tailwind v4 + `src/styles/nmc-official-theme.css`. Navy `#0B1A35` and gold `#C9A227` already exist as `--dash-navy` / `--dash-gold` |
| Report form | `src/components/ReportForm.tsx` (265 lines) — one flat form, no steps |
| Print / export | `ReportPrintLayout.tsx`; PDF via `jspdf`, Word via `docx`, PPT via `pptxgenjs` |
| Report API | `POST /api/reports` (upsert), `GET /api/reports`, `DELETE /api/reports`, `GET /api/verify-report`, `GET /api/verify-report-list` |

### The shape problem

This is the central issue and it drives everything below.

- **Today:** one `reports` row = **one service event** (one customer, one instrument,
  one service type). A licensee files many rows per month.
- **Annex 8:** one `reports` row = **one licence per month** (unique), with child rows
  in Parts 3 / 3A / 4 / 5 / 6.

An existing `reports` row therefore does **not** map to a new `reports` row. It maps to
a **Part 3 instrument row** or a **Part 4 repair row**, and its header fields fold into
a monthly parent that does not exist yet.

---

## 2. Field mapping — existing → Annex 8

Source: `MetrologyReport` (`src/types.ts:43`) and the `reports` table in `supabase_schema.sql`.

### 2.1 Fields that move to the monthly header (`reports`)

| Current field | Annex 8 field code | Note |
|---|---|---|
| `user_id` | `licensee_user_id` | header; one per licence per month |
| `license_number` | `licence_no` | header |
| `company_name_kh` | `enterprise_name_kh` | header; `enterprise_name_en` is new |
| `report_month` + `report_year` | `period_month` (`YYYY-MM`) | **needs normalisation** — currently Khmer month names (`មករា`) *or* numbers, stored as text |
| `report_status` | `status` | **value remap**, see 2.4 |
| `rejection_reason` | `nmc_remarks` | back-office |
| `approved_by` | `reviewer` | back-office |
| `approved_at` | `received_at` | back-office |
| `verification_token_hash` | `verification_token_hash` | moves from event row to monthly report |
| `created_at` / `updated_at` | unchanged | |

### 2.2 Fields that become Part 3 rows (`report_instruments`)

Applies when `service_type` is `Manufacture` or `Installation`.

| Current field | Annex 8 field code |
|---|---|
| `id` | `legacy_report_id` (kept for traceability) |
| `service_type = 'Manufacture'` | `op_code = 'M'` |
| `service_type = 'Installation'` | `op_code = 'I'` |
| `measuring_instrument` | `instrument_name` |
| `instrument_serial_number` | `serial_no` |
| `customer_name` | `customer_name` |
| `customer_address` | `address` (province must be split out into `province`) |
| `service_end_date` | `completion_date` |
| `service_start_date` | *(no equivalent in Part 3)* → `legacy_payload` |
| `scope_of_weight_measure` | *(no clean equivalent)* → see 2.5 |

### 2.3 Fields that become Part 4 rows (`report_repairs`)

Applies when `service_type = 'Repair'`.

| Current field | Annex 8 field code |
|---|---|
| `measuring_instrument` | `instrument_name` |
| `instrument_serial_number` | `serial_no` |
| `customer_name` / `customer_address` | `customer_name` / `address` |
| `service_start_date` | `repair_from` |
| `service_end_date` | `repair_to` |
| `scope_of_weight_measure` | seeds `repair_description` (needs ≥ 20 chars — see 2.5) |

### 2.4 Status value remap

| Current | Annex 8 |
|---|---|
| `Draft` | `DRAFT` |
| `Submitted` | `SUBMITTED` |
| `Under Review` | `SUBMITTED` |
| `Approved` | `ACCEPTED` |
| `Rejected` | `RETURNED` |

`Under Review` has no Annex 8 equivalent and collapses into `SUBMITTED`. Flagging it
because it loses information — if NMC relies on that distinction I would keep it as a
separate `review_substate` column rather than discard it.

### 2.5 Fields with no destination (dropped or degraded)

| Field | Problem | Proposal |
|---|---|---|
| `scope_of_weight_measure` | Free text (e.g. `"0–60t"`). Annex 8 wants structured `max` / `min` / `e` / `unit` + `accuracy_class`. Not reliably parseable | Keep verbatim in `legacy_payload` JSON; do **not** guess `max`/`min` |
| `spare_parts` | Free text, single string | Seeds one `report_modules` row (`module_name`); `model` / `manufacturer` / `country` / `cert_no` unknown |
| `spare_part_serial_number` | As above | `report_modules.serial_no` |
| `service_start_date` on M/I rows | Part 3 records only a completion date | `legacy_payload` |

**Consequence:** legacy rows cannot satisfy the new blocking validation. This is the
main argument for option (a) in §5.

### 2.6 New fields with no current source

No data exists anywhere in the system for these. They need new licence-side storage or
manual entry:

- **Header:** `licence_type` (`MANUF_INSTALL` / `REPAIR`), `registration_no`, `decision_no`,
  `decision_date`, `licence_valid_to`, `report_type` (`REGULAR` / `NIL` / `AMENDMENT`),
  `original_report_id`, `contact_{name,position,phone,email}`, `on_time`, `submitted_by`,
  `format_version`.
- **Part 3:** `category` (enum of 9), `category_other`, `model`, `manufacturer`, `country`,
  `max` / `min` / `e` / `unit`, `accuracy_class`, `type_approval_no`, `province`,
  `lat` / `long`, `label_qr_no`, `verification_status`, `verification_cert_no`,
  `verification_date`.
- **Part 3A:** `host_serial_no`, `module_name`, `model`, `serial_no`, `range_e`,
  `manufacturer`, `country`, `cert_no`, `new_or_replacement`.
- **Part 4:** `category`, `model`, `province`, `lat` / `long`, `repair_description`,
  `seal_broken`, `seal_removed_no`, `notification_no`, `technician`,
  `verification_status` / `cert_no` / `date`.
- **Part 5:** `equipment`, `serial_no`, `class_range`, `cal_cert_no`, `lab`, `cal_date`,
  `due_date`, `status`.
- **Part 6 / 7:** `e6_1`…`e6_6` (yes/no + details), `declaration_accepted`, `attachments`.
- **Part 2:** `part2_summary` JSON snapshot, computed server-side on submit.

### 2.7 Licence-side gaps (blocking for pre-fill)

The prompt requires licence pre-fill with type, scope categories, technicians and
registered standards. `EnterpriseLicense` (`src/types.ts:102`) has none of these in
usable form:

| Needed | Today | Gap |
|---|---|---|
| `licence_type` | — | **missing entirely** |
| `scope` (array of category codes) | `service_scope`, `measuring_instrument_type` (free text) | needs a coded table |
| `staff` (registered technicians) | — | **no table** — required by Part 4 `technician` |
| `standards` (registered equipment) | — | **no table** — required by Part 5 |
| `decision_no` / `decision_date` | — | missing |
| `registration_no` | — | missing |

These tables are a **prerequisite**, not a side task. Without coded scope categories,
V06 (category within licence scope) cannot be enforced at all.

---

## 3. Proposed schema

New tables, following the existing snake_case conventions:

```
reports                  -- REPLACED semantics: one row per licence per month (unique)
report_instruments       -- Part 3
report_modules           -- Part 3A (FK: report_id + host_serial_no + host_part)
report_repairs           -- Part 4
report_standards         -- Part 5
report_events            -- Part 6 (or a JSONB column on reports)
licence_scope_categories -- licence → category codes   (prerequisite)
licence_technicians      -- registered staff           (prerequisite)
licence_standards        -- registered equipment       (prerequisite)
```

- `reports.part2_summary JSONB` — computed snapshot written **on submit only**, never
  accepted from the client.
- `reports.format_version TEXT` — `A8-2026.2` for new, `LEGACY-1` for existing rows.
- `reports.original_report_id` — self-FK for amendments; submitted reports are never
  overwritten.
- Unique index on `(licence_no, period_month)` where `report_type <> 'AMENDMENT'`.

---

## 4. API changes

| Route | Change |
|---|---|
| `GET /api/me/licence` | **new** — licence header, scope, staff, standards |
| `GET /api/reports/draft?month=` | **new** — replaces the localStorage draft |
| `PUT /api/reports/draft` | **new** |
| `GET /api/reports/pending` | **new** — carry-over PENDING items |
| `POST /api/reports` | **rewritten** — server-side validation, computes Part 2, returns `{report_id, submitted_at}` with `NMC-RPT-YYYYMM-#####` |
| `GET /api/reports` | keep; extend with a `format_version` filter |
| `DELETE /api/reports` | restrict to `DRAFT` only |
| `GET /api/verify-report` | must handle both legacy and A8 reports |
| `POST /api/reports/:id/review` | **new** — Accept / Return with comment |

Validation V01–V11 lives in one server module and is mirrored on the client for the
live step dots. Blocking rules → HTTP 422 with `{code, path, message}[]`; warnings are
stored with the report. Times in `Asia/Phnom_Penh`; deadline is the 7th of the
following month at 23:59.

V06 / V07 / V10 require DB queries (licence scope, cross-system duplicate serial or
label, PENDING age) and cannot be fully mirrored on the client.

---

## 5. Legacy data — decision needed

22 source files read the current flat shape (`App.tsx`, `DashboardStats`,
`DataAnalyticsReport`, `ExcelReportUpload`, `SuperadminDashboard`, `TopServiceCompanies`,
`exportUtils`, the ML feature pipeline, `telegramUtils`, `excelReportParser`, and more).

**Option (a) — freeze legacy. Recommended.**
Existing rows stay as they are, tagged `format_version = 'LEGACY-1'`, readable and
printable with the current layout but no longer editable. New months use Annex 8.
Dashboard aggregates read a compatibility view that unions legacy rows with Part 3/4 rows.
*Pro:* no lossy guessing (§2.5), nothing breaks, reversible.
*Con:* two shapes coexist; analytics need the union view.

**Option (b) — backfill into Annex 8.**
Group legacy rows by `(licence, month)`, synthesise a monthly header, convert each row
into a Part 3/4 child.
*Pro:* a single shape.
*Con:* `category`, `model`, `manufacturer`, `country`, `max`/`min`/`e`, `type_approval_no`,
`label_qr_no`, `verification_status`, `technician` and GPS are all **unknown**. Every
backfilled report would be invalid under the new blocking rules, and normalising
`report_month` from Khmer month names is itself error-prone.

**I recommend (a).** Option (b) manufactures data NMC never collected, and the Prakas
rules would then reject the authority's own history.

---

## 6. Print layout — confirmed against the official Word file

Section breaks in the `.docx` confirm the page plan in the prompt exactly:

| Pages | Orientation | Content |
|---|---|---|
| 1 | portrait (A4) | Cover letter |
| 2 | portrait | Part 1 (rows 1.1–1.7) + Part 2 (9 categories + Total) + carry-over line |
| 3 | **landscape** | Part 3 (13 cols), Part 3A (11 cols), Part 4 (11 cols) |
| 4 | portrait | Part 5 (8 cols), Part 6 (6 items), Part 7 declaration, "For NMC Use Only" block |
| 5 | portrait | **Instructions page** (11 numbered notes) |

Part 2's nine category rows appear in exactly the order of `CATS` in the reference HTML
(NAWI, WEIGHBRIDGE, WEIGHTS, FUEL_DISPENSER, LPG_DISPENSER, ELEC_METER, WATER_METER,
EV_CHARGER, OTHER), followed by a Total row.

### Things the Word file requires that the reference HTML's print view does not emit

1. **Cover-letter aggregates.** The letter has inline totals — "ផលិត…គ្រឿង ដំឡើង…គ្រឿង
   ជួសជុល…គ្រឿង" — plus **"នៅទីតាំង (រាជធានី/ខេត្ត) …"**, a list of the distinct provinces
   touched that month. That province list is a **new Part 2 derivative** not present in
   the HTML's `summary()`; it must be derived from Part 3/4 rows.
2. **Nil checkbox on the cover letter** — the NIL flag is rendered on page 1, not only in Part 1.
3. **Instructions page** (11 notes) — absent from the HTML print view (`cover + p12 + p34 + p567`).
   Proposal: emit it as a final portrait page; it is part of the official form.
4. **"For NMC Use Only" block** — received date, registration no., on-time/late,
   complete/incomplete, reviewer, remarks. Printed blank for licensees; populated for NMC.

### Two small conflicts between the HTML and the Word file

- **Part 5:** `newStandard()` in the HTML carries a `cal_date`, but the paper table has
  only "ថ្ងៃកំណត់បន្ទាប់ / Due Date" (8 columns, no calibration date). Keep `cal_date` in
  the data model, omit it from the printed table.
- **Part 1 row 1.3 / licence type:** the paper form offers exactly two boxes —
  "ផលិត ដំឡើង | Manufacture & Installation" and "ជួសជុល | Repair" — confirming
  `licence_type` is the two-value enum `MANUF_INSTALL | REPAIR` from §2.7.

### Counting rules from the Instructions page (worth surfacing as form hints)

- Note 5: one instrument = one row, counted **once** under either Manufacture or Install;
  if manufactured *and* installed at the customer site, count it as **Install**. Repairs
  are counted per occurrence.
- Note 8: `e` is the **verification scale interval, not the resolution `d`** — needed as
  hint text next to the `e` field.
- Note 9: unverified items are recorded PENDING and must not be sold or put into service.
- Note 11: licensees retain copies for 5 years.

---

## 7. Build order (after approval)

1. Licence prerequisites: `licence_type`, scope categories, technicians, standards,
   plus admin UI to populate them. **Nothing else works without this.**
2. SQL migration for the new tables; legacy rows tagged `LEGACY-1`.
3. Server: validation module, Part 2 computation, draft / pending / submit routes.
4. UI: 7-step wizard built from the app's own components, i18n keys extracted from the
   reference form, status dots, live "activity = results" balance, step hiding for
   `REPAIR` licences and `NIL` reports.
5. Print view: named `@page` rules — portrait for the cover letter and Parts 1–2 / 5–7,
   landscape for Parts 3–4, Khmer OS Siemreap + Khmer OS Muol Light.
6. Back office: Accept / Return with comment; Part 2 snapshots feed the superadmin
   aggregates (by category, by province, on-time rate, PENDING count).
7. Mobile at 375 px, GPS capture, optional QR scan with an exactly pinned library.
8. Acceptance tests 1–5 from the prompt.

---

## 8. Open questions — please confirm before I start

~~1. Missing `.docx`.~~ **Resolved** — received and analysed; see §6.

1. **Legacy data:** option (a) freeze or (b) backfill? (§5 — I recommend (a).)
2. **Licence scope / staff / standards:** confirm these become new tables with an admin
   UI, and who populates them for existing licensees.
3. **Annex 10 register:** V03 requires `notification_no` to exist. Is there a
   notification register to validate against, or is free text acceptable for now?
4. **Type approval register:** `type_approval_no` is specified as validated against the
   NMC register. Does that register exist in any system today?
5. **`Under Review`** collapses into `SUBMITTED` (§2.4) — acceptable, or keep it?
6. **Attachments** (PDF/JPG/XLSX ≤ 10 MB) need file storage. Supabase Storage is not
   used by this app today — confirm that is the intended target.
7. **Instructions page** — include it in the generated PDF (§6), or print the form only?
