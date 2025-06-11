# API Endpoints Reference

## Overview
Draft Builder provides a REST API for accessing fantasy sports data from ESPN and Sleeper platforms. All endpoints follow a consistent request/response pattern and support query parameter-based requests with JSON responses.

## Base Configuration

### Request Format
All API requests use GET method with parameters passed as URL query strings. Parameters are JSON-encoded before being added to the query string.

### Response Format
All responses follow a consistent structure:
```typescript
{
    status: 'ok' | string;  // 'ok' for success, error message for failures
    data?: T;               // Response data (only present on success)
}
```

### Error Handling
- **400**: Invalid request parameters or malformed data
- **404**: Resource not found or platform API error
- **200**: Success with data or status message

### Caching
All successful responses include cache headers:
- Default TTL: 24 hours (`86400` seconds)
- Cache-Control includes `stale-while-revalidate` and `stale-if-error`
- Some endpoints may have custom cache durations

## Authentication
API endpoints do not require authentication at the application level. Platform-specific authentication (such as ESPN cookies) is handled through the league configuration object passed in requests.

## Common Request Parameters

### PlatformLeague Object
Required by most endpoints to identify the league and platform:
```typescript
{
    platform: 'espn' | 'sleeper';  // Platform identifier
    id: string;                    // League ID (numeric string)
    auth?: EspnAuth;              // ESPN-specific authentication (optional)
}
```

### Season ID
Most endpoints accept an optional season parameter:
- Format: 4-digit year as string (e.g., "2024", "2025")
- Defaults to current season if not provided
- Must be numeric string format

## Endpoint Reference

### 1. Find League
**Endpoint**: `GET /api/find-league`
**Purpose**: Validates league accessibility and basic connectivity

**Request Parameters**:
```typescript
{
    league: PlatformLeague;  // League configuration
}
```

**Response**:
```typescript
{
    status: 'ok' | string;  // 'ok' if league found, error message otherwise
}
```

**Example Usage**:
```
GET /api/find-league?league={"platform":"sleeper","id":"123456789"}
```

**Use Cases**:
- Validate league ID before storing
- Test platform connectivity
- Authentication verification for ESPN private leagues

---

### 2. Fetch League Info
**Endpoint**: `GET /api/fetch-league`
**Purpose**: Retrieves comprehensive league configuration and settings

**Request Parameters**:
```typescript
{
    league: PlatformLeague;  // League configuration
    season: SeasonId;        // Target season (optional)
}
```

**Response**:
```typescript
{
    status: 'ok' | string;
    data?: LeagueInfo;      // League details
}
```

**LeagueInfo Structure**:
```typescript
{
    name: string;                    // League name
    drafted: boolean;                // Whether draft is complete
    scoringType: 'standard' | 'ppr' | 'half-ppr';
    draft: {
        type: 'snake' | 'auction' | 'other';
        auctionBudget: number;       // Budget for auction drafts
    };
    rosterSettings: {                // Position requirements
        [position: string]: number;  // e.g., { "QB": 1, "RB": 2, "WR": 2 }
    };
}
```

**Example Response**:
```json
{
    "status": "ok",
    "data": {
        "name": "My Fantasy League",
        "drafted": true,
        "scoringType": "ppr",
        "draft": {
            "type": "auction",
            "auctionBudget": 200
        },
        "rosterSettings": {
            "QB": 1,
            "RB": 2,
            "WR": 2,
            "TE": 1,
            "FLEX": 1,
            "D/ST": 1,
            "K": 1,
            "Bench": 6
        }
    }
}
```

---

### 3. Fetch League History
**Endpoint**: `GET /api/fetch-league-history`
**Purpose**: Retrieves multi-season league information

**Request Parameters**:
```typescript
{
    league: PlatformLeague;  // League configuration
    startSeason: SeasonId;   // Starting season for history
}
```

**Response**:
```typescript
{
    status: 'ok' | string;
    data?: { [season: string]: LeagueInfo };  // Season-indexed league data
}
```

**Notes**:
- Returns empty object `{}` if no history found
- Sleeper automatically traverses previous league connections
- ESPN requires separate requests for different seasons

---

### 4. Fetch Draft Details
**Endpoint**: `GET /api/fetch-draft`
**Purpose**: Retrieves complete draft results and pick details

**Request Parameters**:
```typescript
{
    league: PlatformLeague;  // League configuration
    season: SeasonId;        // Draft season (optional)
}
```

**Response**:
```typescript
{
    status: 'ok' | string;
    data?: DraftDetail;
}
```

**DraftDetail Structure**:
```typescript
{
    season: string;          // Season of the draft
    picks: DraftPick[];      // Array of all draft picks
}
```

**DraftPick Structure**:
```typescript
{
    playerId: string;        // Platform-specific player ID
    team: string;            // Team/owner identifier
    price: number;           // Auction price or -1 for snake drafts
    overallPickNumber: number; // 1-indexed pick number
}
```

---

### 5. Fetch League Teams
**Endpoint**: `GET /api/fetch-league-teams`
**Purpose**: Retrieves team/owner information

**Request Parameters**:
```typescript
{
    league: PlatformLeague;  // League configuration
    season: SeasonId;        // Season (optional)
    scoringPeriodId: number; // Scoring period/week
}
```

**Response**:
```typescript
{
    status: 'ok' | string;
    data?: LeagueTeam[];
}
```

**LeagueTeam Structure**:
```typescript
{
    id: string;    // Unique team identifier
    name: string;  // Team/owner display name
}
```

---

### 6. Fetch Players
**Endpoint**: `GET /api/fetch-players`
**Purpose**: Retrieves player database with eligibility and pricing

**Request Parameters**:
```typescript
{
    league: PlatformLeague;  // League configuration
    season: SeasonId;        // Season (optional)
    scoringPeriodId: number; // Scoring period/week
    maxPlayers: number;      // Maximum players to return
}
```

**Response**:
```typescript
{
    status: 'ok' | string;
    data?: Player[];
}
```

**Player Structure**:
```typescript
{
    fullName: string;                           // Player full name
    ids: {                                      // Cross-platform IDs
        espn: string;
        sleeper: string;
        yahoo: string;
    };
    position: string;                           // Primary position
    eligiblePositions: string[];                // All eligible positions
    platformPrice?: number;                     // Platform auction value (optional)
}
```

**Notes**:
- Sleeper player data is cached in Redis with gzip compression
- ESPN provides platform-specific auction values
- Cross-platform player ID mapping available via Sleeper

## Error Responses

### Common Error Types

**400 - Bad Request**:
```json
{
    "status": "Invalid request, malformed parameter league"
}
```

**404 - Not Found**:
```json
{
    "status": "Failed to fetch league info: 404"
}
```

### Platform-Specific Errors

**ESPN Authentication**:
- Private leagues require valid `espn_s2` and `SWID` cookies
- Invalid authentication returns 401 status codes
- Public leagues do not require authentication

**Sleeper Rate Limiting**:
- Sleeper APIs are generally permissive
- Implement exponential backoff for high-volume requests

## Request Examples

### JavaScript/TypeScript
```typescript
import ApiClient from '@/app/api/ApiClient';

const league = {
    platform: 'sleeper' as const,
    id: '123456789'
};

const client = new ApiClient(league);

// Find league
const findResult = await client.findLeague();

// Fetch league info
const leagueInfo = await client.fetchLeague('2024');

// Fetch draft
const draftData = await client.fetchDraft('2024');

// Fetch players
const players = await client.fetchPlayers('2024', 1, 500);
```

### Direct HTTP Requests
```bash
# Find league
curl "https://your-domain.com/api/find-league?league=%7B%22platform%22%3A%22sleeper%22%2C%22id%22%3A%22123456789%22%7D"

# Fetch league info
curl "https://your-domain.com/api/fetch-league?league=%7B%22platform%22%3A%22sleeper%22%2C%22id%22%3A%22123456789%22%7D&season=%222024%22"
```

## Performance Considerations

### Caching Strategy
- **Default Cache**: 24 hours for most endpoints
- **Player Data**: Aggressively cached in Redis (Sleeper)
- **League Info**: Standard HTTP caching
- **Draft Data**: Cached until season changes

### Rate Limiting
- No application-level rate limiting implemented
- Platform APIs have their own rate limits
- Consider implementing client-side throttling for bulk operations

### Data Volume
- Player endpoints can return large datasets (500+ players)
- Consider pagination for very large leagues
- Use `maxPlayers` parameter to limit response size

## Development and Testing

### Local Development
- Requires Redis connection for Sleeper player caching
- ESPN requires actual league IDs and authentication
- Use demo data for initial development

### Error Testing
- Test with invalid league IDs
- Verify authentication handling for ESPN private leagues
- Test season parameter validation

### Integration Testing
- Validate cross-platform data consistency
- Test error propagation from platform APIs
- Verify caching behavior and TTL values 