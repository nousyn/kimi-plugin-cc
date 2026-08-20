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

// Foreground run: stream stdout to the terminal and tee it into outputFile so
// `result` can read it later. stderr (thinking/progress) goes straight to the
// terminal. Returns the child pid immediately plus a promise for the exit code.
export function runForeground(args, { cwd, outputFile }) {
  const out = fs.createWriteStream(outputFile);
  const child = spawn('kimi', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    out.write(chunk);
  });
  const done = new Promise((resolve) => {
    child.on('error', (err) => resolve({ code: 1, error: err }));
    child.on('close', (code) => resolve({ code: code ?? 1 }));
  });
  done.then(() => out.end());
  return { pid: child.pid, done };
}

// Background run: detached child with stdout/stderr redirected to outputFile.
// The caller records the pid and returns immediately.
export function runBackground(args, { cwd, outputFile }) {
  const fd = fs.openSync(outputFile, 'a');
  const child = spawn('kimi', args, { cwd, detached: true, stdio: ['ignore', fd, fd] });
  child.on('error', () => {}); // caller preflights `kimi --version`; avoid unhandled error
  child.unref();
  fs.closeSync(fd); // the child holds its own copy of the fd
  return { pid: child.pid };
}
