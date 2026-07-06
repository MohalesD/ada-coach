// Discovery platform types (Run 2) — mirrors the Postgres schema from
// Run 1 + Run 2 migrations. One place, so the API client, sprint UI, and
// report renderer never drift apart.

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

export type AssumptionCategory = 'desirability' | 'viability' | 'feasibility' | 'usability';

export type AssumptionStatus = 'untested' | 'validated' | 'challenged' | 'abandoned';

export type EvidenceStance = 'supports' | 'challenges' | 'neutral';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  competitive_gap: CompetitiveGap | null;
  gap_generated_at: string | null;
  intel_status: IntelStatus | null;
  created_at: string;
  updated_at: string;
}

// Intel search runs finish in a background worker (live web-search calls
// outlast the edge gateway's response window); this is the status cell
// the worker reports through and the client polls.
export interface IntelStatus {
  kind: 'market_brief' | 'competitor_identification' | 'competitor_profile';
  state: 'running' | 'done' | 'error';
  started_at: string;
  finished_at?: string;
  competitor_id?: string;
  searches?: number;
  partial?: boolean;
  unmapped?: boolean;
  note?: string | null;
  message?: string;
}

// ── Market + competitive intelligence (Run 5) ──────────────────────────────

export type ConfidenceLabel = 'strong' | 'moderate' | 'thin' | 'none';

export interface MarketBriefSummary {
  market_size: string;
  trends: string;
  demand_signals: string;
  adjacent_players: string;
  narrative: string;
  partial?: boolean;
  search_unavailable?: boolean;
}

export interface MarketBrief {
  id: string;
  product_id: string;
  summary: MarketBriefSummary;
  confidence_label: ConfidenceLabel;
  partial: boolean;
  search_count: number | null;
  retrieved_at: string;
  created_at: string;
  updated_at: string;
}

export interface MarketEvidence {
  id: string;
  market_brief_id: string;
  claim: string;
  source_url: string;
  title: string | null;
  query_used: string | null;
  retrieved_at: string;
}

export interface Competitor {
  id: string;
  product_id: string;
  name: string;
  added_by: 'ada' | 'user';
  confirmed: boolean;
  positioning: string | null;
  pricing_signal: string | null;
  feature_notes: { features?: string[] } | null;
  recent_moves: string | null;
  confidence_label: ConfidenceLabel | null;
  retrieved_at: string;
  profiled_at: string | null;
  created_at: string;
}

export interface CompetitorEvidence {
  id: string;
  competitor_id: string;
  claim: string;
  source_url: string;
  title: string | null;
  query_used: string | null;
  retrieved_at: string;
}

export interface GapItem {
  gap: string;
  rationale: string;
  opportunity: string | null;
}

export interface GapThreat {
  threat: string;
  competitor: string | null;
  related_assumption_ids: string[];
}

export interface CompetitiveGap {
  summary: string;
  gaps: GapItem[];
  threats: GapThreat[];
  confidence_label: ConfidenceLabel;
  competitor_count: number;
  generated_at: string;
}

// The profiling cost math the confirm gate returns — surfaced to the PM
// BEFORE deep profiling spends the budget.
export interface ProfilingPlan {
  confirmed_count: number;
  per_competitor_searches: number;
  total_max_searches: number;
  budget: number;
}

export interface Session {
  id: string;
  product_id: string;
  conversation_id: string;
  status: SessionStatus;
  stage: string | null;
  stage_confidence: number | null;
  current_step: string | null;
  summary: string | null;
  // Agent-loop state (service-owned; written only by the discovery-turn
  // controller). current_step is retired for the loop flow.
  current_phase: DiscoveryGoal | null;
  coverage: Coverage;
  active_framework: Partial<Record<FrameworkSlot, string>>;
  pending_action: PendingAction | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ── Agent-loop redesign (discovery-turn controller) ────────────────────────
// Mirrors supabase/functions/_shared/loop.ts + frameworks.ts. The browser
// never re-declares a framework — it renders what the controller returns.

export type DiscoveryGoal =
  | 'frame'
  | 'surface_assumptions'
  | 'gather_evidence'
  | 'prioritize'
  | 'define_success'
  | 'prepare_to_learn'
  | 'conclude';

export type GoalStatus = 'untouched' | 'in_progress' | 'covered' | 'deferred';

export interface Coverage {
  goals?: Partial<Record<DiscoveryGoal, GoalStatus>>;
  success_metric?: 'defined' | 'declined';
  interviews?: 'prepared' | 'declined';
}

export type ActionType =
  | 'ask_next'
  | 'dig_deeper'
  | 'map_assumptions'
  | 'ground_assumption'
  | 'run_blind_spots'
  | 'propose_prioritization'
  | 'define_success_metric'
  | 'prepare_interviews'
  | 'revisit_phase'
  | 'conclude';

export type FrameworkSlot = 'prioritization' | 'success_metric' | 'interview';

export type FrameworkScoring =
  | {
      kind: 'numeric';
      formula?: 'rice';
      fields: { key: string; label: string; min: number; max: number }[];
    }
  | { kind: 'categorical'; buckets: { key: string; label: string }[] };

export interface PublicFramework {
  id: string;
  name: string;
  slot: FrameworkSlot;
  goal: DiscoveryGoal;
  isDefault: boolean;
  oneLiner: string;
  whenWhy: string;
  scoring: FrameworkScoring | null;
}

// A grounded North Star candidate (camelCase mirrors the capability output).
export interface MetricCandidate {
  northStar: string;
  measures: string;
  groundedIn: string;
  proxy: string;
  driftRisk: string;
}

// The single outstanding proposal awaiting the PM's confirm/override/dismiss.
export interface PendingAction {
  action: ActionType;
  rationale: string;
  framework?: { slot: FrameworkSlot; suggested: string; options: PublicFramework[] };
  target?: { assumption_id?: string; label?: string };
  goal?: DiscoveryGoal;
  data?: { candidates?: MetricCandidate[] };
}

export interface DiscoveryTurnResponse {
  reply: string;
  message_id: string | null;
  pending_action: PendingAction | null;
  current_phase?: DiscoveryGoal;
  coverage?: Coverage;
  session_updated_at?: string;
  evaluation_error?: boolean;
}

// Per-assumption framework scores (assumptions.framework_scores jsonb).
export interface RiceScores {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  score?: number;
}
export interface MoscowScore {
  bucket: 'must' | 'should' | 'could' | 'wont';
}
export type FrameworkScores = RiceScores | MoscowScore;

export interface Assumption {
  id: string;
  product_id: string;
  session_id: string;
  statement: string;
  category: AssumptionCategory;
  confidence: number;
  impact: number;
  status: AssumptionStatus;
  is_prioritized: boolean;
  // Set when the active prioritization framework isn't the default
  // confidence×impact (RICE / MoSCoW). Written only by the controller.
  framework_scores: FrameworkScores | null;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  assumption_id: string;
  session_id: string;
  source_url: string;
  title: string | null;
  snippet: string | null;
  query: string | null;
  stance: EvidenceStance;
  retrieved_at: string;
}

export interface BlindSpot {
  id: string;
  session_id: string;
  assumption_id: string | null;
  statement: string;
  socratic_question: string | null;
  evidence_backed: boolean;
  source_urls: string[];
  created_at: string;
}

export interface InterviewGuide {
  id: string;
  session_id: string;
  version: number;
  content_md: string;
  question_count: number | null;
  created_at: string;
}

export interface SessionDocument {
  id: string;
  filename: string;
  status: string;
  chunk_count: number | null;
  created_at: string;
}

// ── Report snapshot (compiled server-side by the report function) ─────────

export interface SnapshotAssumption {
  id: string;
  statement: string;
  category: AssumptionCategory;
  confidence: number;
  impact: number;
  status: AssumptionStatus;
  is_prioritized: boolean;
}

export interface SnapshotEvidence {
  assumption_id: string;
  source_url: string;
  title: string | null;
  snippet: string | null;
  stance: EvidenceStance;
  query: string | null;
  retrieved_at: string;
}

export interface SnapshotBlindSpot {
  assumption_id: string | null;
  statement: string;
  socratic_question: string | null;
  evidence_backed: boolean;
  source_urls: string[];
}

export interface ReportSnapshot {
  version: number;
  generated_at: string;
  product: { name: string; description: string | null };
  session: {
    id: string;
    status: SessionStatus;
    stage: string | null;
    stage_confidence: number | null;
    summary: string | null;
    created_at: string;
    completed_at: string | null;
  };
  problem_framing: string | null;
  assumptions: SnapshotAssumption[];
  evidence: SnapshotEvidence[];
  blind_spots: SnapshotBlindSpot[];
  interview_guide: {
    version: number;
    content_md: string;
    question_count: number | null;
    created_at: string;
  } | null;
  // Run 5 (snapshot version 2) — absent/null on older snapshots and on
  // products with no intel yet; renderers skip the sections cleanly.
  market_intel?: {
    brief: {
      summary: MarketBriefSummary;
      confidence_label: ConfidenceLabel;
      partial: boolean;
      search_count: number | null;
      retrieved_at: string;
    };
    evidence: {
      claim: string;
      source_url: string;
      title: string | null;
      query_used: string | null;
      retrieved_at: string;
    }[];
  } | null;
  competitive_intel?: {
    competitors: {
      id: string;
      name: string;
      added_by: 'ada' | 'user';
      positioning: string | null;
      pricing_signal: string | null;
      feature_notes: { features?: string[] } | null;
      recent_moves: string | null;
      confidence_label: ConfidenceLabel | null;
      retrieved_at: string;
      profiled_at: string | null;
    }[];
    evidence: {
      competitor_id: string;
      claim: string;
      source_url: string;
      title: string | null;
      retrieved_at: string;
    }[];
    gap: CompetitiveGap | null;
  } | null;
  disclaimer: string;
}

export interface Report {
  id: string;
  session_id: string;
  share_token: string;
  snapshot: ReportSnapshot;
  generated_at: string;
}
