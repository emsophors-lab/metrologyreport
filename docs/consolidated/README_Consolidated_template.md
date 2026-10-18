# Consolidated report template (Department of Industrial Metrology → NMC Director General)

One template covers **monthly, quarterly, semester (half-year) and annual** reports. The period wording is inserted by the tags, so there is a single template for all four.

| File | Where it goes in the project |
|---|---|
| `Consolidated_template_v1.docx` | `public/templates/Consolidated_template_v1.docx` |
| `consolidated-sample-data.json` | `src/lib/consolidated/__fixtures__/consolidated-sample-data.json` (data contract and example: a first-semester report) |
| `fill-consolidated.js` | `docs/consolidated/fill-consolidated.js` (Node reference and test script) |
| `Consolidated_sample_filled.docx` | `docs/consolidated/` (expected output for the sample data) |

## Period tags
| Tag | Monthly | Quarterly | Semester | Annual |
|---|---|---|---|---|
| `period_word_kh` | ខែ | ត្រីមាស | ឆមាស | ឆ្នាំ |
| `period_word_en` | month | quarter | half-year | year |
| `period_label_kh` | ខែកញ្ញា ឆ្នាំ២០២៦ | ត្រីមាសទី៣ ឆ្នាំ២០២៦ | ឆមាសទី១ ឆ្នាំ២០២៦ | ឆ្នាំ២០២៦ |
| `annex8_months_kh` | ខែកញ្ញា ឆ្នាំ២០២៦ | ពីខែកក្កដា ដល់ខែកញ្ញា ឆ្នាំ២០២៦ | ពីខែមករា ដល់ខែមិថុនា ឆ្នាំ២០២៦ | ពីខែមករា ដល់ខែធ្នូ ឆ្នាំ២០២៦ |
| `period_range_kh` | ពីថ្ងៃទី០១ ខែកញ្ញា ដល់ថ្ងៃទី៣០ ខែកញ្ញា ឆ្នាំ២០២៦ | … | ពីថ្ងៃទី០១ ខែមករា ដល់ថ្ងៃទី៣០ ខែមិថុនា ឆ្នាំ២០២៦ | … |
| `chk_month` `chk_quarter` `chk_semester` `chk_year` | ☑ on the matching period, ☐ on the others | | | |

The "previous" columns always mean the **previous period of the same type**: the previous month, quarter, semester or year.

## Calculation rules for multi-month periods (Claude Code must follow these)
- **Active licensee:** a licence that was valid on at least one day of the period. `active_licensees` counts licensees.
- **Submitted:** the licensee submitted **every** monthly report due in the period.
- **On time:** every one of those reports was on time.
- **Late:** at least one report was late.
- **Not submitted:** at least one monthly report is missing.
- The `sub_*_mi` / `sub_*_r` columns split these counts by licence type.
- **Activity counts** (`<cat>_m/_i/_r/_passed/_failed/_pending`): sums over all accepted or submitted Annex 8 reports in the period. Where an amendment exists, use its latest version.
- **Pending** and **backlog** figures are taken at the last day of the period.
- `<cat>_ytd`: from 1 January to the end of the period. For an annual report this equals the period total.
- **Change columns:** `((current − previous) ÷ previous) × 100`. Use "+x.x pt" for rates, and «ថ្មី» when the previous value is 0.
- **Numbers:** Arabic numerals in tables. Tags ending in `_kh` use Khmer numerals; these appear in the cover memo.

## Tag reference
- **Memo:** `letter_no` `period_label_kh` `annex8_months_kh` `active_licensees_kh` `submitted_count_kh` `submission_rate_kh` `on_time_count_kh` `late_count_kh` `not_submitted_count_kh` `period_word_kh` `total_m_kh` `total_i_kh` `total_r_kh` `verified_count_kh` `total_passed_kh` `pass_rate_kh` `total_failed_kh` `total_pending_kh` `lunar_date_line` `signed_day_kh` `signed_month_kh` `signed_year_kh` `head_name`
- **Title:** `chk_month` `chk_quarter` `chk_semester` `chk_year` `period_range_kh` `data_as_of_kh`
- **1.1 KPI table:** `kpi_<key>_cur|prev|chg`, where `<key>` = `active` `sub_rate` `ontime_rate` `mi` `repairs` `pass_rate` `backlog` `backlog30` `seals` `complaints` `expiring90`
- **2 Submission status:** `sub_<key>_mi|r|total|pct`, where `<key>` = `active` `submitted` `ontime` `late` `nil` `amend` `returned` `notsub`
- **2.1 loop `late_list`:** `no` `name` `licence_no` `type_kh` (ផដ or ជ) `status_kh` `action`
- **3.1 By category:** `<cat>_m|i|r|passed|failed|pending|ytd`, where `<cat>` = `nawi` `weighbridge` `weights` `fuel` `lpg` `elec` `water` `ev` `other`. Plus the rows `total_*`, `prev_*` and `chg_*`.
- **3.2 loop `provinces`:** `no` `province` `installed` `repairs` `total` `main_categories`. Total row: `prov_total_installed` `prov_total_repairs` `prov_total_all`
- **4.1 Backlog:** `backlog_<key>_cur|prev|remark`, where `<key>` = `cleared` `new` `total` `over30`
- **4.2 loop `failed`:** `no` `licensee` `instrument` `serial_no` `province` `cause_action`
- **4.3 loop `seals`:** `no` `licensee` `instrument_serial` `seal_no` `notification_no` `subsequent_verification`
- **5.1 Events:** `ev6_1_count` `ev6_1_summary` … through `ev6_6_*`
- **5.2 Standards and licences:** `std_expired_*` `std_due60_*` `lic_expiring90_*` `out_of_scope_*`, each with the suffix `_count` and `_licensees`
- **5.3 Challenges (paragraph loop):** `challenges[].text`
- **6.1 loop `actions`:** `no` `licensee` `action` `date` `result`
- **6.2 loop `proposals`:** `no` `proposal` `legal_basis`. The ☐ យល់ព្រម / ☐ មិនយល់ព្រម boxes stay in the template for the Director General to tick.
- **7 Conclusion:** `conclusion`
- **Annex 1, loop `licensees`:** `no` `name` `licence_no` `type_kh` `province` `m` `i` `r` `passed` `failed` `pending` `status_kh` `report_no` `remark`. Total row: `lic_total_*`
- **Prepared and reviewed by:** `preparer_name` `preparer_position` `prepared_date_kh` `reviewer_name` `reviewer_position` `reviewed_date_kh`

**Data tables vs. officer-written sections:**
- Data tables (2.1, 3.2, 4.2, 4.3, Annex 1) print «គ្មាន | None» when their list is empty.
- Sections written by officers (5.3, 6.1, 6.2, 7) have no automatic data. When the officer has entered nothing, send 3 blank items or a dotted line so the printout keeps space for handwriting.
- The Director General's decision box («មតិ និងការសម្រេចរបស់ឯកឧត្តមប្រធាន») has no tags and stays blank for handwriting.

---

## Prompt for Claude Code
```
Add the CONSOLIDATED REPORT (Department of Industrial Metrology → NMC Director General) to MLRS,
generated by FILLING my template – same rules as Annex 8: never modify, restyle or regenerate
the template; code only prepares tag values.

Files (attached):
- Consolidated_template_v1.docx   → public/templates/Consolidated_template_v1.docx
  (copy as is; print SHA-256 and confirm it matches the attached file)
- consolidated-sample-data.json   → src/lib/consolidated/__fixtures__/ (data contract: every key)
- fill-consolidated.js            → docs/consolidated/ (reference only)
- README_Consolidated_template.md → docs/consolidated/ (tag list + calculation rules – follow them)
- Consolidated_sample_filled.docx → docs/consolidated/ (expected output for the sample data)

Build:
1. src/lib/consolidated/buildConsolidatedData.ts – (periodType: MONTH|QUARTER|SEMESTER|YEAR,
   year, index) → data object with exactly the keys of consolidated-sample-data.json, computed
   from Supabase (licences, monthly_reports, entries, events, standards) using the calculation
   rules in the README. Also compute the previous period of the same type for prev/chg columns.
   Do the aggregation in Postgres (SQL view or RPC) for accuracy; never in the browser from
   partial lists.
2. src/lib/consolidated/consolidatedDocx.ts – browser fill with docxtemplater@3.47.4 +
   pizzip@3.1.7 (same pattern as annex8Docx.ts), fetch '/templates/Consolidated_template_v1.docx',
   download as Consolidated_<MONTH|Q|S|Y>_<period>_<date>.docx.
3. NMC staff page «របាយការណ៍សរុប»: choose period type + period → show a preview of the main
   figures → text areas for the officer-written parts (5.3 challenges, 6.1 actions,
   6.2 proposals, 7 conclusion, letter no., head name) saved per period in a new table
   consolidated_reports (id, period_type, period_key, officer inputs jsonb, data_snapshot jsonb,
   generated_at, generated_by, status DRAFT|FINAL) → button «បង្កើត Word».
   FINAL freezes data_snapshot so a reprint gives identical numbers.
   Only NMC staff roles may access (RLS).
4. Tests: tag check (template tags = data keys + loop item keys); render the sample data and
   one generated MONTH, SEMESTER and YEAR report into test-output/; verify that 3.1 totals
   equal the sum of the licensees in Annex 1 and that, per category, m+i+r = passed+failed+pending.
5. Show me the SQL/schema plan first and wait for OK before migrations. Do not deploy until I
   check the Word output. If layout looks wrong, tell me – I fix the template in Word.
```
