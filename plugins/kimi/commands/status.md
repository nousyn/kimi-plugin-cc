---
description: List Kimi companion jobs for this repository and their state
argument-hint: "[jobId]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Show the status of Kimi companion jobs in this repository.

Raw slash-command arguments:
`$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" status $ARGUMENTS
```

- With no argument, all jobs are listed (id, command, status, pid, start time, duration). A job recorded as running whose process is gone is reconciled to finished automatically.
- With a job id, only that job is shown, including its output file path.
- Present the output to the user as-is.
