# QA: Graphify install + B-002 gap finding

**Date:** 2026-07-10
**Task:** Wire graphify into Claude Code sessions; log the B-002 chat-token gap surfaced by a graph trace.
**Commits:** `97eca7f` (infra), `67c2bf8` (finding)

## Files changed

- `CLAUDE.md` — new "Search precedence for codebase questions" section (graph first, codebase-memory-mcp second, grep only for literal lookups) + the `## graphify` section written by `graphify claude install`, with a note that graphify must be invoked via `$(cat graphify-out/.graphify_python) -m graphify` since no binary is on PATH.
- `.claude/settings.json` — two new PreToolUse hooks (`graphify hook-guard search` on Bash, `graphify hook-guard read` on Read/Glob), both rewritten to call the pinned Python interpreter with `-m graphify` because bare `graphify` is not on PATH. Existing auto-format and brand-voice-guard hooks preserved.
- `docs/architecture/watch-items.md` — new file. Header defines WATCH / GAP / RESOLVED statuses; first entry logs the B-002 gap: `chat/index.ts` writes `messages.token_count` but never calls `recordModelUsage()`, so coaching-chat Claude calls are invisible to the admin-spend Spend tab. Known fix: one `recordModelUsage()` call with `call_type: 'chat'`.

Also installed (not committed — lives in `.git/hooks/`, per-clone): post-commit and post-checkout hooks that trigger a detached AST-only graph rebuild.

## Logic in one sentence

Make the knowledge graph the enforced first stop for structural codebase questions, and record the first actionable finding that workflow produced (B-002's missing chat-token wiring) as a tracked GAP.

## Quiz

**Q:** If a future session greps for a function's callers without querying the graph first, what actually stops it — the CLAUDE.md rule or the settings hook?

**A:** The hook. The PreToolUse guard on Bash injects a mandatory reminder at tool-call time regardless of whether the session absorbed the CLAUDE.md rule — instruction sets the norm, hook enforces it. **Pass.**
