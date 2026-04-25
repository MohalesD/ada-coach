# Project Ada, Week 3 PRD

### Security Sprint, Polish, and Tooling

**Author:** Mohales "Mo" Deis  **Date:** April 25, 2026  **Course:** AI Coding for Product Managers (Maven, Rajesh Pentakota)  **Status:** Complete

---

## 1. Problem Statement

Week 2 shipped a working MVP but left three open gaps:

1. **Security posture was incomplete.** The `user_profiles` table had no column-level grants — any authenticated user could self-elevate to `owner` via a PostgREST write, and `requireAdmin()` would trust it. CORS returned `*`, accepting any origin.
2. **The product lacked depth for real users.** No way to review past sessions, give Ada feedback, export a conversation, or get a summary of what was discovered.
3. **No working process for safe changes.** No branching convention, no task tracking, no way to deploy a fix without risking main.

Week 3 addressed all three.

---

## 2. What Was Built

### 2A. User-Facing Features

| Feature | How it works |
|---------|-------------|
| Per-message feedback | Thumbs up/down on every Ada response. Writes to `messages.feedback` via `use-feedback.ts`. RLS-enforced column-level grant. |
| Session summaries | "Generate Summary" sends `__SUMMARY__` sentinel to `/chat`. Response stored with `kind = 'summary'`, rendered with gold badge + tinted bubble. |
| Markdown export | `exportConversation()` in `src/lib/export.ts` builds a `.md` file client-side (body messages + summary section) and triggers download. No server round-trip. |
| Admin Insights dashboard | New `/admin` tab. Aggregates feedback totals, positive/negative rates, per-conversation and per-prompt breakdowns, top 5 positive/negative messages, recent 10 events. |
| Profile / password settings | `/settings` route. `display_name` update + password change via Supabase Auth. Column-level grant enforces that `display_name` is the only user-writable field. |

### 2B. Security Hardening

| Fix | What changed |
|-----|-------------|
| Privilege escalation (Critical) | Migration `20260418150000_lockdown_user_profiles.sql`: `REVOKE UPDATE ON user_profiles FROM authenticated; GRANT UPDATE (display_name) ON user_profiles TO authenticated;` |
| CORS allowlist (Medium) | `corsHeaders` in `_shared/auth.ts` became a function; reads `ALLOWED_ORIGINS` env var, echoes `Origin` only when allowlisted. All four functions updated to thread `req`. Default: `localhost:5175` only. Production: `+ https://ada-coach.vercel.app`. |
| Column-level grant on messages | `messages.feedback` is the only column authenticated users can UPDATE — code, role, content are locked even if RLS is ever loosened. |

### 2C. Workflow and Tooling

- **Git branching:** `security-hardening` branch, reviewed, merged via `--no-ff` into `main`.
- **Tasks file:** `tasks/todo.md` at project root — completed sprint checklist + RAG subtasks + prioritized backlog.
- **CLAUDE.md hardened:** Column-grant convention documented; Vercel preview URL CORS caveat added; `Co-Authored-By` commit rule added; backlog week labels cleaned up.
- **Two-User Test:** Verified that a regular user cannot read another user's conversations (RLS), cannot self-elevate (column grant), and can only update their own feedback.

---

## 3. What Was Deferred

| Item | Reason | Backlog ID |
|------|--------|------------|
| Email enumeration fix | UX trade-off unresolved — removing the "email exists" message hurts UX without a redesigned flow | Security audit #3 |
| Rate limiting on `/chat` | Needs infrastructure decision (Upstash vs. Supabase native) | B-003 |
| Password reset / forgot-password | Supabase `resetPasswordForEmail` is ready to wire up; no `/auth/callback` route yet | — |
| Audit trail for role changes | Nice-to-have; lower priority now that column grant closes the self-elevation path | Security audit #10 |
| RAG document upload | Pushed to Week 4 as primary feature | B-RAG |

---

## 4. What's Next (Week 4)

Primary feature: **RAG document upload module** — give Ada access to a PM's own documents so she can coach against specific product briefs, interview notes, and research.

See `Ada_Coach_Week4_PRD.md` for full spec.
