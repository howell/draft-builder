# Draft Builder - Project Overview

## Application Summary

**Draft Builder** is a Next.js/React web application designed to help casual fantasy football players with pre-draft preparation. The application integrates with multiple fantasy sports platforms and data sources to provide comprehensive draft analytics, player rankings, and mock draft functionality.

## Mission & Purpose

The primary mission is to **simplify auction draft preparation for casual fantasy football players** by aggregating data from multiple sources and providing easy-to-use budget planning and analytics tools. The application removes the complexity of auction value research and budget allocation, allowing users to focus on auction strategy and optimal spending decisions.

### Core Value Proposition
- **Centralized Data**: Pulls from ESPN, Sleeper, and Google Sheets for comprehensive player values and ADP data
- **Auction Budget Planner**: Plan and simulate auction spending with real league settings and current player values
- **Value-Based Analytics**: Player valuations, auction value analysis, and budget optimization for auction drafts
- **User-Friendly Interface**: Designed for casual players who want auction insights without complexity

## Target Users

**Primary Audience**: Casual fantasy football players who:
- Want to improve their auction draft performance without becoming analytics experts
- Use ESPN or Sleeper as their primary fantasy platform
- Participate in auction-style fantasy leagues
- Value pre-draft preparation but have limited time for auction value research

**User Goals**:
- Understand player auction values and market prices across different scoring systems
- Plan auction budget allocation with their actual league settings and budget
- Identify auction value opportunities and avoid overpaying for players
- Optimize auction spending strategy based on position scarcity and budget constraints

## Core Features

### 1. Platform Integration
- **ESPN Fantasy**: Direct league import with authentication support
- **Sleeper**: League data fetching and player synchronization
- **Google Sheets**: Real-time ADP (Average Draft Position) data import

### 2. Auction Draft Preparation Tools
- **Budget Planning Engine**: Plan auction spending with real league settings and budget constraints
- **Player Valuations**: Multiple scoring systems (PPR, Half-PPR, Standard, Superflex) with auction values
- **Value Analysis**: Compare player auction values across different sources and identify bargains
- **Position Analytics**: Auction value scarcity analysis and tier-based spending strategies

### 3. Data Management
- **Real-time Updates**: Automated fetching of latest player data and rankings
- **Caching Strategy**: Redis-based caching for performance optimization
- **Local Storage**: User preferences and league configurations

## Technology Stack

### Frontend
- **Framework**: Next.js 15.3.3 with React 19.1.0
- **Styling**: TailwindCSS 3.4.1
- **State Management**: React hooks and context
- **UI Components**: Custom component library
- **Analytics**: Vercel Analytics integration

### Backend
- **Runtime**: Next.js API routes (Node.js)
- **Data Processing**: Server-side data aggregation and transformation
- **External APIs**: ESPN Fantasy, Sleeper, Google Sheets API
- **Authentication**: Platform-specific auth flows (ESPN, Sleeper)

### Infrastructure
- **Hosting**: Vercel platform
- **Caching**: Redis (ioredis 5.4.1)
- **Build System**: TypeScript compilation with Next.js
- **Monitoring**: Built-in Vercel monitoring and analytics

### Development Tools
- **Language**: TypeScript 5.x
- **Testing**: Jest with Testing Library
- **Linting**: ESLint with Next.js configuration
- **Package Management**: npm with package-lock.json

## API Dependencies & Data Sources

### 1. ESPN Fantasy API
**Purpose**: Primary league data source for ESPN users
**Data Types**:
- League settings and roster requirements
- Draft history and picks
- Player ownership and scoring data
- Team rosters and matchups

**Authentication**: Cookie-based authentication for private leagues
**Rate Limiting**: Managed through request throttling
**Caching**: League data cached in Redis for performance

### 2. Sleeper API
**Purpose**: Primary league data source for Sleeper users
**Data Types**:
- League configuration and scoring settings
- Player database with IDs and metadata
- Draft information and pick history
- ADP data and player trends

**Authentication**: Public API with no authentication required
**Rate Limiting**: Built-in request management
**Caching**: Player data and league info cached locally

### 3. Google Sheets API
**Purpose**: Real-time ADP and ranking data import
**Specific Integration**: 
- **Spreadsheet ID**: `1wmjxi3K5rjIYME_lskUvquLbN331YV0vi-kg5VakpdY`
- **Data Format**: CSV export with standardized column headers
- **Update Frequency**: Daily sheet updates with latest ADP data

**Data Structure**:
```
- Date: Data collection timestamp
- Redraft PPR ADP: PPR format average draft position
- Redraft Half PPR ADP: Half-PPR format ADP
- Redraft SF ADP: Superflex format ADP
- Player Team: NFL team abbreviation
- Player First Name: Player first name
- Player Last Name: Player last name
- Fantasy Player Position: Position (QB, RB, WR, TE, K, DEF)
- Player Id: Sleeper player identifier
- Positional Rank: Position-specific ranking (e.g., "RB12")
```

**Authentication**: Google API key authentication
**Rate Limiting**: Google Sheets API quota management
**Caching**: Processed rankings cached for 24 hours

## Data Flow Architecture

### 1. League Import Flow
```
User Login → Platform Auth → League Discovery → Data Fetch → Local Storage → Dashboard
```

### 2. Rankings Update Flow
```
Google Sheets → CSV Download → Data Parsing → Rankings Generation → Cache Storage → UI Update
```

### 3. Auction Budget Planning Flow
```
League Settings → Player Data Fetch → Value Integration → Budget Simulation → Spending Analysis
```

## Key Business Logic

### 1. Player Valuation
- **ADP Integration**: Uses Google Sheets data for current market values
- **Multi-Platform Normalization**: Standardizes player IDs across ESPN/Sleeper
- **Scoring Adjustments**: Adapts rankings based on league scoring settings
- **Position Scarcity**: Calculates replacement level values by position

### 2. Auction Budget Simulation
- **Budget Planning Engine**: Simulates auction spending scenarios and budget allocation
- **Auction Budget Management**: Tracks auction budgets, salary cap constraints, and remaining funds
- **Position Requirements**: Enforces roster construction rules within budget constraints
- **Value-Based Bidding**: Recommends auction bids based on player value and remaining budget

### 3. Analytics Engine
- **Tier Analysis**: Groups players into value tiers by position
- **Breakpoint Identification**: Highlights significant value drops
- **Opportunity Cost**: Calculates value of alternative picks
- **Risk Assessment**: Factors injury history and performance variance

## Future Platform Support

### Planned Integrations
1. **Yahoo Fantasy API**: Similar to ESPN integration for Yahoo users
2. **Manual CSV Upload**: Allow users to import custom rankings and data
3. **Additional Data Sources**: Fantasy Pros, FantasyFootballNerd, etc.

### Architecture Considerations
- **Platform Abstraction**: Common interfaces for all fantasy platforms
- **Data Normalization**: Standardized internal format for all external data
- **Plugin Architecture**: Easy addition of new platforms and data sources

## Current Limitations

1. **Platform Coverage**: Limited to ESPN and Sleeper (Yahoo planned)
2. **Sport Focus**: Fantasy football only (no basketball, baseball, etc.)
3. **League Types**: Primarily supports redraft leagues (dynasty/keeper limited)
4. **Data Dependencies**: Relies on external Google Sheets for ADP data

## Success Metrics

### User Engagement
- League connection rate and retention
- Mock draft completion rates
- Feature usage analytics
- User session duration

### Data Quality
- API response times and success rates
- Cache hit rates and performance
- Data freshness and accuracy
- Cross-platform data consistency

### Technical Performance
- Page load times and Core Web Vitals
- API endpoint response times
- Error rates and reliability
- Vercel deployment success rates

## Development Priorities

### Short-term (Current)
1. Maintain API integrations and data quality
2. Improve mock draft engine accuracy
3. Enhance mobile responsiveness
4. Add missing position handling (DEF on Sleeper)

### Medium-term (Next 6 months)
1. Yahoo Fantasy API integration
2. Manual data upload functionality
3. Advanced analytics features
4. Performance optimization

### Long-term (Future)
1. Multi-sport support
2. Dynasty/keeper league features
3. Social features and league sharing
4. Mobile application development

## Technical Debt & Maintenance

### Known Issues
- Off-by-one bug in budget calculations
- DEF position not displaying on Sleeper
- DropdownMenu alignment issues
- Player data synchronization edge cases

### Maintenance Requirements
- Regular API dependency updates
- Google Sheets access token management
- Cache invalidation strategies
- Performance monitoring and optimization

This project overview provides the foundation for understanding Draft Builder's purpose, architecture, and implementation details. It serves as the primary reference for AI assistants working with the codebase. 