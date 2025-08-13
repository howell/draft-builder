/**
 * Google API mocking utilities for E2E tests
 * Provides mocks for Google Sheets API using fixture data
 */

import { Page } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const rankingsFixturesDir = join(__dirname, '..', 'fixtures', 'rankings');

/**
 * Setup mocks for Google Sheets API using fixture data
 */
export async function setupGoogleSheetsApiMocks(page: Page) {
  // Mock Google Sheets API metadata endpoint
  await page.route('https://sheets.googleapis.com/v4/**', async (route) => {
    const metadataPath = join(rankingsFixturesDir, 'spreadsheet-metadata.json');
    if (!existsSync(metadataPath)) {
      throw new Error(`Rankings fixture not found: ${metadataPath}`);
    }
    
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    return route.fulfill({
      status: 200,
      json: metadata
    });
  });
  
  // Mock Google Docs CSV export endpoint
  await page.route('https://docs.google.com/spreadsheets/d/**', async (route) => {
    if (route.request().url().includes('gviz/tq?tqx=out:csv')) {
      const csvPath = join(rankingsFixturesDir, 'rankings-latest.csv');
      if (!existsSync(csvPath)) {
        throw new Error(`Rankings CSV fixture not found: ${csvPath}`);
      }
      
      const csvData = readFileSync(csvPath, 'utf8');
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: csvData
      });
    }
    
    return route.continue();
  });
}