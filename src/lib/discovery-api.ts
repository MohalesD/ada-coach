// Discovery API client (Run 2) — one thin layer over the discovery Edge
// Functions plus the read-own table selects RLS already permits. Every
// mutation goes through a function; reads that need no orchestration go
// straight to PostgREST.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isEdgeAuthError, recoverSession } from '@/lib/session-recovery';
import type {
  ActionType,
  Assumption,
  BlindSpot,
  Competitor,
  CompetitorEvidence,
  CompetitiveGap,
  Coverage,
  DiscoveryGoal,
  DiscoveryTurnResponse,
  Evidence,
  FrameworkSlot,
  IntelStatus,
  InterviewGuide,
  MarketBrief,
  MarketEvidence,
  Product,
  ProfilingPlan,
  PublicFramework,
  Report,
  ReportSnapshot,
  Session,
  SessionDocument,
} from '@/types/discovery';

export class DiscoveryApiError extends Error {
  status: number;
  code: string;
  detail: string | null;
  retryable: boolean;

  constructor(opts: { status: number; code: string; detail?: string | null; retryable?: boolean }) {
    super(opts.detail ?? opts.code);
    this.name = 'DiscoveryApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail ?? null;
    this.retryable = opts.retryable ?? false;
  }
}

async function invoke<T>(
  path: string,
  options: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {
    method: 'GET',
  }
): Promise<T> {
  // At most two attempts: a 401 on the first means the access token was
  // rejected, so we refresh the session once and retry with a fresh token. A
  // dead session (refresh failed) redirects to /login instead of erroring.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.functions.invoke<T>(path, {
      method: options.method,
      body: options.body,
    });
    if (!error) return data as T;

    if (error instanceof FunctionsHttpError) {
      if (attempt === 0 && isEdgeAuthError(error)) {
        if (await recoverSession()) continue; // refreshed — retry once
        throw new DiscoveryApiError({
          status: 401,
          code: 'session_expired',
          detail: 'Your session expired. Please sign in again.',
        });
      }
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
  // Unreachable: the loop returns or throws on every path.
  throw new DiscoveryApiError({ status: 0, code: 'network_error', retryable: true });
}

// ── Products ───────────────────────────────────────────────────────────────

export async function listProducts(): Promise<Product[]> {
  const { products } = await invoke<{ products: Product[] }>('products');
  return products;
}

export async function createProduct(name: string, description?: string): Promise<Product> {
  const { product } = await invoke<{ product: Product }>('products', {
    method: 'POST',
    body: { name, description },
  });
  return product;
}

export async function renameProduct(id: string, name: string): Promise<Product> {
  const { product } = await invoke<{ product: Product }>(`products?id=${id}`, {
    method: 'PATCH',
    body: { name },
  });
  return product;
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'product_load_failed' });
  }
  return (data as Product | null) ?? null;
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function startSession(
  productId: string,
  intake: string
): Promise<{ session: Session; resumed: boolean; classification_error?: boolean }> {
  return invoke('sessions', {
    method: 'POST',
    body: { product_id: productId, intake },
  });
}

export async function getSession(id: string): Promise<Session> {
  const { session } = await invoke<{ session: Session }>(`sessions?id=${id}`);
  return session;
}

export async function listSessions(productId?: string): Promise<Session[]> {
  const path = productId ? `sessions?product_id=${productId}` : 'sessions';
  const { sessions } = await invoke<{ sessions: Session[] }>(path);
  return sessions;
}

// Sprint writes carry the updated_at the client last loaded as an
// optimistic-concurrency token (Run 3 two-tab guard): the server rejects
// with 409 stale_session instead of letting a stale tab overwrite newer
// progress.
export async function saveSessionStep(
  id: string,
  currentStep: string,
  ifUnmodifiedSince?: string
): Promise<Session> {
  const { session } = await invoke<{ session: Session }>(`sessions?id=${id}`, {
    method: 'PATCH',
    body: { current_step: currentStep, if_unmodified_since: ifUnmodifiedSince },
  });
  return session;
}

export async function completeSession(
  id: string,
  ifUnmodifiedSince?: string
): Promise<{ session: Session; summary_error?: boolean }> {
  return invoke(`sessions?id=${id}`, {
    method: 'PATCH',
    body: { action: 'complete', if_unmodified_since: ifUnmodifiedSince },
  });
}

export async function abandonSession(id: string, ifUnmodifiedSince?: string): Promise<Session> {
  const { session } = await invoke<{ session: Session }>(`sessions?id=${id}`, {
    method: 'PATCH',
    body: { action: 'abandon', if_unmodified_since: ifUnmodifiedSince },
  });
  return session;
}

// ── Assumptions ────────────────────────────────────────────────────────────

export async function mapAssumptions(sessionId: string): Promise<Assumption[]> {
  const { assumptions } = await invoke<{ assumptions: Assumption[] }>('assumption-mapping', {
    method: 'POST',
    body: { session_id: sessionId },
  });
  return assumptions;
}

export async function listAssumptions(sessionId: string): Promise<Assumption[]> {
  const { assumptions } = await invoke<{ assumptions: Assumption[] }>(
    `assumptions?session_id=${sessionId}`
  );
  return assumptions;
}

export async function updateAssumption(
  id: string,
  patch: Partial<Pick<Assumption, 'confidence' | 'impact' | 'status' | 'is_prioritized'>>
): Promise<Assumption> {
  const { assumption } = await invoke<{ assumption: Assumption }>(`assumptions?id=${id}`, {
    method: 'PATCH',
    body: patch,
  });
  return assumption;
}

// ── Market grounding / blind spots / guide ────────────────────────────────

export async function groundAssumption(assumptionId: string): Promise<{
  assumption_id: string;
  summary: string;
  evidence: Evidence[];
  searches: number;
}> {
  return invoke('market-grounding', {
    method: 'POST',
    body: { assumption_id: assumptionId },
  });
}

export async function listEvidence(sessionId: string): Promise<Evidence[]> {
  const { data, error } = await supabase
    .from('assumption_evidence')
    .select('*')
    .eq('session_id', sessionId)
    .order('retrieved_at', { ascending: true });
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'evidence_load_failed' });
  }
  return (data ?? []) as Evidence[];
}

export async function runBlindSpots(sessionId: string): Promise<BlindSpot[]> {
  const { blind_spots } = await invoke<{ blind_spots: BlindSpot[] }>('blind-spots', {
    method: 'POST',
    body: { session_id: sessionId },
  });
  return blind_spots;
}

export async function listBlindSpots(sessionId: string): Promise<BlindSpot[]> {
  const { data, error } = await supabase
    .from('blind_spots')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'blind_spots_load_failed' });
  }
  return (data ?? []) as BlindSpot[];
}

export async function generateGuide(sessionId: string): Promise<InterviewGuide> {
  const { guide } = await invoke<{ guide: InterviewGuide }>('interview-guide', {
    method: 'POST',
    body: { session_id: sessionId },
  });
  return guide;
}

export async function getLatestGuide(sessionId: string): Promise<InterviewGuide | null> {
  const { data, error } = await supabase
    .from('interview_guides')
    .select('*')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'guide_load_failed' });
  }
  return (data as InterviewGuide | null) ?? null;
}

// ── Session documents (grounding) ─────────────────────────────────────────

export async function ingestPastedText(
  sessionId: string,
  pastedText: string,
  title?: string
): Promise<{
  document?: { id: string };
  chunk_count?: number;
  redaction?: {
    redacted_count: number;
    flagged: { token: string; context: string }[];
  };
}> {
  return invoke('ingest', {
    method: 'POST',
    body: { session_id: sessionId, pasted_text: pastedText, title },
  });
}

export async function listSessionDocuments(sessionId: string): Promise<SessionDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, filename, status, chunk_count, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'documents_load_failed' });
  }
  return (data ?? []) as SessionDocument[];
}

// ── Market + competitive intelligence (Run 5) ─────────────────────────────
// Mutations go through the intel Edge Functions (service-role writes,
// budget enforcement, evidence grounding); reads that need no
// orchestration go straight to PostgREST under select-own RLS.

export async function getIntelSearchBudget(): Promise<number> {
  const { budget } = await invoke<{ budget: number }>('market-intel');
  return budget;
}

// The three search endpoints answer 202 and finish in a background
// worker; poll products.intel_status for the outcome.
export interface IntelRunStart {
  started: boolean;
  started_at: string;
  budget?: number;
}

export async function generateMarketBrief(productId: string): Promise<IntelRunStart> {
  return invoke('market-intel', {
    method: 'POST',
    body: { product_id: productId },
  });
}

// Poll until the background run that began at sinceIso reports done or
// error. The timeout is generous (workers can run minutes); on timeout a
// synthetic error status comes back with honest next-step copy.
export async function pollIntelStatus(
  productId: string,
  sinceIso: string,
  timeoutMs = 420_000
): Promise<IntelStatus> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const { data, error } = await supabase
      .from('products')
      .select('intel_status')
      .eq('id', productId)
      .maybeSingle();
    if (!error) {
      const status = (data?.intel_status ?? null) as IntelStatus | null;
      if (status && status.started_at >= sinceIso && status.state !== 'running') {
        return status;
      }
    }
    if (Date.now() > deadline) {
      return {
        kind: 'market_brief',
        state: 'error',
        started_at: sinceIso,
        message:
          'This is taking longer than it should. Ada may still finish — reload the page in a minute, or run it again.',
      };
    }
  }
}

export async function getMarketBrief(productId: string): Promise<MarketBrief | null> {
  const { data, error } = await supabase
    .from('market_briefs')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'brief_load_failed' });
  }
  return (data as MarketBrief | null) ?? null;
}

export async function listMarketEvidence(briefId: string): Promise<MarketEvidence[]> {
  const { data, error } = await supabase
    .from('market_evidence')
    .select('*')
    .eq('market_brief_id', briefId)
    .order('retrieved_at', { ascending: true });
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'evidence_load_failed' });
  }
  return (data ?? []) as MarketEvidence[];
}

export async function identifyCompetitors(productId: string): Promise<IntelRunStart> {
  return invoke('competitive-intel', {
    method: 'POST',
    body: { product_id: productId },
  });
}

export async function confirmCompetitors(
  productId: string,
  changes: { confirm: string[]; add: string[]; remove: string[] }
): Promise<{ competitors: Competitor[]; profiling: ProfilingPlan }> {
  return invoke('competitive-intel', {
    method: 'PATCH',
    body: { product_id: productId, ...changes },
  });
}

export async function listCompetitors(productId: string): Promise<Competitor[]> {
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'competitors_load_failed' });
  }
  return (data ?? []) as Competitor[];
}

export async function listCompetitorEvidence(
  competitorIds: string[]
): Promise<CompetitorEvidence[]> {
  if (competitorIds.length === 0) return [];
  const { data, error } = await supabase
    .from('competitor_evidence')
    .select('*')
    .in('competitor_id', competitorIds)
    .order('retrieved_at', { ascending: true });
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'evidence_load_failed' });
  }
  return (data ?? []) as CompetitorEvidence[];
}

export async function profileCompetitor(
  competitorId: string
): Promise<IntelRunStart & { per_competitor_budget: number }> {
  return invoke('competitor-profile', {
    method: 'POST',
    body: { competitor_id: competitorId },
  });
}

export async function runGapAnalysis(productId: string): Promise<{ gap: CompetitiveGap }> {
  return invoke('competitive-gap', {
    method: 'POST',
    body: { product_id: productId },
  });
}

// ── Reports ────────────────────────────────────────────────────────────────

export async function compileReport(sessionId: string): Promise<Report> {
  const { report } = await invoke<{ report: Report }>('report', {
    method: 'POST',
    body: { session_id: sessionId },
  });
  return report;
}

export async function getReport(sessionId: string): Promise<Report | null> {
  try {
    const { report } = await invoke<{ report: Report }>(`report?session_id=${sessionId}`);
    return report;
  } catch (err) {
    if (err instanceof DiscoveryApiError && err.status === 404) return null;
    throw err;
  }
}

// Public share view — logged-out visitors, plain fetch, no session.
export async function fetchPublicReport(token: string): Promise<{
  snapshot: ReportSnapshot;
  generated_at: string;
} | null> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${base}/functions/v1/report-public?token=${encodeURIComponent(token)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new DiscoveryApiError({ status: res.status, code: 'share_load_failed' });
  }
  return res.json();
}

// ── Sprint thread (reuses the existing conversation engine) ───────────────

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind?: 'message' | 'summary';
  created_at: string;
}

export async function loadThread(conversationId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, kind, created_at')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true });
  if (error) {
    throw new DiscoveryApiError({ status: 500, code: 'thread_load_failed' });
  }
  return (data ?? []) as ThreadMessage[];
}

export async function sendChat(
  message: string,
  conversationId: string
): Promise<{ reply: string; message_id: string; credits_remaining?: number | null }> {
  return invoke('chat', {
    method: 'POST',
    body: { message, conversation_id: conversationId },
  });
}

// ── Agent loop (discovery-turn controller) ────────────────────────────────
// Every sprint turn and every direction-changing action goes through the one
// controller. It coaches, evaluates, and gates; the browser renders proposals
// and sends back confirm/override/dismiss (or initiates an action out of turn).

// Result of a resolve/initiate dispatch. Fields present depend on the action.
export interface DispatchResult {
  ok?: boolean;
  dismissed?: boolean;
  concluded?: boolean;
  current_phase?: DiscoveryGoal;
  coverage?: Coverage;
  active_framework?: Partial<Record<FrameworkSlot, string>>;
  result?: Record<string, unknown>;
  session?: { session: Session };
  session_updated_at?: string;
}

// The framework library — teaching text + scoring schema, the single source
// from the server registry (the browser never re-declares a framework).
export async function getFrameworks(): Promise<PublicFramework[]> {
  const { frameworks } = await invoke<{ frameworks: PublicFramework[] }>(
    'discovery-turn?resource=frameworks'
  );
  return frameworks;
}

// A PM turn: persist → coach reply → evaluate → gate. A direction-changing
// recommendation comes back as pending_action; within-phase ones don't.
export async function sendDiscoveryTurn(
  sessionId: string,
  message: string
): Promise<DiscoveryTurnResponse> {
  return invoke('discovery-turn', {
    method: 'POST',
    body: { session_id: sessionId, message },
  });
}

// Confirm / override / dismiss the outstanding proposal. ifUnmodifiedSince is
// the concurrency token (session_updated_at) the client last held.
export async function resolveDiscoveryAction(
  sessionId: string,
  resolve: {
    decision: 'confirm' | 'override' | 'dismiss';
    action?: ActionType;
    params?: Record<string, unknown>;
  },
  ifUnmodifiedSince?: string
): Promise<DispatchResult> {
  return invoke('discovery-turn', {
    method: 'POST',
    body: { session_id: sessionId, resolve, if_unmodified_since: ifUnmodifiedSince },
  });
}

// A PM-initiated action, out of turn (bypasses the evaluator) — e.g. picking
// a framework from the library or asking Ada to map assumptions now.
export async function initiateDiscoveryAction(
  sessionId: string,
  action: ActionType,
  params?: Record<string, unknown>,
  ifUnmodifiedSince?: string
): Promise<DispatchResult> {
  return invoke('discovery-turn', {
    method: 'POST',
    body: {
      session_id: sessionId,
      initiate: { action, params },
      if_unmodified_since: ifUnmodifiedSince,
    },
  });
}
