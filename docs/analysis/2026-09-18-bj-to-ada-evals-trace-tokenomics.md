# Builder Journal to Ada Coach, Part 1: Evals, Trace, Tokenomics, Security, and AI Engineering

**Purpose.** What Ada Coach should carry over from DaVinci Builder Journal in the areas the AI Engineering and AI Evals and Trace cohorts will grade: evaluation method, tracing, token and cost discipline, security and privacy posture, and the engineering patterns around model calls. Part 2 (a separate document) covers UX, UI, and app building.

**How this was built.** Both repositories were read directly on 2026-09-18: Builder Journal at `v2.41.0` (218 changelog entries, `docs/rules.md`, `docs/evals/`, the `/docs/evals` manifest, the published eval write-ups, the bridge case study and its contracts, `supabase/functions/ai-assist`), and Ada Coach at `main` plus the current working branch (`CLAUDE.md`, PRD v3 and addendum, the backlog, the RAG eval harness and its results, the Tavily and agent-architecture analysis, `_shared/anthropic.ts`, `usage.ts`, `models.ts`, `intel-config.ts`, `evaluator.ts`, the prompt contract and its validator, CI). Every claim about either codebase below points at a file. Where something is an inference rather than an observation, it says so.

**A correction to the premise, up front.** The framing was that Builder Journal is where the eval, trace, and contract work lives and Ada is feature-light. On the AI engineering side that is backwards in several places. Ada already has the stronger tokenomics (a pricing table, cost per call, config-driven model routing, search budgets, per-call latency caps), a real agent loop with a bounded action space, a timeout-and-retry wrapper written from a production incident, and the only prompt contract that runs in CI. Builder Journal's contribution is not the machinery; it is the **method and the discipline around evidence**: how an eval is designed, labeled, verified against deploy state, published with its limitations, and kept honest by tests that check the documentation itself. That is the part worth porting, and it is exactly what the Evals and Trace cohort cares about.

---

## 1. Executive summary: the ten lessons

1. **Publish the evidence, not just the tests.** Builder Journal's `/docs/evals` page is a catalogue where every suite states what it guards, how it decides, where it runs (`ci` or `manual`), when it last ran, and what a pass does *not* establish. Ada has more test files than that page lists but no equivalent surface. Building one is the highest-leverage cohort artifact available.
2. **Every suite carries a `limitation` field, and it is mandatory.** An eval that only reports passes is marketing. This single rule changes how every other eval gets written.
3. **Keep a register of defects no test caught, with "why the tests missed it."** Builder Journal's five live findings (blank tab, cold first message, 53-second hang, stale reassurance, guard reported as outage) are the most instructive content in either repo. Ada produced three of them and records none of them in a structured way.
4. **Deterministic checks first, a judge model last, and never a judge from the same vendor as the system under test.** Eval v2 and v3 used zero judge models. The Ada RAG harness has a 4-dimension rubric with no scorer at all. The bridge between those two states is a deterministic layer for the properties that can be checked mechanically, then a non-Anthropic grader for the rest.
5. **Label every finding `observed` or `inferred`, and capture the state before and after.** Eval v1's most important finding was inference; v2 made it observation. That distinction is the whole difference between a claim and evidence.
6. **Verify deploy state before reading any result.** Builder Journal measured two eval rounds against a stale deploy before writing the rule. Ada's tracker reconciliation on 2026-09-15 found the same class of confusion (a function believed stuck on a July deploy that was not). Ada needs a deploy stamp per Edge Function and a health page that reads it.
7. **Trace every path, not just success.** Builder Journal's `ai_usage_log` writes a row on rate limit, credits exhausted, gateway error, empty result, and success, with `duration_ms`, `status`, `error_code`, and `http_status`. Ada's `model_usage` records cost better than anything in Builder Journal but only on the success path, with no latency and no status. Ada's spend view is therefore a ledger, not a trace.
8. **Metadata-only logging is a stated invariant, then a disclosed one.** Builder Journal's standing comment ("NEVER store prompt or response text here") plus the privacy-surfacing audit is a complete pattern. Ada stores full transcripts by design (that is the product) and logs raw model output on malformed JSON. Both are defensible; neither is currently disclosed in one place with the same precision.
9. **A prompt is production behavior stored as prose. Contract it.** Ada invented the prompt-contract format and runs the only one in CI. It covers one directive. The persona prompt, the evaluator prompt, and the assumption-mapping prompt carry no assertions at all.
10. **Prompt asks, guard verifies, renderer constrains.** Builder Journal's three-layer contract for AI rewrites (format rules in the prompt, `normalizeAiText()` as a deterministic guard that reports and never silently repairs, an allow-list renderer) generalizes directly to Ada's structured outputs, where today a prose JSON extraction and a 502 stand in for all three layers.

---

## 2. Where each app actually stands

Side-by-side, verified against code. "Ahead" means the pattern exists and runs; it is not a quality judgment on the product.

| Area | Builder Journal | Ada Coach | Who is ahead |
|---|---|---|---|
| Model access | Lovable AI Gateway, fixed `google/gemini-3-flash-preview`, response model never captured | Raw fetch to Anthropic, config-driven Haiku/Sonnet routing in `app_settings.model_routing`, Mythos-tier refused in code and by DB CHECK | Ada |
| Cost accounting | None. Token counts only | `MODEL_PRICING`, `computeCostUsd`, web-search cost folded in, admin Spend tab | Ada |
| Per-call envelopes | `ACTION_LIMITS` table (max input chars, max output tokens) per action, surfaced live to admin via `debug-limits` | Per-call `maxTokens` scattered in callers; search caps per call in `intel-config.ts` | Split. Ada for search budgets, Builder Journal for a single visible table |
| Trace row per call | Every path, with `duration_ms`, `status`, `error_code`, `http_status`, `environment`, `truncated`, input and output chars | Success path only, with `call_type`, `session_id`, tokens, `web_search_requests`, `cost_usd`. No latency, no status | Builder Journal on shape, Ada on cost |
| Timeout and retry | Not present in `ai-assist` (gateway errors surface as 500) | `REQUEST_TIMEOUT_MS = 20_000`, one retry on null status, 408, 429, 5xx; 12 tests | Ada |
| Agent loop | None (single-call actions) | Evaluator recommends one action from a fixed catalog, controller dispatches, PM gates direction changes | Ada |
| Structured output | Forced tool call for `idea-to-prompt` | `extractFirstJson` over prose, strict validators, 502 `malformed_model_output` | Builder Journal on method, Ada on validation |
| Prompt contracts | Superseded copy of Ada's; behavior contract for the holding page (7 assertions, CI) | `bridge-arrival-directive.yaml`, 7 assertions, validator in CI | Ada (it owns the format) |
| Output evals | Content fidelity v1, v2, v3: real notes, deterministic checks, pre and post captures, agent-executed v3 | RAG harness: 15 questions, A/B arms, 4-dimension rubric, five threshold sweeps, **no scoring performed** | Builder Journal |
| Eval catalogue | `/docs/evals` with suites, live findings, write-ups, and a test that keeps the numbers honest | `docs/eval/` folder, results as markdown | Builder Journal |
| Deploy verification | Three layers, per-function `BUILD_STAMP` hash, `/admin/health` reads current or stale | Tracker reconciliation done by hand once (2026-09-15) | Builder Journal |
| Data isolation eval | Policy-layer impersonation inside a rolled-back transaction, 16 assertions, manual | RLS audit document (2026-08-23), two-user queries in Run 1 | Builder Journal on repeatability |
| Privacy disclosure | Audit across nine surfaces, contradiction found and logged, copy drafted per surface | `/privacy` page, deletion and retention disclosed | Builder Journal on method |
| Edge Function tests | None in CI (Vitest loads `src/` only; a live finding was caused by this gap) | 10 `_shared` suites under Vitest, Deno-free by design | Ada |
| CORS | `Access-Control-Allow-Origin: *` on every browser-facing function | Allowlist in `ALLOWED_ORIGINS`, preflight fails closed | Ada |
| Retry policy | One client-side re-request for Expand when output is shorter than input; no server timeout | Server-side timeout and one retry on transient faults | Ada |
| Test volume | 40 files, roughly 360 test blocks | 14 files, roughly 130 test blocks | Builder Journal on count |

The pattern is consistent. Ada built the instruments. Builder Journal built the lab notebook.

---

## 3. Evals

### 3.1 What Builder Journal actually did

The eval work is smaller in file count than it looks from the outside (two files in `docs/evals/`, three published HTML reports, one manifest) but it is methodologically complete, and the method is the asset.

**Content fidelity v1 (Week 2, 4 September).** Six real notes through Expand with AI, five checks: length floor, lists, links, images, dividers and code. It found four defects instead of the one reported: a hardcoded one-paragraph instruction, silent truncation on five of six actions, flattened lists, and Apply destroying images. Its most important finding (image destruction) was inference, because only the pre-Apply state was captured.

**Content fidelity v2 (31 August captures, published 4 September).** The same checks after the fix, with two captures per case (suggestion before Apply, note after Apply) so "the output contains X" and "Apply preserved X" are separate observations. Five of five run cases passed. Two cases produced **contract decisions rather than defects**: "may reformat, must never drop" (case D, forty bare LinkedIn URLs regrouped and labeled) and a proposed rule for bracketed author notes (case E). A verification line records the deployed function timestamp before any result is read, because rounds one and two of v1 had been scored against a stale deploy. A status note added on 2026-09-13 explicitly scopes which findings are still current against the live build and which are historical.

**Content fidelity v3, Case J (2026-09-13).** The acceptance gate for preserve regions (`{{ }}` survives byte for byte through Polish, Expand, and Concise on both surfaces). Six of six passes. Executed end to end by an agent driving a real browser after a human sign-in; verified by byte-identity comparison; human spot checks alongside. It also names, in its own text, what it cannot see: the guard's `preserveRegions` report is verified by thirteen unit tests but computed and discarded in the app because the logging item (S5) was never built. The next-iteration note proposes a judge model only for properties a deterministic check cannot express, from a non-Claude vendor so grader and system under test do not share one.

**The `/docs/evals` manifest (`src/pages/docs/evals-manifest.ts`).** Ten suites across Builder Journal, Ada Coach, and the bridge, in six kinds: output evaluation, prompt contract, behavior contract, data isolation, resilience, catalogue parity. Each entry has `guards` (in user terms), `method` (specific enough to rebuild), `assertions`, `harness`, `runsIn`, `lastRun`, `result`, and `limitation`. Five live findings each carry `symptom`, `rootCause`, `whyTestsMissedIt`, and either `nowGuardedBy` or `stillUnguarded`. A Vitest suite (`docsEvals.test.ts`) fails the build if a harness path stops existing, a stated test count no longer matches the `it(` blocks in the file, an assertion count drifts from its YAML, a linked report is missing under `public/`, or a finding names a suite that does not exist. Every number on the page is computed, never typed.

**Five live findings and why the tests missed them** (quoted from the manifest, condensed):

| Finding | Why no test caught it |
|---|---|
| The successful handoff looked like a broken one | Nothing was broken. The failure was in what the product did not say, and no assertion existed for silence. |
| Ada opened with an opinion and never said who she was | The directive was prose in a source file, covered by no assertion of any kind. A constraint correct in steady state was wrong at a boundary. |
| One request hung for fifty-three seconds | Never going to come from a test. Found by reading production logs after a user's report did not match what the product said. |
| The reassurance became the evidence that something was stuck | The holding-page suite was green because it asserted what the page said, not what it said after forty seconds. A test against a one-shot behavior does not notice the behavior needed to be a sequence. |
| A guard doing its job was reported as an outage | The error-code-to-sentence mapping was tested and correct. Nothing asserted the HTTP status, because nothing tests the Edge Function at all. Still unguarded. |

Three of these five are Ada incidents. Ada fixed all three in code and wrote one of them up (`docs/portfolio/the-53-second-hang`). It has no register.

The manifest also carries a `PLANNED_EVALS` list with the blocker named for each: an output evaluation of Ada's arrival message (needs a grader and a held-out set of intakes; design not started), isolation as a CI test rather than a reading (needs a seeded fixture database), and one signed end-to-end round trip (needs a disposable account path). Naming the blocker is what keeps a planned eval from quietly becoming a forgotten one.

Two smaller lessons from the same work. First, **eval artifacts can leak personal data**: the Case D captures exposed about forty real LinkedIn profiles and were replaced by schematics in v2.40.3, with the originals moved to a gitignored folder. Any Ada eval that publishes transcripts or intake text needs the same pass before it goes on a public page. Second, the guard's report object was designed as an eval source (item S5: log the counts into `ai_usage_log`) and never wired up, so Eval v3 had to label that part "verified by unit test, not observed live". Instrumentation that is designed but not written shows up as a limitation line later.

### 3.2 What Ada has today

- `docs/eval/20260502_ADA_EVAL_RAGEvalHarness_v0.1.md`: a well-designed A/B harness (15 questions in three relevance tiers, four rubric dimensions on a 1 to 4 scale, a critical-fail rule for revealing the retrieval mechanism, a +2.5 Tier 1 delta threshold).
- `scripts/rag-regression.mjs`: runs both arms against Anthropic directly, writes paired responses and retrieval metadata to `docs/eval/results/`. Five result files exist, one per similarity threshold (0.35, 0.45, 0.55, 0.6, and the default).
- **Scoring was never performed.** The script says so, correctly: the rubric requires human or LLM-judge judgment. The threshold decision (0.45, made 2026-07-10) was taken on retrieval counts, not on the rubric. That is a reasonable engineering call and an incomplete eval. It is the Ada analog of Builder Journal's v1: a real instrument with an inferred conclusion.
- `bridge-arrival-directive.yaml` plus `validate-contract.mjs` in CI. Seven assertions, each with `rationale` and `failed_before_fix`. This is the best single artifact in either repo for the "prompt as specification" idea, and the format has already been reused once (Builder Journal's behavior contract for the holding page).
- Unit suites for the Deno-free helpers: models, redact, bridge signature, bridge payload, sprint kickoff, intel config, product memory, storage purge, anthropic wrapper, feedback reply email. These are behavior contracts in fact, just not catalogued as such.
- Planned, not built: the Tavily hybrid A/B eval (groundedness, confidence-label distribution, field coverage, p95 latency, cost per profile, one planted injection page) and the self-correction retry-rate metric.

### 3.3 What to carry into Ada

**E1. An eval manifest and page for Ada.** Port `evals-manifest.ts` and `docsEvals.test.ts` as a pattern. Register what already exists: the RAG harness (kind: output evaluation, `runsIn: manual`, `limitation`: unscored), the arrival directive (prompt contract, ci), the anthropic wrapper suite (resilience, ci), bridge signature and payload (behavior contract, ci), redact (behavior contract, ci), the RLS audit (data isolation, manual), and the 2026-09-15 tracker reconciliation (catalogue parity, manual). Add a live-findings register seeded with the three Ada incidents. Whether the page is public (`/docs/evals`, like Builder Journal) or an admin tab is a direction question; see section 10. Effort: M. Cohort value: this is the single artifact that demonstrates both courses at once.

**E2. Finish the RAG eval by scoring it.** Two layers, in Builder Journal's order. First, deterministic checks that need no judge: authenticity (regex for retrieval-mechanism leaks such as "according to the document", "the provided context", "chunk"), the persona length rule (sentence count, exactly one question mark), the no-validation rule (a small phrase list for cheerleading), and named-framework presence (a fixed vocabulary: JTBD, Five Whys, Mom Test, and so on). Second, a judge for grounding, specificity, and coaching value, from a non-Anthropic vendor (the Lovable gateway's Gemini route is available to Mo already, and the choice mirrors Builder Journal's stated rule). Publish the result with the rubric, the judge prompt, agreement with a human spot-check on a subset, and a `limitation` line. Effort: M.

**E3. Expand prompt contracts from one directive to the prompts that matter.** Candidates, in order: the coach persona prompt (the four constraints in `CLAUDE.md`: never validate, one question, 2 to 4 sentences, redirect off-topic), `EVALUATOR_SYSTEM` in `evaluator.ts` (the action list must equal `ACTION_TYPES`, the success-metric precondition must be present, the "not the next one in sequence" sentence must survive), and the assumption-mapping prompt (the JSON shape it demands must match what `validateCandidates` accepts). The validator already exists; each new contract is one YAML file and one CI line. Effort: S each.

**E4. A content-fidelity analog for Ada's own outputs.** Builder Journal's checks were about preserving user content through a rewrite. Ada's equivalent is preserving the PM's meaning through extraction: does every assumption row in `assumption-mapping` output trace to a sentence in the intake? Does every `market_evidence` URL appear in the search results the tool actually returned (the URL-survival filter already enforces this at write time; an eval would measure how often it fires)? Does `honestConfidence` cap correctly when evidence is thin? These are deterministic, they run over `model_usage` and the evidence tables, and they produce the "groundedness" number the Tavily A/B needs anyway. Effort: M.

**E5. An evaluator-distribution eval for the agent loop.** Ada's evaluator is the one place a model makes a decision that code then enforces. That is auditable: replay N stored sessions through `evaluateNextAction` and report the action distribution per phase, the rate of `define_success_metric` before any validated assumption (should be zero), and the rate of malformed JSON. This is an eval no Builder Journal feature could have, and it is the most "Evals and Trace" thing Ada can show. Effort: M.

**E6. Adopt the labeling rules verbatim.** `observed` versus `inferred` on every finding. Deploy state verified before scoring. Both states captured when a UI is involved. Contract decisions logged separately from defects. A status note on every report saying which findings are still current against the live build. These cost nothing and they are what separates a cohort submission from a lab notebook.

---

## 4. Trace

### 4.1 What Builder Journal captures

One table, `ai_usage_log`, one row per `ai-assist` call on **every** code path. Columns: `user_id`, `action`, `model`, `environment`, `input_chars`, `truncated`, `max_input_chars`, `max_output_tokens`, `prompt_tokens`, `completion_tokens`, `duration_ms`, `output_chars`, `status`, `error_code` (`rate_limited`, `credits_exhausted`, `gateway_error`, `empty_result`), `http_status`, `created_at`. Never prompt or response text. The admin AI Debug page reads the last 100 rows and, separately, fetches the live `ACTION_LIMITS` and model string from the deployed function through `debug-limits`, so the page cannot drift from what is deployed.

What the trace inventory (2026-09-15) says is missing, in its own words: input and output text (by design), mode as a first-class field, the response's model string (a silent upstream substitution would be invisible), cost, the system prompt actually used per call, the request context that shaped the prompt (`promptType`, `platform`, `angle`), total tokens, and client-side latency.

### 4.2 What Ada captures

`model_usage`: `user_id`, `session_id`, `call_type` (21 values), `model`, `input_tokens`, `output_tokens`, `web_search_requests`, `cost_usd`, plus the Mythos CHECK. Written by `recordModelUsage()` after a successful call; nineteen call sites. The Spend tab aggregates it.

What is missing, verified by grep across `supabase/functions/`: no `duration_ms` anywhere, no `status` or `error_code`, no row written when a call fails or times out, no `request_id` or turn identifier to group the two to three calls one discovery turn makes (evaluator, coach, optionally a capability), no `max_tokens` recorded at call time, no response model string (the wrapper sends `opts.model` and never reads the reply's `model` field, the same gap Builder Journal flagged in itself), and no persisted record of which system prompt version or directive variant a call used. The 53-second hang was diagnosed from Supabase function logs by timestamp arithmetic, which is exactly the situation a `duration_ms` column exists to prevent.

### 4.3 What to carry into Ada

**T1. Widen the trace row.** Add to `model_usage` (or a new `model_calls` table if D-3 lands on a parallel table for non-LLM spend): `duration_ms`, `status` (`ok`, `timeout`, `retry_ok`, `upstream_error`, `malformed_output`, `client_error`), `http_status`, `attempts`, `request_id`, `turn_id` (one per discovery turn so the evaluator, coach, and capability rows join), `max_tokens`, `response_model`, `prompt_version` (the `coaching_prompts.id` for chat, the contract id and variant for kickoff, a hash of the composed system string otherwise), `stop_reason`. Write the row on every exit of `callClaude`, including the ones that throw. Tokens and cost stay null on failure; that is what the row is for. Effort: M. This is the precondition for every latency and reliability number the Evals and Trace cohort will ask for.

**T2. Latency budgets as data, with the 53-second hang as the baseline.** `REQUEST_TIMEOUT_MS` is hardcoded at 20 s from a measured p99 of 5 to 7 s. Once `duration_ms` exists, publish p50, p95, and p99 per `call_type` and set the timeout per call type from the data (an intel call legitimately runs 60 to 90 s; a coach turn should not). Builder Journal's per-action limits table is the shape; Ada's `intel-config.ts` is already halfway there for searches.

**T3. A debug page that reads the deployed function, not the repo.** Port `debug-limits`: an owner-only action on each Ada function (or one `admin-config` function) that returns the live model routes, timeouts, search budgets, and a `BUILD_STAMP`. Then the admin Spend tab can show "what is deployed" beside "what was spent". Effort: S per function once the stamp script exists.

**T4. Deploy stamps and a health page.** Port `scripts/stamp-functions.mjs` (a content hash of `index.ts` plus its directly imported `_shared` files, returned as a header on OPTIONS) and the three-layer verification rule from `docs/rules.md`: functions, frontend, database, each checked on its own. Ada's tracker reconciliation on 2026-09-15 did this by hand and found that twelve functions import `anthropic.ts` but only some had been redeployed since the fix. A stamp would have answered that in one page load. Effort: M.

**T5. A trace inventory document for Ada.** Builder Journal's `trace-inventory_2026-09-15.md` is a template: input shape, output shape, model string capture, system prompt location, timing and cost already measured, persistence per table, admin surface, available today, not captured. Write it for `discovery-turn` and `chat` first. It is the document the cohort will expect before any instrumentation change, and it forces the gaps above into the open. Effort: S.

**T6. Keep the metadata-only rule where it applies, and say where it does not.** Ada's `model_usage` is already metadata-only. Ada's function logs are not: `assumption-mapping` writes the raw model text to `console.error` on malformed output, and the coach's system context carries redacted intake text. Decide the rule explicitly (recommended: metadata-only in tables and logs, raw output stored to an owner-only `model_failures` table with a retention window rather than to the log stream) and write the standing comment the way Builder Journal did.

---

## 5. Tokenomics

### 5.1 Where Ada is already stronger

- `MODEL_PRICING` and `computeCostUsd()` with web-search cost at a per-request rate; unknown models cost out as null rather than zero.
- Config-driven routing (`app_settings.model_routing`) with a hard refusal of Mythos-tier models in code and in the database.
- `intel_search_budget` with allocation rules that provably hold across multi-call runs, and per-call search ceilings derived from a measured gateway limit (150 s) and measured call durations (5-search calls at 60 to 90 s).
- Credits: `credits_remaining`, `daily_message_limit`, lazy daily reset, 402 `credits_exhausted`.
- Cost visibility in the admin Spend tab, including coaching chat since 2026-07-10.

Builder Journal has none of this. It does not compute cost at all.

### 5.2 What Builder Journal does that Ada should copy

**K1. One visible table of per-call envelopes.** `ACTION_LIMITS` puts `maxInputChars` and `maxOutputTokens` for all ten actions in one place, applies truncation server-side, flags `truncated` in the trace row, and exposes the table live to admins. Ada's `maxTokens` values are per call site. Move them into a `call_envelopes` setting beside `model_routing` (per `call_type`: `max_input_chars`, `max_output_tokens`, `timeout_ms`, `search_cap`), read at call time, recorded in the trace row. Effort: S to M.

**K2. Treat rate limit and credits exhausted as first-class trace outcomes.** Builder Journal logs `rate_limited` (429) and `credits_exhausted` (402) as rows. Ada returns 402 from `chat` but writes nothing, so the Spend tab cannot show demand that was refused. Refused demand is the number a pricing decision needs (the backlog's freemium item says to wait for "real per-user cost data"; refused calls are half of that data).

**K3. "Never auto-fire an AI call on a routine action."** A standing rule in `docs/rules.md`: every AI affordance is manual-trigger unless explicitly decided otherwise, because auto-fire silently spends credits. Ada's kickoff (one credit on arrival, no user action) and the planned scheduled re-grounding (L3 autonomy) both cross this line deliberately. That is fine; write the rule with its exceptions so the next feature does not cross it by accident.

**K4. Character-count proxies beside token counts.** Cheap, model-independent, and they survive a model swap. Add `input_chars` and `output_chars` to the trace row.

**K5. An outcome field instead of, or beside, thumbs.** Builder Journal deferred per-suggestion thumbs and proposed recording what the user did with the result (`applied`, `dismissed`, `applied_then_undone`) on the usage row, because behavior is a cleaner label than a rating. Ada already has thumbs on assistant messages and a `user_feedback` table. The behavioral analog in Ada is whether a mapped assumption was later prioritized, challenged, or abandoned (already in `assumption_status_history`) and whether a suggested action from the evaluator was accepted or overridden by the PM. Joining those to the trace row is the labeled dataset the Evals cohort will ask where to find.

### 5.3 Levers already identified in Ada's own analysis, restated as cohort deliverables

These come from the 2026-09-12 analysis (section 5.2 there) and the backlog; they are listed here so Part 1 is complete on its own.

1. **Prompt caching on stable system prompts.** The coach persona, framework catalog, and evaluator prompt are stable per session and unexploited. Measurable as cached input tokens per turn once the trace row records them. The `claude-api` skill reference should be used to confirm current cache pricing and the minimum cacheable prefix before quoting numbers in a write-up.
2. **Summarize-then-store for extracts.** Haiku compresses once, downstream calls read notes. Measurable as input tokens per intel call before and after.
3. **Route audit.** Every new mechanical call defaults to Haiku; the routing setting already supports it.
4. **Per-agent budgets.** Extend the search ledger to tokens and extract credits so background work cannot starve a foreground session.

One caution on the pricing table: `MODEL_PRICING` is hardcoded with a source date of 2026-06-24. Any cohort artifact that quotes cost per session should re-verify the rates against the `claude-api` reference on the day it is written and state the date.

---

## 6. Security and privacy

### 6.1 Patterns in Builder Journal worth porting

- **Metadata-only logging as a standing invariant** (section 4), then a **privacy-surfacing audit**: inventory every user-facing surface, classify each as absent, vaguer than the fact, or contradicting it, draft copy per surface in that surface's voice, stop for approval. The audit found one live contradiction (a docs page claiming the privacy policy said something it did not).
- **Roles in a separate `user_roles` table with a `SECURITY DEFINER has_role()` function**, admin-only writes, so self-promotion is structurally blocked. Ada reaches the same end through column-level grants on `user_profiles.role`; both are sound, and Ada's audit already covers it.
- **HIBP breach checking** (`password_hibp_enabled = true`), session revocation ("sign out of all other sessions"), rate-limit UX with a live countdown from the 429's retry seconds. Ada's backlog lists all three; the first is a dashboard toggle.
- **SSRF guard on URL fetching** (`fetch-url-metadata` blocks private, loopback, link-local, and cloud-metadata ranges, resolves DNS and re-checks each redirect hop). Ada will need exactly this the moment Tavily Extract accepts a nominated URL (decision D-4). One caution: `docs/rules.md` and the `/docs/security` page say every Edge Function input is Zod-validated, and a grep of `supabase/functions` finds no Zod import anywhere; validation is manual, like Ada's `bridge-payload.ts`. The lesson is about documentation drift, not validation: a security page that claims a library the code does not use is the kind of thing Builder Journal's own catalogue-parity test exists to catch, and it does not cover prose.
- **Data-isolation eval at the policy layer.** Inside a transaction that is rolled back, set the session role and identity claims to impersonate user A, query as A for B's rows across every table, assert zero, repeat in the other direction. Sixteen assertions, manual. Ada's 2026-08-23 audit dumped `pg_policies` and ran two-user queries; turning that into a repeatable script is the difference between an audit and an eval.
- **Guard-order probe.** One request with no signature and an invalid body; the single response status distinguishes "signature checked first" from "body checked first" from "neither". Ada's `bridge-intake` is the endpoint this matters for, and it is the cheapest security eval available (two assertions).

### 6.2 What Ada has that Builder Journal lacks

Column-level GRANTs, owner-only RAG tables, HMAC bridge auth with constant-time comparison and replay protection, PII redaction before storage or embedding, detach-and-cascade account deletion with a tombstone, rollback on partial bridge failure, and a written RLS audit. Builder Journal has no equivalent to any of these except RLS itself.

### 6.3 What to carry into Ada

**S1. A privacy-surfacing pass for Ada, using Builder Journal's four steps.** The fact to surface is different and heavier: Ada stores full coaching transcripts, retains them after account deletion with `user_id` nulled, and (per the backlog's open decision) has not yet chosen between "we never keep anything from your documents" and "we keep key facts". Ada's `/privacy` page discloses retention; the Settings danger zone does too. What has not been done is the inventory across every surface (login, landing when it exists, sprint header, export footer, share pages, the bridge arrival) with the contradiction check. Effort: S, and it must precede any external user under the standing rule.

**S2. Log hygiene audit.** Grep every `console.*` in `supabase/functions/` for user content. Known hit: `assumption-mapping` raw output. Likely hits: any function that logs a request body on validation failure. Fix pattern: log lengths and a hash, store the body somewhere owner-only if it is needed for debugging.

**S3. Repeatable isolation script** for the tables the bridge creates rows in (`user_profiles`, `products`, `sessions`, `conversations`, `messages`, `bridge_identities`, `bridge_handoffs`), registered in the eval manifest as `data isolation, manual`, run before the first external user and after every RLS migration.

**S4. Guard-order probe against the deployed `bridge-intake`.** Two assertions, five minutes, and it is a bridge eval both repos can list.

**S5. Flip the HIBP toggle and add session revocation** from the backlog; both are small and both are checklist items for a security-conscious reviewer.

---

## 7. AI engineering patterns

### 7.1 Builder Journal patterns that transfer

**The three-layer contract: prompt asks, guard verifies, renderer constrains.** `FORMAT_RULES` and `PRESERVATION_CORE` in the prompt; `normalizeAiText()` as a deterministic guard that restores dropped images and links by URL, counts dropped dividers without restoring them, and returns a report object on every run; a renderer that accepts only an allow-list. The design principle stated in `rules.md`: the guard reports and never repairs silently, because the only correct place for a repair is where the user can see it and undo it. Ada's analog is the URL-survival filter plus `honestConfidence` (the "anti-hallucination spine" from the 2026-09-12 analysis), which is a guard without a report. Adding the report (how many claims were dropped for lacking a surviving URL, per call) turns the guard into an eval source.

**Layered prompt composition with each rule in exactly one place.** Six role variants layered on four or five shared blocks, and a written rule that no rule may live in two places. Ada's prompts are per-file constants; the persona lives in the database (`coaching_prompts`) for chat but in code for the loop. Worth a small refactor so the persona has one source and both surfaces read it, then one contract covers both.

**Forced tool call for structured output.** `idea-to-prompt` uses a tool definition so the gateway returns arguments, not prose. Ada uses `extractFirstJson` over free text in seven functions and pays for it with 502s. Anthropic's `tool_use` with a single tool and `tool_choice` forcing it is the equivalent, and it is the cheapest way to raise the assumption-mapping success rate before adding the self-correction retry. The retry then handles the residue, and the retry rate becomes the eval metric the backlog already names.

**Preview before apply, with undo.** Every AI result in Builder Journal is a suggestion the user accepts, and every restore the guard performs is announced and reversible for five seconds. In Ada the equivalent moment is the assumption-mapping result and the competitor confirm gate. The confirm gate exists; a preview-and-edit step before assumptions are inserted does not.

**Claim-first idempotency.** `seed-onboarding` flips its flag with a conditional update before inserting so exactly one concurrent request seeds. Ada's `admin-feedback-reply` uses the same claim-then-send-then-roll-back pattern independently. Both repos arrived at it from a real double-write bug; write it down once as the house rule for anything that spends money or sends mail.

**A shared type owns a shared shape.** Two Builder Journal surfaces typed the same AI suggestion inline; when a `mode` field was added they drifted and the Apply toast said "expanded" after a Polish. The rule now: if two components hold the same shape, one exported type owns it. Ada's `discovery-api.ts` and `portfolio-api.ts` are the place to check for this.

**Error taxonomy mapped to user sentences, and tested.** The handoff payload suite has 26 assertions, most of them "this server error code produces this exact sentence". The live finding it did not catch (a guard reported as an outage) was an HTTP status, not a sentence. Ada's `discovery-turn` has the sentence ("Ada is taking a moment. Your message is in the thread, try again.") and should have the table.

**Where a contract lives matters.** The arrival directive's contract sat in Builder Journal beside its case study for one day, needed a commit on each side for a single clause, and moved to Ada where its validator runs in Ada's CI. The copy left behind is marked superseded, not kept in step. This is the right call and it generalizes: contracts live next to the code they constrain, write-ups may quote them.

### 7.2 Builder Journal patterns not to carry over

- Routing every call through a third-party gateway with an opaque model string and no response-model capture. Ada's raw fetch with a known model is the better position.
- No cost computation. Ada already has it.
- No Edge Function tests. Ada's Deno-free `_shared` helpers are the right structure; keep pushing logic into them.
- Manual evals with no re-run on release. Builder Journal's own `limitation` field says this; Ada's version should be scheduled or CI-driven where the check is deterministic.
- Two committed lockfiles and an advisory lint step. Ada has the same advisory lint (38 errors as of 2026-09-12); clear it before the cohort submission, since a reviewer will notice `continue-on-error: true`.

---

## 8. Carry-over plan

Sequenced for the cohort calendar. Effort is S (under a session), M (one to two sessions), L (several). "Course" says which cohort the artifact serves most directly: AE (AI Engineering) or ET (Evals and Trace).

| # | Item | Effort | Course | Depends on |
|---|---|---|---|---|
| T5 | Trace inventory doc for `discovery-turn` and `chat` | S | ET | none |
| E6 | Adopt labeling rules (observed/inferred, deploy-verified, status notes) as a docs rule | S | ET | none |
| S4 | Guard-order probe on `bridge-intake` | S | ET | none |
| T1 | Widen the trace row: duration, status, error code, request and turn ids, response model, prompt version; write on every exit | M | ET | none |
| E1 | Eval manifest, live-findings register, and page (public or admin, see Q1) | M | ET | none, richer after T1 |
| E3 | Prompt contracts for persona, evaluator, assumption-mapping | S each | AE | none |
| K1 | `call_envelopes` setting and truncation flag | S to M | AE | T1 |
| K2 | Trace refused demand (402, 429) | S | AE | T1 |
| E2 | Score the RAG eval: deterministic layer, then a non-Anthropic judge | M | ET | none |
| 7.1 | Forced tool use for structured outputs, then self-correction retry with retry rate as metric | M | AE | T1 for the metric |
| T4 | Deploy stamps and a health page | M | AE | none |
| E4 | Groundedness eval over evidence tables (feeds the Tavily A/B) | M | ET | T1 |
| E5 | Evaluator action-distribution eval | M | ET | T1 |
| S1 | Privacy-surfacing pass | S | AE | none; required before external users |
| S2 | Log hygiene audit | S | AE | none |
| S3 | Repeatable isolation script | M | AE | none |
| T2 | Per-call-type latency budgets from measured percentiles | S | ET | T1, two weeks of rows |
| 5.3 | Prompt caching, measured | M | AE | T1 |

The first five rows are the ones to do this week. Together they produce a trace inventory, a widened trace, a published eval catalogue with a live-findings register, and two small evals, which is a complete Evals and Trace story before any new model feature is written.

---

## 9. Risks and disagreements

- **Risk: building the page before the numbers exist.** An eval catalogue with ten entries that all say `runsIn: manual` and `limitation: never re-run` is honest but thin. Do T1 alongside E1 so the first page already has latency and failure data behind it.
- **Risk: judge-model theater.** Scoring the RAG harness with a Claude judge would be the fastest path and the weakest claim. Builder Journal's rule (non-vendor grader, human spot-check, deterministic first) is stricter than most cohort work and worth the extra hour.
- **Disagreement with the backlog's ordering.** The backlog puts the Tavily Extract spike ahead of trace widening. Reversed here: the A/B eval the spike exists to serve cannot report p95 latency or cost per profile until `duration_ms` and failure rows exist, and D-3 (how non-LLM spend is traced) is easier to decide once the trace row has been redesigned anyway.
- **Disagreement with treating the RAG lane as untouchable.** The backlog keeps the RAG redesign as Mo's own learning lane. Scoring the existing harness (E2) does not redesign anything; it closes an open experiment, and leaving it unscored is the one item a reviewer of `docs/eval/` will ask about first.
- **Flag: transcript retention is a product position, not an oversight, and it needs the same precision Builder Journal gave its opposite.** "We keep your coaching transcripts to improve Ada, de-linked from your account after deletion" is a true and defensible sentence. It needs to be said in the same words on every surface.

---

## 10. Questions on Ada's direction

Answers change what gets built, not whether. Assumptions used in this document are stated with each.

1. **Should Ada's eval catalogue be public (`/docs/evals`, shareable with a cohort or interviewer) or an owner-only admin tab?** Assumed public, matching Builder Journal and the existing public `the-53-second-hang` write-up.
2. **Trace storage (decision D-3): widen `model_usage`, or add a `model_calls` trace table and keep `model_usage` as the cost ledger?** Assumed a new table if non-LLM spend (Tavily) is coming, since the Mythos CHECK and pricing lookup both assume Anthropic model IDs.
3. **Which non-Anthropic grader?** The Lovable gateway route to Gemini already exists in Builder Journal; an OpenAI key already exists in Ada for embeddings. Assumed the latter for the RAG judge because the secret is already there.
4. **Is the RAG harness still Mo's own lane, or may the scoring be delegated?** Assumed scoring may be delegated and redesign may not.
5. **Does the cohort calendar want the trace and eval work before or after the Tavily spike?** Assumed before, per section 9.
6. **Is transcript retention after deletion staying?** Assumed yes; the privacy pass will state it.

---

## Appendix A. Files consulted

**Builder Journal (`/home/user/davincibuilderjournal001`, v2.41.0):** `docs/rules.md` (Architecture, Business Logic, Integrations, Documentation, Versioning, Security, Admin System Health, Deploy verification); `docs/evals/trace-inventory_2026-09-15.md`; `docs/evals/privacy-surfacing-proposal_2026-09-15.md`; `src/pages/docs/evals-manifest.ts`; `public/aibuilder-week2-eval/index.html` and `v3/index.html`; `docs/portfolio/ada-bridge-last-mile/README.md` and `contracts/*.yaml`; `supabase/functions/ai-assist/index.ts` (`ACTION_LIMITS`, `MODEL`, premium gate, `logAiUsage`); `scripts/stamp-functions.mjs`; `.github/workflows/ci.yml`; `docs/changelog.md` (headings).

**Ada Coach (`/home/user/ada-coach`):** `CLAUDE.md`; `docs/prds/ada-discovery-coach-v3.md` and addendum; `docs/backlog/ada-coach-backlog-v1.md`; `docs/eval/20260502_ADA_EVAL_RAGEvalHarness_v0.1.md` and `docs/eval/results/*`; `scripts/rag-regression.mjs`; `docs/analysis/2026-09-12-tavily-and-agent-architecture.md`; `docs/architecture/watch-items.md`; `docs/audits/2026-08-23-rls-audit.md` and `2026-09-15-tracker-reconciliation.md`; `docs/portfolio/the-53-second-hang/README.md`; `supabase/functions/_shared/{anthropic,usage,models,intel-config,evaluator}.ts`; `supabase/functions/_shared/contracts/bridge-arrival-directive.yaml` and `validate-contract.mjs`; `supabase/functions/{assumption-mapping,discovery-turn,admin-retrieval-debug}/index.ts`; `.github/workflows/ci.yml`; `package.json`.
