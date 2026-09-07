import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  getDailyMessageLimit,
  getFeedbackLog,
  getInsights,
  getRecentMessages,
  getSpend,
  listConversations,
  listPrompts,
  listUsers,
  resetAllCredits,
  resetUserCredits,
  runRetrievalDebug,
  setDailyMessageLimit,
  updateConversationStatus,
  updatePrompt,
  type AdminUser,
  type CoachingPrompt,
  type ConversationDetail,
  type ConversationStat,
  type ConversationSummary,
  type FeedbackEntry,
  type InsightsResponse,
  type PromptStat,
  type RecentFeedbackEvent,
  type RecentMessage,
  type RetrievalDebugResponse,
  type SpendResponse,
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
            <TabsTrigger value="spend">Spend</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            {profile?.role === 'owner' && <TabsTrigger value="documents">Documents</TabsTrigger>}
            {profile?.role === 'owner' && <TabsTrigger value="rag-debug">RAG Debug</TabsTrigger>}
            {profile?.role === 'owner' && <TabsTrigger value="users">Users</TabsTrigger>}
            {profile?.role === 'owner' && <TabsTrigger value="settings">Settings</TabsTrigger>}
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
            <InsightsTab onUnauthorized={handleUnauthorized} onDeepLink={handleDeepLink} />
          </TabsContent>

          <TabsContent value="spend" className="mt-6">
            <SpendTab onUnauthorized={handleUnauthorized} />
          </TabsContent>

          <TabsContent value="feedback" className="mt-6">
            <FeedbackTab onUnauthorized={handleUnauthorized} />
          </TabsContent>

          {profile?.role === 'owner' && (
            <TabsContent value="documents" className="mt-6">
              <DocumentsTab onUnauthorized={handleUnauthorized} />
            </TabsContent>
          )}

          {profile?.role === 'owner' && (
            <TabsContent value="rag-debug" className="mt-6">
              <RagDebugTab onUnauthorized={handleUnauthorized} />
            </TabsContent>
          )}

          {profile?.role === 'owner' && (
            <TabsContent value="users" className="mt-6">
              <UsersTab onUnauthorized={handleUnauthorized} />
            </TabsContent>
          )}

          {profile?.role === 'owner' && (
            <TabsContent value="settings" className="mt-6">
              <SettingsTab onUnauthorized={handleUnauthorized} />
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
  const [expandedDetail, setExpandedDetail] = useState<ConversationDetail | null>(null);
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
          <CardDescription>{conversations.length} total · click a row to expand</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
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
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
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
                      <div className="line-clamp-1">{c.title ?? '(untitled)'}</div>
                      {c.first_message && (
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {c.first_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{c.message_count}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(c.created_at)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
                            <p className="text-sm text-muted-foreground">Loading messages...</p>
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
                                    m.role === 'user' ? 'bg-secondary/30' : 'bg-background'
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
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
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
            <DialogTitle>{form?.mode === 'create' ? 'Create Prompt' : 'Edit Prompt'}</DialogTitle>
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
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ada v2 - Discovery Coach"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prompt-text">Prompt text</Label>
                <Textarea
                  id="prompt-text"
                  value={form.prompt_text}
                  onChange={(e) => setForm({ ...form, prompt_text: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                  {isSaving ? 'Saving...' : form.mode === 'create' ? 'Create' : 'Save changes'}
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
        prompt.is_active ? 'border-[#B8853A] bg-accent/5' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{prompt.name}</h3>
            <span className="text-xs text-muted-foreground">v{prompt.version}</span>
            {prompt.is_active && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#B8853A] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0A0A0A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0A0A0A]" />
                Active
              </span>
            )}
          </div>
          {prompt.notes && <p className="mt-1 text-xs text-muted-foreground">{prompt.notes}</p>}
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
            title={prompt.is_active ? 'Cannot delete the active prompt' : undefined}
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

  const isEmpty = data && data.totals.assistant_messages === 0 && data.totals.feedback_count === 0;

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
              <p className="text-sm font-semibold text-destructive">Could not load insights</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
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
            <p className="text-sm font-medium text-foreground">No feedback data yet.</p>
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
            <RecentFeedbackCard events={data.recent_feedback} onDeepLink={onDeepLink} />
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
      className={cn('border-[#B8853A]/40', accent === 'gold' && 'border-[#B8853A] bg-[#B8853A]/5')}
    >
      <CardContent className="py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            'mt-1 text-3xl font-bold tracking-tight',
            accent === 'gold' ? 'text-[#B8853A]' : 'text-foreground'
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
        <CardDescription>Responses generated per prompt and how they were rated</CardDescription>
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
                          ? 'text-[#B8853A]'
                          : !hasFeedback
                            ? 'text-muted-foreground'
                            : 'text-foreground'
                      )}
                    >
                      {hasFeedback ? formatPercent(p.positive_rate) : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right',
                        p.negative > 0 ? 'text-[#A93226]' : 'text-muted-foreground'
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
          <p className="py-6 text-center text-xs text-muted-foreground">No feedback yet.</p>
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
                    e.feedback === 'positive' ? 'text-[#B8853A]' : 'text-[#A93226]'
                  )}
                  aria-label={e.feedback === 'positive' ? 'Positive' : 'Negative'}
                  title={e.feedback === 'positive' ? 'Positive' : 'Negative'}
                >
                  {e.feedback === 'positive' ? <ThumbUpIcon /> : <ThumbDownIcon />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
                    {e.excerpt}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => onDeepLink(e.conversation_id)}
                      className="font-semibold text-[#8B6324] hover:underline"
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
        <CardDescription>Click a row to jump to that conversation</CardDescription>
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
  const borderClass = tone === 'positive' ? 'border-l-[#B8853A]' : 'border-l-[#A93226]/60';
  const scoreClass = tone === 'positive' ? 'text-[#B8853A]' : 'text-[#A93226]';

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
                    borderClass
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-[#8B6324]">
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
          <Card key={i} className="border-[#B8853A]/40">
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
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
      if (fetchErr.code === 'PGRST301') {
        onUnauthorized();
        return;
      }
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

    const { error: storageErr } = await supabase.storage.from('documents').upload(path, file);
    if (storageErr) {
      setUploadError(storageErr.message);
      setIsUploading(false);
      return;
    }

    const { error: dbErr } = await supabase
      .from('documents')
      .insert({ user_id: user.id, filename: file.name, file_path: path, status: 'uploaded' });
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
    const { error: dbErr } = await supabase.from('documents').delete().eq('id', doc.id);
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
          <CardDescription>{documents.length} uploaded · owner-only knowledge base</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
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
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
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
                  <Button variant="outline" size="sm" onClick={() => void handleDelete(doc)}>
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
    return <Badge className="border-[#B8853A] bg-[#B8853A]/10 text-[#B8853A]">ready</Badge>;
  }
  const variant =
    status === 'error' ? 'destructive' : status === 'processing' ? 'outline' : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

// ──────────────────────────────────────────────────────────────────
// RAG Debug tab (owner-only) — for a test message, show which document
// chunks were retrieved and their cosine similarity scores.
// ──────────────────────────────────────────────────────────────────

function RagDebugTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [testMessage, setTestMessage] = useState('');
  const [threshold, setThreshold] = useState('0.6');
  const [matchCount, setMatchCount] = useState('3');
  const [result, setResult] = useState<RetrievalDebugResponse | null>(null);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      setRecentMessages(await getRecentMessages());
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      // Non-fatal — the free-text box still works without the picker.
    } finally {
      setIsLoadingRecent(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const handleRun = async (e: FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const parsedThreshold = parseFloat(threshold);
      const parsedCount = parseInt(matchCount, 10);
      const res = await runRetrievalDebug(
        testMessage.trim(),
        Number.isFinite(parsedThreshold) ? parsedThreshold : undefined,
        Number.isInteger(parsedCount) ? parsedCount : undefined
      );
      setResult(res);
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>RAG Debug</CardTitle>
          <CardDescription>
            Run a test message through live retrieval and see which document chunks come back, with
            their cosine similarity scores. Read-only — this does not affect production chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={handleRun} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rag-debug-message">Test message</Label>
              <Textarea
                id="rag-debug-message"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={8}
                placeholder="What should I do when a customer tells me they love my idea?"
                required
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="rag-debug-threshold">Similarity threshold</Label>
                <Input
                  id="rag-debug-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rag-debug-count">Match count</Label>
                <Input
                  id="rag-debug-count"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={matchCount}
                  onChange={(e) => setMatchCount(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <div>
              <Button
                type="submit"
                disabled={isRunning || !testMessage.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isRunning ? 'Running...' : 'Run retrieval'}
              </Button>
            </div>
          </form>

          {recentMessages.length > 0 && (
            <div className="mt-6 flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Or pick a recent message
              </p>
              <div className="flex flex-col gap-1.5">
                {recentMessages.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTestMessage(m.content)}
                    className="line-clamp-1 rounded-md border border-border bg-background/40 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {m.content}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isLoadingRecent && recentMessages.length === 0 && (
            <p className="mt-4 text-xs text-muted-foreground">Loading recent messages...</p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
            <CardDescription>
              {result.chunks.length} chunk{result.chunks.length === 1 ? '' : 's'} above threshold{' '}
              {result.threshold} · model {result.embedding_model} · match_count {result.match_count}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result.chunks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No chunks matched above this threshold.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead className="w-28">Similarity</TableHead>
                    <TableHead>Content</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.chunks.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono">{c.similarity.toFixed(3)}</TableCell>
                      <TableCell className="whitespace-pre-wrap text-sm leading-relaxed">
                        {c.content}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variant: 'default' | 'secondary' | 'outline' =
    status === 'active' ? 'default' : status === 'archived' ? 'outline' : 'secondary';
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

// ──────────────────────────────────────────────────────────────────
// Users tab (owner-only)
// ──────────────────────────────────────────────────────────────────

function UsersTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  // Two-step inline confirm for the bulk reset — first click arms it,
  // second click fires, and it disarms itself after a beat.
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
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

  const handleReset = async (id: string) => {
    setResettingId(id);
    try {
      const updated = await resetUserCredits(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      toast.success(`Credits reset for ${updated.email}`);
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      toast.error(`Reset failed: ${(err as Error).message}`);
    } finally {
      setResettingId(null);
    }
  };

  const handleResetAll = async () => {
    if (!confirmingAll) {
      setConfirmingAll(true);
      window.setTimeout(() => setConfirmingAll(false), 5000);
      return;
    }
    setConfirmingAll(false);
    setResettingAll(true);
    try {
      const count = await resetAllCredits();
      toast.success(`Credits reset for ${count} user${count === 1 ? '' : 's'}`);
      await refresh();
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      toast.error(`Reset all failed: ${(err as Error).message}`);
    } finally {
      setResettingAll(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            {users.length} total · reset credits to the current daily limit
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={confirmingAll ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => void handleResetAll()}
            disabled={resettingAll || isLoading || users.length === 0}
          >
            {resettingAll
              ? 'Resetting…'
              : confirmingAll
                ? `Really reset all ${users.length}?`
                : 'Reset all'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
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
              <TableHead>Email</TableHead>
              <TableHead className="w-32">Display name</TableHead>
              <TableHead className="w-24">Role</TableHead>
              <TableHead className="w-24 text-right">Credits</TableHead>
              <TableHead className="w-32">Last reset</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.display_name ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === 'owner' ? 'default' : 'outline'}>{u.role}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{u.credits_remaining}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.last_credit_reset}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resettingId === u.id}
                    onClick={() => void handleReset(u.id)}
                  >
                    {resettingId === u.id ? 'Resetting...' : 'Reset'}
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

// ──────────────────────────────────────────────────────────────────
// Settings tab (owner-only)
// ──────────────────────────────────────────────────────────────────

function SettingsTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [limit, setLimit] = useState<string>('');
  const [originalLimit, setOriginalLimit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const value = await getDailyMessageLimit();
      if (value !== null) {
        setLimit(String(value));
        setOriginalLimit(value);
      } else {
        setError('Could not read daily message limit.');
      }
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
    void load();
  }, [load]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(limit, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.error('Daily limit must be a non-negative integer.');
      return;
    }
    setIsSaving(true);
    try {
      await setDailyMessageLimit(parsed);
      setOriginalLimit(parsed);
      toast.success('Daily message limit saved.');
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = originalLimit !== null && limit !== '' && parseInt(limit, 10) !== originalLimit;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits & Limits</CardTitle>
        <CardDescription>Controls how many chat messages a user gets per day.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={handleSave} className="flex max-w-sm flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="daily-message-limit">Daily message limit per user</Label>
            <Input
              id="daily-message-limit"
              type="number"
              min={0}
              step={1}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              disabled={isLoading || isSaving}
              required
            />
            <p className="text-xs text-muted-foreground">0 = unlimited. Resets at midnight UTC.</p>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isLoading || isSaving || !isDirty}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Spend tab (Run 3) — model cost by day and call type, from model_usage
// ──────────────────────────────────────────────────────────────────

const MODEL_LABELS: Record<string, string> = {
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-sonnet-4-6': 'Sonnet 4.6',
};

function formatUsd(n: number): string {
  return `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
}

function SpendTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<SpendResponse | null>(null);
  const [days, setDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (windowDays: number) => {
      setIsLoading(true);
      setError(null);
      try {
        setData(await getSpend(windowDays));
      } catch (err) {
        if ((err as Error).name === 'UnauthorizedError') {
          onUnauthorized();
          return;
        }
        setError("Couldn't load spend data. Try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [onUnauthorized]
  );

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const modelCost = (model: string) =>
    data?.totals.by_model.find((m) => m.model === model)?.cost_usd ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Every production model call, priced all-in from{' '}
          <code className="rounded bg-muted px-1">model_usage</code>. Web-search cost is the
          separable component of market-grounding calls; it is already included in the model totals,
          not additional.
        </p>
        <div className="flex items-center gap-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              onClick={() => setDays(d)}
              disabled={isLoading}
            >
              {d}d
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            disabled={isLoading || !data || data.days.length === 0}
            onClick={() => {
              if (!data) return;
              const header =
                'date,call_type,model,calls,input_tokens,output_tokens,web_search_requests,cost_usd';
              const lines = data.days.flatMap((day) =>
                day.rows.map(
                  (r) =>
                    `${day.date},${r.call_type},${r.model},${r.calls},${r.input_tokens},${r.output_tokens},${r.web_search_requests},${r.cost_usd}`
                )
              );
              const blob = new Blob([[header, ...lines].join('\n')], {
                type: 'text/csv;charset=utf-8',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `ada-spend-${data.window_days}d.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading && (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading spend…</p>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load(days)}>
            Retry
          </Button>
        </div>
      )}

      {data && !isLoading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total ({data.window_days}d)</CardDescription>
                <CardTitle className="text-2xl">{formatUsd(data.totals.cost_usd)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {data.totals.calls} calls{data.truncated ? ' · window truncated' : ''}
                <span className="mt-0.5 block">
                  ≈ {formatUsd(data.totals.cost_usd / Math.max(data.window_days, 1))}/day ·{' '}
                  {formatUsd((data.totals.cost_usd / Math.max(data.window_days, 1)) * 30)}/mo run
                  rate
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Haiku 4.5</CardDescription>
                <CardTitle className="text-2xl">
                  {formatUsd(modelCost('claude-haiku-4-5'))}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                classification · summaries
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Sonnet 4.6</CardDescription>
                <CardTitle className="text-2xl">
                  {formatUsd(modelCost('claude-sonnet-4-6'))}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                mapping · grounding · blind spots · guides
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Web search</CardDescription>
                <CardTitle className="text-2xl">
                  {formatUsd(data.totals.web_search.cost_usd)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {data.totals.web_search.requests} searches · included in Sonnet total
                {data.totals.web_search.blended_rows > 0 &&
                  ` · ${data.totals.web_search.blended_rows} older call${
                    data.totals.web_search.blended_rows === 1 ? '' : 's'
                  } blended (count unrecorded)`}
              </CardContent>
            </Card>
          </div>

          {data.days.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No model calls in this window yet. Run a Discovery Sprint and the spend shows up
                here, priced per call.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By day and call type</CardTitle>
                <CardDescription>
                  All-in cost per row (tokens, plus $10/1k web searches where applicable).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Call type</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">In / out tokens</TableHead>
                      <TableHead className="text-right">Searches</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.days.flatMap((day) =>
                      day.rows.map((row, i) => (
                        <TableRow key={`${day.date}-${row.call_type}-${row.model}`}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {i === 0 ? day.date : ''}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.call_type.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {MODEL_LABELS[row.model] ?? row.model}
                          </TableCell>
                          <TableCell className="text-right">{row.calls}</TableCell>
                          <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                            {row.input_tokens.toLocaleString()} /{' '}
                            {row.output_tokens.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.web_search_requests > 0 ? row.web_search_requests : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatUsd(row.cost_usd)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Feedback tab ─────────────────────────────────────────────────────────────
// Read-only list of the unified user_feedback log (FAB/Settings submissions
// + message thumb events). Triage actions are a later backlog item.

// Feedback comments run from one line to several paragraphs. The cell shows
// the first four lines and expands to the full text on demand — no fixed
// container width, nothing silently cut off. The toggle only appears for
// comments long enough to actually clamp; the threshold is a character count
// rather than a measured height so no layout effect is needed.
const COMMENT_CLAMP_CHARS = 220;

function FeedbackComment({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return <span className="text-muted-foreground">—</span>;

  const clampable = text.length > COMMENT_CLAMP_CHARS || text.includes('\n');

  return (
    <div className="min-w-[22rem] max-w-[52rem] space-y-1">
      <p
        className={cn(
          'whitespace-pre-wrap break-words text-sm leading-relaxed',
          clampable && !expanded && 'line-clamp-4'
        )}
      >
        {text}
      </p>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-accent underline-offset-2 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show full comment'}
        </button>
      )}
    </div>
  );
}

function FeedbackTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [entries, setEntries] = useState<FeedbackEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setEntries(await getFeedbackLog());
    } catch (err) {
      if ((err as Error).name === 'UnauthorizedError') {
        onUnauthorized();
        return;
      }
      setError("Couldn't load the feedback log. Try again.");
    } finally {
      setIsLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const typeBadge = (e: FeedbackEntry) => {
    if (e.feedback_type === 'message_rating') {
      return <Badge variant="outline">{e.rating === 'up' ? '👍' : '👎'} rating</Badge>;
    }
    const label =
      e.feedback_type === 'bug' ? 'Bug' : e.feedback_type === 'praise' ? 'Praise' : 'Idea';
    return <Badge variant={e.feedback_type === 'bug' ? 'destructive' : 'secondary'}>{label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Everything users have sent through the feedback button, Settings, and message thumbs —
        newest first, latest 200.
      </p>

      {isLoading && (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading feedback…</p>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {entries && !isLoading && !error && entries.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing yet. The first submission will land here.
        </p>
      )}

      {entries && !isLoading && !error && entries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Comment</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Surface</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap align-top">{typeBadge(e)}</TableCell>
                <TableCell className="align-top">
                  <FeedbackComment text={e.comment} />
                </TableCell>
                <TableCell className="align-top text-sm">
                  <span className="whitespace-nowrap">
                    {e.user_display_name ??
                      e.user_email ??
                      (e.user_id ? e.user_id.slice(0, 8) : 'Deleted user')}
                  </span>
                  {e.is_deleted_user && (
                    <span className="block whitespace-nowrap text-xs text-muted-foreground">
                      account deleted · retained via tombstone
                    </span>
                  )}
                  {e.contact_email && (
                    <span className="block whitespace-nowrap text-xs font-medium text-[#8B6324]">
                      ↩ wants a reply: {e.contact_email}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top text-sm text-muted-foreground">
                  {e.source_surface}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top text-sm text-muted-foreground">
                  {new Date(e.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
