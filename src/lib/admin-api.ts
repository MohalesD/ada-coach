// Thin client for the admin-* Edge Functions. Stores the admin key
// (password) in sessionStorage so it clears when the tab closes.

const ADMIN_KEY_STORAGE = 'ada-admin-key';

export function getAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearAdminKey(): void {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

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
  adminKeyOverride?: string;
};

async function adminFetch<T>(
  functionName: string,
  opts: RequestOptions = {},
): Promise<T> {
  const key = opts.adminKeyOverride ?? getAdminKey();
  if (!key) throw new UnauthorizedError();

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
      authorization: `Bearer ${anonKey}`,
      'x-admin-key': key,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (response.status === 401) {
    clearAdminKey();
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

// ── Auth probe ────────────────────────────────────────────────────

export async function verifyAdminKey(key: string): Promise<boolean> {
  try {
    await adminFetch('admin-conversations', { adminKeyOverride: key });
    return true;
  } catch (err) {
    if (err instanceof UnauthorizedError) return false;
    throw err;
  }
}

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
