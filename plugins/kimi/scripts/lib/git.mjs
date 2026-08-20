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

// The diff to review. With a base ref: changes on this branch since the fork
// point (`git diff <base>...HEAD`). Without: all uncommitted changes
// (staged + unstaged, `git diff HEAD`). In a repo with no commits yet there is
// no HEAD, so fall back to staged + unstaged diffs concatenated.
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
