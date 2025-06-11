# Draft Builder - Development Environment Setup

## Overview

This guide will help developers set up a complete local development environment for the Draft Builder fantasy football auction draft application. The setup includes Node.js configuration, Redis caching, environment variables, and testing framework initialization.

## Prerequisites

### Required Software

1. **Node.js** (Version 18.18.0, 20.x, or 22.x)
   ```bash
   # Check your current Node.js version
   node --version
   
   # Install via nvm (recommended)
   nvm install 20
   nvm use 20
   ```

2. **Redis Server** (For caching functionality)
   ```bash
   # macOS (using Homebrew)
   brew install redis
   brew services start redis
   
   # Ubuntu/Debian
   sudo apt update
   sudo apt install redis-server
   sudo systemctl start redis-server
   
   # Windows (using WSL or Docker)
   docker run -d -p 6379:6379 redis:alpine
   ```

3. **Git** (For version control)
   ```bash
   git --version
   # Should show Git version 2.x or higher
   ```

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd draft-builder
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# Verify installation
npm list --depth=0
```

**Key Dependencies Installed**:
- **Next.js 15.3.3**: React framework with App Router
- **React 19.1.0**: UI library with latest features
- **TypeScript 5.x**: Type safety and development experience
- **TailwindCSS 3.4.1**: Utility-first CSS framework
- **ioredis 5.4.1**: Redis client for caching
- **axios 1.3.1**: HTTP client for API requests
- **googleapis 142.0.0**: Google Sheets API integration
- **jest**: Testing framework with React Testing Library

### 3. Environment Configuration

Create environment files in the project root:

#### `.env.local` (Primary development configuration)

```bash
# Redis Configuration
KV_URL=redis://localhost:6379

# Google Sheets API
GOOGLE_API_KEY=your_google_api_key_here

# Development Mode
NODE_ENV=development

# Next.js Configuration
NEXT_PUBLIC_VERCEL_URL=http://localhost:3000
```

#### `.env.example` (Template for new developers)

```bash
# Copy this file to .env.local and fill in the actual values

# Redis Configuration (Local Redis instance)
KV_URL=redis://localhost:6379

# Google Sheets API Key (Required for rankings data)
# Get from: https://console.cloud.google.com/apis/credentials
GOOGLE_API_KEY=your_google_api_key_here

# Development Environment
NODE_ENV=development

# Local Development URL
NEXT_PUBLIC_VERCEL_URL=http://localhost:3000
```

## API Key Setup

### Google Sheets API Configuration

1. **Enable Google Sheets API**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API" and enable it

2. **Create API Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key
   - Add to your `.env.local` file as `GOOGLE_API_KEY`

3. **API Key Restrictions** (Recommended):
   - Edit the API key in Google Cloud Console
   - Add application restrictions (HTTP referrers for web apps)
   - Restrict to only Google Sheets API

### ESPN/Sleeper Platform Access

**ESPN Fantasy**: No API key required. Uses public and cookie-based authentication.

**Sleeper**: No API key required. Uses public API endpoints.

## Redis Configuration

### Local Redis Setup

#### Option 1: Local Redis Installation

```bash
# Start Redis server
redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG

# Check Redis is accessible on default port
redis-cli -h localhost -p 6379 ping
```

#### Option 2: Docker Redis

```bash
# Run Redis in Docker container
docker run -d \
  --name draft-builder-redis \
  -p 6379:6379 \
  redis:alpine

# Test connection
docker exec -it draft-builder-redis redis-cli ping
```

### Redis Configuration Testing

```bash
# Test Redis integration in the app
npm run dev

# In another terminal, check Redis connections
redis-cli monitor
# Should show connections when app starts
```

## Development Scripts

### Available Commands

```bash
# Start development server with debugging
npm run dev
# Starts Next.js on http://localhost:3000 with Node.js inspector

# Build production version
npm run build
# Creates optimized production build

# Start production server
npm run start
# Serves production build (requires npm run build first)

# Run linting
npm run lint
# ESLint check for code quality

# Run tests
npm run test
# Jest test suite execution

# Type checking
npm run type-check
# TypeScript compilation check without building
```

### Development Server Features

When running `npm run dev`:
- **Hot Reload**: Automatic page refresh on file changes
- **Fast Refresh**: React component state preservation during updates
- **TypeScript Compilation**: Real-time type checking
- **API Route Development**: Server-side API testing
- **Node.js Inspector**: Debugging capability on port 9229

## Testing Framework Setup

### Jest Configuration

The project uses Jest with React Testing Library for comprehensive testing:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- AuctionBudgetPlanner.test.tsx
```

### Testing Setup Files

- **`jest.config.ts`**: Main Jest configuration with TypeScript support
- **`jest.setup.ts`**: Global test setup and React Testing Library configuration
- **Testing utilities in `src/ui/tests/`**: Shared testing components and utilities

### Writing Tests

Example test structure:

```typescript
// Component test example
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockDraft from './MockDraft';

test('renders auction budget planning interface', () => {
  render(<MockDraft leagueId="123" googleApiKey="test-key" />);
  expect(screen.getByText(/budget planning/i)).toBeInTheDocument();
});
```

## Development Workflow

### 1. Starting Development

```bash
# Terminal 1: Start Redis (if not running as service)
redis-server

# Terminal 2: Start development server
npm run dev

# Terminal 3: Run tests in watch mode (optional)
npm test -- --watch
```

### 2. Code Quality Checks

```bash
# Before committing, run quality checks
npm run lint          # Check for linting errors
npm run type-check    # Verify TypeScript compilation
npm test              # Run test suite
npm run build         # Verify production build
```

### 3. Database/Cache Management

```bash
# Clear Redis cache during development
redis-cli flushall

# Monitor Redis operations
redis-cli monitor

# Check specific cache keys
redis-cli keys "*league*"
redis-cli get "league:espn:123456"
```

## Common Development Issues

### Port Conflicts

```bash
# If port 3000 is in use
npx kill-port 3000

# Or start on different port
npm run dev -- -p 3001
```

### Redis Connection Issues

```bash
# Check if Redis is running
ps aux | grep redis

# Test Redis connectivity
redis-cli ping

# Check Redis logs
tail -f /usr/local/var/log/redis.log  # macOS
journalctl -u redis                   # Linux
```

### Environment Variable Problems

```bash
# Verify environment variables are loaded
npm run dev
# Check browser console or terminal for missing variable warnings

# Debug environment loading
console.log(process.env.GOOGLE_API_KEY); // In API routes
console.log(process.env.NEXT_PUBLIC_VERCEL_URL); // In client components
```

### TypeScript Compilation Errors

```bash
# Clear Next.js cache
rm -rf .next

# Clear TypeScript build info
rm tsconfig.tsbuildinfo

# Restart development server
npm run dev
```

## IDE Configuration

### VS Code Setup (Recommended)

Create `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  }
}
```

Recommended VS Code extensions:
- **ES7+ React/Redux/React-Native snippets**
- **TypeScript Importer**
- **Tailwind CSS IntelliSense**
- **Jest Runner**
- **Redis**

### Cursor IDE Configuration

The project includes Cursor-specific configurations in `cursor-instructions.md` (created in Phase 4).

## Production Environment Simulation

### Local Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Environment Differences

| Feature | Development | Production |
|---------|------------|------------|
| Redis TLS | Disabled | Enabled |
| Hot Reload | Enabled | Disabled |
| Source Maps | Enabled | Disabled |
| API Debug Logs | Verbose | Minimal |
| Cache TTL | Shorter | Standard |

## Troubleshooting

### Common Issues and Solutions

1. **"Redis connection failed"**
   - Verify Redis is running: `redis-cli ping`
   - Check `KV_URL` in `.env.local`
   - Ensure Redis is accessible on specified port

2. **"Google Sheets API quota exceeded"**
   - Check API usage in Google Cloud Console
   - Verify API key restrictions
   - Consider implementing additional caching

3. **"Module not found" errors**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Check TypeScript path mappings in `tsconfig.json`
   - Verify import statements use correct relative paths

4. **"ESPN authentication failed"**
   - ESPN uses cookie-based auth for private leagues
   - Public leagues should work without authentication
   - Check browser developer tools for cookie issues

5. **Tests failing unexpectedly**
   - Clear Jest cache: `npx jest --clearCache`
   - Update snapshots: `npm test -- --updateSnapshot`
   - Check for async test issues with proper `await` usage

### Debug Mode

Enable additional debugging:

```bash
# Start with debug logging
DEBUG=* npm run dev

# Next.js specific debugging
NODE_OPTIONS='--inspect' npm run dev
# Then connect Chrome DevTools to Node.js process
```

## Next Steps

After completing this setup:

1. **Verify functionality**: Test league login with ESPN or Sleeper
2. **Run test suite**: Ensure all tests pass in your environment
3. **Explore codebase**: Review the architecture documentation
4. **Set up IDE**: Configure your preferred development environment
5. **Review deployment**: Understand Vercel deployment process

This development setup provides a complete local environment that mirrors the production system while maintaining developer productivity and debugging capabilities. 