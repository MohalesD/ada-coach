// What `/` shows: the public landing page to a signed-out visitor, the
// chat to a signed-in one. The landing page is loaded lazily so it adds
// nothing to the bundle a signed-in user downloads.

import { Suspense, lazy } from 'react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import Index from '@/pages/Index';

const Landing = lazy(() => import('@/pages/Landing'));

export default function HomeRoute() {
  const { user, loading } = useAuth();
  if (!loading && !user) {
    return (
      <Suspense fallback={<div className="h-[100dvh] bg-[#1c140b]" />}>
        <Landing />
      </Suspense>
    );
  }
  // ProtectedRoute owns the loading state.
  return (
    <ProtectedRoute>
      <Index />
    </ProtectedRoute>
  );
}
