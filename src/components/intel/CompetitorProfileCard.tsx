// One confirmed competitor's profile (Run 5, addendum endpoint 12).
// Research runs one competitor per call, so every state — not yet
// researched, researching, failed-with-retry, profiled — lives on the
// card it concerns (Locality Law 6). Every profile is dated and
// confidence-labeled; sources expand in place.

import { useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError, WorkingNote } from '@/components/portfolio/notes';
import {
  ConfidenceChip,
  RetrievedChip,
  SavedChip,
  formatRetrieved,
} from '@/components/intel/chips';
import type { Competitor, CompetitorEvidence } from '@/types/discovery';

export default function CompetitorProfileCard({
  competitor,
  evidence,
  profiling,
  error,
  onProfile,
}: {
  competitor: Competitor;
  evidence: CompetitorEvidence[];
  profiling: boolean;
  error: string | null;
  onProfile: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const features = competitor.feature_notes?.features ?? [];
  const profiled = competitor.profiled_at !== null;

  return (
    <article className="rounded-xl border border-border bg-card px-5 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-base font-semibold tracking-tight text-foreground">
            {competitor.name}
          </h4>
          {competitor.added_by === 'user' && (
            <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              added by you
            </span>
          )}
        </div>
        {profiled && competitor.confidence_label && (
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceChip label={competitor.confidence_label} />
            <RetrievedChip iso={competitor.retrieved_at} />
            {competitor.profiled_at && <SavedChip iso={competitor.profiled_at} />}
          </div>
        )}
      </header>

      {!profiled && !profiling && !error && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
          <p className="text-sm text-muted-foreground">Not researched yet.</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onProfile}>
            <Search size={13} aria-hidden />
            Research {competitor.name}
          </Button>
        </div>
      )}

      {profiling && (
        <div className="mt-3">
          <WorkingNote
            label={`Ada is researching ${competitor.name} — positioning, pricing, features, recent moves…`}
          />
        </div>
      )}

      {error && !profiling && (
        <div className="mt-3">
          <InlineError message={error} onRetry={onProfile} retryLabel="Retry this competitor" />
        </div>
      )}

      {profiled && !profiling && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Positioning
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {competitor.positioning ?? 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Pricing
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {competitor.pricing_signal ?? 'Unknown'}
              </p>
            </div>
          </div>

          {features.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                Feature surface
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {features.map((f) => (
                  <li
                    key={f}
                    className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-xs text-foreground"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
              Recent moves
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {competitor.recent_moves ?? 'Unknown'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2.5">
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => setSourcesOpen((v) => !v)}
              aria-expanded={sourcesOpen}
            >
              {sourcesOpen ? 'Hide' : 'Show'} sources ({evidence.length})
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-muted-foreground"
              onClick={onProfile}
            >
              <Search size={12} aria-hidden />
              Research again
            </Button>
          </div>

          {sourcesOpen &&
            (evidence.length > 0 ? (
              <ul className="space-y-2">
                {evidence.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border px-3 py-2.5">
                    <p className="text-sm text-foreground">{e.claim}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <a
                        href={e.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        <ExternalLink size={11} aria-hidden />
                        {e.title ?? new URL(e.source_url).hostname}
                      </a>
                      <span>Retrieved {formatRetrieved(e.retrieved_at)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No sources survived verification for this profile — treat it as thin.
              </p>
            ))}
        </div>
      )}
    </article>
  );
}
