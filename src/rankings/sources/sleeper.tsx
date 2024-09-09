import { Rankings } from '@/app/storage/savedMockTypes';
import axios from 'axios';
import Papa, { ParseResult } from 'papaparse';
import { SleeperScoringAdp } from "../types";

const SPREADSHEET_ID = '1wmjxi3K5rjIYME_lskUvquLbN331YV0vi-kg5VakpdY';

export interface SheetProperties {
    title: string;
    sheetId: number;
    index: number;
    sheetType: string;
    gridProperties: {
        rowCount: number;
        columnCount: number;
    };
}

export interface Sheet {
    properties: SheetProperties;
}

export interface Spreadsheet {
    spreadsheetId: string;
    properties: {
        title: string;
        locale: string;
        autoRecalc: string;
        timeZone: string;
    };
    sheets: Sheet[];
}

export type SleeperRow = {
    'Date': string;
    'Redraft PPR ADP': string;
    'Redraft SF ADP': string;
    'Redraft Half PPR ADP': string;
    'Dynasty PPR ADP': string;
    'Dynasty SF ADP': string;
    'Dynasty Half PPR ADP': string;
    'IDP ADP': string;
    'Player Team': string;
    'Player First Name': string;
    'Player Last Name': string;
    'Fantasy Player Position': string;
    'Player Id': string;
    'Positional Rank': string;
};
export async function getLatestAdpRanks(apiKey: string): Promise<Map<SleeperScoringAdp, Rankings>> {
    const main = await getMainSheet(apiKey);
    const latest = latestSheetName(main);
    const csv = await downloadSheet(latest, apiKey);
    const rows = parseSleeperCsv(csv).data;
    return buildRanks(rows);
}

async function getMainSheet(apiKey: string): Promise<Spreadsheet> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?key=${apiKey}`;
    try {
        const response = await axios.get<Spreadsheet>(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching sheet names:', error);
        throw error;
    }
}

async function downloadSheet(sheetName: string, apiKey: string): Promise<string> {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&key=${apiKey}`;
    try {
        const response = await axios.get(url, { responseType: 'text' });
        return response.data;
    } catch (error) {
        console.error(`Failed to download ${sheetName}:`, error);
        throw error;
    }
}

export function headerFor(scoringType: SleeperScoringAdp): keyof SleeperRow {
    switch (scoringType) {
        case 'ppr':
            return 'Redraft PPR ADP';
        case 'half-ppr':
            return 'Redraft Half PPR ADP';
        case 'sf':
            return 'Redraft SF ADP';
        default:
            throw new Error(`Unknown scoring type: ${scoringType}`);
    }
}

export type ParsedRow  = SleeperRow & Record<SleeperScoringAdp, number>;

export function buildRanks(adp: SleeperRow[]): Map<SleeperScoringAdp, Rankings> {
    const ranks = new Map<SleeperScoringAdp, Rankings>();
    const parsed = parseRowAdps(adp);
    const positionalRanks: Map<string, Map<string, number>> = rankInPosition(parsed);
    for (const scoringType of ['ppr', 'half-ppr', 'sf'] as SleeperScoringAdp[]) {
        const overallRanks = rankByAdp(parsed, scoringType);
        ranks.set(scoringType, {
            platform: 'sleeper',
            overall: overallRanks,
            positional: positionalRanks
        });
    }
    return ranks;
}

export function parseRowAdps(rows: SleeperRow[]): ParsedRow[] {
    return rows.map(parseOneRow);
}

export function parseOneRow(row: SleeperRow): ParsedRow {
    return {
        ...row,
        'ppr': parseFloat(row[headerFor('ppr')]),
        'half-ppr': parseFloat(row[headerFor('half-ppr')]),
        'sf': parseFloat(row[headerFor('sf')]),
    };
}

export function rankByAdp(adp: ParsedRow[], scoringType: SleeperScoringAdp): Map<string, number> {
    const ranks = new Map<string, number>();
    const sorted = adp.filter(row => row[scoringType] > 0)
        .sort((a, b) => a[scoringType] - b[scoringType]);
    sorted.forEach((row, index) => {
        ranks.set(row['Player Id'], index);
    });
    return ranks;
}

export function rankInPosition(adp: ParsedRow[]): Map<string, Map<string, number>> {
    const ranks = new Map<string, Map<string, number>>();
    for (const row of adp) {
        const positionalRank = row['Positional Rank'];
        if (positionalRank === '0') {
            continue;
        }
        const [position, rank] = parsePositionalRank(row['Positional Rank']);
        if (!ranks.has(position)) {
            ranks.set(position, new Map<string, number>());
        }
        ranks.get(position)!.set(row['Player Id'], rank);
    }
    return ranks;
}

export const parsePositionalRank = (rank: string): [string, number] => {
    const match = rank.match(/^(.+?)(\d+)$/);
    if (!match) {
        throw new Error(`Invalid positional rank: ${rank}`);
    }
    return [match[1], parseInt(match[2]) - 1];
}

export function latestSheetName(sheet: Spreadsheet): string {
    const datePattern = /^(.+?) ADP$/;
    let latestDate: Date | null = null;
    let latestSheetName: string | null = null;

    for (const subSheet of sheet.sheets) {
        const sheetName = subSheet.properties.title;
        const match = sheetName.match(datePattern);
        if (match) {
            const dateString = match[1];
            const date = parseDate(dateString);
            if (!latestDate || date > latestDate) {
                latestDate = date;
                latestSheetName = sheetName;
            }
        }
    }

    if (!latestSheetName) {
        throw new Error('No valid sheet names found');
    }

    return latestSheetName;
}

export function parseSleeperCsv(csv: string): ParseResult<SleeperRow> {
    return Papa.parse<SleeperRow>(csv, { header: true, dynamicTyping: false });
}

export function parseDate(dateString: string): Date {
    const date = new Date(dateString);
    return date;
}

