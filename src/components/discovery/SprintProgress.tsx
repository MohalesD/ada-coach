// Step progress indicator for the Discovery Sprint (Run 2). Always
// visible at the top of the sprint surface so the PM knows where they
// are, what's done, and what's left — the goal's "visible step-by-step
// progress indicator". Completed steps are tappable (revisit); future
// steps are not (the flow earns them in order).

import { cn } from '@/lib/utils';

export interface SprintStep {
  key: string;
  label: string;
}

export const SPRINT_STEPS: SprintStep[] = [
  { key: 'grounding', label: 'Ground' },
  { key: 'mapping', label: 'Map' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'blind_spots', label: 'Blind spots' },
  { key: 'prioritize', label: 'Prioritize' },
  { key: 'guide', label: 'Guide' },
  { key: 'report', label: 'Report' },
];

export function stepIndex(key: string | null): number {
  const i = SPRINT_STEPS.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

export default function SprintProgress({
  currentKey,
  onNavigate,
}: {
  currentKey: string;
  onNavigate: (key: string) => void;
}) {
  const current = stepIndex(currentKey);

  return (
    <nav aria-label="Sprint progress" className="overflow-x-auto scrollbar-none">
      <ol className="flex min-w-max items-center gap-0 px-1">
        {SPRINT_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.key} className="flex items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'mx-0.5 h-px w-2.5 sm:w-5',
                    done || active ? 'bg-accent' : 'bg-border',
                  )}
                />
              )}
              <button
                type="button"
                disabled={!done}
                onClick={() => onNavigate(step.key)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'text-primary hover:bg-accent/15'
                      : 'cursor-default text-muted-foreground/60',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px]',
                    active
                      ? 'border-primary-foreground/60'
                      : done
                        ? 'border-accent bg-accent text-primary-foreground'
                        : 'border-border',
                  )}
                >
                  {done ? '✓' : i + 1}
                </span>
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
