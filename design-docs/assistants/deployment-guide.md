# Deployment and Operations Guide for Draft Builder

## Overview

This guide covers deployment, monitoring, and operational procedures for the Draft Builder fantasy sports application. The application is deployed on Vercel with Redis caching and integrates with external APIs for ESPN and Sleeper fantasy platforms.

## Deployment Architecture

### Technology Stack
- **Platform**: Vercel (Next.js optimized hosting)
- **Framework**: Next.js 15.3.3 with App Router
- **Database**: Redis (via ioredis client)
- **CDN**: Vercel Edge Network
- **Analytics**: Vercel Analytics integration
- **Monitoring**: Built-in Vercel monitoring

### Environment Configuration

#### Production Environment Variables
```bash
# Required for production deployment
REDIS_URL=redis://your-redis-instance:6379
REDIS_PASSWORD=your-redis-password

# Optional Redis configuration
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_DB=0

# Analytics and monitoring
VERCEL_ANALYTICS_ID=your-analytics-id

# Platform API configurations (if needed)
ESPN_API_KEY=your-espn-key
SLEEPER_API_BASE=https://api.sleeper.app/v1
```

#### Development Environment Setup
```bash
# Copy environment template
cp .env.example .env.local

# Install dependencies
npm install

# Start Redis locally (using Docker)
docker run -d -p 6379:6379 redis:alpine

# Start development server
npm run dev
```

## Vercel Deployment Configuration

### Project Configuration (`vercel.json`)
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 30
    }
  },
  "env": {
    "REDIS_URL": "@redis-url",
    "REDIS_PASSWORD": "@redis-password"
  }
}
```

### Next.js Configuration (`next.config.mjs`)
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  
  // Image optimization
  images: {
    domains: ['sleepercdn.com', 'a.espncdn.com'],
    formats: ['image/avif', 'image/webp'],
  },
  
  // Experimental features
  experimental: {
    serverComponentsExternalPackages: ['ioredis'],
  },
  
  // Environment variables for client-side
  env: {
    VERCEL_URL: process.env.VERCEL_URL,
  }
};

export default nextConfig;
```

## Deployment Process

### Automatic Deployment (Recommended)

1. **GitHub Integration**: Connect repository to Vercel
2. **Branch Configuration**:
   - `main` branch → Production deployment
   - `develop` branch → Preview deployment
   - Feature branches → Preview deployments

3. **Deployment Triggers**:
   - Push to `main` triggers production build
   - Pull requests create preview deployments
   - Manual deployments via Vercel CLI

### Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Set environment variables
vercel env add REDIS_URL production
vercel env add REDIS_PASSWORD production
```

### Build Process

#### Automated Build Pipeline
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

#### Build Optimization
```bash
# Production build with optimizations
npm run build

# Analyze bundle size
npm run analyze

# Type checking before build
npm run type-check
```

## Redis Configuration and Management

### Redis Setup Options

#### Option 1: Vercel KV (Recommended)
```bash
# Create Vercel KV database
vercel kv create draft-builder-cache

# Automatically sets environment variables:
# KV_REST_API_URL
# KV_REST_API_TOKEN
```

#### Option 2: External Redis Provider
```bash
# Popular Redis providers:
# - Redis Cloud
# - AWS ElastiCache
# - DigitalOcean Managed Redis
# - Railway Redis

# Connection configuration
REDIS_URL=redis://username:password@host:port/database
```

### Redis Client Configuration
```typescript
// src/redis/redis.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!, {
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  family: 6,
  commandTimeout: 5000,
});

redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

export default redis;
```

### Caching Strategy
```typescript
// Cache patterns used in the application
const CACHE_KEYS = {
  PLAYER_RANKINGS: (year: string) => `rankings:${year}`,
  LEAGUE_DATA: (leagueId: string) => `league:${leagueId}`,
  DRAFT_DATA: (draftId: string) => `draft:${draftId}`,
};

const CACHE_TTL = {
  PLAYER_RANKINGS: 24 * 60 * 60, // 24 hours
  LEAGUE_DATA: 60 * 60,          // 1 hour
  DRAFT_DATA: 10 * 60,           // 10 minutes
};
```

## Monitoring and Analytics

### Vercel Analytics Integration
```typescript
// src/app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### Performance Monitoring
```typescript
// Custom performance monitoring
export function trackApiCall(endpoint: string, duration: number) {
  if (process.env.NODE_ENV === 'production') {
    // Send to analytics service
    console.log(`API Call: ${endpoint} took ${duration}ms`);
  }
}

// Usage in API routes
const start = Date.now();
const result = await apiCall();
trackApiCall('/api/fetch-league', Date.now() - start);
```

### Error Tracking
```typescript
// Error logging utility
export function logError(error: Error, context: string) {
  console.error(`Error in ${context}:`, {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : 'server',
  });
  
  // In production, send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry, LogRocket, etc.
  }
}
```

## Environment Management

### Environment Structure
```
Environments:
├── Development (local)     → npm run dev
├── Preview (Vercel)        → Feature branch deployments
├── Staging (Vercel)        → develop branch
└── Production (Vercel)     → main branch
```

### Environment Variables Management
```bash
# List environment variables
vercel env ls

# Add environment variable
vercel env add VARIABLE_NAME

# Remove environment variable
vercel env rm VARIABLE_NAME

# Pull environment variables locally
vercel env pull .env.local
```

### Secrets Management
```bash
# Store sensitive data as Vercel secrets
vercel secrets add redis-password your-redis-password
vercel secrets add api-key your-api-key

# Reference in environment variables
vercel env add REDIS_PASSWORD @redis-password production
```

## Database Operations

### Redis Maintenance

#### Data Migration Scripts
```typescript
// scripts/migrate-redis-data.ts
import redis from '../src/redis/redis';

async function migrateData() {
  const keys = await redis.keys('old-pattern:*');
  
  for (const key of keys) {
    const data = await redis.get(key);
    const newKey = key.replace('old-pattern:', 'new-pattern:');
    await redis.set(newKey, data);
    await redis.del(key);
  }
  
  console.log(`Migrated ${keys.length} keys`);
}
```

#### Backup and Restore
```bash
# Redis backup (if using managed service)
redis-cli --rdb backup.rdb

# Restore from backup
redis-cli --pipe < backup.rdb

# For cloud providers, use their backup tools
```

### Cache Management
```typescript
// Cache invalidation utilities
export async function invalidateCache(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  console.log(`Invalidated ${keys.length} cache entries`);
}

// Warm cache after deployment
export async function warmCache() {
  // Pre-load frequently accessed data
  await fetchAndCacheRankings('2024');
  await fetchAndCacheCommonLeagues();
}
```

## Performance Optimization

### Bundle Analysis
```bash
# Analyze bundle size
npm run build
npx @next/bundle-analyzer

# Check for unused dependencies
npx depcheck

# Audit for vulnerabilities
npm audit
```

### Image Optimization
```typescript
// next.config.mjs
{
  images: {
    domains: ['sleepercdn.com', 'a.espncdn.com'],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 1 week
  }
}
```

### API Route Optimization
```typescript
// Implement caching headers
export async function GET(request: Request) {
  const data = await fetchData();
  
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
```

## Security Configuration

### Environment Security
```bash
# Secure environment variables
VERCEL_TOKEN=         # Keep secret, rotate regularly
REDIS_PASSWORD=       # Use strong password
API_KEYS=            # Rotate when possible
```

### API Security
```typescript
// Rate limiting (example implementation)
const rateLimiter = new Map();

export function rateLimit(ip: string, limit: number = 100) {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window
  
  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, []);
  }
  
  const requests = rateLimiter.get(ip).filter(time => time > windowStart);
  
  if (requests.length >= limit) {
    return false; // Rate limited
  }
  
  requests.push(now);
  rateLimiter.set(ip, requests);
  return true;
}
```

### Content Security Policy
```typescript
// next.config.mjs
{
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
          }
        ]
      }
    ];
  }
}
```

## Troubleshooting and Debugging

### Common Issues

#### Redis Connection Issues
```bash
# Check Redis connectivity
redis-cli ping

# Monitor Redis connections
redis-cli monitor

# Check Redis memory usage
redis-cli info memory
```

#### Build Failures
```bash
# Clear Next.js cache
rm -rf .next

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Performance Issues
```bash
# Profile build performance
npm run build -- --profile

# Analyze bundle
npm run analyze

# Check for memory leaks
npm run dev -- --max-old-space-size=4096
```

### Debugging Tools

#### Production Debugging
```typescript
// Debug logging (production-safe)
function debugLog(message: string, data?: any) {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
    console.log(`[DEBUG] ${message}`, data);
  }
}
```

#### API Debugging
```typescript
// API request logging
export function logApiRequest(endpoint: string, params: any, duration: number) {
  console.log('API Request:', {
    endpoint,
    params: JSON.stringify(params).substring(0, 200),
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
  });
}
```

## Backup and Recovery

### Automated Backups
```bash
# Schedule regular Redis backups
# (Using cloud provider's backup solution)

# Weekly database snapshots
# (Via cron job or cloud scheduler)
```

### Disaster Recovery Plan
1. **Redis Failure**: Switch to backup Redis instance
2. **Vercel Outage**: Deploy to alternative platform (AWS, etc.)
3. **Data Loss**: Restore from latest backup
4. **API Failures**: Fallback to cached data

### Recovery Scripts
```typescript
// Emergency cache warming
export async function emergencyRestore() {
  try {
    // Restore critical cache data
    await warmCache();
    console.log('Emergency restore completed');
  } catch (error) {
    console.error('Emergency restore failed:', error);
  }
}
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Weekly
- [ ] Review Vercel deployment logs
- [ ] Check Redis memory usage
- [ ] Review error rates and performance metrics
- [ ] Update dependencies (patch versions)

#### Monthly
- [ ] Analyze bundle size and performance
- [ ] Review and rotate API keys
- [ ] Update documentation
- [ ] Dependency security audit

#### Quarterly
- [ ] Major dependency updates
- [ ] Performance optimization review
- [ ] Security audit
- [ ] Backup and recovery testing

### Deployment Checklist

#### Pre-deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Environment variables configured
- [ ] Database migrations ready (if any)
- [ ] Performance impact assessed

#### Post-deployment
- [ ] Verify deployment health
- [ ] Check error rates
- [ ] Validate critical user flows
- [ ] Monitor performance metrics
- [ ] Update deployment documentation 