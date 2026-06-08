/**
 * Migration Success Component
 * Celebratory component shown after successful data migration
 */

import React, { useState } from 'react';
import type { MigrationResult } from '../../types/migration';

interface MigrationSuccessProps {
  /** Result of the completed migration */
  migrationResult: MigrationResult;
  /** User's name or email for personalization */
  userName?: string;
  /** Callback when user wants to continue */
  onContinue?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Migration Success Component
 * Displays celebration and summary of successful migration
 */
export const MigrationSuccess: React.FC<MigrationSuccessProps> = ({
  migrationResult,
  userName,
  onContinue,
  className = ''
}) => {
  const formatDuration = (milliseconds?: number): string => {
    if (!milliseconds) return 'instantly';
    
    const seconds = Math.round(milliseconds / 1000);
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  // Pick a celebratory message and confetti layout once on mount (lazy state init) so
  // they stay stable across renders and avoid calling impure functions during render.
  const [encouragingMessage] = useState(() => {
    const messages = [
      "Your fantasy empire awaits! 🏰",
      "Ready to dominate this season! 💪",
      "Your data is now safely in the cloud! ☁️",
      "Time to crush some drafts! 🚀",
      "Your fantasy journey continues! ⭐"
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  });

  const [confettiPieces] = useState(() => {
    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];
    return Array.from({ length: 20 }, () => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      backgroundColor: colors[Math.floor(Math.random() * colors.length)],
      animationDelay: `${Math.random() * 2}s`,
      animationDuration: `${1 + Math.random() * 2}s`,
    }));
  });

  const totalItems = (migrationResult.migratedLeagues || 0) + (migrationResult.migratedDrafts || 0);

  return (
    <div className={`migration-success ${className}`}>
      {/* Celebration Header */}
      <div className="text-center mb-6">
        <div className="text-6xl mb-4 animate-bounce">🎉</div>
        <h2 className="text-2xl font-bold text-green-600 mb-2">
          Migration Complete!
        </h2>
        <p className="text-lg text-gray-700">
          {userName ? `Welcome to your account, ${userName}!` : 'Welcome to your new account!'}
        </p>
        <p className="text-sm text-gray-600 mt-2">
          {encouragingMessage}
        </p>
      </div>

      {/* Migration Summary */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
        <h3 className="font-semibold text-green-800 mb-4 flex items-center">
          <span className="mr-2">📊</span>
          Migration Summary
        </h3>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Leagues Migrated */}
          <div className="text-center">
            <div className="text-3xl font-bold text-green-700">
              {migrationResult.migratedLeagues || 0}
            </div>
            <div className="text-sm text-green-600">
              League{(migrationResult.migratedLeagues || 0) !== 1 ? 's' : ''} Migrated
            </div>
          </div>

          {/* Drafts Migrated */}
          <div className="text-center">
            <div className="text-3xl font-bold text-green-700">
              {migrationResult.migratedDrafts || 0}
            </div>
            <div className="text-sm text-green-600">
              Draft{(migrationResult.migratedDrafts || 0) !== 1 ? 's' : ''} Migrated
            </div>
          </div>
        </div>

        {/* Performance Stats */}
        <div className="border-t border-green-200 pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-green-700">Migration Time:</span>
              <span className="font-medium text-green-800">
                {formatDuration(migrationResult.duration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-700">Total Items:</span>
              <span className="font-medium text-green-800">
                {totalItems.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* What's Next */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="font-semibold text-blue-800 mb-3 flex items-center">
          <span className="mr-2">🚀</span>
          What&apos;s Next?
        </h3>
        
        <ul className="space-y-2 text-sm text-blue-700">
          <li className="flex items-center space-x-2">
            <span className="text-blue-500">✓</span>
            <span>Your data is now synced across all your devices</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-blue-500">✓</span>
            <span>Automatic backups ensure your work is never lost</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-blue-500">✓</span>
            <span>Enhanced features are now available in your account</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-blue-500">✓</span>
            <span>ESPN login data is securely encrypted and stored</span>
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col space-y-3">
        {onContinue && (
          <button
            onClick={onContinue}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <span>Continue to Dashboard</span>
            <span>→</span>
          </button>
        )}
        
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors duration-200"
        >
          Refresh Page
        </button>
      </div>

      {/* Confetti Animation */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="confetti-animation">
          {/* Animated confetti elements */}
          {confettiPieces.map((piece, i) => (
            <div
              key={i}
              className={`absolute w-2 h-2 opacity-70 animate-ping`}
              style={piece}
            />
          ))}
        </div>
      </div>

      {/* Technical Details (Collapsible) */}
      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
          Technical Details
        </summary>
        <div className="mt-3 p-4 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">
          <div>Migration ID: {migrationResult.migrationId}</div>
          {migrationResult.startTime && (
            <div>Started: {migrationResult.startTime.toLocaleString()}</div>
          )}
          {migrationResult.endTime && (
            <div>Completed: {migrationResult.endTime.toLocaleString()}</div>
          )}
        </div>
      </details>
    </div>
  );
};

export default MigrationSuccess;