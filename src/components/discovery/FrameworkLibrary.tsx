// The framework library (agent-loop redesign). Always-available browse +
// teach surface: every framework Ada knows, its plain-language "when & why",
// and a way to invoke one out of turn — the PM never has to wait for Ada to
// suggest a lens they already want. North Star is the one entry that can't
// dispatch directly: grounded candidates only exist once discovery has
// validated something, so its button asks Ada in the thread and the server's
// readiness gate answers honestly.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FrameworkSlot, PublicFramework } from '@/types/discovery';

const SLOT_ORDER: { slot: FrameworkSlot; heading: string; sub: string }[] = [
  { slot: 'prioritization', heading: 'Prioritization', sub: 'Deciding what to test first' },
  { slot: 'success_metric', heading: 'Success metric', sub: 'Naming what winning means' },
  { slot: 'interview', heading: 'Interviews', sub: 'Learning from real customers' },
];

function FrameworkRow({
  fw,
  active,
  busy,
  onUse,
  onAskForMetric,
}: {
  fw: PublicFramework;
  active: boolean;
  busy: boolean;
  onUse: (fw: PublicFramework) => void;
  onAskForMetric: () => void;
}) {
  const isMetric = fw.slot === 'success_metric';
  return (
    <div
      className={cn(
        'rounded-xl border bg-background/60 p-3.5',
        'transition-all duration-200 motion-reduce:transition-none',
        'hover:-translate-y-px hover:border-accent/60 hover:shadow-md motion-reduce:hover:translate-y-0',
        'focus-within:border-accent/60 focus-within:shadow-md',
        active ? 'border-primary/60 bg-primary/5' : 'border-border'
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-display text-sm font-semibold text-foreground">{fw.name}</span>
        {active && (
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            In use
          </span>
        )}
        {fw.isDefault && !active && (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ada's default
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{fw.oneLiner}</p>
      <p className="mt-2 border-l-2 border-accent/40 pl-3 text-xs leading-relaxed text-foreground/80">
        {fw.whenWhy}
      </p>
      <div className="mt-3">
        {isMetric ? (
          <div className="space-y-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={onAskForMetric}>
              Ask Ada to define success
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Ada offers candidates grounded in your validated assumptions — she'll tell you if it's
              too early for that.
            </p>
          </div>
        ) : fw.slot === 'interview' ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onUse(fw)}>
            Write my interview guide
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy || active} onClick={() => onUse(fw)}>
            {active ? 'In use' : 'Use for prioritization'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function FrameworkLibrary({
  open,
  onOpenChange,
  frameworks,
  loadError,
  onRetry,
  activeFramework,
  busy,
  onUseFramework,
  onAskForMetric,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameworks: PublicFramework[] | null;
  loadError: boolean;
  onRetry: () => void;
  activeFramework: Partial<Record<FrameworkSlot, string>>;
  busy: boolean;
  onUseFramework: (fw: PublicFramework) => void;
  onAskForMetric: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Framework library</DialogTitle>
          <DialogDescription>
            The techniques Ada coaches with. Pick one whenever you want — she suggests, you decide.
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
          >
            <p className="text-sm text-destructive">The library didn't load.</p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}

        {!loadError && frameworks === null && (
          <p className="py-4 text-sm text-muted-foreground">Opening the library…</p>
        )}

        {!loadError && frameworks !== null && (
          <div className="space-y-5">
            {SLOT_ORDER.map(({ slot, heading, sub }) => {
              const group = frameworks.filter((f) => f.slot === slot);
              if (group.length === 0) return null;
              return (
                <section key={slot} aria-label={heading}>
                  <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                    {heading}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{sub}</span>
                  </h3>
                  <div className="mt-2 space-y-2">
                    {group.map((fw) => (
                      <FrameworkRow
                        key={fw.id}
                        fw={fw}
                        active={activeFramework[slot] === fw.id}
                        busy={busy}
                        onUse={onUseFramework}
                        onAskForMetric={onAskForMetric}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
