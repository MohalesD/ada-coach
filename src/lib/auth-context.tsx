import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type UserRole = 'user' | 'admin' | 'owner';

export type UserProfile = {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
};

type AuthResult = { error: string | null };

export type SignUpResult = {
  error: string | null;
  code?: 'email_exists';
  needsEmailConfirmation: boolean;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: { display_name?: string }) => Promise<AuthResult>;
  updatePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('fetchProfile error:', error);
    return null;
  }
  return (data as UserProfile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [user]);

  // Initial session + subscription
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user ?? null;
      if (cancelled) return;

      setUser(sessionUser);
      if (sessionUser) {
        const p = await fetchProfile(sessionUser.id);
        if (!cancelled) setProfile(p);
      }
      if (!cancelled) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void fetchProfile(nextUser.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string,
    ): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: displayName ? { display_name: displayName } : undefined,
        },
      });

      if (error) {
        const msg = error.message ?? '';
        const isDuplicate =
          /already registered|already.*exists|user already/i.test(msg);
        return {
          error: msg,
          code: isDuplicate ? 'email_exists' : undefined,
          needsEmailConfirmation: false,
        };
      }

      // When email confirmation is enabled in Supabase, signUp returns
      // a user but no session — the user must click the email link first.
      const needsEmailConfirmation = !data.session;
      return { error: null, needsEmailConfirmation };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: { display_name?: string }): Promise<AuthResult> => {
      if (!user) return { error: 'Not signed in' };
      const { error } = await supabase
        .from('user_profiles')
        .update(patch)
        .eq('id', user.id);
      if (error) return { error: error.message };
      await refreshProfile();
      return { error: null };
    },
    [user, refreshProfile],
  );

  const updatePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
    ): Promise<AuthResult> => {
      if (!user?.email) return { error: 'Not signed in' };

      // Verify the current password by attempting a sign-in. Supabase has
      // no built-in current-password check on updateUser.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyErr) {
        return { error: 'Current password is incorrect' };
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateErr) return { error: updateErr.message };
      return { error: null };
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      updateProfile,
      updatePassword,
    }),
    [
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      updateProfile,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function isAdmin(profile: UserProfile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'owner';
}
