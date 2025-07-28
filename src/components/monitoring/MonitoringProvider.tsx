'use client';

import React, { useEffect, useRef } from 'react';
import { AppHealthMonitor } from '@/lib/monitoring';

interface AppMonitoringProviderProps {
  children: React.ReactNode;
  enabled?: boolean;
}

/**
 * Simplified monitoring provider that focuses on application health
 * rather than duplicating Supabase dashboard functionality.
 */
export default function AppMonitoringProvider({ 
  children, 
  enabled = process.env.NODE_ENV === 'development' 
}: AppMonitoringProviderProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    if (!enabled) {
      return;
    }
    
    console.log('[APP_MONITORING] Starting application health monitoring...');
    
    // Start application-focused monitoring
    try {
      cleanupRef.current = AppHealthMonitor.startApplicationMonitoring(60000); // Check every minute
      console.log('[APP_MONITORING] Application monitoring started');
    } catch (error) {
      console.error('[APP_MONITORING] Failed to start monitoring:', error);
    }
    
    // Cleanup on unmount
    return () => {
      if (cleanupRef.current) {
        console.log('[APP_MONITORING] Stopping application monitoring...');
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [enabled]);
  
  return <>{children}</>;
}