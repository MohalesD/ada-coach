# The Owner's Door

**A guard that was right, a feature its own builder could not use, and the one line that separates the two**

| | |
|---|---|
| **Date** | 2026-11-15 |
| **Product** | Ada Coach |
| **Component** | `supabase/functions/bridge-intake/index.ts`, `supabase/functions/_shared/bridge-launch.ts` |
| **Found by** | Mo sending one of his own ideas from Builder Journal |
| **Author** | Mohales Deis |
| **Sister write-up** | Builder Journal, "The Owner's Door" decision page (see section 8) |
| **Status of this file** | Notes for Ada's future evals and docs pages. Nothing here is published yet. Section 9 says what to build from it. |

This is Ada's half of the story. Builder Journal's half is told from the tab the
person was looking at. This one is told from the function that answered.

---

## 1. What happened

On 2026-11-15 at 17:39:32 UTC, Builder Journal sent a signed handoff to
`bridge-intake`. The email on it belonged to Ada's owner.

Ada's edge log, verbatim:

```
17:39:32.645  booted (time: 35ms)
17:39:34.198  bridge-intake refused a privileged account for request 12c6c5a5-…
17:39:34.201  POST | 403 | /functions/v1/bridge-intake      (1877 ms)
17:42:52.658  shutdown
```

One request in 24 hours. It was answered in 1.9 seconds. No sprint, no product,
no handoff row, no credit spent.

Ada did exactly what it was built to do. The guard dates from 2026-09-07:
a handoff that resolves to an `admin` or `owner` profile returns
`403 privileged_account`, so that a leaked `BRIDGE_SHARED_SECRET` can never be
turned into a signed-in session for a privileged account.

The person at the keyboard saw none of that. Their new tab said "Handing this
over to Ada…" until they closed it. That part was Builder Journal's defect and
is written up there (finding F6 on its Evals page).

## 2. The real problem was not the spinner

Once the tab could say why, it said: "That email is an Ada Coach admin account,
so it can't be signed in this way. Open Ada directly instead."

True, and useless. The idea had not arrived. Mo, in his words:

> I don't want to use a separate tester account. I use Builder Journal and Ada
> for myself, so we need to come up with a solution for when I want to use that
> feature, whether live as a demo or for my own use (I did build this for
> myself at first).

The guard protected one thing and blocked two.

## 3. The decision

The bridge does two separable things:

1. It **writes a sprint** into an Ada account (product, session, intake, first read).
2. It **mints a one-time sign-in** to that account.

Only the second is dangerous. So they are now decided apart:

| Role | Sprint written | Sign-in minted | URL returned | `signin` |
|---|---|---|---|---|
| `user` | yes | yes | `/bridge?th=…&sprint=…&mode=…` | `magiclink` |
| `admin` | yes | **no** | `/bridge?signin=self&sprint=…&mode=…` | `self` |
| `owner` | yes | **no** | `/bridge?signin=self&sprint=…&mode=…` | `self` |
| anything else | yes | **no** | same as above | `self` |

A `self` URL holds a sprint id and two flags. It grants nothing. `/bridge` uses
the session already in the browser, or sends the person to `/login` and brings
them back to the sprint. RLS on the sprint decides who sees it.

Three candidates were considered. Builder Journal's decision page draws all
three and lets a reader switch the role and leak the secret.

| | A. Refuse (was live) | B. Sign everyone in | C. Deliver, do not sign in (picked) |
|---|---|---|---|
| Owner's idea arrives | no | yes | yes |
| Leaked secret, aimed at the owner | nothing | **an owner session** | unwanted sprints, capped, no access |

## 4. What changed in Ada

- **`_shared/bridge-launch.ts`** (new, pure, tested).
  - `launchSignIn(role)` is an allowlist: exactly `'user'` yields `magiclink`.
    `admin`, `owner`, a wrong case, an invented role, `null`: all `self`.
    It is an allowlist on purpose. The failure mode of a denylist here is an
    account takeover.
  - `buildLaunchUrl` never emits a token for a `self` launch, even if handed
    one, and pins the origin to `APP_URL`.
  - `TARGET_DAILY_HANDOFF_CAP = 20`.
- **`bridge-intake`**.
  - The 403 is gone on both paths (new sprint, resume).
  - `generateLink` is not called at all unless the role is `user`. A privileged
    sign-in is never created, not merely never returned.
  - The response carries `signin`.
- **`/bridge`** handles `signin=self`. **`/login`** honours a `returnTo`.
- **`src/lib/return-to.ts`** (new, pure, tested): the post-login path is matched
  against one exact shape. Not "any path that starts with a slash".
- **Sprint banner**: "Arrived from Builder Journal · you signed in yourself" for
  a self arrival.

## 5. What the independent review found

A fresh reviewer with no build context read the change before it was committed.
Verdict: **ship with fixes.** It found no path that mints a sign-in for a
non-`user` role. It found five weaknesses around that, all fixed before commit:

1. **The role was checked on one record and the link minted for another.**
   The role came from `user_profiles`; the link was minted for an email string,
   and `user_profiles.email` is a copy that nothing keeps in step with
   `auth.users`. A recycled email could carry a link to an account the check
   never looked at. Now the link is discarded unless
   `data.user.id === profile.id`.
2. **The role snapshot was two model calls old at mint time.** Now re-read by id
   inside `mintLaunchUrl`.
3. **The new per-account cap could be raced.** Count, then insert. Now recounted
   after the insert; requests over the line withdraw before any model spend.
4. **The banner claimed a sign-in that did not happen.** Now `arrived=bridge-self`.
5. **A failed session lookup left a spinner up.** The same class of bug the day
   started with, one screen further along. Now treated as "not signed in".

Accepted, and stated rather than hidden. All need the shared secret:

- Up to 20 unwanted sprints a day can be written into a privileged account, each
  costing a classifier call and a coach turn. No access is gained.
- `unlink` followed by a handoff with another email re-points a Builder Journal
  id. Pre-existing for every role, and worse for `user` than for owner.
- Rotating emails as well as ids creates unlimited shadow accounts. Pre-existing;
  the true fix is DEU-92 (rate limiting).

## 6. What the trust audit found

A read-only quick pass on the bridge across both repositories, same day.
Seven checks. No wrong model claim, no wrong limit, the three copies of the size
caps agree. Forty drift findings, none high.

Worked in this build, Ada's side:

- The privileged-handoff log line fired only on the new-sprint path. It now sits
  inside `mintLaunchUrl`, at the decision, so the resume path and a role that
  changed mid-request are covered by the same line.
- Neither cap logged a hit. Both do now, with the request id.
- `/bridge` said "Ada has read it" even when the first read may have failed.
- `CLAUDE.md` said the bridge secrets were deliberately unset. The bridge has
  been live since 2026-09-11.

Still open on Ada's side (not done here, on the record):

- `rollback()` ignores the result of its three deletes, and a kickoff credit
  spent before a later 500 is not refunded.
- On the resume path, a database error is reported as `410 sprint_deleted`.
- A failed intake-message insert is logged and ignored; the sprint returns ok.
- Error logs print whole database error objects, which on a constraint
  violation can include row contents. Log `code` and `message` only.
- No deploy stamp on `bridge-intake`, so nothing shows which commit is running.
  Builder Journal has one and checks it in CI.
- No read-only view of the resolved `model_routing`, so "Haiku" is true of the
  defaults and not provable of production.
- The durable record of a handoff (`bridge_handoffs`) stores neither the role at
  the time nor the `signin` value returned.
- The Spec 4 document still describes one cap and an unconditional magic link.
  It needs a dated addendum pointer, not an edit.
- Ada has no `.claude/trust-audit-watch` and no trust-audit repo notes.

The full report is in Builder Journal at `docs/evals/trust-audit_2026-11-15.md`.

## 7. What is and is not verified

Verified:

- `npm run type-check` clean. `npm test` 162/162 across 17 files, including
  9 tests for `bridge-launch.ts` and 5 for `return-to.ts`.
- Lint shows the same two pre-existing `set-state-in-effect` errors as `main`.

Not verified, and the limit worth stating on any page built from this:

- **`bridge-intake/index.ts` is never executed by a machine.** It runs on Deno
  and there is no Deno runner in this repository. The role re-read, the
  auth-user check, both caps, the recount and the rollback are read and reviewed,
  not run. Their *decisions* live in two pure modules that are tested.
- No end-to-end owner handoff had been run when this was written.
- Deploy order matters and is irreversible-step-last: merge, confirm Vercel
  serves the new `/bridge`, then deploy `bridge-intake`. The other order sends
  an owner to a page that does not know `signin=self`.

## 8. Cross-references into Builder Journal

Repository `MohalesD/davincibuilderjournal001`. Paths as of v2.52.0.

| What | Where |
|---|---|
| The sister decision page (source) | `docs/prototypes/owner-handoff-decision.html` |
| Same page, served | `/prototypes/owner-handoff-decision.html` on aibuilderjournal.com |
| Its catalogue entry | `src/pages/docs/prototypes-manifest.ts`, first item in `PROTOTYPES` |
| The rule | `docs/rules.md`, Integrations, "Ada bridge: privileged accounts (v2.52.0)" |
| The Evals page | `/docs/evals`, catalogue in `src/pages/docs/evals-manifest.ts` |
| Ada's suite as Builder Journal lists it | `SUITES`, id `ada.privileged-launch` |
| Builder Journal's own suite for the tab | `SUITES`, id `bj.handoff-end-state` |
| The spinning-tab defect | `LIVE_FINDINGS`, id `F6` |
| The write-up entry | `REPORTS`, id `owner-handoff-decision` |
| This file's older sibling, as listed there | `REPORTS`, id `the-53-second-hang` (`url: null`, "no public address yet") |
| The earlier sister pair | Builder Journal "The Last Mile" (`/case-studies/ada-bridge-last-mile.html`) and Ada `docs/portfolio/the-53-second-hang/` |
| Trust audit report | `docs/evals/trust-audit_2026-11-15.md` |
| Motion primitives worth porting | `src/pages/docs/DocsMotion.tsx` |

Builder Journal's test cannot check Ada-hosted paths or counts. They were
confirmed by hand on 2026-11-15: `bridge-launch.test.ts` 9, `return-to.test.ts` 5.
If either file gains or loses a test, Builder Journal's manifest goes stale
silently. That is a reason for Ada to own its own catalogue.

## 9. What to build from this, when Ada gets its evals and docs pages

Ada has no `/docs` and no evals page yet. When they are built, this is the brief.

### 9.1 The catalogue

Mirror Builder Journal's shape so the two read side by side: one manifest file,
a test that holds it to its own claims (paths exist, `it(` counts match, YAML
assertion counts match), and a page rendered from the arrays with no hand-typed
numbers. Ada's test can verify Ada's own files, which Builder Journal's cannot.

Entries Ada should own on day one. Counts are as of 2026-11-15; recount before
publishing.

| Suite id | Guards | Harness | Tests | Runs in |
|---|---|---|---|---|
| `ada.privileged-launch` | The shared secret can never become an admin or owner session | `supabase/functions/_shared/bridge-launch.test.ts`, `src/lib/return-to.test.ts` | 9 + 5 | CI |
| `ada.request-auth` | Only Builder Journal's server can open the door | `supabase/functions/_shared/bridge-signature.test.ts` | 10 | CI |
| `ada.payload-validation` | A malformed or oversized idea is refused whole | `supabase/functions/_shared/bridge-payload.test.ts` | 9 | CI |
| `ada.model-resilience` | A model call that hangs is bounded and retried once | `supabase/functions/_shared/anthropic.test.ts` | 12 | CI |
| `ada.arrival-directive` | Ada still introduces herself to a stranger | `supabase/functions/_shared/sprint-kickoff.test.ts` + `contracts/bridge-arrival-directive.yaml` | 7 | CI, blocking |

Every suite needs its limitation written first. For `ada.privileged-launch` it
is the sentence in section 7: the decision is tested, the function that acts on
it is not run.

### 9.2 The write-ups

Two reports, both already written, both currently without a public address:

1. **The 53-Second Hang** (`docs/portfolio/the-53-second-hang/`, 2026-09-11).
   Sister of Builder Journal's "The Last Mile".
2. **The Owner's Door** (this file, 2026-11-15). Sister of Builder Journal's
   decision page of the same name.

When Ada publishes them, tell Builder Journal: its `REPORTS` entry for
`the-53-second-hang` has `url: null` and says so on the page, and a second entry
for this file can be added pointing at Ada's address. Each pair should link to
its sister in the first screen.

### 9.3 The interactive page

Builder Journal's page shows the handoff from the tab. Ada's should show it from
the function, which is the view only Ada has:

- **The mint decision as a live diagram.** One request flowing through
  `bridge-intake`: signature, sender cap, resolve user, receiving-account cap,
  insert, recount, sprint, kickoff, role re-read, mint or do not mint. A role
  switch (user, admin, owner, unknown) lights the path taken. The point to land:
  the role is read twice, and the second read is the one that counts.
- **The two bindings.** A small before-and-after of finding 1 in section 5:
  profile row on the left, auth user on the right, and the line between them
  that did not exist until the review asked for it.
- **The cap race.** Ten concurrent requests against a cap of 20 at count 19:
  check-then-insert admits all ten; recount-after-insert admits one. Animate
  both.
- **The edge log from section 1**, typed out at real speed. 1.9 seconds is short
  enough to watch.
- **What is not run.** Same type size as what is.

Design notes, from Mo on 2026-11-15: follow the product's own fonts and tokens,
then go a step past the last page in flavor, motion and interaction. Each model
step up should be visible in the work. Presentation and readability first.
Everything fails open under reduced motion; no content waits on an animation.

### 9.4 Ada's landing page

Ada has none. Mo expects it to follow this work. Reference build:
`MohalesD/talent-brand-studio`, his most recent zero-to-one, as the bar to clear
rather than a template. Builder Journal's own landing page is being kept in two
versions (Classic and Refreshed, rule in its `docs/rules.md`); that does not
apply to Ada, which starts fresh.
