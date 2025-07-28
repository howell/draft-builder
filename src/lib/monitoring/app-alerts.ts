export interface AppAlert {
  id: string;
  name: string;
  type: 'business_critical' | 'user_experience' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  actions: AlertAction[];
}

export interface AlertAction {
  type: 'log' | 'webhook';
  target: string;
}

/**
 * Application-focused alerting that complements Supabase dashboard monitoring.
 * Focuses on business logic, user experience, and security concerns.
 */
export class AppAlertSystem {
  private static alerts: AppAlert[] = [
    // Security alerts - critical for business
    {
      id: 'rls_security_violation',
      name: 'RLS Security Policy Failure',
      type: 'security',
      severity: 'critical',
      enabled: true,
      actions: [
        { type: 'log', target: 'console' },
        { type: 'webhook', target: '/api/alerts/security' }
      ]
    },
    {
      id: 'auth_system_failure',
      name: 'Authentication System Failure',
      type: 'business_critical',
      severity: 'high',
      enabled: true,
      actions: [
        { type: 'log', target: 'console' },
        { type: 'webhook', target: '/api/alerts/auth-failure' }
      ]
    },
    
    // User experience alerts
    {
      id: 'critical_user_path_failure',
      name: 'Critical User Workflow Broken',
      type: 'user_experience',
      severity: 'high',
      enabled: true,
      actions: [
        { type: 'log', target: 'console' },
        { type: 'webhook', target: '/api/alerts/user-experience' }
      ]
    },
    {
      id: 'app_health_degraded',
      name: 'Application Health Degraded',
      type: 'user_experience',
      severity: 'medium',
      enabled: true,
      actions: [
        { type: 'log', target: 'console' }
      ]
    },
    
    // Business logic alerts
    {
      id: 'user_signup_blocked',
      name: 'User Registration Blocked',
      type: 'business_critical',
      severity: 'high',
      enabled: true,
      actions: [
        { type: 'log', target: 'console' },
        { type: 'webhook', target: '/api/alerts/signup-blocked' }
      ]
    }
  ];
  
  /**
   * Trigger alerts based on application health status
   */
  static checkApplicationHealth(healthStatus: any) {
    // Security alerts
    if (healthStatus.checks?.rls?.status === 'degraded' || healthStatus.checks?.rls?.status === 'unhealthy') {
      this.triggerAlert('rls_security_violation', {
        rlsStatus: healthStatus.checks.rls,
        impact: 'Data security may be compromised',
        action_required: 'Review RLS policies immediately'
      });
    }
    
    // Authentication alerts
    if (healthStatus.checks?.authentication?.status === 'unhealthy') {
      this.triggerAlert('auth_system_failure', {
        authStatus: healthStatus.checks.authentication,
        impact: 'Users cannot sign in',
        action_required: 'Check Supabase auth configuration'
      });
    }
    
    // Critical user path alerts
    if (healthStatus.checks?.criticalPaths?.status === 'unhealthy') {
      this.triggerAlert('critical_user_path_failure', {
        pathStatus: healthStatus.checks.criticalPaths,
        impact: 'Core application features unavailable',
        action_required: 'Check database connectivity and table access'
      });
    }
    
    // Overall health degradation
    if (healthStatus.overall === 'degraded') {
      this.triggerAlert('app_health_degraded', {
        overallStatus: healthStatus.overall,
        affectedSystems: Object.entries(healthStatus.checks)
          .filter(([_, check]: [string, any]) => check.status !== 'healthy')
          .map(([name, _]) => name),
        impact: 'Some application features may be impacted'
      });
    }
  }
  
  /**
   * Alert on user experience issues (application-specific)
   */
  static alertUserExperienceIssue(issue: {
    type: 'slow_draft_creation' | 'failed_data_save' | 'auth_timeout';
    userId?: string;
    context: any;
  }) {
    console.warn('[USER_EXPERIENCE_ALERT]', {
      issue: issue.type,
      userId: issue.userId,
      context: issue.context,
      timestamp: new Date(),
      action_required: this.getActionForUXIssue(issue.type)
    });
    
    // In production, this could trigger user-specific assistance
    if (issue.userId) {
      this.executeAlert({
        type: 'webhook',
        target: `/api/alerts/user-assistance`
      }, {
        userId: issue.userId,
        issue: issue.type,
        context: issue.context
      });
    }
  }
  
  private static triggerAlert(alertId: string, data: any) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert || !alert.enabled) return;
    
    console.error(`[${alert.severity.toUpperCase()}_ALERT] ${alert.name}`, {
      type: alert.type,
      data,
      timestamp: new Date()
    });
    
    alert.actions.forEach(action => {
      this.executeAlert(action, { alert: alert.name, severity: alert.severity, ...data });
    });
  }
  
  private static executeAlert(action: AlertAction, data: any) {
    switch (action.type) {
      case 'log':
        // Already logged above, this is for structured logging
        break;
        
      case 'webhook':
        if (typeof fetch !== 'undefined') {
          const webhookPromise = fetch(action.target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timestamp: new Date(),
              ...data
            })
          });
          
          if (webhookPromise && typeof webhookPromise.catch === 'function') {
            webhookPromise.catch(error => {
              console.error('[WEBHOOK_ALERT_FAILED]', { target: action.target, error });
            });
          }
        }
        break;
    }
  }
  
  private static getActionForUXIssue(issueType: string): string {
    switch (issueType) {
      case 'slow_draft_creation':
        return 'Check database performance in Supabase dashboard';
      case 'failed_data_save':
        return 'Verify user authentication and RLS policies';
      case 'auth_timeout':
        return 'Check Supabase auth service status';
      default:
        return 'Investigate user experience issue';
    }
  }
  
  /**
   * Get alert statistics for monitoring dashboard
   */
  static getAlertStats() {
    return {
      totalAlerts: this.alerts.length,
      enabledAlerts: this.alerts.filter(a => a.enabled).length,
      alertsByType: {
        security: this.alerts.filter(a => a.type === 'security').length,
        business_critical: this.alerts.filter(a => a.type === 'business_critical').length,
        user_experience: this.alerts.filter(a => a.type === 'user_experience').length
      }
    };
  }
}