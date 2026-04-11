import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';
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
import {
  activatePrompt,
  clearAdminKey,
  createPrompt,
  deletePrompt,
  getAdminKey,
  getConversation,
  listConversations,
  listPrompts,
  setAdminKey,
  updateConversationStatus,
  updatePrompt,
  verifyAdminKey,
  type CoachingPrompt,
  type ConversationDetail,
  type ConversationSummary,
} from '@/lib/admin-api';

export default function Admin() {
  const [authed, setAuthed] = useState<boolean>(() => !!getAdminKey());

  const handleLogout = useCallback(() => {
    clearAdminKey();
    setAuthed(false);
  }, []);

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }

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
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="conversations" className="w-full">
          <TabsList>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="prompts">Coaching Prompts</TabsTrigger>
          </TabsList>

          <TabsContent value="conversations" className="mt-6">
            <ConversationsTab onUnauthorized={handleLogout} />
          </TabsContent>

          <TabsContent value="prompts" className="mt-6">
            <PromptsTab onUnauthorized={handleLogout} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Login screen
// ──────────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const ok = await verifyAdminKey(password);
      if (!ok) {
        setError('Incorrect password.');
        return;
      }
      setAdminKey(password);
      onSuccess();
    } catch {
      setError('Could not reach the admin service. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            Admin Access
          </p>
          <CardTitle>
            <span className="gradient-text">Ada</span> Control Panel
          </CardTitle>
          <CardDescription>
            Enter the admin password to manage conversations and prompts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={!password || isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? 'Checking...' : 'Enter'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Conversations tab
// ──────────────────────────────────────────────────────────────────

function ConversationsTab({ onUnauthorized }: { onUnauthorized: () => void }) {
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
