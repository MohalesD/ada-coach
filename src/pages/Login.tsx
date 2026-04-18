import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';

type Mode = 'signin' | 'signup';

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
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] =
    useState(false);

  // Reset transient state whenever the user toggles modes
  useEffect(() => {
    setFormError(null);
    setEmailExists(false);
    setTouched({});
    setSubmitAttempted(false);
    setConfirmPassword('');
  }, [mode]);

  const errors = useMemo<Errors>(() => {
    const e: Errors = {};
    if (mode === 'signup' && !displayName.trim()) {
      e.displayName = 'Display name is required';
    }
    if (!email) {
      e.email = 'Email is required';
    } else if (!EMAIL_RE.test(email)) {
      e.email = 'Enter a valid email address';
    }
    if (!password) {
      e.password = 'Password is required';
    } else if (password.length < PASSWORD_MIN) {
      e.password = `Password must be at least ${PASSWORD_MIN} characters`;
    }
    if (mode === 'signup') {
      if (!confirmPassword) {
        e.confirmPassword = 'Please confirm your password';
      } else if (confirmPassword !== password) {
        e.confirmPassword = 'Passwords do not match';
      }
    }
    return e;
  }, [mode, displayName, email, password, confirmPassword]);

  const showError = (field: FieldName): string | undefined =>
    (touched[field] || submitAttempted) ? errors[field] : undefined;

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
    } finally {
      setIsSubmitting(false);
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
              <CardTitle>
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </CardTitle>
              <CardDescription>
                {mode === 'signin'
                  ? 'Sign in to continue your coaching sessions.'
                  : 'Sign up to start pressure-testing your assumptions.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                {mode === 'signup' && (
                  <Field
                    id="displayName"
                    label="Display name"
                    error={showError('displayName')}
                  >
                    <Input
                      id="displayName"
                      type="text"
                      autoComplete="name"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      onBlur={() =>
                        setTouched((t) => ({ ...t, displayName: true }))
                      }
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
                      <p
                        className="text-xs text-destructive"
                        role="alert"
                      >
                        An account with this email already exists.{' '}
                        <button
                          type="button"
                          onClick={switchToSignIn}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Try signing in instead.
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
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    disabled={isSubmitting}
                    aria-invalid={!!showError('email') || emailExists}
                  />
                </Field>

                <Field
                  id="password"
                  label="Password"
                  error={showError('password')}
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete={
                      mode === 'signin' ? 'current-password' : 'new-password'
                    }
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    disabled={isSubmitting}
                    aria-invalid={!!showError('password')}
                  />
                </Field>

                {mode === 'signup' && (
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
                      onBlur={() =>
                        setTouched((t) => ({ ...t, confirmPassword: true }))
                      }
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

                <Button
                  type="submit"
                  disabled={isSubmitting || !isValid}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSubmitting
                    ? mode === 'signin'
                      ? 'Signing in...'
                      : 'Creating account...'
                    : mode === 'signin'
                      ? 'Sign in'
                      : 'Create account'}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                {mode === 'signin' ? (
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
                ) : (
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
              </div>
            </CardContent>
          </Card>
        )}
      </div>
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

function ConfirmEmailPanel({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We&apos;ve sent a confirmation link to{' '}
          <span className="font-medium text-foreground">{email}</span>. Click it
          to activate your account, then come back here to sign in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="w-full"
        >
          Back to sign in
        </Button>
      </CardContent>
    </Card>
  );
}
