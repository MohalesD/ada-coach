import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { supabase } from './supabase';
import { DELETE_CONFIRM_PHRASE, deleteAccount, isDeleteConfirmed } from './account';

const getSession = supabase.auth.getSession as unknown as ReturnType<typeof vi.fn>;

describe('isDeleteConfirmed', () => {
  it('accepts only the exact phrase', () => {
    expect(isDeleteConfirmed(DELETE_CONFIRM_PHRASE)).toBe(true);
  });

  it.each(['delete', 'Delete', ' DELETE', 'DELETE ', '', 'DELET'])(
    'rejects near-miss %j',
    (input) => {
      expect(isDeleteConfirmed(input)).toBe(false);
    },
  );
});

describe('deleteAccount', () => {
  it('refuses to call the function without a session', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await deleteAccount();
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('maps the owner guard to owner_cannot_delete', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'jwt' } } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'owner_cannot_delete' }), { status: 403 }),
    );
    expect(await deleteAccount()).toEqual({ ok: false, error: 'owner_cannot_delete' });
    vi.restoreAllMocks();
  });

  it('returns ok with the email flag on success', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'jwt' } } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, email_sent: false }), { status: 200 }),
    );
    expect(await deleteAccount()).toEqual({ ok: true, emailSent: false });
    vi.restoreAllMocks();
  });

  it('treats a 500 as failed, not as success', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'jwt' } } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    );
    expect(await deleteAccount()).toEqual({ ok: false, error: 'failed' });
    vi.restoreAllMocks();
  });
});
