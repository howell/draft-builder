/**
 * Account Promotion Banner Component
 * Subtle banner to encourage anonymous users to create accounts
 */

import React, { useState } from 'react';
import type { MigrationDataSummary } from '@/types/migration';

interface AccountPromotionBannerProps {
  /** Current user's data summary for personalization */
  dataSummary?: MigrationDataSummary;
  /** Callback when user clicks to create account */
  onCreateAccount?: () => void;
  /** Callback when user dismisses the banner */
  onDismiss?: () => void;
  /** Position of the banner */
  position?: 'top' | 'bottom' | 'inline';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Account Promotion Banner Component
 * Non-intrusive banner that promotes account creation
 */
export const AccountPromotionBanner: React.FC<AccountPromotionBannerProps> = ({
  dataSummary,
  onCreateAccount,
  onDismiss,
  position = 'bottom',
  className = ''
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed) return null;

  const hasSignificantData = dataSummary && (
    dataSummary.leagueCount > 0 || 
    dataSummary.draftCount > 2 || 
    dataSummary.totalSelections > 10
  );

  const getPromotionMessage = () => {
    if (!dataSummary) {
      return {
        primary: "Unlock cloud sync and advanced features",
        secondary: "Create a free account to save your progress"
      };
    }

    if (hasSignificantData) {
      return {
        primary: `Secure your ${dataSummary.draftCount} draft${dataSummary.draftCount !== 1 ? 's' : ''} forever`,
        secondary: "Don't lose your work! Create a free account to backup everything"
      };
    }

    if (dataSummary.leagueCount > 0) {
      return {
        primary: "Never lose your fantasy data again",
        secondary: "Free account includes cloud backup and device sync"
      };
    }

    return {
      primary: "Unlock premium draft features",
      secondary: "Join 10,000+ fantasy managers with free accounts"
    };
  };

  const message = getPromotionMessage();

  const positionClasses = {
    top: 'fixed top-0 left-0 right-0 z-50',
    bottom: 'fixed bottom-0 left-0 right-0 z-50',
    inline: 'relative'
  };

  const backgroundGradients = [
    'bg-gradient-to-r from-blue-500 to-purple-600',
    'bg-gradient-to-r from-green-500 to-blue-600',
    'bg-gradient-to-r from-purple-500 to-pink-600',
    'bg-gradient-to-r from-orange-500 to-red-600'
  ];

  const gradientClass = hasSignificantData 
    ? backgroundGradients[3] // Urgent orange-red for users with lots of data
    : backgroundGradients[Math.floor(Math.random() * 3)]; // Random for others

  return (
    <div className={`account-promotion-banner ${positionClasses[position]} ${className}`}>
      <div className={`${gradientClass} text-white shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            {/* Content */}
            <div className="flex-1 flex items-center space-x-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                <div className="text-2xl">
                  {hasSignificantData ? '⚠️' : '✨'}
                </div>
              </div>

              {/* Message */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {message.primary}
                </div>
                <div className="text-xs opacity-90 mt-1 hidden sm:block">
                  {message.secondary}
                </div>
              </div>

              {/* Data Stats (for users with data) */}
              {hasSignificantData && (
                <div className="hidden md:flex items-center space-x-4 text-xs opacity-90">
                  <div className="flex items-center space-x-1">
                    <span>🏆</span>
                    <span>{dataSummary?.leagueCount} leagues</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span>📝</span>
                    <span>{dataSummary?.draftCount} drafts</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span>👥</span>
                    <span>{dataSummary?.totalSelections} picks</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-3">
              {/* Create Account Button */}
              <button
                onClick={onCreateAccount}
                className={`
                  px-4 py-2 text-xs font-medium rounded-md transition-colors duration-200
                  ${hasSignificantData 
                    ? 'bg-white text-orange-600 hover:bg-orange-50' 
                    : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30'
                  }
                `}
              >
                {hasSignificantData ? 'Save My Data' : 'Create Account'}
              </button>

              {/* Dismiss Button */}
              <button
                onClick={handleDismiss}
                className="p-1 text-white hover:text-gray-200 transition-colors duration-200"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Progress Indicator (for users building data) */}
        {dataSummary && dataSummary.draftCount > 0 && dataSummary.draftCount <= 3 && (
          <div className="border-t border-white border-opacity-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-90">Draft Progress</span>
                <div className="flex items-center space-x-2">
                  <div className="w-16 bg-white bg-opacity-20 rounded-full h-1">
                    <div 
                      className="bg-white rounded-full h-1 transition-all duration-300"
                      style={{ width: `${Math.min((dataSummary.draftCount / 5) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="opacity-90">{dataSummary.draftCount}/5</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtle animations */}
      <style jsx>{`
        .account-promotion-banner {
          animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
          from {
            transform: translateY(${position === 'top' ? '-' : ''}100%);
          }
          to {
            transform: translateY(0);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .account-promotion-banner {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};

export default AccountPromotionBanner;