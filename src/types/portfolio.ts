// Portfolio track types (Run 4) — mirrors the portfolio_profiles /
// portfolio_projects schema plus the portfolio Edge Function response
// shapes. One place, so the API client, router, dashboard, workspace,
// and share view never drift apart.

export type RecommendedTrack = 'portfolio' | 'discovery' | 'both';

export type RouterPersona = 'aspiring_pm' | 'early_stage_pm' | 'unclear';

export interface RouteResult {
  persona: RouterPersona;
  recommended_track: RecommendedTrack;
  confidence: number;
  reason: string;
}

export interface PortfolioProfile {
  id: string;
  conversation_id: string;
  resume_text: string | null;
  background: string | null;
  target_companies: string | null;
  target_archetype: string | null;
  created_at: string;
  updated_at: string;
}

export type ArtifactType = 'prd' | 'brief' | 'prototype_spec';

export type ProjectStatus = 'proposed' | 'in_progress' | 'complete';

export interface ArtifactSection {
  key: string;
  title: string;
  content_md: string;
}

export interface ArtifactContent {
  idea?: { description: string; why_you: string };
  sections?: ArtifactSection[];
  draft_ready?: boolean;
}

export interface EffortPlanTool {
  name: string;
  purpose: string;
  cost_note: string;
}

export interface EffortPlan {
  tools: EffortPlanTool[];
  total_hours: number;
  cadence: string;
  timeline: string;
  honesty_note: string;
}

export interface PortfolioProject {
  id: string;
  portfolio_profile_id: string;
  idea_title: string;
  ai_angle: string | null;
  chosen: boolean;
  artifact_type: ArtifactType | null;
  artifact_content: ArtifactContent;
  effort_estimate: EffortPlan | null;
  status: ProjectStatus;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

// What portfolio-project-public serves to logged-out visitors — selected
// columns only, no user id, no token echo.
export interface PublicArtifact {
  idea_title: string;
  ai_angle: string | null;
  artifact_type: ArtifactType | null;
  artifact_content: ArtifactContent;
  effort_estimate: EffortPlan | null;
  status: ProjectStatus;
  updated_at: string;
}

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  prd: 'PRD',
  brief: 'Product brief',
  prototype_spec: 'Prototype spec',
};

export interface RedactionInfo {
  redacted_count: number;
  flagged: { token: string; context: string }[];
}
