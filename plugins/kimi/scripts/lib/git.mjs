import { spawnSync } from 'node:child_process';

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

// Repo root for state files and as the working directory for kimi.
// Falls back to cwd outside of a git repository.
export function getRepoRoot(cwd = process.cwd()) {
  const res = git(['rev-parse', '--show-toplevel'], cwd);
  if (res.status === 0 && res.stdout) return res.stdout.trim();
  return cwd;
}

export function getBranch(cwd = process.cwd()) {
  const res = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (res.status === 0 && res.stdout) return res.stdout.trim();
  return null;
}

export function hasHead(cwd) {
  return git(['rev-parse', '--verify', 'HEAD'], cwd).status === 0;
}

// True when the working tree has any changes at all, including untracked
// files (which `git diff` never shows). The plugin's own job-state directory
// (.kimi-plugin/) is excluded — it is not reviewable work.
export function hasWorkingTreeChanges(cwd) {
  const res = git(['status', '--short', '--untracked-files=all'], cwd);
  if (res.status !== 0 || !res.stdout) return false;
  return res.stdout
    .split('\n')
    .some((line) => line.length > 3 && !line.slice(3).startsWith('.kimi-plugin/'));
}

// Validate a base ref before embedding it in the review prompt: kimi executes
// the suggested `git diff <base>...HEAD` through its shell tool, so the ref
// must be plain ref characters with no room for shell metacharacters.
export function isValidRef(ref) {
  return typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref);
}

// The diff to review. With a base ref: changes on this branch since the fork
// point (`git diff <base>...HEAD`). Without: all uncommitted changes
// (staged + unstaged, `git diff HEAD`). In a repo with no commits yet there is
// no HEAD, so fall back to staged + unstaged diffs concatenated.
// Used only as an early-exit emptiness check; kimi gathers the diff itself.
export function getDiff(cwd, base) {
  let args;
  if (base) {
    args = ['diff', `${base}...HEAD`];
  } else if (hasHead(cwd)) {
    args = ['diff', 'HEAD'];
  } else {
    const staged = git(['diff', '--cached'], cwd);
    const unstaged = git(['diff'], cwd);
    return (staged.stdout || '') + (unstaged.stdout || '');
  }
  const res = git(args, cwd);
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(res.stderr || '').trim()}`);
  }
  return res.stdout || '';
}
