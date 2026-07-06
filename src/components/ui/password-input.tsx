import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const REVEAL_DURATION_MS = 10000;

export type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>;

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, onKeyDown, onKeyUp, onBlur, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);
    const [capsLockOn, setCapsLockOn] = React.useState(false);
    const hideTimer = React.useRef<number | null>(null);

    React.useEffect(() => {
      return () => {
        if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      };
    }, []);

    const clearHideTimer = () => {
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };

    const toggleVisible = () => {
      setVisible((current) => {
        const next = !current;
        clearHideTimer();
        if (next) {
          // A revealed password left on-screen (screen share, shoulder
          // surf) is a real exposure window; don't rely on the user
          // remembering to hide it again themselves.
          hideTimer.current = window.setTimeout(() => {
            setVisible(false);
            hideTimer.current = null;
          }, REVEAL_DURATION_MS);
        }
        return next;
      });
    };

    const detectCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (typeof e.getModifierState === 'function') {
        setCapsLockOn(e.getModifierState('CapsLock'));
      }
    };

    return (
      <div className="flex flex-col gap-1">
        <div className="relative">
          <Input
            {...props}
            ref={ref}
            type={visible ? 'text' : 'password'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={cn('pr-10', className)}
            onKeyDown={(e) => {
              detectCapsLock(e);
              onKeyDown?.(e);
            }}
            onKeyUp={(e) => {
              detectCapsLock(e);
              onKeyUp?.(e);
            }}
            onBlur={(e) => {
              setCapsLockOn(false);
              onBlur?.(e);
            }}
          />
          {/* tabIndex=-1: this toggle is a convenience, not a form field —
              it must not steal Tab order from the password/confirm/submit
              sequence. Paste is intentionally never blocked here (NIST SP
              800-63B: blocking paste discourages password managers). */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={toggleVisible}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {capsLockOn && (
          <p className="text-xs text-amber-600 dark:text-amber-400" role="status">
            Caps Lock is on
          </p>
        )}
      </div>
    );
  }
);
