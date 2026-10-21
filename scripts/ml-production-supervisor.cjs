const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directory = path.join(process.env.LOCALAPPDATA, 'MLRS', 'production-ml');
const lock = path.join(directory, 'supervisor.lock');
const logFile = path.join(directory, 'supervisor.log');
function log(message) {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1024 * 1024) {
    fs.copyFileSync(logFile, logFile + '.previous');
    fs.truncateSync(logFile, 0);
  }
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
}
try {
  const fd = fs.openSync(lock, 'wx', 0o600);
  fs.writeFileSync(fd, String(process.pid));
  fs.closeSync(fd);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const owner = Number(fs.readFileSync(lock, 'utf8'));
  if (Number.isSafeInteger(owner) && owner > 0) {
    try { process.kill(owner, 0); process.exit(0); }
    catch (status) { if (status.code !== 'ESRCH') process.exit(0); }
  }
  fs.unlinkSync(lock);
  const fd = fs.openSync(lock, 'wx', 0o600);
  fs.writeFileSync(fd, String(process.pid));
  fs.closeSync(fd);
}
let child;
let stopping = false;
function start() {
  log('Starting production ML worker.');
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/ml-production-worker.ts', '--scheduled'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
  });
  child.on('error', () => log('Worker launch failed.'));
  child.on('close', code => {
    log(`Worker exited with code ${code}; retry in 60 seconds.`);
    if (!stopping) setTimeout(start, 60000);
  });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true;
  if (child) child.kill();
  process.exit(0);
});
process.on('exit', () => {
  if (fs.existsSync(lock) && Number(fs.readFileSync(lock, 'utf8')) === process.pid) fs.unlinkSync(lock);
});
start();
