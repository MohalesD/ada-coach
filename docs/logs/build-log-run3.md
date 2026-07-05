# Build Log — Ada Discovery Coach v2, Run 3: Hardening

**Branch:** `feat/discovery-platform-run3` (stacked on `feat/discovery-platform-run2`, PR #2)
**Date:** 2026-07-04
**Built by:** Claude Fable 5 (build-time only — no production code path calls Fable 5 or any Mythos-tier model)
**Scope:** the Run 3 `/goal` — a hardening run, not a feature build. Four fixes:
storage policies for session file uploads, an admin spend view, the
same-session-two-tabs guard, and direct verification of the Run 2
model_usage gap.

---

## 1. Setup and branch decision

- PR #2 (Run 2) was still unmerged when this run started, and
  `feat/discovery-platform-run3` had been cut from main — which contains
  none of Run 2's code, while three of the four fixes modify Run 2 files
  and the deployed backend already runs Run 2. Resolution:
  **fast-forward-merged the run2 branch into run3** (reversible, merges
  nothing to main on Mo's behalf). Run 3's PR is stacked on PR #2; once
  #2 merges, GitHub retargets #3 to main and its diff collapses to just
  the hardening changes.
- PRD and Run 1 log were read in full earlier this session; the Run 2
  log was written by this session. Reading precondition met.

## 2. Decisions and rationale

| Decision | Rationale |
|---|---|
| Storage fix = drop the `role = 'owner'` clause from the three `documents`-bucket policies, keep the per-user path scoping (`(storage.foldername(name))[1] = auth.uid()::text`) | Path scoping already guarantees users can only touch their own folder. Global-corpus protection doesn't live in storage: the `documents` TABLE keeps owner-role policies for global rows, and the `ingest` global path re-checks owner in code. A non-owner can now upload files but can only attach them to sessions they own. |
| Web-search spend needs a new COLUMN, not a new table: `model_usage.web_search_requests` | Run 2 folded search cost into `cost_usd`, which is correct for totals but makes web-search spend inseparable after the fact. Storing the request count (the goal permits schema use; it bans new tables) lets the spend view show search cost exactly (count × $0.01) from now on. Historical market_grounding rows stay NULL and are labeled as blended in the view. |
| Two-tab guard = optimistic concurrency on `sessions.updated_at` via an optional `if_unmodified_since` on sessions PATCH; mismatch → 409 `stale_session` | Matches the PRD's exact remedy ("rejects the second submission with a refresh-to-continue message rather than overwriting"). Opt-in field keeps the API backward compatible; the sprint UI always sends it. The bookmark path now returns the freshly-updated row so the client always holds the current `updated_at`. |
| Spend view = new `admin-spend` Edge Function (requireAdmin) aggregating in memory over a bounded window (default 30 days, cap 90) + a Spend tab in the existing Admin panel | Mirrors the `admin-insights` precedent (in-memory aggregation via the service client, documented to move to SQL if the dataset grows). Separate function, not bolted onto insights — one job each. Admin-level access matches the Should-Have story ("As an Admin…"); it is not owner-gated. |

## 3. What was built

- **Migration `storage_session_uploads`** (applied via MCP, committed
  locally): dropped the three owner-role storage policies on the
  `documents` bucket; created per-user path-scoped replacements
  (insert/select/delete where `(storage.foldername(name))[1] =
  auth.uid()::text`).
- **Migration `model_usage_web_search`**: added
  `model_usage.web_search_requests integer` (CHECK ≥ 0, nullable);
  `usage.ts` now writes it alongside the all-in `cost_usd`.
- **Two-tab guard**: `sessions` PATCH accepts optional
  `if_unmodified_since`; mismatch with the row's `updated_at` → 409
  `{ error: 'stale_session', current_updated_at }`. The bookmark path
  now returns the freshly-updated row (the client's concurrency token
  must advance). `discovery-api` passes the token on bookmark /
  complete / abandon; `Sprint.tsx` holds it in state, and on
  `stale_session` swaps the step card for a "This sprint moved ahead in
  another tab — refresh to continue" alert (warning-toned, with a
  Refresh button); step actions hide until refresh.
- **Admin spend view**: new `admin-spend` Edge Function (requireAdmin —
  admin or owner, matching the Should-Have story) aggregating
  model_usage in-memory over a 7/30/90-day window with bounded
  pagination; `getSpend` in admin-api; a Spend tab in the Admin panel
  (visible to admins, unlike the owner-only tabs): four totals cards
  (all-in total, Haiku, Sonnet 4.6, separable web-search component with
  a blended-rows caveat for pre-column history) + a by-day ×
  call-type × model table with calls, tokens, searches, cost.
- Functions redeployed: sessions, admin-spend, market-grounding,
  blind-spots, interview-guide, assumption-mapping (shared usage.ts
  change).

## 4. Verification record

All checks ran against the live ada-coach-01 backend on 2026-07-04/05
as a brand-new NON-owner test user created for this run, then deleted.

**Fix 1 — storage policies (+ the Run 1 "file-mode ingest untested"
gap, closed):** upload to the user's own folder in the `documents`
bucket → 200 (was owner-only before this run; live pg_policies
captured before the change are in §2). Upload to a FOREIGN user's
folder → rejected (path scoping intact). Session-scoped `documents`
row created via the Run 1 RLS policy, then `ingest { document_id }` on
the uploaded file → 200, 1 chunk, status ready — the first end-to-end
file-mode ingest, and by a non-owner. The user later deleted their own
object via the Storage API (exercising the new DELETE policy).

**Fix 2 — spend view:** `admin-spend` as a plain user → 403 Forbidden.
After elevating the test user to `admin` (not owner): the Spend tab
rendered totals matching the SQL ground truth exactly — Total $0.29 /
3 calls, Haiku $0.0003, Sonnet 4.6 $0.29, Web search $0.0500 · 5
searches labeled "included in Sonnet total" — and the by-day table
showed the three call types with correct tokens/searches/costs.
Owner-only tabs stayed hidden for the admin role.

**Fix 3 — two-tab guard:** PATCH with the current `updated_at` → 200,
step saved, token advanced. PATCH with the now-stale token → **409
stale_session** with the refresh-to-continue detail, and a follow-up
GET proved the stale write did not land (step remained the newer one).
The client-side banner is code-reviewed + type-checked; the server
contract it renders from is what was verified live.

**Fix 4 — model_usage rows read directly (the Run 2 gap):** one real
assumption-mapping and one real market-grounding call as the test
user, then the rows were SELECTed and every cost recomputed
independently in SQL:

| call_type | model | tokens in/out | searches | cost_usd | recomputed | match |
|---|---|---|---|---|---|---|
| stage_classification | claude-haiku-4-5 | 185 / 24 | — | 0.000305 | 0.000305 | ✓ |
| assumption_mapping | claude-sonnet-4-6 | 357 / 524 | — | 0.008931 | 0.008931 | ✓ |
| market_grounding | claude-sonnet-4-6 | 57,158 / 4,004 | **5** | 0.281534 | 0.281534 | ✓ |

The market_grounding figure decomposes to $0.231534 of tokens +
$0.050 of searches (5 × $0.01) — the new column records the count and
the fold-in math is exact. No Fable/Mythos-tier model appears anywhere
(the DB CHECK also still refuses them).

**Static:** 32/32 Vitest, `type-check` clean, production build clean.
Cleanup: test user deleted; zero residue (the only surviving document
row is Mo's own pre-existing global-corpus PDF, untouched).

## 5. Could not verify / known gaps

- The **stale-tab UI banner** was not driven end-to-end in a browser
  (that needs two live tabs); the 409 contract it consumes was
  verified over the API and the rendering path is the same InlineError
  pattern the rest of the sprint uses. First real two-tab collision
  will show it.
- The first market-grounding attempt of the verification script left
  **no server log entry** — a client-side fetch failure before the
  request reached Supabase; the retry succeeded. Consistent with the
  per-assumption retry design, but worth remembering that grounding
  calls can fail client-side on slow networks.
- Historical market_grounding rows (Run 2's E2E) were deleted with
  their test user, so the "blended (count unrecorded)" label in the
  spend view has no live example yet; the code path is unit-reviewed.
- A pre-existing React key warning in Admin's ConversationsTab
  (Run 1 code) surfaced in dev console during verification — not
  touched, noted for the backlog.
- `sessions.updated_at` changes on any column write, so the guard can
  409 on a technically-compatible concurrent write (e.g., two tabs
  saving the same step). That strictness is intentional: refresh is
  cheap, silent overwrite is not.
