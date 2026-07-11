// Discovery Sprint surface (agent-loop redesign). Chat-first by design:
// the conversation thread is the spine, and Ada's ONE outstanding proposal
// renders as an inline decision card at the bottom of the thread — confirm,
// override, or "not now", the PM always decides. No multi-panel dashboard.
//
// The engine is the discovery-turn controller: every footer message is a
// turn (coach reply + a possible proposal), every direction change is a
// PM-gated dispatch. Loop state (phase, coverage, active frameworks) is
// server-owned; this page renders it and reports every state change on the
// object it affects — nothing updates silently.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, MoreHorizontal, NotebookPen } from 'lucide-react';
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
import CoveragePath from '@/components/discovery/CoveragePath';
import ProposalCard from '@/components/discovery/ProposalCard';
import FrameworkLibrary from '@/components/discovery/FrameworkLibrary';
import NotesDialog from '@/components/discovery/NotesDialog';
import {
  DiscoveryApiError,
  abandonSession,
  getFrameworks,
  getProduct,
  getSession,
  initiateDiscoveryAction,
  listAssumptions,
  listSessionDocuments,
  loadThread,
  resolveDiscoveryAction,
  scoreAssumptionFramework,
  sendDiscoveryTurn,
  updateAssumption,
  type DispatchResult,
  type ThreadMessage,
} from '@/lib/discovery-api';
import type {
  ActionType,
  Assumption,
  AssumptionStatus,
  Coverage,
  DiscoveryGoal,
  FrameworkScores,
  FrameworkSlot,
  PendingAction,
  Product,
  PublicFramework,
  Session,
  SessionDocument,
} from '@/types/discovery';

const PROSE = cn(
  'prose prose-sm max-w-none text-foreground',
  '[&_p]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_a]:text-primary [&_a]:underline',
  '[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm'
);

// First-move prompts offered when a sprint opens with only the PM's intake
// and no coach reply yet. Each is sent as a real PM turn (handleTurn), so
// the coach reads the already-persisted intake from history and answers —
// the top chip in particular produces Ada's first diagnostic read. Phrased
// first-person because they render as the PM's own message when clicked.
const STARTER_PROMPTS = [
  'Give me your honest first read on this.',
  "What's the riskiest assumption I'm making?",
  'Where should I focus my discovery first?',
  'What am I not seeing here?',
];

function errorCopy(err: unknown, fallback: string): string {
  if (err instanceof DiscoveryApiError) {
    if (err.code === 'malformed_model_output') {
      return "Ada's answer came back scrambled. Nothing was saved — try again.";
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
        isSummary ? 'border border-accent/30 bg-secondary/50' : 'bg-muted'
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

function WorkingNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-secondary/60 px-3 py-2.5">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent motion-reduce:animate-none"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
      <p className="text-sm text-muted-foreground" role="status">
        {label}
      </p>
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
  const [docs, setDocs] = useState<SessionDocument[]>([]);

  // Server-owned loop state, mirrored for render. Cutover rule: sessions
  // started before the loop have no phase yet — treat as 'frame' with empty
  // coverage; the controller repopulates on the next turn.
  const [currentPhase, setCurrentPhase] = useState<DiscoveryGoal>('frame');
  const [coverage, setCoverage] = useState<Coverage>({});
  const [activeFramework, setActiveFramework] = useState<Partial<Record<FrameworkSlot, string>>>(
    {}
  );
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Two-tab guard: session_updated_at from the last load/dispatch is the
  // optimistic-concurrency token; stale = another tab moved the sprint.
  const [sessionVersion, setSessionVersion] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [turnBusy, setTurnBusy] = useState(false);
  // One dispatch (resolve/initiate) in flight at a time; the source decides
  // where its feedback renders (proposal card vs an inline working note).
  const [dispatch, setDispatch] = useState<{ source: 'card' | 'library'; note: string } | null>(
    null
  );

  const [abandonOpen, setAbandonOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [frameworks, setFrameworks] = useState<PublicFramework[] | null>(null);
  const [frameworksError, setFrameworksError] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLTextAreaElement>(null);

  const inputLocked = turnBusy || dispatch !== null || stale;

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
        const [p, thread, asmp, d] = await Promise.all([
          getProduct(s.product_id),
          loadThread(s.conversation_id),
          listAssumptions(s.id),
          listSessionDocuments(s.id),
        ]);
        if (cancelled) return;
        setSession(s);
        setSessionVersion(s.updated_at);
        setProduct(p);
        setMessages(thread);
        setAssumptions(asmp);
        setDocs(d);
        setCurrentPhase(s.current_phase ?? 'frame');
        setCoverage(s.coverage ?? {});
        setActiveFramework(s.active_framework ?? {});
        setPendingAction(s.pending_action ?? null);
        // Non-fatal: framework score inputs just don't render without it.
        getFrameworks()
          .then((list) => {
            if (!cancelled) setFrameworks(list);
          })
          .catch(() => {
            if (!cancelled) setFrameworksError(true);
          });
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
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, pendingAction, turnBusy]);

  // Session creation persists the PM's intake but never calls the coach, so
  // a fresh sprint opens with the PM's own message and no reply — put focus
  // straight in the composer so the next step is obvious.
  useEffect(() => {
    if (!loading && !loadError) chatRef.current?.focus();
  }, [loading, loadError]);

  // ── The loop: turns ───────────────────────────────────────────────────────

  const handleTurn = async (override?: string) => {
    if (!session || inputLocked) return;
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
    setTurnBusy(true);
    try {
      const res = await sendDiscoveryTurn(session.id, text);
      setMessages((prev) => [
        ...prev,
        {
          id: res.message_id ?? crypto.randomUUID(),
          role: 'assistant',
          content: res.reply,
          created_at: new Date().toISOString(),
        },
      ]);
      setPendingAction(res.pending_action);
      if (res.current_phase) setCurrentPhase(res.current_phase);
      if (res.coverage) setCoverage(res.coverage);
      if (res.session_updated_at) setSessionVersion(res.session_updated_at);
    } catch (err) {
      toast.error(
        errorCopy(err, 'Ada is taking a moment. Your message is in the thread — try again.')
      );
    } finally {
      setTurnBusy(false);
    }
  };

  const handleChatKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleTurn();
    }
  };

  // ── The loop: dispatches (resolve a proposal / initiate out of turn) ──────

  const applyDispatch = useCallback(
    async (r: DispatchResult) => {
      if (!session) return;
      if (r.concluded) {
        navigate(`/report/${session.id}`);
        return;
      }
      if (r.current_phase) setCurrentPhase(r.current_phase);
      if (r.coverage) setCoverage(r.coverage);
      if (r.active_framework) setActiveFramework(r.active_framework);
      if (r.session_updated_at) setSessionVersion(r.session_updated_at);
      setPendingAction(null);
      if (r.dismissed) return;
      // Capabilities write their narratives into the thread and may add or
      // rescore assumptions — pull both so the new state shows.
      const [thread, asmp] = await Promise.all([
        loadThread(session.conversation_id),
        listAssumptions(session.id),
      ]);
      setMessages(thread);
      setAssumptions(asmp);
      if (asmp.length > 0 && assumptions.length === 0) setAssumptionsOpen(true);
    },
    [session, navigate, assumptions.length]
  );

  const runDispatch = async (
    source: 'card' | 'library',
    note: string,
    call: () => Promise<DispatchResult>,
    onDone?: (r: DispatchResult) => void
  ) => {
    if (!session || dispatch) return;
    setDispatch({ source, note });
    try {
      const r = await call();
      onDone?.(r);
      await applyDispatch(r);
    } catch (err) {
      if (err instanceof DiscoveryApiError && err.code === 'stale_session') {
        setStale(true);
      } else {
        toast.error(errorCopy(err, "That didn't go through. Nothing changed — try again."));
      }
    } finally {
      setDispatch(null);
    }
  };

  const handleResolve = (
    decision: 'confirm' | 'override' | 'dismiss',
    action: ActionType,
    params?: Record<string, unknown>
  ) => {
    if (!session) return;
    void runDispatch(
      'card',
      '',
      () =>
        resolveDiscoveryAction(
          session.id,
          { decision, action, params },
          sessionVersion ?? undefined
        ),
      (r) => {
        if (decision === 'dismiss') {
          if (action === 'define_success_metric') {
            toast.info('Okay — skipping the success metric. Revisit it anytime from the library.');
          } else if (action === 'prepare_interviews') {
            toast.info('Okay — skipping interviews for now.');
          }
          return;
        }
        if (action === 'propose_prioritization' && r.ok) {
          const name =
            pendingAction?.framework?.options.find((o) => o.id === params?.framework)?.name ??
            'your pick';
          toast.success(`${name} is your prioritization lens now. Ada will coach through it.`);
        }
      }
    );
  };

  const handleUseFramework = (fw: PublicFramework) => {
    if (!session) return;
    setLibraryOpen(false);
    if (fw.slot === 'prioritization') {
      void runDispatch(
        'library',
        'Setting your prioritization lens…',
        () =>
          initiateDiscoveryAction(
            session.id,
            'propose_prioritization',
            { framework: fw.id },
            sessionVersion ?? undefined
          ),
        (r) => {
          if (r.ok) {
            toast.success(`${fw.name} is your prioritization lens now. Ada will coach through it.`);
          }
        }
      );
    } else if (fw.slot === 'interview') {
      void runDispatch(
        'library',
        'Ada is writing your interview guide — usually 20–30 seconds…',
        () =>
          initiateDiscoveryAction(
            session.id,
            'prepare_interviews',
            { framework: fw.id },
            sessionVersion ?? undefined
          )
      );
    }
  };

  const handleAskForMetric = () => {
    setLibraryOpen(false);
    void handleTurn(
      "I'd like to define what success looks like — can we set a North Star metric now?"
    );
  };

  const openLibrary = () => {
    setLibraryOpen(true);
    if (!frameworks) void loadFrameworks();
  };

  const loadFrameworks = async () => {
    setFrameworksError(false);
    try {
      setFrameworks(await getFrameworks());
    } catch {
      setFrameworksError(true);
    }
  };

  // ── Assumptions review (scores + prioritize live on the card) ────────────

  const handleScoreChange = async (
    a: Assumption,
    field: 'confidence' | 'impact',
    value: number
  ) => {
    const prev = assumptions;
    setAssumptions((list) => list.map((x) => (x.id === a.id ? { ...x, [field]: value } : x)));
    try {
      await updateAssumption(a.id, { [field]: value });
    } catch {
      setAssumptions(prev);
      toast.error("That score didn't save. Back to what it was.");
    }
  };

  const handleTogglePrioritize = async (a: Assumption) => {
    const prev = assumptions;
    setAssumptions((list) =>
      list.map((x) => (x.id === a.id ? { ...x, is_prioritized: !a.is_prioritized } : x))
    );
    try {
      await updateAssumption(a.id, { is_prioritized: !a.is_prioritized });
    } catch {
      setAssumptions(prev);
      toast.error("That didn't save. Back to what it was.");
    }
  };

  const handleStatusChange = async (a: Assumption, status: AssumptionStatus) => {
    const prev = assumptions;
    setAssumptions((list) => list.map((x) => (x.id === a.id ? { ...x, status } : x)));
    try {
      await updateAssumption(a.id, { status });
    } catch {
      setAssumptions(prev);
      toast.error("That status didn't save. Back to what it was.");
    }
  };

  // RICE/MoSCoW scores are service-owned (framework_scores), so this goes
  // through the discovery-turn controller rather than the plain /assumptions
  // PATCH used above.
  const handleFrameworkScoreChange = async (a: Assumption, scores: FrameworkScores) => {
    if (!session) return;
    const prev = assumptions;
    setAssumptions((list) =>
      list.map((x) => (x.id === a.id ? { ...x, framework_scores: scores } : x))
    );
    try {
      const updated = await scoreAssumptionFramework(session.id, a.id, scores);
      setAssumptions((list) => list.map((x) => (x.id === a.id ? updated : x)));
    } catch {
      setAssumptions(prev);
      toast.error("That score didn't save. Back to what it was.");
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
          Couldn't open this sprint. It may have been removed, or the connection dropped — your work
          is stored server-side either way.
        </p>
        <Button variant="outline" onClick={() => navigate('/discovery')}>
          Back to Discovery
        </Button>
      </div>
    );
  }

  const prioritizedCount = assumptions.filter((a) => a.is_prioritized).length;
  // Only RICE/MoSCoW carry a framework_scores UI here — the default
  // confidence×impact framework already renders via the columns above, so
  // it's deliberately excluded (categorical = MoSCoW, formula 'rice' = RICE).
  const scoredFramework =
    frameworks?.find(
      (f) =>
        f.id === activeFramework.prioritization &&
        (f.scoring?.kind === 'categorical' || f.scoring?.formula === 'rice')
    ) ?? null;

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
                    {session.stage === 'fresh_idea' ? 'fresh idea' : 'mid-discovery, stuck'}
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openLibrary}
              className="flex items-center gap-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <BookOpen size={17} aria-hidden />
              <span className="hidden text-xs font-semibold sm:inline">Frameworks</span>
              <span className="sr-only sm:hidden">Framework library</span>
            </button>
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
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-2.5 sm:px-6">
          <CoveragePath coverage={coverage} currentPhase={currentPhase} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 sm:px-6">
          {messages.map((m) => (
            <ThreadBubble key={m.id} m={m} />
          ))}

          {/* A fresh sprint opens with only the PM's intake — session
              creation persists it but doesn't call the coach (the zero-click
              auto-kickoff is a backend change slated for Polish Sprint 1).
              These first moves hand the PM a one-click way to get Ada going:
              the intake is already in history, so any of them prompt a real
              reply, and the top one gives Ada's first diagnostic read. */}
          {!stale && !turnBusy && messages.length === 1 && messages[0].role === 'user' && (
            <div className="mr-auto max-w-[92%] space-y-2.5">
              <p className="text-sm text-muted-foreground">
                Pick a first move to get Ada's read — or just start typing below.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={inputLocked}
                    onClick={() => void handleTurn(prompt)}
                    className={cn(
                      'rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground',
                      'transition-colors hover:border-accent/60 hover:bg-muted',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turnBusy && <WorkingNote label="Ada is thinking…" />}
          {dispatch?.source === 'library' && <WorkingNote label={dispatch.note} />}

          {/* Two-tab guard: once another tab has moved this sprint, this tab
              stops offering decisions and asks for a refresh — never a
              silent overwrite. */}
          {stale && (
            <section
              role="alert"
              className="mt-3 rounded-2xl border border-warning/50 bg-warning/10 p-5"
            >
              <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                This sprint moved ahead in another tab
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                Everything saved there is safe. Refresh to pick up from the newest state — nothing
                from this tab will overwrite it.
              </p>
              <Button className="mt-3" onClick={() => window.location.reload()}>
                Refresh to continue
              </Button>
            </section>
          )}

          {!stale && assumptions.length > 0 && (
            <section aria-label="Your assumptions" className="mt-1">
              <button
                type="button"
                aria-expanded={assumptionsOpen}
                onClick={() => setAssumptionsOpen((o) => !o)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left',
                  'transition-colors hover:border-accent/60 hover:bg-muted/60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block text-xs text-accent transition-transform duration-200 motion-reduce:transition-none',
                    assumptionsOpen && 'rotate-90'
                  )}
                >
                  ▸
                </span>
                <span className="text-sm font-semibold text-foreground">
                  Your assumptions ({assumptions.length})
                </span>
                <span className="text-xs text-muted-foreground">
                  · {prioritizedCount} prioritized
                </span>
              </button>
              {assumptionsOpen && (
                <div className="mt-2 space-y-2.5">
                  <p className="text-xs text-muted-foreground">
                    Tap a score to correct it — you know things Ada doesn't. Prioritized assumptions
                    are what the wrap-up is measured against.
                  </p>
                  {assumptions.map((a, i) => (
                    <AssumptionCard
                      key={a.id}
                      assumption={a}
                      index={i + 1}
                      editable
                      onScoreChange={(field, value) => void handleScoreChange(a, field, value)}
                      onStatusChange={(status) => void handleStatusChange(a, status)}
                      framework={scoredFramework}
                      onFrameworkScoreChange={(scores) =>
                        void handleFrameworkScoreChange(a, scores)
                      }
                    >
                      <Button
                        size="sm"
                        variant={a.is_prioritized ? 'default' : 'outline'}
                        onClick={() => void handleTogglePrioritize(a)}
                      >
                        {a.is_prioritized ? 'Prioritized ✓' : 'Prioritize'}
                      </Button>
                    </AssumptionCard>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* The decision point stays last — nearest the composer, where the
              conversation actually is. Reference material (assumptions) sits
              above; Ada's outstanding proposal is always the closest card. */}
          {!stale && pendingAction && (
            <ProposalCard
              key={`${pendingAction.action}-${pendingAction.rationale}`}
              proposal={pendingAction}
              busy={dispatch?.source === 'card'}
              onResolve={handleResolve}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3 sm:px-6">
          <button
            type="button"
            aria-label="Add grounding notes"
            title="Add grounding notes"
            onClick={() => setNotesOpen(true)}
            className={cn(
              'relative mb-0.5 rounded-md p-2 text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
            )}
          >
            <NotebookPen size={18} aria-hidden />
            {docs.length > 0 && (
              <span
                aria-hidden
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent"
              />
            )}
          </button>
          <Textarea
            ref={chatRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKey}
            placeholder="Talk discovery with Ada — she's tracking the whole sprint…"
            rows={1}
            disabled={inputLocked}
            className="min-h-[44px] resize-none"
            aria-label="Message Ada"
          />
          <Button onClick={() => void handleTurn()} disabled={!chatInput.trim() || inputLocked}>
            Send
          </Button>
        </div>
      </footer>

      <NotesDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        sessionId={session.id}
        docs={docs}
        onFiled={setDocs}
      />

      <FrameworkLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        frameworks={frameworks}
        loadError={frameworksError}
        onRetry={() => void loadFrameworks()}
        activeFramework={activeFramework}
        busy={dispatch !== null || turnBusy}
        onUseFramework={handleUseFramework}
        onAskForMetric={handleAskForMetric}
      />

      <AlertDialog open={abandonOpen} onOpenChange={setAbandonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Abandon this sprint?</AlertDialogTitle>
            <AlertDialogDescription>
              The thread, assumptions, and evidence stay saved, but the sprint closes for good — no
              resuming. If you just need a break, use "Save & exit" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the sprint</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void (async () => {
                  try {
                    await abandonSession(session.id, sessionVersion ?? undefined);
                    toast.info('Sprint abandoned. Everything it produced is kept.');
                    navigate('/discovery');
                  } catch (err) {
                    if (err instanceof DiscoveryApiError && err.code === 'stale_session') {
                      setStale(true);
                      return;
                    }
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
