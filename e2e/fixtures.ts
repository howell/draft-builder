import { test as base, ConsoleMessage } from '@playwright/test';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Extend the base test to capture console logs
export const test = base.extend<{ 
  logCapture: void;
}>({
  logCapture: [async ({ page }, use, testInfo) => {
    const consoleLogs: ConsoleMessage[] = [];
    const pageErrors: string[] = [];
    const networkRequests: string[] = [];
    
    // Capture all console messages during the test
    page.on('console', (message) => {
      consoleLogs.push(message);
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      pageErrors.push(`[PAGE ERROR] ${error.message}\n${error.stack || 'No stack trace'}`);
    });

    // Capture network request failures
    page.on('requestfailed', (request) => {
      pageErrors.push(`[NETWORK ERROR] ${request.method()} ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
    });

    // Capture all network requests for correlation with server logs
    page.on('request', (request) => {
      const timestamp = new Date().toISOString();
      networkRequests.push(`[${timestamp}] ${request.method()} ${request.url()}`);
    });

    // Capture network responses 
    page.on('response', (response) => {
      const timestamp = new Date().toISOString();
      const status = response.status();
      const statusText = status >= 400 ? ' ❌' : status >= 300 ? ' ⚠️' : ' ✅';
      networkRequests.push(`[${timestamp}] ${status}${statusText} ${response.request().method()} ${response.url()}`);
    });

    await use();

    // Only save logs for failing tests (not passed, not skipped)
    const shouldSaveLogs = testInfo.status === 'failed' || testInfo.status === 'timedOut';

    if (shouldSaveLogs) {
      try {
        // Create the output directory
        await mkdir(testInfo.outputDir, { recursive: true });

        // Create comprehensive log content
        const sections = [
          `# Test Log Report`,
          `**Test:** ${testInfo.title}`,
          `**Status:** ${testInfo.status?.toUpperCase()}`,
          `**Duration:** ${testInfo.duration}ms`,
          `**Timestamp:** ${new Date().toISOString()}`,
          `**Project:** ${testInfo.project.name}`,
          '',
          '## Page Errors',
          pageErrors.length > 0 ? pageErrors.join('\n\n') : 'No page errors',
          '',
          '## Network Activity',
          networkRequests.length > 0 ? networkRequests.join('\n') : 'No network requests',
          '',
          '## Console Messages', 
          consoleLogs.length > 0 ? 
            consoleLogs.map((msg, index) => {
              const type = msg.type();
              const text = msg.text();
              const location = msg.location();
              return `${index + 1}. [${type.toUpperCase()}] ${text}${location.url ? `\n   → ${location.url}:${location.lineNumber}:${location.columnNumber}` : ''}`;
            }).join('\n\n') : 
            'No console messages',
          '',
          `## Summary`,
          `- Total console messages: ${consoleLogs.length}`,
          `- Console errors: ${consoleLogs.filter(msg => msg.type() === 'error').length}`,
          `- Page errors: ${pageErrors.length}`,
          `- Network requests: ${networkRequests.filter(req => req.includes('] GET ') || req.includes('] POST ') || req.includes('] PUT ') || req.includes('] DELETE ')).length / 2}`,
          `- Network errors: ${pageErrors.filter(err => err.includes('[NETWORK ERROR]')).length}`,
          '',
          '## Server Log Correlation',
          `To find related server logs, search for requests around ${new Date().toISOString()} in the main server log.`
        ];

        // Save to file
        const logFile = path.join(testInfo.outputDir, 'test-logs.md');
        await writeFile(logFile, sections.join('\n'), 'utf8');
        
        console.log(`📋 Test logs saved: ${logFile}`);
      } catch (error) {
        console.error('❌ Failed to save test logs:', error);
      }
    }
  }, { auto: true }]
});

export { expect } from '@playwright/test';