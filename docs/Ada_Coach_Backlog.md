# Ada Coach, Product Backlog (Pre-Linear)
### To be migrated to Linear workspace on Monday, April 14, 2026

---

## How to Use This File

This is a temporary holding document for feature ideas, enhancements, and technical debt items that are out of scope for Week 2 but should be tracked. On Monday, each item below becomes a Linear issue with proper labels, priority, and sprint assignment.

---

## Backlog Items

### B-001: Role Hierarchy System
**Priority:** High (Week 3-4)
**Epic:** Authentication and Access Control
**Description:** Implement a four-tier role system: User, Manager, Admin, Owner. The Owner role (Mo) enables app-wide configuration changes without code deployments. Admin and Manager roles operate within workspace boundaries. User is the default role for coaching session participants.
**Acceptance Criteria:**
- Roles enum defined in database schema (user, manager, admin, owner)
- Role-based RLS policies on all tables
- Owner can modify settings that Admins cannot (e.g., app-wide token budgets, plan-level controls)
- Admin can manage workspace-level settings (user limits, prompt versions)
- Manager can view reports and conversation logs but not modify system settings
- User can only access their own conversations
**Dependencies:** Requires user authentication (Supabase Auth)
**Origin:** Mo's Lovable build pattern, proven across multiple projects

### B-002: Token Usage Monitoring (Admin Dashboard)
**Priority:** High (Week 3)
**Epic:** Usage Analytics and Cost Control
**Description:** Admin-visible dashboard showing total token consumption across all conversations. Breakdown by time period, by conversation, and by user (once auth exists). This is the monitoring foundation that rate limiting builds on.
**Acceptance Criteria:**
- Token count stored per message (already in Week 2 schema)
- Admin panel displays: total tokens used, tokens per day chart, tokens per conversation
- Visual indicator when usage approaches a configurable threshold
**Dependencies:** Week 2 Layer 1 (token_count column already exists in messages table)
**Lovable Reference Prompt:** "Add analytics tracking for chatbot usage, most asked questions, unanswered queries, and usage frequency, visible in the Admin Panel."

### B-003: Rate Limiting and Usage Caps
**Priority:** Medium (Week 4)
**Epic:** Usage Analytics and Cost Control
**Description:** Per-user and workspace-wide token usage limits. Admin can set daily/weekly/monthly message caps. Owner can set app-wide budgets and override workspace limits. Automatic enforcement: when a user hits their cap, the chat function returns a friendly message instead of calling the API.
**Acceptance Criteria:**
- Configurable daily message limit per user
- Configurable monthly token budget per workspace
- Admin panel setting to adjust limits without database changes
- Owner panel setting for app-wide budget caps
- Graceful degradation: user sees "You've reached your daily limit" message, not an error
- Override capability: Owner can temporarily increase limits for specific users
**Dependencies:** B-001 (role hierarchy), B-002 (token monitoring), user authentication
**Lovable Reference Prompts:**
- "Add rate limiting or usage caps per user for the chatbot to prevent excessive AI credit consumption."
- "Add a setting in the Admin Panel Settings tab to let admins adjust the chatbot daily message limit without touching the database directly."

### B-004: Owner Control Panel
**Priority:** Medium (Week 4-5)
**Epic:** Authentication and Access Control
**Description:** A dedicated Owner interface (separate from Admin) for app-wide configuration. Enables Mo to adjust settings, manage plans, view cross-workspace analytics, and control feature flags without code deployment.
**Acceptance Criteria:**
- Owner-only route (not visible to Admin, Manager, or User roles)
- App-wide token budget management
- Service plan configuration (token allocations per plan tier)
- Feature flag toggles
- Cross-workspace usage analytics
**Dependencies:** B-001 (role hierarchy), user authentication

### B-005: Name Change from Vera to Ada Coach
**Priority:** High (Week 2, post-submission)
**Epic:** Brand and Identity
**Description:** Rebrand from "Vera" to "Ada" (or "Ada Coach") across all user-facing surfaces. Update landing page copy, system prompts, meta tags, footer, and any hardcoded references.
**Origin:** Name chosen for Igbo meaning (first daughter, leader, teacher, protector, mentor) and natural resonance in English-speaking markets. Secondary association with Ada Lovelace strengthens AI product positioning.
**Note:** Verify competitive landscape. Ada.cx is an existing AI customer service company. Differentiate with "Ada Coach" or "Ada by Poprouser" if needed.

### B-006: Linear Workspace Setup
**Priority:** Critical (Monday, April 14)
**Epic:** PM Tooling
**Description:** Set up Linear workspace for Ada Coach. Create team, configure labels (feature, bug, tech-debt, documentation), set up sprint cycles, and migrate all items from this backlog file into proper issues.
**Acceptance Criteria:**
- Workspace created and configured
- Labels defined: Feature, Bug, Tech Debt, Documentation, Design
- Priority levels configured
- Sprint 1 defined (Week 3 scope)
- All B-00X items from this file migrated as issues
- This file archived with a note pointing to Linear

### B-007: Notion PRD and Documentation Hub
**Priority:** High (Monday, April 14)
**Epic:** PM Tooling
**Description:** Set up Notion workspace for Ada Coach product documentation. House the PRD, architecture decisions, design principles, sprint retrospectives, and evaluation artifacts.
**Dependencies:** None
**Acceptance Criteria:**
- Notion workspace or page created
- PRD moved/linked from local markdown to Notion
- Architecture diagram added
- Sprint retrospective template created

### B-009: Mobile Sidebar Drawer
**Priority:** Medium (follow-up to bulk-select work)
**Epic:** Mobile / Cross-Platform
**Decision Date:** 2026-05-05
**Description:** The conversation sidebar is desktop-only today (`hidden md:flex` in `ConversationSidebar.tsx`). On mobile (`<md` breakpoint), users can't see, switch, or manage their past conversations at all. Add a slide-in drawer (shadcn `Sheet` primitive) opened via a hamburger button in the chat header. Reuse the sidebar component verbatim inside the drawer — same search, list, bulk-select, action bar.
**Why deferred:** Bulk-select desktop is the priority ship. Mobile drawer is a meaningful add (~0.5 day plus a real touch-target pass) and shouldn't gate getting bulk-select in front of users.
**Acceptance Criteria:**
- Hamburger button visible only on `<md`; opens sidebar in a `Sheet` drawer
- Bulk-select action bar docks to bottom of drawer on mobile
- Touch targets ≥ 44×44px on rows, checkboxes, pin/⋯ icons
- Pin and ⋯ icons always visible on touch (no hover-to-reveal)
- Drawer closes on conversation select; bulk-select mode persists across drawer open/close
**Dependencies:** Bulk-select feature must ship first (this reuses its components).

### B-008: Time-Based Credit Reset via pg_cron (Revisit)
**Priority:** Low (revisit when user base grows or stale-badge complaints recur)
**Epic:** Usage Analytics and Cost Control
**Decision Date:** 2026-05-05
**Description:** On 2026-05-05 we discovered the daily credit reset was lazy — it only fired inside the `chat` Edge Function on message send, so users who hit zero saw a stale badge until they tried sending again. We chose **Option A** (extract reset into a Postgres function `fn_reset_credits_if_due` and call it from both the chat function and the frontend's credits-fetch `useEffect` on app load). This keeps the on-demand pattern but plugs the UI gap with no new infra.
**Why we deferred Option B:** Option B (pg_cron job at 00:00 UTC resetting all users) is more durable — no reliance on user activity to trigger reset, no per-request DB write, simpler mental model. We chose A for smaller blast radius and faster ship. Revisit if: (a) we add features that read credits outside the chat path, (b) we want a clean audit trail of "credits issued per day," or (c) the user count grows past where per-request reset checks feel wasteful.
**Acceptance Criteria (when revisited):**
- `pg_cron` extension enabled in Supabase
- Nightly job at 00:00 UTC resets all non-owner users to current `daily_message_limit`
- Lazy reset logic in `chat` and frontend removed
- Backfill plan for users whose `last_credit_reset` is stale at deploy time
**Dependencies:** None (Option A must already be shipped so we know the lazy path is removable)

---

## Epics Summary

| Epic | Items | Target |
|------|-------|--------|
| Authentication and Access Control | B-001, B-004 | Weeks 3-4 |
| Usage Analytics and Cost Control | B-002, B-003, B-008 | Weeks 3-4; B-008 deferred |
| Brand and Identity | B-005 | Week 2 post-submission |
| PM Tooling | B-006, B-007 | Monday April 14 |

---

*This file becomes obsolete once Linear is set up. Archive it, don't delete it, as a record of pre-sprint planning.*
