import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';

export function useProtectedRoute(requireAdmin = false) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (requireAdmin && !user?.isSystemAdmin) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, user, requireAdmin, router]);

  return { isReady: !isLoading && isAuthenticated };
}
