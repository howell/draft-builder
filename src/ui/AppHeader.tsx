'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Button, buttonClasses } from './Button';

interface AppHeaderProps {
  /** Hide the auth links/buttons (e.g. on the /auth page itself). */
  showAuthActions?: boolean;
  className?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  showAuthActions = true,
  className = '',
}) => {
  const { user, signOut } = useAuth();

  return (
    <header className={`w-full flex items-center justify-between py-4 ${className}`}>
      <Link
        href="/"
        className="text-lg font-bold text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
      >
        Draft Builder
      </Link>
      {showAuthActions && (
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-400">
                {user.email?.split('@')[0]}
              </span>
              <Button variant="ghost" size="sm" onClick={async () => await signOut()}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="px-2 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
              >
                Log in
              </Link>
              <Link href="/auth?mode=signup" className={buttonClasses('primary', 'sm')}>
                Sign up
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default AppHeader;
