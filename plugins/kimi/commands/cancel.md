---
description: Cancel a running Kimi companion job
argument-hint: "[jobId]"
allowed-tools: Bash(node *)
---

Cancel a running Kimi companion job.

Raw slash-command arguments:
`$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" cancel $ARGUMENTS
```

- With no argument, the most recently started running job is cancelled.
- The job's process receives SIGTERM and the job is marked cancelled.
- Present the output to the user as-is.
