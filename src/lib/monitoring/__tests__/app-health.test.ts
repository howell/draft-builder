import { AppHealthMonitor } from '../app-health';

// Mock Supabase
jest.mock('../../supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn()
    }
  }
}));

// Get the mocked supabase
const { supabase: mockSupabase } = require('../../supabase');

describe('AppHealthMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset performance.now mock
    jest.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock successful database connectivity
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      } as any);

      // Mock successful auth check
      (mockSupabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: null
      });

      const health = await AppHealthMonitor.performHealthCheck();

      expect(health.overall).toBe('healthy');
      expect(health.checks.database.status).toBe('healthy');
      expect(health.checks.authentication.status).toBe('healthy');
      expect(health.checks.rls.status).toBe('healthy');
      expect(health.checks.criticalPaths.status).toBe('healthy');
    });

    it('should return degraded status when some checks fail', async () => {
      // Mock slow database response
      jest.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(2500); // 2.5 seconds

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      } as any);

      // Mock auth failure
      (mockSupabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: { message: 'Auth service unavailable' }
      });

      const health = await AppHealthMonitor.performHealthCheck();

      expect(health.overall).toBe('degraded');
      expect(health.checks.database.status).toBe('degraded'); // Slow response
      expect(health.checks.authentication.status).toBe('degraded'); // Auth error
    });

    it('should return unhealthy status when critical checks fail', async () => {
      // Mock database connection failure
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockRejectedValue(new Error('Connection failed'))
        })
      } as any);

      // Mock auth system failure
      (mockSupabase.auth.getSession as jest.Mock).mockRejectedValue(new Error('Auth system down'));

      const health = await AppHealthMonitor.performHealthCheck();

      expect(health.overall).toBe('unhealthy');
      expect(health.checks.database.status).toBe('unhealthy');
      expect(health.checks.authentication.status).toBe('unhealthy');
    });
  });

  describe('RLS Policy Validation', () => {
    it('should detect proper RLS blocking as healthy', async () => {
      // Mock RLS properly blocking access
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'RLS policy violation' }
          })
        })
      } as any);

      const health = await AppHealthMonitor.performHealthCheck();

      expect(health.checks.rls.status).toBe('healthy');
      expect(health.checks.rls.rlsWorking).toBe(true);
    });

    it('should detect potential RLS issues when data is returned without auth', async () => {
      // Mock RLS potentially not working (returning data without auth)
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [{ id: 'test-league', user_id: 'test-user' }],
            error: null
          })
        })
      } as any);

      const health = await AppHealthMonitor.performHealthCheck();

      expect(health.checks.rls.status).toBe('degraded');
      expect(health.checks.rls.warning).toContain('RLS may not be properly configured');
    });
  });

  describe('Critical User Paths Validation', () => {
    it('should validate all critical tables are accessible', async () => {
      // Mock all tables accessible
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      } as any);

      const health = await AppHealthMonitor.performHealthCheck();

      expect(health.checks.criticalPaths.status).toBe('healthy');
      expect(health.checks.criticalPaths.allCriticalTablesAccessible).toBe(true);
    });

    it('should detect when critical tables are inaccessible', async () => {
      mockSupabase.from.mockImplementation((table: string) => ({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockImplementation(() => {
            if (table === 'users' || table === 'leagues') {
              // First two tables work
              return Promise.resolve({ data: [], error: null });
            } else {
              // Remaining tables (draft_sessions, player_selections) fail
              return Promise.reject(new Error('Table not accessible'));
            }
          })
        })
      } as any));

      const health = await AppHealthMonitor.performHealthCheck();

      expect(health.checks.criticalPaths.status).toBe('unhealthy');
      expect(health.checks.criticalPaths.failedTables).toEqual(['draft_sessions', 'player_selections']);
    });
  });

  describe('Business Impact Assessment', () => {
    it('should assess business impact correctly', async () => {
      const mockHealth = {
        overall: 'degraded' as const,
        checks: {
          database: { status: 'healthy' as const },
          authentication: { status: 'unhealthy' as const },
          rls: { status: 'degraded' as const },
          criticalPaths: { status: 'healthy' as const }
        },
        timestamp: new Date()
      };

      // Access private method for testing
      const impacts = (AppHealthMonitor as any).assessBusinessImpact(mockHealth);

      expect(impacts).toContain('Users may not be able to sign in');
      expect(impacts).toContain('Data security may be compromised');
      expect(impacts).not.toContain('All application functionality may be impacted');
    });
  });

  describe('Continuous Monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start and stop continuous monitoring', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const performHealthCheckSpy = jest.spyOn(AppHealthMonitor, 'performHealthCheck')
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

      // Start monitoring
      const cleanup = AppHealthMonitor.startApplicationMonitoring(1000);

      // Fast-forward time to trigger monitoring
      jest.advanceTimersByTime(1000);

      expect(performHealthCheckSpy).toHaveBeenCalled();

      // Cleanup
      cleanup();
      performHealthCheckSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should alert on health degradation during continuous monitoring', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const performHealthCheckSpy = jest.spyOn(AppHealthMonitor, 'performHealthCheck')
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

      // Start monitoring
      const cleanup = AppHealthMonitor.startApplicationMonitoring(1000);

      // Wait for initial check to complete
      await jest.runOnlyPendingTimersAsync();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[APP_HEALTH_ALERT]',
        expect.objectContaining({
          overall: 'degraded',
          businessImpact: expect.any(Array)
        })
      );

      // Cleanup
      cleanup();
      performHealthCheckSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });
});