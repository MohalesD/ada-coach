// Session-expiry recovery for edge-function calls.
//
// supabase-js auto-refreshes access tokens on a timer, but it does NOT refresh
// when a `functions.invoke` call comes back 401 — so an expired token yields a
// raw 401 and a confusing "connection hiccup" while the stale session lingers.
// This module turns that 401 into a clean re-auth: force one refresh, let the
// caller retry; if the refresh fails the session is truly dead, so sign out and
// send the user to /login.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from './supabase';

// A rejected access token surfaces as a FunctionsHttpError carrying the 401
// Response. (The gateway/anon-key failures look different and are not this.)
export function isEdgeAuthError(err: unknown): boolean {
  return err instanceof FunctionsHttpError && err.context?.status === 401;
}

// Once the session is confirmed dead we redirect exactly once, even if several
// calls 401 at the same moment (Discovery fires products + sessions together).
let redirecting = false;
// Concurrent 401s share one refresh attempt — issuing parallel refreshes would
// race the refresh-token rotation, which is the failure mode we're fixing.
let inflightRefresh: Promise<boolean> | null = null;

async function doRecover(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) return true;
    redirecting = true;
    toast.error('Your session expired. Please sign in again.');
    try {
      await supabase.auth.signOut();
    } catch {
      // Sign-out is best-effort; we redirect regardless so the stale session
      // can't keep producing 401s.
    }
    window.location.assign('/login');
    return false;
  } finally {
    inflightRefresh = null;
  }
}

// Try to recover a session after an edge 401. Returns true when a fresh session
// is in place (the caller should retry the request once); false when the session
// is dead (a redirect to /login is already underway — the caller should stop).
export async function recoverSession(): Promise<boolean> {
  if (redirecting) return false;
  if (!inflightRefresh) inflightRefresh = doRecover();
  return inflightRefresh;
}
