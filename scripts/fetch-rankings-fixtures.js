#!/usr/bin/env node

/**
 * Fetches real Google Sheets rankings data and saves it as test fixtures
 * This ensures tests use realistic data without hitting the actual API
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const SPREADSHEET_ID = '1wmjxi3K5rjIYME_lskUvquLbN331YV0vi-kg5VakpdY';
const FIXTURES_DIR = path.join(__dirname, '..', 'e2e', 'fixtures', 'rankings');

// Ensure the Google API key is available
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('Error: GOOGLE_API_KEY environment variable is required');
  console.error('Please set it in your .env.local file or export it');
  process.exit(1);
}

// Ensure fixtures directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  console.log(`Created fixtures directory: ${FIXTURES_DIR}`);
}

/**
 * Fetch the main spreadsheet metadata
 */
async function fetchSpreadsheetMetadata() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?key=${GOOGLE_API_KEY}`;
  
  try {
    console.log('Fetching spreadsheet metadata...');
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch spreadsheet metadata:', error.message);
    throw error;
  }
}

/**
 * Find the latest sheet name (they're named like "August 4, 2025 ADP")
 */
function findLatestSheet(spreadsheet) {
  const sheets = spreadsheet.sheets || [];
  
  // Filter out non-ADP sheets and parse dates
  const adpSheets = sheets
    .map(sheet => sheet.properties.title)
    .filter(title => title.endsWith(' ADP'))
    .map(title => {
      // Parse "Month Day, Year ADP" format
      const match = title.match(/^(\w+)\s+(\d+),\s+(\d{4})\s+ADP$/);
      if (match) {
        const [_, month, day, year] = match;
        const date = new Date(`${month} ${day}, ${year}`);
        return { title, date };
      }
      return null;
    })
    .filter(item => item !== null && !isNaN(item.date.getTime()));
  
  if (adpSheets.length === 0) {
    console.log('\nNo ADP sheets found, using first sheet');
    return sheets[0].properties.title;
  }
  
  // Sort by date and get the latest
  adpSheets.sort((a, b) => b.date - a.date);
  const latest = adpSheets[0];
  
  console.log(`\nFound ${adpSheets.length} ADP sheets`);
  console.log(`Latest sheet: ${latest.title} (${latest.date.toDateString()})`);
  
  return latest.title;
}

/**
 * Fetch CSV data for a specific sheet
 */
async function fetchSheetAsCSV(sheetName) {
  // Use the export URL to get CSV format
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  
  try {
    console.log(`Fetching CSV data for sheet: ${sheetName}...`);
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch CSV for sheet ${sheetName}:`, error.message);
    throw error;
  }
}

/**
 * Save fixtures to disk
 */
function saveFixtures(metadata, csvData, sheetName) {
  // Save spreadsheet metadata
  const metadataPath = path.join(FIXTURES_DIR, 'spreadsheet-metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`Saved spreadsheet metadata to: ${metadataPath}`);
  
  // Save CSV data
  const csvPath = path.join(FIXTURES_DIR, `rankings-${sheetName}.csv`);
  fs.writeFileSync(csvPath, csvData);
  console.log(`Saved rankings CSV to: ${csvPath}`);
  
  // Also save as "latest" for easy access
  const latestCsvPath = path.join(FIXTURES_DIR, 'rankings-latest.csv');
  fs.writeFileSync(latestCsvPath, csvData);
  console.log(`Saved latest rankings CSV to: ${latestCsvPath}`);
  
  // Create a summary file
  const summaryPath = path.join(FIXTURES_DIR, 'fixtures-summary.json');
  const summary = {
    fetchedAt: new Date().toISOString(),
    spreadsheetId: SPREADSHEET_ID,
    latestSheet: sheetName,
    totalSheets: metadata.sheets.length,
    files: [
      'spreadsheet-metadata.json',
      `rankings-${sheetName}.csv`,
      'rankings-latest.csv'
    ]
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Saved fixtures summary to: ${summaryPath}`);
}

/**
 * Main function
 */
async function main() {
  console.log('Fetching Google Sheets rankings fixtures...\n');
  
  try {
    // Fetch spreadsheet metadata
    const metadata = await fetchSpreadsheetMetadata();
    console.log(`Found ${metadata.sheets.length} sheets in spreadsheet`);
    
    // Find the latest sheet
    const latestSheet = findLatestSheet(metadata);
    console.log(`Latest sheet: ${latestSheet}`);
    
    // Fetch CSV data for the latest sheet
    const csvData = await fetchSheetAsCSV(latestSheet);
    console.log(`Fetched ${csvData.split('\n').length} rows of CSV data`);
    
    // Save all fixtures
    saveFixtures(metadata, csvData, latestSheet);
    
    console.log('\n✅ Successfully fetched and saved rankings fixtures!');
    console.log(`\nFixtures saved to: ${FIXTURES_DIR}`);
    
    // Show sample of the data
    const lines = csvData.split('\n').slice(0, 5);
    console.log('\nSample of fetched data:');
    lines.forEach(line => {
      console.log(line.substring(0, 100) + (line.length > 100 ? '...' : ''));
    });
    
  } catch (error) {
    console.error('\n❌ Failed to fetch rankings fixtures:', error.message);
    process.exit(1);
  }
}

// Run the script
main();