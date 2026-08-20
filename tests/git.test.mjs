import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { hasWorkingTreeChanges, isValidRef } from '../plugins/kimi/scripts/lib/git.mjs';

test('isValidRef accepts ordinary refs', () => {
  for (const ref of ['main', 'HEAD', 'v1.2.3', 'feature/foo-bar', 'user/name.branch']) {
    assert.equal(isValidRef(ref), true, ref);
  }
});

test('isValidRef rejects shell metacharacters and odd shapes', () => {
  for (const ref of ['', 'main; rm -rf /', '$(whoami)', '`id`', 'main && x', '-x', 'a b', "a'b"]) {
    assert.equal(isValidRef(ref), false, JSON.stringify(ref));
  }
});

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-git-test-'));
  const run = (args) => spawnSync('git', args, { cwd: dir });
  run(['init', '-q']);
  return dir;
}

test('hasWorkingTreeChanges ignores the plugin state directory', () => {
  const dir = makeRepo();
  try {
    assert.equal(hasWorkingTreeChanges(dir), false);
    fs.mkdirSync(path.join(dir, '.kimi-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.kimi-plugin', 'jobs.json'), '{}');
    assert.equal(hasWorkingTreeChanges(dir), false, 'only .kimi-plugin present');
    fs.writeFileSync(path.join(dir, 'real-change.txt'), 'x');
    assert.equal(hasWorkingTreeChanges(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
