// Public share view (Run 2 Must-Have): a logged-out stakeholder opens
// /share/:token and reads the same report the PM sees — served by the
// report-public function from the snapshot, keyed only by the
// unguessable token. Read-only: no actions, no auth, no way in.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReportView from '@/components/discovery/ReportView';
import { fetchPublicReport } from '@/lib/discovery-api';
import type { ReportSnapshot } from '@/types/discovery';

export default function ShareReport() {
  const { token = '' } = useParams();
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    'loading',
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchPublicReport(token);
        if (cancelled) return;
        if (!result) {
          setState('missing');
          return;
        }
        setSnapshot(result.snapshot);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <p className="font-display text-lg font-semibold tracking-tight">
            <span className="gradient-text">Ada</span>{' '}
            <span className="text-sm font-medium text-muted-foreground">
              · Shared discovery report
            </span>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {state === 'loading' && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Opening the report…
          </p>
        )}

        {state === 'missing' && (
          <div className="mx-auto max-w-md py-16 text-center">
            <h1 className="font-display text-xl font-semibold">
              This link doesn't lead anywhere
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The report may have been removed, or the link was copied
              incompletely. Ask the person who shared it for a fresh one.
            </p>
          </div>
        )}

        {state === 'error' && (
          <p className="py-16 text-center text-sm text-destructive">
            Couldn't load the report right now — try refreshing in a moment.
          </p>
        )}

        {state === 'ready' && snapshot && <ReportView snapshot={snapshot} />}
      </main>

      {state === 'ready' && (
        <footer className="border-t border-border">
          <p className="mx-auto max-w-3xl px-4 py-5 text-center text-xs text-muted-foreground sm:px-6">
            Pressure-tested with Ada, an AI customer discovery coach. The
            human behind this report made the calls; Ada asked the hard
            questions.
          </p>
        </footer>
      )}
    </div>
  );
}
