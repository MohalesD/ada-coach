import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export type ConversationListItem = {
  id: string;
  title: string | null;
  updated_at: string;
  is_pinned: boolean;
};

const UNDO_DURATION_MS = 7000;

// Pure filtering function — no side effects, no DB calls.
// Returns items whose display title contains `query` (case-insensitive).
// Pinned items that match always appear before unpinned items that match.
export function filterConversations(
  items: ConversationListItem[],
  query: string
): ConversationListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((c) => (c.title?.trim() || '(untitled)').toLowerCase().includes(q));
}

type Props = {
  currentConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onArchived: (id: string) => void;
  refreshKey: number;
};

export default function ConversationSidebar({
  currentConversationId,
  onSelect,
  onNew,
  onArchived,
  refreshKey,
}: Props) {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [search, setSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error: queryErr } = await supabase
      .from('conversations')
      .select('id, title, updated_at, is_pinned')
      .eq('status', 'active')
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    if (queryErr) {
      console.error('sidebar list error:', queryErr);
      setError('Could not load conversations.');
      setIsLoading(false);
      return;
    }
    setItems((data ?? []) as ConversationListItem[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const startRename = (item: ConversationListItem) => {
    setEditingId(item.id);
    setEditingValue(item.title ?? '');
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const commitRename = async () => {
    if (!editingId) return;
    const next = editingValue.trim();
    const id = editingId;
    setEditingId(null);
    setEditingValue('');

    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, title: next || null } : c)));

    const { error: updErr } = await supabase
      .from('conversations')
      .update({ title: next || null })
      .eq('id', id);

    if (updErr) {
      console.error('rename error:', updErr);
      void refresh();
    }
  };

  const archiveConversation = async (id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    onArchived(id);

    const { error: updErr } = await supabase
      .from('conversations')
      .update({ status: 'archived' })
      .eq('id', id);

    if (updErr) {
      console.error('archive error:', updErr);
      void refresh();
    }
  };

  const togglePin = async (id: string, currentlyPinned: boolean) => {
    const next = !currentlyPinned;

    setItems((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, is_pinned: next } : c));
      return [...updated.filter((c) => c.is_pinned), ...updated.filter((c) => !c.is_pinned)];
    });

    const { error: updErr } = await supabase
      .from('conversations')
      .update({ is_pinned: next })
      .eq('id', id);

    if (updErr) {
      console.error('pin error:', updErr);
      void refresh();
    }
  };

  // ─── Selection mode ─────────────────────────────────────────────────────────

  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Smart pin/unpin: if any selected item is unpinned, the action pins all.
  // If every selected item is already pinned, the action unpins all.
  const selectedItems = items.filter((c) => selectedIds.has(c.id));
  const anyUnpinnedSelected = selectedItems.some((c) => !c.is_pinned);
  const bulkPinTargetState = anyUnpinnedSelected; // true → set is_pinned = true

  const bulkTogglePin = async () => {
    if (selectedItems.length === 0 || isBulkBusy) return;
    setIsBulkBusy(true);

    // Only flip the ones that actually need flipping (smart toggle).
    const idsToFlip = selectedItems
      .filter((c) => c.is_pinned !== bulkPinTargetState)
      .map((c) => c.id);

    if (idsToFlip.length === 0) {
      setIsBulkBusy(false);
      return;
    }

    setItems((prev) => {
      const updated = prev.map((c) =>
        idsToFlip.includes(c.id) ? { ...c, is_pinned: bulkPinTargetState } : c
      );
      return [...updated.filter((c) => c.is_pinned), ...updated.filter((c) => !c.is_pinned)];
    });

    const { error: updErr } = await supabase
      .from('conversations')
      .update({ is_pinned: bulkPinTargetState })
      .in('id', idsToFlip);

    if (updErr) {
      console.error('bulk pin error:', updErr);
      toast.error('Could not update pin state. Please try again.');
      void refresh();
    } else {
      toast.success(
        `${idsToFlip.length} conversation${idsToFlip.length === 1 ? '' : 's'} ${
          bulkPinTargetState ? 'pinned' : 'unpinned'
        }.`
      );
    }

    setIsBulkBusy(false);
    exitSelectionMode();
  };

  const undoBulkArchive = async (idsToRestore: string[]) => {
    const { error: undoErr } = await supabase
      .from('conversations')
      .update({ status: 'active' })
      .in('id', idsToRestore);

    if (undoErr) {
      console.error('undo archive error:', undoErr);
      toast.error('Could not restore conversations.');
      return;
    }
    toast.success(
      `${idsToRestore.length} conversation${idsToRestore.length === 1 ? '' : 's'} restored.`
    );
    void refresh();
  };

  const performBulkArchive = async () => {
    if (selectedItems.length === 0 || isBulkBusy) return;
    setIsBulkBusy(true);
    setArchiveConfirmOpen(false);

    // Snapshot the selection — this is exactly what we'll un-archive on undo.
    const idsArchived = selectedItems.map((c) => c.id);
    const includesActive =
      currentConversationId !== null && idsArchived.includes(currentConversationId);

    setItems((prev) => prev.filter((c) => !idsArchived.includes(c.id)));
    if (includesActive && currentConversationId) onArchived(currentConversationId);

    const { error: updErr } = await supabase
      .from('conversations')
      .update({ status: 'archived' })
      .in('id', idsArchived);

    if (updErr) {
      console.error('bulk archive error:', updErr);
      toast.error('Could not archive conversations. Please try again.');
      void refresh();
      setIsBulkBusy(false);
      return;
    }

    toast(`${idsArchived.length} conversation${idsArchived.length === 1 ? '' : 's'} archived.`, {
      duration: UNDO_DURATION_MS,
      action: {
        label: 'Undo',
        onClick: () => void undoBulkArchive(idsArchived),
      },
    });

    setIsBulkBusy(false);
    exitSelectionMode();
  };

  const filtered = filterConversations(items, search);
  const pinned = filtered.filter((c) => c.is_pinned);
  const unpinned = filtered.filter((c) => !c.is_pinned);

  const rowProps = (item: ConversationListItem) => ({
    item,
    isActive: item.id === currentConversationId,
    isEditing: editingId === item.id,
    editingValue,
    setEditingValue,
    onRowClick: () => onSelect(item.id),
    onStartRename: () => startRename(item),
    onCancelRename: cancelRename,
    onCommitRename: () => void commitRename(),
    onArchive: () => void archiveConversation(item.id),
    onTogglePin: () => void togglePin(item.id, item.is_pinned),
    selectionMode,
    isSelected: selectedIds.has(item.id),
    onToggleSelect: () => toggleSelected(item.id),
  });

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
      {/* New conversation + Select toggle */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button
          onClick={onNew}
          size="sm"
          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={selectionMode}
        >
          + New Conversation
        </Button>
        <Button
          onClick={selectionMode ? exitSelectionMode : enterSelectionMode}
          size="sm"
          variant={selectionMode ? 'default' : 'outline'}
          className="shrink-0"
          aria-pressed={selectionMode}
          title={selectionMode ? 'Exit selection mode' : 'Select multiple conversations'}
        >
          {selectionMode ? 'Done' : 'Select'}
        </Button>
      </div>

      {/* Search input */}
      <div className="border-b border-border px-3 py-2">
        <div className="relative flex items-center">
          {/* Search icon */}
          <svg
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className={cn(
              'w-full rounded-md bg-background/60 py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground',
              'border border-transparent transition-colors',
              'focus:border-[#9BB7D4]/60 focus:outline-none focus:ring-0',
              search && 'border-[#9BB7D4]/30'
            )}
          />

          {/* Clear button */}
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Loading skeleton */}
        {isLoading && <SkeletonRows />}

        {/* Error */}
        {!isLoading && error && (
          <p className="px-3 py-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* Empty — no conversations at all */}
        {!isLoading && !error && items.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No past conversations yet.</p>
        )}

        {/* Empty — search returned no matches */}
        {!isLoading && !error && items.length > 0 && filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No conversations match your search.
          </p>
        )}

        {/* Pinned section */}
        {pinned.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Pinned
            </p>
            {pinned.map((item) => (
              <Row key={item.id} {...rowProps(item)} />
            ))}
            {unpinned.length > 0 && <div className="my-2 border-t border-border" />}
          </>
        )}

        {/* Unpinned list */}
        {unpinned.map((item) => (
          <Row key={item.id} {...rowProps(item)} />
        ))}
      </div>

      {/* Bulk action bar */}
      {selectionMode && selectedItems.length > 0 && (
        <div className="border-t border-border bg-background px-3 py-2.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {selectedItems.length} selected
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void bulkTogglePin()}
              disabled={isBulkBusy}
              className="text-xs"
            >
              {bulkPinTargetState ? 'Pin all' : 'Unpin all'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setArchiveConfirmOpen(true)}
              disabled={isBulkBusy}
              className="text-xs text-destructive hover:text-destructive"
            >
              Archive
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={exitSelectionMode}
              disabled={isBulkBusy}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Archive confirmation */}
      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {selectedItems.length} conversation
              {selectedItems.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They'll be hidden from your sidebar. You can restore them within 7 seconds via the
              Undo toast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void performBulkArchive()}
              disabled={isBulkBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="space-y-1 px-1 py-1" aria-busy="true" aria-label="Loading conversations">
      {[60, 80, 45, 70, 55].map((w, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-lg px-3 py-2">
          <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
          <div className="h-2 w-20 animate-pulse rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

// ─── Pin icon ─────────────────────────────────────────────────────────────────

function PinIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={active ? '#C9A84C' : 'none'}
      stroke={active ? '#C9A84C' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({
  item,
  isActive,
  isEditing,
  editingValue,
  setEditingValue,
  onRowClick,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onArchive,
  onTogglePin,
  selectionMode,
  isSelected,
  onToggleSelect,
}: {
  item: ConversationListItem;
  isActive: boolean;
  isEditing: boolean;
  editingValue: string;
  setEditingValue: (v: string) => void;
  onRowClick: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onArchive: () => void;
  onTogglePin: () => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelRename();
    }
  };

  const handleRowClick = (e: MouseEvent) => {
    if (isEditing) return;
    if (selectionMode) {
      onToggleSelect();
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('[data-menu-trigger]') || target.closest('[data-pin-trigger]')) return;
    onRowClick();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      className={cn(
        'group mb-1 flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
        selectionMode && isSelected
          ? 'bg-[#9BB7D4]/15 text-foreground'
          : isActive
            ? 'bg-primary/10 text-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {selectionMode && (
        <div
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={isSelected ? 'Deselect conversation' : 'Select conversation'}
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={handleKey}
            onClick={(e) => e.stopPropagation()}
            className="h-7 text-sm"
          />
        ) : (
          <>
            <p
              className="truncate"
              onDoubleClick={selectionMode ? undefined : onStartRename}
              title={selectionMode ? undefined : 'Double-click to rename'}
            >
              {item.title?.trim() || '(untitled)'}
            </p>
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {formatDate(item.updated_at)}
            </p>
          </>
        )}
      </div>

      {!isEditing && !selectionMode && (
        <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-pin-trigger
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={cn(
              'rounded p-1 transition-opacity',
              item.is_pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
            aria-label={item.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
            title={item.is_pinned ? 'Unpin' : 'Pin'}
          >
            <PinIcon active={item.is_pinned} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-menu-trigger
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 hover:text-foreground"
                aria-label="Conversation actions"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13" r="1.5" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onSelect={onTogglePin}>
                {item.is_pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onStartRename}>Rename</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onArchive}
                className="text-destructive focus:text-destructive"
              >
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Pinned indicator stays visible in selection mode (read-only) */}
      {!isEditing && selectionMode && item.is_pinned && (
        <div className="mt-0.5 shrink-0 p-1">
          <PinIcon active={true} />
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
