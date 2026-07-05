// Discovery platform types (Run 2) — mirrors the Postgres schema from
// Run 1 + Run 2 migrations. One place, so the API client, sprint UI, and
// report renderer never drift apart.

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

export type AssumptionCategory =
  | 'desirability'
  | 'viability'
  | 'feasibility'
  | 'usability';

export type AssumptionStatus = 'untested' | 'validated' | 'challenged' | 'abandoned';

export type EvidenceStance = 'supports' | 'challenges' | 'neutral';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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
  disclaimer: string;
}

export interface Report {
  id: string;
  session_id: string;
  share_token: string;
  snapshot: ReportSnapshot;
  generated_at: string;
}
