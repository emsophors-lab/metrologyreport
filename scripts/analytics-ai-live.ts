/**
 * One real call to the AI analyst agent, to prove the key works.
 *
 *   npm run analytics:ai:live
 *
 * Everything else about the agent is covered by analytics:ai:check, which
 * runs without a key and without a network. This script exists for the one
 * thing that cannot be: whether the configured key, model name and quota
 * actually answer, and whether a real answer survives the guards.
 *
 * It prints the Khmer the agent wrote so it can be read before anyone
 * approves a report with it, and it prints the figures it was given so the
 * two can be compared. It writes nothing to the database.
 *
 * Costs one request to the provider. Needs ANALYTICS_AI_ENABLED=true and
 * GEMINI_API_KEY in .env.
 */
import 'dotenv/config';
import fs from 'node:fs';

import { aiAnalystEnabled, draftWithAiAnalyst, figuresFor } from '../src/analytics/aiAnalyst';
import type { AnalyticsData } from '../src/lib/analytics/contract';
import { NARRATIVE_SCALARS } from '../src/lib/analytics/contract';

if (!aiAnalystEnabled()) {
  console.error('The agent is not configured. In .env set:');
  console.error('  ANALYTICS_AI_ENABLED=true');
  console.error('  GEMINI_API_KEY=<your key>');
  console.error('Without it the report still works — the deterministic drafter words it.');
  process.exit(2);
}

const sample = JSON.parse(
  fs.readFileSync('src/lib/analytics/__fixtures__/analytics-sample-data.json', 'utf8')) as AnalyticsData;

console.log(`Model: ${process.env.ANALYTICS_AI_MODEL || 'gemini-3.8-flash'}`);
console.log('\nFigures sent (no licensee name, licence number or serial):');
console.log(JSON.stringify(figuresFor(sample), null, 1));

const started = Date.now();
const result = await draftWithAiAnalyst(sample);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (result.engine !== 'ai-agent') {
  console.error(`\nNot used after ${seconds}s: ${result.reason}`);
  console.error('The report would be worded by the deterministic drafter instead.');
  process.exit(1);
}

console.log(`\nAccepted after ${seconds}s. Every figure in this text is one we computed.\n`);
for (const key of NARRATIVE_SCALARS) {
  console.log(`--- ${key} ---`);
  console.log(result.narrative![key]);
  console.log();
}
process.exitCode = 0;
