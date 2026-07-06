// Positioning-gap analysis (Run 5, addendum endpoint 13). Ada reasons
// over the already-verified profiles — no new searches — and maps where
// the landscape is unserved, plus the competitive threats that pressure
// the PM's own assumptions (the seam that feeds the risk map and
// report). Dated, confidence-labeled, re-runnable in place.

import { Crosshair, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError, WorkingNote } from '@/components/portfolio/notes';
import { ConfidenceChip, RetrievedChip } from '@/components/intel/chips';
import type { CompetitiveGap } from '@/types/discovery';

export default function GapAnalysisCard({
  gap,
  profiledCount,
  analyzing,
  error,
  onAnalyze,
}: {
  gap: CompetitiveGap | null;
  profiledCount: number;
  analyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
}) {
  const ready = profiledCount > 0;

  return (
    <div className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Crosshair size={16} className="text-accent" aria-hidden />
          <h3 className="font-display text-base font-semibold tracking-tight">
            Where the landscape is unserved
          </h3>
        </div>
        {gap && (
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceChip label={gap.confidence_label} />
            <RetrievedChip iso={gap.generated_at} prefix="Analyzed" />
            <Button size="sm" variant="outline" disabled={analyzing || !ready} onClick={onAnalyze}>
              Re-run analysis
            </Button>
          </div>
        )}
      </header>

      <div className="space-y-4 px-5 py-4">
        {!gap && !analyzing && !error && (
          <div className="py-4 text-center">
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              {ready
                ? 'Ada maps the openings — where the researched competitors leave the market unserved, and which of your assumptions their moves pressure.'
                : 'Research at least one competitor above, then Ada can map the gaps.'}
            </p>
            {ready && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  No web searches — Ada reasons over the sourced profiles above.
                </p>
                <Button className="mt-4 gap-1.5" onClick={onAnalyze}>
                  <Crosshair size={15} aria-hidden />
                  Map the gaps
                </Button>
              </>
            )}
          </div>
        )}

        {analyzing && (
          <WorkingNote label="Ada is mapping the gaps across the researched landscape…" />
        )}

        {error && !analyzing && (
          <InlineError message={error} onRetry={onAnalyze} retryLabel="Try the analysis again" />
        )}

        {gap && !analyzing && (
          <>
            <p className="font-display text-base leading-relaxed text-foreground">{gap.summary}</p>

            <div className="space-y-2.5">
              {gap.gaps.map((g, i) => (
                <div key={i} className="rounded-lg bg-secondary/50 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">{g.gap}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {g.rationale}
                  </p>
                  {g.opportunity && (
                    <p className="mt-1.5 text-sm font-medium text-primary">→ {g.opportunity}</p>
                  )}
                </div>
              ))}
            </div>

            {gap.threats.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                  Threats to your assumptions
                </p>
                <ul className="mt-2 space-y-2">
                  {gap.threats.map((t, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5"
                    >
                      <TriangleAlert
                        size={15}
                        className="mt-0.5 shrink-0 text-warning"
                        aria-hidden
                      />
                      <div>
                        <p className="text-sm leading-relaxed text-foreground">{t.threat}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.competitor ? `From ${t.competitor}` : 'Landscape-level'}
                          {t.related_assumption_ids.length > 0 &&
                            ` · pressures ${t.related_assumption_ids.length} of your assumption${t.related_assumption_ids.length === 1 ? '' : 's'} — see the risk map in your report`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
