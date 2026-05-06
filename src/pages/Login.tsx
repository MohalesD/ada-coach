import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot' | 'magic';

type FieldName = 'displayName' | 'email' | 'password' | 'confirmPassword';
type Errors = Partial<Record<FieldName, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicNoAccount, setMagicNoAccount] = useState(false);

  // Reset transient state whenever the user toggles modes
  useEffect(() => {
    setFormError(null);
    setEmailExists(false);
    setTouched({});
    setSubmitAttempted(false);
    setConfirmPassword('');
    setResetSent(false);
    setMagicSent(false);
    setMagicNoAccount(false);
  }, [mode]);

  const requirePassword = mode === 'signin' || mode === 'signup';
  const requireConfirm = mode === 'signup';
  const requireDisplayName = mode === 'signup';

  const errors = useMemo<Errors>(() => {
    const e: Errors = {};
    if (requireDisplayName && !displayName.trim()) {
      e.displayName = 'Display name is required';
    }
    if (!email) {
      e.email = 'Email is required';
    } else if (!EMAIL_RE.test(email)) {
      e.email = 'Enter a valid email address';
    }
    if (requirePassword) {
      if (!password) {
        e.password = 'Password is required';
      } else if (password.length < PASSWORD_MIN) {
        e.password = `Password must be at least ${PASSWORD_MIN} characters`;
      }
    }
    if (requireConfirm) {
      if (!confirmPassword) {
        e.confirmPassword = 'Please confirm your password';
      } else if (confirmPassword !== password) {
        e.confirmPassword = 'Passwords do not match';
      }
    }
    return e;
  }, [
    requireDisplayName,
    requirePassword,
    requireConfirm,
    displayName,
    email,
    password,
    confirmPassword,
  ]);

  const showError = (field: FieldName): string | undefined =>
    touched[field] || submitAttempted ? errors[field] : undefined;

  const isValid = Object.keys(errors).length === 0;

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const switchToSignIn = () => {
    setMode('signin');
    setEmailExists(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);
    setEmailExists(false);
    setMagicNoAccount(false);

    try {
      if (mode === 'signin') {
        const result = await signIn(email, password);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        navigate('/', { replace: true });
        return;
      }

      if (mode === 'signup') {
        const result = await signUp(email, password, displayName.trim());
        if (result.code === 'email_exists') {
          setEmailExists(true);
          return;
        }
        if (result.error) {
          setFormError(result.error);
          return;
        }
        if (result.needsEmailConfirmation) {
          setAwaitingEmailConfirmation(true);
          return;
        }
        toast.success(`Welcome to Ada Coach, ${displayName.trim()}!`);
        navigate('/', { replace: true });
        return;
      }

      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password',
        });
        if (error) {
          setFormError('We could not send a reset link right now. Please try again in a moment.');
          return;
        }
        setResetSent(true);
        return;
      }

      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: window.location.origin + '/',
          },
        });
        if (error) {
          setMagicNoAccount(true);
          return;
        }
        setMagicSent(true);
        return;
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? 'Something went wrong. Please try again.'
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const cardTitle =
    mode === 'signin'
      ? 'Welcome back'
      : mode === 'signup'
        ? 'Create your account'
        : mode === 'forgot'
          ? 'Reset your password'
          : 'Sign in with email link';

  const cardDescription =
    mode === 'signin'
      ? 'Sign in to continue your coaching sessions.'
      : mode === 'signup'
        ? 'Sign up to start pressure-testing your assumptions.'
        : mode === 'forgot'
          ? 'Enter your email and we’ll send you a link to set a new password.'
          : 'Enter your email and we’ll send you a one-tap login link.';

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

        {awaitingEmailConfirmation ? (
          <ConfirmEmailPanel
            email={email}
            onBack={() => {
              setAwaitingEmailConfirmation(false);
              switchToSignIn();
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{cardTitle}</CardTitle>
              <CardDescription>{cardDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                {requireDisplayName && (
                  <Field id="displayName" label="Display name" error={showError('displayName')}>
                    <Input
                      id="displayName"
                      type="text"
                      autoComplete="name"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, displayName: true }))}
                      disabled={isSubmitting}
                      aria-invalid={!!showError('displayName')}
                    />
                  </Field>
                )}

                <Field
                  id="email"
                  label="Email"
                  error={showError('email')}
                  trailing={
                    emailExists ? (
                      <p className="text-xs text-destructive" role="alert">
                        An account with this email already exists.{' '}
                        <button
                          type="button"
                          onClick={switchToSignIn}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Try signing in instead.
                        </button>
                      </p>
                    ) : magicNoAccount && mode === 'magic' ? (
                      <p className="text-xs text-destructive" role="alert">
                        No account found for that email.{' '}
                        <button
                          type="button"
                          onClick={() => setMode('signup')}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Please create an account first.
                        </button>
                      </p>
                    ) : null
                  }
                >
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailExists) setEmailExists(false);
                      if (magicNoAccount) setMagicNoAccount(false);
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    disabled={isSubmitting || resetSent || magicSent}
                    aria-invalid={!!showError('email') || emailExists || magicNoAccount}
                  />
                </Field>

                {requirePassword && (
                  <Field
                    id="password"
                    label="Password"
                    error={showError('password')}
                    trailing={
                      mode === 'signin' ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setMode('forgot')}
                            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            Forgot password?
                          </button>
                        </div>
                      ) : null
                    }
                  >
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                      disabled={isSubmitting}
                      aria-invalid={!!showError('password')}
                    />
                  </Field>
                )}

                {requireConfirm && (
                  <Field
                    id="confirmPassword"
                    label="Confirm password"
                    error={showError('confirmPassword')}
                  >
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
                  </Field>
                )}

                {formError && (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                )}

                {mode === 'forgot' && resetSent && (
                  <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                    Check your email for a reset link.
                  </p>
                )}

                {mode === 'magic' && magicSent && (
                  <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                    Check your email for your login link.
                  </p>
                )}

                {!(mode === 'forgot' && resetSent) && !(mode === 'magic' && magicSent) && (
                  <Button
                    type="submit"
                    disabled={isSubmitting || !isValid}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {submitLabel(mode, isSubmitting)}
                  </Button>
                )}

                {mode === 'signin' && (
                  <>
                    <DividerOr />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setMode('magic')}
                      disabled={isSubmitting}
                    >
                      Sign in with email link
                    </Button>
                  </>
                )}
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                {mode === 'signin' && (
                  <>
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => setMode('signup')}
                    >
                      Create account
                    </button>
                  </>
                )}
                {mode === 'signup' && (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={switchToSignIn}
                    >
                      Sign in
                    </button>
                  </>
                )}
                {(mode === 'forgot' || mode === 'magic') && (
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    onClick={switchToSignIn}
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function submitLabel(mode: Mode, isSubmitting: boolean): string {
  if (mode === 'signin') return isSubmitting ? 'Signing in...' : 'Sign in';
  if (mode === 'signup') return isSubmitting ? 'Creating account...' : 'Create account';
  if (mode === 'forgot') return isSubmitting ? 'Sending...' : 'Send reset link';
  return isSubmitting ? 'Sending...' : 'Send login link';
}

function DividerOr() {
  return (
    <div className="relative my-1 flex items-center">
      <div className="flex-1 border-t border-border" />
      <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">or</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  id,
  label,
  error,
  trailing,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {trailing}
    </div>
  );
}

// ─── Email-confirmation panel ────────────────────────────────────────────────

function ConfirmEmailPanel({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We&apos;ve sent a confirmation link to{' '}
          <span className="font-medium text-foreground">{email}</span>. Click it to activate your
          account, then come back here to sign in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={onBack} className="w-full">
          Back to sign in
        </Button>
      </CardContent>
    </Card>
  );
}
