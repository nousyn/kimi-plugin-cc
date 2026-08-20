import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bumpVersion, checkVersions } from '../scripts/bump-version.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-bump-test-'));
  fs.mkdirSync(path.join(root, 'plugins/kimi/.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'plugins/kimi/.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'kimi-code', version: '0.1.0', description: 'x' }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(root, '.claude-plugin/marketplace.json'),
    JSON.stringify(
      {
        name: 'kimi-plugin-cc',
        metadata: { version: '0.1.0' },
        plugins: [{ name: 'kimi-code', version: '0.1.0', source: './plugins/kimi' }],
      },
      null,
      2,
    ) + '\n',
  );
  return root;
}

test('bumpVersion sets all three fields', () => {
  const root = makeRoot();
  try {
    const changed = bumpVersion(root, '1.2.3');
    assert.equal(changed.length, 2);
    assert.deepEqual(checkVersions(root, '1.2.3'), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('checkVersions reports the drifting field', () => {
  const root = makeRoot();
  try {
    const file = path.join(root, '.claude-plugin/marketplace.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.plugins[0].version = '0.2.0';
    fs.writeFileSync(file, JSON.stringify(json));
    const mismatches = checkVersions(root, '0.1.0');
    assert.equal(mismatches.length, 1);
    assert.match(mismatches[0], /plugins\[kimi-code\]\.version: expected 0\.1\.0, found 0\.2\.0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bumpVersion rejects non-semver input', () => {
  const root = makeRoot();
  try {
    assert.throws(() => bumpVersion(root, 'latest'), /semver/);
    assert.throws(() => bumpVersion(root, '1.0'), /semver/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bumpVersion is a no-op when everything already matches', () => {
  const root = makeRoot();
  try {
    assert.deepEqual(bumpVersion(root, '0.1.0'), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
