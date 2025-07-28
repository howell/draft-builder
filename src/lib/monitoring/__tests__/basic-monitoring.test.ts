/**
 * Basic monitoring tests that focus on core functionality
 * without complex mocking or integration issues
 */

import { AppAlertSystem } from '../app-alerts';

// Simple tests that don't require complex Supabase mocking
describe('Basic Monitoring Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Alert System Core Functionality', () => {
    it('should correctly identify alert types and severities', () => {
      const stats = AppAlertSystem.getAlertStats();
      
      expect(stats.totalAlerts).toBe(5);
      expect(stats.enabledAlerts).toBe(5);
      expect(stats.alertsByType.security).toBe(1);
      expect(stats.alertsByType.business_critical).toBe(2);
      expect(stats.alertsByType.user_experience).toBe(2);
    });

    it('should provide appropriate action recommendations', () => {
      const getAction = (AppAlertSystem as any).getActionForUXIssue;
      
      expect(getAction('slow_draft_creation')).toBe('Check database performance in Supabase dashboard');
      expect(getAction('failed_data_save')).toBe('Verify user authentication and RLS policies');
      expect(getAction('auth_timeout')).toBe('Check Supabase auth service status');
      expect(getAction('unknown_issue')).toBe('Investigate user experience issue');
    });

    it('should trigger security alerts for RLS violations', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const healthStatus = {
        checks: {
          rls: {
            status: 'unhealthy',
            error: 'RLS policy violation'
          }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CRITICAL_ALERT] RLS Security Policy Failure',
        expect.objectContaining({
          type: 'security'
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should alert on user experience issues', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      AppAlertSystem.alertUserExperienceIssue({
        type: 'slow_draft_creation',
        userId: 'test-user',
        context: { operation: 'slow_operation' }
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[USER_EXPERIENCE_ALERT]',
        expect.objectContaining({
          issue: 'slow_draft_creation',
          userId: 'test-user'
        })
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle webhook alerts when fetch is available', async () => {
      // Mock fetch
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const healthStatus = {
        checks: {
          authentication: { status: 'unhealthy' }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      // Wait for async webhook
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/alerts/auth-failure',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });

  describe('Monitoring Configuration', () => {
    it('should have proper alert configurations', () => {
      const alerts = (AppAlertSystem as any).alerts;
      
      // Verify critical security alert exists
      const rlsAlert = alerts.find((a: any) => a.id === 'rls_security_violation');
      expect(rlsAlert).toBeDefined();
      expect(rlsAlert.type).toBe('security');
      expect(rlsAlert.severity).toBe('critical');
      expect(rlsAlert.enabled).toBe(true);

      // Verify business critical alerts exist
      const authAlert = alerts.find((a: any) => a.id === 'auth_system_failure');
      expect(authAlert).toBeDefined();
      expect(authAlert.type).toBe('business_critical');
      expect(authAlert.severity).toBe('high');

      // Verify user experience alerts exist
      const uxAlert = alerts.find((a: any) => a.id === 'critical_user_path_failure');
      expect(uxAlert).toBeDefined();
      expect(uxAlert.type).toBe('user_experience');
      expect(uxAlert.severity).toBe('high');
    });

    it('should process different health status scenarios correctly', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Test multiple alert conditions
      const healthStatus = {
        overall: 'degraded',
        checks: {
          rls: { status: 'degraded' },
          authentication: { status: 'unhealthy' },
          criticalPaths: { status: 'unhealthy' }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      // Should trigger multiple alerts
      expect(consoleErrorSpy).toHaveBeenCalledTimes(4); // RLS + Auth + Critical Paths + Overall degraded

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle webhook failures gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Mock fetch to fail
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const healthStatus = {
        checks: {
          rls: { status: 'unhealthy' }
        }
      };

      // Should not throw even if webhook fails
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

    it('should handle missing fetch gracefully', () => {
      const originalFetch = global.fetch;
      (global as any).fetch = undefined;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const healthStatus = {
        checks: {
          rls: { status: 'unhealthy' }
        }
      };

      // Should not throw when fetch is not available
      expect(() => {
        AppAlertSystem.checkApplicationHealth(healthStatus);
      }).not.toThrow();

      // Should still log the alert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CRITICAL_ALERT] RLS Security Policy Failure',
        expect.any(Object)
      );

      consoleErrorSpy.mockRestore();
      global.fetch = originalFetch;
    });
  });
});