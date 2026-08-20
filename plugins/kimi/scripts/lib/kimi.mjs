import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Build the argv for a non-interactive kimi run.
// Always uses -p mode; never goes through a shell.
export function buildKimiArgs({ prompt, outputFormat = null, sessionId = null, model = null }) {
  const args = ['-p', prompt];
  if (outputFormat) args.push('--output-format', outputFormat);
  if (sessionId) args.push('--session', sessionId);
  if (model) args.push('-m', model);
  return args;
}

// Foreground run: stream stdout and stderr to the terminal and tee each into
// its own file. stderr is captured too because kimi prints the "resume this
// session" hint there, which is the only way foreground runs get a session id.
// Returns the child pid immediately plus a promise for the exit code.
export function runForeground(args, { cwd, outputFile, stderrFile }) {
  const out = fs.createWriteStream(outputFile);
  const err = fs.createWriteStream(stderrFile);
  const child = spawn('kimi', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    out.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    err.write(chunk);
  });
  const done = new Promise((resolve) => {
    child.on('error', (err_) => resolve({ code: 1, error: err_ }));
    child.on('close', (code) => resolve({ code: code ?? 1 }));
  });
  done.then(() => {
    out.end();
    err.end();
  });
  return { pid: child.pid, done };
}

// Background run: detached child with stdout/stderr redirected to separate
// files. The caller records the pid and returns immediately.
export function runBackground(args, { cwd, outputFile, stderrFile }) {
  const outFd = fs.openSync(outputFile, 'a');
  const errFd = fs.openSync(stderrFile, 'a');
  const child = spawn('kimi', args, { cwd, detached: true, stdio: ['ignore', outFd, errFd] });
  child.on('error', () => {}); // caller preflights `kimi --version`; avoid unhandled error
  child.unref();
  fs.closeSync(outFd); // the child holds its own copy of the fds
  fs.closeSync(errFd);
  return { pid: child.pid };
}
