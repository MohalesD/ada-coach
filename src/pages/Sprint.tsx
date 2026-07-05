// Discovery Sprint surface (Run 2). Chat-first by design: the
// conversation thread is the spine, the current step lives in ONE inline
// action card at the bottom of the thread (tap-target buttons for
// branching — answer / skip / dig deeper), and a freeform input to Ada
// stays available underneath. No multi-panel dashboard.
//
// Every step action shows local loading, success, and error-with-retry
// on the object it affects; nothing updates silently. current_step is
// bookmarked server-side so closing the tab resumes exactly here.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import AssumptionCard from '@/components/discovery/AssumptionCard';
import SprintProgress, {
  SPRINT_STEPS,
  stepIndex,
} from '@/components/discovery/SprintProgress';
import {
  DiscoveryApiError,
  abandonSession,
  compileReport,
  completeSession,
  generateGuide,
  getLatestGuide,
  getProduct,
  getSession,
  groundAssumption,
  ingestPastedText,
  listAssumptions,
  listBlindSpots,
  listEvidence,
  listSessionDocuments,
  loadThread,
  mapAssumptions,
  runBlindSpots,
  saveSessionStep,
  sendChat,
  updateAssumption,
  type ThreadMessage,
} from '@/lib/discovery-api';
import { pickRiskiest, rankByRisk } from '@/lib/risk';
import type {
  Assumption,
  BlindSpot,
  Evidence,
  InterviewGuide,
  Product,
  Session,
  SessionDocument,
} from '@/types/discovery';

const PASTE_MAX = 50_000;

const PROSE = cn(
  'prose prose-sm max-w-none text-foreground',
  '[&_p]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_a]:text-primary [&_a]:underline',
  '[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm',
);

function errorCopy(err: unknown, fallback: string): string {
  if (err instanceof DiscoveryApiError) {
    if (err.code === 'malformed_model_output') {
      return "Ada's answer came back scrambled. Nothing was saved — try the step again.";
    }
    if (err.code === 'no_intake') {
      return 'Ada needs something to work with first — add notes above or tell her about the idea below.';
    }
    if (err.detail) return err.detail;
  }
  return fallback;
}

function ThreadBubble({ m }: { m: ThreadMessage }) {
  if (m.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
        {m.content}
      </div>
    );
  }
  const isSummary = m.kind === 'summary';
  return (
    <div
      className={cn(
        'mr-auto max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        isSummary ? 'border border-accent/30 bg-secondary/50' : 'bg-muted',
      )}
    >
      {isSummary && (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">
          Session summary
        </p>
      )}
      <div className={PROSE}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
      </div>
    </div>
  );
}

function StepCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-accent/50 bg-card p-4 shadow-sm sm:p-5"
    >
      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function InlineError({
  message,
  onRetry,
  retryLabel = 'Retry this step',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
    >
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

function WorkingNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-secondary/60 px-3 py-2.5">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export default function Sprint() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [blindSpots, setBlindSpots] = useState<BlindSpot[]>([]);
  const [guide, setGuide] = useState<InterviewGuide | null>(null);
  const [docs, setDocs] = useState<SessionDocument[]>([]);
  const [step, setStep] = useState('grounding');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Per-action state — feedback lives on the object it affects.
  const [pasteText, setPasteText] = useState('');
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [redactions, setRedactions] = useState<number | null>(null);

  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  const [groundingIds, setGroundingIds] = useState<Set<string>>(new Set());
  const [groundingErrors, setGroundingErrors] = useState<Record<string, string>>({});

  const [blindBusy, setBlindBusy] = useState(false);
  const [blindError, setBlindError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [guideBusy, setGuideBusy] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);

  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLTextAreaElement>(null);

  const refreshThread = useCallback(async () => {
    if (!session) return;
    try {
      setMessages(await loadThread(session.conversation_id));
    } catch {
      // Thread refresh is cosmetic after a successful action; stay quiet.
    }
  }, [session]);

  // Initial load — everything the sprint needs, in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession(sessionId);
        if (cancelled) return;
        if (s.status === 'completed') {
          navigate(`/report/${s.id}`, { replace: true });
          return;
        }
        if (s.status === 'abandoned') {
          toast.info('That sprint was abandoned. Start a fresh one when ready.');
          navigate('/discovery', { replace: true });
          return;
        }
        const [p, thread, asmp, ev, bs, g, d] = await Promise.all([
          getProduct(s.product_id),
          loadThread(s.conversation_id),
          listAssumptions(s.id),
          listEvidence(s.id),
          listBlindSpots(s.id),
          getLatestGuide(s.id),
          listSessionDocuments(s.id),
        ]);
        if (cancelled) return;
        setSession(s);
        setProduct(p);
        setMessages(thread);
        setAssumptions(asmp);
        setEvidence(ev);
        setBlindSpots(bs);
        setGuide(g);
        setDocs(d);
        const known = SPRINT_STEPS.some((x) => x.key === s.current_step);
        setStep(known && s.current_step ? s.current_step : 'grounding');
        setSelected(
          new Set(asmp.filter((a) => a.is_prioritized).map((a) => a.id)),
        );
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, step, chatBusy]);

  const goToStep = useCallback(
    (key: string) => {
      setStep(key);
      if (session) {
        saveSessionStep(session.id, key).catch(() => {
          // Bookmark failed — the sprint continues; resume just lands one
          // step earlier. Worth a whisper, not a blocker.
          console.error('could not save sprint bookmark');
        });
      }
    },
    [session],
  );

  const riskiest = useMemo(
    () => pickRiskiest(assumptions.filter((a) => a.status !== 'abandoned'), 3),
    [assumptions],
  );
  const riskiestIds = useMemo(
    () => new Set(riskiest.map((a) => a.id)),
    [riskiest],
  );
  const evidenceFor = useCallback(
    (assumptionId: string) =>
      evidence.filter((e) => e.assumption_id === assumptionId),
    [evidence],
  );
  const indexOf = useCallback(
    (id: string) => assumptions.findIndex((a) => a.id === id) + 1,
    [assumptions],
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleIngest = async () => {
    if (!session) return;
    const text = pasteText.trim();
    if (!text) return;
    setIngestBusy(true);
    setIngestError(null);
    try {
      const result = await ingestPastedText(session.id, text);
      setPasteText('');
      setRedactions(result.redaction?.redacted_count ?? 0);
      setFlagged((result.redaction?.flagged ?? []).map((f) => f.token));
      setDocs(await listSessionDocuments(session.id));
    } catch (err) {
      setIngestError(
        errorCopy(err, "Couldn't save your notes. They're still in the box — try again."),
      );
    } finally {
      setIngestBusy(false);
    }
  };

  const handleMap = async () => {
    if (!session) return;
    setMappingBusy(true);
    setMappingError(null);
    try {
      const mapped = await mapAssumptions(session.id);
      setAssumptions(mapped);
      void refreshThread();
    } catch (err) {
      setMappingError(
        errorCopy(err, "Mapping didn't finish. Nothing was saved — try again."),
      );
    } finally {
      setMappingBusy(false);
    }
  };

  const handleScoreChange = async (
    a: Assumption,
    field: 'confidence' | 'impact',
    value: number,
  ) => {
    const prev = assumptions;
    setAssumptions((list) =>
      list.map((x) => (x.id === a.id ? { ...x, [field]: value } : x)),
    );
    try {
      await updateAssumption(a.id, { [field]: value });
    } catch {
      setAssumptions(prev);
      toast.error("That score didn't save. Back to what it was.");
    }
  };

  const handleGround = async (assumptionId: string) => {
    setGroundingIds((s) => new Set(s).add(assumptionId));
    setGroundingErrors((e) => ({ ...e, [assumptionId]: '' }));
    try {
      await groundAssumption(assumptionId);
      if (session) {
        setEvidence(await listEvidence(session.id));
      }
      void refreshThread();
    } catch (err) {
      setGroundingErrors((e) => ({
        ...e,
        [assumptionId]: errorCopy(
          err,
          'The market check failed mid-search. Try this one again.',
        ),
      }));
    } finally {
      setGroundingIds((s) => {
        const next = new Set(s);
        next.delete(assumptionId);
        return next;
      });
    }
  };

  const handleGroundAll = () => {
    for (const a of riskiest) {
      if (evidenceFor(a.id).length === 0 && !groundingIds.has(a.id)) {
        void handleGround(a.id);
      }
    }
  };

  const handleBlindSpots = async () => {
    if (!session) return;
    setBlindBusy(true);
    setBlindError(null);
    try {
      const spots = await runBlindSpots(session.id);
      setBlindSpots(spots);
      void refreshThread();
    } catch (err) {
      setBlindError(
        errorCopy(err, "Blind spot analysis didn't finish. Nothing was lost — try again."),
      );
    } finally {
      setBlindBusy(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      else toast.info('Five is the ceiling — deselect one first.');
      return next;
    });
  };

  const handleConfirmPriorities = async () => {
    if (!session) return;
    setConfirmBusy(true);
    try {
      const changes = assumptions.filter(
        (a) => a.is_prioritized !== selected.has(a.id),
      );
      await Promise.all(
        changes.map((a) =>
          updateAssumption(a.id, { is_prioritized: selected.has(a.id) }),
        ),
      );
      setAssumptions(await listAssumptions(session.id));
      goToStep('guide');
    } catch {
      toast.error("Couldn't save your priorities. Try confirming again.");
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleGuide = async () => {
    if (!session) return;
    setGuideBusy(true);
    setGuideError(null);
    try {
      const g = await generateGuide(session.id);
      setGuide(g);
      void refreshThread();
    } catch (err) {
      setGuideError(
        errorCopy(err, "The guide didn't come together. Try again — nothing was saved."),
      );
    } finally {
      setGuideBusy(false);
    }
  };

  const handleFinish = async () => {
    if (!session) return;
    setFinishBusy(true);
    setFinishError(null);
    try {
      const { summary_error } = await completeSession(session.id);
      if (summary_error) {
        toast.info("The sprint closed, but the summary didn't write. The report still compiles.");
      }
      await compileReport(session.id);
      navigate(`/report/${session.id}`);
    } catch (err) {
      setFinishError(
        errorCopy(err, "Couldn't finish the sprint. Everything so far is saved — try again."),
      );
      setFinishBusy(false);
    }
  };

  const handleChat = async (override?: string) => {
    if (!session || chatBusy) return;
    const text = (override ?? chatInput).trim();
    if (!text) return;
    const optimistic: ThreadMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    if (!override) setChatInput('');
    setChatBusy(true);
    try {
      const res = await sendChat(text, session.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: res.message_id,
          role: 'assistant',
          content: res.reply,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      const isCredits =
        err instanceof DiscoveryApiError && err.code === 'credits_exhausted';
      toast.error(
        isCredits
          ? "You've used today's credits — they reset at midnight UTC. The sprint steps still work."
          : 'Ada is taking a moment. Your message is in the thread — try again.',
      );
    } finally {
      setChatBusy(false);
    }
  };

  const digDeeper = (label: string, content: string) => {
    void handleChat(`Dig deeper on ${label}: ${content}`);
  };
  const answerPrompt = (label: string) => {
    setChatInput(`About ${label}: `);
    chatRef.current?.focus();
  };

  const handleChatKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleChat();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening your sprint…</p>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Couldn't open this sprint. It may have been removed, or the
          connection dropped — your work is stored server-side either way.
        </p>
        <Button variant="outline" onClick={() => navigate('/discovery')}>
          Back to Discovery
        </Button>
      </div>
    );
  }

  const currentIdx = stepIndex(step);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/discovery"
              aria-label="Back to Discovery"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ArrowLeft size={17} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-semibold tracking-tight">
                {product?.name ?? 'Discovery Sprint'}
              </h1>
              {session.stage && (
                <p className="text-[11px] text-muted-foreground">
                  Ada's read:{' '}
                  <span className="font-semibold text-accent">
                    {session.stage === 'fresh_idea'
                      ? 'fresh idea'
                      : 'mid-discovery, stuck'}
                  </span>
                </p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Sprint options"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <MoreHorizontal size={18} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => navigate('/discovery')}>
                Save & exit — resume later
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setAbandonOpen(true)}
              >
                Abandon this sprint
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-2.5 sm:px-6">
          <SprintProgress currentKey={step} onNavigate={goToStep} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 sm:px-6">
          {messages.map((m) => (
            <ThreadBubble key={m.id} m={m} />
          ))}
          {chatBusy && <WorkingNote label="Ada is thinking…" />}

          <div className="mt-3">
            {/* ── Step: grounding ── */}
            {step === 'grounding' && (
              <StepCard
                title="Ground the sprint"
                subtitle="Paste your brief, research notes, or interview scraps. Ada coaches from what you've actually written — not generic advice. Names and emails are stripped before anything is stored."
              >
                <div className="space-y-3">
                  <Textarea
                    value={pasteText}
                    onChange={(e) =>
                      setPasteText(e.target.value.slice(0, PASTE_MAX))
                    }
                    rows={5}
                    placeholder="Paste a product brief, positioning doc, or raw interview notes…"
                    aria-label="Paste grounding notes"
                  />
                  <p className="-mt-2 text-right text-[11px] text-muted-foreground">
                    {pasteText.length.toLocaleString()} /{' '}
                    {PASTE_MAX.toLocaleString()}
                  </p>
                  {ingestError && (
                    <InlineError
                      message={ingestError}
                      onRetry={() => void handleIngest()}
                      retryLabel="Try saving again"
                    />
                  )}
                  {ingestBusy && (
                    <WorkingNote label="Redacting personal details, then filing your notes…" />
                  )}
                  {redactions !== null && !ingestBusy && (
                    <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-foreground/85">
                      Notes added.{' '}
                      {redactions > 0
                        ? `${redactions} personal detail${redactions === 1 ? '' : 's'} redacted before storage.`
                        : 'No personal details needed redacting.'}
                      {flagged.length > 0 && (
                        <span className="mt-1 block text-warning">
                          Couldn't confidently redact:{' '}
                          <strong>{flagged.join(', ')}</strong> — kept in the
                          text; edit and re-paste if any of these is a person.
                        </span>
                      )}
                    </div>
                  )}
                  {docs.length > 0 && (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {docs.map((d) => (
                        <li key={d.id} className="flex items-center gap-2">
                          <span aria-hidden>📄</span>
                          {d.filename}
                          <span className="text-xs">({d.status})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      onClick={() => void handleIngest()}
                      disabled={!pasteText.trim() || ingestBusy}
                    >
                      Add these notes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => goToStep('mapping')}
                      disabled={ingestBusy}
                    >
                      {docs.length > 0 ? 'Done — map assumptions' : 'Skip — no notes yet'}
                    </Button>
                  </div>
                </div>
              </StepCard>
            )}

            {/* ── Step: mapping ── */}
            {step === 'mapping' && (
              <StepCard
                title="Map your assumptions"
                subtitle="Ada breaks the idea into specific, falsifiable assumptions and scores each: how strong your evidence is, and how badly it breaks if you're wrong."
              >
                <div className="space-y-3">
                  {mappingError && (
                    <InlineError
                      message={mappingError}
                      onRetry={() => void handleMap()}
                    />
                  )}
                  {mappingBusy && (
                    <WorkingNote label="Ada is mapping your assumptions — usually 10–20 seconds…" />
                  )}
                  {assumptions.length === 0 && !mappingBusy && (
                    <Button onClick={() => void handleMap()}>
                      Map my assumptions
                    </Button>
                  )}
                  {assumptions.length > 0 && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Tap a score to correct it — you know things Ada
                        doesn't. The scores drive everything downstream.
                      </p>
                      <div className="space-y-2.5">
                        {assumptions.map((a, i) => (
                          <AssumptionCard
                            key={a.id}
                            assumption={a}
                            index={i + 1}
                            editable
                            onScoreChange={(field, value) =>
                              void handleScoreChange(a, field, value)
                            }
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button onClick={() => goToStep('evidence')}>
                          These look right — check the market
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </StepCard>
            )}

            {/* ── Step: evidence ── */}
            {step === 'evidence' && (
              <StepCard
                title="Check the riskiest against the market"
                subtitle="Ada searches the live web for competitor moves, market data, and behavioral research on your riskiest assumptions — data, not just clever questions."
              >
                <div className="space-y-3">
                  {assumptions.length === 0 ? (
                    <InlineError
                      message="No assumptions mapped yet — go back one step."
                      onRetry={() => goToStep('mapping')}
                      retryLabel="Back to mapping"
                    />
                  ) : (
                    <>
                      <div className="space-y-2.5">
                        {rankByRisk(assumptions)
                          .filter((a) => riskiestIds.has(a.id))
                          .map((a) => {
                            const ev = evidenceFor(a.id);
                            const busy = groundingIds.has(a.id);
                            const err = groundingErrors[a.id];
                            return (
                              <AssumptionCard
                                key={a.id}
                                assumption={a}
                                index={indexOf(a.id)}
                                highlight
                              >
                                <div className="space-y-2">
                                  {busy && (
                                    <WorkingNote label="Searching the market — 30–60 seconds…" />
                                  )}
                                  {!busy && err && (
                                    <InlineError
                                      message={err}
                                      onRetry={() => void handleGround(a.id)}
                                      retryLabel="Retry the search"
                                    />
                                  )}
                                  {!busy && ev.length > 0 && (
                                    <ul className="space-y-1.5">
                                      {ev.map((e) => (
                                        <li key={e.id} className="text-xs">
                                          <a
                                            href={e.source_url}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="font-medium text-primary underline underline-offset-2"
                                          >
                                            {e.title ?? e.source_url}
                                          </a>{' '}
                                          <span
                                            className={cn(
                                              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                                              e.stance === 'supports' &&
                                                'bg-success/15 text-success',
                                              e.stance === 'challenges' &&
                                                'bg-destructive/10 text-destructive',
                                              e.stance === 'neutral' &&
                                                'bg-muted text-muted-foreground',
                                            )}
                                          >
                                            {e.stance}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {!busy && (
                                    <Button
                                      size="sm"
                                      variant={ev.length > 0 ? 'outline' : 'default'}
                                      onClick={() => void handleGround(a.id)}
                                    >
                                      {ev.length > 0
                                        ? 'Check again'
                                        : 'Check the market'}
                                    </Button>
                                  )}
                                </div>
                              </AssumptionCard>
                            );
                          })}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {riskiest.some(
                          (a) =>
                            evidenceFor(a.id).length === 0 &&
                            !groundingIds.has(a.id),
                        ) && (
                          <Button
                            onClick={handleGroundAll}
                            disabled={groundingIds.size > 0}
                          >
                            Check all {riskiest.length}
                          </Button>
                        )}
                        <Button
                          variant={evidence.length > 0 ? 'default' : 'outline'}
                          onClick={() => goToStep('blind_spots')}
                          disabled={groundingIds.size > 0}
                        >
                          {evidence.length > 0
                            ? 'On to blind spots'
                            : 'Skip — reason without evidence'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </StepCard>
            )}

            {/* ── Step: blind spots ── */}
            {step === 'blind_spots' && (
              <StepCard
                title="Surface your blind spots"
                subtitle="Ada cross-examines your assumptions against the evidence, your notes, and what prior sprints taught her — and names what you haven't confronted."
              >
                <div className="space-y-3">
                  {blindError && (
                    <InlineError
                      message={blindError}
                      onRetry={() => void handleBlindSpots()}
                    />
                  )}
                  {blindBusy && (
                    <WorkingNote label="Ada is cross-examining your thinking — usually 15–30 seconds…" />
                  )}
                  {blindSpots.length === 0 && !blindBusy && (
                    <Button onClick={() => void handleBlindSpots()}>
                      Surface my blind spots
                    </Button>
                  )}
                  {blindSpots.length > 0 && (
                    <>
                      <div className="space-y-2.5">
                        {blindSpots.map((b, i) => (
                          <div
                            key={b.id}
                            className="rounded-xl border border-border bg-background/60 px-4 py-3"
                          >
                            <p className="text-sm font-semibold text-foreground">
                              {i + 1}. {b.statement}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {b.evidence_backed ? (
                                <span className="rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                                  evidence-backed
                                </span>
                              ) : (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  socratic
                                </span>
                              )}
                              {b.assumption_id && indexOf(b.assumption_id) > 0 && (
                                <span className="text-[11px] text-muted-foreground">
                                  challenges #{indexOf(b.assumption_id)}
                                </span>
                              )}
                            </div>
                            {b.socratic_question && (
                              <p className="mt-2 border-l-2 border-accent/60 pl-3 text-sm italic text-foreground/85">
                                {b.socratic_question}
                              </p>
                            )}
                            <div className="mt-2.5 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  answerPrompt(`blind spot ${i + 1}`)
                                }
                              >
                                Answer it
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  digDeeper(`blind spot ${i + 1}`, b.statement)
                                }
                                disabled={chatBusy}
                              >
                                Dig deeper
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button onClick={() => goToStep('prioritize')}>
                          Pick what to test first
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleBlindSpots()}
                          disabled={blindBusy}
                        >
                          Re-run the analysis
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </StepCard>
            )}

            {/* ── Step: prioritize ── */}
            {step === 'prioritize' && (
              <StepCard
                title="Confirm your riskiest assumptions"
                subtitle="Pick 3–5 to take into customer interviews. Ada pre-suggests the highest impact × lowest confidence — override her freely."
              >
                <div className="space-y-3">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      selected.size >= 3 && selected.size <= 5
                        ? 'text-success'
                        : 'text-warning',
                    )}
                    role="status"
                  >
                    {selected.size} of 3–5 selected
                  </p>
                  <div className="space-y-2.5">
                    {rankByRisk(assumptions).map((a) => (
                      <AssumptionCard
                        key={a.id}
                        assumption={a}
                        index={indexOf(a.id)}
                        selectable
                        selected={selected.has(a.id)}
                        onToggleSelect={() => toggleSelected(a.id)}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selected.size === 0 && riskiest.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setSelected(new Set(riskiest.map((a) => a.id)))
                        }
                      >
                        Use Ada's suggestion ({riskiest.length})
                      </Button>
                    )}
                    <Button
                      onClick={() => void handleConfirmPriorities()}
                      disabled={
                        selected.size < 3 || selected.size > 5 || confirmBusy
                      }
                    >
                      {confirmBusy
                        ? 'Saving…'
                        : `Confirm these ${selected.size || ''}`}
                    </Button>
                  </div>
                </div>
              </StepCard>
            )}

            {/* ── Step: guide ── */}
            {step === 'guide' && (
              <StepCard
                title="Your Mom Test interview guide"
                subtitle="Questions about past behavior only — nothing a polite person can answer with a flattering lie."
              >
                <div className="space-y-3">
                  {guideError && (
                    <InlineError
                      message={guideError}
                      onRetry={() => void handleGuide()}
                    />
                  )}
                  {guideBusy && (
                    <WorkingNote label="Ada is writing your guide — usually 20–30 seconds…" />
                  )}
                  {!guide && !guideBusy && (
                    <Button onClick={() => void handleGuide()}>
                      Write my interview guide
                    </Button>
                  )}
                  {guide && !guideBusy && (
                    <>
                      <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border bg-background/60 px-4 py-3">
                        <div className={PROSE}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {guide.content_md}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        v{guide.version}
                        {guide.question_count
                          ? ` · ${guide.question_count} questions`
                          : ''}{' '}
                        · saved to this sprint
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button onClick={() => goToStep('report')}>
                          Wrap up the sprint
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleGuide()}
                        >
                          Rewrite it (keeps v{guide.version})
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </StepCard>
            )}

            {/* ── Step: report ── */}
            {step === 'report' && (
              <StepCard
                title="Finish & compile your report"
                subtitle="Ada closes the sprint, writes the session summary into your product's memory, and compiles everything into a shareable discovery report with the risk map."
              >
                <div className="space-y-3">
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      • {assumptions.length} assumption
                      {assumptions.length === 1 ? '' : 's'} mapped,{' '}
                      {assumptions.filter((a) => a.is_prioritized).length}{' '}
                      prioritized
                    </li>
                    <li>• {evidence.length} evidence citations</li>
                    <li>• {blindSpots.length} blind spots surfaced</li>
                    <li>
                      •{' '}
                      {guide
                        ? `Interview guide v${guide.version}`
                        : 'No interview guide yet (you can add one later)'}
                    </li>
                  </ul>
                  {finishError && (
                    <InlineError
                      message={finishError}
                      onRetry={() => void handleFinish()}
                    />
                  )}
                  {finishBusy ? (
                    <WorkingNote label="Closing the sprint and compiling your report…" />
                  ) : (
                    <Button onClick={() => void handleFinish()}>
                      Finish sprint & compile report
                    </Button>
                  )}
                </div>
              </StepCard>
            )}
          </div>

          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-end gap-3 px-4 py-3 sm:px-6">
          <Textarea
            ref={chatRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKey}
            placeholder="Ask Ada anything mid-sprint — she has the whole thread…"
            rows={1}
            disabled={chatBusy}
            className="min-h-[44px] resize-none"
            aria-label="Message Ada"
          />
          <Button
            onClick={() => void handleChat()}
            disabled={!chatInput.trim() || chatBusy}
          >
            Send
          </Button>
        </div>
      </footer>

      <AlertDialog open={abandonOpen} onOpenChange={setAbandonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Abandon this sprint?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The thread, assumptions, and evidence stay saved, but the sprint
              closes for good — no resuming. If you just need a break, use
              "Save & exit" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the sprint</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void (async () => {
                  try {
                    await abandonSession(session.id);
                    toast.info('Sprint abandoned. Everything it produced is kept.');
                    navigate('/discovery');
                  } catch {
                    toast.error("Couldn't abandon the sprint. Try again.");
                  }
                })();
              }}
            >
              Abandon it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
