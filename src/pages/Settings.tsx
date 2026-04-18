import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';

const PASSWORD_MIN = 8;

export default function Settings() {
  const { user, profile, updateProfile, updatePassword } = useAuth();

  // ── Profile form ──
  const initialDisplayName = profile?.display_name ?? '';
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Keep the field in sync if the profile loads after first render
  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
  }, [profile?.display_name]);

  const trimmedName = displayName.trim();
  const profileDirty = trimmedName !== (profile?.display_name ?? '').trim();
  const profileValid = trimmedName.length > 0;

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    if (savingProfile || !profileValid || !profileDirty) return;
    setSavingProfile(true);
    setProfileError(null);
    const result = await updateProfile({ display_name: trimmedName });
    setSavingProfile(false);
    if (result.error) {
      setProfileError(
        'Could not save your profile. Please try again.',
      );
      return;
    }
    toast.success('Profile updated');
  };

  // ── Password form ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState<{
    currentPassword?: boolean;
    newPassword?: boolean;
    confirmPassword?: boolean;
  }>({});
  const [passwordSubmitAttempted, setPasswordSubmitAttempted] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const passwordErrors = useMemo(() => {
    const e: { current?: string; next?: string; confirm?: string } = {};
    if (!currentPassword) e.current = 'Current password is required';
    if (!newPassword) e.next = 'New password is required';
    else if (newPassword.length < PASSWORD_MIN)
      e.next = `Password must be at least ${PASSWORD_MIN} characters`;
    if (!confirmPassword) e.confirm = 'Please confirm your new password';
    else if (confirmPassword !== newPassword)
      e.confirm = 'Passwords do not match';
    return e;
  }, [currentPassword, newPassword, confirmPassword]);

  const showPwError = (
    key: 'currentPassword' | 'newPassword' | 'confirmPassword',
    msg?: string,
  ) => ((passwordTouched[key] || passwordSubmitAttempted) ? msg : undefined);

  const passwordValid = !Object.values(passwordErrors).some(Boolean);

  const handlePasswordSave = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordSubmitAttempted(true);
    if (savingPassword || !passwordValid) return;
    setSavingPassword(true);
    setPasswordError(null);
    const result = await updatePassword(currentPassword, newPassword);
    setSavingPassword(false);
    if (result.error) {
      setPasswordError(result.error);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordTouched({});
    setPasswordSubmitAttempted(false);
    toast.success('Password updated');
  };

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent hover:underline"
          >
            ← Back to chat
          </Link>
          <h1 className="text-lg font-extrabold tracking-tight">
            <span className="gradient-text">Ada</span>
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update how Ada addresses you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSave} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={savingProfile}
                  aria-invalid={!profileValid}
                />
                {!profileValid && (
                  <p className="text-xs text-destructive" role="alert">
                    Display name is required
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  readOnly
                />
                <p className="text-xs text-muted-foreground">
                  Email is managed by your auth provider and cannot be changed
                  here.
                </p>
              </div>

              {profileError && (
                <p className="text-sm text-destructive" role="alert">
                  {profileError}
                </p>
              )}

              <Button
                type="submit"
                disabled={savingProfile || !profileValid || !profileDirty}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {savingProfile ? 'Saving...' : 'Save changes'}
              </Button>
            </form>

            <Separator className="my-6" />

            <div className="mb-3">
              <h2 className="text-base font-semibold text-foreground">
                Change password
              </h2>
              <p className="text-sm text-muted-foreground">
                Enter your current password to set a new one.
              </p>
            </div>

            <form
              onSubmit={handlePasswordSave}
              noValidate
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onBlur={() =>
                    setPasswordTouched((t) => ({ ...t, currentPassword: true }))
                  }
                  disabled={savingPassword}
                  aria-invalid={!!showPwError('currentPassword', passwordErrors.current)}
                />
                {showPwError('currentPassword', passwordErrors.current) && (
                  <p className="text-xs text-destructive" role="alert">
                    {passwordErrors.current}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onBlur={() =>
                    setPasswordTouched((t) => ({ ...t, newPassword: true }))
                  }
                  disabled={savingPassword}
                  aria-invalid={!!showPwError('newPassword', passwordErrors.next)}
                />
                {showPwError('newPassword', passwordErrors.next) && (
                  <p className="text-xs text-destructive" role="alert">
                    {passwordErrors.next}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() =>
                    setPasswordTouched((t) => ({ ...t, confirmPassword: true }))
                  }
                  disabled={savingPassword}
                  aria-invalid={!!showPwError('confirmPassword', passwordErrors.confirm)}
                />
                {showPwError('confirmPassword', passwordErrors.confirm) && (
                  <p className="text-xs text-destructive" role="alert">
                    {passwordErrors.confirm}
                  </p>
                )}
              </div>

              {passwordError && (
                <p className="text-sm text-destructive" role="alert">
                  {passwordError}
                </p>
              )}

              <Button
                type="submit"
                disabled={savingPassword || !passwordValid}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {savingPassword ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
