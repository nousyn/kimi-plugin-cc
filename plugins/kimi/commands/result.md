---
description: Print the final answer of a finished Kimi companion job
argument-hint: "[jobId]"
allowed-tools: Bash(node *)
---

Fetch the result of a Kimi companion job.

Raw slash-command arguments:
`$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" result $ARGUMENTS
```

- With no argument, the most recently finished job is used.
- The script extracts the final assistant text from the job's recorded output and prints it. When a kimi session id is known, it also prints how to continue that session with `kimi --session <id>`.
- Present the output to the user verbatim. Do not summarize it.
