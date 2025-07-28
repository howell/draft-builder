import { GET, POST } from '../route';
import { AppHealthMonitor, AppAlertSystem } from '../../../../lib/monitoring';

// Mock the monitoring modules
jest.mock('../../../../lib/monitoring', () => ({
  AppHealthMonitor: {
    performHealthCheck: jest.fn(),
    startApplicationMonitoring: jest.fn()
  },
  AppAlertSystem: {
    getAlertStats: jest.fn()
  }
}));

const mockAppHealthMonitor = AppHealthMonitor as jest.Mocked<typeof AppHealthMonitor>;
const mockAppAlertSystem = AppAlertSystem as jest.Mocked<typeof AppAlertSystem>;

describe('/api/monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/monitoring', () => {
    it('should return monitoring report with health and alert stats', async () => {
      const mockHealthData = {
        overall: 'healthy' as const,
        checks: {
          database: { status: 'healthy' as const },
          authentication: { status: 'healthy' as const },
          rls: { status: 'healthy' as const },
          criticalPaths: { status: 'healthy' as const }
        },
        timestamp: new Date()
      };

      const mockAlertStats = {
        totalAlerts: 5,
        enabledAlerts: 5,
        alertsByType: {
          security: 1,
          business_critical: 2,
          user_experience: 2
        }
      };

      mockAppHealthMonitor.performHealthCheck.mockResolvedValue(mockHealthData);
      mockAppAlertSystem.getAlertStats.mockReturnValue(mockAlertStats);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        timestamp: expect.any(String),
        application_health: {
          ...mockHealthData,
          timestamp: mockHealthData.timestamp.toISOString() // Date gets serialized to string
        },
        alert_system: mockAlertStats,
        note: 'Use Supabase Dashboard for database performance metrics'
      });

      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });

    it('should return 500 status when monitoring report generation fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAppHealthMonitor.performHealthCheck.mockRejectedValue(new Error('Health check failed'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to generate monitoring report',
        timestamp: expect.any(String),
        details: 'Health check failed'
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MONITORING_API_ERROR]',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /api/monitoring', () => {
    it('should start monitoring when action is "start"', async () => {
      const mockCleanup = jest.fn();
      mockAppHealthMonitor.startApplicationMonitoring.mockReturnValue(mockCleanup);

      const request = new Request('http://localhost/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Real-time monitoring started',
        timestamp: expect.any(String)
      });

      expect(mockAppHealthMonitor.startApplicationMonitoring).toHaveBeenCalled();
    });

    it('should acknowledge stop monitoring when action is "stop"', async () => {
      const request = new Request('http://localhost/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Real-time monitoring stop requested',
        timestamp: expect.any(String)
      });
    });

    it('should return 400 for invalid action', async () => {
      const request = new Request('http://localhost/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invalid' })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: 'Invalid action. Use "start" or "stop"'
      });
    });

    it('should handle malformed JSON request', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const request = new Request('http://localhost/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to control monitoring',
        details: expect.any(String)
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle monitoring start failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAppHealthMonitor.startApplicationMonitoring.mockImplementation(() => {
        throw new Error('Failed to start monitoring');
      });

      const request = new Request('http://localhost/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to control monitoring');

      consoleErrorSpy.mockRestore();
    });
  });
});