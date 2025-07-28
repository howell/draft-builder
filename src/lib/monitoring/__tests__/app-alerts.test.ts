import { AppAlertSystem } from '../app-alerts';

// Mock fetch for webhook testing
global.fetch = jest.fn();

describe('AppAlertSystem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch mock
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200
    });
  });

  describe('checkApplicationHealth', () => {
    it('should trigger RLS security violation alert', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const healthStatus = {
        checks: {
          rls: {
            status: 'unhealthy',
            error: 'RLS policy not working'
          }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CRITICAL_ALERT] RLS Security Policy Failure',
        expect.objectContaining({
          type: 'security',
          data: expect.objectContaining({
            rlsStatus: healthStatus.checks.rls,
            impact: 'Data security may be compromised'
          })
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should trigger authentication system failure alert', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const healthStatus = {
        checks: {
          authentication: {
            status: 'unhealthy',
            error: 'Auth service down'
          }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[HIGH_ALERT] Authentication System Failure',
        expect.objectContaining({
          type: 'business_critical'
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should trigger critical user path failure alert', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const healthStatus = {
        checks: {
          criticalPaths: {
            status: 'unhealthy',
            failedTables: ['draft_sessions', 'player_selections']
          }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[HIGH_ALERT] Critical User Workflow Broken',
        expect.objectContaining({
          type: 'user_experience'
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should trigger degraded health alert', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const healthStatus = {
        overall: 'degraded',
        checks: {
          database: { status: 'degraded' },
          authentication: { status: 'healthy' },
          rls: { status: 'healthy' },
          criticalPaths: { status: 'healthy' }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MEDIUM_ALERT] Application Health Degraded',
        expect.objectContaining({
          data: expect.objectContaining({
            overallStatus: 'degraded',
            affectedSystems: ['database']
          })
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not trigger alerts for healthy status', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const healthStatus = {
        overall: 'healthy',
        checks: {
          database: { status: 'healthy' },
          authentication: { status: 'healthy' },
          rls: { status: 'healthy' },
          criticalPaths: { status: 'healthy' }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('alertUserExperienceIssue', () => {
    it('should alert on slow draft creation', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      AppAlertSystem.alertUserExperienceIssue({
        type: 'slow_draft_creation',
        userId: 'user123',
        context: {
          operation: 'create_draft',
          duration: '5000ms'
        }
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[USER_EXPERIENCE_ALERT]',
        expect.objectContaining({
          issue: 'slow_draft_creation',
          userId: 'user123',
          action_required: 'Check database performance in Supabase dashboard'
        })
      );

      consoleWarnSpy.mockRestore();
    });

    it('should alert on failed data save', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      AppAlertSystem.alertUserExperienceIssue({
        type: 'failed_data_save',
        userId: 'user456',
        context: {
          operation: 'save_player_selection',
          error: 'Network timeout'
        }
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[USER_EXPERIENCE_ALERT]',
        expect.objectContaining({
          issue: 'failed_data_save',
          userId: 'user456',
          action_required: 'Verify user authentication and RLS policies'
        })
      );

      consoleWarnSpy.mockRestore();
    });

    it('should send webhook for user-specific issues', async () => {
      AppAlertSystem.alertUserExperienceIssue({
        type: 'auth_timeout',
        userId: 'user789',
        context: { timeout: '30s' }
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/alerts/user-assistance',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('user789')
        })
      );
    });
  });

  describe('webhook execution', () => {
    it('should handle webhook failures gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const healthStatus = {
        checks: {
          rls: { status: 'unhealthy' }
        }
      };

      AppAlertSystem.checkApplicationHealth(healthStatus);

      // Wait for async webhook to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WEBHOOK_ALERT_FAILED]',
        expect.objectContaining({
          target: '/api/alerts/security',
          error: expect.any(Error)
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getAlertStats', () => {
    it('should return correct alert statistics', () => {
      const stats = AppAlertSystem.getAlertStats();

      expect(stats).toEqual({
        totalAlerts: 5,
        enabledAlerts: 5,
        alertsByType: {
          security: 1,
          business_critical: 2,
          user_experience: 2
        }
      });
    });
  });

  describe('action recommendations', () => {
    it('should provide correct action for slow draft creation', () => {
      const action = (AppAlertSystem as any).getActionForUXIssue('slow_draft_creation');
      expect(action).toBe('Check database performance in Supabase dashboard');
    });

    it('should provide correct action for failed data save', () => {
      const action = (AppAlertSystem as any).getActionForUXIssue('failed_data_save');
      expect(action).toBe('Verify user authentication and RLS policies');
    });

    it('should provide correct action for auth timeout', () => {
      const action = (AppAlertSystem as any).getActionForUXIssue('auth_timeout');
      expect(action).toBe('Check Supabase auth service status');
    });

    it('should provide generic action for unknown issues', () => {
      const action = (AppAlertSystem as any).getActionForUXIssue('unknown_issue');
      expect(action).toBe('Investigate user experience issue');
    });
  });
});