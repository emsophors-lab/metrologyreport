import fs from 'node:fs';
import { dataProblems } from '../src/lib/consolidated/contract';
import { templateDataProblems, templateTags } from '../src/lib/consolidated/templateContract';

const template = fs.readFileSync('public/templates/Consolidated_template_v1.docx');
const sample = JSON.parse(fs.readFileSync('src/lib/consolidated/__fixtures__/consolidated-sample-data.json', 'utf8'));
try {
  // Owner confirmed the department head is already printed in the official form.
  const problems = [...dataProblems(sample), ...templateDataProblems(templateTags(template), sample)
    .filter(problem => problem !== 'Unused template value: head_name')];
  if (problems.length) {
    console.error('Consolidated template contract mismatch:\n' + problems.join('\n'));
    console.error('The official template and sample were preserved. Report the mismatch to the owner.');
    process.exitCode = 1;
  } else console.log('PASS: template contract. Static department-head name accepted by owner; head_name is intentionally unused.');
} catch (err: any) {
  console.error('Invalid template structure:', err.properties?.errors || err.message);
  process.exitCode = 1;
}
