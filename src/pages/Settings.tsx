import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { DELETE_CONFIRM_PHRASE, deleteAccount, isDeleteConfirmed } from '@/lib/account';
import FeedbackForm from '@/components/FeedbackForm';

const PASSWORD_MIN = 8;

export default function Settings() {
  const { user, profile, updateProfile, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const isOwner = profile?.role === 'owner';

  // ── Builder Journal arrivals (Spec 4 §9) ──
  // An account the bridge created has no password, and the change-password
  // form below needs the current one, so that form cannot serve it. The
  // honest path is the existing email reset flow, offered here as a real
  // button rather than a link to a page that only works from an email.
  const bridgeCreated = user?.user_metadata?.bridge_source === 'builder_journal';
  const [passwordLinkState, setPasswordLinkState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle'
  );

  const handleSendPasswordLink = async () => {
    if (!user?.email || passwordLinkState === 'sending') return;
    setPasswordLinkState('sending');
    // Same call and redirect as "Forgot password?" on the sign-in page.
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPasswordLinkState(error ? 'error' : 'sent');
  };

  // ── Danger zone: account deletion ──
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteReady = isDeleteConfirmed(deleteInput) && !deleting && !isOwner;

  const handleDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!deleteReady) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAccount();
    if (!result.ok) {
      setDeleting(false);
      setDeleteError(
        result.error === 'owner_cannot_delete'
          ? 'Owner accounts cannot be deleted from here.'
          : result.error === 'unauthorized'
            ? 'Your session has expired. Sign in again and retry.'
            : 'Deletion did not complete. Nothing was removed; you can try again.',
      );
      return;
    }
    // The auth user is gone server-side; clear the local session and leave.
    await signOut();
    navigate('/login', { replace: true, state: { accountDeleted: true } });
  };

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
      setProfileError('Could not save your profile. Please try again.');
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
    else if (confirmPassword !== newPassword) e.confirm = 'Passwords do not match';
    return e;
  }, [currentPassword, newPassword, confirmPassword]);

  const showPwError = (key: 'currentPassword' | 'newPassword' | 'confirmPassword', msg?: string) =>
    passwordTouched[key] || passwordSubmitAttempted ? msg : undefined;

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
            <CardDescription>Update how Ada addresses you.</CardDescription>
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
                <Input id="email" type="email" value={user?.email ?? ''} disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  Email is managed by your auth provider and cannot be changed here.
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

            {bridgeCreated ? (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Created through Builder Journal
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    This account was created when you sent an idea from AI Builder Journal. It is
                    matched to your email, has no password yet, and you can always get back in
                    with &ldquo;Email me a sign-in link&rdquo; on the sign-in page.
                  </p>
                </div>
                {passwordLinkState === 'sent' ? (
                  <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                    Check your email for a link to set a password.
                  </p>
                ) : (
                  <>
                    {passwordLinkState === 'error' && (
                      <p className="text-sm text-destructive" role="alert">
                        We could not send the link right now. Please try again in a moment.
                      </p>
                    )}
                    <Button
                      type="button"
                      onClick={() => void handleSendPasswordLink()}
                      disabled={passwordLinkState === 'sending'}
                      className="self-start bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {passwordLinkState === 'sending'
                        ? 'Sending...'
                        : 'Email me a link to set a password'}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-foreground">Change password</h2>
              <p className="text-sm text-muted-foreground">
                Enter your current password to set a new one.
              </p>
            </div>

            <form onSubmit={handlePasswordSave} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onBlur={() => setPasswordTouched((t) => ({ ...t, currentPassword: true }))}
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
                  onBlur={() => setPasswordTouched((t) => ({ ...t, newPassword: true }))}
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
                  onBlur={() => setPasswordTouched((t) => ({ ...t, confirmPassword: true }))}
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
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Send feedback</CardTitle>
            <CardDescription>
              A bug, an idea, or a win — it all gets read, and it all shapes what Ada becomes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeedbackForm surface="settings" />
          </CardContent>
        </Card>

        <Card className="mt-6 border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Delete account</CardTitle>
            <CardDescription>
              Immediate and permanent. Here is exactly what happens, so there are no surprises.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Removed for good:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Your login, email, name, and profile</li>
                <li>Products, portfolio, reports, research, and uploaded files</li>
              </ul>
              <p className="pt-1 font-medium text-foreground">Kept, with your identity removed:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Conversation transcripts and the thumbs ratings on them</li>
                <li>Discovery Sprint sessions and extracted assumptions</li>
                <li>Feedback you sent, so a bug you reported can still be fixed</li>
              </ul>
              <p className="pt-1 text-muted-foreground">
                Ada is a demo, and that retained material is how it gets better. Full details in
                the{' '}
                <Link to="/privacy" className="underline">
                  Demo Privacy Notice
                </Link>
                . You will get one confirmation email and nothing else from us.
              </p>
            </div>

            {isOwner ? (
              <p className="text-sm text-muted-foreground" role="note">
                Owner accounts cannot be deleted from here. Transfer ownership first.
              </p>
            ) : (
              <form onSubmit={handleDeleteAccount} noValidate className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="deleteConfirm">
                    Type <span className="font-mono font-semibold">{DELETE_CONFIRM_PHRASE}</span>{' '}
                    to confirm
                  </Label>
                  <Input
                    id="deleteConfirm"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    disabled={deleting}
                    placeholder={DELETE_CONFIRM_PHRASE}
                  />
                </div>
                {deleteError && (
                  <p className="text-sm text-destructive" role="alert">
                    {deleteError}
                  </p>
                )}
                <Button type="submit" variant="destructive" disabled={!deleteReady}>
                  {deleting ? 'Deleting your account...' : 'Delete my account'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
