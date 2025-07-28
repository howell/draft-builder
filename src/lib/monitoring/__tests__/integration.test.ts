import { AppHealthMonitor, AppAlertSystem, createAppSupabaseClient } from '../index';

// Mock Supabase for integration testing
jest.mock('../../supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn()
    }
  }
}));

// Mock fetch for webhook testing
global.fetch = jest.fn();

// Get the mocked supabase
const { supabase: mockSupabase } = require('../../supabase');

describe('Monitoring System Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Monitoring Flow', () => {
    it('should detect and alert on application health issues', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Simulate RLS policy failure (potential security issue)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'leagues') {
          return {
            select: () => ({
              limit: () => Promise.resolve({
                data: [{ id: 'test', user_id: 'unauthorized' }], // Data returned without auth
                error: null
              })
            })
          };
        }
        
        // Other tables work normally
        return {
          select: () => ({
            limit: () => Promise.resolve({ data: [], error: null })
          })
        };
      });
      
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      // Perform health check
      const health = await AppHealthMonitor.performHealthCheck();
      
      // Verify health status reflects the RLS issue
      expect(health.checks.rls.status).toBe('degraded');
      expect(health.checks.rls.warning).toContain('RLS may not be properly configured');
      
      // Trigger alert system with health results
      AppAlertSystem.checkApplicationHealth(health);
      
      // Verify security alert was triggered
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CRITICAL_ALERT] RLS Security Policy Failure',
        expect.objectContaining({
          type: 'security'
        })
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should track business operations through monitored client', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock successful business operation
      const insertPromise = Promise.resolve({ 
        data: [{ id: 'new-draft' }], 
        error: null 
      });
      
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue(insertPromise)
      });

      // Create monitored client
      const client = createAppSupabaseClient('test-user');
      
      // Perform business-critical operation
      await client.from('draft_sessions').insert({
        name: 'Test Draft',
        league_id: 'test-league'
      });

      // Verify business operation was tracked
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[BUSINESS_OPERATION]',
        expect.objectContaining({
          operation: 'insert_draft_sessions',
          table: 'draft_sessions',
          userId: 'test-user',
          success: true
        })
      );
      
      consoleLogSpy.mockRestore();
    });

    it('should alert on user experience issues', async () => {
      const alertSpy = jest.spyOn(AppAlertSystem, 'alertUserExperienceIssue');
      
      // Mock slow operation (4 seconds)
      jest.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(4000);
      
      const selectPromise = Promise.resolve({ data: [], error: null });
      
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue(selectPromise)
      });

      const client = createAppSupabaseClient('test-user');
      
      // Perform slow operation
      await client.from('player_selections').select('*');

      // Verify UX alert was triggered
      expect(alertSpy).toHaveBeenCalledWith({
        type: 'slow_draft_creation',
        userId: 'test-user',
        context: expect.objectContaining({
          operation: 'select_player_selections',
          duration: '4000ms'
        })
      });
    });

    it('should handle monitoring system failures gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Simulate complete system failure
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });
      mockSupabase.auth.getSession.mockRejectedValue(new Error('Auth system down'));

      // Health check should still complete and report status
      const health = await AppHealthMonitor.performHealthCheck();
      
      expect(health.overall).toBe('unhealthy');
      expect(health.checks.database.status).toBe('unhealthy');
      expect(health.checks.authentication.status).toBe('unhealthy');
      
      // System should trigger appropriate alerts
      AppAlertSystem.checkApplicationHealth(health);
      
      // Multiple alerts should be triggered for different system failures
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[HIGH_ALERT] Authentication System Failure',
        expect.any(Object)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Alert System Webhook Integration', () => {
    it('should send webhooks for critical alerts', async () => {
      // Mock fetch for webhook testing
      (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      const healthStatus = {
        checks: {
          rls: { status: 'unhealthy', error: 'Critical RLS failure' }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      // Wait for async webhook call
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fetch).toHaveBeenCalledWith(
        '/api/alerts/security',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('RLS Security Policy Failure')
        })
      );
    });

    it('should handle webhook failures without breaking monitoring', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (fetch as jest.Mock).mockRejectedValue(new Error('Webhook endpoint down'));

      const healthStatus = {
        checks: {
          authentication: { status: 'unhealthy' }
        }
      };

      // Should not throw error even if webhook fails
      expect(() => {
        AppAlertSystem.checkApplicationHealth(healthStatus);
      }).not.toThrow();

      // Wait for async error handling
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WEBHOOK_ALERT_FAILED]',
        expect.objectContaining({
          error: expect.any(Error)
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Continuous Monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should perform continuous health monitoring', async () => {
      const healthCheckSpy = jest.spyOn(AppHealthMonitor, 'performHealthCheck')
        .mockResolvedValue({
          overall: 'healthy',
          checks: {
            database: { status: 'healthy' },
            authentication: { status: 'healthy' },
            rls: { status: 'healthy' },
            criticalPaths: { status: 'healthy' }
          },
          timestamp: new Date()
        } as any);

      // Start continuous monitoring
      const cleanup = AppHealthMonitor.startApplicationMonitoring(5000); // Every 5 seconds

      // Advance time to trigger multiple health checks
      jest.advanceTimersByTime(15000); // 15 seconds = 3 checks

      expect(healthCheckSpy).toHaveBeenCalledTimes(4); // Initial + 3 interval checks

      // Cleanup
      cleanup();
      healthCheckSpy.mockRestore();
    });

    it('should alert during continuous monitoring when health degrades', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      jest.spyOn(AppHealthMonitor, 'performHealthCheck')
        .mockResolvedValue({
          overall: 'degraded',
          checks: {
            database: { status: 'degraded' },
            authentication: { status: 'healthy' },
            rls: { status: 'healthy' },
            criticalPaths: { status: 'healthy' }
          },
          timestamp: new Date()
        } as any);

      const cleanup = AppHealthMonitor.startApplicationMonitoring(1000);

      // Wait for initial check to complete
      await jest.runOnlyPendingTimersAsync();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[APP_HEALTH_ALERT]',
        expect.objectContaining({
          overall: 'degraded'
        })
      );

      cleanup();
      consoleWarnSpy.mockRestore();
    });
  });
});