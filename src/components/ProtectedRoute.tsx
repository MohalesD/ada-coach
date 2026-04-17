import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAdmin, useAuth } from '@/lib/auth-context';

type Props = {
  children: ReactNode;
  requireRole?: 'admin';
};

export default function ProtectedRoute({ children, requireRole }: Props) {
  const { user, profile, loading } = useAuth();

  if (loading || (user && !profile)) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-secondary" />
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-secondary"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-secondary"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole === 'admin' && !isAdmin(profile)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
