// Shared feedback primitives for the portfolio surfaces (Run 4).
// Locality Law 6: loading and errors live on the object they concern.
// Same visual contract as the sprint's local notes, kept as their own
// module so the portfolio pages don't reach into Sprint.tsx internals.

import { Button } from '@/components/ui/button';

export function WorkingNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-secondary/60 px-3 py-2.5">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function InlineError({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
    >
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
