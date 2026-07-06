// Shared discovery-report renderer (Run 2). One component serves the
// owner view (/report/:sessionId), the public share view (/share/:token),
// and the PDF export pipeline (the risk map SVG it renders is what gets
// rasterized) — so the PM and their stakeholder always see the same
// document.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RiskMap, { CATEGORY_COLORS } from '@/components/discovery/RiskMap';
import { cn } from '@/lib/utils';
import type { AssumptionCategory, ReportSnapshot, SnapshotAssumption } from '@/types/discovery';

const CATEGORY_ORDER: AssumptionCategory[] = [
  'desirability',
  'viability',
  'feasibility',
  'usability',
];

const PROSE = cn(
  'prose prose-sm max-w-none text-foreground',
  '[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display',
  '[&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base',
  '[&_p]:my-2 [&_li]:my-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_strong]:font-semibold [&_a]:text-primary [&_a]:underline'
);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

function StanceChip({ stance }: { stance: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        stance === 'supports' && 'bg-success/15 text-success',
        stance === 'challenges' && 'bg-destructive/10 text-destructive',
        stance === 'neutral' && 'bg-muted text-muted-foreground'
      )}
    >
      {stance}
    </span>
  );
}

function AssumptionRow({ a, index }: { a: SnapshotAssumption; index: number }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-primary-foreground"
        style={{ backgroundColor: CATEGORY_COLORS[a.category] }}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">{a.statement}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          confidence {a.confidence}/5 · impact {a.impact}/5 · {a.status}
          {a.is_prioritized && (
            <span className="ml-1.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              prioritized
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export default function ReportView({
  snapshot,
  riskMapSvgId,
}: {
  snapshot: ReportSnapshot;
  riskMapSvgId?: string;
}) {
  const { assumptions } = snapshot;
  const indexOf = (id: string | null) => (id ? assumptions.findIndex((a) => a.id === id) + 1 : 0);
  // Run 5: assumptions a competitive threat pressures get badged on the
  // risk map and in the legend.
  const threatenedIds = new Set(
    (snapshot.competitive_intel?.gap?.threats ?? []).flatMap((t) => t.related_assumption_ids)
  );
  const marketIntel = snapshot.market_intel ?? null;
  const competitiveIntel = snapshot.competitive_intel ?? null;
  const profiledCompetitors = (competitiveIntel?.competitors ?? []).filter(
    (c) => c.profiled_at !== null
  );
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  const evidenceByAssumption = assumptions
    .map((a, i) => ({
      assumption: a,
      index: i + 1,
      items: snapshot.evidence.filter((e) => e.assumption_id === a.id),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <article className="space-y-10">
      {/* Header */}
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          Discovery Report
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {snapshot.product.name}
        </h1>
        {snapshot.product.description && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {snapshot.product.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Generated{' '}
          {new Date(snapshot.generated_at).toLocaleDateString([], {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          {snapshot.session.stage && (
            <>
              {' '}
              · entry point:{' '}
              <span className="font-semibold">{snapshot.session.stage.replace('_', ' ')}</span>
            </>
          )}{' '}
          · {assumptions.length} assumptions · {snapshot.evidence.length} evidence citations ·{' '}
          {snapshot.blind_spots.length} blind spots
          {marketIntel && ' · market brief'}
          {profiledCompetitors.length > 0 &&
            ` · ${profiledCompetitors.length} competitors profiled`}
        </p>
      </header>

      {/* Problem framing */}
      {snapshot.problem_framing && (
        <section className="space-y-3">
          <SectionTitle>Where this started</SectionTitle>
          <blockquote className="rounded-xl border-l-4 border-accent bg-secondary/50 px-4 py-3 text-sm leading-relaxed text-foreground/90">
            {snapshot.problem_framing}
          </blockquote>
        </section>
      )}

      {/* Risk map */}
      <section className="space-y-3">
        <SectionTitle>Risk map — confidence by impact</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Assumptions in the top-left corner are the ones to test first: they break the idea if
          wrong, and the evidence for them is weakest.
        </p>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
          <RiskMap
            assumptions={assumptions.map((a) => ({ ...a }))}
            svgId={riskMapSvgId}
            threatenedIds={threatenedIds}
          />
        </div>
      </section>

      {/* Assumption map by category */}
      <section className="space-y-4">
        <SectionTitle>Assumption map</SectionTitle>
        {CATEGORY_ORDER.map((cat) => {
          const group = assumptions
            .map((a, i) => ({ a, index: i + 1 }))
            .filter(({ a }) => a.category === cat);
          if (group.length === 0) return null;
          return (
            <div key={cat} className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {cat}
              </h3>
              <div className="space-y-2">
                {group.map(({ a, index }) => (
                  <AssumptionRow key={a.id} a={a} index={index} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Evidence */}
      {evidenceByAssumption.length > 0 && (
        <section className="space-y-4">
          <SectionTitle>Market evidence</SectionTitle>
          {evidenceByAssumption.map((group) => (
            <div key={group.assumption.id} className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                {group.index}. {group.assumption.statement}
              </p>
              <ul className="space-y-2 pl-1">
                {group.items.map((e, i) => (
                  <li
                    key={`${e.source_url}-${i}`}
                    className="rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={e.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm font-medium text-primary underline underline-offset-2"
                      >
                        {e.title ?? e.source_url}
                      </a>
                      <StanceChip stance={e.stance} />
                    </div>
                    {e.snippet && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {e.snippet}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Market intelligence (Run 5) — dated, confidence-labeled, sourced */}
      {marketIntel && (
        <section className="space-y-3">
          <SectionTitle>
            Market intelligence{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({marketIntel.brief.confidence_label} evidence · retrieved{' '}
              {formatDate(marketIntel.brief.retrieved_at)})
            </span>
          </SectionTitle>
          {(marketIntel.brief.partial || marketIntel.brief.summary.search_unavailable) && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
              {marketIntel.brief.summary.search_unavailable
                ? 'Limited — web search returned nothing usable for this run; nothing was invented to fill the gap.'
                : 'Partial — the research run reached its search budget.'}
            </p>
          )}
          <p className="text-sm leading-relaxed text-foreground">
            {marketIntel.brief.summary.narrative}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              [
                ['Market size', marketIntel.brief.summary.market_size],
                ['Trends', marketIntel.brief.summary.trends],
                ['Demand signals', marketIntel.brief.summary.demand_signals],
                ['Adjacent players', marketIntel.brief.summary.adjacent_players],
              ] as const
            ).map(([label, text]) => (
              <div key={label} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90">{text}</p>
              </div>
            ))}
          </div>
          {marketIntel.evidence.length > 0 && (
            <ul className="space-y-2">
              {marketIntel.evidence.map((e, i) => (
                <li
                  key={`${e.source_url}-${i}`}
                  className="rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <p className="text-sm text-foreground/90">{e.claim}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <a
                      href={e.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline underline-offset-2"
                    >
                      {e.title ?? e.source_url}
                    </a>{' '}
                    · retrieved {formatDate(e.retrieved_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Competitive landscape (Run 5) */}
      {competitiveIntel && (
        <section className="space-y-4">
          <SectionTitle>Competitive landscape</SectionTitle>
          {profiledCompetitors.length > 0 && (
            <div className="space-y-2.5">
              {profiledCompetitors.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{c.name}</span>
                    {c.confidence_label && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {c.confidence_label} evidence
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      retrieved {formatDate(c.retrieved_at)}
                    </span>
                  </div>
                  {c.positioning && (
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                      {c.positioning}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.pricing_signal && <>Pricing: {c.pricing_signal} </>}
                    {c.recent_moves && <>· Recent: {c.recent_moves}</>}
                  </p>
                  {(() => {
                    const rows = competitiveIntel.evidence.filter((e) => e.competitor_id === c.id);
                    if (rows.length === 0) return null;
                    return (
                      <ul className="mt-2 space-y-0.5">
                        {rows.map((e, i) => (
                          <li key={`${e.source_url}-${i}`}>
                            <a
                              href={e.source_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="break-all text-xs text-primary underline underline-offset-2"
                            >
                              {e.title ?? e.source_url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
          {competitiveIntel.gap && (
            <div className="rounded-xl border border-accent/40 bg-secondary/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Where the landscape is unserved
                </p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {competitiveIntel.gap.confidence_label} evidence
                </span>
                <span className="text-[11px] text-muted-foreground">
                  analyzed {formatDate(competitiveIntel.gap.generated_at)}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                {competitiveIntel.gap.summary}
              </p>
              <ul className="mt-2 space-y-2">
                {competitiveIntel.gap.gaps.map((g, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <span className="font-medium text-foreground">{g.gap}</span>
                    <span className="text-muted-foreground"> — {g.rationale}</span>
                  </li>
                ))}
              </ul>
              {competitiveIntel.gap.threats.length > 0 && (
                <div className="mt-3 border-t border-border pt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-warning">
                    Competitive threats
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {competitiveIntel.gap.threats.map((t, i) => (
                      <li key={i} className="text-sm leading-relaxed text-foreground/90">
                        {t.threat}
                        <span className="text-xs text-muted-foreground">
                          {t.competitor ? ` — ${t.competitor}` : ''}
                          {t.related_assumption_ids.length > 0 &&
                            ` · pressures assumption${t.related_assumption_ids.length === 1 ? '' : 's'} ${t.related_assumption_ids
                              .map((id) => indexOf(id))
                              .filter((n) => n > 0)
                              .join(', ')}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Blind spots */}
      {snapshot.blind_spots.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Blind spots</SectionTitle>
          <div className="space-y-2.5">
            {snapshot.blind_spots.map((b, i) => (
              <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {i + 1}. {b.statement}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {b.evidence_backed ? (
                    <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                      evidence-backed
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      socratic — reasoning only
                    </span>
                  )}
                  {b.assumption_id && indexOf(b.assumption_id) > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      challenges assumption {indexOf(b.assumption_id)}
                    </span>
                  )}
                </div>
                {b.socratic_question && (
                  <p className="mt-2 border-l-2 border-accent/60 pl-3 text-sm italic leading-relaxed text-foreground/85">
                    {b.socratic_question}
                  </p>
                )}
                {b.source_urls.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {b.source_urls.map((u) => (
                      <li key={u}>
                        <a
                          href={u}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="break-all text-xs text-primary underline underline-offset-2"
                        >
                          {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Interview guide */}
      {snapshot.interview_guide && (
        <section className="space-y-3">
          <SectionTitle>
            Interview guide{' '}
            <span className="text-sm font-normal text-muted-foreground">
              (v{snapshot.interview_guide.version}
              {snapshot.interview_guide.question_count
                ? ` · ${snapshot.interview_guide.question_count} questions`
                : ''}
              )
            </span>
          </SectionTitle>
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <div className={PROSE}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {snapshot.interview_guide.content_md}
              </ReactMarkdown>
            </div>
          </div>
        </section>
      )}

      {/* Session summary */}
      {snapshot.session.summary && (
        <section className="space-y-3">
          <SectionTitle>Session summary</SectionTitle>
          <div className="rounded-xl border border-accent/30 bg-secondary/40 px-5 py-4">
            <div className={PROSE}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{snapshot.session.summary}</ReactMarkdown>
            </div>
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <footer className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
        <p className="text-xs leading-relaxed text-foreground/80">
          <span className="font-semibold uppercase tracking-wider text-warning">
            Read this first:
          </span>{' '}
          {snapshot.disclaimer}
        </p>
      </footer>
    </article>
  );
}
