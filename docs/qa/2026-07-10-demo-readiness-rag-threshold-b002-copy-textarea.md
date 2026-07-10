# QA — Demo-readiness: RAG threshold, B-002 spend tracking, router copy, RAG Debug textarea

Date: 2026-07-10
Task slug: demo-readiness-rag-threshold-b002-copy-textarea

## Files changed

- `supabase/functions/chat/index.ts` — RAG retrieval `match_threshold` 0.60 → 0.45 (inside the still-commented `ARM B EVAL: RAG DISABLED` block, per `CLAUDE.md`'s "do not delete the block" rule); added `recordModelUsage()` import and call (`call_type: 'chat'`) after the assistant message is persisted.
- `supabase/functions/_shared/models.ts` — added `"chat"` to the `CallType` union and a matching `DEFAULT_MODEL_ROUTES` entry (`"claude-haiku-4-5"`), required for `recordModelUsage`'s `callType: CallType` parameter to type-check; chat itself still hardcodes its own model constant and does not call `getModelFor`.
- `src/pages/Index.tsx` — router-entry card subtitle split from one comma-joined clause into two sentences.
- `src/pages/Admin.tsx` — RAG Debug "Test message" textarea `rows={4}` → `rows={8}`.

## Logic (one sentence each)

1. Chat's RAG retrieval path (dead code today, but the value that ships when the `ARM B EVAL` gate lifts) now uses the eval-recommended 0.45 threshold instead of 0.60, which the eval found retrieved almost nothing (1/15 test questions).
2. `chat/index.ts` already computed and stored `token_count` per message but never reported that spend to `model_usage`, so B-002 wired the existing `recordModelUsage` helper into the one place chat writes are finalized — the assistant-message insert path already used by every other Claude-calling function in the repo.
3. The router card's subtitle read as a single run-on clause joining two unrelated ideas (mechanism, then reassurance) with a dash and a comma; splitting it into two sentences matches the same fix pattern already applied elsewhere in the backlog's "grammar pass on router copy" item.
4. The RAG Debug textarea's default height (4 rows) truncated realistic test messages before submission, so the default was doubled to 8 rows — the simplest fix that matches the backlog wording ("larger default height"), no auto-grow behavior was requested or added.

## Scope note (deviation from the /goal instruction, flagged not silently changed)

The instruction described item 1 as changing the threshold "in `match_document_chunks` (the retrieval SQL function)" and implied a small schema migration. I did not touch the SQL function or add a migration: `match_document_chunks`'s `match_threshold` is a plain function **parameter** with no hardcoded value and no `DEFAULT` — there is no `0.60` literal inside the `.sql` file to change. The only hardcoded `0.60` that represents "production" (the value the live `chat` function would pass once RAG is re-enabled) lives in `chat/index.ts:239`, so that's what was changed. A second, unrelated `0.60` default (`DEFAULT_THRESHOLD` in `admin-retrieval-debug/index.ts`, the owner-only debug tool's fallback when no threshold is specified in a debug request) was deliberately left untouched — it isn't "production," and changing it wasn't asked for. Confirmed via `advisor()` before implementing.

## Quiz

**Q: If RAG is re-enabled tomorrow by removing the `ARM B EVAL` comment gate in `chat/index.ts`, what threshold will production coaching chat actually use for retrieval — and does today's change touch what the RAG Debug admin tool defaults to when an owner runs a test without specifying a threshold?**

A: Production chat will use 0.45 (the value now sitting inside the previously-0.60 `match_threshold` argument at `chat/index.ts:239`, which is otherwise unreached while the surrounding block stays commented out). The RAG Debug admin tool's own default (`DEFAULT_THRESHOLD = 0.6` in `admin-retrieval-debug/index.ts`) is untouched by this change — an owner running a debug query without an explicit `threshold` in the request body still gets 0.6 unless they type in 0.45 (or another value) themselves. These are two independent constants today; there is no shared source of truth between the "what chat will use when re-enabled" value and "what the debug tool defaults to," which is worth a follow-up if that divergence becomes confusing during the eval.

Quiz result: **pass**

## Verification performed

- `npm run type-check` — clean (no output, exit 0).
- `npm run test -- --run` — 48/48 tests pass across 5 files, including `models.test.ts` (16 tests) unaffected by the new `chat` `CallType` entry.
- `npm run lint` — pre-existing environment failure (`Cannot find package 'eslint-plugin-react-hooks'`), unrelated to this change; not attempted to fix, out of scope.
- Dev server started (`npm run dev`, port 5175) and reached in Chrome to visually confirm the two UI fixes; the app requires an authenticated login (`/login`) that this agent does not have credentials for and should not enter per the credential-entry rule, so the router card and RAG Debug tab were not visually confirmed in-browser. Confirmed instead by reading the compiled JSX/TSX source and the clean type-check. Recommend Mo do a 30-second manual look (see Verification section below) to close this out visually.
