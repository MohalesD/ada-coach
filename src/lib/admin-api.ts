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

async function adminFetch<T>(
  functionName: string,
  opts: RequestOptions = {},
): Promise<T> {
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

export async function getConversation(
  id: string,
): Promise<ConversationDetail> {
  const { conversation } = await adminFetch<{
    conversation: ConversationDetail;
  }>('admin-conversations', { params: { id } });
  return conversation;
}

export async function updateConversationStatus(
  id: string,
  status: 'active' | 'archived' | 'deleted',
): Promise<void> {
  await adminFetch('admin-conversations', {
    method: 'PATCH',
    params: { id },
    body: { status },
  });
}

// ── Prompts ───────────────────────────────────────────────────────

export async function listPrompts(): Promise<CoachingPrompt[]> {
  const { prompts } = await adminFetch<{ prompts: CoachingPrompt[] }>(
    'admin-prompts',
  );
  return prompts;
}

export async function createPrompt(input: {
  name: string;
  prompt_text: string;
  notes?: string;
}): Promise<CoachingPrompt> {
  const { prompt } = await adminFetch<{ prompt: CoachingPrompt }>(
    'admin-prompts',
    { method: 'POST', body: input },
  );
  return prompt;
}

export async function updatePrompt(
  id: string,
  input: { name?: string; prompt_text?: string; notes?: string | null },
): Promise<CoachingPrompt> {
  const { prompt } = await adminFetch<{ prompt: CoachingPrompt }>(
    'admin-prompts',
    { method: 'PUT', params: { id }, body: input },
  );
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
