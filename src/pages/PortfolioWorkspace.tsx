// Artifact workspace (Run 4): where the coaching happens. The thread is
// the spine; the draft grows beside it. Desktop shows conversation and
// draft side by side (the content-editor "preview beside editing"
// pattern — the PM must see sections land as Ada writes them, feedback
// at the result). At 375px the two become header tabs — each control
// stays attached to the panel it owns when the layout stacks (Locality
// Law 8). Export and share actions live on the draft panel, the object
// they act on.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Download, FileText, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DiscoveryApiError, loadThread, type ThreadMessage } from '@/lib/discovery-api';
import {
  coachTurn,
  generatePlan,
  getProject,
  listPortfolioProfiles,
  shareProject,
} from '@/lib/portfolio-api';
import { exportPortfolioPdf } from '@/lib/portfolio-pdf';
import { InlineError, WorkingNote } from '@/components/portfolio/notes';
import { ARTIFACT_TYPE_LABELS } from '@/types/portfolio';
import type { PortfolioProfile, PortfolioProject } from '@/types/portfolio';

const MESSAGE_MAX = 50_000;

const PROSE = cn(
  'prose prose-sm max-w-none text-foreground',
  '[&_p]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_a]:text-primary [&_a]:underline',
  '[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm'
);

export default function PortfolioWorkspace() {
  const { projectId = '' } = useParams();

  const [project, setProject] = useState<PortfolioProject | null>(null);
  const [profile, setProfile] = useState<PortfolioProfile | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mobilePane, setMobilePane] = useState<'thread' | 'draft'>('thread');

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getProject(projectId);
        if (cancelled) return;
        const profiles = await listPortfolioProfiles();
        const prof = profiles.find((x) => x.id === p.portfolio_profile_id) ?? null;
        if (cancelled) return;
        setProject(p);
        setProfile(prof);
        if (prof) setMessages(await loadThread(prof.conversation_id));
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, chatBusy]);

  const sections = useMemo(() => project?.artifact_content.sections ?? [], [project]);
  const draftReady = project?.artifact_content.draft_ready === true;
  const plan = project?.effort_estimate ?? null;

  const handleChat = async () => {
    if (!project || chatBusy) return;
    const text = chatInput.trim();
    if (!text) return;
    const optimistic: ThreadMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setChatInput('');
    setChatBusy(true);
    try {
      const res = await coachTurn(project.id, text);
      setMessages((prev) => [
        ...prev,
        {
          id: res.message_id ?? crypto.randomUUID(),
          role: 'assistant',
          content: res.reply,
          created_at: new Date().toISOString(),
        },
      ]);
      setProject(res.project);
      if (res.sections_updated) {
        toast.success('Ada updated the draft.', { duration: 2000 });
      }
    } catch (err) {
      toast.error(
        err instanceof DiscoveryApiError && err.detail
          ? err.detail
          : 'Ada is taking a moment. Your message is in the thread — try again.'
      );
    } finally {
      setChatBusy(false);
    }
  };

  const handleChatKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleChat();
    }
  };

  const handlePlan = async () => {
    if (!project) return;
    setPlanBusy(true);
    setPlanError(null);
    try {
      const { project: updated } = await generatePlan(project.id);
      setProject(updated);
      if (profile) setMessages(await loadThread(profile.conversation_id));
    } catch (err) {
      setPlanError(
        err instanceof DiscoveryApiError && err.code === 'malformed_model_output'
          ? 'The plan came back scrambled. Nothing was saved — try again.'
          : err instanceof DiscoveryApiError && err.detail
            ? err.detail
            : "The plan didn't come together. Nothing was lost — try again."
      );
    } finally {
      setPlanBusy(false);
    }
  };

  const handleCopyShare = async () => {
    if (!project) return;
    setShareBusy(true);
    try {
      const updated = project.share_token ? project : await shareProject(project.id);
      setProject(updated);
      const url = `${window.location.origin}/portfolio/share/${updated.share_token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the share link. Try again.");
    } finally {
      setShareBusy(false);
    }
  };

  const handleExport = () => {
    if (!project) return;
    try {
      exportPortfolioPdf(project);
    } catch {
      toast.error("The PDF export didn't finish. Try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening your workspace…</p>
      </div>
    );
  }

  if (loadError || !project || !profile) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Couldn't open this workspace. It may have been removed, or the connection dropped — your
          work is stored server-side either way.
        </p>
        <Button variant="outline" asChild>
          <Link to="/portfolio">Back to Portfolio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/portfolio"
              aria-label="Back to Portfolio"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ArrowLeft size={17} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-semibold tracking-tight">
                {project.idea_title}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {project.artifact_type ? ARTIFACT_TYPE_LABELS[project.artifact_type] : 'Artifact'}
                {' · '}
                {sections.length} section{sections.length === 1 ? '' : 's'} drafted
                {plan ? ' · plan ready' : draftReady ? ' · draft ready' : ''}
              </p>
            </div>
          </div>
          {/* Mobile pane toggle — the draft stays reachable when the
              two-pane layout stacks. */}
          <div className="flex rounded-lg border border-border p-0.5 lg:hidden" role="tablist">
            <PaneTab
              active={mobilePane === 'thread'}
              onClick={() => setMobilePane('thread')}
              icon={<MessageSquare size={13} aria-hidden />}
              label="Coaching"
            />
            <PaneTab
              active={mobilePane === 'draft'}
              onClick={() => setMobilePane('draft')}
              icon={<FileText size={13} aria-hidden />}
              label={`Draft${sections.length ? ` (${sections.length})` : ''}`}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 overflow-hidden">
        {/* ── Thread pane ── */}
        <div
          className={cn('flex min-w-0 flex-1 flex-col', mobilePane === 'draft' && 'hidden lg:flex')}
        >
          <main className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3 px-4 py-6 sm:px-6">
              {messages.length === 0 && (
                <div className="m-auto max-w-sm py-10 text-center">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    This is where Ada coaches you through the{' '}
                    {project.artifact_type
                      ? ARTIFACT_TYPE_LABELS[project.artifact_type].toLowerCase()
                      : 'artifact'}
                    , one section at a time. Start by telling her what you already believe about
                    this project — she'll pressure-test it.
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <ThreadBubble key={m.id} m={m} />
              ))}
              {chatBusy && <WorkingNote label="Ada is thinking…" />}
              <div ref={bottomRef} />
            </div>
          </main>
          <footer className="border-t border-border bg-background">
            <div className="flex items-end gap-3 px-4 py-3 sm:px-6">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value.slice(0, MESSAGE_MAX))}
                onKeyDown={handleChatKey}
                placeholder="Answer Ada, or push back — the artifact gets better either way…"
                rows={1}
                disabled={chatBusy}
                className="min-h-[44px] resize-none"
                aria-label="Message Ada"
              />
              <Button onClick={() => void handleChat()} disabled={!chatInput.trim() || chatBusy}>
                Send
              </Button>
            </div>
          </footer>
        </div>

        {/* ── Draft pane ── */}
        <aside
          className={cn(
            'w-full overflow-y-auto border-border bg-card/60 lg:w-[400px] lg:border-l',
            mobilePane === 'thread' && 'hidden lg:block'
          )}
          aria-label="Artifact draft"
        >
          <div className="space-y-4 px-4 py-5 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-accent">
                The draft
              </h2>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleExport}
                  disabled={sections.length === 0}
                  title={sections.length === 0 ? 'Draft a section first' : undefined}
                >
                  <Download size={13} aria-hidden />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void handleCopyShare()}
                  disabled={shareBusy || sections.length === 0}
                  title={sections.length === 0 ? 'Draft a section first' : undefined}
                >
                  {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                  {copied ? 'Copied' : 'Share'}
                </Button>
              </div>
            </div>

            {project.ai_angle && (
              <p className="border-l-2 border-accent/60 pl-3 text-xs leading-relaxed text-foreground/80">
                <span className="mr-1.5 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  AI angle
                </span>
                {project.ai_angle}
              </p>
            )}

            {sections.length === 0 && (
              <div className="rounded-xl border border-dashed border-accent/40 bg-background/40 px-4 py-6 text-center">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nothing drafted yet. As the coaching lands, Ada writes each section here — you'll
                  see the artifact take shape while you talk.
                </p>
              </div>
            )}

            {sections.map((s) => (
              <section
                key={s.key}
                aria-label={s.title}
                className="rounded-xl border border-border bg-background/70 px-4 py-3.5"
              >
                <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                  {s.title}
                </h3>
                <div className={cn(PROSE, 'mt-1.5')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content_md}</ReactMarkdown>
                </div>
              </section>
            ))}

            {/* ── Effort plan — lives with the draft it plans for ── */}
            {plan ? (
              <section
                aria-label="Effort plan"
                className="rounded-xl border border-accent/50 bg-secondary/40 px-4 py-3.5"
              >
                <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                  Effort plan
                </h3>
                <p className="mt-1.5 text-sm font-semibold text-foreground">
                  ~{plan.total_hours} hours · {plan.timeline}
                </p>
                <p className="text-sm text-foreground/85">{plan.cadence}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {plan.tools.map((t) => (
                    <li key={t.name} className="text-xs leading-relaxed text-foreground/85">
                      <span className="font-semibold">{t.name}</span> — {t.purpose}
                      {t.cost_note && (
                        <span className="text-muted-foreground"> ({t.cost_note})</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-xs italic text-muted-foreground">{plan.honesty_note}</p>
              </section>
            ) : (
              sections.length > 0 && (
                <div className="space-y-2">
                  {planError && (
                    <InlineError message={planError} onRetry={() => void handlePlan()} />
                  )}
                  {planBusy ? (
                    <WorkingNote label="Ada is sizing the work honestly — 15–30 seconds…" />
                  ) : (
                    <Button
                      className="w-full"
                      variant={draftReady ? 'default' : 'outline'}
                      onClick={() => void handlePlan()}
                    >
                      {draftReady
                        ? "Draft's ready — get my tools & effort plan"
                        : 'Get my tools & effort plan'}
                    </Button>
                  )}
                </div>
              )
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PaneTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ThreadBubble({ m }: { m: ThreadMessage }) {
  if (m.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
        {m.content}
      </div>
    );
  }
  return (
    <div className="mr-auto max-w-[92%] rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed">
      <div className={PROSE}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
      </div>
    </div>
  );
}
