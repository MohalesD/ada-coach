// Coverage indicator for the agent-loop sprint. A progress READ, not a
// step controller: it shows where the loop has been (covered), where it
// is (current phase), and what the PM set aside (deferred) — the loop is
// non-linear, so nothing here is clickable and the connectors are dotted
// paths, not an ordered track. State arrives from the server
// (session.coverage + current_phase); this component only renders it.

import { cn } from '@/lib/utils';
import type { Coverage, DiscoveryGoal, GoalStatus } from '@/types/discovery';

// Display names for the discovery goals — the one place they're spelled
// out, shared with the proposal card (revisit copy) and anything else
// that names a goal to the PM.
export const GOAL_LABELS: Record<DiscoveryGoal, string> = {
  frame: 'Frame',
  surface_assumptions: 'Assumptions',
  gather_evidence: 'Evidence',
  prioritize: 'Prioritize',
  define_success: 'Success metric',
  prepare_to_learn: 'Interviews',
  conclude: 'Wrap-up',
};

const GOALS: { key: DiscoveryGoal; label: string }[] = (
  [
    'frame',
    'surface_assumptions',
    'gather_evidence',
    'prioritize',
    'define_success',
    'prepare_to_learn',
    'conclude',
  ] as DiscoveryGoal[]
).map((key) => ({ key, label: GOAL_LABELS[key] }));

const STATUS_COPY: Record<GoalStatus, string> = {
  untouched: 'not started',
  in_progress: 'in progress',
  covered: 'covered',
  deferred: 'set aside',
};

function goalStatus(coverage: Coverage, goal: DiscoveryGoal): GoalStatus {
  return coverage.goals?.[goal] ?? 'untouched';
}

export default function CoveragePath({
  coverage,
  currentPhase,
}: {
  coverage: Coverage;
  currentPhase: DiscoveryGoal;
}) {
  return (
    <section aria-label="Discovery coverage" className="overflow-x-auto scrollbar-none">
      <ol className="flex min-w-max items-center px-1 py-0.5">
        {GOALS.map((goal, i) => {
          const status = goalStatus(coverage, goal.key);
          const current = goal.key === currentPhase;
          return (
            <li key={goal.key} className="flex items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className="mx-1 w-2.5 border-t border-dashed border-border sm:w-4"
                />
              )}
              <span
                aria-current={current ? 'step' : undefined}
                aria-label={`${goal.label}: ${STATUS_COPY[status]}${current ? ' — Ada is here now' : ''}`}
                title={`${goal.label} — ${STATUS_COPY[status]}${current ? ' (now)' : ''}`}
                className={cn(
                  'flex cursor-default items-center gap-1.5 rounded-full px-1.5 py-1 text-[11px]',
                  'transition-colors duration-300 motion-reduce:transition-none',
                  current
                    ? 'font-semibold text-primary'
                    : status === 'covered'
                      ? 'font-medium text-primary/80'
                      : status === 'in_progress'
                        ? 'text-foreground/80'
                        : 'text-muted-foreground/70'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold',
                    'transition-all duration-300 motion-reduce:transition-none',
                    status === 'covered' && 'border-accent bg-accent text-primary-foreground',
                    status === 'in_progress' && 'border-accent bg-accent/20 text-accent',
                    status === 'deferred' &&
                      'border-dashed border-muted-foreground/50 text-muted-foreground',
                    status === 'untouched' && 'border-border text-transparent',
                    current && 'ring-2 ring-accent/35 ring-offset-1 ring-offset-background'
                  )}
                >
                  {status === 'covered'
                    ? '✓'
                    : status === 'in_progress'
                      ? '•'
                      : status === 'deferred'
                        ? '–'
                        : '·'}
                </span>
                {goal.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
