// Thumbs up/down on a single assistant message. Extracted verbatim from
// the chat surface (Index.tsx) so chat and Discovery Sprint render one
// implementation, not two. Owns optimistic selection + revert; the
// DB write (messages.feedback + user_feedback event) lives in useFeedback.

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useFeedback, type FeedbackValue } from '@/hooks/use-feedback';
import type { FeedbackSurface } from '@/lib/feedback-api';

export default function FeedbackButtons({
  messageId,
  initial,
  surface = 'chat',
}: {
  messageId: string;
  initial: FeedbackValue;
  surface?: FeedbackSurface;
}) {
  const [value, setValue] = useState<FeedbackValue>(initial);
  const [pendingTarget, setPendingTarget] = useState<'positive' | 'negative' | null>(null);
  const { submit, isSaving } = useFeedback(messageId, surface);

  const handleClick = async (target: 'positive' | 'negative') => {
    if (isSaving) return;
    const next: FeedbackValue = value === target ? null : target;
    const previous = value;
    setValue(next); // optimistic
    setPendingTarget(target);
    const result = await submit(next);
    setPendingTarget(null);
    if (result.error) setValue(previous); // revert
  };

  const hasSelection = value !== null;

  return (
    <div
      className={cn(
        'ml-1 flex items-center gap-1 transition-opacity duration-150',
        hasSelection ? 'opacity-100' : 'opacity-30 focus-within:opacity-100 group-hover:opacity-100'
      )}
    >
      <FeedbackButton
        kind="positive"
        selected={value === 'positive'}
        loading={isSaving && pendingTarget === 'positive'}
        disabled={isSaving}
        onClick={() => void handleClick('positive')}
      />
      <FeedbackButton
        kind="negative"
        selected={value === 'negative'}
        loading={isSaving && pendingTarget === 'negative'}
        disabled={isSaving}
        onClick={() => void handleClick('negative')}
      />
    </div>
  );
}

function FeedbackButton({
  kind,
  selected,
  loading,
  disabled,
  onClick,
}: {
  kind: 'positive' | 'negative';
  selected: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isPositive = kind === 'positive';
  const label = selected
    ? isPositive
      ? 'Remove positive feedback'
      : 'Remove negative feedback'
    : isPositive
      ? 'Mark as helpful'
      : 'Mark as unhelpful';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8853A]/60',
        'disabled:cursor-wait',
        selected
          ? isPositive
            ? 'text-[#B8853A] hover:bg-[#B8853A]/10'
            : 'text-[#A93226] hover:bg-[#A93226]/10'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {loading ? <SpinnerIcon /> : isPositive ? <ThumbUpIcon /> : <ThumbDownIcon />}
    </button>
  );
}

function ThumbUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
      <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}
