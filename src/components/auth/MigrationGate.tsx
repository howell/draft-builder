'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth/context';
import { hasMigratableData } from '../../lib/storage/migration-utils';
import LoadingScreen from '../../ui/LoadingScreen';

interface MigrationGateProps {
  children: React.ReactNode;
}

/**
 * MigrationGate ensures that authenticated users with migratable data
 * are redirected to /migrate before accessing any other authenticated pages.
 * 
 * This prevents the race condition where users see empty dashboards
 * before their data is migrated.
 */
export function MigrationGate({ children }: MigrationGateProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [migrationCheckComplete, setMigrationCheckComplete] = useState(false);

  // Perform migration check when auth state changes
  useEffect(() => {
    const checkForMigration = async () => {
      // Reset check state when auth changes
      setMigrationCheckComplete(false);

      // Wait for auth to complete
      if (authLoading) {
        return;
      }

      // Only check for migratable data if user is authenticated
      // Anonymous users should never be redirected for migration
      if (!user) {
        if (process.env.NODE_ENV === 'test' && process.env.E2E_FIXTURE_MODE === 'true') {
          console.log('[MigrationGate] Anonymous user - skipping migration check');
        }
        setMigrationCheckComplete(true);
        return;
      }

      try {
        const hasData = await hasMigratableData();
        if (hasData) {
          console.log('[MigrationGate] Migratable data found, redirecting to /migrate');
          router.push('/migrate');
          // Don't set check complete - keep loading while redirecting
          return;
        }
        setMigrationCheckComplete(true);
      } catch (error) {
        console.error('[MigrationGate] Error checking for migratable data:', error);
        // On error, allow access to avoid blocking users
        setMigrationCheckComplete(true);
      }
    };

    checkForMigration();
  }, [authLoading, router, user]);

  // For anonymous users or excluded pages, bypass migration check entirely
  const skipMigrationPages = ['/migrate', '/auth', '/'];
  if (!user || skipMigrationPages.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <LoadingScreen waitFor={[
      { loading: authLoading, message: 'Checking authentication...' },
      { condition: () => migrationCheckComplete, message: 'Checking for data migration...' }
    ]}>
      {children}
    </LoadingScreen>
  );
}