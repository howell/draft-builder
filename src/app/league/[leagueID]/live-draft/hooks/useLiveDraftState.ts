'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { LeagueId } from '@/platforms/common';
import { LiveDraftState, LiveDraftSettings } from '@/app/storage/savedLiveDraftTypes';

export interface UseLiveDraftStateOptions {
  leagueId: LeagueId;
  draftId?: string;
  autoSave?: boolean;
}

export interface UseLiveDraftStateReturn {
  // Core state
  draftState: LiveDraftState | null;
  loading: boolean;
  error: string | null;
  saving: boolean;

  // State management functions
  setDraftState: (state: LiveDraftState | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Draft management
  loadDraft: (draftId: string) => Promise<void>;
  saveDraft: (state?: LiveDraftState) => Promise<void>;
  deleteDraft: (state?: LiveDraftState) => Promise<void>;
}

/**
 * Hook for managing core live draft state (loading, saving, error handling)
 */
export function useLiveDraftState({
  leagueId,
  draftId,
  autoSave = true
}: UseLiveDraftStateOptions): UseLiveDraftStateReturn {
  const { storageAdapter } = useAuth();
  
  // Core state
  const [draftState, setDraftState] = useState<LiveDraftState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Load initial draft state on mount or when draftId changes
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        setLoading(true);
        setError(null);

        if (draftId) {
          // Load existing draft
          const loadedDraft = await storageAdapter.loadLiveDraft(leagueId, draftId);
          if (loadedDraft) {
            setDraftState(loadedDraft);
          } else {
            setError(`Draft ${draftId} not found`);
          }
        } else {
          // No specific draft ID - start with null state
          setDraftState(null);
        }
      } catch (err) {
        console.error('Failed to load draft state:', err);
        setError(err instanceof Error ? err.message : 'Failed to load draft');
      } finally {
        setLoading(false);
      }
    };

    loadInitialState();
  }, [leagueId, draftId, storageAdapter]);

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || !draftState || loading || saving) return;

    const saveTimer = setTimeout(async () => {
      try {
        setSaving(true);
        await storageAdapter.saveLiveDraft(leagueId, draftState);
      } catch (err) {
        console.error('Auto-save failed:', err);
        // Don't set error state for auto-save failures to avoid disrupting UX
      } finally {
        setSaving(false);
      }
    }, 1000); // Debounce auto-save by 1 second

    return () => clearTimeout(saveTimer);
  }, [draftState, autoSave, leagueId, storageAdapter, loading, saving]);

  // Load draft by ID
  const loadDraft = async (targetDraftId: string) => {
    try {
      setLoading(true);
      setError(null);

      const loadedDraft = await storageAdapter.loadLiveDraft(leagueId, targetDraftId);
      if (loadedDraft) {
        setDraftState(loadedDraft);
      } else {
        throw new Error(`Draft ${targetDraftId} not found`);
      }
    } catch (err) {
      console.error('Failed to load draft:', err);
      setError(err instanceof Error ? err.message : 'Failed to load draft');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Save current draft state
  const saveDraft = async (stateToSave?: LiveDraftState) => {
    const targetState = stateToSave || draftState;
    if (!targetState) {
      throw new Error('No draft state to save');
    }

    try {
      setSaving(true);
      await storageAdapter.saveLiveDraft(leagueId, targetState);
    } catch (err) {
      console.error('Failed to save draft:', err);
      setError(err instanceof Error ? err.message : 'Failed to save draft');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // Delete draft
  const deleteDraft = async (stateToDelete?: LiveDraftState) => {
    const targetState = stateToDelete || draftState;
    if (!targetState) {
      throw new Error('No draft state to delete');
    }

    try {
      await storageAdapter.deleteLiveDraft(leagueId, targetState.draftId);
      setDraftState(null);
    } catch (err) {
      console.error('Failed to delete draft:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete draft');
      throw err;
    }
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  return {
    // Core state
    draftState,
    loading,
    error,
    saving,

    // State management functions
    setDraftState,
    setError,
    clearError,
    
    // Draft management
    loadDraft,
    saveDraft,
    deleteDraft
  };
}