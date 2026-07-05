// Portfolio API client (Run 4) — one thin layer over the portfolio Edge
// Functions, mirroring discovery-api.ts: every mutation goes through a
// function; the only direct read is the conversation thread, which the
// existing loadThread already covers. Shares DiscoveryApiError so error
// handling is one vocabulary across the app.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { DiscoveryApiError } from '@/lib/discovery-api';
import type {
  ArtifactType,
  EffortPlan,
  PortfolioProfile,
  PortfolioProject,
  PublicArtifact,
  RedactionInfo,
  RouteResult,
} from '@/types/portfolio';

async function invoke<T>(
  path: string,
  options: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown } = { method: 'GET' }
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(path, {
    method: options.method,
    body: options.body,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      throw new DiscoveryApiError({
        status: error.context.status,
        code: typeof payload?.error === 'string' ? payload.error : 'request_failed',
        detail: typeof payload?.detail === 'string' ? payload.detail : null,
        retryable: payload?.retryable === true,
      });
    }
    throw new DiscoveryApiError({
      status: 0,
      code: 'network_error',
      detail: 'Could not reach Ada. Check your connection and try again.',
      retryable: true,
    });
  }
  return data as T;
}

// ── Router ─────────────────────────────────────────────────────────────────

export async function routeIntake(answers: string): Promise<RouteResult> {
  return invoke('portfolio-route', { method: 'POST', body: { answers } });
}

// ── Profiles ───────────────────────────────────────────────────────────────

export async function createPortfolioSession(): Promise<PortfolioProfile> {
  const { profile } = await invoke<{ profile: PortfolioProfile }>('portfolio-sessions', {
    method: 'POST',
    body: {},
  });
  return profile;
}

export async function listPortfolioProfiles(): Promise<PortfolioProfile[]> {
  const { profiles } = await invoke<{ profiles: PortfolioProfile[] }>('portfolio-sessions');
  return profiles;
}

export async function saveProfile(
  id: string,
  fields: {
    resume_text?: string;
    resume_file_path?: string;
    background?: string;
    target_companies?: string;
    target_archetype?: string;
  }
): Promise<{ profile: PortfolioProfile; redaction?: RedactionInfo; extraction_error?: boolean }> {
  return invoke(`portfolio-profile?id=${id}`, { method: 'POST', body: fields });
}

// Uploads a resume file into the caller's own folder in the documents
// bucket (the Run 3 per-user storage policies), returning the path that
// portfolio-profile accepts as resume_file_path.
export async function uploadResumeFile(userId: string, file: File): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}_${file.name}`;
  const { error } = await supabase.storage.from('documents').upload(path, file);
  if (error) {
    throw new DiscoveryApiError({
      status: 500,
      code: 'upload_failed',
      detail: "The resume didn't upload. Your file is untouched — try again.",
      retryable: true,
    });
  }
  return path;
}

// ── Ideas & projects ───────────────────────────────────────────────────────

export type IdeasResult =
  | { kind: 'ideas'; projects: PortfolioProject[] }
  | { kind: 'questions'; questions: string[] };

export async function generateIdeas(profileId: string): Promise<IdeasResult> {
  const data = await invoke<{
    projects?: PortfolioProject[];
    needs_more?: boolean;
    questions?: string[];
  }>(`portfolio-ideas?id=${profileId}`, { method: 'POST', body: {} });
  if (data.needs_more && data.questions) {
    return { kind: 'questions', questions: data.questions };
  }
  return { kind: 'ideas', projects: data.projects ?? [] };
}

export async function listProjects(profileId?: string): Promise<PortfolioProject[]> {
  const path = profileId ? `portfolio-projects?profile_id=${profileId}` : 'portfolio-projects';
  const { projects } = await invoke<{ projects: PortfolioProject[] }>(path);
  return projects;
}

export async function getProject(id: string): Promise<PortfolioProject> {
  const { project } = await invoke<{ project: PortfolioProject }>(`portfolio-projects?id=${id}`);
  return project;
}

export async function chooseProject(
  id: string,
  artifactType: ArtifactType
): Promise<PortfolioProject> {
  const { project } = await invoke<{ project: PortfolioProject }>(`portfolio-projects?id=${id}`, {
    method: 'PATCH',
    body: { action: 'choose', artifact_type: artifactType },
  });
  return project;
}

export async function shareProject(id: string): Promise<PortfolioProject> {
  const { project } = await invoke<{ project: PortfolioProject }>(`portfolio-projects?id=${id}`, {
    method: 'PATCH',
    body: { action: 'share' },
  });
  return project;
}

// ── Coaching & plan ────────────────────────────────────────────────────────

export async function coachTurn(
  projectId: string,
  message: string
): Promise<{
  reply: string;
  message_id: string | null;
  project: PortfolioProject;
  sections_updated: boolean;
  draft_ready: boolean;
}> {
  return invoke(`portfolio-coach?id=${projectId}`, {
    method: 'POST',
    body: { message },
  });
}

export async function generatePlan(
  projectId: string
): Promise<{ project: PortfolioProject; plan: EffortPlan }> {
  return invoke(`portfolio-plan?id=${projectId}`, { method: 'POST', body: {} });
}

// ── Public share view — logged-out visitors, plain fetch, no session ──────

export async function fetchPublicArtifact(token: string): Promise<PublicArtifact | null> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(
    `${base}/functions/v1/portfolio-project-public?token=${encodeURIComponent(token)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new DiscoveryApiError({ status: res.status, code: 'share_load_failed' });
  }
  const { artifact } = (await res.json()) as { artifact: PublicArtifact };
  return artifact;
}
