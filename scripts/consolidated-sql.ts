import fs from 'node:fs';
import assert from 'node:assert/strict';
import { consolidatedMigrationSql } from '../src/lib/consolidated/migrationSql';
const file = 'supabase_consolidated_preview.sql';
const sql = consolidatedMigrationSql();
if (process.argv.includes('--write')) fs.writeFileSync(file,sql);
else assert.equal(fs.readFileSync(file,'utf8'),sql,'Generated RPC SQL has drifted');
console.log('Consolidated PostgreSQL RPC SQL ' + (process.argv.includes('--write') ? 'generated, not applied.' : 'matches generator.'));
