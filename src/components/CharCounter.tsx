// The one character-count readout for any capped text input.
// One job: tell the writer where they stand against the limit, before and
// after they cross it.
//
// Three states, per the rule that a limit the user can't see isn't a limit,
// it's a trap:
//   normal   — muted "0 / 4,000", visible from the first keystroke
//   near     — amber once they're inside the warning band (default 10%)
//   over     — red, and it names the overage ("142 over the limit")
//
// Inputs using this should NOT silently truncate. Let people type past the
// cap and block the submit instead; losing keystrokes with no explanation is
// the exact bug this component exists to kill.

import { cn } from '@/lib/utils';

export function isOverLimit(value: string, max: number): boolean {
  return value.length > max;
}

export default function CharCounter({
  value,
  max,
  warnAt = 0.9,
  className,
}: {
  value: string;
  max: number;
  /** Fraction of the limit at which the counter turns amber. */
  warnAt?: number;
  className?: string;
}) {
  const used = value.length;
  const over = used - max;
  const isOver = over > 0;
  const isNear = !isOver && used >= Math.floor(max * warnAt);

  return (
    <p
      className={cn(
        'text-xs tabular-nums transition-colors',
        isOver
          ? 'font-medium text-destructive'
          : isNear
            ? 'font-medium text-[#8B6324]'
            : 'text-muted-foreground',
        className
      )}
      // Only announce once it matters, so a screen reader isn't read a
      // number on every keystroke.
      aria-live={isOver || isNear ? 'polite' : 'off'}
    >
      {used.toLocaleString()} / {max.toLocaleString()}
      {isOver && <span className="ml-2">{over.toLocaleString()} over the limit</span>}
    </p>
  );
}
