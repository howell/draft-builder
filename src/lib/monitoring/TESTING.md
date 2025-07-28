# Monitoring System Testing

This document outlines the automated testing strategy for the simplified monitoring system.

## Test Coverage

### ✅ **Automated Tests Available**

#### Core Alert System (`app-alerts.test.ts`)
- ✅ Security alert triggers (RLS violations)
- ✅ Business critical alerts (auth failures, user workflow issues)
- ✅ User experience alerts (slow operations, data save failures)
- ✅ Webhook alert delivery and failure handling
- ✅ Alert configuration validation
- ✅ Error handling and graceful degradation

#### Basic Monitoring Functionality (`basic-monitoring.test.ts`)
- ✅ Alert type and severity classification
- ✅ Action recommendation logic
- ✅ Multiple alert scenario processing
- ✅ Webhook availability detection
- ✅ Missing fetch API handling

#### Application Health Monitor (`app-health.test.ts`)
- ✅ Database connectivity checks
- ✅ Authentication system validation
- ✅ RLS policy effectiveness testing
- ✅ Critical user workflow validation
- ✅ Health status aggregation logic
- ✅ Continuous monitoring functionality

### 🚧 **Integration Tests** (Limited due to Supabase complexity)
- ✅ Basic end-to-end alert flow
- ⚠️ Real Supabase connection tests (requires live DB)
- ⚠️ API endpoint tests (path resolution issues in test environment)

## Running Tests

### Basic Monitoring Tests (Recommended)
```bash
npm run test:monitoring:basic
```
**Coverage**: Alert system, basic functionality, error handling  
**Runtime**: ~1 second  
**Reliability**: High (no external dependencies)

### All Monitoring Tests (Comprehensive)
```bash
npm run test:monitoring
```
**Coverage**: All monitoring code including integration tests  
**Runtime**: ~3-5 seconds  
**Reliability**: Medium (some integration complexity)

### Specific Test Suites
```bash
# Alert system only
npm test src/lib/monitoring/__tests__/app-alerts.test.ts

# Health monitor only  
npm test src/lib/monitoring/__tests__/app-health.test.ts

# Basic functionality only
npm test src/lib/monitoring/__tests__/basic-monitoring.test.ts
```

## Test Strategy

### 🎯 **Focus Areas**
1. **Business Logic**: Alert triggers, health assessment, error handling
2. **Security**: RLS policy validation, security alert mechanisms
3. **User Experience**: Slow operation detection, data save failure alerts
4. **Reliability**: Error handling, graceful degradation, webhook failures

### 🔧 **Testing Approach**
- **Unit Tests**: Core business logic and alert system
- **Mock Integration**: Simplified Supabase client mocking
- **Error Scenarios**: Network failures, system degradation, missing APIs
- **Edge Cases**: Missing fetch, undefined responses, timeout scenarios

### 📊 **Coverage Goals**
- **Alert System**: >95% (Critical for business operations)
- **Health Monitor**: >85% (Important for operational visibility)
- **Application Client**: >70% (Business logic focus)

## CI/CD Integration

### GitHub Actions (`.github/workflows/monitoring-tests.yml`)
- **Trigger**: Changes to monitoring code, API endpoints
- **Tests**: Basic monitoring test suite (fast, reliable)
- **Validation**: TypeScript, ESLint, test coverage

### Manual Testing Checklist

#### Health Check Endpoint
```bash
# Start development server
npm run dev

# Test health endpoint
curl http://localhost:3000/api/health

# Expected: JSON with overall status and detailed checks
```

#### Monitoring Dashboard
```bash
# Test monitoring endpoint
curl http://localhost:3000/api/monitoring

# Expected: Application health + alert system stats
```

#### Alert System Validation
```bash
# Check logs during development for:
# [APP_HEALTH_ALERT] - Health degradation alerts
# [USER_EXPERIENCE_ALERT] - UX issue alerts  
# [CRITICAL_ALERT] - Security violation alerts
```

## Production Monitoring Testing

### Health Check Validation
- ✅ RLS policies properly configured and blocking unauthorized access
- ✅ Authentication system operational
- ✅ Critical database tables accessible
- ✅ Application health endpoint responding correctly

### Alert System Validation
- ✅ Security alerts triggered for RLS violations
- ✅ Business critical alerts for authentication failures
- ✅ User experience alerts for slow operations
- ✅ Webhook delivery working (or graceful failure)

### Performance Validation
- ✅ Health checks complete within reasonable time (<2s)
- ✅ Monitoring overhead minimal
- ✅ Alert processing doesn't impact user experience

## Troubleshooting Test Issues

### Common Issues

#### "Cannot read properties of undefined (reading 'catch')"
**Cause**: Mock fetch not properly configured  
**Solution**: Ensure `global.fetch` is mocked in test setup

#### "Cannot find module '@/lib/monitoring'"
**Cause**: Path alias not resolved in test environment  
**Solution**: Use relative imports in test files

#### "Jest encountered an unexpected token"
**Cause**: ES modules from Supabase not transformed  
**Solution**: Use simplified mocks in `jest.setup.ts`

### Test Environment Setup
```typescript
// Required in jest.setup.ts for monitoring tests
global.fetch = jest.fn();
global.performance = { now: jest.fn() };
global.crypto = { randomUUID: jest.fn() };
```

## Best Practices

### Writing Monitoring Tests
1. **Mock External Dependencies**: Always mock Supabase, fetch, timers
2. **Test Business Logic**: Focus on alert conditions and health assessment
3. **Verify Error Handling**: Test failure scenarios and graceful degradation
4. **Use Consistent Mocks**: Ensure predictable test behavior

### Maintaining Tests
1. **Update with Changes**: Keep tests current with monitoring logic changes
2. **Monitor Coverage**: Aim for high coverage on critical alert paths
3. **Test Real Scenarios**: Validate against actual production issues
4. **Document Edge Cases**: Ensure unusual scenarios are covered

## Future Improvements

### Enhanced Integration Testing
- Real Supabase test database integration
- End-to-end API endpoint testing with test server
- Performance benchmarking under load

### Production Testing
- Synthetic monitoring of health endpoints
- Alert delivery validation in production
- Performance impact measurement

### Advanced Scenarios
- Network timeout simulation
- Database connection pool exhaustion
- High-frequency alert deduplication