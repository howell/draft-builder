import { NextResponse } from 'next/server';
import { AppHealthMonitor } from '@/lib/monitoring';

export async function GET() {
  try {
    const health = await AppHealthMonitor.performHealthCheck();
    
    // Return appropriate HTTP status based on health
    const statusCode = health.overall === 'healthy' ? 200 : 
                      health.overall === 'degraded' ? 206 : 503;
    
    return NextResponse.json(health, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[HEALTH_CHECK_API_ERROR]', error);
    
    return NextResponse.json(
      {
        overall: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date(),
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    );
  }
}