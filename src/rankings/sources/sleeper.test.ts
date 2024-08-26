import Papa from 'papaparse';
import { SleeperRow, parseDate, latestSheetName, Spreadsheet, parseSleeperCsv, parsePositionalRank } from './sleeper';
import { readFileSync } from 'fs';


export const exampleSheet = [
    'Date,Redraft PPR ADP,Redraft SF ADP,Redraft Half PPR ADP,Dynasty PPR ADP,Dynasty SF ADP,Dynasty Half PPR ADP,IDP ADP,Player Team,Player First Name,Player Last Name,Fantasy Player Position,Player Id,Positional Rank',
    '"August 21, 2024",1.2,2.8,1.5,4.8,15.4,6.5,4.8,SF,Christian,McCaffrey,RB,4034,RB1',
    '"August 21, 2024",2.7,6.1,2.1,9,22,10.2,12.3,MIA,Tyreek,Hill,WR,3321,WR1',
    '"August 21, 2024",3.1,5.1,3.9,2.6,7.3,2.4,5.9,DAL,CeeDee,Lamb,WR,6786,WR2'
].join('\n');

describe('exampleSheet parsing', () => {
    it('should parse exampleSheet and check header values and types', () => {
        const parsedData = parseSleeperCsv(exampleSheet); 
        const headers = parsedData.meta.fields;

        expect(headers).toContain('Date');
        expect(headers).toContain('Redraft PPR ADP');
        expect(headers).toContain('Redraft SF ADP');
        expect(headers).toContain('Redraft Half PPR ADP');
        expect(headers).toContain('Dynasty PPR ADP');
        expect(headers).toContain('Dynasty SF ADP');
        expect(headers).toContain('Dynasty Half PPR ADP');
        expect(headers).toContain('IDP ADP');
        expect(headers).toContain('Player Team');
        expect(headers).toContain('Player First Name');
        expect(headers).toContain('Player Last Name');
        expect(headers).toContain('Fantasy Player Position');
        expect(headers).toContain('Player Id');
        expect(headers).toContain('Positional Rank');

        const data = parsedData.data;
        expect(data.length).toBe(3);

        const firstRow = data[0];
        expect(firstRow['Date']).toBe('August 21, 2024');
        expect(parseFloat(firstRow['Redraft PPR ADP'])).toBe(1.2);
        expect(parseFloat(firstRow['Redraft SF ADP'])).toBe(2.8);
        expect(parseFloat(firstRow['Redraft Half PPR ADP'])).toBe(1.5);
        expect(parseFloat(firstRow['Dynasty PPR ADP'])).toBe(4.8);
        expect(parseFloat(firstRow['Dynasty SF ADP'])).toBe(15.4);
        expect(parseFloat(firstRow['Dynasty Half PPR ADP'])).toBe(6.5);
        expect(parseFloat(firstRow['IDP ADP'])).toBe(4.8);
        expect(firstRow['Player Team']).toBe('SF');
        expect(firstRow['Player First Name']).toBe('Christian');
        expect(firstRow['Player Last Name']).toBe('McCaffrey');
        expect(firstRow['Fantasy Player Position']).toBe('RB');
        expect(firstRow['Player Id']).toBe('4034');
        expect(firstRow['Positional Rank']).toBe('RB1');

        // Add assertions for the remaining rows if needed
    });
});
describe('parseDate', () => {
    it('should parse date strings correctly', () => {
        const dateString1 = 'August 21, 2024';
        const dateString2 = 'September 10, 2024';
        const dateString3 = 'October 5, 2024';

        const parsedDate1 = parseDate(dateString1);
        const parsedDate2 = parseDate(dateString2);
        const parsedDate3 = parseDate(dateString3);

        expect(parsedDate1.getFullYear()).toBe(2024);
        expect(parsedDate1.getMonth()).toBe(7); // Note: Months are zero-based
        expect(parsedDate1.getDate()).toBe(21);

        expect(parsedDate2.getFullYear()).toBe(2024);
        expect(parsedDate2.getMonth()).toBe(8);
        expect(parsedDate2.getDate()).toBe(10);

        expect(parsedDate3.getFullYear()).toBe(2024);
        expect(parsedDate3.getMonth()).toBe(9);
        expect(parsedDate3.getDate()).toBe(5);

        expect(parsedDate3.getTime()).toBeGreaterThan(parsedDate2.getTime());

    });
});

describe('latestSheetName', () => {
    let sheet: Spreadsheet;

    beforeAll(() => {
        const sheetStr = readFileSync('src/rankings/sources/examples/sleeper_sheets.json', 'utf-8');
        sheet = JSON.parse(sheetStr);
        console.log(sheet.properties)
    });

    it('should return the latest sheet name', () => {
        const name = latestSheetName(sheet);
        expect(name).toBe('August 21, 2024 ADP');
    });

});

describe('parsePositionalRank', () => {
    it('should parse valid positional rank', () => {
        const rank = 'QB1';
        const expectedPosition = 'QB';
        const expectedRank = 0;

        const [position, parsedRank] = parsePositionalRank(rank);

        expect(position).toBe(expectedPosition);
        expect(parsedRank).toBe(expectedRank);
    });

    it('should throw an error for invalid positional rank', () => {
        const rank = 'InvalidRank';

        expect(() => parsePositionalRank(rank)).toThrowError('Invalid positional rank: InvalidRank');
    });
});