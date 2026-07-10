# Architecture Watch Items

Findings from Graphify structural traces worth tracking over time. Status is
WATCH (a risk to check before touching related code), GAP (a confirmed
functional gap with a known fix, not yet applied), or RESOLVED. Add a new
entry each time a trace surfaces something like this. Update entries in place
rather than duplicating.

## B-002 (Token Usage Dashboard) doesn't capture chat tokens

**Date:** 2026-07-10
**Status:** RESOLVED (2026-07-10)
**Source:** Graphify trace of "Token Usage Dashboard (B-002)" vs Run 3's Admin Spend View

B-002 was ~80% done by accident. supabase/functions/chat/index.ts wrote
token_count onto messages rows (lines 350, 366) but never called
recordModelUsage() in _shared/usage.ts — confirmed via grep, zero
model_usage references in the chat function. Every coaching-chat Claude call
was invisible to the admin-spend Edge Function / Spend tab, which only
aggregates model_usage.

**Fix applied:** chat now calls recordModelUsage() with call_type: 'chat'
after the assistant message is persisted — one insert, zero UI work, Spend
tab picks it up automatically. Required adding "chat" to the CallType union
and DEFAULT_MODEL_ROUTES in _shared/models.ts (chat itself still hardcodes
its own model constant rather than calling getModelFor). New model_usage
writes inherit the existing model !~* '(fable|mythos)' CHECK constraint for
free. See docs/qa/2026-07-10-demo-readiness-rag-threshold-b002-copy-textarea.md.
This also unblocks B-003 (rate limiting), which the roadmap explicitly treats
B-002 as the monitoring foundation for.

**Also flagged, not yet traced:** the graph separately surfaced "Ada
Remembers You" (roadmap, cross-session memory via RAG) as semantically
similar to Run 2's product-memory.ts — same overlap pattern as B-002.
Worth a /graphify trace before assuming that roadmap item is still open.
