# Spec 1 — Account Deletion & Data Retention

**Date:** 2026-08-22
**Status:** Draft, awaiting review
**Author:** Mo + Claude (brainstorming session)
**Related:** Spec 2 (admin feedback reply surface), Spec 3 (Privacy Policy & Terms)

---

## 1. Why

User feedback collected 2026-07-16 → 2026-08-08 contains two explicit requests:

- *"…ete an account. not compliant with GDPR."*
- *"…ount, and sent confirmation to my email."*

Ada Coach has no way for a user to delete their account. This spec adds one.

It is not a bid for full GDPR certification. Ada Coach is a portfolio and demo
product, and conversation transcripts are deliberately retained for research and
model improvement. The goal is an honest, working deletion path plus disclosure
that accurately describes what is kept.

## 2. Goals

1. Any signed-in non-owner user can permanently delete their own account.
2. Deletion destroys their identity, portfolio, products, documents, and files.
3. Deletion retains a tombstone (name, email, signup date, deletion date), their
   submitted feedback, and their de-identified coaching transcripts.
4. The user receives a confirmation email.

## 3. Non-goals

- Grace period, soft delete, or undo. Deletion is immediate and irreversible.
- Admin-initiated deletion of another user. Owner has SQL access; a second
  destructive surface is unrequested scope.
- Redacting PII from retained message bodies. Justified by evidence: 0 of 207
  user messages contain a detectable email, phone number, honorific, URL, or
  "my name is" pattern. Write-time redaction is backlogged separately.
- Privacy Policy / Terms pages. Spec 3.
- Replying to feedback. Spec 2.

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Detach-and-cascade**, not enumerate-and-delete | All 27 FKs to `auth.users` are already `ON DELETE CASCADE`. Detaching the few retained tables makes scrubbing the automatic default — a table added next month is scrubbed for free. Enumerate-and-delete inverts that: new tables silently retain data until someone remembers. |
| D2 | Retain `user_feedback` **attributable** to the tombstone | Mo's retention list groups feedback with name/email. Being able to see who reported what enables follow-up (Spec 2). |
| D3 | Retain conversations **de-linked only**, no content redaction | Evidence: 0/207 messages contain detectable PII. `redactPII()` is lossy and would mangle product names into `[NAME_1]`, degrading the corpus this retention exists to serve. |
| D4 | **Immediate** deletion + typed confirmation | No scheduler, no pending state, no gap between what the UI promises and what is true. |
| D5 | **Research-first** retention posture | Conversations, sessions, and assumptions are retained de-linked. Portfolio and products are destroyed. Disclosure (Spec 3) must state that transcripts are retained and may describe the user's work. |
| D6 | Owner accounts **cannot** self-delete | Prevents destroying admin access during a portfolio demo. Returns 403. |
| D7 | Confirmation email is **best-effort** | Deletion is irreversible and precedes the send. A failed send cannot be retried against a deleted account. Log server-side; never fail the request. |

### D5 in plain language

"Delete my product ideas" and "retain my conversations for research" are in
tension: a Discovery Sprint transcript *is* the product idea, at length.
De-linking removes the name, not the idea. Deleting the 60-character
`products.description` while keeping a 200-message transcript describing the same
thing is not a privacy guarantee.

Mo chose research-first knowingly. The obligation this creates is on Spec 3:
the policy must say transcripts are retained anonymously and may describe the
user's work. Anything softer would be a false promise.

## 5. Retention matrix

Complete. Every FK to `auth.users` was traced via `pg_constraint`.

### Retained

| Table | Mechanism | Notes |
|---|---|---|
| `deleted_users` | **New table** | Tombstone. No FK to `auth.users` — it must outlive the account. |
| `conversations` | `user_id` → `NULL` | De-identified. Invisible to `user_id = auth.uid()` RLS; readable only by service role. |
| `messages` | No change | Hangs off `conversation_id` only. Per-message `feedback` ratings survive with it. |
| `sessions` | `user_id` → `NULL`, `product_id` → `NULL` | Keeps stage, confidence, and summary. |
| `assumptions` | `user_id` → `NULL`, `product_id` → `NULL` | `session_id` intact — sessions are retained. |
| `assumption_status_history` | No change | Cascades from `assumption_id` only; no `user_id`. |
| `user_feedback` | `user_id` → `NULL`, `deleted_user_id` → tombstone, `contact_email` → `NULL` | `contact_email` is PII inside a retained row and must be scrubbed; the tombstone already holds the address. |

### Destroyed by existing cascade — no work required

`user_profiles`, `products`, `portfolio_profiles`, `portfolio_projects`,
`reports`, `documents`, `document_chunks`, `folders`, `model_usage`,
`interview_guides`, `blind_spots`, `assumption_evidence`, `competitors`,
`competitor_evidence`, `market_briefs`, `market_evidence`, and all `auth.*`
child tables (`sessions`, `identities`, `mfa_factors`, `one_time_tokens`, …).

Verified non-obvious cases:

- `portfolio_profiles.conversation_id → conversations` points *at* the retained
  conversation, so deleting the portfolio does not take the transcript with it.
- `reports`, `interview_guides`, `blind_spots`, and `assumption_evidence` each
  hold `session_id`/`assumption_id` FKs to **retained** parents, so they are not
  destroyed by those parents. They are destroyed by their own `user_id` cascade.

### Not user data

`coaching_prompts`, `app_settings`.

### Not covered by any cascade

Storage objects under `documents/{user_id}/`. Postgres cascades do not touch
Storage. Must be deleted explicitly. (The bucket currently holds 1 object while
`documents` holds 0 rows — orphans already exist.)

## 6. Schema changes

One migration. Applied via the Supabase MCP `apply_migration` tool per the B-011
caveat in `CLAUDE.md`, **not** `supabase db push`. The `.sql` file is committed
alongside as source of truth.

```
supabase/migrations/20260822HHMMSS_account_deletion.sql
```

1. **`deleted_users`** — `id uuid pk default gen_random_uuid()`,
   `original_user_id uuid not null` (no FK), `display_name text`,
   `email text not null`, `signed_up_at timestamptz not null`,
   `deleted_at timestamptz not null default now()`.
   RLS enabled, **no policies for `authenticated` or `anon`**. Service role only.

2. **`user_feedback.deleted_user_id`** — nullable FK → `deleted_users(id)`
   `ON DELETE SET NULL`.

3. Drop and recreate four FK constraints as nullable + `ON DELETE SET NULL`:
   `conversations.user_id`, `user_feedback.user_id`, `sessions.user_id`,
   `assumptions.user_id`.

4. Make nullable + `ON DELETE SET NULL`: `sessions.product_id`,
   `assumptions.product_id`. Required — both are currently `NOT NULL` +
   `CASCADE` from `products`, so retaining sessions/assumptions is impossible
   without this.

**Grant discipline** (per `CLAUDE.md`): `deleted_users` gets no `authenticated`
grants at all. Do not loosen the existing column-level UPDATE grants on
`user_profiles` or `messages`.

**RLS check:** existing policies are all `user_id = auth.uid()`. A `NULL`
`user_id` matches no one, so retained rows become unreadable by every
authenticated user — the desired outcome. Admin reads are unaffected:
`admin-conversations/index.ts:42` uses `getServiceClient()`, which bypasses RLS.

## 7. Edge Function: `delete-account`

One job: retire one account. Ordering is deliberate — the irreversible step is
last, so any earlier failure leaves at most a harmless orphaned tombstone and the
flow is safe to retry.

```
POST /functions/v1/delete-account      (no body)

 1. requireUser()                    identity from JWT, never from the client
 2. reject if role = 'owner'         → 403 { error: 'owner_cannot_delete' }
 3. read user_profiles               display_name, email, created_at
 4. INSERT deleted_users             tombstone
 5. UPDATE user_feedback             deleted_user_id = <tombstone>,
                                     contact_email = NULL
                                     WHERE user_id = <uid>
 6. DELETE storage objects           documents/{uid}/...
 7. auth.admin.deleteUser(uid)       ⬅ IRREVERSIBLE
                                     cascade scrubs ~16 tables,
                                     SET NULLs the 4 retained ones
 8. sendAccountDeletedEmail()        best-effort; failure logged, not thrown
 9. 200 { ok: true }
```

Steps 3–7 use `getServiceClient()`. Step 1 establishes identity; the `uid` is
never read from the request body.

**Error handling**

| Failure at | Result |
|---|---|
| 1–3 | 401/403/500. Nothing changed. |
| 4–6 | 500. Account still exists and still works. Orphan tombstone possible; retry is safe (idempotent on `original_user_id`). |
| 7 | 500. Account intact. Tombstone orphan cleaned on retry. |
| 8 | **Logged, swallowed.** Deletion already succeeded; returning 500 would be a lie. |

**CORS:** thread `req` through `corsHeaders`/`jsonResponse` exactly as the other
four functions do. Add nothing to `ALLOWED_ORIGINS` for production; add the
preview origin only if testing from a Vercel preview URL.

## 8. Email: `_shared/email.ts`

New shared helper. One job: send one transactional email via Resend.

```ts
sendEmail({ to, subject, html }): Promise<{ ok: boolean; error?: string }>
```

Never throws. Returns a result object so callers decide how to handle failure.

- New secret: `RESEND_API_KEY`
- New secret: `EMAIL_FROM` (e.g. `Ada Coach <noreply@mail.enterceptmg.com>`)
- Raw `fetch` to `https://api.resend.com/emails`, matching the codebase's
  existing no-SDK convention for the Anthropic API.

**Deploy prerequisite (manual, Mo):** verify a sending domain in Resend and add
the SPF/DKIM records at GoDaddy. Recommended: the subdomain
`mail.enterceptmg.com` rather than the root, so Ada Coach's sending reputation is
isolated from primary business email. Resend's sandbox sender only delivers to
the account owner's own address and is not sufficient.

Deletion email content: confirmation of deletion, the deletion timestamp, and a
plain statement of what was retained (anonymized transcripts + feedback) and what
was destroyed.

## 9. Frontend

**`src/pages/Settings.tsx`** — a Danger Zone card below the existing display-name
and password sections. Visually separated; destructive styling.

1. Retention disclosure, stated plainly, matching §5.
2. Text input; the delete button stays disabled until the user types `DELETE`.
3. On success: `signOut()` → redirect `/login`.
4. On 403 (owner): inline message explaining owner accounts cannot self-delete.

Owner accounts do not see the card at all — the 403 is a server-side backstop,
not the primary UX.

No new client library. Call the function through the existing pattern.

## 10. Testing

Per the strict-TDD rule in `CLAUDE.md`, a **Test Author subagent** writes all
tests against these acceptance criteria before any implementation exists,
confirms they fail for valid reasons, and hands off to
`.claude/handoff/navigator.md`. The main session never writes or edits tests.

**Unit / integration**

1. Non-owner deletion returns 200, and afterwards: `auth.users` row gone,
   `user_profiles` gone, `products` gone, `portfolio_profiles` gone.
2. Retention holds: the user's `conversations` row still exists with
   `user_id IS NULL`; its `messages` still exist; `sessions` and `assumptions`
   still exist with `user_id IS NULL` and `product_id IS NULL`.
3. `user_feedback` row survives with `contact_email IS NULL` and
   `deleted_user_id` pointing at a `deleted_users` row whose `email` matches the
   original account.
4. Owner deletion returns 403 and changes nothing.
5. Unauthenticated request returns 401.
6. Email send failure still yields 200 (best-effort contract).
7. `redactPII` regression: existing suite must still pass untouched.

**E2E (Playwright)**

Signup → send one chat message → Settings → type `DELETE` → confirm →
redirected to `/login` → old credentials no longer sign in.

Assertions check **database outcomes**, not absence of errors: the `auth.users`
row is gone AND the `conversations` row still exists with `user_id IS NULL`.

**The E2E must create and destroy its own disposable user. It must never target
Mo's account or any owner account.**

## 11. Risks

| Risk | Mitigation |
|---|---|
| Email fails after irreversible deletion | Accepted and documented. Best-effort by design (D7). |
| Domain not verified at deploy time | Deletion still works; email silently fails and logs. Feature is not blocked. |
| Retained transcripts contain PII a future user pastes | Accepted for now (0/207 today). Write-time redaction backlogged. |
| Migration drops/recreates 6 FK constraints | Non-destructive to rows, but run against a branch or verify on a copy first. Constraint names must be read from `pg_constraint`, not guessed. |
| 19 existing `user_profiles` rows | If any belong to real external users, the `CLAUDE.md` hard-gate audit trigger has already fired. Flagged to Mo separately; sequencing is his call. |

## 12. Open items

- **Sending domain** — Mo to verify `mail.enterceptmg.com` (or chosen domain) in
  Resend and add GoDaddy DNS records before deploy.
- **Hard-gate audit** — separate decision, not blocking this spec.

## 13. Verification

**How to test this manually:**

1. Create a throwaway account and sign in.
2. Start a Discovery Sprint; send two or three messages.
3. Submit feedback via the FAB, including a contact email.
4. Go to Settings → Danger Zone. Confirm the retention disclosure is readable.
5. Confirm the delete button is disabled until you type `DELETE`.
6. Click delete.
7. Try signing in again with those credentials.
8. Sign in as owner → Admin → Conversations.
9. Sign in as owner → Admin → Feedback.
10. Check the throwaway inbox.

**Expected result when working correctly:**

- Step 6: redirected to `/login` within a couple of seconds.
- Step 7: sign-in fails — the account no longer exists.
- Step 8: the throwaway user's conversation is **still listed**, with its
  messages intact and no name attached.
- Step 9: the feedback is **still listed** and still attributed to that person's
  tombstone name/email.
- Step 10: a confirmation email has arrived (only once the sending domain is
  verified).
- Owner account: the Danger Zone card is not shown at all.

**Optional assisted checks, on request only:**

- `npm run type-check`
- Playwright E2E via the Playwright MCP
- Direct DB verification via the Supabase MCP (confirm `user_id IS NULL` on the
  retained rows and that the tombstone was written)
