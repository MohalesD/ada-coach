// The one feedback submission form — used inside the FAB dialog and on
// the Settings page. Owns type selection, the note, the insert, and the
// local success state; where it renders is the caller's business.

import { useState, type FormEvent } from 'react';
import { Bug, Heart, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { submitFeedbackEvent, type FeedbackSurface, type FeedbackType } from '@/lib/feedback-api';

const COMMENT_MAX = 4000;

type FormType = Exclude<FeedbackType, 'message_rating'>;

const TYPES: {
  value: FormType;
  label: string;
  icon: typeof Bug;
  placeholder: string;
}[] = [
  {
    value: 'bug',
    label: 'Something broke',
    icon: Bug,
    placeholder: 'What were you doing when it broke? The more specific, the faster it gets fixed.',
  },
  {
    value: 'feedback',
    label: 'An idea',
    icon: Lightbulb,
    placeholder: 'What would make Ada more useful for you?',
  },
  {
    value: 'praise',
    label: 'Something worked',
    icon: Heart,
    placeholder: 'What landed well? Knowing what to do more of matters just as much.',
  },
];

export default function FeedbackForm({
  surface,
  onSubmitted,
}: {
  surface: FeedbackSurface;
  onSubmitted?: () => void;
}) {
  const [type, setType] = useState<FormType>('feedback');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const active = TYPES.find((t) => t.value === type) ?? TYPES[1];
  const canSend = comment.trim().length > 0 && !sending;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    const result = await submitFeedbackEvent({
      feedback_type: type,
      source_surface: surface,
      comment,
    });
    setSending(false);
    if (result.error) {
      setError("That didn't send. Your note is still here — try again in a moment.");
      return;
    }
    setSent(true);
    onSubmitted?.();
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-accent/30 bg-secondary/40 px-4 py-5 text-center">
        <p className="text-sm font-semibold text-foreground">Got it — thank you.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Notes like this decide what Ada learns next.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setSent(false);
            setComment('');
          }}
        >
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Feedback type" className="flex flex-wrap gap-2">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const selected = t.value === type;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setType(t.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                selected
                  ? 'border-accent bg-accent/10 font-semibold text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-accent/60 hover:text-foreground'
              )}
            >
              <Icon size={14} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
        placeholder={active.placeholder}
        rows={4}
        aria-label="Your feedback"
        disabled={sending}
      />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!canSend} className="self-end">
        {sending ? 'Sending…' : 'Send to the team'}
      </Button>
    </form>
  );
}
