import { GET } from '../route';
import { AppHealthMonitor } from '../../../../lib/monitoring';

// Mock the AppHealthMonitor
jest.mock('../../../../lib/monitoring', () => ({
  AppHealthMonitor: {
    performHealthCheck: jest.fn()
  }
}));

const mockAppHealthMonitor = AppHealthMonitor as jest.Mocked<typeof AppHealthMonitor>;

describe('/api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 status for healthy application', async () => {
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

    mockAppHealthMonitor.performHealthCheck.mockResolvedValue(mockHealthData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockHealthData);
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
  });

  it('should return 206 status for degraded application', async () => {
    const mockHealthData = {
      overall: 'degraded' as const,
      checks: {
        database: { status: 'degraded' as const, latency: '2500ms' },
        authentication: { status: 'healthy' as const },
        rls: { status: 'healthy' as const },
        criticalPaths: { status: 'healthy' as const }
      },
      timestamp: new Date()
    };

    mockAppHealthMonitor.performHealthCheck.mockResolvedValue(mockHealthData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(206);
    expect(data).toEqual(mockHealthData);
  });

  it('should return 503 status for unhealthy application', async () => {
    const mockHealthData = {
      overall: 'unhealthy' as const,
      checks: {
        database: { status: 'unhealthy' as const, error: 'Connection failed' },
        authentication: { status: 'unhealthy' as const, error: 'Auth system down' },
        rls: { status: 'healthy' as const },
        criticalPaths: { status: 'unhealthy' as const }
      },
      timestamp: new Date()
    };

    mockAppHealthMonitor.performHealthCheck.mockResolvedValue(mockHealthData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual(mockHealthData);
  });

  it('should return 503 status when health check throws error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockAppHealthMonitor.performHealthCheck.mockRejectedValue(new Error('Health check failed'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      overall: 'unhealthy',
      error: 'Health check failed',
      timestamp: expect.any(String),
      details: 'Health check failed'
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[HEALTH_CHECK_API_ERROR]',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('should include proper headers for caching', async () => {
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

    mockAppHealthMonitor.performHealthCheck.mockResolvedValue(mockHealthData);

    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('should handle health check timeout gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock a timeout scenario
    mockAppHealthMonitor.performHealthCheck.mockImplementation(
      () => new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 100)
      )
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.overall).toBe('unhealthy');
    expect(data.error).toBe('Health check failed');

    consoleErrorSpy.mockRestore();
  });
});