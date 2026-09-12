# Handoff: add a CI workflow to Ada Coach

**For:** whoever picks this up in the Ada repo
**Written:** 2026-09-12, from the Builder Journal orchestrator session
**Size:** two files, one of them four lines. Under an hour including verification.

---

## The finding

Ada Coach has **no `.github` directory at all**. Nothing runs on push or pull
request except a Vercel preview build, which proves the app compiles for the
browser and nothing else. No typecheck, no lint, no tests, no gate.

This surfaced on 2026-09-11 while merging PR #21 (the Anthropic timeout and
retry). That PR came back `mergeable_state: clean` with zero checks, so it was
merged on the strength of a local `npm run type-check`, `vitest run` and
`npm run build`. Those all passed and the merge was fine. The problem is the
word "fine": the only thing standing between `main` and a broken merge was one
person remembering to run three commands. Builder Journal has had a CI gate
since early on. Ada, which now holds the HMAC bridge endpoint, the account
deletion path and the credits ledger, has none.

**This is not urgent and nothing is broken.** It is a gap that gets more
expensive the longer it stays open, and it is cheap to close now.

---

## Three things that will bite you

Do not copy Builder Journal's workflow verbatim. Ada differs in three ways, and
two of them would fail on the first run.

### 1. `npm test` is watch mode and will hang the runner

```json
"test": "vitest"      // ← current: watch mode, never exits
```

In CI this does not fail, which is worse: it hangs until the job hits its
timeout, burning runner minutes and reporting a useless error. Builder Journal
avoids it with `"test": "vitest run"`.

**Fix (recommended):** match Builder Journal's convention.

```json
"test": "vitest run",
"test:watch": "vitest",
```

If you would rather not change what `npm test` does locally, the alternative is
to add `"test:ci": "vitest run"` and call that from the workflow. Either works.
The first is better because the two repos then behave the same way, and because
a `test` script that never exits is a trap for any future tool that runs it.

**Update `CLAUDE.md`'s Commands block if you change this.** It currently says
`npm run test # Vitest` with no mention of watch mode.

### 2. Lint has 38 errors today, so the step must be advisory

`npx eslint .` reports **38 errors, 0 warnings** as of 2026-09-12 (mostly
`@typescript-eslint/no-non-null-assertion` and `no-explicit-any`). A blocking
lint step would fail every single run, and because GitHub Actions stops a job at
the first failing step, **Build and Test would never execute**. Builder Journal
hit exactly this and solved it with `continue-on-error: true` plus a comment
explaining that it is temporary.

Do the same. Do not "fix" the 38 errors as part of this task; that is a separate
cleanup with its own risk of behaviour change.

### 3. `build` already typechecks, and the separate step is still worth it

```json
"build": "tsc && vite build"
```

So the Build step covers typechecking too. Keep a dedicated Typecheck step
anyway: it runs in a few seconds against a build that takes far longer, so a
type error is reported early and unambiguously instead of buried in build
output. The redundancy is intentional.

Note the flag difference from Builder Journal: Ada's root `tsconfig.json` is a
real config, so plain `npm run type-check` (`tsc --noEmit`) works. Builder
Journal needs `-p tsconfig.app.json` because its root config is
references-only. Do not copy the `-p` flag across.

---

## The workflow file

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  checks:
    name: Typecheck, lint, build, test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      # Redundant with Build (which runs `tsc && vite build`), kept because it
      # fails in seconds with a clear message instead of inside a long build.
      - name: Typecheck
        run: npm run type-check

      # Advisory until the lint backlog is cleared (38 errors as of
      # 2026-09-12, mostly no-non-null-assertion and no-explicit-any). A
      # blocking Lint step would fail every run, and Build and Test would
      # never execute. Remove continue-on-error once the backlog is clean.
      - name: Lint
        run: npm run lint
        continue-on-error: true

      - name: Build
        run: npm run build

      - name: Test
        run: npm test
```

Notes on the choices:

- **Node 22, pinned.** The repo has no `engines`, no `.nvmrc` and no
  `packageManager` field, so the runner would otherwise drift with whatever
  GitHub defaults to. Pinning matches Builder Journal.
- **`npm ci`, not `npm install`.** There is a `package-lock.json`; `ci` installs
  exactly what it pins and fails loudly if the lockfile and `package.json`
  disagree.
- **`cache: "npm"`** keyed off the lockfile, which is the usual large saving.
- **Both `push` to main and `pull_request`.** The push trigger catches anything
  that reaches `main` by a route other than a PR.

---

## What the tests actually cover, so nobody oversells this

`vitest run` currently passes **106 tests across 12 files**. They are almost
entirely `supabase/functions/_shared/*` unit tests: bridge payload validation,
HMAC signing, model routing, redaction, storage purge, the sprint kickoff
directive contract, and the new Anthropic timeout and retry policy. Plus a few
small frontend units.

That is real coverage of the riskiest pure logic, and it is **not** integration
coverage. Nothing in CI exercises an Edge Function end to end, hits the
database, or drives the UI. This workflow raises the floor; it does not make the
app verified. Say so plainly rather than letting a green badge imply more than
it means.

---

## How to verify before you call it done

1. `npm test` should exit on its own. If it sits there waiting, the package.json
   change did not land.
2. Push the branch and open a PR. The check should appear as
   **"Typecheck, lint, build, test"** and go green.
3. Confirm the Lint step shows as passed-with-annotations rather than failing
   the job, and that **Build and Test both ran after it**. That is the specific
   thing `continue-on-error` is there to guarantee.
4. Deliberately break something small (a type error in a scratch commit) and
   confirm the check goes red, then revert. A gate that has never failed has
   not been shown to be a gate.

---

## Scope

Two files: `.github/workflows/ci.yml` (new) and `package.json` (the test
script), plus the `CLAUDE.md` Commands line if the script name changes.

Out of scope, deliberately: fixing the 38 lint errors, adding integration or
E2E tests, and adding a deploy step for the Edge Functions. Each is its own
piece of work with its own risk.
