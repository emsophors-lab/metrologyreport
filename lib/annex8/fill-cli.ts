/**
 * CLI for filling the official Annex 8 template by hand — the reference
 * file's command line, kept working in this ESM project:
 *
 *   npx tsx lib/annex8/fill-cli.ts templates/Annex8_template_v1.docx lib/annex8/sample-payload.json out.docx
 *
 * It reports any tag in the template that buildAnnex8Data has no value for,
 * then writes the filled document.
 */
import fs from 'fs';
import { LOOP_ITEM_KEYS, buildAnnex8Data, listTags, renderAnnex8 } from './fill-annex8';

const [tpl, json, out] = process.argv.slice(2);
if (!tpl || !json || !out) {
  console.error('Usage: fill-cli.ts <template.docx> <payload.json> <out.docx>');
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(json, 'utf8'));
const data = buildAnnex8Data(payload.report, payload.extra);
const buf = fs.readFileSync(tpl);

const tags = listTags(buf).map((t) => t.replace(/^[#^/]/, ''));
const missing = [...new Set(tags)].filter((t) => !(t in data) && !LOOP_ITEM_KEYS.includes(t));
if (missing.length) console.warn('Tags with no data:', missing);

fs.writeFileSync(out, renderAnnex8(buf, data));
console.log('Written', out);
