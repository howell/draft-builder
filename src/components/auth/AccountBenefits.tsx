/**
 * Account Benefits Component
 * Highlights the benefits of creating an account for anonymous users
 */

import React from 'react';
import type { MigrationDataSummary } from '../../types/migration';

interface AccountBenefitsProps {
  /** Current user's data summary to personalize benefits */
  dataSummary?: MigrationDataSummary;
  /** Whether to show compact version */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Account Benefits Component
 * Persuasive component showing the advantages of creating an account
 */
export const AccountBenefits: React.FC<AccountBenefitsProps> = ({
  dataSummary,
  compact = false,
  className = ''
}) => {
  const hasData = dataSummary && (
    dataSummary.leagueCount > 0 || 
    dataSummary.draftCount > 0 || 
    dataSummary.totalSelections > 0
  );

  const benefits = [
    {
      icon: '☁️',
      title: 'Cloud Sync',
      description: 'Access your data from any device, anywhere',
      personalizedDesc: hasData ? 'Never lose your draft work again' : 'Access your data from any device, anywhere'
    },
    {
      icon: '🔒',
      title: 'Secure Backup',
      description: 'Automatic encrypted backups protect your data',
      personalizedDesc: hasData ? `Protect your ${dataSummary?.draftCount || 0} draft${(dataSummary?.draftCount || 0) !== 1 ? 's' : ''} forever` : 'Automatic encrypted backups protect your data'
    },
    {
      icon: '📱',
      title: 'Multi-Device',
      description: 'Seamlessly switch between phone, tablet, and computer',
      personalizedDesc: hasData ? 'Continue your drafts on any device' : 'Seamlessly switch between phone, tablet, and computer'
    },
    {
      icon: '⚡',
      title: 'Enhanced Features',
      description: 'Unlock advanced tools and analytics',
      personalizedDesc: hasData ? 'Get deeper insights into your draft strategy' : 'Unlock advanced tools and analytics'
    },
    {
      icon: '🔄',
      title: 'Auto-Save',
      description: 'Never lose progress with real-time saving',
      personalizedDesc: hasData ? 'All your selections automatically saved' : 'Never lose progress with real-time saving'
    },
    {
      icon: '📊',
      title: 'History Tracking',
      description: 'Track your draft performance over time',
      personalizedDesc: hasData ? 'Build on your existing draft history' : 'Track your draft performance over time'
    }
  ];

  const displayedBenefits = compact ? benefits.slice(0, 3) : benefits;

  if (compact) {
    return (
      <div className={`account-benefits-compact ${className}`}>
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="text-2xl">✨</div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">
                {hasData ? 'Secure Your Progress' : 'Unlock Premium Features'}
              </h3>
              <div className="space-y-2">
                {displayedBenefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm">
                    <span>{benefit.icon}</span>
                    <span className="text-gray-700">
                      {hasData ? benefit.personalizedDesc : benefit.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`account-benefits ${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-4xl mb-4">🚀</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {hasData ? 'Upgrade Your Fantasy Experience' : 'Why Create an Account?'}
        </h2>
        <p className="text-gray-600 max-w-lg mx-auto">
          {hasData 
            ? `You've built something great with ${dataSummary?.leagueCount || 0} league${(dataSummary?.leagueCount || 0) !== 1 ? 's' : ''} and ${dataSummary?.draftCount || 0} draft${(dataSummary?.draftCount || 0) !== 1 ? 's' : ''}. Don't lose it!`
            : 'Join thousands of fantasy managers who trust us with their draft strategies.'
          }
        </p>
      </div>

      {/* Benefits Grid */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {displayedBenefits.map((benefit, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-4">
              <div className="text-3xl">{benefit.icon}</div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-gray-600 text-sm">
                  {hasData ? benefit.personalizedDesc : benefit.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Data Security Guarantee */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
        <div className="flex items-start space-x-3">
          <div className="text-green-600 text-xl">🛡️</div>
          <div>
            <h3 className="font-semibold text-green-800 mb-2">Your Data is Safe</h3>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• End-to-end encryption for all sensitive data</li>
              <li>• SOC 2 compliant infrastructure</li>
              <li>• Regular automated backups</li>
              <li>• Zero downtime data migration</li>
              {dataSummary?.hasEspnAuthData && (
                <li>• ESPN credentials encrypted with military-grade security</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Social Proof */}
      <div className="text-center">
        <div className="flex justify-center items-center space-x-2 text-sm text-gray-600 mb-4">
          <div className="flex -space-x-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="w-8 h-8 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
          <span>Join 10,000+ fantasy managers</span>
        </div>
        
        <div className="text-xs text-gray-500">
          ⭐⭐⭐⭐⭐ &quot;Best draft tool I&apos;ve ever used&quot; - Fantasy Champion 2024
        </div>
      </div>

      {/* Urgency Message for Users with Data */}
      {hasData && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <div className="text-amber-600 text-sm">⚠️</div>
            <div className="text-sm">
              <div className="font-medium text-amber-800">Don&apos;t Lose Your Work</div>
              <div className="text-amber-700 mt-1">
                Your browser data could be lost due to updates, crashes, or clearing cache. 
                Create an account to permanently save your {dataSummary?.totalSelections || 0} player selections 
                and draft strategies.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountBenefits;