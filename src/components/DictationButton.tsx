// The mic beside a chat box. One job: start and stop dictation into it.
//
// Renders nothing where the browser has no speech recognition. While
// listening it is pressed, tinted, and pulses (not under reduced motion), and
// a polite live region says so for screen readers. The first time it is used
// on a page it says, once, where the audio goes.

import { useEffect } from 'react';
import { Mic } from 'lucide-react';
import { toast } from 'sonner';
import { useDictation } from '@/hooks/use-dictation';
import { cn } from '@/lib/utils';

let disclosed = false;

type Props = {
  /** Receives each run of newly heard words; append it to the box. */
  onText: (delta: string) => void;
  /** True while the box cannot take input (sending, locked, out of credits). */
  disabled?: boolean;
  className?: string;
};

export default function DictationButton({ onText, disabled = false, className }: Props) {
  const { supported, listening, toggle, stop } = useDictation({
    onText,
    onError: (message) => toast.error(message),
  });

  // A box that stops taking input stops listening: words must not pile up
  // behind a disabled field while Ada is answering.
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  if (!supported) return null;

  const handleClick = () => {
    if (!listening && !disclosed) {
      disclosed = true;
      toast.message('Listening', {
        description:
          "Your browser turns your speech into text and may send the audio to its own speech service. Ada only receives the words, and nothing is sent to her until you press Send.",
        duration: 8000,
      });
    }
    toggle();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? 'Stop dictation' : 'Dictate your message'}
        title={listening ? 'Stop dictation' : 'Dictate'}
        className={cn(
          'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          listening
            ? 'border-accent bg-accent text-accent-foreground'
            : 'border-border bg-background text-muted-foreground hover:border-accent/60 hover:text-foreground',
          className
        )}
      >
        {listening && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-md ring-2 ring-accent/50 motion-safe:animate-ping"
          />
        )}
        <Mic className="relative h-4 w-4" />
      </button>
      <span role="status" className="sr-only">
        {listening ? 'Listening. Speak, then press the microphone again to stop.' : ''}
      </span>
    </>
  );
}
