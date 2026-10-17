# Annex 8 official template – how the system fills it

## Files
| File | Purpose |
|---|---|
| `templates/Annex8_template_v1.docx` | **Your official template with tags.** Layout, fonts and sizes are exactly yours. |
| `lib/annex8/fill-annex8.ts` | Prepares the data (`buildAnnex8Data`) and fills the template (`renderAnnex8`). Contains no styling. TypeScript port of the reference `fill-annex8.js`; the logic is unchanged. |
| `lib/annex8/sample-payload.json` | Test data: 1 weighbridge with 2 modules, 1 electronic scale, 1 repair with a broken seal. |
| `docs/Annex8_sample_filled.docx` | The result of the test data, for checking. |

## How it runs in MLRS

| | |
|---|---|
| Fill one document by hand | `npm run annex8:fill templates/Annex8_template_v1.docx lib/annex8/sample-payload.json out.docx` |
| Check the template and render the fixtures | `npm run annex8:check` → `test-output/` |
| Download a submitted report | `GET /api/reports/:id/annex8.docx` · `GET /api/reports/:id/annex8.pdf` (owner licensee or NMC staff) |
| Where the files are kept | private Supabase Storage bucket `annex8-reports`, generated once at submission |
| PDF conversion | Gotenberg at `$GOTENBERG_URL`, built from `docker/gotenberg.Dockerfile` with the Khmer fonts in `fonts/` |

`npm run annex8:check` runs two checks. The tag contract compares every tag in
the template against the keys `buildAnnex8Data` produces, failing on a tag with
no value **and** on a value no tag prints. The mapping check renders the sample
payload twice — once directly, once through `loadAnnex8RenderInput` from fake
database rows using the real column names — and requires the two documents to
be identical, which is what catches a column quietly mapped to the wrong field.

## Rules when you edit the template in Word
1. **A tag's formatting is the output's formatting.** If you want a value in a different font or size, select the whole tag, including both braces, and format it.
2. **Never format part of a tag** (for example, bolding only half of it). Never retype a tag by hand while AutoCorrect is on.
3. **Table rows marked `{#instruments}` … `{/instruments}`** are repeated once for each item. Keep exactly one such row.
4. The row `{^instruments}– | គ្មាន | None{/instruments}` prints only when there are no items. Keep it.
5. After editing, save as a new version (`…_v2.docx`). The tag check reports any tag you deleted or misspelled.

## Fields left for hand-filling or NMC use
- **Prakas number and date in «យោង».** Type them directly into the template once the Prakas is signed. They are not tags.
- **NMC box.** The system fills only `{received_date_kh}`, `{report_id}`, and the on-time and late checkboxes. The "complete / to complete" checkboxes and the officer signature remain for NMC staff.
- **Letter number, lunar date, place, and legal representative.** When the system has no value, it prints the original dotted line. Recommended: compute the Khmer lunar date with a lunar-calendar library.

## Tag reference
| Section | Tags |
|---|---|
| Cover letter | `enterprise_name_kh` `letter_no` `period_month_name_kh` `period_year_kh` `licence_no` `licence_valid_day_kh` `licence_valid_month_kh` `licence_valid_year_kh` `decision_no` `decision_day_kh` `decision_month_kh` `decision_year_kh` `period_start_day_kh` `period_end_day_kh` `total_m_kh` `total_i_kh` `total_r_kh` `provinces_kh` `chk_nil` `lunar_date_line` `signed_place_kh` `signed_day_kh` `signed_month_kh` `signed_year_kh` |
| Report header | `period_month_name_kh` `period_year_kh` `period_start_day_kh` `period_end_day_kh` |
| Part 1 | `enterprise_name_kh` `enterprise_name_en` `licence_no` `licence_valid_to_kh` `chk_lt_manuf` `chk_lt_repair` `registration_no` `operating_address` `contact_line` `chk_regular` `chk_nil` `chk_amendment` `original_report_id` |
| Part 2 | `<cat>_m` `<cat>_i` `<cat>_r` `<cat>_passed` `<cat>_failed` `<cat>_pending`, where `<cat>` = `nawi` `weighbridge` `weights` `fuel` `lpg` `elec` `water` `ev` `other`. Also `total_*`, `other_category_label`, `co_total` `co_passed` `co_failed` `co_pending` |
| Part 3 loop `instruments` | `no` `op_code_kh` `instrument_name` `model` `serial_no` `manufacturer_country` `metrology_spec` `type_approval_no` `completion_date` `customer_name` `location` `label_qr_no` `verification_text` |
| Part 3A loop `modules` | `no` `host_serial_no` `part_kh` `module_name` `model` `serial_no` `range_e` `manufacturer` `country` `cert_no` `new_or_replacement_kh` |
| Part 4 loop `repairs` | `no` `instrument_model` `serial_no` `customer_name` `location` `repair_period` `repair_description` `seal_removed_no` `notification_no` `technician` `verification_text` |
| Part 5 loop `standards` | `no` `equipment` `serial_no` `class_range` `cal_cert_no` `lab` `due_date` `status_kh` |
| Part 6 | `e6_1_yes` `e6_1_no` `e6_1_details` … through `e6_6_*` |
| Part 7 and NMC box | `preparer_name` `preparer_position` `signed_place_kh` `signed_day_kh` `signed_month_kh` `signed_year_kh` `legal_rep_name` `received_date_kh` `report_id` `chk_on_time` `chk_late` |

Checkbox tags print ☑ or ☐. Tags ending in `_kh` print Khmer numerals or Khmer month names. Table values use Arabic numerals, as in your template.

---

## Prompt for Claude Code
```
Add official Annex 8 DOCX/PDF generation to MLRS by FILLING my template.

Files (already in the repo):
- templates/Annex8_template_v1.docx  ← official template with docxtemplater tags. Single source
  of truth for layout, fonts, sizes. NEVER modify, restyle or regenerate it in code.
- lib/annex8/fill-annex8.js          ← reference buildAnnex8Data() + renderAnnex8() + listTags().
- lib/annex8/sample-payload.json     ← test fixture.

Tasks:
1. Integrate fill-annex8.js into the codebase (keep logic; convert to TS/ESM if the project uses
   it). Pin docxtemplater@3.47.4 and pizzip@3.1.7 exactly.
2. Build the input for buildAnnex8Data() from the DATABASE (submitted report + licence record:
   decision_no, decision_date, legal_rep_name, report_id, submitted_at, on_time, received_at).
   Part 2 totals are recomputed inside buildAnnex8Data — do not pass client totals.
3. Endpoints (owner licensee or NMC staff only):
   GET /api/reports/:id/annex8.docx  and  GET /api/reports/:id/annex8.pdf
   File name: Annex8_<licence_no>_<YYYY-MM>_<report_id>.(docx|pdf)
4. PDF: convert the filled DOCX with [Gotenberg /forms/libreoffice/convert at $GOTENBERG_URL |
   Microsoft Graph]. For Gotenberg add a Dockerfile that installs the Khmer OS Siemreap and
   Khmer OS Muol Light fonts from ./fonts and runs fc-cache. Generate and store the PDF once at
   submission as the official record; serve the stored file afterwards.
5. Template versioning: reports store template_version ("v1"); render old reports with the
   template version they were submitted with.
6. CI test: listTags(template) must equal the keys produced by buildAnnex8Data (+ loop item
   keys). Fail on any missing or unused tag. Render sample-payload.json, a NIL report, an
   AMENDMENT, and a 40-instrument report into test-output/ for my visual review.
7. If layout looks wrong, DO NOT fix it in code — tell me which tag/section so I edit the template.
```
