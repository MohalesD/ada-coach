// Discovery dashboard (Run 2): the PM's products, one card each, with
// sprint history and a resume card pinned on top when a sprint is open
// (PRD post-action experience). Creation flows open in place over the
// dashboard (Locality-First: no route detour for a local task).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, FileText, Globe, MoreVertical, Play, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createProduct,
  listProducts,
  listSessions,
  renameProduct,
  startSession,
} from '@/lib/discovery-api';
import { GOAL_LABELS } from '@/components/discovery/CoveragePath';
import type { Product, Session } from '@/types/discovery';

const INTAKE_MAX = 50_000;

export default function Discovery() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [intakeFor, setIntakeFor] = useState<Product | null>(null);
  const [intake, setIntake] = useState('');
  const [starting, setStarting] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [p, s] = await Promise.all([listProducts(), listSessions()]);
      setProducts(p);
      setSessions(s);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const startRename = (p: Product) => {
    setRenamingId(p.id);
    setRenamingValue(p.name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenamingValue('');
  };

  const commitRename = async () => {
    const id = renamingId;
    if (!id) return;
    const current = products.find((p) => p.id === id);
    const next = renamingValue.trim();
    setRenamingId(null);
    setRenamingValue('');

    if (!next || !current || next === current.name) return;

    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, name: next } : p)));
    try {
      await renameProduct(id, next);
    } catch {
      toast.error("Couldn't rename the product. Please try again.");
      void load();
    }
  };

  const sessionsByProduct = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const list = map.get(s.product_id) ?? [];
      list.push(s);
      map.set(s.product_id, list);
    }
    return map;
  }, [sessions]);

  const openSprints = useMemo(() => sessions.filter((s) => s.status === 'in_progress'), [sessions]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Product';

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const product = await createProduct(name, newDescription.trim() || undefined);
      setProducts((prev) => [product, ...prev]);
      setNewOpen(false);
      setNewName('');
      setNewDescription('');
      toast.success(`"${product.name}" is ready. Start a sprint when you are.`);
    } catch {
      toast.error("Couldn't create the product. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleStart = async () => {
    if (!intakeFor) return;
    const text = intake.trim();
    if (!text) return;
    setStarting(true);
    try {
      const { session, resumed } = await startSession(intakeFor.id, text);
      if (resumed) {
        toast.info('This product already has an open sprint — picking it back up.');
      }
      navigate(`/sprint/${session.id}`);
    } catch {
      toast.error("Couldn't start the sprint. Please try again.");
      setStarting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ArrowLeft size={15} aria-hidden />
              Chat
            </Link>
            <h1 className="font-display text-xl font-semibold tracking-tight">
              <span className="gradient-text">Ada</span>{' '}
              <span className="text-sm font-medium text-muted-foreground">· Discovery Sprints</span>
            </h1>
          </div>
          {products.length > 0 && (
            <Button onClick={() => setNewOpen(true)} size="sm" className="gap-1.5">
              <Plus size={15} aria-hidden />
              New product
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {loading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading your products…</p>
        )}

        {!loading && loadError && (
          <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-center">
            <p className="text-sm text-destructive">
              Couldn't load your products. Your work is safe — this is just a connection hiccup.
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

        {/* Resume cards — pinned first, the PRD's re-entry point */}
        {!loading && !loadError && openSprints.length > 0 && (
          <section aria-label="Open sprints" className="mb-8 space-y-2">
            {openSprints.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(`/sprint/${s.id}`)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-accent/60 bg-secondary/50 px-5 py-4 text-left transition-colors hover:border-accent hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
                    Resume sprint
                  </p>
                  <p className="mt-0.5 font-display text-lg font-semibold text-foreground">
                    {productName(s.product_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Picking up at:{' '}
                    {s.current_phase
                      ? GOAL_LABELS[s.current_phase].toLowerCase()
                      : (s.current_step ?? 'getting started').replace(/_/g, ' ')}{' '}
                    · started{' '}
                    {new Date(s.created_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <Play size={20} className="shrink-0 text-primary" aria-hidden />
              </button>
            ))}
          </section>
        )}

        {/* Empty state (PRD: "Create your first product") */}
        {!loading && !loadError && products.length === 0 && (
          <div className="mx-auto max-w-md py-14 text-center">
            <Compass size={40} strokeWidth={1.5} className="mx-auto text-accent" aria-hidden />
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              Create your first product
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A product is the idea you're pressure-testing. Every Discovery Sprint, assumption, and
              report hangs off it — and Ada remembers what you learned between sprints.
            </p>
            <Button className="mt-5 gap-1.5" onClick={() => setNewOpen(true)}>
              <Plus size={15} aria-hidden />
              New product
            </Button>
          </div>
        )}

        {/* Product cards */}
        {!loading && !loadError && products.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((p) => {
              const list = sessionsByProduct.get(p.id) ?? [];
              const completed = list.filter((s) => s.status === 'completed');
              const open = list.find((s) => s.status === 'in_progress');
              return (
                <div
                  key={p.id}
                  className="group/card flex flex-col rounded-xl border border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    {renamingId === p.id ? (
                      <Input
                        ref={renameInputRef}
                        value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void commitRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        maxLength={200}
                        aria-label="Product name"
                        className="h-8 font-display text-lg font-semibold tracking-tight"
                      />
                    ) : (
                      <h3
                        className="font-display text-lg font-semibold tracking-tight text-foreground"
                        onDoubleClick={() => startRename(p)}
                        title="Double-click to rename"
                      >
                        {p.name}
                      </h3>
                    )}
                    {renamingId !== p.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 data-[state=open]:opacity-100 hover:bg-muted hover:text-foreground"
                            aria-label="Product actions"
                          >
                            <MoreVertical size={15} aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onSelect={() => startRename(p)}>
                            Rename
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {list.length === 0
                      ? 'No sprints yet'
                      : `${list.length} sprint${list.length === 1 ? '' : 's'} · ${completed.length} completed`}
                  </p>

                  {completed.length > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                      {completed.slice(0, 3).map((s) => (
                        <li key={s.id}>
                          <Link
                            to={`/report/${s.id}`}
                            className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                          >
                            <FileText size={13} aria-hidden />
                            Report ·{' '}
                            {new Date(s.completed_at ?? s.created_at).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 flex-1" />
                  <div className="flex flex-col gap-2">
                    {open ? (
                      <Button
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => navigate(`/sprint/${open.id}`)}
                      >
                        <Play size={15} aria-hidden />
                        Resume sprint
                      </Button>
                    ) : (
                      <Button
                        className="gap-1.5"
                        onClick={() => {
                          setIntakeFor(p);
                          setIntake('');
                        }}
                      >
                        <Compass size={15} aria-hidden />
                        Start Discovery Sprint
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => navigate(`/product/${p.id}/intel`)}
                    >
                      <Globe size={15} aria-hidden />
                      Market & competitors
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New product dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">New product</DialogTitle>
            <DialogDescription>
              Name the idea you want to pressure-test. You can start a sprint right after.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Product name"
              maxLength={200}
              aria-label="Product name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
            />
            <Textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="One or two sentences on what it is (optional)"
              rows={3}
              maxLength={2000}
              aria-label="Product description"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreate()} disabled={!newName.trim() || creating}>
              {creating ? 'Creating…' : 'Create product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Intake dialog — the sprint starts from the product it belongs to */}
      <Dialog
        open={intakeFor !== null}
        onOpenChange={(open) => {
          if (!open) setIntakeFor(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              Start a Discovery Sprint — {intakeFor?.name}
            </DialogTitle>
            <DialogDescription>
              What's the idea, or where are you stuck? Ada reads this to meet you where you actually
              are — fresh idea and mid-discovery get coached differently.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Textarea
              value={intake}
              onChange={(e) => setIntake(e.target.value.slice(0, INTAKE_MAX))}
              placeholder="e.g. I think early-stage PMs would pay for an AI coach that pressure-tests their ideas, but after three interviews I'm not sure the pain is real…"
              rows={6}
              aria-label="Sprint intake"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {intake.length.toLocaleString()} / {INTAKE_MAX.toLocaleString()}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => void handleStart()} disabled={!intake.trim() || starting}>
              {starting ? 'Ada is reading…' : 'Begin the sprint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
