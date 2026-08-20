---
description: Run a read-only adversarial Kimi review that challenges the design of local git changes
argument-hint: "[--base <ref>] [--background|--wait] [--model <alias>] [what to focus the attack on]"
allowed-tools: Bash(node *)
---

Run an adversarial Kimi review through the companion script. Unlike `/kimi:review`, this review challenges assumptions, tradeoffs, and failure modes instead of listing bugs.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only. The review runs against the Kimi Code CLI in `-p` mode, which auto-approves ordinary tool calls, so the read-only constraint is enforced at the prompt level.
- Do not fix issues or apply patches. Your only job is to run the review and return Kimi's output verbatim.

Behavior:
- Any free text after the flags is passed to Kimi as the focus of the adversarial pass. Preserve it exactly.
- Diff scoping (`--base`), execution mode (`--background` / `--wait`), and `--model` work exactly like `/kimi:review`.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" adversarial-review $ARGUMENTS
```

- Return the command stdout verbatim, exactly as-is. Do not paraphrase or add commentary.
- For background runs, tell the user: "Kimi adversarial review started in the background. Check `/kimi:status` for progress and `/kimi:result` for the findings."
