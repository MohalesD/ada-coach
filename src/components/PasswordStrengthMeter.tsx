import { cn } from '@/lib/utils';
import { scorePasswordStrength } from '@/lib/password-strength';

const SEGMENT_COLORS = ['bg-destructive', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const { score, label, tip } = scorePasswordStrength(password);
  const activeColor = SEGMENT_COLORS[Math.max(0, score - 1)];

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < score ? activeColor : 'bg-muted'
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}.</span> {tip}
      </p>
    </div>
  );
}
