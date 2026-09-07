// /bridge — the landing step of a Builder Journal handoff (Spec 4, D7).
// Public route on purpose: ProtectedRoute drops the query string on its
// redirect, and this page's whole job is to exchange the one-time magic-link
// token hash in that query string for a session, then open the sprint.
//
// Nothing here trusts the URL beyond handing `th` to Supabase Auth: the hash
// is single-use and expires with the project's OTP window, and `sprint` is
// only ever used as a navigation target that the sprint page itself
// re-authorizes through RLS.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DemoBadge from '@/components/DemoBadge';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const STEPS = ['Idea received', 'Signed in', 'Opening your sprint'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = { kind: 'working'; step: number } | { kind: 'failed' };

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

    if (!tokenHash || !sprint || !UUID_RE.test(sprint)) {
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
