// One assumption, one card (Run 2). Presentational: number badge keyed
// to the risk map, category chip, statement, and the two 1–5 scores as
// direct-manipulation tap dots when editable — the control sits on the
// object it changes (Locality-First), so score edits happen here, not in
// a distant form. Step-specific extras (grounding buttons, evidence)
// arrive as children.

import { cn } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/components/discovery/RiskMap';
import type {
  Assumption,
  AssumptionStatus,
  FrameworkScores,
  PublicFramework,
} from '@/types/discovery';

const STATUS_OPTIONS: { value: AssumptionStatus; label: string }[] = [
  { value: 'untested', label: 'Untested' },
  { value: 'validated', label: 'Validated' },
  { value: 'challenged', label: 'Challenged' },
  { value: 'abandoned', label: 'Deferred' },
];

// "Deferred" (schema value: abandoned) reads as the PM's "won't test now" —
// matches the loop's readiness language (tested-or-deferred), not the raw
// enum name.
function StatusControl({
  status,
  onChange,
}: {
  status: AssumptionStatus;
  onChange?: (status: AssumptionStatus) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Assumption status" className="flex flex-wrap gap-1.5">
      {STATUS_OPTIONS.map((opt) => {
        const selected = status === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(opt.value)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-accent'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Numeric fields (RICE) default unset entries to their range's midpoint so
// every save posts a complete framework_scores object — the controller
// validates all fields at once and would 400 on a partial payload.
function numericDefaults(
  fields: { key: string; min: number; max: number }[]
): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const f of fields) defaults[f.key] = Math.round((f.min + f.max) / 2);
  return defaults;
}

function FrameworkScoreInputs({
  framework,
  scores,
  editable,
  onChange,
}: {
  framework: PublicFramework;
  scores: FrameworkScores | null;
  editable: boolean;
  onChange?: (scores: FrameworkScores) => void;
}) {
  const scoring = framework.scoring;
  if (!scoring) return null;

  if (scoring.kind === 'numeric') {
    const defaults = numericDefaults(scoring.fields);
    const current = { ...defaults, ...((scores as Record<string, number> | null) ?? {}) };
    return (
      <div className="space-y-1.5">
        {scoring.fields.map((field) => (
          <ScoreDots
            key={field.key}
            label={field.label}
            value={current[field.key]}
            editable={editable}
            onChange={(v) => onChange?.({ ...current, [field.key]: v } as FrameworkScores)}
          />
        ))}
        {scoring.formula === 'rice' && typeof current.score === 'number' && (
          <p className="pl-[84px] text-xs font-semibold text-accent">RICE score: {current.score}</p>
        )}
      </div>
    );
  }

  const bucket = (scores as { bucket?: string } | null)?.bucket;
  return (
    <div
      role="radiogroup"
      aria-label={`${framework.name} bucket`}
      className="flex flex-wrap gap-1.5"
    >
      {scoring.buckets.map((b) => {
        const selected = bucket === b.key;
        return (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!editable}
            onClick={() => onChange?.({ bucket: b.key } as FrameworkScores)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-accent',
              !editable && 'pointer-events-none opacity-70'
            )}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

function ScoreDots({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: number;
  editable: boolean;
  onChange?: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div
        role={editable ? 'radiogroup' : undefined}
        aria-label={editable ? `${label} score` : undefined}
        className="flex items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((v) =>
          editable ? (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value === v}
              aria-label={`${label} ${v} of 5`}
              onClick={() => onChange?.(v)}
              className={cn(
                'h-6 w-6 rounded-full border text-[11px] font-bold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                v <= value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-accent'
              )}
            >
              {v}
            </button>
          ) : (
            <span
              key={v}
              aria-hidden
              className={cn(
                'inline-block h-2.5 w-2.5 rounded-full',
                v <= value ? 'bg-primary' : 'bg-border'
              )}
            />
          )
        )}
        {!editable && (
          <span className="ml-1.5 text-xs font-semibold text-foreground">{value}/5</span>
        )}
      </div>
    </div>
  );
}

export default function AssumptionCard({
  assumption,
  index,
  editable = false,
  onScoreChange,
  onStatusChange,
  framework = null,
  onFrameworkScoreChange,
  selectable = false,
  selected = false,
  onToggleSelect,
  highlight = false,
  children,
}: {
  assumption: Assumption;
  index: number;
  editable?: boolean;
  onScoreChange?: (field: 'confidence' | 'impact', value: number) => void;
  onStatusChange?: (status: AssumptionStatus) => void;
  // The active prioritization framework, only when it's a scored one
  // (RICE/MoSCoW) — the default confidence×impact framework has no
  // framework_scores UI here since it already uses the columns above.
  framework?: PublicFramework | null;
  onFrameworkScoreChange?: (scores: FrameworkScores) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
          style={{ backgroundColor: CATEGORY_COLORS[assumption.category] }}
        >
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {assumption.category}
            </span>
            {assumption.status !== 'untested' && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  assumption.status === 'validated' && 'bg-success/15 text-success',
                  assumption.status === 'challenged' && 'bg-warning/15 text-warning',
                  assumption.status === 'abandoned' && 'bg-muted text-muted-foreground line-through'
                )}
              >
                {assumption.status}
              </span>
            )}
            {assumption.is_prioritized && (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                prioritized
              </span>
            )}
            {selectable && (
              <span
                aria-hidden
                className={cn(
                  'ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-transparent'
                )}
              >
                ✓
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-foreground">{assumption.statement}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 pl-[34px]">
        <ScoreDots
          label="Confidence"
          value={assumption.confidence}
          editable={editable}
          onChange={(v) => onScoreChange?.('confidence', v)}
        />
        <ScoreDots
          label="Impact"
          value={assumption.impact}
          editable={editable}
          onChange={(v) => onScoreChange?.('impact', v)}
        />
      </div>
      {framework?.scoring && (
        <div className="mt-3 space-y-1.5 pl-[34px]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {framework.name}
          </span>
          <FrameworkScoreInputs
            framework={framework}
            scores={assumption.framework_scores}
            editable={editable}
            onChange={onFrameworkScoreChange}
          />
        </div>
      )}
      {editable && (
        <div className="mt-3 pl-[34px]">
          <StatusControl status={assumption.status} onChange={onStatusChange} />
        </div>
      )}
      {children && <div className="mt-3 pl-[34px]">{children}</div>}
    </>
  );

  const frame = cn(
    'rounded-xl border bg-card p-4 text-left transition-colors',
    highlight ? 'border-accent/70 shadow-sm' : 'border-border',
    selectable &&
      (selected ? 'border-primary bg-primary/5' : 'hover:border-accent/60 cursor-pointer')
  );

  if (selectable) {
    return (
      <div
        role="checkbox"
        aria-checked={selected}
        tabIndex={0}
        onClick={onToggleSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleSelect?.();
          }
        }}
        className={cn(
          frame,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
        )}
      >
        {body}
      </div>
    );
  }

  return <div className={frame}>{body}</div>;
}
