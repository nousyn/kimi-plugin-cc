import fs from 'node:fs';
import path from 'node:path';

// All plugin state lives in <repoRoot>/.kimi-plugin/:
//   jobs.json                  -- job records
//   jobs/<id>/output.jsonl     -- captured kimi output for that job
export function stateDir(repoRoot) {
  return path.join(repoRoot, '.kimi-plugin');
}

export function jobsFile(repoRoot) {
  return path.join(stateDir(repoRoot), 'jobs.json');
}

export function makeJobId(now = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `task-${now.toString(36)}-${rand}`;
}

function load(repoRoot) {
  const file = jobsFile(repoRoot);
  if (!fs.existsSync(file)) return { jobs: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.jobs)) throw new Error('unexpected shape');
    return data;
  } catch {
    // Corrupt jobs.json: move it aside and start over instead of crashing.
    fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    return { jobs: [] };
  }
}

function save(repoRoot, data) {
  fs.mkdirSync(stateDir(repoRoot), { recursive: true });
  fs.writeFileSync(jobsFile(repoRoot), JSON.stringify(data, null, 2) + '\n');
}

export function createJob(repoRoot, fields = {}) {
  const data = load(repoRoot);
  const job = {
    id: makeJobId(),
    cmd: 'unknown',
    status: 'running',
    pid: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    sessionId: null,
    ...fields,
  };
  job.outputFile = path.join(stateDir(repoRoot), 'jobs', job.id, 'output.jsonl');
  fs.mkdirSync(path.dirname(job.outputFile), { recursive: true });
  data.jobs.push(job);
  save(repoRoot, data);
  return job;
}

// Newest first.
export function listJobs(repoRoot) {
  return load(repoRoot)
    .jobs.slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function getJob(repoRoot, id) {
  return load(repoRoot).jobs.find((j) => j.id === id) || null;
}

export function updateJob(repoRoot, id, patch) {
  const data = load(repoRoot);
  const job = data.jobs.find((j) => j.id === id);
  if (!job) return null;
  Object.assign(job, patch);
  save(repoRoot, data);
  return job;
}

// Signal 0 only checks existence/permission, it does not signal the process.
export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}
