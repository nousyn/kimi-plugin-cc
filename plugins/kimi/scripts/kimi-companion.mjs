#!/usr/bin/env node
// kimi-companion: bridge between Claude Code and the Kimi Code CLI.
//
// Usage: node kimi-companion.mjs <cmd> [args]
//   setup                                     check the kimi installation
//   review [--base <ref>] [--background|--wait] [--model <alias>]
//   adversarial-review [--base <ref>] [--background|--wait] [--model <alias>] [focus text...]
//   rescue [--background|--wait] [--model <alias>] [--fresh|--resume] <task text...>
//   status [jobId]
//   result [jobId]
//   cancel [jobId]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseArgs } from './lib/args.mjs';
import * as git from './lib/git.mjs';
import * as kimi from './lib/kimi.mjs';
import * as jobs from './lib/jobs.mjs';
import { extractFinalText, extractSessionId, parseReviewJson, renderJobsTable, renderReview } from './lib/render.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ensureKimi() {
  const res = spawnSync('kimi', ['--version'], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    console.error('Error: `kimi` (Kimi Code CLI) was not found on PATH.');
    console.error('Install it per the official Kimi Code docs (e.g. npm install -g), then run `kimi login`.');
    console.error('Re-run `node kimi-companion.mjs setup` afterwards to verify.');
    return false;
  }
  return true;
}

function readPromptTemplate(name) {
  return fs.readFileSync(path.join(PLUGIN_ROOT, 'prompts', name), 'utf8');
}

// The prompt tells kimi to gather the changes itself (git status + diff), so
// the base ref reaches kimi as a command string inside the prompt, which kimi
// then runs through its shell tool. Callers must validate the ref with
// git.isValidRef first so it cannot smuggle shell metacharacters.
function buildReviewPrompt({ base, focus, adversarial }) {
  const template = readPromptTemplate(adversarial ? 'adversarial-review.md' : 'review.md');
  const schema = fs.readFileSync(path.join(PLUGIN_ROOT, 'schemas', 'review-output.schema.json'), 'utf8').trim();
  return template
    .replace('{{DIFF_COMMAND}}', () => (base ? `git diff ${base}...HEAD` : 'git diff HEAD'))
    .replace('{{FOCUS}}', () => focus || '(no specific focus given — challenge everything)')
    .replace('{{SCHEMA}}', () => schema);
}

// Shared runner for review / adversarial-review / rescue.
async function runJob(repoRoot, { cmd, prompt, background, model, sessionId }) {
  if (!ensureKimi()) return 1;
  const args = kimi.buildKimiArgs({
    prompt,
    outputFormat: background ? 'stream-json' : null,
    sessionId,
    model,
  });
  const job = jobs.createJob(repoRoot, { cmd, sessionId });
  const stdio = { cwd: repoRoot, outputFile: job.outputFile, stderrFile: job.stderrFile };

  if (background) {
    const { pid } = kimi.runBackground(args, stdio);
    jobs.updateJob(repoRoot, job.id, { pid });
    console.log(`Started ${cmd} job in the background.`);
    console.log(`Job ID: ${job.id}`);
    console.log(`Check progress:  node kimi-companion.mjs status ${job.id}`);
    console.log(`Read the result: node kimi-companion.mjs result ${job.id}`);
    return 0;
  }

  const { pid, done } = kimi.runForeground(args, stdio);
  jobs.updateJob(repoRoot, job.id, { pid });
  const { code } = await done;
  jobs.updateJob(repoRoot, job.id, {
    status: code === 0 ? 'completed' : 'failed',
    endedAt: new Date().toISOString(),
    sessionId: jobSessionId(job) ?? sessionId,
  });
  return code;
}

// Session ids show up as a "kimi -r <id>" hint on stderr (foreground text
// runs) or as stream-json fields on stdout (background runs). Check stderr
// first: stdout may quote code under review that merely mentions
// `kimi --session <id>`, which must not win over the real hint.
function jobSessionId(job) {
  for (const file of [job.stderrFile, job.outputFile]) {
    if (file && fs.existsSync(file)) {
      const id = extractSessionId(fs.readFileSync(file, 'utf8'));
      if (id) return id;
    }
  }
  return null;
}

// Reconcile recorded state with reality: a "running" job whose pid is gone has
// finished (we cannot know the exit code, so it becomes "completed"). Also a
// good moment to pick up the kimi session id from stream-json output.
function syncJobs(repoRoot) {
  for (const job of jobs.listJobs(repoRoot)) {
    if (job.status !== 'running') continue;
    if (jobs.pidAlive(job.pid)) continue;
    jobs.updateJob(repoRoot, job.id, {
      status: 'completed',
      endedAt: new Date().toISOString(),
      sessionId: job.sessionId ?? jobSessionId(job),
    });
  }
}

// --- commands ---------------------------------------------------------------

function cmdSetup() {
  console.log('Kimi companion setup check');
  console.log('--------------------------');
  const v = spawnSync('kimi', ['--version'], { encoding: 'utf8' });
  if (v.error || v.status !== 0) {
    console.error('[FAIL] `kimi` was not found on PATH.');
    console.error('       Install Kimi Code CLI per the official docs (e.g. npm install -g),');
    console.error('       then run `kimi login` and re-run this check.');
    return 1;
  }
  console.log(`[ok]   kimi --version: ${(v.stdout || '').trim()}`);

  const d = spawnSync('kimi', ['doctor'], { encoding: 'utf8' });
  if (d.error) {
    console.log(`[warn] kimi doctor could not run: ${d.error.message}`);
  } else {
    const out = ((d.stdout || '') + (d.stderr || '')).trim();
    console.log(`[${d.status === 0 ? 'ok' : 'warn'}]   kimi doctor exited with code ${d.status}`);
    if (out) console.log(out.split('\n').map((l) => `       ${l}`).join('\n'));
  }

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  console.log(`[${nodeMajor >= 18 ? 'ok' : 'warn'}]   node ${process.versions.node}`);
  console.log('Done.');
  return 0;
}

async function cmdReview(argv, adversarial) {
  const { flags, positionals } = parseArgs(argv, { valueFlags: ['base', 'model'], flagsFirst: adversarial });
  if (flags.base && !git.isValidRef(flags.base)) {
    console.error(`Invalid --base ref: ${flags.base}`);
    return 1;
  }
  const repoRoot = git.getRepoRoot();
  // Early exit so an empty review never burns kimi tokens. Branch review is
  // diff-based; working-tree review also counts untracked files via status.
  const hasChanges = flags.base
    ? Boolean(git.getDiff(repoRoot, flags.base).trim())
    : git.hasWorkingTreeChanges(repoRoot);
  if (!hasChanges) {
    const scope = flags.base ? `between ${flags.base}...HEAD` : 'in the working tree';
    console.log(`No changes ${scope} to review. Nothing to do.`);
    return 0;
  }
  const label = adversarial ? 'adversarial-review' : 'review';
  const focus = adversarial ? positionals.join(' ').trim() : '';
  const prompt = buildReviewPrompt({ base: flags.base ?? null, focus, adversarial });
  return runJob(repoRoot, {
    cmd: label,
    prompt,
    background: !!flags.background,
    model: flags.model ?? null,
    sessionId: null,
  });
}

async function cmdRescue(argv) {
  const { flags, positionals } = parseArgs(argv, { valueFlags: ['model'], flagsFirst: true });
  const task = positionals.join(' ').trim();
  if (!task) {
    console.error('Usage: rescue [--background|--wait] [--model <alias>] [--fresh|--resume] <task text...>');
    return 1;
  }
  const repoRoot = git.getRepoRoot();
  let sessionId = null;
  if (flags.resume && !flags.fresh) {
    syncJobs(repoRoot);
    const last = jobs.listJobs(repoRoot).find((j) => j.cmd === 'rescue' && j.sessionId);
    if (last) {
      sessionId = last.sessionId;
      console.error(`Resuming kimi session ${sessionId} from job ${last.id}.`);
    } else {
      console.error('No previous rescue session found for this repository; starting fresh.');
    }
  }
  return runJob(repoRoot, {
    cmd: 'rescue',
    prompt: task,
    background: !!flags.background,
    model: flags.model ?? null,
    sessionId,
  });
}

function cmdStatus(argv) {
  const { positionals } = parseArgs(argv);
  const repoRoot = git.getRepoRoot();
  syncJobs(repoRoot);
  if (positionals[0]) {
    const job = jobs.getJob(repoRoot, positionals[0]);
    if (!job) {
      console.error(`No job with id "${positionals[0]}" in this repository.`);
      return 1;
    }
    console.log(renderJobsTable([job]));
    console.log(`Output file: ${job.outputFile}`);
    return 0;
  }
  console.log(renderJobsTable(jobs.listJobs(repoRoot)));
  return 0;
}

function cmdResult(argv) {
  const { positionals } = parseArgs(argv);
  const repoRoot = git.getRepoRoot();
  syncJobs(repoRoot);
  let job;
  if (positionals[0]) {
    job = jobs.getJob(repoRoot, positionals[0]);
    if (!job) {
      console.error(`No job with id "${positionals[0]}" in this repository.`);
      return 1;
    }
  } else {
    job = jobs.listJobs(repoRoot).find((j) => j.status === 'completed' || j.status === 'failed');
    if (!job) {
      console.error('No finished jobs in this repository yet.');
      return 1;
    }
  }
  if (job.status === 'running') {
    console.error(`Job ${job.id} is still running. Try again later or cancel it.`);
    return 1;
  }
  if (!fs.existsSync(job.outputFile)) {
    console.error(`No output recorded for job ${job.id}.`);
    return 1;
  }
  const raw = fs.readFileSync(job.outputFile, 'utf8');
  const text = extractFinalText(raw);
  // Review jobs are prompted to end with schema-conformant JSON; render it
  // nicely when it parses, otherwise show the raw answer.
  if (job.cmd === 'review' || job.cmd === 'adversarial-review') {
    const review = parseReviewJson(text);
    console.log(review ? renderReview(review) : text);
  } else {
    console.log(text);
  }
  const sid = job.sessionId ?? extractSessionId(raw);
  if (sid) {
    console.log(`\n---\nTo continue this kimi session: kimi --session ${sid}`);
  }
  return 0;
}

function cmdCancel(argv) {
  const { positionals } = parseArgs(argv);
  const repoRoot = git.getRepoRoot();
  syncJobs(repoRoot);
  let job;
  if (positionals[0]) {
    job = jobs.getJob(repoRoot, positionals[0]);
    if (!job) {
      console.error(`No job with id "${positionals[0]}" in this repository.`);
      return 1;
    }
  } else {
    job = jobs.listJobs(repoRoot).find((j) => j.status === 'running');
    if (!job) {
      console.error('No running job to cancel.');
      return 1;
    }
  }
  if (job.status !== 'running') {
    console.error(`Job ${job.id} is not running (status: ${job.status}).`);
    return 1;
  }
  // Background jobs are detached, so the child leads its own process group;
  // signal the group first to avoid leaving orphaned grandchildren.
  try {
    process.kill(-job.pid, 'SIGTERM');
  } catch {
    try {
      process.kill(job.pid, 'SIGTERM');
    } catch (err) {
      if (err.code === 'ESRCH') {
        console.error(`pid ${job.pid} was already gone; marking the job cancelled.`);
      } else {
        console.error(`Could not signal pid ${job.pid}: ${err.message}`);
        return 1;
      }
    }
  }
  jobs.updateJob(repoRoot, job.id, { status: 'cancelled', endedAt: new Date().toISOString() });
  console.log(`Cancelled job ${job.id}.`);
  return 0;
}

// --- dispatch ---------------------------------------------------------------

const USAGE = `Usage: node kimi-companion.mjs <cmd> [args]

Commands:
  setup               Check that the Kimi Code CLI is installed and ready
  review              Read-only review of uncommitted changes (or --base <ref>...HEAD)
  adversarial-review  Read-only review that challenges the design; optional focus text
  rescue              Hand a task to kimi (may modify files); --resume continues the last session
  status [jobId]      List jobs and their state
  result [jobId]      Print the final answer of a finished job (default: latest)
  cancel [jobId]      SIGTERM a running job (default: latest running)

Flags: --background | --wait (foreground, default), --model <alias>, --base <ref>,
       --fresh | --resume (rescue only)
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'setup':
      return cmdSetup();
    case 'review':
      return cmdReview(rest, false);
    case 'adversarial-review':
      return cmdReview(rest, true);
    case 'rescue':
      return cmdRescue(rest);
    case 'status':
      return cmdStatus(rest);
    case 'result':
      return cmdResult(rest);
    case 'cancel':
      return cmdCancel(rest);
    default:
      console.error(cmd ? `Unknown command: ${cmd}\n` : '');
      console.error(USAGE);
      return cmd ? 1 : 0;
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
