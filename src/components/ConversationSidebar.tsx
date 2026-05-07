import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  folder_id: string | null;
};

export type FolderListItem = {
  id: string;
  name: string;
};

const UNDO_DURATION_MS = 7000;

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
  const [folders, setFolders] = useState<FolderListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderValue, setEditingFolderValue] = useState('');
  const [search, setSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [pendingMoveChatId, setPendingMoveChatId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  const [activeDragChatId, setActiveDragChatId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const refresh = useCallback(async () => {
    setError(null);
    const [convResult, folderResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, title, updated_at, is_pinned, folder_id')
        .eq('status', 'active')
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false }),
      supabase.from('folders').select('id, name').order('created_at', { ascending: true }),
    ]);

    if (convResult.error) {
      console.error('sidebar list error:', convResult.error);
      setError('Could not load conversations.');
      setIsLoading(false);
      return;
    }
    if (folderResult.error) {
      console.error('sidebar folders error:', folderResult.error);
    }

    setItems((convResult.data ?? []) as ConversationListItem[]);
    setFolders((folderResult.data ?? []) as FolderListItem[]);
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

  const moveChatToFolder = useCallback(
    async (chatId: string, targetFolderId: string | null) => {
      const current = items.find((c) => c.id === chatId);
      if (!current) return;
      if (current.folder_id === targetFolderId) return;

      setItems((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, folder_id: targetFolderId } : c))
      );
      if (targetFolderId) {
        setExpandedFolderIds((prev) => {
          if (prev.has(targetFolderId)) return prev;
          const next = new Set(prev);
          next.add(targetFolderId);
          return next;
        });
      }

      const { error: updErr } = await supabase
        .from('conversations')
        .update({ folder_id: targetFolderId })
        .eq('id', chatId);

      if (updErr) {
        console.error('move-to-folder error:', updErr);
        toast.error('Could not move conversation. Please try again.');
        void refresh();
        return;
      }

      const targetFolder = folders.find((f) => f.id === targetFolderId);
      toast.success(targetFolder ? `Moved to "${targetFolder.name}".` : 'Removed from folder.');
    },
    [items, folders, refresh]
  );

  const createFolder = async (rawName: string, andMoveChatId: string | null) => {
    const name = rawName.trim();
    if (!name) {
      toast.error('Folder name cannot be empty.');
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast.error('You must be signed in to create folders.');
      return;
    }

    const { data, error: insertErr } = await supabase
      .from('folders')
      .insert({ name, user_id: userId })
      .select('id, name')
      .single();

    if (insertErr || !data) {
      console.error('create folder error:', insertErr);
      toast.error('Could not create folder. Please try again.');
      return;
    }

    setFolders((prev) => [...prev, data as FolderListItem]);
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      next.add(data.id);
      return next;
    });
    toast.success(`Folder "${data.name}" created.`);

    if (andMoveChatId) {
      await moveChatToFolder(andMoveChatId, data.id);
    }
  };

  const startFolderRename = (folder: FolderListItem) => {
    setEditingFolderId(folder.id);
    setEditingFolderValue(folder.name);
  };

  const cancelFolderRename = () => {
    setEditingFolderId(null);
    setEditingFolderValue('');
  };

  const commitFolderRename = async () => {
    if (!editingFolderId) return;
    const next = editingFolderValue.trim();
    const id = editingFolderId;
    setEditingFolderId(null);
    setEditingFolderValue('');

    if (!next) {
      toast.error('Folder name cannot be empty.');
      void refresh();
      return;
    }

    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: next } : f)));

    const { error: updErr } = await supabase.from('folders').update({ name: next }).eq('id', id);
    if (updErr) {
      console.error('folder rename error:', updErr);
      toast.error('Could not rename folder.');
      void refresh();
    }
  };

  const deleteFolder = async (id: string) => {
    const folder = folders.find((f) => f.id === id);
    setDeleteFolderId(null);

    setFolders((prev) => prev.filter((f) => f.id !== id));
    setItems((prev) => prev.map((c) => (c.folder_id === id ? { ...c, folder_id: null } : c)));

    const { error: delErr } = await supabase.from('folders').delete().eq('id', id);
    if (delErr) {
      console.error('delete folder error:', delErr);
      toast.error('Could not delete folder.');
      void refresh();
      return;
    }
    toast.success(folder ? `Folder "${folder.name}" deleted.` : 'Folder deleted.');
  };

  const toggleFolderExpanded = (id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const selectedItems = items.filter((c) => selectedIds.has(c.id));
  const anyUnpinnedSelected = selectedItems.some((c) => !c.is_pinned);
  const bulkPinTargetState = anyUnpinnedSelected;

  const bulkTogglePin = async () => {
    if (selectedItems.length === 0 || isBulkBusy) return;
    setIsBulkBusy(true);

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
  const unfiled = filtered.filter((c) => !c.is_pinned && !c.folder_id);
  const chatsByFolder = useMemo(() => {
    const map = new Map<string, ConversationListItem[]>();
    for (const f of folders) map.set(f.id, []);
    for (const c of filtered) {
      if (c.folder_id && map.has(c.folder_id)) {
        map.get(c.folder_id)!.push(c);
      }
    }
    return map;
  }, [filtered, folders]);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragChatId(null);
    const { active, over } = event;
    if (!over) return;
    // active.id format: `chat:<section>:<chatId>` — chat id is the last segment.
    const parts = String(active.id).split(':');
    const chatId = parts[parts.length - 1];
    const overId = String(over.id);
    if (overId.startsWith('folder:')) {
      const folderId = overId.replace(/^folder:/, '');
      void moveChatToFolder(chatId, folderId);
    } else if (overId === 'unfiled') {
      void moveChatToFolder(chatId, null);
    }
  };

  // sectionKey disambiguates the draggable id when the same chat renders in
  // two places (e.g. a pinned chat that also lives inside a folder).
  const rowProps = (item: ConversationListItem, sectionKey: string) => ({
    item,
    folders,
    sectionKey,
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
    onMoveToFolder: (folderId: string | null) => void moveChatToFolder(item.id, folderId),
    onRequestNewFolder: () => {
      setPendingMoveChatId(item.id);
      setNewFolderName('');
      setNewFolderDialogOpen(true);
    },
    selectionMode,
    isSelected: selectedIds.has(item.id),
    onToggleSelect: () => toggleSelected(item.id),
    isBeingDragged: activeDragChatId === item.id,
  });

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        const parts = String(e.active.id).split(':');
        setActiveDragChatId(parts[parts.length - 1]);
      }}
      onDragCancel={() => setActiveDragChatId(null)}
      onDragEnd={handleDragEnd}
    >
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
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

        <div className="border-b border-border px-3 py-2">
          <div className="relative flex items-center">
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

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading && <SkeletonRows />}

          {!isLoading && error && (
            <p className="px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          {!isLoading && !error && items.length === 0 && folders.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No past conversations yet.</p>
          )}

          {!isLoading && !error && items.length > 0 && filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No conversations match your search.
            </p>
          )}

          {!isLoading && !error && (
            <>
              <div className="flex items-center gap-1 px-3 pb-1 pt-2">
                <button
                  type="button"
                  onClick={() => setFoldersExpanded((v) => !v)}
                  className="flex flex-1 items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  aria-expanded={foldersExpanded}
                >
                  <Caret expanded={foldersExpanded} />
                  Folders
                  {folders.length > 0 && (
                    <span className="ml-1 text-muted-foreground/70">({folders.length})</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingMoveChatId(null);
                    setNewFolderName('');
                    setNewFolderDialogOpen(true);
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="New folder"
                  title="New folder"
                >
                  <PlusIcon />
                </button>
              </div>

              {foldersExpanded && (
                <>
                  {folders.length === 0 && (
                    <p className="px-3 pb-2 text-[11px] text-muted-foreground/80">
                      Create a folder to organize chats.
                    </p>
                  )}
                  {folders.map((folder) => (
                    <FolderRow
                      key={folder.id}
                      folder={folder}
                      isExpanded={expandedFolderIds.has(folder.id)}
                      onToggle={() => toggleFolderExpanded(folder.id)}
                      isEditing={editingFolderId === folder.id}
                      editingValue={editingFolderValue}
                      setEditingValue={setEditingFolderValue}
                      onStartRename={() => startFolderRename(folder)}
                      onCancelRename={cancelFolderRename}
                      onCommitRename={() => void commitFolderRename()}
                      onRequestDelete={() => setDeleteFolderId(folder.id)}
                      chats={chatsByFolder.get(folder.id) ?? []}
                      rowPropsFor={rowProps}
                    />
                  ))}
                  {folders.length > 0 && <div className="my-2 border-t border-border" />}
                </>
              )}
            </>
          )}

          {pinned.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pinned
              </p>
              {pinned.map((item) => (
                <Row key={`pinned-${item.id}`} {...rowProps(item, 'pinned')} />
              ))}
              {unfiled.length > 0 && <div className="my-2 border-t border-border" />}
            </>
          )}

          {unfiled.length > 0 && (
            <UnfiledSection>
              {unfiled.map((item) => (
                <Row key={item.id} {...rowProps(item, 'unfiled')} />
              ))}
            </UnfiledSection>
          )}
        </div>

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

        <AlertDialog
          open={deleteFolderId !== null}
          onOpenChange={(open) => !open && setDeleteFolderId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this folder?</AlertDialogTitle>
              <AlertDialogDescription>
                Conversations inside this folder will be unfiled (not deleted).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteFolderId && void deleteFolder(deleteFolderId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {pendingMoveChatId ? 'Create folder and move here' : 'New folder'}
              </DialogTitle>
              <DialogDescription>Give this folder a name.</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Discovery research"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  e.preventDefault();
                  const target = pendingMoveChatId;
                  setNewFolderDialogOpen(false);
                  setPendingMoveChatId(null);
                  void createFolder(newFolderName, target);
                }
              }}
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setNewFolderDialogOpen(false);
                  setPendingMoveChatId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const target = pendingMoveChatId;
                  setNewFolderDialogOpen(false);
                  setPendingMoveChatId(null);
                  void createFolder(newFolderName, target);
                }}
                disabled={!newFolderName.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </aside>
    </DndContext>
  );
}

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

function Caret({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('transition-transform', expanded && 'rotate-90')}
    >
      <polyline points="4 2 8 6 4 10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="#C9A84C"
      fillOpacity="0.18"
      stroke="#C9A84C"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

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

type RowPropsFn = (item: ConversationListItem, sectionKey: string) => Parameters<typeof Row>[0];

function FolderRow({
  folder,
  isExpanded,
  onToggle,
  isEditing,
  editingValue,
  setEditingValue,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onRequestDelete,
  chats,
  rowPropsFor,
}: {
  folder: FolderListItem;
  isExpanded: boolean;
  onToggle: () => void;
  isEditing: boolean;
  editingValue: string;
  setEditingValue: (v: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onRequestDelete: () => void;
  chats: ConversationListItem[];
  rowPropsFor: RowPropsFn;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `folder:${folder.id}` });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  return (
    <div ref={setNodeRef} className="mb-0.5">
      <div
        className={cn(
          'group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
          isOver
            ? 'bg-[#C9A84C]/15 ring-1 ring-[#C9A84C]/60'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex shrink-0 items-center text-muted-foreground hover:text-foreground"
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        >
          <Caret expanded={isExpanded} />
        </button>
        <FolderIcon />
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCommitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelRename();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-6 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              onDoubleClick={onStartRename}
              className="block w-full truncate text-left"
              title="Double-click to rename"
            >
              {folder.name}
            </button>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{chats.length}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 hover:text-foreground"
              aria-label="Folder actions"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onSelect={onStartRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onRequestDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <div className="ml-3 border-l border-border/60 pl-1.5">
          {chats.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground/70">
              Pull chats here or use the menu.
            </p>
          ) : (
            chats.map((c) => (
              <Row key={`${folder.id}-${c.id}`} {...rowPropsFor(c, `folder-${folder.id}`)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function UnfiledSection({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'unfiled' });
  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-lg', isOver && 'bg-muted/40 ring-1 ring-[#9BB7D4]/40')}
    >
      {children}
    </div>
  );
}

function Row({
  item,
  folders,
  sectionKey,
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
  onMoveToFolder,
  onRequestNewFolder,
  selectionMode,
  isSelected,
  onToggleSelect,
  isBeingDragged,
}: {
  item: ConversationListItem;
  folders: FolderListItem[];
  sectionKey: string;
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
  onMoveToFolder: (folderId: string | null) => void;
  onRequestNewFolder: () => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  isBeingDragged: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const dragDisabled = selectionMode || isEditing;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `chat:${sectionKey}:${item.id}`,
    disabled: dragDisabled,
  });

  // Visually translate the row so it follows the cursor; lift it above
  // siblings so it doesn't get clipped by the scroll container.
  const dragStyle = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        position: 'relative' as const,
      }
    : undefined;

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
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      style={dragStyle}
      {...attributes}
      {...listeners}
      className={cn(
        'group mb-1 flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm',
        !isDragging && 'transition-all duration-200',
        selectionMode && isSelected
          ? 'bg-[#9BB7D4]/15 text-foreground'
          : isActive
            ? 'bg-primary/10 text-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isDragging && 'cursor-grabbing bg-background shadow-lg ring-1 ring-[#C9A84C]/40',
        isBeingDragged && !isDragging && 'opacity-40'
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
            onPointerDown={(e) => e.stopPropagation()}
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
                onPointerDown={(e) => e.stopPropagation()}
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
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onTogglePin}>
                {item.is_pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onStartRename}>Rename</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to folder</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {folders.length === 0 && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      No folders yet
                    </DropdownMenuItem>
                  )}
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onSelect={() => onMoveToFolder(f.id)}
                      disabled={item.folder_id === f.id}
                    >
                      <span className="truncate">{f.name}</span>
                      {item.folder_id === f.id && (
                        <span className="ml-auto text-[10px] text-muted-foreground">current</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                  {item.folder_id && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onMoveToFolder(null)}>
                        Remove from folder
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onRequestNewFolder}>New folder…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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

      {!isEditing && selectionMode && item.is_pinned && (
        <div className="mt-0.5 shrink-0 p-1">
          <PinIcon active={true} />
        </div>
      )}
    </div>
  );
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
