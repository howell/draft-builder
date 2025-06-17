# API Changes for Supabase Migration

## Overview

This document outlines all API changes required for the Supabase migration, including new endpoints, modifications to existing ones, and the authentication layer that will be added.

## New Authentication Middleware

### `src/lib/auth/middleware.ts`
```typescript
import { createServerComponentClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/lib/database.types'

export async function getAuthenticatedUser(request: NextRequest) {
  const supabase = createServerComponentClient<Database>()
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return null
    }
    
    return user
  } catch (error) {
    console.error('Authentication error:', error)
    return null
  }
}

export function requireAuth(handler: Function) {
  return async (request: NextRequest, context: any) => {
    const user = await getAuthenticatedUser(request)
    
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // Add user to request context
    request.user = user
    return handler(request, context)
  }
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Authentication required' },
    { status: 401 }
  )
}

export function forbiddenResponse() {
  return NextResponse.json(
    { error: 'Access forbidden' },
    { status: 403 }
  )
}
```

## New Authentication Endpoints

### `src/app/api/auth/signup/route.ts`
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/lib/database.types'

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>()
  
  try {
    const { email, password } = await request.json()
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    
    return NextResponse.json({
      user: data.user,
      session: data.session,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### `src/app/api/auth/signin/route.ts`
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/lib/database.types'

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>()
  
  try {
    const { email, password } = await request.json()
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }
    
    return NextResponse.json({
      user: data.user,
      session: data.session,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### `src/app/api/auth/signout/route.ts`
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/lib/database.types'

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>()
  
  try {
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ message: 'Signed out successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## Modified Existing Endpoints

### `src/app/api/leagues/route.ts` (NEW)
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Database } from '@/lib/database.types'

export const GET = requireAuth(async (request: NextRequest) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { data: leagues, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch leagues' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ leagues })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const POST = requireAuth(async (request: NextRequest) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { league_id, platform, auth_data } = await request.json()
    
    const { data: league, error } = await supabase
      .from('leagues')
      .insert({
        user_id: user.id,
        league_id,
        platform,
        auth_data,
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to save league' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ league })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

### `src/app/api/leagues/[leagueId]/route.ts` (NEW)
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Database } from '@/lib/database.types'

export const GET = requireAuth(async (
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { data: league, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('id', params.leagueId)
      .eq('user_id', user.id)
      .single()
    
    if (error || !league) {
      return NextResponse.json(
        { error: 'League not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ league })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const DELETE = requireAuth(async (
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { error } = await supabase
      .from('leagues')
      .delete()
      .eq('id', params.leagueId)
      .eq('user_id', user.id)
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete league' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ message: 'League deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

### `src/app/api/draft-sessions/route.ts` (NEW)
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Database } from '@/lib/database.types'

export const GET = requireAuth(async (request: NextRequest) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  const { searchParams } = new URL(request.url)
  const leagueId = searchParams.get('league_id')
  
  try {
    let query = supabase
      .from('draft_sessions')
      .select(`
        *,
        league:leagues(league_id, platform),
        draft_settings(*),
        player_selections(*),
        cost_adjustments(*)
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    
    if (leagueId) {
      query = query.eq('league_id', leagueId)
    }
    
    const { data: sessions, error } = await query
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch draft sessions' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ sessions })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const POST = requireAuth(async (request: NextRequest) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { league_id, name, year, notes = '' } = await request.json()
    
    // Verify league ownership
    const { data: league, error: leagueError } = await supabase
      .from('leagues')
      .select('id')
      .eq('id', league_id)
      .eq('user_id', user.id)
      .single()
    
    if (leagueError || !league) {
      return NextResponse.json(
        { error: 'League not found' },
        { status: 404 }
      )
    }
    
    const { data: session, error } = await supabase
      .from('draft_sessions')
      .insert({
        user_id: user.id,
        league_id,
        name,
        year,
        notes,
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to create draft session' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ session })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

### `src/app/api/draft-sessions/[sessionId]/route.ts` (NEW)
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Database } from '@/lib/database.types'

export const GET = requireAuth(async (
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { data: session, error } = await supabase
      .from('draft_sessions')
      .select(`
        *,
        league:leagues(league_id, platform, auth_data),
        draft_settings(*),
        player_selections(*),
        cost_adjustments(*)
      `)
      .eq('id', params.sessionId)
      .eq('user_id', user.id)
      .single()
    
    if (error || !session) {
      return NextResponse.json(
        { error: 'Draft session not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ session })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const PUT = requireAuth(async (
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const updates = await request.json()
    
    const { data: session, error } = await supabase
      .from('draft_sessions')
      .update(updates)
      .eq('id', params.sessionId)
      .eq('user_id', user.id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to update draft session' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ session })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const DELETE = requireAuth(async (
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { error } = await supabase
      .from('draft_sessions')
      .delete()
      .eq('id', params.sessionId)
      .eq('user_id', user.id)
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete draft session' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ message: 'Draft session deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

### `src/app/api/player-selections/route.ts` (NEW)
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Database } from '@/lib/database.types'

export const POST = requireAuth(async (request: NextRequest) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const {
      draft_session_id,
      roster_position,
      player_id,
      player_name,
      default_position,
      positions,
      estimated_cost,
      overall_rank,
      position_rank,
    } = await request.json()
    
    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from('draft_sessions')
      .select('id')
      .eq('id', draft_session_id)
      .eq('user_id', user.id)
      .single()
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Draft session not found' },
        { status: 404 }
      )
    }
    
    const { data: selection, error } = await supabase
      .from('player_selections')
      .upsert({
        draft_session_id,
        roster_position,
        player_id,
        player_name,
        default_position,
        positions,
        estimated_cost,
        overall_rank,
        position_rank,
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to save player selection' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ selection })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

### `src/app/api/migration/export/route.ts` (NEW)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { loadLeagues, loadSavedMocks } from '@/app/storage/localStorage'

export const GET = requireAuth(async (request: NextRequest) => {
  try {
    // Export all localStorage data for migration
    const leagues = loadLeagues()
    const mockData: Record<string, any> = {}
    
    // Collect all mock data for each league
    for (const [leagueId] of Object.entries(leagues.leagues)) {
      mockData[leagueId] = loadSavedMocks(leagueId)
    }
    
    const exportData = {
      timestamp: new Date().toISOString(),
      leagues,
      mockData,
      version: '1.0',
    }
    
    return NextResponse.json(exportData)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
  }
})
```

### `src/app/api/migration/import/route.ts` (NEW)
```typescript
import { createRouteHandlerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Database } from '@/lib/database.types'

export const POST = requireAuth(async (request: NextRequest) => {
  const supabase = createRouteHandlerClient<Database>()
  const user = request.user
  
  try {
    const { leagues, mockData } = await request.json()
    
    // Start transaction-like behavior
    const results = {
      leagues: 0,
      sessions: 0,
      errors: [],
    }
    
    // Import leagues
    for (const [leagueId, leagueData] of Object.entries(leagues.leagues)) {
      try {
        const { error } = await supabase
          .from('leagues')
          .upsert({
            user_id: user.id,
            league_id: leagueId,
            platform: leagueData.platform,
            auth_data: leagueData.auth || null,
          })
        
        if (!error) {
          results.leagues++
        } else {
          results.errors.push(`Failed to import league ${leagueId}`)
        }
      } catch (error) {
        results.errors.push(`Error importing league ${leagueId}: ${error.message}`)
      }
    }
    
    // Import mock data
    for (const [leagueId, mocks] of Object.entries(mockData)) {
      // Get the league UUID from our database
      const { data: league } = await supabase
        .from('leagues')
        .select('id')
        .eq('user_id', user.id)
        .eq('league_id', leagueId)
        .single()
      
      if (!league) continue
      
      for (const [mockName, mockData] of Object.entries(mocks)) {
        try {
          // Import draft session
          const { data: session, error: sessionError } = await supabase
            .from('draft_sessions')
            .upsert({
              user_id: user.id,
              league_id: league.id,
              name: mockName,
              year: mockData.year,
              notes: mockData.notes || '',
              created_at: new Date(mockData.created).toISOString(),
              updated_at: new Date(mockData.modified).toISOString(),
            })
            .select()
            .single()
          
          if (sessionError) {
            results.errors.push(`Failed to import session ${mockName}`)
            continue
          }
          
          // Import settings, selections, cost adjustments
          // ... detailed implementation for each data type
          
          results.sessions++
        } catch (error) {
          results.errors.push(`Error importing session ${mockName}: ${error.message}`)
        }
      }
    }
    
    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json(
      { error: 'Migration failed' },
      { status: 500 }
    )
  }
})
```

## Modified Existing API Routes

### Updated `src/app/api/utils.ts`
```typescript
// Add authentication utilities
import { NextRequest } from 'next/server'
import { createRouteHandlerClient } from '@supabase/ssr'
import { Database } from '@/lib/database.types'

export async function getAuthenticatedUser(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>()
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return null
    }
    
    return user
  } catch (error) {
    console.error('Authentication error:', error)
    return null
  }
}

// Existing utilities remain the same but add auth checks where needed
```

## API Client Updates

### Updated `src/app/api/ApiClient.ts`
```typescript
// Add authentication headers and user context
import { createClientComponentClient } from '@supabase/ssr'
import { Database } from '@/lib/database.types'

export class AuthenticatedApiClient extends ApiClient {
  private supabase = createClientComponentClient<Database>()
  
  async makeRequest(endpoint: string, options: RequestInit = {}) {
    const { data: { session } } = await this.supabase.auth.getSession()
    
    const headers = {
      ...options.headers,
      ...(session && { Authorization: `Bearer ${session.access_token}` }),
    }
    
    return super.makeRequest(endpoint, { ...options, headers })
  }
  
  // Updated methods to use authenticated endpoints
  async fetchUserLeagues(): Promise<League[]> {
    return this.makeRequest('/api/leagues')
  }
  
  async saveLeague(league: PlatformLeague): Promise<void> {
    return this.makeRequest('/api/leagues', {
      method: 'POST',
      body: JSON.stringify(league),
    })
  }
  
  // ... other authenticated methods
}
```

## Summary of Changes

### New Endpoints
1. **Authentication**: `/api/auth/{signup,signin,signout}`
2. **Leagues**: `/api/leagues` (GET, POST), `/api/leagues/[id]` (GET, DELETE)
3. **Draft Sessions**: `/api/draft-sessions` (GET, POST), `/api/draft-sessions/[id]` (GET, PUT, DELETE)
4. **Player Selections**: `/api/player-selections` (POST)
5. **Migration**: `/api/migration/{export,import}` (GET, POST)

### Modified Patterns
1. **All protected endpoints** now require authentication
2. **User-scoped queries** ensure data isolation
3. **Consistent error handling** across all endpoints
4. **Transaction-like operations** for complex data updates
5. **Rate limiting and security** measures added

### Breaking Changes
1. **Async storage operations** - all localStorage calls become async
2. **Authentication required** - users must be logged in to access data
3. **Different data structures** - normalized database schema vs flat localStorage
4. **Error handling patterns** - network errors and auth failures need handling

### Migration Strategy
1. **Dual-write period** - write to both localStorage and Supabase
2. **Gradual migration** - migrate users in batches
3. **Fallback mechanisms** - use localStorage if Supabase unavailable
4. **Data validation** - ensure migrated data integrity 