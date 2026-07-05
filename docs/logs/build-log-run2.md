# Build Log — Ada Discovery Coach v2, Run 2: Surface

**Branch:** `feat/discovery-platform-run2`
**Date:** 2026-07-04
**Built by:** Claude Fable 5 (build-time only — no production code path calls Fable 5 or any Mythos-tier model)
**Source of truth:** `docs/prds/ada-discovery-coach-v2.md` Must-Have stories + the Run 2 `/goal` statement

This log is written as the run proceeds: what was built, what was decided
and why, and anything that could not be verified. It is converted to DOCX
at the end, same as Run 1.

---

## 1. Session setup and recon

- Loaded `fable5-prompting` (per CLAUDE.md standing rule for `/goal`
  runs) plus its `design-and-voice-philosophy.md` reference — this run
  is UI-heavy, so Locality-First and the microcopy principles apply
  directly. Ran the `session-start` skill steps; step 5's "one thing to
  ship" is answered by the `/goal`: Run 2. The Run 2 gate in project
  memory ("don't start Run 2 uninvited") is satisfied — this `/goal` is
  the invitation.
- Read in full before building: the PRD, the Run 1 build log,
  `tasks/todo.md`, `_shared/auth.ts`, `_shared/models.ts`,
  `_shared/anthropic.ts`, `_shared/usage.ts`, `sessions/index.ts`,
  `assumption-mapping/index.ts`, the `assumptions` migration (the RLS
  pattern to mirror), `config.toml`, `package.json`,
  `tailwind.config.ts`, `src/index.css`, `src/App.tsx`,
  `src/pages/Index.tsx`.
- Loaded the `claude-api` skill for the web-search server tool spec:
  Sonnet 4.6 supports `web_search_20260209` (dynamic filtering); results
  arrive as `web_search_tool_result` blocks; searches are counted in
  `usage.server_tool_use.web_search_requests`; `pause_turn` requires a
  bounded continuation loop; error results come back as an object (not a
  list) inside the tool-result block.
- **Scope note:** the PRD's Run 2 placeholder mentions "full analytics
  instrumentation and the admin spend view". The `/goal` narrows Run 2
  to Must-Have user stories only; the admin spend view is a Should-Have
  story and the analytics-events table is not a user story, so neither
  is built. `model_usage` (Run 1) already logs every model call.
- **Palette note:** the live app's `src/index.css` carries a cerulean
  palette (#9BB7D4 / #1B4F72 / gold #C9A84C on white). The `/goal` fixes
  the design identity to the warm amber/cream of the earlier prototypes
  (#B8853A, #8B6324 on #FAEFD9/#F5F0E3/#FAF7F0, espresso text, never
  true black/white). That means the global tokens get re-pointed and the
  hardcoded cerulean hexes in existing components get swept — treated as
  in-scope because the goal says the amber identity is fixed and every
  screen must carry it.

## 2. Decisions and rationale

(recorded as they are made; table grows during the run)

| Decision | Rationale |
|---|---|
| Run 2 tables (`assumption_evidence`, `blind_spots`, `interview_guides`, `reports`) use select-own RLS + service-role-only writes — the `model_usage` pattern, not the `assumptions` pattern | All four are function-produced artifacts. The PM edits assumptions (scores, status, priority) but never hand-edits evidence, blind spots, guides, or report snapshots; removing the client write path removes a whole class of tampering. |
| `market-grounding` processes ONE assumption per call | PRD requires "retry this step" granularity per failure; web search calls are the slowest step (30–60 s each), and Edge Functions have wall-clock limits. Frontend fans out per assumption with local per-card progress (Locality-First: feedback at the object). |
| Share link = unguessable token + `verify_jwt=false` Edge Function reading via the service client | No anon RLS policies needed anywhere; the only public surface is one read-only function keyed by a 128-bit random token. The snapshot is served, never the live tables. |
| Report is a snapshot (jsonb), regenerated on request, token stable across regenerations | PRD: artifacts snapshot at creation; deleting docs later leaves reports intact; post-close score edits regenerate the risk map/report on request but never the interview guide. A stable token means a shared link survives regeneration. |
| Product memory = `_shared/product-memory.ts` bundle (prior session summaries + validated/challenged/abandoned ledger) injected into mapping, blind-spots, and guide prompts | This is the "session ten builds on session one" Must-Have. Run 1 stored the data; Run 2 makes the models actually read it. |
| Evidence anti-hallucination rule: only URLs the web-search tool actually returned are stored; blind spots may cite only URLs market grounding stored, else they are forced to `evidence_backed = false` | PRD QA: "Every blind-spot claim labeled evidence-backed has a real, working source link" and "never manufacture a citation". Enforced in code, not just in the prompt. |
| Interview guide returns plain markdown, not JSON | A long guide inside a JSON string is the most malformation-prone output shape available; markdown needs no parsing. Rejection gate instead: minimum length + a hypothetical-question stem regex (the Mom Test QA bar), 502 retryable on failure. Versions are append-only (session_id, version). |
| Web-search cost is folded into `model_usage.cost_usd` at $10/1k searches (verified 2026-07-04); search count comes from `usage.server_tool_use.web_search_requests` | No schema change needed; cost tracing stays complete. Errored searches aren't billed by Anthropic and aren't counted. |
| Step outputs (market checks, blind spots, guide) are persisted as assistant messages in the sprint conversation | The thread stays the product's spine: the existing chat UI, session summary, and markdown export all pick these up with zero new code. |
| `pause_turn` continuation is bounded at 3 echoes | The web-search server loop can pause mid-turn; unbounded continuation would be an open-ended spend loop. |

## 3. What was built — backend (deployed to ada-coach-01)

- **5 migrations** applied via MCP `apply_migration` and committed
  locally: `assumption_evidence`, `blind_spots` (CHECK: evidence_backed
  requires ≥1 source URL), `interview_guides` (unique session+version),
  `reports` (unique session, unique share_token, jsonb snapshot),
  `model_routing_run2` (merged three Sonnet call types into the routing
  JSON). Verified post-apply: all four tables have RLS enabled and zero
  authenticated INSERT/UPDATE/DELETE grants; routing JSON carries all six
  call types.
- **Shared modules:** `models.ts` (+3 call types, web-search pricing
  constant), `usage.ts` (webSearchRequests folded into cost),
  `anthropic.ts` (`callClaudeWithWebSearch`: web_search_20260209 tool,
  citations/sources/queries parsing, error-object tolerance, bounded
  pause_turn loop), `product-memory.ts` (pure formatter + service-client
  loader). 7 new Vitest tests; 26/26 pass.
- **Edge Functions deployed:** `market-grounding` (one assumption per
  call), `blind-spots`, `interview-guide`, `report` (compile/regenerate
  with stable token), `report-public` (the only unauthenticated surface;
  verified live: bogus token → 404 with no JWT). `assumption-mapping`
  extended with product memory; `sessions` redeployed for shared-module
  changes. `config.toml` pins verify_jwt for all five new functions.

## 4. What was built — design + frontend

- **Palette retokenization.** `src/index.css` re-pointed every shadcn
  token to the amber identity: deep ochre #8B6324 as the action color
  (4.7:1 on the cream backgrounds — amber #B8853A alone fails 2.7:1 as
  text, so it carries accents/hovers/rings instead), cream layers
  #FAF7F0/#F5F0E3/#FAEFD9, espresso text #2C2214, never true black or
  white anywhere. Status colors researched (web) and warm-harmonized,
  all ≥4.5:1 as text on cream: success olive #4A7031, warning burnt
  orange #A34E0D, error brick #A93226, info slate #46688B — exposed as
  `success`/`warning`/`info` Tailwind tokens. Every hardcoded cerulean
  hex in the existing screens was swept to the amber equivalents
  (Index, sidebar, Admin, sonner toasts). Typography: Fraunces
  (variable) for display headings + Karla (variable) for body — warm,
  editorial, self-hosted via @fontsource (no CDN dependency).
- **Types + clients:** `src/types/discovery.ts` (schema mirror incl. the
  report snapshot shape), `src/lib/discovery-api.ts` (functions for all
  mutations; direct RLS-bound table reads where no orchestration is
  needed; typed `DiscoveryApiError` carrying status/code/retryable),
  `src/lib/risk.ts` (the one shared definition of "riskiest":
  impact × (6 − confidence); powers evidence selection, prioritize
  pre-suggestions, and the map).
- **Screens:** `/discovery` (products, resume-sprint cards, report
  links, "Create your first product" empty state, in-place create +
  intake dialogs), `/sprint/:sessionId` (single-column chat-first
  surface: thread as the spine, ONE inline step card with tap-target
  branching — answer / skip / dig deeper — always-available freeform
  input to Ada below, step progress indicator pinned in the header,
  per-object loading/error/retry on every action), `/report/:sessionId`
  (owner report + Regenerate / Copy share link / Export PDF attached to
  the report itself), `/share/:token` (public read-only view + "AI
  coach" transparency footer). Routing in App.tsx; the "Run a Discovery
  Sprint" scenario card and a header Discovery button both route to
  `/discovery` (intent-sensitive redundancy, distinct attention zones).
- **Risk map:** `RiskMap.tsx` — 5×5 SVG, confidence × impact,
  quadrant tints + labels (TEST THESE FIRST / CORE BETS / PARK FOR NOW /
  SAFE ENOUGH), numbered dots colored by category, rings for
  prioritized, jitter for co-located dots, numbered legend beneath so
  color is never the only signal. All styling is inline attributes so
  the same SVG rasterizes into the PDF.
- **PDF export:** `src/lib/report-pdf.ts` — client-side jsPDF (A4,
  serialize the risk-map SVG → PNG at 2×, wrapped text sections,
  markdown stripped to plain text for the guide, page-break handling).
  Follows the repo's existing client-side export precedent.

## 5. Verification record

All of the following ran against the live ada-coach-01 backend on
2026-07-04, driven through Playwright on the local dev build, with
screenshots captured at 1440px and 375px (kept outside the repo).

**Static:** 32/32 Vitest tests (4 files: redact, models+usage+routing,
product-memory, risk). `npm run type-check` clean. `npm run build`
clean (chunk-size warning is pre-existing scale, jsPDF adds weight).

**Full sprint E2E (fresh signup, product "FieldNote"):**

1. Signup → chat home renders the amber identity (Fraunces/Karla live).
2. Discovery empty state → create product → intake dialog → session
   created; **Haiku classifier: "fresh idea"** shown in the sprint
   header.
3. Grounding: pasted interview notes containing 3 emails + names →
   ingest succeeded; **UI reported "2 personal details redacted"** on
   the second paste (first paste surfaced a response-shape bug I fixed
   mid-run — see §6); flagged-token display exercised.
4. Mapping: **12 valid scored assumptions** across all four categories;
   inline score edit (tap dot) persisted through PATCH and survived
   reload.
5. Evidence: risk ranking picked the three confidence-1/impact-5
   assumptions; "Check all 3" fanned out three market-grounding calls
   (61s/75s/85s per function logs, all 201); **24 evidence rows, every
   URL from real search results** (Spectora's acquisition of HomeGauge,
   state licensing rules, AI-transcription liability articles), stance
   chips rendered.
6. Blind spots: 7 rows, **3 evidence-backed (source URLs enforced
   server-side) vs 4 Socratic**, each linked to a numbered assumption.
   The redaction placeholder "[NAME_1]" appeared inside the analysis —
   proof the raw name never reached any model.
7. "Dig deeper" tap-target sent the chat turn and Ada replied in-thread
   (the existing chat function, same conversation).
8. Prioritize: pre-suggestion + manual add → 4 confirmed (3–5 gate
   enforced in UI).
9. Guide: **v1, 18 questions**, Mom Test structure, passed the
   hypothetical-stem rejection gate (60s call, 201).
10. Finish: session completed (Haiku summary written), report compiled
    (201), navigated to `/report/:id`. Header stats: 12 assumptions ·
    24 citations · 7 blind spots. Risk map rendered with quadrants,
    rings, jitter.
11. **PDF export:** downloaded `ada-discovery-report-fieldnote.pdf` —
    10 pages, risk-map PNG embedded, every section present in the
    text layer (verified by parsing the file, not just the toast).
12. **Share link (the logged-out story):** token pulled from the DB;
    `report-public?token=…` returned **200 with no auth header** via
    curl; localStorage cleared in the browser (session gone) and
    `/share/:token` still rendered the full report. Bogus token → 404.
13. **Memory story (sprint 2, same product):** ledger seeded
    (1 validated, 1 abandoned via SQL — the sprint UI intentionally has
    no status editor yet), classifier read the new intake as
    **"mid-discovery, stuck"** (both entry points now observed), and the
    second mapping produced 11 assumptions that treat the validated
    pain as settled, never re-propose the abandoned signal, and center
    on the PM's new stuck point. Session two demonstrably built on
    session one.
14. Resume: "Save & exit" → dashboard resume card showed "Last step:
    mapping"; resuming landed on that step with state intact. Abandon:
    confirm dialog → terminal, redirected, data retained.
15. Responsive: 375px checks on dashboard, sprint, report (risk map
    scales, legend carries the detail), share view. Hover + local
    success feedback verified ("Copy share link" → "Link copied" in
    place). Console: zero errors across the whole run except the
    pre-existing missing favicon.
16. Cleanup: test user deleted; **every table cascaded to zero rows**
    (products, sessions, assumptions, evidence, blind spots, guides,
    reports) — the purge chain proven end to end again. Function logs
    show no 5xx for any Run 2 endpoint.

## 6. Fixed during verification

- `ingest` response-shape mismatch: the UI read `redaction.redactions`
  and treated `flagged` as strings; the function returns
  `redacted_count` and `{token, context}` objects. First paste showed
  "No personal details needed redacting" + "[object Object]". Fixed
  client + display; re-tested with a third email → "2 personal details
  redacted". (Server-side redaction itself was always correct.)
- Sprint step indicator overflowed with a visible scrollbar at 768px;
  tightened connector/padding widths and hid the scrollbar.

## 7. Could not verify / known gaps

- **model_usage rows for the new call types were not inspected before
  cleanup** — deleting the test user cascaded them. The recording path
  is the same `recordModelUsage` middleware Run 1 verified, all calls
  returned 2xx with no insert errors in the function logs, and the
  web-search cost math is unit-tested — but "a market_grounding row with
  search cost included" was never eyeballed in the table. First real
  sprint will show it in `model_usage`.
- **Same-session-in-two-tabs** (PRD async edge case) is not guarded:
  last write wins on step bookmarks; step artifacts re-run rather than
  conflict. Deliberate cut, noted for the backlog.
- **Session file uploads** remain owner-only at the storage-policy layer
  (Run 1 gap, unchanged). Pasted-text grounding — the redaction-critical
  path — is what the sprint UI exposes.
- **PDF typography** uses jsPDF's built-in Helvetica, not
  Fraunces/Karla (embedding fonts would add ~200KB+ and font-license
  plumbing). The web report is the canonical pretty artifact.
- **Web-search cost estimate** ($10/1k) verified against current docs
  2026-07-04; it lives in one constant if pricing moves.
- **Analytics events table** (PRD appendix) intentionally not built —
  not a Must-Have story; `model_usage` covers cost observability.
- Playwright's browser process holds `.playwright-mcp/` open on
  Windows, so the empty dir may linger locally; it's gitignored now.
