// Thin client for the admin-* Edge Functions.
// Auth: forwards the current Supabase Auth session JWT. Role gating
// (admin/owner) happens server-side via requireAdmin.

import { supabase } from './supabase';

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, string>;
  body?: unknown;
};

async function adminFetch<T>(functionName: string, opts: RequestOptions = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new UnauthorizedError();

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase env vars missing');
  }

  const url = new URL(`${baseUrl}/functions/v1/${functionName}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error ?? `Request failed (${response.status})`);
  }
  return json as T;
}

// ── Types ─────────────────────────────────────────────────────────

export type ConversationSummary = {
  id: string;
  title: string | null;
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  message_count: number;
  first_message: string | null;
};

export type AdminMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  token_count: number | null;
};

export type ConversationDetail = {
  id: string;
  title: string | null;
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  messages: AdminMessage[];
};

export type CoachingPrompt = {
  id: string;
  name: string;
  prompt_text: string;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  notes: string | null;
};

// ── Conversations ─────────────────────────────────────────────────

export async function listConversations(): Promise<ConversationSummary[]> {
  const { conversations } = await adminFetch<{
    conversations: ConversationSummary[];
  }>('admin-conversations');
  return conversations;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const { conversation } = await adminFetch<{
    conversation: ConversationDetail;
  }>('admin-conversations', { params: { id } });
  return conversation;
}

export async function updateConversationStatus(
  id: string,
  status: 'active' | 'archived' | 'deleted'
): Promise<void> {
  await adminFetch('admin-conversations', {
    method: 'PATCH',
    params: { id },
    body: { status },
  });
}

// ── Prompts ───────────────────────────────────────────────────────

export async function listPrompts(): Promise<CoachingPrompt[]> {
  const { prompts } = await adminFetch<{ prompts: CoachingPrompt[] }>('admin-prompts');
  return prompts;
}

export async function createPrompt(input: {
  name: string;
  prompt_text: string;
  notes?: string;
}): Promise<CoachingPrompt> {
  const { prompt } = await adminFetch<{ prompt: CoachingPrompt }>('admin-prompts', {
    method: 'POST',
    body: input,
  });
  return prompt;
}

export async function updatePrompt(
  id: string,
  input: { name?: string; prompt_text?: string; notes?: string | null }
): Promise<CoachingPrompt> {
  const { prompt } = await adminFetch<{ prompt: CoachingPrompt }>('admin-prompts', {
    method: 'PUT',
    params: { id },
    body: input,
  });
  return prompt;
}

export async function activatePrompt(id: string): Promise<void> {
  await adminFetch('admin-prompts', {
    method: 'POST',
    params: { id, action: 'activate' },
  });
}

export async function deletePrompt(id: string): Promise<void> {
  await adminFetch('admin-prompts', {
    method: 'DELETE',
    params: { id },
  });
}

// ── Insights ──────────────────────────────────────────────────────

export type ConversationStat = {
  conversation_id: string;
  title: string | null;
  message_count: number;
  positive: number;
  negative: number;
};

export type PromptStat = {
  prompt_id: string | null;
  name: string;
  version: number | null;
  responses: number;
  positive: number;
  negative: number;
  positive_rate: number;
};

export type RecentFeedbackEvent = {
  message_id: string;
  conversation_id: string;
  conversation_title: string | null;
  excerpt: string;
  feedback: 'positive' | 'negative';
  created_at: string;
};

export type InsightsResponse = {
  totals: {
    conversations: number;
    messages: number;
    assistant_messages: number;
    feedback_count: number;
    positive: number;
    negative: number;
  };
  rates: {
    feedback_rate: number;
    positive_rate: number;
  };
  per_conversation: ConversationStat[];
  per_prompt: PromptStat[];
  top_positive: ConversationStat[];
  top_negative: ConversationStat[];
  recent_feedback: RecentFeedbackEvent[];
  generated_at: string;
};

export async function getInsights(): Promise<InsightsResponse> {
  return await adminFetch<InsightsResponse>('admin-insights');
}

// ── Spend (admin+) ────────────────────────────────────────────────

export type SpendDayRow = {
  call_type: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  web_search_requests: number;
  cost_usd: number;
};

export type SpendResponse = {
  window_days: number;
  since: string;
  truncated: boolean;
  totals: {
    calls: number;
    cost_usd: number;
    by_model: { model: string; calls: number; cost_usd: number }[];
    web_search: { requests: number; cost_usd: number; blended_rows: number };
  };
  days: { date: string; rows: SpendDayRow[] }[];
};

export async function getSpend(days = 30): Promise<SpendResponse> {
  return await adminFetch<SpendResponse>('admin-spend', {
    params: { days: String(days) },
  });
}

// ── Users (owner-only) ────────────────────────────────────────────

export type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin' | 'owner';
  credits_remaining: number;
  last_credit_reset: string; // YYYY-MM-DD
};

export async function listUsers(): Promise<AdminUser[]> {
  const { users } = await adminFetch<{ users: AdminUser[] }>('admin-users');
  return users;
}

export async function resetUserCredits(id: string): Promise<AdminUser> {
  const { user } = await adminFetch<{ user: AdminUser }>('admin-users', {
    method: 'POST',
    params: { id, action: 'reset' },
  });
  return user;
}

export async function resetAllCredits(): Promise<number> {
  const { reset_count } = await adminFetch<{ reset_count: number }>('admin-users', {
    method: 'POST',
    params: { action: 'reset_all' },
  });
  return reset_count;
}

// ── App settings (owner-only via RLS, queried directly) ──────────

export async function getDailyMessageLimit(): Promise<number | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'daily_message_limit')
    .maybeSingle();
  if (error || !data) return null;
  const parsed = parseInt(data.value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function setDailyMessageLimit(value: number): Promise<void> {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Daily message limit must be a non-negative integer');
  }
  const { error } = await supabase
    .from('app_settings')
    .update({ value: String(value), updated_at: new Date().toISOString() })
    .eq('key', 'daily_message_limit');
  if (error) throw new Error(error.message);
}

// ── Retrieval debug (owner-only) ──────────────────────────────────

export type RecentMessage = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
};

export type RetrievalDebugChunk = {
  content: string;
  similarity: number;
};

export type RetrievalDebugResponse = {
  message: string;
  embedding_model: string;
  threshold: number;
  match_count: number;
  chunks: RetrievalDebugChunk[];
};

export async function getRecentMessages(): Promise<RecentMessage[]> {
  const { messages } = await adminFetch<{ messages: RecentMessage[] }>('admin-retrieval-debug');
  return messages;
}

export async function runRetrievalDebug(
  message: string,
  threshold?: number,
  matchCount?: number
): Promise<RetrievalDebugResponse> {
  return await adminFetch<RetrievalDebugResponse>('admin-retrieval-debug', {
    method: 'POST',
    body: { message, threshold, match_count: matchCount },
  });
}

// ── Unified feedback log (admin-feedback) ─────────────────────────

export type FeedbackEntry = {
  id: string;
  user_id: string;
  feedback_type: 'bug' | 'feedback' | 'praise' | 'message_rating';
  rating: 'up' | 'down' | null;
  message_id: string | null;
  source_surface: string;
  comment: string | null;
  contact_email: string | null;
  created_at: string;
  user_email: string | null;
  user_display_name: string | null;
};

export async function getFeedbackLog(): Promise<FeedbackEntry[]> {
  const res = await adminFetch<{ feedback: FeedbackEntry[] }>('admin-feedback');
  return res.feedback;
}
