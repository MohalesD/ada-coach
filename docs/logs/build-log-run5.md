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
| **The three search endpoints answer 202 and finish in a background worker** (`EdgeRuntime.waitUntil`), reporting through a new service-role-only `products.intel_status` jsonb cell the client polls; the cell also serializes intel runs (one per product, 10-min stale reclaim) | Discovered live, twice: a synchronous Sonnet 4.6 + web_search call was killed by the edge gateway's 150s idle timeout at exactly 150,230 ms — and the completed worker runs measure 3–4 minutes, so this is the routine latency class, not a tail. Run 2's grounding calls (60–90s) fit under the window; multi-search intel calls do not. The confirm gate and gap analysis stay synchronous (fast, no search). |
| Per-CALL latency ceilings on top of the per-RUN budget: brief ≤ 6 searches/run, identify ≤ 3, profile ≤ 5 per competitor; pause_turn continuations bounded per caller (`maxContinuations`) | Each pause_turn continuation is a full extra model turn. The budget cap is about cost; these ceilings are about wall clock (the worker still has a 400s limit). A capped brief run is stored marked `partial` and refresh continues — the PRD's own hit-the-cap-mid-run behavior. UI cost notes mirror the same allocation math so the number the PM reads is the number the server spends. |
| `callClaudeWithWebSearch` budget ledger: our count is authoritative — each continuation's `max_uses` is recomputed from remaining budget, and a paused turn with 0 remaining is not continued | Run 2 sent a fixed `max_uses` every loop iteration, trusting per-request API semantics. For a cap that must *provably hold*, searches already consumed are subtracted before any continuation. |

## 3. What was built

### Database (7 migrations, applied via MCP `apply_migration`, committed locally)

| Migration | Contents |
|---|---|
| `20260705150000_market_briefs.sql` | `market_briefs` — one standing brief per product (unique product_id), `summary` jsonb, `confidence_label` CHECK (strong/moderate/thin/none), `partial`, `search_count`, `retrieved_at`. Read-own RLS, service-role-only writes. |
| `20260705150100_market_evidence.sql` | `market_evidence` — claim, `source_url NOT NULL` + CHECK `~* '^https?://'` (fabricated citation unstorable), title, `query_used`, `retrieved_at`. Same RLS. |
| `20260705150200_competitors.sql` | `competitors` — name, `added_by` (ada/user), `confirmed` (the gate flag), positioning, `pricing_signal`, `feature_notes` jsonb, `recent_moves`, `confidence_label` CHECK, `retrieved_at`, `profiled_at`. Same RLS. |
| `20260705150300_competitor_evidence.sql` | `competitor_evidence` — same shape and CHECK as market_evidence, FK → competitors CASCADE. |
| `20260705150400_products_competitive_gap.sql` | `products.competitive_gap` jsonb + `gap_generated_at`; products INSERT/UPDATE grants tightened to (user_id, name, description)/(name, description) — the documented column-grant defense; the products function's own writes unaffected. |
| `20260705150500_intel_config_run5.sql` | `app_settings.intel_search_budget` = '15' (CHECK integer ≥ 1) + the five Run 5 call types merged into `model_routing`, all `claude-sonnet-4-6`. |
| `20260705160000_products_intel_status.sql` | `products.intel_status` jsonb — the background workers' report line, the client's poll target, and the per-product run lock. Service-role-only by the tightened grants. |

### Shared modules (`supabase/functions/_shared/`)

- `intel-config.ts` — budget reader (`intel_search_budget`, default 15,
  clamp ≥ 1), per-call latency ceilings (brief 6 / identify 3 / profile
  5), `perCompetitorSearchBudget` (count × allocation ≤ budget, gate
  rejects count > budget), and `honestConfidence` (the stored label
  never exceeds what surviving citations support: 0 → none, ≤2 → thin,
  ≤5 → moderate).
- `intel-status.ts` — `setIntelStatus` / `isRunActive` for the
  background-run report cell (10-minute stale reclaim).
- `anthropic.ts` — `callClaudeWithWebSearch` gains the authoritative
  budget ledger (per-continuation `max_uses` recomputed from remaining;
  refuses to continue at 0) and a `maxContinuations` bound.
- `models.ts` — `CallType` + defaults extended with the 5 intel call
  types, all Sonnet 4.6; the Fable/Mythos guard covers them
  automatically.

### Edge Functions (4 new + `report` extended; config.toml pins verify_jwt)

- **`market-intel`** — GET returns `{budget, brief_run_cap}` so the UI
  surfaces cost BEFORE a run (app_settings is owner-only). POST 202 →
  background worker: Sonnet plan call (3–5 angles; malformed plan falls
  back to derived angles, never crashes) → one Sonnet + web_search
  research call (ledgered budget) → only search-returned URLs stored as
  evidence → honesty-floored confidence, `partial` when the cap was hit,
  `search_unavailable` when zero searches landed → upsert brief (row id
  stable), replace evidence.
- **`competitive-intel`** — POST 202 → identification worker (≤ 3
  searches): candidates land `confirmed = false`; re-identify replaces
  only unconfirmed+unprofiled rows; empty search → `unmapped: true` with
  the model's honest note, nothing invented. PATCH = the confirm gate
  (synchronous): confirm/add/remove with server-side validation,
  **refuses more competitors than the budget covers (400
  `too_many_competitors`)**, returns the profiling cost math
  (per-competitor × count ≤ budget).
- **`competitor-profile`** — POST 202 → profiling worker for ONE
  confirmed competitor (409 `not_confirmed` otherwise): allocation =
  min(5, floor(budget / confirmed_count)); positioning/pricing/features/
  recent moves + evidence, same grounding + honesty floor; re-profiling
  replaces the profile and its evidence.
- **`competitive-gap`** — synchronous Sonnet call, NO search: reasons
  over the stored, cited profiles + the product's own assumptions;
  threats carry `related_assumption_ids` (server-validated; unknown ids
  dropped, unmatched competitor names nulled); output persists on
  `products.competitive_gap`.
- **`report`** — snapshot v2: folds the product's market brief +
  evidence, confirmed competitors + evidence, and the gap analysis into
  every compiled snapshot (nullable sections; v1 snapshots render
  unchanged). This is how intel reaches the report and the share link.

### Frontend (amber identity, tokens only)

- `/product/:productId/intel` (`ProductIntel.tsx`) — both modules on one
  product-scoped surface. Market module: cost note before the run,
  progress note during (poll-driven), dated + confidence-chipped brief,
  partial/limited honesty banners, expandable dated sources. Competitive
  module: identify → **the confirm gate** (checkbox curation, add-known,
  remove, re-search, live cost math that refuses over-budget selections
  inline) → per-competitor profile cards (per-card loading/error/retry)
  → comparison matrix (client-rendered from stored rows — nothing
  restated by a model) → gap card (gaps, opportunities, threats with
  assumption links). Sequential profile-all (runs are serialized per
  product).
- `components/intel/` — `chips.tsx` (ConfidenceChip, RetrievedChip,
  cost-math mirrors), `MarketBriefCard`, `CompetitorGate`,
  `CompetitorProfileCard`, `ComparisonMatrix`, `GapAnalysisCard`.
- `RiskMap.tsx` — optional `threatenedIds`: assumptions a competitive
  threat pressures get a flag marker on the SVG (inline attrs, so it
  rasterizes into the PDF) + a "competitive threat" badge in the legend.
- `ReportView.tsx` (owner + share + PDF source of truth) — Market
  intelligence and Competitive landscape sections, every claim dated,
  confidence labels, threat → assumption-number references;
  `report-pdf.ts` renders the same sections into the export.
- `Discovery.tsx` product cards gain the "Market & competitors" entry;
  route wired in `App.tsx`.
- `discovery-api.ts` — intel mutations through the Edge Functions
  (202 + `pollIntelStatus`), reads through select-own PostgREST.

### Tests

- 42/42 Vitest: Run 5 routing defaults (all five call types Sonnet 4.6),
  per-call-type Fable/Mythos refusal, budget parsing/clamping, the
  allocation invariant (count × per-competitor ≤ budget across budget ×
  count grids), latency-ceiling behavior, and the honest-confidence
  floor.

## 4. Verification record

All of the following ran against the live ada-coach-01 backend on
2026-07-05/06, with outputs captured in-session.

**Static:** 42/42 Vitest (5 files), `npm run type-check` clean,
`npm run build` clean (pre-existing chunk-size warning only).

**Fabricated-citation CHECKs (deliberately tested, 5/5 rejected).**
Direct INSERT attempts as the privileged role — the strongest case,
since the CHECK binds every role:

| Attempt | Outcome |
|---|---|
| market_evidence, `source_url = NULL` | rejected: not_null_violation |
| market_evidence, `source_url = ''` | rejected: check_violation (market_evidence_real_source_url) |
| market_evidence, `source_url = 'see internal memo, trust me'` | rejected: check_violation |
| competitor_evidence, `source_url = NULL` | rejected: not_null_violation |
| competitor_evidence, `source_url = 'ftp://old-server/file'` | rejected: check_violation (competitor_evidence_real_source_url) |

A fabricated citation is physically unstorable; the code layer
additionally drops well-formed URLs the search tool did not return
(Run 2 enforcement, observed dropping 0 URLs across the live runs —
the model cited only real results).

**RLS isolation proof (the Run 1 standard, both directions).** Two
throwaway users seeded with one row in each of the four new tables;
transaction-scoped probes as `authenticated` with each user's JWT
claims:

| Probe | briefs own/other's | market_evidence | competitors | competitor_evidence |
|---|---|---|---|---|
| A probing B | 1 / **0** | 1 / **0** | 1 / **0** | 1 / **0** |
| B probing A | 1 / **0** | 1 / **0** | 1 / **0** | 1 / **0** |

Write paths: `has_table_privilege('authenticated', …, 'insert'/'update')`
= **false** on the intel tables, and
`has_column_privilege('authenticated','products','competitive_gap','update')`
= **false**. Cleanup cascaded both probe users to zero residue.

**Search-budget cap (deliberately tested, three ways, live).**
1. Budget lowered to 3; a real market brief run recorded **exactly 3
   searches** in model_usage, and the stored brief carried
   `partial = true` — the cap held and was labeled honestly.
2. Identification at budget 3: **3 searches** (≤ the identify ceiling).
3. The exceed attempt: confirming 4 competitors under budget 3 over the
   live API → **400 `too_many_competitors`** ("The search budget (3)
   allows at most 3 competitors per profiling run"). Client-side, the
   gate shows the same refusal inline and disables Confirm.
4. Budget restored to 15: the brief run spends min(6, budget) per call
   (latency ceiling) — the kick response reported budget 6 and the run
   recorded **6 searches**; the confirm gate's math for 2 competitors
   reads "up to 10 web searches (~$0.10) — 5 per competitor"
   (min(5, floor(15/2)) — run total provably ≤ budget).

**The real market brief (Must-Have, live).** EchoBrief (an AI
meeting-notes assistant for product teams — a deliberately well-mapped
space): sprint intake → Haiku classifier (`fresh_idea`) → 11 assumptions
mapped → market-intel run at budget 6. Result: a moderate-confidence,
partial-marked brief with **10 evidence rows, every source_url a real
search-returned URL, every claim dated "Retrieved Jul 5, 2026"** —
market-size ranges with an explicit treat-the-range caveat, named
players (Otter, Fireflies, Fathom, Copilot), and an honest "no
PM-specific survey was surfaced; fill that gap with primary discovery"
admission. The 202 → worker → poll path measured 236s — a run the old
synchronous shape could never have survived.

**model_usage read directly, all 7 live rows recomputed in SQL — every
cost exact (including web-search components):**

| call_type | model | tokens in/out | searches | cost_usd | recomputed | match |
|---|---|---|---|---|---|---|
| stage_classification | claude-haiku-4-5 | 212/24 | — | 0.000332 | 0.000332 | ✓ |
| assumption_mapping | claude-sonnet-4-6 | 384/566 | — | 0.009642 | 0.009642 | ✓ |
| market_intel_plan | claude-sonnet-4-6 | 156/85 | — | 0.001743 | 0.001743 | ✓ |
| market_intel_research (budget 3) | claude-sonnet-4-6 | 67,673/6,051 | **3** | 0.323784 | 0.323784 | ✓ |
| competitor_identification | claude-sonnet-4-6 | 172,850/3,392 | **3** | 0.599430 | 0.599430 | ✓ |
| market_intel_plan | claude-sonnet-4-6 | 156/74 | — | 0.001578 | 0.001578 | ✓ |
| market_intel_research (cap 6) | claude-sonnet-4-6 | 310,137/9,067 | **6** | 1.126416 | 1.126416 | ✓ |

No Fable/Mythos-tier model appears anywhere; the Run 1 DB CHECK still
refuses one, and all 16 routing entries were verified in app_settings.

**Intel feeds the report and risk map (live compile).** Session
completed (Haiku summary failed on the credit outage — non-fatal by
design, `summary_error: true`), report compiled → **snapshot v2 with
`market_intel` (10 dated sources)**; with competitive fixtures present
the snapshot also carried 2 profiled competitors + the gap analysis,
the risk map rendered **threat flags on assumptions 2 and 3** with the
"competitive threat" legend badge, and the exported PDF (4 pages,
parsed not just downloaded) contained "Market intelligence",
"Competitive landscape", "unserved", the threat→assumption references,
and the lowercase date labels in its text layer. `report-public` served
the same snapshot **with no auth header** (200); the logged-out
`/share/:token` view rendered the Market intelligence section at 375px;
the share token stayed stable across a post-cleanup regeneration.

**UI states (Playwright, 375px + 1440px, against the live backend):**
amber identity everywhere (tokens only); Discovery card hover on
"Market & competitors"; brief header chips (confidence + retrieved
date) beside Refresh; partial banner; expandable sources with dates;
pre-run cost notes on both modules; the confirm gate with live cost
math and add/remove/re-search; per-competitor profile cards with
confidence/date chips and "added by you" labeling; the side-by-side
matrix (scrolls inside its container at 375px — no page overflow);
the gap card with threats; a **live** identify error state (the credit
outage produced a real InlineError + "Search again"); zero unexpected
console errors across the session.

## 5. Could not verify / known gaps

- **The live competitive profiling + gap run is blocked by an external
  outage: the Anthropic API account ran out of credits mid-run**
  ("Your credit balance is too low to access the Anthropic API",
  surfaced via the new `intel_status.debug` field). Identification ran
  live once end-to-end (3 searches; the web_search tool returned a
  rate-limit/credit error that time and Ada honestly reported the space
  as unmapped rather than inventing competitors — the anti-fabrication
  behavior working under real failure). Profiling and gap analysis
  never completed a live model call. Their UI surfaces were verified
  with **clearly-labeled SQL fixtures** (content drawn from the real
  brief's own evidence), which were **deleted afterward** and the
  report recompiled so only real research persists. Once credits are
  topped up: open EchoBrief → Market & competitors → Find competitors →
  confirm → Research all → Map the gaps. Everything downstream of the
  model call is already proven.
- **This also means Ada's production chat/coaching is down until the
  account is topped up** — every Anthropic-backed feature, not just
  Run 5.
- **Cost lesson recorded in model_usage**: pause_turn continuations
  echo the full transcript back, so a 6-search research call reached
  310k input tokens ($1.13). The new `maxContinuations` bounds cap
  this, but web-search-heavy calls remain the platform's most expensive
  surface — exactly why the budget, the per-call ceilings, and the
  admin spend view exist.
- **The intel run-status poll is client-pull, not push** — a PM who
  closes the tab mid-run comes back to a finished brief (the worker
  completes server-side), but there is no notification. Acceptable for
  the current single-user reality.
- **`market_intel_plan`'s fallback angles** (used when the plan call
  fails or returns garbage) were never exercised live — the plan call
  succeeded every run.
- The **identify loading note** flashes too briefly to screenshot when
  the worker fails instantly; the component is the same WorkingNote
  verified across Run 4, and the market-brief loading note behaves
  identically during real multi-minute runs.
- The e2e test user (`run5-e2e-1783298142279@gmail.com`) and its
  EchoBrief product were **deliberately kept** (not cascade-deleted as
  in prior runs): the market brief is a real demo-able artifact, the
  product is the ready stage for the blocked competitive click-through,
  and deleting the user would cascade away the model_usage rows that
  evidence the live runs.
- `TRUNCATE`/`REFERENCES` grants on the new tables remain at Supabase
  defaults for `authenticated` (as on every prior table; PostgREST
  exposes no TRUNCATE path). Noted for a future blanket hardening pass,
  not changed unilaterally in this run.
