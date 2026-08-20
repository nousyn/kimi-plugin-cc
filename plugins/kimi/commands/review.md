---
description: Run a read-only Kimi code review against local git changes
argument-hint: "[--base <ref>] [--background|--wait] [--model <alias>]"
allowed-tools: Bash(node *)
---

Run a Kimi code review through the companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only. The review runs against the Kimi Code CLI in `-p` mode, which auto-approves ordinary tool calls, so the read-only constraint is enforced at the prompt level.
- Do not fix issues, apply patches, or offer to make changes yourself.
- Your only job is to run the review and return Kimi's output verbatim to the user.

Behavior:
- Without `--base`, the review covers all uncommitted changes (staged + unstaged, `git diff HEAD`).
- With `--base <ref>`, the review covers `git diff <ref>...HEAD`.
- `--background` detaches the run and returns a job id; `--wait` (the default) runs in the foreground and streams output live.
- `--model <alias>` selects a kimi model alias.
- If there is nothing to review, the script says so and exits — relay that message.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" review $ARGUMENTS
```

- Return the command stdout verbatim, exactly as-is. Do not paraphrase, summarize, or add commentary before or after it.
- Do not fix any issues mentioned in the review output.
- For background runs, tell the user: "Kimi review started in the background. Check `/kimi:status` for progress and `/kimi:result` for the findings."
- For custom focus text or an adversarial framing, suggest `/kimi:adversarial-review`.
