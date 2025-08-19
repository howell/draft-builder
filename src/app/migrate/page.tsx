'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth/context';
import { getLocalStorageDataSummary, clearLocalStorageData } from '../../lib/storage/migration-utils';
import { DataMigrationService } from '../../lib/storage/migration-service';
import { supabase } from '../../lib/supabase';
import LoadingScreen from '@/ui/LoadingScreen';
import type { DataSummary } from '../../lib/storage/migration-utils';
import type { MigrationProgress } from '../../types/migration';

export default function MigratePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [migrationState, setMigrationState] = useState<'loading' | 'ready' | 'migrating' | 'deleting'>('loading');
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth');
    }
  }, [user, authLoading, router]);

  // Load migration data summary
  useEffect(() => {
    const loadDataSummary = async () => {
      if (!user) return;
      
      try {
        const summary = await getLocalStorageDataSummary();
        
        // If no data to migrate, redirect to dashboard
        if (summary.leagueCount === 0 && summary.draftCount === 0) {
          router.push('/dashboard');
          return;
        }
        
        setDataSummary(summary);
        setMigrationState('ready');
      } catch (error) {
        console.error('Failed to load migration data summary:', error);
        setError('Failed to analyze your local data. Please try again.');
        setMigrationState('ready');
      }
    };

    if (user && migrationState === 'loading') {
      loadDataSummary();
    }
  }, [user, migrationState, router]);

  // Handle migration
  const handleMigrate = async () => {
    if (!user) {
      return;
    }
    
    setMigrationState('migrating');
    setError(null);
    
    try {
      const migrationService = new DataMigrationService(
        supabase,
        user.id,
        (progress: MigrationProgress) => {
          setMigrationProgress(progress);
        }
      );
      
      // Start the migration and get the promise
      const migrationPromise = migrationService.migrateAllUserData();
      
      // Create loading task for UI feedback
      setIsProcessing(true);
      setProcessingMessage('Migrating your fantasy data to the cloud...');
      
      await migrationPromise;
      
      // Migration completed successfully
      setIsProcessing(false);
      setProcessingMessage('');
      router.push('/dashboard');
      
    } catch (error) {
      console.error('Migration failed:', error);
      setError(error instanceof Error ? error.message : 'Migration failed');
      setMigrationState('ready');
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  // Handle delete local data
  const handleDeleteData = async () => {
    setMigrationState('deleting');
    setError(null);
    
    try {
      const deletePromise = (async () => {
        await clearLocalStorageData();
        // Small delay to show the user something happened
        await new Promise(resolve => setTimeout(resolve, 1000));
      })();
      
      setIsProcessing(true);
      setProcessingMessage('Deleting local data...');
      
      await deletePromise;
      
      // Deletion completed, redirect to dashboard
      setIsProcessing(false);
      setProcessingMessage('');
      router.push('/dashboard');
      
    } catch (error) {
      console.error('Failed to delete local data:', error);
      setError('Failed to delete local data. Please try again.');
      setMigrationState('ready');
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  // Combine all loading states into a single LoadingScreen
  const loadingDependencies = [
    { loading: authLoading || migrationState === 'loading', message: 'Loading...' },
    { loading: isProcessing, message: processingMessage || 'Processing...' }
  ];

  if (!user && !authLoading) {
    return null; // Will redirect
  }

  return (
    <LoadingScreen waitFor={loadingDependencies}>
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            We Found Your Fantasy Data!
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            You have existing fantasy data on this device. What would you like to do with it?
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            
            {/* Data Summary */}
            {dataSummary && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-3">Your Data Summary:</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-blue-800">Leagues:</span>
                    <span className="text-blue-700 ml-2" data-testid="migration-leagues-count">{dataSummary.leagueCount}</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-800">Drafts:</span>
                    <span className="text-blue-700 ml-2" data-testid="migration-drafts-count">{dataSummary.draftCount}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Migration Progress */}
            {migrationProgress && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-900 mb-2">Migration Progress</h3>
                <div className="w-full bg-green-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${migrationProgress.progress}%` }}
                  />
                </div>
                <p className="text-green-700 text-sm mt-2">{migrationProgress.message}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-4">
              {/* Migrate Button */}
              <button
                onClick={handleMigrate}
                disabled={migrationState !== 'ready'}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {migrationState === 'migrating' ? 'Migrating...' : '📊 Migrate My Data to Cloud'}
              </button>
              
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-2">Benefits of migration:</div>
                <div className="text-xs text-gray-600">
                  ✓ Access from any device • ✓ Automatic backup • ✓ Enhanced security
                </div>
              </div>

              {/* Delete Button */}
              <button
                onClick={handleDeleteData}
                disabled={migrationState !== 'ready'}
                className="w-full flex justify-center py-2 px-4 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {migrationState === 'deleting' ? 'Deleting...' : '🗑️ Delete Local Data & Start Fresh'}
              </button>
              
              <p className="text-xs text-gray-500 text-center">
                Warning: Deleting will permanently remove your local fantasy data
              </p>
            </div>
          </div>
        </div>
      </div>
    </LoadingScreen>
  );
}