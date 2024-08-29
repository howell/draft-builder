import migrate, { migrateV2toV3 } from "./savedLeagueMigrations";


const exampleV2Leagues = '{"schemaVersion":2,"leagues":{"781060":{"platform":"espn","id":781060,"auth":{"swid":"{hello}","espnS2":"goodbye"}},"1050568427330465792":{"platform":"sleeper","id":"1050568427330465792"}}}';

const expectedV3Leagues = {
    schemaVersion: 3,
    leagues: {
        "781060": {
            platform: "espn",
            id: "781060",
            auth: {
                swid: "{hello}",
                espnS2: "goodbye",
            },
        },
        "1050568427330465792": {
            platform: "sleeper",
            id: "1050568427330465792",
        },
    },
};

describe("savedLeagueMigrations", () => {
    it("should migrate V2 leagues to V3", () => {
        const data = JSON.parse(exampleV2Leagues);
        expect(data).toBeDefined();
        expect(data.schemaVersion).toBe(2);
        const migratedData = migrateV2toV3(data);
        expect(migratedData).toEqual(expectedV3Leagues);
    });

    it("should migrate leagues using the migrate function", () => {
        const data = JSON.parse(exampleV2Leagues);
        expect(data).toBeDefined();
        expect(data.schemaVersion).toBe(2);
        const migratedData = migrate(data);
        expect(migratedData).toEqual(expectedV3Leagues);
    });
});
