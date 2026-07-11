// Floating feedback entry point (chat + Discovery surfaces). One job:
// summon the feedback form from anywhere on the page without stealing
// the composer's space. First visit shows a one-time helper bubble —
// dismissed by using the button, or by closing it. Submissions are
// tagged source_surface='fab' per the unified feedback convention.

import { useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import FeedbackForm from '@/components/FeedbackForm';

const TIP_KEY = 'ada-feedback-fab-tip-seen';

export default function FeedbackFab({ raised = false }: { raised?: boolean }) {
  const [open, setOpen] = useState(false);
  // Lazy init: the tip shows only until it's been seen once. If storage is
  // unavailable, skip the tip rather than nag on every visit.
  const [showTip, setShowTip] = useState(() => {
    try {
      return !localStorage.getItem(TIP_KEY);
    } catch {
      return false;
    }
  });

  const dismissTip = () => {
    setShowTip(false);
    try {
      localStorage.setItem(TIP_KEY, '1');
    } catch {
      // best-effort
    }
  };

  const handleOpen = () => {
    if (showTip) dismissTip();
    setOpen(true);
  };

  return (
    <>
      <div
        className={cn('fixed right-5 z-40 flex items-end gap-2', raised ? 'bottom-24' : 'bottom-5')}
      >
        {showTip && (
          <div
            role="status"
            className="animate-tip-in relative mb-1 max-w-[220px] rounded-xl border border-accent/40 bg-card px-3.5 py-2.5 shadow-md"
          >
            <p className="text-xs leading-relaxed text-foreground">
              Spot a bug, or have a thought while you work? This button comes straight to me.
            </p>
            <button
              type="button"
              onClick={dismissTip}
              aria-label="Dismiss tip"
              className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-card p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={11} aria-hidden />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Send feedback"
          title="Send feedback"
          className={cn(
            'animate-fab-in flex h-12 w-12 items-center justify-center rounded-full shadow-lg',
            'bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
          )}
        >
          <MessageSquarePlus size={20} aria-hidden />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Tell me how it's going</DialogTitle>
            <DialogDescription>
              A bug, an idea, or a win — it all gets read, and it all shapes what Ada becomes.
            </DialogDescription>
          </DialogHeader>
          <FeedbackForm surface="fab" />
        </DialogContent>
      </Dialog>
    </>
  );
}
