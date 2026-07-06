// Market Intelligence module (Run 5, addendum endpoint 9).
// One standing, refreshable, dated brief per product. Every state lives
// on this card: the cost note BEFORE a run, the long-running progress
// note, the honesty banners (partial / search unavailable), the dated
// evidence list. Refresh is attached to the brief it refreshes
// (Locality Law 1), and the snapshot date sits beside it (staleness
// lives near Refresh).

import { useState } from 'react';
import { ExternalLink, Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError, WorkingNote } from '@/components/portfolio/notes';
import {
  ConfidenceChip,
  RetrievedChip,
  SavedChip,
  formatRetrieved,
  searchFeeNote,
} from '@/components/intel/chips';
import type { MarketBrief, MarketEvidence } from '@/types/discovery';

const SUMMARY_BLOCKS: { key: keyof MarketBrief['summary'] & string; label: string }[] = [
  { key: 'market_size', label: 'Market size' },
  { key: 'trends', label: 'Trends' },
  { key: 'demand_signals', label: 'Demand signals' },
  { key: 'adjacent_players', label: 'Adjacent players' },
];

export default function MarketBriefCard({
  brief,
  evidence,
  budget,
  generating,
  error,
  onGenerate,
}: {
  brief: MarketBrief | null;
  evidence: MarketEvidence[];
  budget: number | null;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const costNote = budget !== null ? searchFeeNote(budget) : null;

  return (
    <section aria-label="Market intelligence" className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Globe size={18} className="text-accent" aria-hidden />
          <h2 className="font-display text-lg font-semibold tracking-tight">Market intelligence</h2>
        </div>
        {brief && (
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceChip label={brief.confidence_label} />
            <RetrievedChip iso={brief.retrieved_at} />
            <SavedChip iso={brief.updated_at} />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={generating}
              onClick={onGenerate}
              title={costNote ?? undefined}
            >
              <RefreshCw size={13} className={generating ? 'animate-spin' : ''} aria-hidden />
              Refresh brief
            </Button>
          </div>
        )}
      </header>

      <div className="space-y-4 px-5 py-4">
        {/* Empty state — what it is, what it costs, one clear next step */}
        {!brief && !generating && !error && (
          <div className="py-6 text-center">
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              A market brief sizes this product's opportunity with sourced evidence — size signals,
              trends, demand, adjacent players. Every claim links to where Ada found it.
            </p>
            {costNote && (
              <p className="mt-2 text-xs text-muted-foreground">
                {costNote} It can take a few minutes.
              </p>
            )}
            <Button className="mt-4 gap-1.5" onClick={onGenerate}>
              <Globe size={15} aria-hidden />
              Research this market
            </Button>
          </div>
        )}

        {generating && (
          <WorkingNote
            label={`Ada is researching the market — up to ${budget ?? '…'} web searches. This can take a few minutes; the brief lands here when it's done.`}
          />
        )}

        {error && !generating && (
          <InlineError message={error} onRetry={onGenerate} retryLabel="Try the research again" />
        )}

        {brief && !generating && (
          <>
            {/* Honesty banners — labeled states, never silently absorbed */}
            {brief.summary.search_unavailable && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                Limited — web search returned nothing usable for this run. Ada reports only what she
                could verify; nothing here is invented to fill the gap.
              </p>
            )}
            {brief.partial && !brief.summary.search_unavailable && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                Partial — this run reached its search budget
                {typeof brief.search_count === 'number' ? ` (${brief.search_count} searches)` : ''}.
                Refresh the brief to keep researching.
              </p>
            )}

            <p className="font-display text-base leading-relaxed text-foreground">
              {brief.summary.narrative}
            </p>

            <dl className="grid gap-3 sm:grid-cols-2">
              {SUMMARY_BLOCKS.map(({ key, label }) => (
                <div key={key} className="rounded-lg bg-secondary/50 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-foreground">
                    {brief.summary[key as 'market_size']}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Dated, linked sources — the trustable-in-a-deck part */}
            <div>
              <button
                type="button"
                className="text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={() => setSourcesOpen((v) => !v)}
                aria-expanded={sourcesOpen}
              >
                {sourcesOpen ? 'Hide' : 'Show'} sources ({evidence.length})
              </button>
              {evidence.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No sources survived verification — treat this brief as a starting hypothesis, not
                  evidence.
                </p>
              )}
              {sourcesOpen && evidence.length > 0 && (
                <ul className="mt-2 space-y-2">
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
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
