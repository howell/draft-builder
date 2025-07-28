import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { AppAlertSystem } from './app-alerts';

/**
 * Application-focused Supabase client wrapper.
 * Tracks business-relevant metrics and user experience issues.
 */
export class AppSupabaseClient {
  constructor(private client: SupabaseClient, private userId?: string) {}
  
  from(table: string) {
    const originalFrom = this.client.from(table);
    
    return {
      ...originalFrom,
      
      // Wrap operations to track application-specific concerns
      select: (columns?: string) => {
        const query = originalFrom.select(columns);
        return this.wrapBusinessQuery(`select_${table}`, query, table);
      },
      
      insert: (values: any) => {
        const query = originalFrom.insert(values);
        return this.wrapBusinessQuery(`insert_${table}`, query, table);
      },
      
      update: (values: any) => {
        const query = originalFrom.update(values);
        return this.wrapBusinessQuery(`update_${table}`, query, table);
      },
      
      delete: () => {
        const query = originalFrom.delete();
        return this.wrapBusinessQuery(`delete_${table}`, query, table);
      },
      
      upsert: (values: any) => {
        const query = originalFrom.upsert(values);
        return this.wrapBusinessQuery(`upsert_${table}`, query, table);
      }
    };
  }
  
  // Expose auth and storage without wrapping
  get auth() {
    return this.client.auth;
  }
  
  get storage() {
    return this.client.storage;
  }
  
  /**
   * Tracks business-relevant metrics rather than raw performance
   */
  private wrapBusinessQuery(operation: string, query: any, table: string) {
    const startTime = performance.now();
    
    const monitoredPromise = query.then(
      (result: any) => {
        const duration = performance.now() - startTime;
        this.trackBusinessMetrics(operation, table, duration, result, null);
        return result;
      },
      (error: any) => {
        const duration = performance.now() - startTime;
        this.trackBusinessMetrics(operation, table, duration, null, error);
        throw error;
      }
    );
    
    // Preserve query builder interface
    Object.setPrototypeOf(monitoredPromise, Object.getPrototypeOf(query));
    Object.getOwnPropertyNames(query).forEach(prop => {
      if (prop !== 'then' && prop !== 'catch' && prop !== 'finally') {
        const descriptor = Object.getOwnPropertyDescriptor(query, prop);
        if (descriptor) {
          Object.defineProperty(monitoredPromise, prop, descriptor);
        }
      }
    });
    
    return monitoredPromise;
  }
  
  /**
   * Tracks metrics that matter for business operations and user experience
   */
  private trackBusinessMetrics(operation: string, table: string, duration: number, result: any, error: any) {
    // Track user experience issues (slow operations that impact UX)
    if (duration > 3000) { // 3 seconds is bad UX
      AppAlertSystem.alertUserExperienceIssue({
        type: 'slow_draft_creation', // Generic slow operation
        userId: this.userId,
        context: {
          operation,
          table,
          duration: `${Math.round(duration)}ms`,
          impact: 'User may experience slow application response'
        }
      });
    }
    
    // Track data save failures (critical for user experience)
    if (error && (operation.includes('insert') || operation.includes('update') || operation.includes('upsert'))) {
      AppAlertSystem.alertUserExperienceIssue({
        type: 'failed_data_save',
        userId: this.userId,
        context: {
          operation,
          table,
          error: error.message,
          impact: 'User data may not have been saved'
        }
      });
    }
    
    // Track business-critical operations
    if (this.isCriticalBusinessOperation(operation, table)) {
      console.log('[BUSINESS_OPERATION]', {
        operation,
        table,
        userId: this.userId,
        duration: `${Math.round(duration)}ms`,
        success: !error,
        timestamp: new Date()
      });
    }
    
    // Only log significant issues, not every query
    if (error || duration > 2000) {
      console.log('[APP_QUERY]', {
        operation,
        table,
        duration: `${Math.round(duration)}ms`,
        userId: this.userId,
        status: error ? 'error' : 'slow',
        error: error?.message
      });
    }
  }
  
  /**
   * Identifies operations that are critical for business functionality
   */
  private isCriticalBusinessOperation(operation: string, table: string): boolean {
    const criticalOperations = [
      'insert_users', // User registration
      'insert_leagues', // League creation
      'insert_draft_sessions', // Draft creation
      'update_player_selections', // Player selection (core feature)
      'insert_player_selections', // Player selection (core feature)
    ];
    
    return criticalOperations.includes(operation);
  }
}

/**
 * Factory function for application-focused monitored client
 */
export function createAppSupabaseClient(userId?: string): AppSupabaseClient {
  return new AppSupabaseClient(supabase, userId);
}

/**
 * Hook for React components that need business-focused monitoring
 */
export function useAppSupabaseClient(userId?: string): AppSupabaseClient {
  return createAppSupabaseClient(userId);
}