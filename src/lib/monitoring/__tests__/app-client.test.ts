import { AppSupabaseClient, createAppSupabaseClient } from '../app-client';
import { AppAlertSystem } from '../app-alerts';

// Mock the alert system
jest.mock('../app-alerts');
const mockAppAlertSystem = AppAlertSystem as jest.Mocked<typeof AppAlertSystem>;

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(),
  auth: { mock: 'auth' },
  storage: { mock: 'storage' }
};

describe('AppSupabaseClient', () => {
  let client: AppSupabaseClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AppSupabaseClient(mockSupabaseClient as any, 'test-user-id');
    
    // Mock performance.now
    jest.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(100); // 100ms duration
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('query wrapping', () => {
    it('should wrap SELECT queries with monitoring', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [], error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').select('*');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('leagues');
      expect(result).toEqual({ data: [], error: null });
    });

    it('should wrap INSERT queries with monitoring', async () => {
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [{ id: 'new-league' }], error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').insert({ name: 'Test League' });

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('leagues');
      expect(result).toEqual({ data: [{ id: 'new-league' }], error: null });
    });

    it('should wrap UPDATE queries with monitoring', async () => {
      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [{ id: 'updated-league' }], error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').update({ name: 'Updated League' });

      expect(result).toEqual({ data: [{ id: 'updated-league' }], error: null });
    });

    it('should wrap DELETE queries with monitoring', async () => {
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [], error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').delete();

      expect(result).toEqual({ data: [], error: null });
    });

    it('should wrap UPSERT queries with monitoring', async () => {
      const mockQuery = {
        upsert: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [{ id: 'upserted-league' }], error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await client.from('leagues').upsert({ id: 'test', name: 'Test League' });

      expect(result).toEqual({ data: [{ id: 'upserted-league' }], error: null });
    });
  });

  describe('performance tracking', () => {
    it('should alert on slow operations (>3 seconds)', async () => {
      // Mock slow operation (3.5 seconds)
      jest.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(3500);

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [], error: null })
      };

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
      jest.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(100);

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [], error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await client.from('leagues').select('*');

      expect(mockAppAlertSystem.alertUserExperienceIssue).not.toHaveBeenCalled();
    });

    it('should alert on data save failures', async () => {
      const saveError = new Error('Save failed');
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        then: jest.fn().mockRejectedValue(saveError)
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      try {
        await client.from('player_selections').insert({ player_id: 'test' });
      } catch (error) {
        // Expected to throw
      }

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
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [{ id: 'new-user' }], error: null })
      };

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

      consoleSpy.mockRestore();
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
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const error = new Error('Database error');

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        then: jest.fn().mockRejectedValue(error)
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      try {
        await client.from('leagues').select('*');
      } catch (e) {
        // Expected to throw
      }

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

      consoleSpy.mockRestore();
    });

    it('should log slow operations', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock slow operation (2.5 seconds)
      jest.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(2500);

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [], error: null })
      };

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

      consoleSpy.mockRestore();
    });

    it('should not log fast successful operations', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock fast operation (100ms)
      jest.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(100);

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: [], error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      await client.from('leagues').select('*');

      // Should not log normal operations
      expect(consoleSpy).not.toHaveBeenCalledWith(
        '[APP_QUERY]',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
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