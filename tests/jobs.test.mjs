import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createJob,
  listJobs,
  getJob,
  updateJob,
  pidAlive,
  jobsFile,
  stateDir,
} from '../plugins/kimi/scripts/lib/jobs.mjs';

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-plugin-test-'));
}

test('createJob writes jobs.json and the job output directory', () => {
  const root = tempRepo();
  const job = createJob(root, { cmd: 'review', pid: 1234 });
  assert.match(job.id, /^task-[a-z0-9]+-[a-z0-9]{4}$/);
  assert.equal(job.status, 'running');
  assert.equal(job.cmd, 'review');
  assert.equal(job.pid, 1234);
  assert.ok(fs.existsSync(jobsFile(root)));
  assert.ok(fs.existsSync(path.dirname(job.outputFile)));
  assert.ok(job.outputFile.startsWith(stateDir(root)));
});

test('listJobs returns newest first; getJob finds by id', () => {
  const root = tempRepo();
  const first = createJob(root, { cmd: 'review' });
  // make the second job unambiguously newer
  const second = createJob(root, { cmd: 'rescue', startedAt: new Date(Date.now() + 1000).toISOString() });
  const list = listJobs(root);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, second.id);
  assert.equal(list[1].id, first.id);
  assert.equal(getJob(root, first.id).cmd, 'review');
  assert.equal(getJob(root, 'nope'), null);
});

test('updateJob patches fields and persists', () => {
  const root = tempRepo();
  const job = createJob(root, { cmd: 'review' });
  const updated = updateJob(root, job.id, { status: 'completed', sessionId: 'abc123' });
  assert.equal(updated.status, 'completed');
  assert.equal(getJob(root, job.id).sessionId, 'abc123');
  assert.equal(updateJob(root, 'nope', { status: 'x' }), null);
});

test('corrupt jobs.json is moved aside and rebuilt empty', () => {
  const root = tempRepo();
  fs.mkdirSync(stateDir(root), { recursive: true });
  fs.writeFileSync(jobsFile(root), 'this is not json{');
  const jobs = listJobs(root);
  assert.deepEqual(jobs, []);
  const leftovers = fs.readdirSync(stateDir(root)).filter((f) => f.startsWith('jobs.json.corrupt-'));
  assert.equal(leftovers.length, 1);
  // and the store works again afterwards
  const job = createJob(root, { cmd: 'review' });
  assert.equal(listJobs(root).length, 1);
  assert.equal(getJob(root, job.id).cmd, 'review');
});

test('wrong-shape jobs.json is also treated as corrupt', () => {
  const root = tempRepo();
  fs.mkdirSync(stateDir(root), { recursive: true });
  fs.writeFileSync(jobsFile(root), '{"jobs": "not-an-array"}');
  assert.deepEqual(listJobs(root), []);
});

test('pidAlive detects the current process and rejects null', () => {
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(null), false);
  assert.equal(pidAlive(0), false);
});
