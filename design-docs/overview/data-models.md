# Data Models Documentation

## Overview
Draft Builder uses a unified data model approach to handle information from multiple fantasy sports platforms. All platform-specific data is transformed into common TypeScript interfaces, enabling consistent application logic regardless of the data source.

## Core Data Model Philosophy

### Platform Abstraction
- **Unified Interfaces**: All platforms normalize to the same data structures
- **Cross-Platform IDs**: Players include ID mappings for ESPN, Sleeper, and Yahoo
- **Consistent Error Handling**: All methods return either data or numeric error codes
- **Type Safety**: Strong TypeScript typing throughout the application

### Data Flow Pattern
```
Platform API → Platform-Specific Types → Transformation Functions → Common Models → Application Logic
```

## Platform Identification Models

### Platform Type
```typescript
export type Platform = 'espn' | 'yahoo' | 'sleeper';
```

### League Identification
```typescript
export type LeagueId = string;  // Must be numeric string format

export type PlatformLeague = {
    platform: Platform;
    id: LeagueId;
};

// Platform-specific extensions
export type EspnLeague = PlatformLeague & {
    platform: 'espn';
    auth?: EspnAuth;  // Optional authentication for private leagues
};

export type SleeperLeague = PlatformLeague & {
    platform: 'sleeper';
};
```

### Season Identification
```typescript
export type SeasonId = string;  // 4-digit year (e.g., "2024", "2025")
```

## League Data Models

### League Information
```typescript
export type LeagueInfo = {
    name: string;                    // Display name of the league
    drafted: boolean;                // Whether the draft has been completed
    scoringType: ScoringType;        // Scoring system used
    draft: DraftInfo;                // Draft configuration
    rosterSettings: RosterSettings;  // Position requirements
};

export type ScoringType = 'standard' | 'ppr' | 'half-ppr';

export type DraftInfo = {
    type: DraftType;        // Draft format
    auctionBudget: number;  // Budget for auction drafts (0 for snake)
};

export type DraftType = 'snake' | 'auction' | 'other';
```

### Roster Configuration
```typescript
export type RosterSettings = Record<string, number>;

// Example RosterSettings:
{
    "QB": 1,          // Starting quarterback
    "RB": 2,          // Starting running backs
    "WR": 2,          // Starting wide receivers
    "TE": 1,          // Starting tight end
    "FLEX": 1,        // Flex position (RB/WR/TE)
    "D/ST": 1,        // Defense/special teams
    "K": 1,           // Kicker
    "Bench": 6,       // Bench slots
    "IR": 1           // Injured reserve (optional)
}
```

### League History
```typescript
export type LeagueHistory = Map<SeasonId, LeagueInfo>;

// When serialized for API responses:
export type LeagueHistoryData = { [season: string]: LeagueInfo };
```

## Player Data Models

### Player Information
```typescript
export type Player = {
    fullName: string;                           // Complete player name
    ids: { [id in Platform]: PlayerId };       // Cross-platform ID mapping
    position: string;                           // Primary position (QB, RB, WR, TE, etc.)
    eligiblePositions: string[];                // All positions player can fill
    platformPrice?: number;                     // Platform-specific auction value
};

export type PlayerId = string;  // Platform-specific player identifier
```

### Player ID Mapping
```typescript
// Example Player.ids structure:
{
    espn: "12345",      // ESPN player ID
    sleeper: "67890",   // Sleeper player ID  
    yahoo: "11111"      // Yahoo player ID (when available)
}
```

### Position System
Standard position abbreviations used across platforms:
- **QB**: Quarterback
- **RB**: Running Back
- **WR**: Wide Receiver
- **TE**: Tight End
- **K**: Kicker
- **D/ST**: Defense/Special Teams
- **FLEX**: Flex positions (RB/WR/TE combinations)
- **SF**: Super Flex (QB/RB/WR/TE)
- **OP**: Offensive Player
- **Bench**: Bench slot
- **IR**: Injured Reserve

## Draft Data Models

### Draft Results
```typescript
export type DraftDetail = {
    season: SeasonId;      // Season identifier
    picks: DraftPick[];    // All draft picks in order
};

export type DraftPick = {
    playerId: string;           // Platform-specific player ID
    team: string;               // Team/owner identifier
    price: number;              // Auction price (-1 for snake drafts)
    overallPickNumber: number;  // 1-indexed pick number
};
```

### Drafted Player (Merged Data)
```typescript
export type DraftedPlayer = DraftPick & Player & {
    draftedBy: LeagueTeam | string | number;  // Team that drafted the player
};
```

## Team Data Models

### League Teams
```typescript
export type LeagueTeam = {
    id: string;    // Unique team identifier
    name: string;  // Team or owner display name
};
```

## Authentication Models

### ESPN Authentication
```typescript
export type EspnAuth = {
    espn_s2: string;  // ESPN session cookie
    SWID: string;     // ESPN user identifier
};
```

## Position Configuration Models

### Position Ordering
```typescript
// From src/constants.ts
export const LINEUP_POSITION_ORDER = [
    'QB', 'TQB', 'OP', 'SF',      // Quarterback positions
    'RB',                          // Running backs
    'WR',                          // Wide receivers
    'TE',                          // Tight ends
    'FLEX', 'RB/WR', 'WR/TE', 'RB/WR/TE',  // Flex positions
    'K',                           // Kickers
    'D/ST',                        // Defense/Special Teams
    'Bench',                       // Bench slots
    'IR'                           // Injured Reserve
];
```

### Position Utilities
```typescript
export function lineupOrder(position: string): number;
export function compareLineupPositions(positionA: string, positionB: string): number;
```

## Data Transformation Patterns

### Error Union Types
All API methods use union types for error handling:
```typescript
// Instead of throwing exceptions, return error codes
fetchLeague(): Promise<LeagueInfo | number>
fetchPlayers(): Promise<Player[] | number>
```

### Platform Transformation Functions
Each platform implements transformation functions:
```typescript
// ESPN transformations
export function importEspnLeagueInfo(info: EspnTypes.LeagueInfo): LeagueInfo;
export function importEspnPlayerInfo(info: EspnTypes.PlayerInfo): Player;
export function importEspnDraftPick(pick: EspnTypes.DraftPick): DraftPick;

// Sleeper transformations  
export function importSleeperLeagueInfo(info: SleeperTypes.LeagueInfo, draft: SleeperTypes.DraftInfo): LeagueInfo;
export function importSleeperPlayer(id: string, player: SleeperTypes.Player): Player;
```

## Data Validation Models

### Type Guards
```typescript
export function isPlatform(str: any): str is Platform;
export function isPlatformLeague(league: any): league is PlatformLeague;
export function isLeagueId(str: any): str is LeagueId;
export function isSeasonId(str: any): str is SeasonId;
```

### Request Validation
```typescript
// Example from API decoder
function decodeRequest(searchParams: URLSearchParams): FetchLeagueRequest | DecodeFailure {
    return Decoder.create(searchParams)
        .decode('league', isPlatformLeague)
        .decode('season', isSeasonId)
        .finalize();
}
```

## Redis Caching Models

### Cache Key Strategy
```typescript
const PLAYERS_CACHE_KEY = 'sleeper-players';  // Player data cache
// Additional cache keys follow pattern: {platform}-{data-type}
```

### Cache Data Compression
```typescript
// Sleeper uses gzip compression for player data
export async function encodeForRedis(data: any): Promise<string>;
export async function decodeFromRedis(data: string): Promise<any>;
```

## API Response Models

### Standard Response Structure
```typescript
export type ApiResponse<T> = {
    status: 'ok' | string;  // Success indicator or error message
    data?: T;               // Response payload (only on success)
};

// Specific response types
export type FetchLeagueResponse = ApiResponse<LeagueInfo>;
export type FetchPlayersResponse = ApiResponse<Player[]>;
export type FetchDraftResponse = ApiResponse<DraftDetail>;
export type FindLeagueResponse = ApiResponse<void>;
```

## Data Relationships

### Entity Relationship Overview
```
League 1:1 DraftInfo
League 1:1 RosterSettings  
League 1:N LeagueTeam
League 1:1 DraftDetail (per season)
DraftDetail 1:N DraftPick
DraftPick N:1 Player (via playerId)
DraftPick N:1 LeagueTeam (via team)
Player 1:1 CrossPlatformIds
```

### Data Dependencies
1. **League Info** → Required for all other data fetching
2. **Player Data** → Must be available before processing draft picks
3. **Team Data** → Required for meaningful draft analysis
4. **Draft Data** → Depends on completed draft and player/team data

## Platform-Specific Considerations

### ESPN Specifics
- **Authentication**: Private leagues require manual cookie extraction
- **Player IDs**: ESPN-specific numeric identifiers
- **Auction Values**: Platform provides projected auction values
- **Position Mapping**: Rich position eligibility through utility functions

### Sleeper Specifics
- **Cross-Platform IDs**: Provides ESPN and Yahoo player IDs
- **League History**: Automatic traversal via `previous_league_id`
- **Caching**: Aggressive Redis caching for player data
- **Position Flexibility**: Complex flex position eligibility calculations

## Future Data Model Considerations

### Planned Extensions
- **Yahoo Integration**: Additional platform in union types
- **Real-time Updates**: WebSocket data models for live drafts
- **Historical Analytics**: Extended historical data structures
- **Mock Drafts**: Mock draft simulation data models

### Scalability Considerations
- **Pagination**: Large datasets may require pagination models
- **Versioning**: API versioning strategy for model evolution
- **Caching**: Enhanced caching models for performance
- **Sharding**: Redis sharding for large-scale player data

## Best Practices

### Type Safety
- Always use type guards for external data
- Prefer union types over exceptions for error handling
- Use const assertions for literal types
- Implement exhaustive switch statements for platform handling

### Data Consistency
- Transform all platform data to common models immediately
- Validate data at API boundaries
- Use consistent naming conventions across platforms
- Implement data integrity checks for critical relationships

### Performance Optimization
- Cache expensive transformations
- Use appropriate data structures (Maps vs Objects)
- Consider memory usage for large datasets
- Implement lazy loading where appropriate 