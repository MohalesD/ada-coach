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

type FieldName = 'password' | 'confirmPassword';
type Errors = Partial<Record<FieldName, string>>;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  // Supabase parses the recovery token from the URL hash and emits
  // PASSWORD_RECOVERY (or just sets the session). We treat any active
  // session as license to call updateUser.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasRecoverySession(!!data.session);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasRecoverySession(!!session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
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

    if (!isValid || isSubmitting) return;

    if (!hasRecoverySession) {
      setFormError(
        'This reset link is invalid or has expired. Request a new one from the sign-in page.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(
          'We could not update your password. The reset link may have expired — request a new one and try again.'
        );
        return;
      }
      toast.success('Password updated. You are signed in.');
      navigate('/', { replace: true });
    } catch {
      setFormError('Something went wrong. Please try again.');
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
      </div>
    </div>
  );
}
