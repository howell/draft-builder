import { supabase } from '../supabase';

export interface AppHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  [key: string]: any;
}

interface AppHealthCheck {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: AppHealthResult;
    authentication: AppHealthResult;
    rls: AppHealthResult;
    criticalPaths: AppHealthResult;
  };
  timestamp: Date;
}

export class AppHealthMonitor {
  /**
   * Performs application-specific health checks that complement Supabase dashboard monitoring.
   * Focuses on RLS validation, auth integration, and critical user workflows.
   */
  static async performHealthCheck(): Promise<AppHealthCheck> {
    const results = await Promise.allSettled([
      this.checkDatabaseConnectivity(),
      this.checkAuthenticationIntegration(),
      this.validateRLSPolicies(),
      this.validateCriticalUserPaths()
    ]);
    
    const checks = {
      database: results[0].status === 'fulfilled' ? results[0].value : { status: 'unhealthy' as const, error: results[0].reason },
      authentication: results[1].status === 'fulfilled' ? results[1].value : { status: 'unhealthy' as const, error: results[1].reason },
      rls: results[2].status === 'fulfilled' ? results[2].value : { status: 'unhealthy' as const, error: results[2].reason },
      criticalPaths: results[3].status === 'fulfilled' ? results[3].value : { status: 'unhealthy' as const, error: results[3].reason }
    };
    
    // Determine overall health based on critical business functions
    const healthyCount = Object.values(checks).filter(check => check.status === 'healthy').length;
    const degradedCount = Object.values(checks).filter(check => check.status === 'degraded').length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === 4) {
      overall = 'healthy';
    } else if (healthyCount >= 2) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }
    
    return {
      overall,
      checks,
      timestamp: new Date()
    };
  }
  
  private static async checkDatabaseConnectivity(): Promise<AppHealthResult> {
    try {
      const start = performance.now();
      const { data, error } = await supabase.from('users').select('count').limit(1);
      const latency = performance.now() - start;
      
      if (error) {
        return { 
          status: 'unhealthy', 
          error: error.message,
          latency: `${Math.round(latency)}ms`
        };
      }
      
      // Focus on business-relevant thresholds, not raw performance
      return { 
        status: latency > 2000 ? 'degraded' : 'healthy', 
        latency: `${Math.round(latency)}ms`,
        note: 'Database connectivity check'
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
    }
  }
  
  private static async checkAuthenticationIntegration(): Promise<AppHealthResult> {
    try {
      // Test that auth integration is working
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        return { 
          status: 'degraded', 
          error: error.message,
          details: 'Auth session check failed - may impact user login'
        };
      }
      
      return { 
        status: 'healthy',
        authSystemReady: true,
        note: 'Authentication system operational'
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Auth system failed',
        impact: 'Users cannot sign in'
      };
    }
  }
  
  /**
   * Validates that RLS policies are properly protecting user data.
   * This is critical business logic that Supabase dashboard doesn't test.
   */
  private static async validateRLSPolicies(): Promise<AppHealthResult> {
    try {
      // Test that RLS prevents unauthorized access to user data
      const { data, error } = await supabase.from('leagues').select('id, user_id').limit(1);
      
      // Without authentication, we should either get no data or an RLS error
      if (data && data.length > 0) {
        // If we got data without auth, RLS might not be working
        return { 
          status: 'degraded', 
          warning: 'RLS may not be properly configured - review policies',
          dataReceived: true,
          impact: 'Potential data security issue'
        };
      }
      
      // RLS error is actually good - means it's working
      if (error && (error.message.includes('RLS') || error.code === '42501')) {
        return { 
          status: 'healthy', 
          rlsWorking: true,
          message: 'RLS properly blocking unauthorized access'
        };
      }
      
      // Other errors might indicate problems
      if (error) {
        return { 
          status: 'degraded', 
          error: error.message,
          details: 'Unexpected RLS behavior - investigate'
        };
      }
      
      // No error and no data is also acceptable (empty table)
      return { 
        status: 'healthy', 
        rlsWorking: true,
        message: 'RLS working correctly'
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'RLS validation failed',
        impact: 'Data security may be compromised'
      };
    }
  }
  
  /**
   * Tests critical user workflows that matter for business operations.
   * This validates the application layer, not just database connectivity.
   */
  private static async validateCriticalUserPaths(): Promise<AppHealthResult> {
    const criticalTables = ['users', 'leagues', 'draft_sessions', 'player_selections'] as const;
    const failedTables: string[] = [];
    
    for (const table of criticalTables) {
      try {
        await supabase.from(table).select('count').limit(1);
      } catch (error) {
        failedTables.push(table);
      }
    }
    
    if (failedTables.length === 0) {
      return {
        status: 'healthy',
        allCriticalTablesAccessible: true,
        message: 'All critical user workflows can proceed'
      };
    } else if (failedTables.length <= 1) {
      return {
        status: 'degraded',
        failedTables,
        message: 'Some user workflows may be impacted',
        impact: `Features using ${failedTables.join(', ')} may not work`
      };
    } else {
      return {
        status: 'unhealthy',
        failedTables,
        message: 'Critical user workflows are broken',
        impact: 'Major application features unavailable'
      };
    }
  }
  
  /**
   * Continuous monitoring focused on application-specific concerns
   */
  static startApplicationMonitoring(intervalMs: number = 60000) {
    console.log('[APP_MONITORING] Starting application health monitoring...');
    
    const monitor = async () => {
      try {
        const health = await this.performHealthCheck();
        
        // Only alert on application-specific issues
        if (health.overall !== 'healthy') {
          console.warn('[APP_HEALTH_ALERT]', {
            overall: health.overall,
            businessImpact: this.assessBusinessImpact(health),
            timestamp: health.timestamp
          });
        }
      } catch (error) {
        console.error('[APP_HEALTH_ERROR]', error);
      }
    };
    
    // Run initial check
    monitor();
    
    // Schedule recurring checks (less frequent than infrastructure monitoring)
    const intervalId = setInterval(monitor, intervalMs);
    
    return () => {
      console.log('[APP_MONITORING] Stopping application monitoring...');
      clearInterval(intervalId);
    };
  }
  
  private static assessBusinessImpact(health: AppHealthCheck): string[] {
    const impacts: string[] = [];
    
    if (health.checks.authentication.status !== 'healthy') {
      impacts.push('Users may not be able to sign in');
    }
    
    if (health.checks.rls.status !== 'healthy') {
      impacts.push('Data security may be compromised');
    }
    
    if (health.checks.criticalPaths.status !== 'healthy') {
      impacts.push('Core application features may be unavailable');
    }
    
    if (health.checks.database.status !== 'healthy') {
      impacts.push('All application functionality may be impacted');
    }
    
    return impacts;
  }
}