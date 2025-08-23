import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('Playwright Global Setup: Configuring log capture...');
  
  // Ensure test-results directory exists
  const fs = require('fs');
  if (!fs.existsSync('test-results')) {
    fs.mkdirSync('test-results', { recursive: true });
  }
}

export default globalSetup;