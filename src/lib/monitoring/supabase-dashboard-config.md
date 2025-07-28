# Supabase Dashboard Monitoring Configuration

This document outlines the monitoring configuration for the Draft Builder Supabase instance.

## Dashboard Configuration Steps

### 1. Query Performance Insights
- **Location**: Supabase Dashboard → Database → Query Performance
- **Enable**: Turn on Query Performance Insights
- **Retention**: Set to 7 days minimum (30 days recommended)
- **Monitoring**: Track slow queries (>1000ms)

### 2. Database Activity Monitoring
- **Location**: Supabase Dashboard → Database → Activity
- **Real-time monitoring**: Enable real-time query monitoring
- **Connection tracking**: Monitor active connections
- **Resource usage**: Track CPU and memory usage

### 3. Real-time Connection Monitoring
- **Location**: Supabase Dashboard → Database → Realtime
- **Connection limits**: Set appropriate connection pool limits
- **Subscription monitoring**: Track real-time subscriptions
- **Message throughput**: Monitor message rates

### 4. RLS Policy Violation Tracking
- **Location**: Supabase Dashboard → Authentication → Users
- **Security logs**: Enable detailed auth logging
- **Failed attempts**: Monitor failed authentication attempts
- **Policy violations**: Track RLS policy failures

### 5. Storage Usage Alerts
- **Location**: Supabase Dashboard → Storage
- **Usage monitoring**: Track storage growth
- **File upload patterns**: Monitor upload frequencies
- **Access patterns**: Track file access patterns

## Application-Level Monitoring Integration

### Health Check Endpoint
```typescript
// src/app/api/health/route.ts
import { HealthCheck } from '@/lib/monitoring';

export async function GET() {
  const health = await HealthCheck.performHealthCheck();
  
  return Response.json(health, {
    status: health.overall === 'healthy' ? 200 : 503
  });
}
```

### Monitoring Dashboard Component
```typescript
// src/components/admin/MonitoringDashboard.tsx
import { MonitoringDashboard } from '@/lib/monitoring';

export default function AdminMonitoringDashboard() {
  // Component for admin monitoring interface
  // Displays real-time metrics and health status
}
```

## Alert Thresholds

### Performance Alerts
- **Slow Queries**: >1000ms (warning), >2000ms (critical)
- **Error Rate**: >5% (warning), >10% (critical)
- **Connection Pool**: >80% (warning), >95% (critical)

### Security Alerts
- **RLS Violations**: Any violation (immediate alert)
- **Failed Auth**: >10 attempts/minute from same IP
- **Suspicious Activity**: Pattern-based detection

### Resource Alerts
- **Database Size**: >80% of limit (warning)
- **Connection Count**: >80% of pool (warning)
- **Query Volume**: Unusual spikes (monitoring)

## Production Monitoring Checklist

- [ ] Supabase Dashboard monitoring enabled
- [ ] Application-level monitoring deployed
- [ ] Health check endpoint accessible
- [ ] Alert thresholds configured
- [ ] Real-time monitoring active
- [ ] Security monitoring in place
- [ ] Performance baselines established
- [ ] Escalation procedures documented

## Monitoring Queries for Reference

### Check RLS Policy Status
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';
```

### Monitor Query Performance
```sql
SELECT query, calls, total_time, mean_time, stddev_time, rows 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

### Check Index Usage
```sql
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE schemaname = 'public' 
ORDER BY n_distinct DESC;
```

## Troubleshooting Common Issues

### High Query Times
1. Check index usage with monitoring queries
2. Review query execution plans
3. Consider adding indexes for frequently queried columns
4. Optimize complex RLS policies

### RLS Policy Violations
1. Review policy definitions for accuracy
2. Check for missing user context in queries
3. Verify authentication state in application
4. Test policies with different user roles

### Connection Pool Exhaustion
1. Review connection usage patterns
2. Implement connection pooling in application
3. Consider upgrading Supabase plan
4. Optimize long-running queries

## Maintenance Schedule

### Daily
- Review health check status
- Monitor error rates and slow queries
- Check security alert logs

### Weekly
- Analyze query performance trends
- Review database growth patterns
- Update monitoring thresholds if needed

### Monthly
- Generate comprehensive monitoring report
- Review and optimize slow queries
- Plan for capacity scaling if needed