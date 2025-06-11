# Platform Integration Guide

## Overview
Draft Builder integrates with two major fantasy sports platforms: ESPN and Sleeper. Each platform has its own API, authentication methods, and data formats. This document explains how these integrations work and provides guidance for maintaining and extending them.

## Platform Architecture

### Common Interface Pattern
All platform integrations implement the abstract `PlatformApi` class, providing a uniform interface for the application to interact with different platforms regardless of their underlying differences.

```typescript
// src/platforms/PlatformApi.ts
export abstract class PlatformApi {
    public abstract fetchLeague(season?: SeasonId): Promise<LeagueInfo | number>;
    public abstract fetchLeagueHistory(startYear?: SeasonId): Promise<LeagueHistory>;
    public abstract fetchDraft(seasonId?: SeasonId): Promise<DraftDetail | number>;
    public abstract fetchLeagueTeams(season?: SeasonId): Promise<LeagueTeam[] | number>;
    public abstract fetchPlayers(season?: SeasonId): Promise<Player[] | number>;
}
```

### Platform Detection and Factory
The application uses a factory pattern to create the appropriate API client based on the platform type:

```typescript
// src/platforms/ApiClient.ts
export function apiFor(league: PlatformLeague): PlatformApi {
    switch (league.platform) {
        case 'espn': return new EspnApi(league);
        case 'sleeper': return new SleeperApi(league);
        // Yahoo support planned but not yet implemented
    }
}
```

## ESPN Integration

### Authentication Flow
ESPN requires special authentication for private leagues:

**Public Leagues:**
- No authentication required
- Can access basic league information directly

**Private Leagues:**
- Requires `espn_s2` and `SWID` cookies
- Users must manually extract these from their ESPN session
- Cookies are passed as optional `auth` parameter in `EspnLeague` object

### API Implementation
The ESPN integration is implemented in `src/platforms/espn/EspnApi.ts` and follows these patterns:

**Data Fetching:**
- Uses custom fetch functions that handle ESPN's API format
- Implements error handling that returns HTTP status codes as numbers
- Transforms ESPN-specific data types to common interface types

**Key Transformation Functions:**
- `importEspnLeagueInfo()`: Converts ESPN league format to common `LeagueInfo`
- `importEspnDraftDetail()`: Processes draft information and picks
- `importEspnPlayerInfo()`: Normalizes player data with position mappings

**ESPN-Specific Features:**
- Draft auction values available as `platformPrice`
- Rich roster position mapping through utility functions
- Support for multiple scoring types (Standard, PPR, Half-PPR)

### Data Flow Example
```
ESPN API → EspnApi.fetchLeague() → importEspnLeagueInfo() → LeagueInfo
```

### Rate Limiting and Caching
- ESPN has undocumented rate limits
- No built-in caching at platform level (handled at application level)
- Errors are logged through `logRequestError()` utility

## Sleeper Integration

### Authentication Flow
Sleeper has a simpler authentication model:
- Most endpoints are publicly accessible
- No special authentication required for league data
- User identification handled through league membership

### API Implementation  
The Sleeper integration is implemented in `src/platforms/sleeper/SleeperApi.ts` with these characteristics:

**Advanced Caching:**
- Player data is cached in Redis with gzip compression
- Cache key: `sleeper-players`
- Uses `encodeForRedis()` and `decodeFromRedis()` for efficient storage

**League History Traversal:**
- Supports multi-season league history through `previous_league_id` links
- Automatically traverses to find specific seasons
- Handles league continuity across multiple years

**Data Transformations:**
- `importSleeperLeagueInfo()`: Converts Sleeper format to common interface
- `importSleeperDraftDetail()`: Processes draft with roster ID mapping
- `importSleeperPlayer()`: Handles cross-platform player ID mapping

### Unique Features
- **Cross-Platform Player IDs**: Sleeper provides ESPN and Yahoo IDs for players
- **Flexible Position Mapping**: Advanced eligibility calculation through `sleeperFlexEligibility()`
- **Draft Roster Mapping**: Complex logic to map draft picks to actual teams

### Redis Caching Strategy
```typescript
// Player data caching with compression
const cached = await redis.get(PLAYERS_CACHE_KEY);
const cached_data = cached && decodeFromRedis(cached);
if (cached_data) {
    return cached_data;
}
// Fetch, compress, and cache new data
const playersString = await encodeForRedis(players);
await redis.set(PLAYERS_CACHE_KEY, playersString);
```

## Common Data Models

### Core Types
All platforms normalize their data to these common types:

**League Information:**
```typescript
export type LeagueInfo = {
    name: string;
    drafted: boolean;
    scoringType: ScoringType; // 'standard' | 'ppr' | 'half-ppr'
    draft: DraftInfo;
    rosterSettings: RosterSettings;
};
```

**Player Data:**
```typescript
export type Player = {
    fullName: string;
    ids: { [id in Platform]: PlayerId }; // Cross-platform ID mapping
    position: string;
    eligiblePositions: string[];
    platformPrice?: number; // Platform-specific auction values
};
```

**Draft Information:**
```typescript
export type DraftDetail = {
    season: SeasonId;
    picks: DraftPick[];
};

export type DraftPick = {
    playerId: string;
    team: string;
    price: number; // Auction price or -1 for snake drafts
    overallPickNumber: number;
};
```

### Data Normalization
Each platform has transformation functions that convert platform-specific formats to these common types. This allows the rest of the application to work with consistent data structures regardless of the source platform.

## Error Handling Patterns

### Consistent Error Response
All platform methods return either the expected data type or a number representing an HTTP error code:

```typescript
public async fetchLeague(season?: SeasonId): Promise<LeagueInfo | number>
```

This pattern allows for:
- Consistent error handling across all platforms
- HTTP status code propagation from platform APIs
- Easy identification of failed requests vs. successful data

### Error Logging
Common error logging is handled through the `logRequestError()` utility:

```typescript
export function logRequestError(message: string, error: any): void {
    console.error("Error with", message);
    console.error("Error type:", typeof error);
    console.error("Error prefix:", JSON.stringify(error).substring(0, 500));
}
```

## Adding New Platforms

To add support for a new platform (e.g., Yahoo):

1. **Create Platform Directory**: `src/platforms/yahoo/`
2. **Implement API Class**: Extend `PlatformApi` with platform-specific methods
3. **Create Type Definitions**: Define platform-specific types in `types.ts`
4. **Add Data Transformers**: Implement functions to convert to common formats
5. **Update Factory**: Add case to `apiFor()` function
6. **Add Authentication**: Implement any required auth flows
7. **Update Common Types**: Add platform to `Platform` union type

## Testing Strategy

### Unit Tests
- Each platform has its own test suite (e.g., `SleeperApi.test.ts`)
- Tests focus on data transformation accuracy
- Mock API responses for consistent testing

### Integration Testing
- Test actual API connectivity in development
- Validate authentication flows
- Verify cross-platform player ID mapping

## Performance Considerations

### Caching Strategy
- **Sleeper**: Aggressive caching of player data in Redis
- **ESPN**: Relies on application-level caching
- **General**: Consider platform-specific cache TTL values

### API Rate Limits
- **ESPN**: Undocumented limits, be conservative
- **Sleeper**: More permissive, but implement backoff strategies
- **Monitoring**: Log request patterns to identify bottlenecks

### Data Efficiency
- Compress large datasets (e.g., player lists) before caching
- Batch requests where possible
- Consider pagination for large result sets

## Debugging Platform Issues

### Common Problems
1. **Authentication Failures**: Check ESPN cookie validity
2. **Rate Limiting**: Implement exponential backoff
3. **Data Format Changes**: Platform APIs can change without notice
4. **Season Transitions**: Handle year-over-year data continuity

### Debugging Tools
- Console logging for request/response cycles
- Redis inspection for cache debugging
- Network tab analysis for authentication issues
- Error code mapping for platform-specific issues

## Future Enhancements

### Planned Features
- Yahoo Fantasy Sports integration
- Real-time draft updates via WebSockets
- Enhanced error recovery and retry logic
- Automated platform API health checks

### Architecture Improvements
- Plugin-based platform loading
- Shared caching strategies across platforms
- Unified authentication management
- Cross-platform data synchronization 