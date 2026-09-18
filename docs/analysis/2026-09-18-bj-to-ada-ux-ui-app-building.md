# Builder Journal to Ada Coach, Part 2: UX, UI, and App Building

**Purpose.** Everything outside evals, trace, tokenomics, security, and prompt engineering (those are Part 1): the features, interaction patterns, design-system discipline, documentation surfaces, and shipping practice that DaVinci Builder Journal accumulated over 218 releases, assessed for what Ada Coach should adopt, adapt, or leave alone.

**How this was built.** Read directly on 2026-09-18: Builder Journal at `v2.41.0` (every page and module under `src/`, `docs/design.md`, `docs/responsive-guidelines.md`, `docs/rules.md`, `docs/guide-center-content.md`, `docs/masterplan.md`, `docs/tasks.md`, the PRDs and addenda, the changelog, `src/pages/docs/*`, the landing components, the Supabase migrations) and Ada Coach at `main` plus the working branch (`src/App.tsx`, every page, `index.css`, `tailwind.config.ts`, `Settings.tsx`, `Privacy.tsx`, `FeedbackForm.tsx`, the sidebar, the backlog). Counts and claims cite files. Nothing here was verified in a browser; touch behavior, animation feel, and contrast are described from code and Builder Journal's own records.

**The frame.** Builder Journal is a personal capture tool with five modules and hundreds of small affordances. Ada is a turn-based coaching product with a sidebar, a sprint workspace, and a handful of generated artifacts. Most of Builder Journal's *features* do not belong in Ada (Spaces, drag-and-drop reorder, voice capture, streaks, a paywall). Most of its *practices* do. The recommendations below sort on that line. Where a feature is recommended, it is because the same job exists in Ada under a different name.

---

## 1. Executive summary: the ten carry-overs

1. **A public landing page and a public docs site.** Ada has neither; the backlog has listed the landing page as "doesn't exist yet" since July. Builder Journal's landing page is honest by construction (real recordings, click-through demos, no invented testimonials) and its `/docs` site is the artifact cohort reviewers and interviewers actually open. Ada already publishes one write-up at a public path; the docs site is the container it is missing.
2. **A Guide Center with FAQ, tips, and best practices, authored in one Markdown file and served from a table.** Nineteen FAQ entries, twelve tips, eight practices, searchable, tagged, with per-article helpfulness thumbs. Ada's backlog names a "how to get the most out of Ada" guidebook; this is the shape.
3. **A first-run choice: quick tour, full walkthrough, or skip, against seeded starter content.** Ada's `StartRouter` routes by persona; it does not teach the product. The two are complementary.
4. **Design lessons written down the day they are learned.** `docs/design.md` has a dated "Design lessons learned" section and `docs/responsive-guidelines.md` was written to be portable to the next project. Ada has a strong visual identity (amber, cream, espresso, Fraunces and Karla) and no document that says why or how to extend it.
5. **Three themes, one accessibility menu, per-user persistence.** Light, dark, and a color-blind-safe contrast theme; text scale at 100, 110, 120; saved to the profile so it follows the user across devices. Ada defines dark-mode tokens and never lets the user switch.
6. **A version badge, a changelog rule, and a health page.** Every Builder Journal build shows `vX.Y.Z` in the sidebar; every changelog entry bumps `package.json`; the admin health page says whether the deployed app, schema, and functions match. Ada's `package.json` still reads `0.0.0`.
7. **A single edit surface, rendered three ways.** One detail panel component appears as a split pane on desktop, a modal on medium screens, and a sheet on mobile. Ada's sprint page is nine hundred lines with its own layout logic; the pattern would simplify it.
8. **Legibility of waiting and of failure.** Holding pages, staged copy at fixed intervals, "saved offline" notices, toast actions that survive an open sheet, and error codes mapped to plain sentences. Ada's coaching turns can run six seconds and its intel calls ninety; the copy around those waits is where Builder Journal's live findings say the product is judged.
9. **Universal share and export.** One share sheet (native share, copy, Markdown download) on every object, with branding decided once. Ada has Markdown export and public share tokens on two object types and a backlog item about "Coached by Ada" branding on all of them.
10. **Rules that record the incident that produced them.** Builder Journal's `rules.md` is 437 lines and most entries name the version and the bug. Ada's `CLAUDE.md` is excellent on architecture and thin on interaction rules. The habit transfers even if the file does not.

---

## 2. Where each app stands

| Surface | Builder Journal | Ada Coach | Note |
|---|---|---|---|
| Public landing page | Yes: hero demo, spotlight carousel, module showcase, real recordings, command-K demo, pricing, footer | None. `/` is the authenticated chat | Backlog item since 2026-07-05 |
| Public docs site | `/docs` with 11 pages (overview, features, AI, architecture, components, data flow, API, dependencies, security, mockups, evals) | One public write-up at `/the-53-second-hang`; Markdown and DOCX in `docs/` | Ada has the content, not the container |
| In-app help | Guide Center at `/help`: 39 articles in 3 tabs, search, tags, thumbs, admin editor, screenshots | None | Backlog: "how to get the most out of Ada" |
| Legal | `/privacy`, `/terms`, `/refund`, separate pages, plain second person | `/privacy` is a combined "Demo Privacy Notice and Terms" | Adequate for a demo; splits before pricing |
| Onboarding | Choice dialog: quick tour (6 steps), full walkthrough (13 steps against real elements), skip; seeded starter content, claim-first | `StartRouter` persona routing (skippable); sprint kickoff with starter questions | Different jobs; Ada lacks the teaching half |
| Auth modes | Email and password, Google OAuth, magic link; branded emails; 429 countdown | Email and password, magic link, password reset; welcome email via Resend; bridge magic-link arrival | Parity except OAuth |
| Password UX | Reveal toggle, Caps Lock warning, strength meter, HIBP, session revocation | Reveal toggle, Caps Lock, strength meter (shipped from the same prompt) | HIBP and revocation still on Ada's backlog |
| Themes | Light, dark, contrast; system option; accessibility menu; text scale; profile-persisted | Light tokens and dark tokens defined; no toggle, no persistence | Ada is one component away |
| Navigation | Desktop sidebar, mobile bottom nav, module in `?m=` so Back works, keyboard shortcuts 1 to 5, N, /, cmd-K, ?, T | Sidebar with search, pin, rename, archive, folders, DnD; header avatar menu | No shortcuts, no command palette |
| Global search | cmd-K palette over four tables | Sidebar filter over conversation titles | Ada has fewer object types; still worth it once products and portfolios exist |
| Feedback | Bug and feature tabs, admin status workflow, new-feedback badge | FAB on chat and sprint surfaces, `user_feedback` table with source surface, admin Feedback tab with email reply | Ada is ahead on the reply loop |
| Empty states and skeletons | `ModuleEmptyState` with filtered variant; four skeleton components; pre-React inline loader | Ad hoc; no shared empty state; two skeleton usages | Small, high-frequency gap |
| Toasts | Sonner with `visibleToasts 5`, 6.5 s, pointer events on, "View" actions, undo pattern | Sonner used across 14 files; no undo convention | Adopt the undo rule |
| Undo | Delayed-write undo (5 s) on delete and archive; preview-revert undo on AI restores | Archive is a soft delete with no undo toast | One hook |
| Export and share | Universal `ShareSheet`, Markdown per module, CSV for builds | Markdown export of conversations, PDF for reports and portfolio, public tokens for both | Ada is ahead on artifact formats, behind on the universal control |
| Version display | `AppVersionBadge`, preview channel ring, tooltip with build date, click to help | None; `package.json` `0.0.0` | Trivial to add |
| Admin | Users, feedback, AI debug, health with deploy stamps | Conversations, prompts, insights, feedback, users, spend, documents, retrieval debug | Ada is broader; lacks health |
| Offline and PWA | IndexedDB queue for two modules, install page, manifest; app-shell caching retired | `site.webmanifest` and icons only | Not recommended for Ada (section 8) |
| Responsive rules | Written guideline, overflow probe at four widths and three text sizes, per-surface checklist | `use-mobile` hook; sprint header adapts; nothing written | Adopt the guideline as is |
| Tests on UI | Testing Library on 15 or so components; probe scripts | Four frontend unit files, all pure logic | Gap |
| Error boundary | None | One (`ErrorBoundary` referenced in one file) | Ada is ahead |
| State management | React Query provided but unused; `useEffect` fetches; window CustomEvents between modules | Direct Supabase calls and typed API modules; no React Query | Neither is a model; see section 7 |
| Largest page file | `Settings.tsx` at about 1,150 lines | `Admin.tsx` at 2,716 lines, `Index.tsx` at 1,144 | Both violate their own single-responsibility rule |

---

## 3. Public surfaces: landing, docs, legal

### 3.1 The landing page

Builder Journal's `Landing.tsx` is worth studying for what it refuses to do. There are no testimonials, no logos, no invented numbers. The proof is interactive: a hero capture demo, a tabbed module showcase ("Don't take our word for it. Click things."), three real screen recordings ("And this is the real thing, recorded."), a command-K demo, and a pricing block that says "No credit card. The core app is free for good." The header carries the same theme toggle and accessibility menu as the app, so the landing page is the app's first screen, not a separate brochure. Signed-in users are redirected to the dashboard. It degrades under `prefers-reduced-motion` (keyframes off, demos render their final frame, nothing autoplays), and an overflow probe runs it at 360, 390, 768, and 1280 px at three text sizes.

**For Ada.** A landing page at `/` with the authenticated app moved to `/app` or kept at `/` behind a redirect. Content Ada already has: the two personas from `StartRouter` (aspiring PM, early-stage PM), the sprint flow, one real recorded coaching exchange, the "Coached by Ada" positioning, and the pilot-program disclosure the backlog says must precede any outside tester. Reuse the honesty rules verbatim: real recordings, no testimonials until there are real ones, no numbers that are not measured. The AI trust line Builder Journal added to its landing page ("Your prompts and results are never saved. We log a call happened") has a true Ada equivalent that says the opposite, and it belongs on the landing page for the same reason: the worried reader is standing right there. Effort: M. Depends on nothing.

### 3.2 The docs site

`/docs` is eleven pages behind a shared layout and a set of typographic primitives (`DocsPrimitives.tsx`). Three of its pages are generated from manifests that tests keep honest: components (every component with file, description, props), mockups (every prototype file is listed exactly once and served as a byte-exact wrapped copy), and evals (Part 1). The data-flow page renders Mermaid diagrams with pan, zoom, and fullscreen. An audience note on every page says who it is for.

**For Ada.** Ada's docs are richer than Builder Journal's in substance (five build logs, a v3 PRD with JTBD and an API injection map, an RLS audit, an agent-maturity ladder, a deletion end-to-end audit, a bridge delta audit) and invisible unless someone opens the repo. The minimum viable docs site is five pages: overview, architecture (the diagram in `CLAUDE.md` plus the injection map), security posture (from the audit), evals (Part 1, E1), and case studies (the 53-second hang, already published; the bridge story from Ada's side). Serve the existing Markdown rather than rewriting it; Builder Journal's `sync-case-studies.ts` pattern (copy a repo document to `public/` at build time, test that the copy is current) is the mechanism. Effort: M.

### 3.3 Legal pages

Builder Journal separates privacy, terms, and refund, writes them in plain second person, and forbids the "we're committed to" register in `rules.md`. Both apps name each other in their privacy pages because of the bridge. Ada's single combined page is honest about the demo trade and reads well. It should split into two pages before any paid tier, and both need the surface-by-surface consistency pass described in Part 1 (S1).

---

## 4. In-app help and onboarding

### 4.1 The Guide Center

The content lives in `docs/guide-center-content.md` ("the document is the spec, the DB is the copy") and is loaded into `help_articles` by migration. The page has three tabs (FAQ, Hints and Tips, Best Practices), a search box scoped to the active tab, tag chips that combine with AND, a clear-filters button, an "N of M shown" count, accordion answers, and a "Was this helpful?" pair of thumbs stored per user per article. Admins edit inline. A tiny renderer (`help-format.ts`) accepts bold, bullets, colored dots and badges, images from one public bucket, and a pure-CSS before-and-after switch, and nothing else. Thirteen screenshots are captured by a script against a mocked admin session so they stay consistent. FAQ entries emit JSON-LD so search engines index them.

**For Ada.** The same shape with Ada's content. A first draft of the FAQ writes itself from `CLAUDE.md` and the backlog: what Ada is and is not (a coach, not a validator), what a Discovery Sprint does, what the assumption map means and how to read confidence and impact, what "Coached by Ada" means for ownership of the output, what happens to transcripts, what credits are and when they reset, how market and competitive intel are sourced and why some fields say "thin", what arrives when you come from Builder Journal, how to set a password after arriving by magic link, and how to delete your account. Tips: the summary sentinel, pin and folders, exporting a session, the confirm gate on competitors. Best practices: the coaching persona's own rules turned toward the PM (bring one assumption, answer the one question, do not ask Ada to validate). The helpfulness thumbs reuse Ada's existing `user_feedback` table with a new `source_surface`. Effort: M for the page, S for the first content pass.

### 4.2 First run

Builder Journal asks a new user to pick a quick tour, a full walkthrough, or skip. The full walkthrough points at real elements by `data-tour-id`, modules respond to a `tour:prepare` event by entering the state the step needs, the dim overlay was removed in favor of a ring around the target, and seeding runs exactly once (claim-first flag flip before insert, which fixed a double-seed bug). Starter content is a meta example: a build called "Builder Journal (yes, this app)".

**For Ada.** Ada's `StartRouter` answers "which track" and its kickoff answers "what do I say first". Neither answers "what is on this screen". A four-step quick tour of the sprint page (the thread, the assumption panel, the intel actions, the report) and a starter sprint seeded from a fictional product would do it. Claim-first seeding matters here because the bridge already creates accounts server-side and a second concurrent seed would be visible to the arriving user. Effort: M. The backlog lists "first-time-user onboarding walkthrough and guided tooltips" as deferred; this is that item.

---

## 5. Design system and accessibility

### 5.1 What Builder Journal wrote down

- `docs/design.md`: aesthetic ("dark workshop, warm, grounded, premium"), named anti-patterns (purple gradients, Inter, white backgrounds, cold dashboards), typography, color tables for three themes, layout, component patterns, undo patterns, swipe thresholds, iconography sizes, motion rules, keyboard shortcuts, and a dated lessons section.
- `docs/responsive-guidelines.md`: one breakpoint for layout (1024) and one for density (768); content column `max-w-lg`; `dvh` not `vh`; chip rows wrap and labels never wrap; `min-w-0` on text children of flex rows; the native select width trap; the Radix ScrollArea `display: table` trap; text size is not zoom; phones have no hover so every hover-only action needs a phone equivalent; swipe versus long-press tuning; an eight-item checklist for any new surface.
- `rules.md` interaction rules: cards hover by border, never by low-alpha background; a universal close-X styled once in the dialog and sheet primitives; AlertDialog for anything destructive; destructive and secondary outlines share tokens; "move to" surfaces are pill rows, never tiles; every multi-dimension filter gets a clear button; no raw color classes anywhere; every new token must exist in all three themes (a test enforces it); every status pill carries an icon so color is never the only cue; attention pulses last under three seconds; expandable chevrons are real buttons.

### 5.2 What Ada has

A coherent identity: amber primary, cream background, espresso ink, olive success, brick destructive, Fraunces for display and Karla for body, a 0.75 rem radius. Light and dark token sets in `index.css`. The branded HTML analysis documents already reuse these tokens. There is no design document, no responsive guideline, no theme switch, and no contrast theme. Six files use `aria-live`; one references reduced motion.

### 5.3 What to carry over

**D1. Write `docs/design.md` for Ada now, while the identity is still in one person's head.** Aesthetic and anti-patterns, the token table, typography roles, the chat-specific patterns (assistant bubble, summary tint, feedback buttons, proposal cards, the arrival banner), and a dated lessons section seeded with what the bridge taught about first messages. Effort: S.

**D2. Adopt `responsive-guidelines.md` unchanged and run its checklist on the sprint page and the intel view.** It was written to be portable. The sprint page at 375 px is named in the v3 PRD's QA checklist and has no recorded result. Effort: S to read, M to fix what it finds.

**D3. Ship the theme switch and the accessibility menu.** Ada's dark tokens already exist. Add `next-themes` with class attribute, a contrast theme derived from light (Builder Journal's is Okabe-Ito based, blue and orange only for state colors, opaque pills), text scale on the root element applied before first paint, and persistence to `user_profiles` (which needs a new column grant, per the house rule). Effort: M.

**D4. Port the token-completeness test.** A Vitest that parses `index.css` and asserts every custom property defined under the light root is also defined under `.dark` and `.contrast`. Ten minutes, and it is the kind of test the cohort will recognize as design-system discipline. Effort: S.

**D5. Non-color cues everywhere status is shown.** Assumption status (untested, validated, challenged, abandoned), confidence labels, intel run state. Builder Journal's `buildStatus.ts` (label, icon, token classes, one source, one pill component) is the pattern; Ada's `risk.ts` is halfway there. Effort: S.

**D6. The overflow probe.** `scripts/probe-text-scale.mjs` loads every route at four widths and three text sizes and fails on any horizontal overflow. Ada has Playwright available in this environment. Effort: S to port, once routes are enumerated.

---

## 6. Interaction patterns for a chat and sprint product

The design-and-voice reference Ada's `CLAUDE.md` points at was written for dashboards, and it warns against forcing dashboard patterns onto a conversational surface. Builder Journal is closer to Ada than that reference is, because it is also a single-column, mobile-first, text-heavy product. These are the patterns that transfer.

**P1. One edit surface, rendered three ways.** The detail panel is the only editor; on desktop it is a resizable split pane, at medium widths a modal, on mobile a sheet, and capture dialogs are creation-only. Ada's assumption editing, competitor confirmation, and portfolio artifact workspace each have their own layout code. One `DetailSurface` wrapper with the three renderings would let each of them be a content component.

**P2. Preview where triggered, never auto-open.** An AI result appears as a suggestion block at the point of the action, with a mandatory Copy button and an Apply that the user takes. In Ada the analog moments are assumption extraction (currently inserted directly), the summary, and the interview guide. A preview-then-accept step is both a UX and an eval pattern (Part 1, 7.1).

**P3. Delayed-write undo.** Delete and archive schedule the write and show a five-second toast with Undo; the write happens when the toast expires. Ada archives conversations with no undo. One hook (`useUndoDelete`, `useUndoArchive`) covers conversations, products, and folders.

**P4. Toast discipline.** Five visible, 6.5 s, pointer events on so a "View" action works behind an open sheet, never one toast per item in a batch, and no toast for routine autosaves (inline indicator only). Ada's sprint page shows a saving state on turns; the rule is worth writing down before the intel views multiply the toasts.

**P5. Legible waits.** The holding page (Part 1 tells the story) is the extreme case. The general rule from Builder Journal's live findings: a wait longer than about three seconds needs copy that says what is happening, and a wait longer than the copy promised needs a second message. Ada's intel calls routinely run 60 to 90 s. `intel-status.ts` already tracks run state; the UI should stage its copy at fixed intervals the way the holding page does (0, 14, 40 s in CSS, no script), and say what "partial" means when a call hits its search cap.

**P6. Error codes mapped to sentences, in one table, tested.** Builder Journal keeps every bridge error code beside its user sentence and a retryable flag in one module with 26 tests. Ada's `discovery-api.ts` and the sprint page have the sentences inline. Consolidate into `src/lib/errors.ts` with the same test shape.

**P7. Keyboard shortcuts and a command palette.** Ada already ships the shadcn `command` primitive and does not use it. A palette over conversations, products, and portfolio projects, opened by cmd-K and `/`, plus `N` for a new sprint and `?` for the cheat sheet, is a day of work and the kind of detail that reads as craft.

**P8. Back button that works.** Builder Journal moved the active module into a query parameter so Back and Forward navigate between modules and modules are deep-linkable. Ada's chat surface keeps the active conversation in state; the sidebar selection should be in the URL.

**P9. Masking as a curtain, not a safe, and say so.** Builder Journal's masked resources render as dots and the copy says the data is not encrypted. If Ada ever hides intake text or redaction flags behind a reveal, use the same honest copy.

**P10. Confirmation for destructive relationship changes.** Unlink, rhythm changes, and delete all confirm through AlertDialog. Ada's product delete cascades to sprint conversations; the confirm should name that.

---

## 7. App-building practice

### 7.1 Versioning and changelog

Builder Journal: SemVer from `1.0.0`, `package.json` is the source, Vite injects version and build date, every changelog entry bumps the version, entries are headed with the version, the date, and a title, and never edited retroactively, the badge shows a preview channel on non-production hosts, and the health page warns when the changelog head and `package.json` disagree.

Ada: `package.json` is `0.0.0`, there is no changelog, and history lives in build logs, PR merges, and Linear. The build logs are better documents than any changelog, but a reviewer cannot tell which build is running.

**A1.** Adopt the version rule, add the badge to the sidebar footer, and start `docs/changelog.md` at `1.0.0` with a one-paragraph summary per past run rather than a reconstruction. Effort: S.

### 7.2 Rules that carry their incident

`rules.md` is the single most reusable document in Builder Journal, not for its content but for its form: one line per decision, grouped by area, each carrying the version and usually the bug that produced it ("the `PointerSensor` shadowing that killed mobile drag from v2.6.3 to v2.8.7"). Ada's `CLAUDE.md` does this for architecture and the migration workflow and not for interaction. **A2.** Add a `docs/rules.md` to Ada, or a "Product rules" section in `CLAUDE.md`, seeded from the decisions already scattered through the build logs and the backlog (pinned chats appear in both places; archive is soft; the confirm gate exists to protect the search budget; routing never gates). Effort: S, ongoing.

### 7.3 Testing the frontend

Builder Journal tests about fifteen components with Testing Library (accessibility menu, AI mode menu, suggestion block, audio player, block editor drag, share menu propagation, detail panel resync, the Ada tab) and keeps pure logic in `src/lib/` with no React so it is trivially unit-tested. Ada's four frontend tests are all pure logic; nothing renders a component. **A3.** Start with the components that have bitten: the sidebar (sort order, pinned in two places), `ProtectedRoute`, the feedback form, the password strength meter, and whatever `DetailSurface` becomes. Effort: M.

### 7.4 Probes and QA notes

Builder Journal's `scripts/probe-*.mjs` (walkthrough, text scale, report chrome, AI trust) are Playwright scripts with mocked network that assert a specific UI state was reached, and `docs/qa/` holds dated notes with a "quiz" format: files changed, logic in one sentence, questions that must pass, evidence. **A4.** Ada has Playwright in its environment and a QA folder that is empty. The v3 PRD calls for E2E at 375 and 1440 px with hover, loading, and error states; one probe per critical path (login, start a sprint, run assumption mapping, export) is enough to start.

### 7.5 State and data fetching

Neither app is a model. Builder Journal provides React Query and then fetches in `useEffect`, coordinating modules through window events. Ada calls Supabase and typed API modules directly with no cache. For Ada the higher-value move is consistency, not a library: one API module per object type (already the pattern for discovery, portfolio, admin, feedback), the 401 recovery wrapper on all of them (a backlog item), and a shared loading-and-error state shape. If a cache is added later, React Query is the obvious one; do not add it before there is a second consumer of the same data.

### 7.6 Shipping rules

Builder Journal's `CLAUDE.md` ships finished work to `main` unasked, waits for CI, merges on green, never on red, and restarts the branch after a merged PR. Ada's asks for a Verification section and hands testing to Mo. Both are right for their context; the Builder Journal rule exists because Mo tests on the deployed app. The one line worth borrowing exactly: "state plainly what was and was not verified; touch behavior cannot be verified from this environment."

### 7.7 Page size

`Admin.tsx` at 2,716 lines is the largest file in either repo and holds eight tabs. Builder Journal's admin is three routes and three files. **A5.** Split Ada's admin by tab into `src/pages/admin/*` before the next tab is added. Effort: M, mechanical.

---

## 8. What not to carry over

- **Offline and PWA.** Builder Journal's IndexedDB queue exists because capture happens on a phone in a moment. Ada's every turn needs the model; offline coaching is not a product. Keep the manifest and icons, skip the sync queue. Builder Journal itself retired its app-shell service worker after it served stale bundles in preview tabs.
- **Spaces, drag-to-reorder, bulk selection, priority temperature.** Ada's sidebar has folders, pin, and drag-to-folder already, at the right size for the number of objects a PM will have.
- **Voice capture and dictation.** Not a coaching input yet; if it becomes one, Builder Journal's Dictate-versus-Transcribe naming rule is the thing to remember.
- **Build in Public, streaks, reminders, and the email queue.** Different product. The one transferable idea is the "proof level" on a self-reported action, which maps loosely to Ada's assumption status history.
- **The paywall and Paddle.** Ada's pricing is an open decision with a note to wait for real cost data. Builder Journal's price changes (three times) and fair-use clause are a cautionary tale, not a template.
- **Two toast systems.** Builder Journal runs shadcn toast and Sonner side by side. Ada uses Sonner; keep it that way.
- **Window CustomEvents for cross-module coordination.** It works in Builder Journal because modules never share a screen. Ada's sprint page shares state between the thread and the assumption panel; keep that in React state or the URL.
- **A "customization by subtraction" layer.** Builder Journal's own kill criterion ("do not turn this into a super app") is the lesson; Ada does not have the surface area to need the feature.

---

## 9. Carry-over plan

Effort: S under a session, M one to two sessions, L several. "Blocks" says what it unblocks.

| # | Item | Effort | Blocks |
|---|---|---|---|
| A1 | Version badge, `package.json` at 1.0.0, changelog rule | S | health page, release notes |
| D1 | `docs/design.md` for Ada | S | every UI item below |
| D2 | Adopt `responsive-guidelines.md`, run its checklist on Sprint and Intel | S then M | 375 px QA in the PRD |
| A2 | Product rules file, seeded from build logs | S | onboarding copy, FAQ |
| P3 | Undo on archive and delete | S | none |
| P6 | Error table with sentences and tests | S | intel wait copy |
| 3.1 | Landing page with pilot disclosure and trust line | M | any outside tester |
| 4.1 | Guide Center: page, table, first content pass | M | onboarding tour links |
| D3 | Theme switch, contrast theme, text scale, profile persistence | M | accessibility claim on landing |
| D4 | Token-completeness test | S | D3 |
| P5 | Staged wait copy on intel runs and kickoff | S | none |
| P7 | Command palette and shortcuts | S to M | none |
| 3.2 | Docs site: five pages served from existing Markdown | M | evals page (Part 1, E1) |
| 4.2 | Quick tour and seeded starter sprint | M | 4.1 |
| P1 | `DetailSurface` rendered three ways; migrate assumption edit and competitor confirm | M | A5 |
| A3 | Component tests for sidebar, route guard, feedback, strength meter | M | none |
| A4 | Four Playwright probes at 375 and 1440 | M | none |
| A5 | Split `Admin.tsx` by tab | M | health page |
| D5 | Icons on every status pill from one status module | S | none |
| D6 | Overflow probe | S | D2 |

The first six rows are one focused session and change how every later screen is built. The landing page and Guide Center are the two items the cohort will see first.

---

## 10. Risks and disagreements

- **Risk: copying Builder Journal's density.** Builder Journal's own `tasks.md` has a debt item called "button and pill sprawl". Ada's restraint is a feature of a coaching product; add controls near the object they affect and nowhere else.
- **Risk: a landing page that overclaims.** Builder Journal's rule is real recordings and no numbers that are not measured. Ada's temptation is to describe Run 5 intel as if the competitive-intelligence flow had been verified live; the backlog says it has not. Record it first.
- **Disagreement with the backlog on ordering.** The backlog lists the landing page under "needs real content and judgment, not a build task". Half of it is a build task (the page, the recordings, the disclosure banner) and can proceed while the copy is judged. Treat the pilot disclosure and the trust line as blocking content and everything else as iterable.
- **Disagreement on the Guide Center's home.** A public `/help` indexed by search engines (Builder Journal emits FAQ JSON-LD) does marketing work for a product with no landing page. Ada's FAQ should be public from day one, not behind login.
- **Flag: the accessibility menu adds a profile column.** `user_profiles` has an explicit column-level UPDATE grant restricted to `display_name`. Theme and text scale need their own grants; do not widen the list.

---

## 11. Questions on Ada's direction

1. **Should the landing page present one product with two tracks, or lead with Discovery and mention Portfolio?** The backlog wants Portfolio promoted to a top-level tab; the landing page should match whichever wins. Assumed: two tracks, equal weight.
2. **Public `/help` and `/docs`, or behind login?** Assumed public for both, per section 10.
3. **Is a contrast theme in scope, or is light and dark enough for now?** Assumed all three, because the token work is the same and the third costs one CSS block.
4. **Does "Coached by Ada" branding go on the Markdown export too, knowing it can be stripped?** The backlog already accepts that; assumed yes, footer only.
5. **Which sprint elements should the quick tour point at?** Assumed thread, assumptions panel, intel actions, report. Needs a look at the live page.

---

## Appendix A. Files consulted

**Builder Journal (`/home/user/davincibuilderjournal001`, v2.41.0):** `src/App.tsx`; `src/pages/{Landing,Auth,Index,Settings,HelpCenter,Feedback,Trash,Install,NotFound}.tsx`; `src/pages/docs/*`; `src/components/{landing/*,GlobalSearch,KeyboardShortcutsOverlay,GuidedTour,OnboardingChoiceDialog,ShareSheet,ModuleEmptyState,AccessibilityMenu,AppVersionBadge,AiSuggestionBlock,ValidateWithAdaDialog}.tsx`; `src/components/modules/*`; `src/lib/{modules,priority,buildStatus,trash,adaBridge,adaHoldingPage,help-format,version,events,interaction-tokens}.ts`; `src/hooks/{use-keyboard-shortcuts,use-mobile,use-offline}.ts`; `src/index.css`; `tailwind.config.ts`; `docs/design.md`; `docs/responsive-guidelines.md`; `docs/rules.md`; `docs/guide-center-content.md`; `docs/masterplan.md`; `docs/tasks.md`; `docs/prds/*`; `docs/briefs/*`; `docs/qa/*`; `docs/releases/*`; `docs/changelog.md`; `supabase/migrations/*`; `.github/workflows/ci.yml`; `CLAUDE.md`.

**Ada Coach (`/home/user/ada-coach`):** `src/App.tsx`; `src/pages/*`; `src/components/{ConversationSidebar,FeedbackFab,FeedbackForm,FeedbackButtons,PasswordStrengthMeter,ProtectedRoute,DemoBadge}.tsx`; `src/lib/{discovery-api,portfolio-api,admin-api,export,report-pdf,session-recovery,risk}.ts`; `src/index.css`; `tailwind.config.ts`; `public/site.webmanifest`; `docs/backlog/ada-coach-backlog-v1.md`; `docs/prds/ada-discovery-coach-v3.md`; `CLAUDE.md`.
