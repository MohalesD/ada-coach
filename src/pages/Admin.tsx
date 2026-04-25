import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import {
  activatePrompt,
  createPrompt,
  deletePrompt,
  getConversation,
  getInsights,
  listConversations,
  listPrompts,
  updateConversationStatus,
  updatePrompt,
  type CoachingPrompt,
  type ConversationDetail,
  type ConversationStat,
  type ConversationSummary,
  type InsightsResponse,
  type PromptStat,
  type RecentFeedbackEvent,
} from '@/lib/admin-api';

export default function Admin() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('conversations');
  const [pendingExpandId, setPendingExpandId] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  const handleDeepLink = useCallback((conversationId: string) => {
    setActiveTab('conversations');
    setPendingExpandId(conversationId);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
              Admin
            </p>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="gradient-text">Ada</span> Control Panel
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              ← Back to chat
            </Link>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="prompts">Coaching Prompts</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            {profile?.role === 'owner' && (
              <TabsTrigger value="documents">Documents</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="conversations" className="mt-6">
            <ConversationsTab
              onUnauthorized={handleUnauthorized}
              pendingExpandId={pendingExpandId}
              onConsume={() => setPendingExpandId(null)}
            />
          </TabsContent>

          <TabsContent value="prompts" className="mt-6">
            <PromptsTab onUnauthorized={handleUnauthorized} />
          </TabsContent>

          <TabsContent value="insights" className="mt-6">
            <InsightsTab
              onUnauthorized={handleUnauthorized}
              onDeepLink={handleDeepLink}
            />
          </TabsContent>

          {profile?.role === 'owner' && (
            <TabsContent value="documents" className="mt-6">
              <DocumentsTab onUnauthorized={handleUnauthorized} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Conversations tab
// ──────────────────────────────────────────────────────────────────

function ConversationsTab({
  onUnauthorized,
  pendingExpandId,
  onConsume,
}: {
  onUnauthorized: () => void;
  pendingExpandId?: string | null;
  onConsume?: () => void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ConversationDetail | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await listConversations();
      setConversations(list);
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Deep-link from Insights tab: always expand (no toggle) once initial
  // load is done, then clear the pending id so re-clicks re-trigger it.
  useEffect(() => {
    if (!pendingExpandId || isLoading) return;
    const targetId = pendingExpandId;
    onConsume?.();
    setExpandedId(targetId);
    setExpandedDetail(null);
    setIsDetailLoading(true);
    (async () => {
      try {
        const detail = await getConversation(targetId);
        setExpandedDetail(detail);
      } catch (err) {
        if ((err as Error).name === 'UnauthorizedError') {
          onUnauthorized();
          return;
        }
        setError((err as Error).message);
      } finally {
        setIsDetailLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExpandId, isLoading]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(id);
    setExpandedDetail(null);
    setIsDetailLoading(true);
    try {
      const detail = await getConversation(id);
      setExpandedDetail(detail);
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await updateConversationStatus(id, 'archived');
      await refresh();
      if (expandedId === id) {
        setExpandedId(null);
        setExpandedDetail(null);
      }
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Conversations</CardTitle>
          <CardDescription>
            {conversations.length} total · click a row to expand
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="w-24 text-right">Messages</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.length === 0 && !isLoading && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No conversations yet.
                </TableCell>
              </TableRow>
            )}
            {conversations.map((c) => {
              const isExpanded = expandedId === c.id;
              return (
                <>
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => void handleExpand(c.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="line-clamp-1">
                        {c.title ?? '(untitled)'}
                      </div>
                      {c.first_message && (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {c.first_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.message_count}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(c.created_at)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={c.status === 'archived'}
                        onClick={() => void handleArchive(c.id)}
                      >
                        Archive
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${c.id}-detail`}>
                      <TableCell colSpan={5} className="bg-muted/40 p-0">
                        <div className="border-l-2 border-primary px-6 py-4">
                          {isDetailLoading && (
                            <p className="text-sm text-muted-foreground">
                              Loading messages...
                            </p>
                          )}
                          {expandedDetail && !isDetailLoading && (
                            <div className="flex flex-col gap-3">
                              {expandedDetail.messages.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                  No messages in this conversation.
                                </p>
                              )}
                              {expandedDetail.messages.map((m) => (
                                <div
                                  key={m.id}
                                  className={cn(
                                    'rounded-lg border border-border px-4 py-3 text-sm',
                                    m.role === 'user'
                                      ? 'bg-secondary/30'
                                      : 'bg-background',
                                  )}
                                >
                                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                    <span>{m.role}</span>
                                    <span>{formatDate(m.created_at)}</span>
                                  </div>
                                  <div className="whitespace-pre-wrap leading-relaxed">
                                    {m.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Prompts tab
// ──────────────────────────────────────────────────────────────────

type PromptFormState = {
  mode: 'create' | 'edit';
  name: string;
  prompt_text: string;
  notes: string;
  editingId?: string;
};

function PromptsTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [prompts, setPrompts] = useState<CoachingPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PromptFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await listPrompts();
      setPrompts(list);
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleActivate = async (id: string) => {
    try {
      await activatePrompt(id);
      await refresh();
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePrompt(id);
      await refresh();
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    }
  };

  const openCreate = () => {
    setForm({
      mode: 'create',
      name: '',
      prompt_text: '',
      notes: '',
    });
  };

  const openEdit = (p: CoachingPrompt) => {
    setForm({
      mode: 'edit',
      editingId: p.id,
      name: p.name,
      prompt_text: p.prompt_text,
      notes: p.notes ?? '',
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || isSaving) return;
    setIsSaving(true);
    try {
      if (form.mode === 'create') {
        await createPrompt({
          name: form.name,
          prompt_text: form.prompt_text,
          notes: form.notes || undefined,
        });
      } else if (form.editingId) {
        await updatePrompt(form.editingId, {
          name: form.name,
          prompt_text: form.prompt_text,
          notes: form.notes || null,
        });
      }
      setForm(null);
      await refresh();
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Coaching Prompts</CardTitle>
            <CardDescription>
              {prompts.length} total · exactly one can be active at a time
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={isLoading}
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              size="sm"
              onClick={openCreate}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create New Prompt
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {prompts.length === 0 && !isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No prompts yet. Create one to get started.
              </p>
            )}
            {prompts.map((p) => (
              <PromptRow
                key={p.id}
                prompt={p}
                onEdit={() => openEdit(p)}
                onActivate={() => void handleActivate(p.id)}
                onDelete={() => void handleDelete(p.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form?.mode === 'create' ? 'Create Prompt' : 'Edit Prompt'}
            </DialogTitle>
            <DialogDescription>
              {form?.mode === 'create'
                ? 'Creating a prompt with an existing name auto-increments its version.'
                : 'Changes apply immediately. If this prompt is active, new chats will use the updated text.'}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="prompt-name">Name</Label>
                <Input
                  id="prompt-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="Ada v2 - Discovery Coach"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prompt-text">Prompt text</Label>
                <Textarea
                  id="prompt-text"
                  value={form.prompt_text}
                  onChange={(e) =>
                    setForm({ ...form, prompt_text: e.target.value })
                  }
                  rows={12}
                  required
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prompt-notes">Notes (optional)</Label>
                <Input
                  id="prompt-notes"
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="What changed in this version"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm(null)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || !form.name || !form.prompt_text}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSaving
                    ? 'Saving...'
                    : form.mode === 'create'
                      ? 'Create'
                      : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PromptRow({
  prompt,
  onEdit,
  onActivate,
  onDelete,
}: {
  prompt: CoachingPrompt;
  onEdit: () => void;
  onActivate: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors',
        prompt.is_active
          ? 'border-[#C9A84C] bg-accent/5'
          : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{prompt.name}</h3>
            <span className="text-xs text-muted-foreground">
              v{prompt.version}
            </span>
            {prompt.is_active && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9A84C] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0A0A0A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0A0A0A]" />
                Active
              </span>
            )}
          </div>
          {prompt.notes && (
            <p className="mt-1 text-xs text-muted-foreground">
              {prompt.notes}
            </p>
          )}
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {prompt.prompt_text}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Updated {formatDate(prompt.updated_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          {!prompt.is_active && (
            <Button
              size="sm"
              onClick={onActivate}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Activate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={prompt.is_active}
            title={
              prompt.is_active
                ? 'Cannot delete the active prompt'
                : undefined
            }
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Insights tab
// ──────────────────────────────────────────────────────────────────

function InsightsTab({
  onUnauthorized,
  onDeepLink,
}: {
  onUnauthorized: () => void;
  onDeepLink: (conversationId: string) => void;
}) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getInsights();
      setData(res);
      setLastUpdated(new Date());
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isEmpty =
    data &&
    data.totals.assistant_messages === 0 &&
    data.totals.feedback_count === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Insights</h2>
          <p className="text-xs text-muted-foreground">
            {lastUpdated
              ? `Updated ${formatRelative(lastUpdated)}`
              : isLoading
                ? 'Loading…'
                : 'Not yet loaded'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={isLoading}
          aria-label="Refresh insights"
        >
          <RefreshIcon spinning={isLoading} />
          <span className="ml-1.5">{isLoading ? 'Refreshing…' : 'Refresh'}</span>
        </Button>
      </div>

      {/* Error */}
      {error && !isLoading && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-semibold text-destructive">
                Could not load insights
              </p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {isLoading && !data && <InsightsSkeleton />}

      {/* Empty */}
      {!isLoading && !error && isEmpty && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              No feedback data yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Share Ada with users and encourage them to rate responses.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loaded */}
      {!isLoading && !error && data && !isEmpty && (
        <>
          {/* Top metric cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Coaching sessions"
              value={data.totals.conversations.toLocaleString()}
              subtext="Total conversations"
            />
            <MetricCard
              label="Feedback rate"
              value={formatPercent(data.rates.feedback_rate)}
              subtext={`${data.totals.feedback_count.toLocaleString()} of ${data.totals.assistant_messages.toLocaleString()} responses rated`}
            />
            <MetricCard
              label="Positive rate"
              value={formatPercent(data.rates.positive_rate)}
              subtext={`${data.totals.positive.toLocaleString()} positive · ${data.totals.negative.toLocaleString()} negative`}
              accent={
                data.totals.feedback_count > 0 && data.rates.positive_rate >= 0.8
                  ? 'gold'
                  : undefined
              }
            />
            <MetricCard
              label="Messages exchanged"
              value={data.totals.messages.toLocaleString()}
              subtext="All roles, all conversations"
            />
          </div>

          {/* Middle: prompt performance + recent feedback */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PromptPerformanceCard prompts={data.per_prompt} />
            <RecentFeedbackCard
              events={data.recent_feedback}
              onDeepLink={onDeepLink}
            />
          </div>

          {/* Bottom: conversation quality ranking */}
          <ConversationRankingCard
            topPositive={data.top_positive}
            topNegative={data.top_negative}
            onDeepLink={onDeepLink}
          />
        </>
      )}
    </div>
  );
}

// ── Metric card ────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext: string;
  accent?: 'gold';
}) {
  return (
    <Card
      className={cn(
        'border-[#9BB7D4]/40',
        accent === 'gold' && 'border-[#C9A84C] bg-[#C9A84C]/5',
      )}
    >
      <CardContent className="py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            'mt-1 text-3xl font-bold tracking-tight',
            accent === 'gold' ? 'text-[#C9A84C]' : 'text-foreground',
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
      </CardContent>
    </Card>
  );
}

// ── Prompt performance ────────────────────────────────────────────

function PromptPerformanceCard({ prompts }: { prompts: PromptStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coaching prompt performance</CardTitle>
        <CardDescription>
          Responses generated per prompt and how they were rated
        </CardDescription>
      </CardHeader>
      <CardContent>
        {prompts.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No assistant responses yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt</TableHead>
                <TableHead className="w-20 text-right">Responses</TableHead>
                <TableHead className="w-24 text-right">Positive %</TableHead>
                <TableHead className="w-20 text-right">Negative</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.map((p) => {
                const hasFeedback = p.positive + p.negative > 0;
                return (
                  <TableRow key={p.prompt_id ?? '__untagged__'}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.version !== null && (
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          v{p.version}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{p.responses}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium',
                        hasFeedback && p.positive_rate >= 0.8
                          ? 'text-[#C9A84C]'
                          : !hasFeedback
                            ? 'text-muted-foreground'
                            : 'text-foreground',
                      )}
                    >
                      {hasFeedback ? formatPercent(p.positive_rate) : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right',
                        p.negative > 0 ? 'text-[#C2185B]' : 'text-muted-foreground',
                      )}
                    >
                      {p.negative}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recent feedback ───────────────────────────────────────────────

function RecentFeedbackCard({
  events,
  onDeepLink,
}: {
  events: RecentFeedbackEvent[];
  onDeepLink: (conversationId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent feedback</CardTitle>
        <CardDescription>
          Last {events.length} ratings from PMs · approximate (ordered by message time)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No feedback yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((e) => (
              <li
                key={e.message_id}
                className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3"
              >
                <span
                  className={cn(
                    'mt-0.5 shrink-0',
                    e.feedback === 'positive' ? 'text-[#C9A84C]' : 'text-[#C2185B]',
                  )}
                  aria-label={e.feedback === 'positive' ? 'Positive' : 'Negative'}
                  title={e.feedback === 'positive' ? 'Positive' : 'Negative'}
                >
                  {e.feedback === 'positive' ? (
                    <ThumbUpIcon />
                  ) : (
                    <ThumbDownIcon />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
                    {e.excerpt}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => onDeepLink(e.conversation_id)}
                      className="font-semibold text-[#1B4F72] hover:underline"
                    >
                      {e.conversation_title?.trim() || '(untitled)'}
                    </button>
                    <span>·</span>
                    <span>{formatRelative(new Date(e.created_at))}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Conversation ranking ──────────────────────────────────────────

function ConversationRankingCard({
  topPositive,
  topNegative,
  onDeepLink,
}: {
  topPositive: ConversationStat[];
  topNegative: ConversationStat[];
  onDeepLink: (conversationId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conversation quality ranking</CardTitle>
        <CardDescription>
          Click a row to jump to that conversation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RankingColumn
            label="Top rated"
            empty="No positively rated conversations yet."
            tone="positive"
            items={topPositive}
            onDeepLink={onDeepLink}
          />
          <RankingColumn
            label="Lowest rated"
            empty="No negatively rated conversations yet."
            tone="negative"
            items={topNegative}
            onDeepLink={onDeepLink}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function RankingColumn({
  label,
  empty,
  tone,
  items,
  onDeepLink,
}: {
  label: string;
  empty: string;
  tone: 'positive' | 'negative';
  items: ConversationStat[];
  onDeepLink: (id: string) => void;
}) {
  const borderClass =
    tone === 'positive'
      ? 'border-l-[#C9A84C]'
      : 'border-l-[#C2185B]/60';
  const scoreClass =
    tone === 'positive' ? 'text-[#C9A84C]' : 'text-[#C2185B]';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((c) => {
            const score = tone === 'positive' ? c.positive : c.negative;
            return (
              <li key={c.conversation_id}>
                <button
                  type="button"
                  onClick={() => onDeepLink(c.conversation_id)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-md border-l-4 bg-background/40 py-2 pl-3 pr-2 text-left transition-colors hover:bg-muted',
                    borderClass,
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-[#1B4F72]">
                      {c.title?.trim() || '(untitled)'}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {c.message_count} msg{c.message_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className={cn('shrink-0 text-sm font-bold', scoreClass)}>
                    {tone === 'positive' ? '+' : ''}
                    {score}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading insights">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="border-[#9BB7D4]/40">
            <CardContent className="py-5">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-7 w-20 animate-pulse rounded bg-muted/80" />
              <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted/60" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="py-5">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="mt-4 space-y-2">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-8 w-full animate-pulse rounded bg-muted/60" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Insights icons + helpers ───────────────────────────────────────

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block', spinning && 'animate-spin')}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
      <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return formatDate(date.toISOString());
}

// ──────────────────────────────────────────────────────────────────
// Documents tab (owner-only)
// ──────────────────────────────────────────────────────────────────

type DocumentRow = {
  id: string;
  filename: string;
  file_path: string;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  created_at: string;
  chunk_count: number | null;
};

function DocumentsTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: fetchErr } = await supabase
      .from('documents')
      .select('id, filename, file_path, status, created_at, chunk_count')
      .order('created_at', { ascending: false });
    if (fetchErr) {
      if (fetchErr.code === 'PGRST301') { onUnauthorized(); return; }
      setError(fetchErr.message);
    } else {
      setDocuments((data as DocumentRow[]) ?? []);
    }
    setIsLoading(false);
  }, [onUnauthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    setIsUploading(true);
    setUploadError(null);

    const uniqueName = `${crypto.randomUUID()}_${file.name}`;
    const path = `${user.id}/${uniqueName}`;

    const { error: storageErr } = await supabase.storage
      .from('documents')
      .upload(path, file);
    if (storageErr) {
      setUploadError(storageErr.message);
      setIsUploading(false);
      return;
    }

    const { error: dbErr } = await supabase
      .from('documents')
      .insert({ filename: file.name, file_path: path, status: 'uploaded' });
    if (dbErr) {
      // Storage succeeded but DB insert failed — remove the orphaned object.
      await supabase.storage.from('documents').remove([path]);
      setUploadError(dbErr.message);
      setIsUploading(false);
      return;
    }

    await refresh();
    setIsUploading(false);
  };

  const handleDelete = async (doc: DocumentRow) => {
    await supabase.storage.from('documents').remove([doc.file_path]);
    const { error: dbErr } = await supabase
      .from('documents')
      .delete()
      .eq('id', doc.id);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    await refresh();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            {documents.length} uploaded · owner-only knowledge base
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = '';
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {(error || uploadError) && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {uploadError ?? error}
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-40">Uploaded</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 && !isLoading && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No documents uploaded yet.
                </TableCell>
              </TableRow>
            )}
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.filename}</TableCell>
                <TableCell>
                  <DocumentStatusBadge status={doc.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(doc.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDelete(doc)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DocumentStatusBadge({ status }: { status: DocumentRow['status'] }) {
  if (status === 'ready') {
    return (
      <Badge className="border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]">
        ready
      </Badge>
    );
  }
  const variant =
    status === 'error'
      ? 'destructive'
      : status === 'processing'
        ? 'outline'
        : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

// ──────────────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variant: 'default' | 'secondary' | 'outline' =
    status === 'active'
      ? 'default'
      : status === 'archived'
        ? 'outline'
        : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
