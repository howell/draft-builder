/**
 * Data Preview Component
 * Shows users a preview of their data before migration
 */

import React from 'react';
import type { MigrationDataSummary } from '@/types/migration';

interface DataPreviewProps {
  /** Summary of data to be migrated */
  dataSummary: MigrationDataSummary;
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
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const totalItems = dataSummary.leagueCount + dataSummary.draftCount + 
                    dataSummary.totalSelections + dataSummary.costAdjustments;

  if (totalItems === 0) {
    return (
      <div className={`data-preview ${className}`}>
        <div className="text-center py-8">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Data to Migrate</h3>
          <p className="text-gray-600">
            You don't have any saved leagues or drafts to migrate.
            Start by adding your fantasy leagues!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`data-preview ${className}`}>
      {/* Header */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="text-2xl">📊</div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Your Fantasy Data</h3>
          <p className="text-sm text-gray-600">
            Here's what will be migrated to your account
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-blue-600 text-xl">🏆</span>
            <div>
              <div className="text-2xl font-bold text-blue-900">
                {dataSummary.leagueCount}
              </div>
              <div className="text-sm text-blue-700">
                League{dataSummary.leagueCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-green-600 text-xl">📝</span>
            <div>
              <div className="text-2xl font-bold text-green-900">
                {dataSummary.draftCount}
              </div>
              <div className="text-sm text-green-700">
                Draft{dataSummary.draftCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      {showDetails && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Detailed Breakdown</h4>
          
          <div className="space-y-2">
            {/* Player Selections */}
            {dataSummary.totalSelections > 0 && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <span className="text-orange-500">👥</span>
                  <span className="text-sm text-gray-700">Player Selections</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {dataSummary.totalSelections.toLocaleString()}
                </span>
              </div>
            )}

            {/* Cost Adjustments */}
            {dataSummary.costAdjustments > 0 && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <span className="text-purple-500">💰</span>
                  <span className="text-sm text-gray-700">Cost Adjustments</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {dataSummary.costAdjustments.toLocaleString()}
                </span>
              </div>
            )}

            {/* ESPN Authentication */}
            {dataSummary.hasEspnAuthData && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <span className="text-red-500">🔐</span>
                  <span className="text-sm text-gray-700">ESPN Login Data</span>
                </div>
                <span className="text-sm font-medium text-green-600">
                  ✓ Saved
                </span>
              </div>
            )}

            {/* Data Size */}
            {dataSummary.estimatedSizeBytes && dataSummary.estimatedSizeBytes > 0 && (
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-500">💾</span>
                  <span className="text-sm text-gray-700">Estimated Size</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {formatFileSize(dataSummary.estimatedSizeBytes)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Migration Benefits */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Migration Benefits</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li className="flex items-center space-x-2">
            <span className="text-green-500 text-xs">✓</span>
            <span>Access your data from any device</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-green-500 text-xs">✓</span>
            <span>Automatic cloud backup and sync</span>
          </li>
          <li className="flex items-center space-x-2">
            <span className="text-green-500 text-xs">✓</span>
            <span>Enhanced security with encryption</span>
          </li>
          {dataSummary.hasEspnAuthData && (
            <li className="flex items-center space-x-2">
              <span className="text-green-500 text-xs">✓</span>
              <span>Secure ESPN login preservation</span>
            </li>
          )}
        </ul>
      </div>

      {/* Security Note */}
      {dataSummary.hasEspnAuthData && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <span className="text-blue-500 text-sm">🔒</span>
            <div className="text-sm">
              <div className="font-medium text-blue-900">Secure Migration</div>
              <div className="text-blue-700 mt-1">
                Your ESPN login data will be encrypted and securely transferred.
                We never store your passwords in plain text.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataPreview;