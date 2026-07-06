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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

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
