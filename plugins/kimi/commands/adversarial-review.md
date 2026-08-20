---
description: Run a read-only adversarial Kimi review that challenges the design of local git changes
argument-hint: "[--base <ref>] [--background|--wait] [--model <alias>] [what to focus the attack on]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(git:*), Bash(wc:*), AskUserQuestion
---

Run an adversarial Kimi review through the companion script. Unlike `/kimi-code:review`, this review challenges assumptions, tradeoffs, and failure modes instead of listing bugs.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only. The review runs against the Kimi Code CLI in `-p` mode, which auto-approves ordinary tool calls, so the read-only constraint is enforced at the prompt level.
- Do not fix issues or apply patches. Your only job is to run the review and return Kimi's output verbatim.

Behavior:
- Any free text after the flags is passed to Kimi as the focus of the adversarial pass. Preserve it exactly.
- Diff scoping (`--base`) and `--model` work exactly like `/kimi-code:review`.

Execution mode rules:
- Treat `--wait`/`--background` as mode flags only when they appear before the first non-flag token — matching the companion's flags-first parsing. A literal flag word inside the focus text is part of the text, not a mode request.
- If the arguments include the `--background` mode flag, do not ask. Run the background flow. (If both flags are given, `--background` wins — that is also how the companion resolves it.)
- If the arguments include the `--wait` mode flag, do not ask. Run the foreground flow.
- Otherwise, estimate the review size before asking:
  - For a working-tree review, run `git status --short --untracked-files=all` and `git diff --shortstat HEAD`. Untracked files count as reviewable work — and their size is invisible to `--shortstat`, so `wc -l` any untracked files before judging the review tiny. Ignore anything under `.kimi-plugin/` — it is the plugin's own job state, excluded from review.
  - For a base-branch review, run `git diff --shortstat <base>...HEAD`.
  - Recommend waiting only when the review is clearly tiny — roughly 1-2 files and no sign of a broader directory-sized change. In every other case, including unclear size, recommend background: a foreground run blocks this conversation for the whole review (often minutes).
  - If an estimate command fails (e.g. a repository with no commits yet) or the question cannot be asked, skip the estimate/question and use the background flow — it is non-blocking and recoverable via `/kimi-code:result`.
- Then use `AskUserQuestion` exactly once with two options, putting the recommended option first and suffixing its label with `(Recommended)`:
  - `Wait for results`
  - `Run in background`

Argument handling:
- Pass the user's arguments through as individual tokens, exactly as given. Never wrap them in one quoted string — the companion parses argv token by token, and a single quoted blob becomes one meaningless positional.
- Flags are parsed flags-first: anything after the first non-flag word is focus text, so `--background` added by the background flow must go before all flags and text, never appended at the end.
- Do not strip `--wait` or `--background`; the companion parses both. Do not weaken or rewrite the user's focus text.

Foreground flow:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" adversarial-review $ARGUMENTS
```

- Return the command stdout verbatim, exactly as-is. Do not paraphrase or add commentary.
- Do not fix any issues mentioned in the review output.

Background flow:
- Run the same command with `--background` prepended to the arguments (the companion detaches the kimi process and returns a job id immediately):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/kimi-companion.mjs" adversarial-review --background $ARGUMENTS
```

- Relay the job id, then tell the user: "Kimi adversarial review started in the background. Check `/kimi-code:status` for progress and `/kimi-code:result` for the findings."
- Do not poll for completion in this turn.
