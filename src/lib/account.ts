// Self-serve account deletion client. One job: call the delete-account
// Edge Function as the signed-in user and report the outcome.
//
// The confirmation phrase check lives here (not in the component) so it is
// unit-testable and so the button can never fire on a near-miss like
// "delete " or "Delete".

import { supabase } from './supabase';

export const DELETE_CONFIRM_PHRASE = 'DELETE';

export function isDeleteConfirmed(input: string): boolean {
  return input === DELETE_CONFIRM_PHRASE;
}

export type DeleteAccountResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; error: 'owner_cannot_delete' | 'unauthorized' | 'failed' };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, error: 'unauthorized' };

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });
  } catch {
    return { ok: false, error: 'failed' };
  }

  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    email_sent?: boolean;
    error?: string;
  };

  if (response.status === 401) return { ok: false, error: 'unauthorized' };
  if (response.status === 403 && json.error === 'owner_cannot_delete') {
    return { ok: false, error: 'owner_cannot_delete' };
  }
  if (!response.ok || !json.ok) return { ok: false, error: 'failed' };

  return { ok: true, emailSent: json.email_sent === true };
}
