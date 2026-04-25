# Auth & Authorization Security Audit — 2026-04-18

**Status:** Items #1 and #2 fully deployed and verified (2026-04-25). Items #3–#10 not yet acted on.

---

## Remediation status (pick up here after restart)

| # | Severity | Item | Code change | Deploy step | Done? |
|---|----------|------|-------------|-------------|-------|
| 1 | 🔴 Critical | Lock down `user_profiles.role` self-update | `supabase/migrations/20260418150000_lockdown_user_profiles.sql` | `supabase db push` | ✅ Deployed 2026-04-25 |
| 2 | 🟡 Medium | CORS allowlist (no more `*`) | `supabase/functions/_shared/auth.ts` + all 4 function files threaded `req` | Set `ALLOWED_ORIGINS` secret + redeploy 4 functions | ✅ Deployed 2026-04-25 |
| 3 | 🟡 Medium | Email enumeration via `email_exists` code | — | — | Not started (UX trade-off pending decision) |
| 4 | 🟡 Medium | App-level rate limiting on `/chat` and admin endpoints | — | — | Not started (backlog B-003) |
| 5 | 🟡 Medium | `handle_new_user` swallows exceptions silently | — | — | Not started |
| 6 | 🟢 Low | Tokens in localStorage | — | — | Accepted as standard SPA risk |
| 7 | 🟢 Low | Password min 8, no complexity | — | — | Accepted (NIST 800-63B aligned) |
| 8 | 🟢 Low | No password reset flow | — | — | Not started |
| 9 | 🟢 Low | `user_profiles.email` can drift from `auth.users.email` | — | — | Cosmetic |
| 10 | 🟢 Low | No audit trail for role changes | — | — | Nice-to-have once #1 is shipped |

### Deployment record (completed 2026-04-25)

All steps executed and verified:

```bash
supabase db push                        # applied 20260418150000_lockdown_user_profiles.sql
supabase secrets set ALLOWED_ORIGINS="http://localhost:5175,https://ada-coach.vercel.app"
supabase functions deploy chat
supabase functions deploy admin-conversations
supabase functions deploy admin-prompts
supabase functions deploy admin-insights
```

Merged to `main` via branch `security-hardening` (commit `fd9b5b6`).

### Quick verification

- **Role lockdown:** signed-in user runs `supabase.from('user_profiles').update({ role: 'owner' }).eq('id', userId)` → errors with permission/grant denial. ✅
- **CORS:** `https://ada-coach.vercel.app` and `http://localhost:5175` work; any other origin fails the browser preflight. ✅

---

## TL;DR — the urgent fix

🔴 **Any logged-in user could promote themselves to `owner` from the browser console.**

Reason: the RLS policy at `supabase/migrations/20260415120000_auth_schema.sql:153-157` lets a user `UPDATE` their own `user_profiles` row, the `role` column has no column-level grant restriction, and the table check at line 30 (`role in ('user','admin','owner')`) accepts `'owner'` as a valid value. Combined, anyone with a session could run:

```js
await supabase.from('user_profiles').update({ role: 'owner' }).eq('id', user.id)
```

…and `requireAdmin()` (which re-reads the role from the DB on every call) would then grant them full admin powers.

**Fix:** mirrored the `messages.feedback` column-grant pattern — `revoke update on user_profiles from authenticated; grant update (display_name) on user_profiles to authenticated`.

---

## What we're doing well (don't regress these)

- **JWTs are validated for real.** `requireUser()` in `supabase/functions/_shared/auth.ts:62-81` calls `service.auth.getUser(jwt)` — the Supabase SDK checks signature and expiration.
- **Role is always re-read from the database**, never trusted from JWT claims. `requireAdmin()` (`auth.ts:103-128`) hits `user_profiles` server-side every time. The frontend `auth-context.tsx` does the same on every auth state change. (This is what makes the critical finding above so impactful — fixing the RLS hole closes it cleanly.)
- **Conversation ownership is checked correctly in `chat`.** Before the service-role client writes anything, `chat/index.ts:94-108` uses the RLS-bound `userClient` to confirm the user owns the conversation_id. A user can't smuggle a `conversation_id` belonging to someone else.
- **Anonymous role is locked out everywhere.** No table grants `anon` any policy.
- **The good column-grant pattern exists** for `messages.feedback`. Authenticated users can update *only* the feedback column on their own assistant messages.
- **No backend secrets in the frontend.** `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` only appear server-side. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are bundled.
- **`.env.local` is properly gitignored** (`.gitignore` excludes `.env`, `.env.local`, `.env.*.local`).
- **Auth uses bearer tokens in headers, not cookies.** Inherently CSRF-resistant — browsers don't auto-attach `Authorization` headers cross-origin.
- **Markdown is rendered safely.** `ReactMarkdown` with only `remarkGfm` (no `rehype-raw`) doesn't render raw HTML.
- **No raw SQL or `.rpc()` calls from the frontend.** All DB access goes through the Supabase JS client, which parameterizes everything.
- **All four Edge Functions use the same auth pattern.** `chat`, `admin-conversations`, `admin-prompts`, `admin-insights` all set `verify_jwt = false` in `config.toml` and validate via `requireUser`/`requireAdmin`.

---

## Weaknesses & threats (full detail)

### 🔴 Critical — fix soon

**1. Privilege escalation via `user_profiles.role` self-update** *(remediated in code)*
- **Where:** `supabase/migrations/20260415120000_auth_schema.sql:153-157`
- **Threat:** Any authenticated user can elevate themselves to `admin` or `owner`, then read all conversations across all users, modify the active coaching prompt, and see all feedback in the Insights tab.
- **Why exploitable today:** RLS allows the user to update their own row; no column-level grant restricts which columns; check constraint allows `'admin'` and `'owner'`; `requireAdmin()` re-reads role from DB and trusts it.
- **Pattern applied:** Mirror of `messages.feedback` column grant — see new migration `20260418150000_lockdown_user_profiles.sql`.

### 🟡 Medium — hardening, plug in next pass

**2. CORS allowed any origin (`*`)** *(remediated in code)*
- **Where:** `supabase/functions/_shared/auth.ts:10` (was `Access-Control-Allow-Origin: "*"`)
- **Threat:** Limited in this architecture (bearer tokens aren't auto-attached cross-origin), but any page that obtains a token via XSS elsewhere could call our functions from any origin without CORS friction.
- **Fix applied:** `corsHeaders` is now a function that reads an `ALLOWED_ORIGINS` env var (comma-separated), echoes the request Origin only when allowlisted, and includes a `Vary: Origin` header. Defaults to `http://localhost:5175` when unset.

**3. Email enumeration via `email_exists` code** *(not yet acted on)*
- **Where:** `src/lib/auth-context.tsx` returns `code: 'email_exists'` on signup; `src/pages/Login.tsx:108-110` displays "An account with this email already exists" with a "Try signing in" link.
- **Threat:** An attacker can probe arbitrary emails to discover registered accounts.
- **Trade-off:** Removing this hurts UX (users typing the wrong form won't know). Possible middle ground: always say "If this email isn't registered, we've sent a confirmation link" + send (or pretend to send) — adds complexity. **Decision pending.**

**4. No app-level rate limiting** *(not yet acted on)*
- **Where:** Not implemented in any Edge Function. Supabase Auth has its own (~5 req/sec/IP) but `/functions/v1/chat` and admin endpoints inherit no limit.
- **Threat:** A user with a valid session could burn through Anthropic credits via `/chat` spam.
- **Note:** Already on backlog as B-003.

**5. `handle_new_user` trigger silently swallows errors** *(not yet acted on)*
- **Where:** `20260415120000_auth_schema.sql:75-77`
- **Threat:** If profile creation fails, signup still "succeeds" but the new user has no `user_profiles` row. They'll then get 500s from `requireAdmin`. Reliability/observability gap more than security.

### 🟢 Low / informational

6. **Tokens in localStorage** (Supabase default) — standard SPA practice, vulnerable in theory to XSS, but our XSS surface is small.
7. **Password 8-char min, no complexity** — acceptable; modern guidance prefers length over complexity.
8. **No password reset / forgot-password flow** — Supabase Auth supports `resetPasswordForEmail`; wire up before real users.
9. **`user_profiles.email` drift from `auth.users.email`** — cosmetic; admin functions don't use it for identity.
10. **No audit trail for role changes** — after #1, an `audit_log` table for role changes would be a safety net.

---

## How the critical finding was confirmed

- Read `supabase/migrations/20260415120000_auth_schema.sql:25-33` (table definition with `check (role in (...))`)
- Read same file, lines 145-162 (RLS policies on `user_profiles` — only `id = auth.uid()` is checked)
- Compared against `supabase/migrations/20260418100000_message_feedback.sql` (the column-grant pattern that *is* applied on messages but isn't on user_profiles)
- Traced `requireAdmin()` in `supabase/functions/_shared/auth.ts:103-128` to confirm role is re-read from DB and trusted at face value
- Verified `.gitignore` excludes `.env*` files and there are zero `.rpc(` calls in `src/`
- Confirmed in Supabase logs that `admin-prompts`/`admin-conversations` patterns work identically

---

## Files touched in this remediation pass

```
supabase/migrations/20260418150000_lockdown_user_profiles.sql   NEW
supabase/functions/_shared/auth.ts                              MOD (corsHeaders → function, jsonResponse takes req)
supabase/functions/chat/index.ts                                MOD (CORS req threading)
supabase/functions/admin-conversations/index.ts                 MOD (CORS req threading)
supabase/functions/admin-prompts/index.ts                       MOD (CORS req threading)
supabase/functions/admin-insights/index.ts                      MOD (CORS req threading)
```

No frontend changes were required for #1 — `Settings.tsx` only edits `display_name` already, so the new column-grant doesn't break anything.

---

## Remaining items (#3–#10)

Items #3–#10 are not yet acted on. Prioritized:

- **#3 Email enumeration** — UX trade-off decision pending; medium severity.
- **#4 Rate limiting** — backlog B-003; medium severity, blocks abuse of Anthropic credits.
- **#5 `handle_new_user` silent errors** — observability gap; investigate before real user launch.
- **#8 Password reset flow** — required before real users; Supabase `resetPasswordForEmail` is ready to wire up.
- **#10 Audit trail for role changes** — nice-to-have now that #1 is shipped.
- **#6, #7, #9** — accepted or cosmetic; revisit if threat model changes.
