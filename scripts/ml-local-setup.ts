import 'dotenv/config';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { createMysqlClient } from '../src/db/mysqlClient';
import { collectDataset } from '../src/ml/dataset';
import { LifecycleStore } from '../src/ml/lifecycle';

const url = new URL(process.env.MYSQL_URL || '');
if (process.env.DB_DRIVER !== 'mysql' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('This setup script only supports the configured loopback MySQL database.');
}
if (process.argv.includes('--migrate')) {
  const connection = await mysql.createConnection(url.toString());
  try {
    const sql = await fs.readFile('mysql_ml_lifecycle.sql', 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await connection.query(statement);
    console.log('Additive local ML migration applied; operational records unchanged.');
  } finally { await connection.end(); }
}
const db = createMysqlClient(url.toString());
try {
  const { state } = await new LifecycleStore(db).read();
  const dataset = await collectDataset(db);
  const known = new Set(state.active?.reportIds || []);
  console.log(JSON.stringify({ enabled: process.env.ML_LIFECYCLE_ENABLED === 'true',
    workerOnline: !!state.workerSeenAt && Date.now() - state.workerSeenAt < 180000,
    workerSeenAt: state.workerSeenAt ? new Date(state.workerSeenAt).toISOString() : null,
    acceptedReports: dataset.reportIds.length, enterprises: dataset.samples.length,
    pendingReports: dataset.reportIds.filter(id => !known.has(id)).length,
    activeVersion: state.active?.id || null, lastOutcome: state.lastOutcome || null,
    lastError: state.lastError || null }, null, 2));
} finally { await db.end(); }
