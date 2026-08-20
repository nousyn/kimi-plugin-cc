#!/usr/bin/env node
// Sync the plugin version across the manifests Claude Code actually reads:
//   plugins/kimi/.claude-plugin/plugin.json -> version
//   .claude-plugin/marketplace.json         -> metadata.version, plugins[kimi-code].version
//
// package.json deliberately has no version field (private, never published)
// and there is no package-lock.json (zero dependencies), so these three
// fields are the whole truth.
//
// Usage:
//   node scripts/bump-version.mjs <version>   set all three fields
//   node scripts/bump-version.mjs --check     verify all three match plugin.json
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function pluginEntry(json) {
  const entry = json.plugins?.find((p) => p?.name === 'kimi-code');
  if (!entry) throw new Error('.claude-plugin/marketplace.json has no plugins entry named "kimi-code"');
  return entry;
}

// One entry per version field. file paths are relative to the repo root.
function fields(root) {
  return [
    {
      file: 'plugins/kimi/.claude-plugin/plugin.json',
      label: 'version',
      get: (j) => j.version,
      set: (j, v) => {
        j.version = v;
      },
    },
    {
      file: '.claude-plugin/marketplace.json',
      label: 'metadata.version',
      get: (j) => j.metadata?.version,
      set: (j, v) => {
        if (!j.metadata || typeof j.metadata !== 'object') throw new Error('marketplace.json has no metadata object');
        j.metadata.version = v;
      },
    },
    {
      file: '.claude-plugin/marketplace.json',
      label: 'plugins[kimi-code].version',
      get: (j) => pluginEntry(j).version,
      set: (j, v) => {
        pluginEntry(j).version = v;
      },
    },
  ].map((f) => ({ ...f, path: path.join(root, f.file) }));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, json) {
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

export function checkVersions(root, expected) {
  const mismatches = [];
  for (const f of fields(root)) {
    const actual = f.get(readJson(f.path));
    if (actual !== expected) {
      mismatches.push(`${f.file} ${f.label}: expected ${expected}, found ${actual ?? '(missing)'}`);
    }
  }
  return mismatches;
}

export function bumpVersion(root, version) {
  if (!SEMVER.test(version)) {
    throw new Error(`Expected a semver-like version such as 1.0.3, got: ${version}`);
  }
  const changed = [];
  for (const file of [...new Set(fields(root).map((f) => f.path))]) {
    const json = readJson(file);
    const before = JSON.stringify(json);
    for (const f of fields(root).filter((f) => f.path === file)) f.set(json, version);
    if (JSON.stringify(json) !== before) {
      writeJson(file, json);
      changed.push(path.relative(root, file));
    }
  }
  return changed;
}

function main(argv) {
  const check = argv.includes('--check');
  const version = argv.find((a) => !a.startsWith('-'));

  if (check) {
    const expected = version ?? readJson(path.join(process.cwd(), 'plugins/kimi/.claude-plugin/plugin.json')).version;
    const mismatches = checkVersions(process.cwd(), expected);
    if (mismatches.length) {
      console.error(`Version metadata is out of sync:\n${mismatches.join('\n')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`All version metadata matches ${expected}.`);
    return;
  }

  if (!version) {
    console.error('Usage: node scripts/bump-version.mjs <version> | --check [version]');
    process.exitCode = 1;
    return;
  }
  const changed = bumpVersion(process.cwd(), version);
  console.log(`Set version metadata to ${version}: ${changed.length ? changed.join(', ') : 'no files changed'}.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
