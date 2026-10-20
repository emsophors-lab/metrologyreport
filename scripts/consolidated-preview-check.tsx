import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConsolidatedReportPreview from '../src/components/ConsolidatedReportPreview';
import sample from '../src/lib/consolidated/__fixtures__/consolidated-sample-data.json';
import type { ConsolidatedData } from '../src/lib/consolidated/contract';
import { reportingPeriod, previousPeriod } from '../src/lib/consolidated/periods';

const period = reportingPeriod('SEMESTER', 2026, 1);
const data = structuredClone(sample) as ConsolidatedData;
data.preparer_name = 'PREPARER <script>alert(1)</script>';
data.reviewer_name = 'REVIEWER';
data.actions = [{ no: 1, licensee: 'ACTION_COMPANY', action: 'FOLLOW_UP', date: '2026-04-12', result: 'CONTACTED' }];
data.proposals = [{ no: 1, proposal: 'PROPOSE_FOLLOW_UP', legal_basis: 'BASIS' }];
const html = renderToStaticMarkup(React.createElement(ConsolidatedReportPreview, { preview: {
  period, previous: previousPeriod(period), data, source: 'mysql', data_as_of: '2026-10-20T00:00:00Z', warnings: [],
} }));
for (const text of ['ACTION_COMPANY', 'FOLLOW_UP', 'CONTACTED', 'PROPOSE_FOLLOW_UP', 'BASIS', 'REVIEWER', 'មិនទាន់បានអនុម័ត', String(data.conclusion)]) {
  assert.ok(html.includes(text), `Missing preview content: ${text}`);
}
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(!html.includes('<script>'));
assert.ok(html.includes('overflow-x-auto'));
assert.equal((html.match(/<table /g) || []).length, 12);
console.log('PASS: consolidated preview includes tables, officer inputs, narrative, draft status and escaped content.');
