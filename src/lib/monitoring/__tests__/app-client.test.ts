import { AppSupabaseClient, createAppSupabaseClient } from '../app-client';
import { AppAlertSystem } from '../app-alerts';
import { 
  createQueryMock, 
  createQueryMockRejection,
  createMockSupabaseClient,
  PerformanceMockHelper,
  ConsoleMockHelper,
  setupTestMocks,
  cleanupTestMocks
} from '../test-helpers';

// Mock Supabase
jest.mock('../../supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn()
    }
  }
}));

// Mock the alert system
jest.mock('../app-alerts');
const mockAppAlertSystem = AppAlertSystem as jest.Mocked<typeof AppAlertSystem>;

// Mock Supabase client
const mockSupabaseClient = createMockSupabaseClient();

describe('AppSupabaseClient', () => {
  let client: AppSupabaseClient;
  let performanceHelper: PerformanceMockHelper;
  let consoleHelper: ConsoleMockHelper;

  beforeEach(() => {
    setupTestMocks();
    client = new AppSupabaseClient(mockSupabaseClient as any, 'test-user-id');
    performanceHelper = new PerformanceMockHelper();
    consoleHelper = new ConsoleMockHelper();
  });

  afterEach(() => {
    cleanupTestMocks();
    performanceHelper.restore();
    consoleHelper.restoreAll();
  });

  describe('query wrapping', () => {
    it('should wrap SELECT queries with monitoring', async () => {
      const mockQuery = createQueryMock({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').select('*');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('leagues');
      expect(result).toEqual({ data: [], error: null });
    });

    it('should wrap INSERT queries with monitoring', async () => {
      const mockQuery = createQueryMock({ data: [{ id: 'new-league' }], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').insert({ name: 'Test League' });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('leagues');
      expect(result).toEqual({ data: [{ id: 'new-league' }], error: null });
    });

    it('should wrap UPDATE queries with monitoring', async () => {
      const mockQuery = createQueryMock({ data: [{ id: 'updated-league' }], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').update({ name: 'Updated League' });

      expect(result).toEqual({ data: [{ id: 'updated-league' }], error: null });
    });

    it('should wrap DELETE queries with monitoring', async () => {
      const mockQuery = createQueryMock({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').delete();

      expect(result).toEqual({ data: [], error: null });
    });

    it('should wrap UPSERT queries with monitoring', async () => {
      const mockQuery = createQueryMock({ data: [{ id: 'upserted-league' }], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').upsert({ id: 'test', name: 'Test League' });

      expect(result).toEqual({ data: [{ id: 'upserted-league' }], error: null });
    });
  });

  describe('performance tracking', () => {
    it('should alert on slow operations (>3 seconds)', async () => {
      // Mock slow operation (3.5 seconds)
      performanceHelper.mockDuration(3500);

      const mockQuery = createQueryMock({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await client.from('draft_sessions').select('*');

      expect(mockAppAlertSystem.alertUserExperienceIssue).toHaveBeenCalledWith({
        type: 'slow_draft_creation',
        userId: 'test-user-id',
        context: {
          operation: 'select_draft_sessions',
          table: 'draft_sessions',
          duration: '3500ms',
          impact: 'User may experience slow application response'
        }
      });
    });

    it('should not alert on fast operations', async () => {
      // Mock fast operation (100ms)
      performanceHelper.mockDuration(100);

      const mockQuery = createQueryMock({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await client.from('leagues').select('*');

      expect(mockAppAlertSystem.alertUserExperienceIssue).not.toHaveBeenCalled();
    });

    it('should alert on data save failures', async () => {
      const errorObj = { message: 'Save failed' };
      const mockQuery = createQueryMockRejection(errorObj);
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await expect(
        client.from('player_selections').insert({ player_id: 'test' })
      ).rejects.toEqual(errorObj);

      expect(mockAppAlertSystem.alertUserExperienceIssue).toHaveBeenCalledWith({
        type: 'failed_data_save',
        userId: 'test-user-id',
        context: {
          operation: 'insert_player_selections',
          table: 'player_selections',
          error: 'Save failed',
          impact: 'User data may not have been saved'
        }
      });
    });
  });

  describe('business operation tracking', () => {
    it('should track critical business operations', async () => {
      const consoleSpy = consoleHelper.spyOnLog();

      const mockQuery = createQueryMock({ data: [{ id: 'new-user' }], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await client.from('users').insert({ email: 'test@example.com' });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[BUSINESS_OPERATION]',
        expect.objectContaining({
          operation: 'insert_users',
          table: 'users',
          userId: 'test-user-id',
          success: true
        })
      );
    });

    it('should identify critical business operations correctly', () => {
      const isCritical = (client as any).isCriticalBusinessOperation;

      expect(isCritical('insert_users', 'users')).toBe(true);
      expect(isCritical('insert_leagues', 'leagues')).toBe(true);
      expect(isCritical('insert_draft_sessions', 'draft_sessions')).toBe(true);
      expect(isCritical('insert_player_selections', 'player_selections')).toBe(true);
      expect(isCritical('update_player_selections', 'player_selections')).toBe(true);
      
      expect(isCritical('select_users', 'users')).toBe(false);
      expect(isCritical('insert_cost_adjustments', 'cost_adjustments')).toBe(false);
    });
  });

  describe('error handling and logging', () => {
    it('should log significant errors', async () => {
      const consoleSpy = consoleHelper.spyOnLog();
      const errorObj = { message: 'Database error' };
      const mockQuery = createQueryMockRejection(errorObj);

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await expect(
        client.from('leagues').select('*')
      ).rejects.toEqual(errorObj);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[APP_QUERY]',
        expect.objectContaining({
          operation: 'select_leagues',
          table: 'leagues',
          userId: 'test-user-id',
          status: 'error',
          error: 'Database error'
        })
      );
    });

    it('should log slow operations', async () => {
      const consoleSpy = consoleHelper.spyOnLog();

      // Mock slow operation (2.5 seconds)
      performanceHelper.mockDuration(2500);

      const mockQuery = createQueryMock({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await client.from('leagues').select('*');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[APP_QUERY]',
        expect.objectContaining({
          operation: 'select_leagues',
          table: 'leagues',
          status: 'slow',
          duration: '2500ms'
        })
      );
    });

    it('should not log fast successful operations', async () => {
      const consoleSpy = consoleHelper.spyOnLog();

      // Mock fast operation (100ms)
      performanceHelper.mockDuration(100);

      const mockQuery = createQueryMock({ data: [], error: null });
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await client.from('leagues').select('*');

      // Should not log normal operations
      expect(consoleSpy).not.toHaveBeenCalledWith(
        '[APP_QUERY]',
        expect.any(Object)
      );
    });
  });

  describe('client creation', () => {
    it('should create client with userId', () => {
      const client = createAppSupabaseClient('test-user');
      expect(client).toBeInstanceOf(AppSupabaseClient);
    });

    it('should create client without userId', () => {
      const client = createAppSupabaseClient();
      expect(client).toBeInstanceOf(AppSupabaseClient);
    });
  });

  describe('auth and storage passthrough', () => {
    it('should expose auth without wrapping', () => {
      expect(client.auth).toBe(mockSupabaseClient.auth);
    });

    it('should expose storage without wrapping', () => {
      expect(client.storage).toBe(mockSupabaseClient.storage);
    });
  });
});