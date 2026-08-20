import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../plugins/kimi/scripts/lib/args.mjs';

test('parses boolean flags', () => {
  const { flags, positionals } = parseArgs(['--background', '--wait']);
  assert.equal(flags.background, true);
  assert.equal(flags.wait, true);
  assert.deepEqual(positionals, []);
});

test('parses value flags', () => {
  const { flags, positionals } = parseArgs(['--base', 'main', '--model', 'k2'], {
    valueFlags: ['base', 'model'],
  });
  assert.equal(flags.base, 'main');
  assert.equal(flags.model, 'k2');
  assert.deepEqual(positionals, []);
});

test('unknown flags are boolean and do not swallow positionals', () => {
  const { flags, positionals } = parseArgs(['--background', 'fix', 'the', 'bug'], {
    valueFlags: ['base'],
  });
  assert.equal(flags.background, true);
  assert.deepEqual(positionals, ['fix', 'the', 'bug']);
});

test('mixed flags and positionals', () => {
  const { flags, positionals } = parseArgs(['--resume', '--model', 'k2', 'apply', 'the', 'fix'], {
    valueFlags: ['model'],
  });
  assert.equal(flags.resume, true);
  assert.equal(flags.model, 'k2');
  assert.deepEqual(positionals, ['apply', 'the', 'fix']);
});

test('missing value for a value flag throws', () => {
  assert.throws(() => parseArgs(['--base'], { valueFlags: ['base'] }), /requires a value/);
  assert.throws(() => parseArgs(['--base', '--wait'], { valueFlags: ['base'] }), /requires a value/);
});

test('empty argv', () => {
  const { flags, positionals } = parseArgs([]);
  assert.deepEqual(flags, {});
  assert.deepEqual(positionals, []);
});
