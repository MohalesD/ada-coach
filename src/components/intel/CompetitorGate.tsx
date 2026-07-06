// The confirm gate (Run 5, addendum endpoints 10–11). Deep profiling is
// the expensive step, so the PM curates the list FIRST: check the
// competitors worth researching, remove wrong ones, add known ones Ada
// missed. The projected search cost updates live with the selection and
// is surfaced HERE, before any budget is spent — the gate is the cost
// surface, not a toast after the fact.

import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SEARCH_FEE_USD } from '@/components/intel/chips';
import type { Competitor } from '@/types/discovery';

export default function CompetitorGate({
  competitors,
  budget,
  unmappedNote,
  confirming,
  onConfirm,
  onReidentify,
  reidentifying,
}: {
  competitors: Competitor[];
  budget: number | null;
  unmappedNote: string | null;
  confirming: boolean;
  onConfirm: (changes: { confirm: string[]; add: string[]; remove: string[] }) => void;
  onReidentify: () => void;
  reidentifying: boolean;
}) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(competitors.filter((c) => c.confirmed).map((c) => c.id))
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const visible = competitors.filter((c) => !removed.has(c.id));
  const selectedCount = useMemo(
    () => visible.filter((c) => checked.has(c.id)).length + added.length,
    [visible, checked, added]
  );

  const perCompetitor =
    budget !== null && selectedCount >= 1 && selectedCount <= budget
      ? Math.floor(budget / selectedCount)
      : 0;
  const totalSearches = perCompetitor * selectedCount;
  const overBudget = budget !== null && selectedCount > budget;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addDraft = () => {
    const name = draft.trim();
    if (!name) return;
    const exists =
      added.some((a) => a.toLowerCase() === name.toLowerCase()) ||
      visible.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!exists) setAdded((prev) => [...prev, name]);
    setDraft('');
  };

  return (
    <div className="rounded-xl border border-accent/60 bg-secondary/40 px-5 py-4">
      <h3 className="font-display text-base font-semibold tracking-tight">
        Who's worth researching?
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {unmappedNote ??
          'Check the competitors Ada should profile in depth. Remove the wrong ones, add any she missed — deep research spends your search budget, so curate first.'}
      </p>

      {visible.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {visible.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <Checkbox
                id={`gate-${c.id}`}
                checked={checked.has(c.id)}
                onCheckedChange={() => toggle(c.id)}
                aria-label={`Research ${c.name}`}
              />
              <label htmlFor={`gate-${c.id}`} className="flex-1 cursor-pointer text-sm">
                <span className="font-medium text-foreground">{c.name}</span>
                {c.added_by === 'user' && (
                  <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                    added by you
                  </span>
                )}
                {c.profiled_at && (
                  <span className="ml-2 text-[11px] font-medium text-success">
                    already researched
                  </span>
                )}
              </label>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={() => setRemoved((prev) => new Set(prev).add(c.id))}
                aria-label={`Remove ${c.name} from the list`}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {added.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {added.map((name) => (
            <li
              key={name}
              className="flex items-center gap-3 rounded-lg border border-dashed border-accent/60 bg-card px-3 py-2"
            >
              <span className="flex-1 text-sm font-medium text-foreground">{name}</span>
              <span className="text-[11px] font-medium text-muted-foreground">will be added</span>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={() => setAdded((prev) => prev.filter((a) => a !== name))}
                aria-label={`Remove ${name}`}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder="Add a competitor you know about"
          aria-label="Add a competitor by name"
          maxLength={120}
          className="h-9 max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={addDraft}
          disabled={!draft.trim()}
        >
          <Plus size={13} aria-hidden />
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 text-muted-foreground"
          onClick={onReidentify}
          disabled={reidentifying || confirming}
        >
          <Search size={13} aria-hidden />
          {reidentifying ? 'Searching…' : 'Search again'}
        </Button>
      </div>

      {/* The cost math, BEFORE the budget is spent */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {overBudget ? (
            <span className="font-medium text-destructive">
              The search budget ({budget}) covers at most {budget} competitors per run — uncheck{' '}
              {selectedCount - (budget ?? 0)}.
            </span>
          ) : selectedCount > 0 && budget !== null ? (
            <>
              Researching <span className="font-semibold text-foreground">{selectedCount}</span>{' '}
              competitor{selectedCount === 1 ? '' : 's'} uses up to{' '}
              <span className="font-semibold text-foreground">{totalSearches}</span> web searches
              (~$
              {(totalSearches * SEARCH_FEE_USD).toFixed(2)} in search fees, plus model tokens) —{' '}
              {perCompetitor} per competitor.
            </>
          ) : (
            'Select at least one competitor to research.'
          )}
        </p>
        <Button
          size="sm"
          disabled={selectedCount === 0 || overBudget || confirming || reidentifying}
          onClick={() =>
            onConfirm({
              confirm: visible.filter((c) => checked.has(c.id)).map((c) => c.id),
              add: added,
              remove: [...removed],
            })
          }
        >
          {confirming ? 'Saving the list…' : `Confirm ${selectedCount || ''} for research`}
        </Button>
      </div>
    </div>
  );
}
