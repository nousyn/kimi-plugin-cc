---
name: kimi-cli-runtime
description: Reference for the kimi companion script and Kimi Code CLI flags. Use when running, monitoring, or interpreting kimi review/rescue jobs from Claude Code, or when parsing kimi stream-json output.
user-invocable: false
---

# Kimi CLI runtime

The plugin's entry point is the companion script. Everything goes through it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" <cmd> [args]
```

## Commands

- `setup` — verify `kimi` is installed (`kimi --version`) and healthy (`kimi doctor`).
- `review [--base <ref>] [--background|--wait] [--model <alias>]` — read-only review of `git diff HEAD` (or `<base>...HEAD`). Empty diff exits cleanly.
- `adversarial-review [same flags] [focus text...]` — read-only design-challenging review; trailing text is the focus.
- `rescue [--background|--wait] [--model <alias>] [--fresh|--resume] <task...>` — write-capable task delegation. `--resume` continues the last rescue session in this repo via `kimi --session <id>`; falls back to fresh when none exists. Free text is parsed flags-first: after the first non-flag word, everything (including `--tokens`) is task text.
- `status [jobId]` — job table (id, command, status, pid, started, duration). Reconciles dead pids.
- `result [jobId]` — final assistant text of a finished job (default: latest finished). Prints a `kimi --session <id>` continuation hint when a session id is known.
- `cancel [jobId]` — SIGTERM a running job (default: latest running) and mark it cancelled.

## Execution model

- Foreground (`--wait`, default): kimi stdout streams live to the terminal in plain text and is tee'd into the job's output file; stderr (thinking/progress, and the "resume this session" hint) streams live too and is tee'd into a separate `stderr.log`. Exit status becomes the job status.
- Background (`--background`): detached child (its own process group, so `cancel` signals the whole group), stdout/stderr redirected to separate files, always with `--output-format stream-json` on stdout so `result` can parse it. The command returns a job id immediately.

State lives in `<repoRoot>/.kimi-plugin/`: `jobs.json` plus `jobs/<id>/{output.jsonl,stderr.log}`. Job ids look like `task-<base36-timestamp>-<4 random chars>`. Finished jobs are pruned beyond the newest 50 (running jobs are never pruned).

## Kimi CLI flags that matter

- `kimi -p "<prompt>"` — non-interactive run. Assistant text on stdout, thinking/progress on stderr.
- `-p` mode defaults to auto permission: ordinary tool calls are auto-approved. Read-only reviews are enforced at the prompt level, not by the CLI.
- `--output-format stream-json` — one JSON object per line on stdout (assistant messages, tool calls, tool results).
- `--session <id>` — resume a previous session; combines with `-p`.
- `-m <alias>` — select a model alias.
- `kimi --version`, `kimi doctor`, `kimi login` — install/health/auth.

## Parsing stream-json results

The stream-json schema is not documented field-by-field, so parse defensively (this is what `result` does):

1. Parse each line independently; skip lines that fail `JSON.parse`.
2. Look for assistant text in common shapes: `type === "assistant"`, `role === "assistant"`, `message.content`, or a `content` array of blocks with `text` fields.
3. Take the last non-empty assistant text as the final answer.
4. If no assistant text is found, fall back to the raw output as-is (foreground runs record plain text, not JSON).
5. Session ids, when present, appear as `session_id` / `sessionId` / `session.id` on some stream-json line; in plain-text output, kimi prints a `To resume this session: kimi -r <id>` hint (usually on stderr). Grab the first match.
