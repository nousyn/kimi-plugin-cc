# kimi-plugin-cc

A Claude Code plugin that lets you delegate code reviews and tasks from inside Claude Code to your local [Kimi Code CLI](https://www.kimi.com/code) (`kimi`). Inspired by [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc), which does the same for Codex.

The plugin ships a small zero-dependency companion script (`kimi-companion.mjs`) that runs `kimi` non-interactively, tracks each run as a job on disk, and extracts the final answer afterwards. Slash commands wrap the companion so Claude can drive it for you.

## Requirements

- **Kimi Code CLI** installed and logged in (`kimi --version` should work; otherwise install per the official docs and run `kimi login`)
- **Node.js 18.18+** (the companion is plain ESM with no dependencies)
- Claude Code

## Install

From the Claude Code prompt:

```
/plugin marketplace add <path-or-url-to-this-repo>
/plugin install kimi@kimi-plugin-cc
```

Then verify everything works:

```
/kimi:setup
```

## Commands

| Command | What it does |
| --- | --- |
| `/kimi:setup` | Checks `kimi --version` and `kimi doctor`, prints a readiness report |
| `/kimi:review` | Read-only review of uncommitted changes (`git diff HEAD`) |
| `/kimi:adversarial-review` | Read-only review that challenges the design rather than listing bugs |
| `/kimi:rescue` | Hands a task to kimi (write-capable: may modify files) |
| `/kimi:status` | Lists jobs for this repo (id, command, status, pid, duration) |
| `/kimi:result` | Prints the final answer of a finished job |
| `/kimi:cancel` | SIGTERMs a running job |

### Review your uncommitted changes

```
/kimi:review
```

Review a whole branch against its fork point with `main`:

```
/kimi:review --base main
```

Run it detached and pick up the findings later:

```
/kimi:review --background
/kimi:status
/kimi:result
```

Attack a specific concern instead of a general review:

```
/kimi:adversarial-review --base main focus on the retry logic and its failure modes
```

### Delegate a task

```
/kimi:rescue --background find out why the websocket reconnect test flakes and fix it
```

`rescue` is **write-capable**: kimi runs in `-p` mode with auto-approved tool calls, so it can edit files in your repo. Continue the previous rescue session in this repository:

```
/kimi:rescue --resume apply the top fix you suggested
```

(If no previous session exists, it starts fresh and tells you.)

### Pick a model

`--model <alias>` works on `review`, `adversarial-review`, and `rescue`:

```
/kimi:review --model k2
```

## How it works

- Foreground runs (default, or `--wait`) stream kimi's stdout live and also tee it into the job's output file.
- Background runs (`--background`) spawn a detached kimi with `--output-format stream-json`, record the job, and return a job id immediately.
- State lives in `<your-repo>/.kimi-plugin/` (`jobs.json` + `jobs/<id>/output.jsonl`). Add it to your `.gitignore` if you don't want it committed.
- `result` parses the stream-json defensively (line-by-line, skipping malformed lines, taking the last assistant text) and falls back to raw output.
- `status` reconciles reality: a "running" job whose pid is gone is marked finished.
- Because `kimi -p` auto-approves ordinary tool calls, the read-only constraint for reviews is enforced **at the prompt level** — the review prompts explicitly forbid modifying any files.

There is also a `kimi-rescue` subagent the main thread can delegate to; it forwards the task to the companion's `rescue` command, waits or polls for the result, and reports it back.

## Differences from codex-plugin-cc

- **No `transfer` command** — Kimi Code has no session importer that could ingest a Claude Code transcript.
- **No effort levels** — kimi has no reasoning-effort concept; only `--model` selection is exposed.
- **Read-only reviews are prompt-enforced** — `kimi -p` runs with auto permissions and there is no separate sandbox flag, so the review prompts forbid edits instead of relying on CLI-level sandboxing.
- **Structured review output is prompt-enforced too** — codex uses `--output-schema`; kimi has no such flag, so the review prompts ask for a trailing ```json block conforming to `schemas/review-output.schema.json`, and `result` renders it when it parses (falling back to the raw answer otherwise).
- **Simpler runtime** — no app-server or long-lived connection protocol; each command is a plain one-shot `kimi -p` process.

## Development

```
npm test
```

Runs the unit tests for the argument parser, job store, and stream-json result extraction (node:test, no dependencies).
