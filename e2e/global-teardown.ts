import { FullConfig } from '@playwright/test';
import { FullResult } from '@playwright/test/reporter';
import { unlink, access } from 'fs/promises';

async function globalTeardown(config: FullConfig, result: FullResult) {
  const serverLogPath = 'test-results/server.log';
  
  try {
    // Check if server log exists
    await access(serverLogPath);
    
    if (result.status === 'passed') {
      // All tests passed - clean up server log to save space
      await unlink(serverLogPath);
      console.log('✅ All tests passed - server log cleaned up');
    } else {
      // Tests failed - keep server log for debugging
      console.log(`❌ Tests failed - server log preserved at: ${serverLogPath}`);
      console.log(`📋 Server log contains ${result.duration}ms of server activity`);
    }
  } catch (error) {
    // Server log doesn't exist or couldn't be processed - not a critical error
    console.log('ℹ️  Server log cleanup skipped (file not found)');
  }
}

export default globalTeardown;