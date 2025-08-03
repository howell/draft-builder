/**
 * Migration Progress Component
 * Shows real-time progress of data migration with phase information
 */

import React from 'react';
import type { MigrationProgress } from '../../types/migration';

interface MigrationProgressProps {
  /** Current migration progress */
  progress: MigrationProgress;
  /** Whether migration is currently active */
  isActive?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Migration Progress Component
 * Displays a progress bar with phase information and current status
 */
export const MigrationProgressComponent: React.FC<MigrationProgressProps> = ({
  progress,
  isActive = true,
  className = ''
}) => {
  const phaseLabels = {
    export: 'Loading your data...',
    transform: 'Preparing data...',
    validate: 'Validating data...',
    upload: 'Uploading to cloud...',
    verify: 'Verifying data...',
    complete: 'Migration complete!'
  };

  const phaseIcons = {
    export: '📦',
    transform: '🔧',
    validate: '✅',
    upload: '☁️',
    verify: '🔍',
    complete: '🎉'
  };

  const progressPercentage = Math.min(Math.max(progress.progress, 0), 100);
  const isError = !!progress.error;
  const isComplete = progress.phase === 'complete' && progressPercentage === 100;

  return (
    <div className={`migration-progress ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-xl" role="img" aria-label={`Phase ${progress.phase}`}>
            {phaseIcons[progress.phase]}
          </span>
          <h3 className="font-semibold text-gray-900">
            {isError ? 'Migration Error' : phaseLabels[progress.phase]}
          </h3>
        </div>
        
        <div className="text-sm font-medium text-gray-600">
          {progressPercentage.toFixed(0)}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="overflow-hidden h-3 mb-3 text-xs flex rounded bg-gray-200">
          <div
            style={{ width: `${progressPercentage}%` }}
            className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-300 ${
              isError 
                ? 'bg-red-500' 
                : isComplete 
                  ? 'bg-green-500' 
                  : 'bg-blue-500'
            }`}
          />
        </div>
        
        {/* Animated loading indicator */}
        {isActive && !isComplete && !isError && (
          <div className="absolute top-0 left-0 h-3 w-full overflow-hidden rounded">
            <div className="h-full bg-blue-300 opacity-30 animate-pulse" />
          </div>
        )}
      </div>

      {/* Status Message */}
      <div className="text-sm">
        {isError ? (
          <div className="text-red-600 bg-red-50 p-3 rounded border">
            <div className="font-medium">Migration Failed</div>
            <div className="mt-1">{progress.error}</div>
          </div>
        ) : (
          <div className={`${isComplete ? 'text-green-600' : 'text-gray-600'}`}>
            {progress.message}
          </div>
        )}
      </div>

      {/* Phase Indicators */}
      <div className="mt-4 flex justify-between text-xs">
        {Object.keys(phaseLabels).map((phase, index) => {
          const isCurrentPhase = progress.phase === phase;
          const isCompletedPhase = Object.keys(phaseLabels).indexOf(progress.phase) > index;
          const phaseKey = phase as keyof typeof phaseLabels;
          
          return (
            <div
              key={phase}
              className={`flex flex-col items-center space-y-1 ${
                isCurrentPhase 
                  ? 'text-blue-600' 
                  : isCompletedPhase 
                    ? 'text-green-600' 
                    : 'text-gray-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                  isCurrentPhase 
                    ? 'border-blue-600 bg-blue-50' 
                    : isCompletedPhase 
                      ? 'border-green-600 bg-green-50' 
                      : 'border-gray-300 bg-gray-50'
                }`}
              >
                {isCompletedPhase ? '✓' : index + 1}
              </div>
              <span className="text-center max-w-16 leading-tight">
                {phase === 'export' ? 'Load' : 
                 phase === 'transform' ? 'Prep' :
                 phase === 'validate' ? 'Check' :
                 phase === 'upload' ? 'Upload' :
                 phase === 'verify' ? 'Verify' :
                 'Done'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MigrationProgressComponent;