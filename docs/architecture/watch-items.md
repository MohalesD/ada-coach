# Architecture Watch Items

Findings from Graphify structural traces worth tracking over time. Status is
WATCH (a risk to check before touching related code), GAP (a confirmed
functional gap with a known fix, not yet applied), or RESOLVED. Add a new
entry each time a trace surfaces something like this. Update entries in place
rather than duplicating.

## B-002 (Token Usage Dashboard) doesn't capture chat tokens

**Date:** 2026-07-10
**Status:** GAP
**Source:** Graphify trace of "Token Usage Dashboard (B-002)" vs Run 3's Admin Spend View

B-002 is ~80% done by accident. supabase/functions/chat/index.ts writes
token_count onto messages rows (lines 350, 366) but never calls
recordModelUsage() in _shared/usage.ts — confirmed via grep, zero
model_usage references in the chat function. Every coaching-chat Claude call
is invisible to the admin-spend Edge Function / Spend tab, which only
aggregates model_usage.

**Fix (small):** have chat call recordModelUsage() with call_type: 'chat' —
one insert, zero UI work, Spend tab picks it up automatically. This also
unblocks B-003 (rate limiting), which the roadmap explicitly treats B-002 as
the monitoring foundation for. New model_usage writes inherit the existing
model !~* '(fable|mythos)' CHECK constraint for free.

**Also flagged, not yet traced:** the graph separately surfaced "Ada
Remembers You" (roadmap, cross-session memory via RAG) as semantically
similar to Run 2's product-memory.ts — same overlap pattern as B-002.
Worth a /graphify trace before assuming that roadmap item is still open.
