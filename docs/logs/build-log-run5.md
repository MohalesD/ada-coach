# Build Log — Ada Discovery Coach v3, Run 5: Market Intelligence + Competitive Intelligence

**Branch:** `feat/discovery-platform-run5`
**Date:** 2026-07-05
**Built by:** Claude Fable 5 (build-time only — no production code path calls Fable 5 or any Mythos-tier model)
**Source of truth:** `docs/prds/ada-discovery-coach-v3.md` (RUN 5 section) + `docs/prds/ada-discovery-coach-v3-addendum.md` (JTBD 6–9, endpoints 9–13, Run 5 process diagrams)

This log is written as the run proceeds: what was built, what was decided
and why, and anything that could not be verified. It is converted to DOCX
at the end, same as Runs 1–4.

---

## 1. Session setup and recon

- Read in full before building: the v3 PRD, the v3 addendum, and all
  four prior build logs; then `_shared/auth.ts`, `_shared/models.ts`,
  `_shared/anthropic.ts` (the `callClaudeWithWebSearch` wrapper and its
  bounded pause_turn loop), `_shared/usage.ts`,
  `market-grounding/index.ts` (the Run 2 evidence-enforcement pattern
  to mirror), `report/index.ts`, the `products`, `assumption_evidence`,
  `blind_spots`, `reports`, and `app_settings` migrations, `config.toml`,
  and the frontend surfaces being extended (`App.tsx`, `Discovery.tsx`,
  `discovery-api.ts`, `types/discovery.ts`).
- Loaded `fable5-prompting` (per the CLAUDE.md standing rule for `/goal`
  runs) and its `design-and-voice-philosophy.md` reference before any UI
  work — Locality-First and the microcopy discipline govern the new
  screens; the frontend-design skill is loaded for the visual build as
  the `/goal` requires.
- Project memory confirmed Run 5 was gated on this checkpoint
  invocation ("do not start uninvited" — this `/goal` is the
  invitation), and named the riskiest seam up front: the search-budget
  cap actually holding under a real multi-competitor run.
- Migrations go through the Supabase MCP `apply_migration` tool per the
  documented B-011 workaround; local `.sql` files committed as source
  of truth. Edge Functions deploy via `supabase functions deploy`.

## 2. Decisions and rationale

(recorded as they are made; table grows during the run)

| Decision | Rationale |
|---|---|
| All four new tables use select-own RLS + service-role-only writes (the `reports`/`blind_spots` pattern, i.e. what "owner-only" means in this codebase per the Run 4 log) | Briefs, competitors, and both evidence tables are function-produced artifacts. The PM confirms/removes competitors *through the confirm endpoint*, never by direct table writes — removing the client write path removes citation tampering entirely. |
| Both `_evidence` tables: `source_url text not null` + `CHECK (source_url ~* '^https?://')` | The `/goal`: "a CHECK requiring a real source_url so a fabricated citation is physically unstorable." The DB layer refuses citation-less or non-URL claims; the code layer (Run 2 enforcement, reused verbatim) additionally keeps only URLs the web_search tool actually returned, so a model-invented-but-well-formed URL is dropped before it ever reaches the insert. |
| Gap analysis persists as `products.competitive_gap jsonb` + `gap_generated_at timestamptz`, with `products` INSERT/UPDATE grants tightened to (user_id, name, description) / (name, description) | The addendum says gap output "writes into the product's report snapshot", but reports are session-scoped and a product may have no report yet; the gap view must survive reload. The `/goal` fixes the new-table list at four, so the product-scoped standing artifact lives on `products` — made tamper-proof with the codebase's documented column-grant defense (same pattern as `messages.feedback` and `user_profiles.display_name`). The `products` Edge Function only ever writes name/description, so existing behavior is unchanged. |
| Search budget = `app_settings.intel_search_budget` (text int, default 15, CHECK ≥ 1), read per run | PRD: "caps its web_search calls (default 15, config-driven)". `app_settings` is the existing owner-editable config store — no new mechanism. |
| Budget allocation: market research call gets the full budget; identify gets `min(5, budget)`; profiling splits `max(1, floor(budget / confirmed_count))` per competitor | The riskiest seam is the cap holding across a *multi-competitor* run where each competitor is its own call (retry granularity, Run 2 precedent). Dividing the budget at call time by the confirmed-competitor count means the run total cannot exceed the budget no matter how many competitors are confirmed. |
| `callClaudeWithWebSearch` gains a hard budget ledger across pause_turn continuations: `max_uses` is recomputed from remaining budget each continuation, and the loop refuses to continue at 0 remaining | Run 2 sent a fixed `max_uses` every iteration of the pause_turn loop, trusting Anthropic's per-request semantics. For a cost cap that must *provably hold*, our own ledger is authoritative: searches already consumed are subtracted before any continuation, so even a pathological pause loop cannot overspend. Additive change; single-call behavior is identical. |
| 5 new call types, all routed to Sonnet 4.6: `market_intel_plan`, `market_intel_research`, `competitor_identification`, `competitor_profiling`, `competitive_gap_analysis` | PRD model-routing rule: all intel planning, search execution, and synthesis is Sonnet 4.6; web_search never pairs with Haiku. Every type is recordable under the existing `model_usage` CHECK (`model !~* '(fable\|mythos)'`) — verified by unit test per type and live rows. |
| Intel `model_usage` rows carry `session_id: null` | Intel is product-scoped; `model_usage.session_id` is an FK to discovery sessions (Run 4 precedent for non-session calls). Per-user cost tracing still works via user_id, and the admin spend view aggregates by call_type. |
| One market brief per product (`unique (product_id)`), refresh overwrites summary/evidence in place, id stable | PRD: "a standing, refreshable market brief… a snapshot, refreshable on demand". Mirrors `reports` (one per session, token stable). Old evidence rows are replaced on refresh, same as market-grounding re-runs. |
| Re-identify replaces only unconfirmed, unprofiled candidates; confirmed/profiled competitors survive | A PM who already confirmed and paid to profile competitors must not lose them to a second identify click. Mirrors Run 4's "regenerate replaces un-chosen proposals". |
| Gap threats carry `related_assumption_ids`, server-validated against the product's real assumptions (unknown ids dropped) | This is the "intel feeds the risk map" seam: the report's risk map badges assumptions that a competitive threat backs, and the report snapshot carries the linkage. Validation server-side keeps a hallucinated id from ever rendering. |
| Report snapshot bumps to version 2 with nullable `market_intel` + `competitive_intel` sections | Old snapshots stay renderable (fields absent → sections skipped); regenerating an old report picks the intel up at compile time. |

## 3. What was built

(filled in as the run proceeds)

## 4. Verification record

(filled in as the run proceeds)

## 5. Could not verify / known gaps

(filled in at the end)
