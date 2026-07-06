import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

const PASSWORD_MIN = 8;

// A page reload mid-flow (after PASSWORD_RECOVERY has already fired once)
// would otherwise lose the "this is a genuine recovery session" signal,
// since the event is transient and Supabase strips the recovery tokens
// from the URL once processed. This sessionStorage flag survives a reload
// of the same tab without surviving a fresh sign-in elsewhere, and without
// ever being treated as sufficient on its own — it is only ever trusted
// together with a session that Supabase itself currently considers valid.
const RECOVERY_FLAG_KEY = 'ada-coach:password-recovery-active';

// How long we wait for Supabase to process a recovery link's hash tokens
// and fire PASSWORD_RECOVERY before concluding this isn't a genuine
// recovery visit. The listener stays attached after this fires, so a
// slow-but-real event still resolves correctly — this only controls how
// long the loading state is shown before falling back to "invalid" copy.
const RECOVERY_WAIT_MS = 3000;

type RecoveryState = 'checking' | 'ready' | 'invalid';

type FieldName = 'password' | 'confirmPassword';
type Errors = Partial<Record<FieldName, string>>;

// Supabase appends `error`, `error_code`, and `error_description` to the
// redirect URL's hash fragment (not a session) when a recovery link is
// expired, already used, or otherwise invalid.
function readHashError(): { code: string | null; description: string | null } | null {
  if (!window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get('error_code');
  const description = params.get('error_description');
  if (!code && !params.get('error')) return null;
  return { code, description: description ? description.replace(/\+/g, ' ') : null };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');
  const [invalidReason, setInvalidReason] = useState<string | null>(null);

  // "Send me a new reset link" — an expired/invalid link carries no email
  // (Supabase deliberately omits it from the error redirect), so we ask
  // for it again here rather than building a separate page.
  const [resendEmail, setResendEmail] = useState('');
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  // Only a genuine PASSWORD_RECOVERY event unlocks the form — not "any
  // active session." An already-signed-in user who lands on this route
  // (bookmark, back button, shared link) must not be able to change their
  // password without ever proving they know the current one; that path
  // stays on the Settings page's current-password-verified flow.
  useEffect(() => {
    let hadHashError = false;
    let resolved = false;

    const hashError = readHashError();
    if (hashError) {
      hadHashError = true;
      resolved = true;
      setInvalidReason(hashError.description ?? 'This reset link is invalid or has expired.');
      setRecoveryState('invalid');
      // Clean the error tokens out of the visible URL; nothing below
      // should keep re-reading them.
      window.history.replaceState(null, '', window.location.pathname);
    }

    const markReady = () => {
      // An explicit error already won — a later event (there shouldn't
      // be one, but auth state changes are inherently async) must not
      // silently override a link we've already told the user is dead.
      if (hadHashError) return;
      resolved = true;
      sessionStorage.setItem(RECOVERY_FLAG_KEY, '1');
      setRecoveryState('ready');
    };

    // Reload mid-flow: the event already fired once this tab and won't
    // fire again, so trust the flag — but only alongside a session
    // Supabase currently considers valid, never the flag alone.
    if (!hadHashError && sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1') {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) markReady();
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markReady();
      }
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem(RECOVERY_FLAG_KEY);
      }
    });

    const timeout = window.setTimeout(() => {
      if (!resolved) {
        setRecoveryState('invalid');
        setInvalidReason(null);
      }
    }, RECOVERY_WAIT_MS);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const errors = useMemo<Errors>(() => {
    const e: Errors = {};
    if (!password) {
      e.password = 'Password is required';
    } else if (password.length < PASSWORD_MIN) {
      e.password = `Password must be at least ${PASSWORD_MIN} characters`;
    }
    if (!confirmPassword) {
      e.confirmPassword = 'Please confirm your password';
    } else if (confirmPassword !== password) {
      e.confirmPassword = 'Passwords do not match';
    }
    return e;
  }, [password, confirmPassword]);

  const showError = (field: FieldName): string | undefined =>
    touched[field] || submitAttempted ? errors[field] : undefined;

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setFormError(null);

    if (!isValid || isSubmitting || recoveryState !== 'ready') return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(
          'We could not update your password. The reset link may have expired — request a new one and try again.'
        );
        return;
      }
      sessionStorage.removeItem(RECOVERY_FLAG_KEY);
      toast.success('Password updated. You are signed in.');
      navigate('/', { replace: true });
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async (e: FormEvent) => {
    e.preventDefault();
    setResendError(null);
    if (!resendEmail.trim() || resendSubmitting) return;

    setResendSubmitting(true);
    try {
      // Same call and redirect shape as the "Forgot password?" flow on
      // the sign-in page — this page never duplicates that logic, it
      // only offers it again here, since the link that brought them here
      // no longer works.
      const { error } = await supabase.auth.resetPasswordForEmail(resendEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setResendError('We could not send a reset link right now. Please try again in a moment.');
        return;
      }
      setResendSent(true);
    } catch {
      setResendError('Something went wrong. Please try again.');
    } finally {
      setResendSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">Ada</span>
          </h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Customer Discovery Coach
          </p>
        </div>

        {recoveryState === 'checking' && (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying your reset link…
            </CardContent>
          </Card>
        )}

        {recoveryState === 'invalid' && (
          <Card>
            <CardHeader>
              <CardTitle>This link no longer works</CardTitle>
              <CardDescription>
                {invalidReason ??
                  "We couldn't verify a password-reset link here. This page only works from the link in a reset email."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resendSent ? (
                <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  Check your email for a new reset link.
                </p>
              ) : (
                <form onSubmit={handleResend} noValidate className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="resendEmail">Email</Label>
                    <Input
                      id="resendEmail"
                      type="email"
                      autoComplete="email"
                      required
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      disabled={resendSubmitting}
                    />
                  </div>
                  {resendError && (
                    <p className="text-sm text-destructive" role="alert">
                      {resendError}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={resendSubmitting || !resendEmail.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {resendSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {resendSubmitting ? 'Sending...' : 'Send me a new reset link'}
                  </Button>
                </form>
              )}

              <div className="mt-6 text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => navigate('/login', { replace: true })}
                >
                  Back to sign in
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {recoveryState === 'ready' && (
          <Card>
            <CardHeader>
              <CardTitle>Set a new password</CardTitle>
              <CardDescription>
                Choose a new password for your account. You&apos;ll be signed in automatically once
                it&apos;s saved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    disabled={isSubmitting}
                    aria-invalid={!!showError('password')}
                  />
                  {showError('password') && (
                    <p className="text-xs text-destructive" role="alert">
                      {showError('password')}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                    disabled={isSubmitting}
                    aria-invalid={!!showError('confirmPassword')}
                  />
                  {showError('confirmPassword') && (
                    <p className="text-xs text-destructive" role="alert">
                      {showError('confirmPassword')}
                    </p>
                  )}
                </div>

                {formError && (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting || !isValid}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Updating...' : 'Update password'}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => navigate('/login', { replace: true })}
                >
                  Back to sign in
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
