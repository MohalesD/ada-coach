// Market & competitors (Run 5) — the product's intelligence surface.
// Two modules on one product-scoped page: the standing market brief
// (addendum endpoint 9) and the competitive landscape (endpoints 10–13:
// identify → the confirm gate → per-competitor research → gap analysis).
// Search costs are surfaced before every run; every stored claim renders
// with its date and confidence label; failures retry on the object that
// failed.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Search, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError, WorkingNote } from '@/components/portfolio/notes';
import MarketBriefCard from '@/components/intel/MarketBriefCard';
import CompetitorGate from '@/components/intel/CompetitorGate';
import CompetitorProfileCard from '@/components/intel/CompetitorProfileCard';
import ComparisonMatrix from '@/components/intel/ComparisonMatrix';
import GapAnalysisCard from '@/components/intel/GapAnalysisCard';
import { briefRunSearches, identifyRunSearches, searchFeeNote } from '@/components/intel/chips';
import {
  confirmCompetitors,
  DiscoveryApiError,
  generateMarketBrief,
  getIntelSearchBudget,
  getMarketBrief,
  getProduct,
  identifyCompetitors,
  listCompetitorEvidence,
  listCompetitors,
  listMarketEvidence,
  pollIntelStatus,
  profileCompetitor,
  runGapAnalysis,
} from '@/lib/discovery-api';
import type {
  Competitor,
  CompetitorEvidence,
  MarketBrief,
  MarketEvidence,
  Product,
} from '@/types/discovery';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof DiscoveryApiError) {
    if (err.code === 'malformed_model_output') {
      return "Ada's research came back garbled — nothing was saved. It usually works on a second try.";
    }
    if (err.code === 'too_many_competitors' && err.detail) return err.detail;
    if (err.detail) return err.detail;
  }
  return fallback;
}

export default function ProductIntel() {
  const { productId = '' } = useParams();

  const [product, setProduct] = useState<Product | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [brief, setBrief] = useState<MarketBrief | null>(null);
  const [marketEvidence, setMarketEvidence] = useState<MarketEvidence[]>([]);
  const [generating, setGenerating] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorEvidence, setCompetitorEvidence] = useState<CompetitorEvidence[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [unmappedNote, setUnmappedNote] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [profilingIds, setProfilingIds] = useState<Set<string>>(new Set());
  const [profileErrors, setProfileErrors] = useState<Map<string, string>>(new Map());
  const [analyzing, setAnalyzing] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [p, b, comps, budgetValue] = await Promise.all([
        getProduct(productId),
        getMarketBrief(productId),
        listCompetitors(productId),
        getIntelSearchBudget().catch(() => null),
      ]);
      setProduct(p);
      setBrief(b);
      setCompetitors(comps);
      setBudget(budgetValue);
      const [ev, cev] = await Promise.all([
        b ? listMarketEvidence(b.id) : Promise.resolve([]),
        listCompetitorEvidence(comps.map((c) => c.id)),
      ]);
      setMarketEvidence(ev);
      setCompetitorEvidence(cev);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmed = useMemo(() => competitors.filter((c) => c.confirmed), [competitors]);
  const unconfirmed = useMemo(() => competitors.filter((c) => !c.confirmed), [competitors]);
  const profiledCount = useMemo(
    () => confirmed.filter((c) => c.profiled_at !== null).length,
    [confirmed]
  );
  const unprofiled = useMemo(() => confirmed.filter((c) => c.profiled_at === null), [confirmed]);
  const showGate = gateOpen || (unconfirmed.length > 0 && confirmed.length === 0);

  const handleGenerateBrief = async () => {
    setGenerating(true);
    setMarketError(null);
    try {
      // 202 + background worker: kick the run, then poll the status cell.
      const run = await generateMarketBrief(productId);
      if (typeof run.budget === 'number') setBudget(run.budget);
      const status = await pollIntelStatus(productId, run.started_at);
      if (status.state === 'error') {
        setMarketError(
          status.message ?? "The market research didn't finish. Nothing was saved — try again."
        );
        return;
      }
      const b = await getMarketBrief(productId);
      setBrief(b);
      setMarketEvidence(b ? await listMarketEvidence(b.id) : []);
    } catch (err) {
      setMarketError(
        errorMessage(err, "The market research didn't finish. Nothing was saved — try again.")
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleIdentify = async () => {
    setIdentifying(true);
    setIdentifyError(null);
    setUnmappedNote(null);
    try {
      const run = await identifyCompetitors(productId);
      if (typeof run.budget === 'number') setBudget(run.budget);
      const status = await pollIntelStatus(productId, run.started_at);
      if (status.state === 'error') {
        setIdentifyError(status.message ?? "The competitor search didn't finish. Try again.");
        return;
      }
      const comps = await listCompetitors(productId);
      setCompetitors(comps);
      setCompetitorEvidence(await listCompetitorEvidence(comps.map((c) => c.id)));
      if (status.unmapped) {
        setUnmappedNote(
          status.note ??
            'This space looks unmapped from here — the searches turned up no clear competitors. Add the ones you know about; Ada will never invent one.'
        );
      }
      setGateOpen(true);
    } catch (err) {
      setIdentifyError(errorMessage(err, "The competitor search didn't finish. Try again."));
    } finally {
      setIdentifying(false);
    }
  };

  const handleConfirm = async (changes: { confirm: string[]; add: string[]; remove: string[] }) => {
    setConfirming(true);
    setIdentifyError(null);
    try {
      const res = await confirmCompetitors(productId, changes);
      setCompetitors(res.competitors);
      setGateOpen(false);
    } catch (err) {
      setIdentifyError(
        errorMessage(err, "Couldn't save the list. Your selections are still here — try again.")
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleProfile = async (competitorId: string) => {
    setProfilingIds((prev) => new Set(prev).add(competitorId));
    setProfileErrors((prev) => {
      const next = new Map(prev);
      next.delete(competitorId);
      return next;
    });
    try {
      const run = await profileCompetitor(competitorId);
      const status = await pollIntelStatus(productId, run.started_at);
      if (status.state === 'error') {
        setProfileErrors((prev) =>
          new Map(prev).set(
            competitorId,
            status.message ??
              "This competitor's research didn't finish. Nothing was saved — retry when ready."
          )
        );
        return;
      }
      const comps = await listCompetitors(productId);
      setCompetitors(comps);
      setCompetitorEvidence((prev) => [...prev.filter((e) => e.competitor_id !== competitorId)]);
      const fresh = await listCompetitorEvidence([competitorId]);
      setCompetitorEvidence((prev) => [...prev, ...fresh]);
    } catch (err) {
      setProfileErrors((prev) =>
        new Map(prev).set(
          competitorId,
          errorMessage(
            err,
            "This competitor's research didn't finish. Nothing was saved — retry when ready."
          )
        )
      );
    } finally {
      setProfilingIds((prev) => {
        const next = new Set(prev);
        next.delete(competitorId);
        return next;
      });
    }
  };

  // Sequential on purpose: intel runs are serialized per product (one
  // background worker at a time), and the PM watches each card land.
  const handleProfileAll = async () => {
    const targets = [...unprofiled];
    for (const c of targets) {
      await handleProfile(c.id);
    }
  };

  const handleGap = async () => {
    setAnalyzing(true);
    setGapError(null);
    try {
      const res = await runGapAnalysis(productId);
      setProduct((prev) =>
        prev ? { ...prev, competitive_gap: res.gap, gap_generated_at: res.gap.generated_at } : prev
      );
    } catch (err) {
      setGapError(errorMessage(err, "The gap analysis didn't finish. Try again."));
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Link
            to="/discovery"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ArrowLeft size={15} aria-hidden />
            Discovery
          </Link>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {product?.name ?? 'Product'}{' '}
            <span className="text-sm font-medium text-muted-foreground">
              · Market & competitors
            </span>
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {loading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading the landscape…</p>
        )}

        {!loading && loadError && (
          <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-center">
            <p className="text-sm text-destructive">
              Couldn't load this page. Your work is safe — this is just a connection hiccup.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {!loading && !loadError && !product && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            This product doesn't exist or isn't yours.
          </p>
        )}

        {!loading && !loadError && product && (
          <>
            <MarketBriefCard
              brief={brief}
              evidence={marketEvidence}
              budget={budget !== null ? briefRunSearches(budget) : null}
              generating={generating}
              error={marketError}
              onGenerate={() => void handleGenerateBrief()}
            />

            <section
              aria-label="Competitive landscape"
              className="rounded-xl border border-border bg-card"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Swords size={18} className="text-accent" aria-hidden />
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Competitive landscape
                  </h2>
                </div>
                {confirmed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {unprofiled.length > 1 && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => void handleProfileAll()}
                        disabled={profilingIds.size > 0}
                      >
                        <Search size={13} aria-hidden />
                        Research all {unprofiled.length}
                      </Button>
                    )}
                    {!showGate && (
                      <Button size="sm" variant="outline" onClick={() => setGateOpen(true)}>
                        Adjust the list
                      </Button>
                    )}
                  </div>
                )}
              </header>

              <div className="space-y-4 px-5 py-4">
                {/* Empty state */}
                {competitors.length === 0 && !identifying && !identifyError && (
                  <div className="py-6 text-center">
                    <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                      Find out who's already solving this problem. Ada searches for named
                      competitors, you confirm which ones are worth deep research, and every claim
                      stays source-linked.
                    </p>
                    {budget !== null && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Identification {searchFeeNote(identifyRunSearches(budget)).toLowerCase()}
                      </p>
                    )}
                    <Button className="mt-4 gap-1.5" onClick={() => void handleIdentify()}>
                      <Search size={15} aria-hidden />
                      Find competitors
                    </Button>
                  </div>
                )}

                {identifying && (
                  <WorkingNote label="Ada is searching for competitors — this takes a minute or two." />
                )}

                {identifyError && !identifying && !confirming && (
                  <InlineError
                    message={identifyError}
                    onRetry={competitors.length === 0 ? () => void handleIdentify() : undefined}
                    retryLabel="Search again"
                  />
                )}

                {/* The confirm gate — curation before cost */}
                {!identifying && showGate && competitors.length > 0 && (
                  <CompetitorGate
                    key={competitors.map((c) => `${c.id}:${c.confirmed}`).join('|')}
                    competitors={competitors}
                    budget={budget}
                    unmappedNote={unmappedNote}
                    confirming={confirming}
                    onConfirm={(changes) => void handleConfirm(changes)}
                    onReidentify={() => void handleIdentify()}
                    reidentifying={identifying}
                  />
                )}

                {/* Confirmed competitor profiles */}
                {confirmed.length > 0 && (
                  <div className="space-y-3">
                    {confirmed.map((c) => (
                      <CompetitorProfileCard
                        key={c.id}
                        competitor={c}
                        evidence={competitorEvidence.filter((e) => e.competitor_id === c.id)}
                        profiling={profilingIds.has(c.id)}
                        error={profileErrors.get(c.id) ?? null}
                        onProfile={() => void handleProfile(c.id)}
                      />
                    ))}
                  </div>
                )}

                <ComparisonMatrix competitors={confirmed} />

                {(confirmed.length > 0 || product.competitive_gap) && (
                  <GapAnalysisCard
                    gap={product.competitive_gap}
                    profiledCount={profiledCount}
                    analyzing={analyzing}
                    error={gapError}
                    onAnalyze={() => void handleGap()}
                  />
                )}
              </div>
            </section>

            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              Market and competitor research is AI-gathered from live web sources and dated at the
              moment it was found — a snapshot to verify, not settled fact. Read the sources before
              you rely on them in a deck.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
