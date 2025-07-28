import { NextResponse } from 'next/server';
import { AppHealthMonitor, AppAlertSystem } from '@/lib/monitoring';

export async function GET() {
  try {
    // Generate application-focused monitoring report
    const health = await AppHealthMonitor.performHealthCheck();
    const alertStats = AppAlertSystem.getAlertStats();
    
    const report = {
      timestamp: new Date(),
      application_health: health,
      alert_system: alertStats,
      note: 'Use Supabase Dashboard for database performance metrics'
    };
    
    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('[MONITORING_API_ERROR]', error);
    
    return NextResponse.json(
      {
        error: 'Failed to generate monitoring report',
        timestamp: new Date(),
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST endpoint to start/stop application monitoring
export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    
    if (action === 'start') {
      // Start application health monitoring
      const cleanup = AppHealthMonitor.startApplicationMonitoring();
      
      // Store cleanup function reference (in production, you'd use a proper state management)
      // For now, just acknowledge the start
      
      return NextResponse.json({
        message: 'Real-time monitoring started',
        timestamp: new Date()
      });
    } else if (action === 'stop') {
      // Stop monitoring (would need state management to actually stop)
      return NextResponse.json({
        message: 'Real-time monitoring stop requested',
        timestamp: new Date()
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "start" or "stop"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[MONITORING_CONTROL_ERROR]', error);
    
    return NextResponse.json(
      {
        error: 'Failed to control monitoring',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}