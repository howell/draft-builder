/**
 * Data Preview Component
 * Shows users a preview of their data before migration
 */

import React from 'react';
import type { DataSummary } from '../../lib/storage/migration-utils';
import { Card } from '../../ui/Card';

interface DataPreviewProps {
  /** Summary of data to be migrated */
  dataSummary: DataSummary;
  /** Whether to show detailed breakdown */
  showDetails?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Data Preview Component
 * Displays a summary of the data that will be migrated
 */
export const DataPreview: React.FC<DataPreviewProps> = ({
  dataSummary,
  showDetails = true,
  className = ''
}) => {
  const totalItems = dataSummary.leagueCount + dataSummary.draftCount;

  if (totalItems === 0) {
    return (
      <div className={`data-preview ${className}`}>
        <div className="text-center py-8">
          <i className="fas fa-inbox text-3xl text-gray-400 dark:text-gray-500 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Data to Migrate</h3>
          <p className="text-gray-600 dark:text-gray-400">
            You don&apos;t have any saved leagues or drafts to migrate.
            Start by adding your fantasy leagues!
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card className={`data-preview border border-gray-200 dark:border-gray-700 ${className}`} data-testid="migration-preview">
      {/* Header */}
      <div className="flex items-start space-x-3 mb-4">
        <i className="fas fa-chart-bar text-xl text-primary-600 dark:text-primary-400 mt-1" aria-hidden="true" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Fantasy Data</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We found your fantasy data - here&apos;s what will be migrated to your account
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {dataSummary.leagueCount} league{dataSummary.leagueCount !== 1 ? 's' : ''} found with {dataSummary.draftCount} mock draft{dataSummary.draftCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <i className="fas fa-trophy text-lg text-primary-600 dark:text-primary-400" aria-hidden="true" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {dataSummary.leagueCount}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                League{dataSummary.leagueCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <i className="fas fa-clipboard-list text-lg text-primary-600 dark:text-primary-400" aria-hidden="true" />
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {dataSummary.draftCount}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Draft{dataSummary.draftCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Types */}
      {showDetails && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">What will be migrated</h4>

          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <i className="fas fa-trophy text-primary-600 dark:text-primary-400" aria-hidden="true" />
                <span className="text-sm text-gray-700 dark:text-gray-300">League Configurations</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                All settings and connections
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <i className="fas fa-clipboard-list text-primary-600 dark:text-primary-400" aria-hidden="true" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Draft Sessions</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Complete draft history and data
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <div className="flex items-center space-x-2">
                <i className="fas fa-lock text-primary-600 dark:text-primary-400" aria-hidden="true" />
                <span className="text-sm text-gray-700 dark:text-gray-300">ESPN Authentication</span>
              </div>
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                ✓ Securely encrypted
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Migration Benefits */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Migration Benefits</h4>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li className="flex items-center space-x-2">
            <i className="fas fa-check text-xs text-green-500 dark:text-green-400" aria-hidden="true" />
            <span>Access your data from any device</span>
          </li>
          <li className="flex items-center space-x-2">
            <i className="fas fa-check text-xs text-green-500 dark:text-green-400" aria-hidden="true" />
            <span>Automatic cloud backup and sync</span>
          </li>
          <li className="flex items-center space-x-2">
            <i className="fas fa-check text-xs text-green-500 dark:text-green-400" aria-hidden="true" />
            <span>Enhanced security with encryption</span>
          </li>
          <li className="flex items-center space-x-2">
            <i className="fas fa-check text-xs text-green-500 dark:text-green-400" aria-hidden="true" />
            <span>Secure ESPN login preservation</span>
          </li>
        </ul>
      </div>

      {/* Security Note */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 rounded-lg">
        <div className="flex items-start space-x-2">
          <i className="fas fa-lock text-sm text-blue-500 dark:text-blue-400 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <div className="font-medium text-blue-900 dark:text-blue-300">Secure Migration</div>
            <div className="text-blue-700 dark:text-blue-400 mt-1">
              Your ESPN login data will be encrypted and securely transferred.
              We never store your passwords in plain text.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DataPreview;
