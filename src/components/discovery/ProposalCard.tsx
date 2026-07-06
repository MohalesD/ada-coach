// The one PM-gated decision card (agent-loop redesign). When Ada wants to
// change direction — map assumptions, check the market, pick a framework,
// define success, wrap up — the controller raises exactly one proposal, and
// this card is where the PM confirms, overrides, or honestly says "not now".
// Ada suggests; she never silently acts. Within-phase coaching never lands
// here — it's just her reply in the thread.

import { useState } from 'react';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GOAL_LABELS } from '@/components/discovery/CoveragePath';
import type {
  ActionType,
  MetricCandidate,
  PendingAction,
  PublicFramework,
} from '@/types/discovery';

type Decision = 'confirm' | 'override' | 'dismiss';

const ACTION_COPY: Partial<
  Record<ActionType, { title: string; confirm: string; busy: string; decline?: string }>
> = {
  map_assumptions: {
    title: 'Map your assumptions',
    confirm: 'Map them',
    busy: 'Ada is mapping your assumptions — usually 10–20 seconds…',
  },
  ground_assumption: {
    title: 'Check this against the market',
    confirm: 'Run the market check',
    busy: 'Searching the market — 30–60 seconds…',
  },
  run_blind_spots: {
    title: 'Surface your blind spots',
    confirm: 'Run the analysis',
    busy: 'Ada is cross-examining your thinking — usually 15–30 seconds…',
  },
  propose_prioritization: {
    title: 'Choose your prioritization lens',
    confirm: 'Use this lens',
    busy: 'Setting your prioritization lens…',
  },
  prepare_interviews: {
    title: 'Prepare your interviews',
    confirm: 'Write the guide',
    busy: 'Ada is writing your guide — usually 20–30 seconds…',
    decline: 'Skip interviews',
  },
  define_success_metric: {
    title: 'Define what success means',
    confirm: 'Set this North Star',
    busy: 'Recording your metric…',
    decline: 'Skip the metric',
  },
  revisit_phase: {
    title: 'Loop back',
    confirm: 'Go back',
    busy: 'Rewinding…',
  },
  conclude: {
    title: 'Ready to wrap up',
    confirm: 'Finish & compile the report',
    busy: 'Closing the sprint and heading to your report…',
  },
};

function BusyNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-secondary/60 px-3 py-2.5">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent motion-reduce:animate-none"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
      <p className="text-sm text-muted-foreground" role="status">
        {label}
      </p>
    </div>
  );
}

// One selectable option row — shared shell for framework choices and North
// Star candidates. A div-with-radio-role (matching the AssumptionCard idiom)
// so expander buttons can nest inside without invalid button-in-button HTML.
function OptionRow({
  selected,
  onSelect,
  ariaLabel,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'cursor-pointer rounded-xl border bg-background/60 p-3.5 text-left',
        'transition-all duration-200 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : cn(
              'border-border hover:-translate-y-px hover:border-accent/60 hover:shadow-md',
              'motion-reduce:hover:translate-y-0'
            )
      )}
    >
      {children}
    </div>
  );
}

function SelectDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected ? 'border-primary' : 'border-border'
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full transition-colors',
          selected ? 'bg-primary' : 'bg-transparent'
        )}
      />
    </span>
  );
}

// The light teaching beat: one plain-language paragraph per framework,
// tucked behind a "When & why" toggle so choosing stays fast.
function WhenWhy({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`whenwhy-${id}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center gap-1 rounded text-xs font-semibold text-accent',
          'transition-colors hover:text-primary hover:underline',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-90'
          )}
        >
          ▸
        </span>
        When &amp; why to use it
      </button>
      {open && (
        <p
          id={`whenwhy-${id}`}
          className="mt-1.5 border-l-2 border-accent/40 pl-3 text-xs leading-relaxed text-muted-foreground"
        >
          {text}
        </p>
      )}
    </div>
  );
}

function FrameworkOptions({
  options,
  suggested,
  value,
  onChange,
}: {
  options: PublicFramework[];
  suggested: string;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Framework options" className="space-y-2">
      {options.map((fw) => (
        <OptionRow
          key={fw.id}
          selected={value === fw.id}
          onSelect={() => onChange(fw.id)}
          ariaLabel={`${fw.name}${fw.id === suggested ? ' — Ada suggests this' : ''}`}
        >
          <div className="flex items-start gap-2.5">
            <SelectDot selected={value === fw.id} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-display text-sm font-semibold text-foreground">
                  {fw.name}
                </span>
                {fw.id === suggested && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Ada suggests
                  </span>
                )}
                {fw.isDefault && fw.id !== suggested && (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Default
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{fw.oneLiner}</p>
              <WhenWhy id={fw.id} text={fw.whenWhy} />
            </div>
          </div>
        </OptionRow>
      ))}
    </div>
  );
}

// North Star candidates: every one traces back to the PM's own validated
// work, and every one names its drift risk out loud — trade-offs, never a
// template menu.
function MetricOptions({
  candidates,
  value,
  onChange,
}: {
  candidates: MetricCandidate[];
  value: number | null;
  onChange: (i: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="North Star candidates" className="space-y-2">
      {candidates.map((c, i) => (
        <OptionRow
          key={i}
          selected={value === i}
          onSelect={() => onChange(i)}
          ariaLabel={`North Star candidate: ${c.northStar}`}
        >
          <div className="flex items-start gap-2.5">
            <SelectDot selected={value === i} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-display text-sm font-semibold text-foreground">{c.northStar}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Measures
                </span>{' '}
                {c.measures}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Grounded in
                </span>{' '}
                {c.groundedIn}
              </p>
              <p className="text-xs leading-relaxed text-foreground/85">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Weekly proxy
                </span>{' '}
                {c.proxy}
              </p>
              <p className="rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs leading-relaxed text-warning">
                <span className="font-semibold uppercase tracking-wider">Drift risk</span>{' '}
                {c.driftRisk}
              </p>
            </div>
          </div>
        </OptionRow>
      ))}
    </div>
  );
}

export default function ProposalCard({
  proposal,
  busy,
  onResolve,
}: {
  proposal: PendingAction;
  busy: boolean;
  onResolve: (decision: Decision, action: ActionType, params?: Record<string, unknown>) => void;
}) {
  const [framework, setFramework] = useState<string>(proposal.framework?.suggested ?? '');
  const [metricIdx, setMetricIdx] = useState<number | null>(null);

  const copy = ACTION_COPY[proposal.action] ?? {
    title: 'Ada suggests a move',
    confirm: 'Go ahead',
    busy: 'Working on it…',
  };

  const candidates = proposal.data?.candidates ?? [];
  const isMetric = proposal.action === 'define_success_metric';
  const isFrameworkChoice = !isMetric && !!proposal.framework;

  const title =
    proposal.action === 'revisit_phase' && proposal.goal
      ? `Loop back to ${GOAL_LABELS[proposal.goal].toLowerCase()}`
      : copy.title;

  const selectedName = isFrameworkChoice
    ? proposal.framework?.options.find((o) => o.id === framework)?.name
    : null;

  const handleConfirm = () => {
    if (isMetric) {
      if (metricIdx === null) return;
      onResolve('confirm', proposal.action, { chosen: candidates[metricIdx] });
      return;
    }
    if (isFrameworkChoice && proposal.framework) {
      // The controller needs the chosen framework either way; "override" is
      // the honest label when the PM picked past Ada's suggestion.
      const decision: Decision =
        framework === proposal.framework.suggested ? 'confirm' : 'override';
      onResolve(decision, proposal.action, { framework });
      return;
    }
    onResolve('confirm', proposal.action);
  };

  return (
    <section
      aria-label={`Ada proposes: ${title}`}
      className={cn(
        'relative mt-3 overflow-hidden rounded-2xl border border-accent/40 bg-card p-4 shadow-md sm:p-5',
        'animate-scale-in motion-reduce:animate-none'
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-accent to-accent/0"
      />
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent"
        >
          <Compass size={14} />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent">
          Ada proposes
        </p>
      </div>
      <h2 className="mt-2 font-display text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {proposal.rationale && (
        <p className="mt-2 border-l-2 border-accent/60 pl-3 text-sm italic leading-relaxed text-foreground/85">
          {proposal.rationale}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {proposal.action === 'ground_assumption' && proposal.target?.label && (
          <div className="rounded-xl border border-border bg-background/60 px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              The assumption
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{proposal.target.label}</p>
          </div>
        )}

        {isFrameworkChoice && proposal.framework && (
          <FrameworkOptions
            options={proposal.framework.options}
            suggested={proposal.framework.suggested}
            value={framework}
            onChange={setFramework}
          />
        )}

        {isMetric &&
          (candidates.length > 0 ? (
            <MetricOptions candidates={candidates} value={metricIdx} onChange={setMetricIdx} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ada couldn't shape candidates this time — keep talking and she'll offer them again.
            </p>
          ))}

        {busy ? (
          <BusyNote label={copy.busy} />
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              onClick={handleConfirm}
              disabled={isMetric && (metricIdx === null || candidates.length === 0)}
            >
              {isFrameworkChoice && selectedName ? `Use ${selectedName}` : copy.confirm}
            </Button>
            <Button variant="outline" onClick={() => onResolve('dismiss', proposal.action)}>
              {copy.decline ?? 'Not now'}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
