---
description: Check that the Kimi Code CLI is installed, authenticated, and ready
argument-hint: ""
allowed-tools: Bash(node *)
---

Run the Kimi companion setup check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" setup $ARGUMENTS
```

- Present the command output to the user verbatim.
- If it reports that `kimi` is missing, tell the user to install the Kimi Code CLI per the official docs, run `kimi login`, and then re-run `/kimi:setup`.
