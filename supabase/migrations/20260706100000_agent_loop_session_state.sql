-- Agent-Loop Redesign — session loop state + framework scores
-- Replaces the client-driven fixed-step script (SPRINT_STEPS) with a
-- server-owned agent loop. The controller (discovery-turn Edge Function)
-- owns all loop state; the model only *recommends* the next action.
--
-- Posture: every new column here is SERVICE-OWNED — written only by the
-- controller via the service role, exactly like sessions.stage/summary.
-- We therefore lock down the authenticated UPDATE grant (column-level,
-- mirroring 20260418150000_lockdown_user_profiles.sql) so a browser cannot
-- tamper with loop state, chosen frameworks, or a pending proposal via
-- direct PostgREST writes. The two columns authenticated legitimately
-- writes today (status → abandon; current_step → resume bookmark) stay
-- granted so the existing /sessions function is unaffected.

-- ── sessions: loop state ──────────────────────────────────────────────────

alter table sessions
  add column current_phase text
    check (
      current_phase is null
      or current_phase in (
        'frame', 'surface_assumptions', 'gather_evidence',
        'prioritize', 'define_success', 'prepare_to_learn', 'conclude'
      )
    ),
  -- Per-goal status map + per-assumption test/defer state. Shape validated
  -- in the controller; free jsonb here. Defaults to an empty object so the
  -- controller can always merge into it.
  add column coverage jsonb not null default '{}'::jsonb,
  -- The PM's confirmed framework choices per applicable goal, e.g.
  -- {"prioritization":"rice","success_metric":"north_star"}.
  add column active_framework jsonb not null default '{}'::jsonb,
  -- The single outstanding proposal awaiting confirm/override/dismiss.
  -- NULL = no pending proposal (the meaningful "nothing to decide" state),
  -- so this column is nullable with no default.
  add column pending_action jsonb;

-- Lock authenticated UPDATE to the columns the browser still writes
-- directly. Everything else on sessions (stage, summary, current_phase,
-- coverage, active_framework, pending_action, …) is service-role-only.
revoke update on sessions from authenticated;
grant update (status, current_step) on sessions to authenticated;

-- ── assumptions: framework scores ─────────────────────────────────────────

-- RICE is 4-dimensional (reach/impact/confidence/effort/score) and MoSCoW
-- is categorical (must/should/could/wont) — neither fits the existing 1–5
-- confidence/impact integer columns, which stay for the default framework
-- and general risk scoring. Framework-specific scores live here.
alter table assumptions
  add column framework_scores jsonb;

-- Keep framework_scores service-only: the controller writes it. Preserve
-- the four columns the /assumptions PATCH already writes via the RLS-bound
-- client so that function is unaffected.
revoke update on assumptions from authenticated;
grant update (confidence, impact, status, is_prioritized) on assumptions to authenticated;
