# Ada Coach Backlog v1

Reconciled 2026-07-05. This is the single running list. If another
backlog file exists in the repo, treat this one as authoritative and
retire the other, don't maintain two.

---

## Blocking, do before anything else merges

- [ ] **Supabase redirect allowlist**: replace with exactly
  `http://localhost:5175/**` and `https://ada-coach.vercel.app/**`
  (Dashboard, Authentication, URL Configuration).
- [ ] **Supabase email-sending quota**: confirm Resend, not Supabase's
  built-in sender, handles password recovery emails specifically. This
  is what's currently blocking real end-to-end testing.
- [ ] **Run one real password reset, click-through, end to end**, by a
  human, not automatable by design (the AI's own safety layer correctly
  refuses to script this).
- [ ] **Run 5's one remaining unverified Must-Have**: a real, live
  competitive-intelligence run (identify, confirm, profile, gap), now
  that Anthropic API credits are funded. Steps are in
  `docs/logs/build-log-run5.md` section 5.
- [ ] Determine actual branch state (`git status`, `git log`, `git
  branch`) before merging Run 5 or the password fix; don't assume which
  branch holds what.

---

## Architecture decision needed before writing any more PRD (one fork, three requests)

These three requests are the same underlying decision, not three
separate features. Decide once, in a real Plan Mode session with Opus,
before scoping any of them individually:

- [ ] **Agent-loop redesign** of the discovery coaching flow (ask,
  answer, decide next step, repeat until criteria met, instead of a
  fixed script). Rajesh's original suggestion, still unbuilt.
- [ ] **User-selectable framework library** (let a PM choose MoSCoW,
  RICE, or others instead of Ada always defaulting to the Mom Test),
  with a lightweight teaching area for PMs unfamiliar with a framework.
  No quizzes, no full EdTech buildout, just enough to understand when
  and how to use one. Full EdTech layer is icebox, not now.
- [ ] **Multi-persona / personality layer** (a "Soul MD," selectable
  tone and behavior, possibly multiple named coaches beyond Ada, a
  red-team or contrarian voice a PM can invite into a session on
  demand). This is the same "does Ada become a multi-agent platform or
  stay one scoped coach" question as the agent-loop redesign, just
  wearing different clothes. Resolve the identity question once.

---

## Ready for a Fable run, if tokens allow before July 7

- [ ] Promote the Portfolio track to a top-level tab (alongside
  Discovery), not buried inside the router flow. Reflects its real
  strategic weight as a beachhead market, not a fallback path.
- [ ] Grammar pass on router copy ("Aspiring PMs welcome. Skip anytime."
  as two sentences, not one comma-joined line; check the rest of the
  router screen for the same issue).
- [ ] "Save for later" queue or backlog sidebar, letting a user park
  options, questions, or planned artifacts instead of losing them
  mid-session.
- [ ] Branding on shared/downloaded artifacts: "Coached by Ada" (not
  "Created by Ada," preserves the PM's ownership of the work), footer
  logo on PDF, DOCX, and Markdown exports, domain included on share
  links.
- [ ] Referral credit mechanic: extra usage credit for a successful
  referral. Must gate on the referred person completing a real action
  (account creation plus one finished session), not just a link click,
  or it's trivially gameable by self-referral.
- [ ] RAG scaffolding only (retrieval debug view showing chunks and
  similarity scores, extending the existing eval harness, a short
  architecture doc). The actual RAG redesign logic stays Mo's own
  learning lane, not delegated to Fable.

---

## Sonnet follow-ups (mechanical, apply an existing pattern; no Fable needed)

Small, low-ambiguity technical follow-ups from the agent-loop frontend +
production-401 work (2026-07-06). Each applies a known pattern, not a design
call.

- [ ] Replace the fixed 2-origin CORS allowlist (`ALLOWED_ORIGINS`) with a
  pattern match that trusts any `*.vercel.app` preview URL for this project,
  so preview branches don't need manual allowlisting. Scope: the `corsHeaders`
  check in `supabase/functions/_shared/auth.ts`; keep the exact-match
  localhost + prod origins and add a wildcard only for this project's Vercel
  preview subdomain (`https://ada-coach-*.vercel.app`). Distinct from the
  "Supabase redirect allowlist" blocking item above — that's the Auth URL
  config in the Dashboard; this is the Edge Function CORS secret.
- [ ] Add the same `isEdgeAuthError` / `recoverSession` 401-retry wrapper
  (from `src/lib/discovery-api.ts`'s `invoke()`, commit `3df42f2`; helper in
  `src/lib/session-recovery.ts`) to `portfolio-api.ts` and `admin-api.ts`, so
  an expired session on the portfolio and admin surfaces refreshes-and-retries
  or bounces to `/login` instead of a generic error. Frontend only; the helper
  already exists.

---

## Hypothesis-stage, needs validation before it's a real feature

- [ ] **Product discovery and product development coaching expansion.**
  The portfolio track earned its spot from firsthand, repeated evidence
  (the same question asked by real aspiring PMs across multiple live
  sessions). This does not have that evidence yet; it's an extrapolation
  from the portfolio pattern, not a validated gap. Before this becomes a
  PRD line: watch for the same real pattern specifically around product
  discovery and development in the Maven Lightning sessions.

---

## Password hardening, triaged 2026-07-05 from Mo's standard Lovable prompt

Bundled into the active `fix/password-reset-flow` branch (cheap, same
files already open, directly relevant):
- [x] Eye-icon reveal toggle: autoCapitalize/autoCorrect/spellCheck off,
  correct autoComplete hints, toggle is tabIndex=-1 and ARIA-labeled,
  paste deliberately allowed (NIST SP 800-63B).
- [x] Auto-hide the revealed password after 10 seconds.
- [x] Caps Lock warning indicator on password fields.
- [x] Password strength meter (zxcvbn or lightweight equivalent) on
  signup and reset, color-coded, with inline tips.

Check first, may already be a dashboard toggle, not a build task:
- [ ] HaveIBeenPwned breach checking. Supabase Auth has a built-in
  leaked-password-protection setting; check Authentication settings
  before asking anyone to build this from scratch.

Deferred, with the specific reason for each:
- [ ] Email notification on password change: blocked on the Resend
  domain fix (tomorrow), no point building before that pipeline works.
- [ ] "Sign out of all other sessions" button.
- [ ] Last-sign-in and active-session-count display in Settings.
- [ ] Rate-limit/lockout indicator with a friendly cooldown countdown.
- [ ] TOTP (Time-based One-Time Password) two-factor authentication with
  QR enrollment. Real standalone feature, own scoped session, not a
  bundle-in. Note: appears twice in Mo's own source prompt, once main,
  once "optional," pick one home before scoping.
- [ ] (Optional, per Mo) Security audit log table (sign-ins, password
  changes, session revocations) with a Settings viewer.

## Deferred past July 7, Sonnet/Opus or by hand, no Fable needed

- [ ] Visible requirement hints on password fields (missing characters,
  capital letters, etc.), separate from the strength meter above.
- [ ] First-time-user onboarding walkthrough and guided tooltips.
- [ ] Full email domain authentication (SPF, DKIM, DMARC records) and
  branded email templates, replacing the generic Resend default sender.
- [ ] Favicon (missing, two-minute fix, just needs doing).
- [ ] npm dependency audit (known lodash vulnerability).
- [ ] Migration bookkeeping cleanup (local files and Supabase's tracking
  table disagree about which migrations were "officially" applied; a
  record-keeping mismatch, not a functional bug).
- [ ] Linear workspace setup (separate chat, per Mo).
- [ ] RAG Debug admin tab: test-message textarea is too small for
  realistic input length, needs a larger default height or
  auto-grow.

---

## Needs real content and judgment, not a build task

- [ ] Privacy policy (must accurately describe actual data handling,
  including the document-retention decision below; a generated policy
  that doesn't match reality is worse than none).
- [ ] Terms of use.
- [ ] A "how to get the most out of Ada" guidebook.
- [ ] Landing page (doesn't exist yet).
- [ ] Pilot-program disclosure banner and a live feedback form, both
  needed before the first friend or outside tester logs in, per the
  standing rule that a friend testing the app is still a real external
  user.

---

## Open product decisions, not code tasks

- [x] **DECIDE: RAG similarity threshold.** Decided 2026-07-10: shipped
  at 0.45 (between the 12/15-retrieval 0.35 and the near-silent 1/15
  0.60), and the `ARM B EVAL: RAG DISABLED` gate in
  `supabase/functions/chat/index.ts` was removed — Arm A (RAG on) is
  now live in production, ending the Arm A/B eval. See
  `docs/qa/2026-07-10-rag-arm-b-gate-removed.md`.
- [ ] **Document retention claim, pick one and state it precisely.**
  Current real behavior: uploaded documents are session-scoped and
  purged when the conversation ends, genuinely no persistence. A
  proposed addition (keeping a summary of what was learned from a
  document even after the file itself is deleted) is still a form of
  retention. Decide which claim is actually true before it ships:
  "we never keep anything from your documents" and "we don't keep the
  files but we do remember key facts" are both honest claims,
  separately. Can't say both.
- [ ] Freemium and pricing structure. Early ideas on the table: a
  capped free tier with a preview-then-paywall pattern for
  search-heavy features specifically (the most expensive call type per
  the Run 5 cost data), and near-break-even entry pricing with a small
  margin (5 to 10 percent) to start. Revisit once real per-user cost
  data exists from actual usage, not just test runs.
- [ ] Download format options: PDF, DOCX, Markdown, each carrying the
  "Coached by Ada" branding (acknowledged that Markdown and DOCX
  branding can be stripped by the user; shared links cannot have it
  removed).

---

## Removed, not deferred

- Cohort dashboard. The cohort/instructor model no longer applies to
  Ada; there's no coach or instructor role left to build it for.

## Post-demo, cosmetic

- [ ] Consider whether precise book-title citation on RAG-hit
  responses (vs. generic voice on RAG-miss) creates a detectable
  style tell across questions. Not a literal authenticity breach,
  current system-prompt rule explicitly allows author/book
  references as recommendations. Revisit only if it becomes a real
  signal in practice, not preemptively.
