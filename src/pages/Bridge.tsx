// /bridge — the landing step of a Builder Journal handoff (Spec 4, D7).
// Public route on purpose: ProtectedRoute drops the query string on its
// redirect, and this page's whole job is to exchange the one-time magic-link
// token hash in that query string for a session, then open the sprint.
//
// Nothing here trusts the URL beyond handing `th` to Supabase Auth: the hash
// is single-use and expires with the project's OTP window, and `sprint` is
// only ever used as a navigation target that the sprint page itself
// re-authorizes through RLS.
//
// Second arrival shape (Spec 4 addendum, 2026-11-15): `?signin=self&sprint=…`
// with no `th`. Ada never mints a sign-in for an admin or owner account from
// the bridge, so those handoffs carry no credential. This page then uses the
// session the browser already has, or sends the person to /login and brings
// them back to the sprint afterwards. It grants nothing: the URL is a sprint
// id, and the sprint page's RLS is the only thing that decides who sees it.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DemoBadge from '@/components/DemoBadge';
import { bridgeReturnTo } from '@/lib/return-to';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const STEPS = ['Idea received', 'Signed in', 'Opening your sprint'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State =
  | { kind: 'working'; step: number }
  | { kind: 'failed' }
  | { kind: 'signin'; returnTo: string };

export default function Bridge() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ kind: 'working', step: 0 });

  useEffect(() => {
    let cancelled = false;
    const tokenHash = params.get('th');
    const sprint = params.get('sprint');
    const modeParam = params.get('mode');
    const mode = modeParam === 'permanent' || modeParam === 'session' ? modeParam : 'session';

    if (!sprint || !UUID_RE.test(sprint)) {
      setState({ kind: 'failed' });
      return;
    }

    // No credential in the URL: use the session already here, or ask for one.
    if (!tokenHash && params.get('signin') === 'self') {
      const returnTo = bridgeReturnTo(sprint, mode, true);
      (async () => {
        setState({ kind: 'working', step: 1 });
        // A session lookup that throws is treated as "no session": the person
        // can always sign in, and a spinner that never resolves helps nobody.
        const session = await supabase.auth
          .getSession()
          .then((r) => r.data.session)
          .catch(() => null);
        if (cancelled) return;
        if (!session) {
          setState({ kind: 'signin', returnTo });
          return;
        }
        setState({ kind: 'working', step: 2 });
        navigate(returnTo, { replace: true });
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!tokenHash) {
      setState({ kind: 'failed' });
      return;
    }

    (async () => {
      setState({ kind: 'working', step: 1 });
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      if (cancelled) return;
      if (error) {
        setState({ kind: 'failed' });
        return;
      }
      setState({ kind: 'working', step: 2 });
      // replace: the token hash must not survive in history.
      navigate(`/sprint/${sprint}?arrived=bridge&mode=${mode}`, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
    // Runs once for the URL this tab opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">Ada</span>
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Customer Discovery Coach
            </p>
            <DemoBadge />
          </div>
        </div>

        {state.kind === 'working' ? (
          <Card>
            <CardContent className="py-8">
              <ol className="space-y-3" aria-live="polite">
                {STEPS.map((label, i) => {
                  const done = i < state.step;
                  const active = i === state.step;
                  return (
                    <li
                      key={label}
                      className={cn(
                        'flex items-center gap-3 text-sm transition-colors',
                        done || active ? 'text-foreground' : 'text-muted-foreground/60'
                      )}
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border"
                        aria-hidden
                      >
                        {done ? (
                          <Check className="h-3 w-3 text-accent" />
                        ) : active ? (
                          <Loader2 className="h-3 w-3 animate-spin text-accent" />
                        ) : null}
                      </span>
                      {label}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Arriving from AI Builder Journal
              </p>
            </CardContent>
          </Card>
        ) : state.kind === 'signin' ? (
          <Card>
            <CardHeader>
              <CardTitle>Your sprint is ready</CardTitle>
              <CardDescription>
                Your idea arrived and Ada has read it. This is an admin account, so Ada does
                not sign it in from another app. Sign in yourself and you will land straight
                in the sprint.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to="/login"
                state={{ returnTo: state.returnTo }}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Sign in to open it
              </Link>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Arriving from AI Builder Journal
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>This link expired</CardTitle>
              <CardDescription>
                Go back to Builder Journal and send the idea again. Each link works once and
                only for a short while.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              Already have an Ada account?{' '}
              <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
