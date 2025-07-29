import { LeagueId } from '@/platforms/common';

/**
 * Categories of storage errors for handling different scenarios
 */
export type StorageErrorCode = 
  | 'NETWORK_ERROR'     // Network connectivity issues
  | 'AUTH_ERROR'        // Authentication/authorization failures
  | 'DATA_ERROR'        // Data validation or corruption issues
  | 'QUOTA_ERROR'       // Storage quota exceeded
  | 'PERMISSION_ERROR'  // Insufficient permissions
  | 'NOT_FOUND_ERROR'   // Requested resource not found
  | 'CONFLICT_ERROR'    // Data conflict (e.g., optimistic locking)
  | 'NOT_AVAILABLE_SSR' // Storage not available server-side
  | 'UNKNOWN_ERROR';    // Unexpected errors

/**
 * Additional context for storage errors
 */
export interface StorageErrorContext {
  /** The storage operation that failed */
  operation: string;
  /** League ID if applicable */
  leagueId?: LeagueId;
  /** Roster name if applicable */
  rosterName?: string;
  /** User ID if applicable */
  userId?: string;
  /** Timestamp when error occurred */
  timestamp: Date;
}

/**
 * Enhanced StorageError class with enumerable fields for richer logging
 */
export class StorageError extends Error {
  /** Error category for programmatic handling */
  public readonly code: StorageErrorCode;
  
  /** Original error from underlying storage system */
  public readonly originalError?: any;
  
  /** Additional context about the operation that failed */
  public readonly context: StorageErrorContext;

  constructor(
    code: StorageErrorCode,
    message: string,
    originalError?: any,
    context?: Partial<StorageErrorContext>
  ) {
    super(message);
    
    this.name = 'StorageError';
    this.code = code;
    this.originalError = originalError;
    this.context = {
      operation: 'unknown',
      timestamp: new Date(),
      ...context
    };

    // Ensure the error stack trace includes this class
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StorageError);
    }
  }

  /**
   * Returns a JSON representation of the error for logging
   */
  toJSON() {
    // Handle circular references in context by creating a safe copy
    const safeContext = this.safeCopyContext(this.context);
    
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: safeContext,
      originalError: this.originalError ? {
        message: this.originalError.message || String(this.originalError),
        name: this.originalError.name,
        stack: this.originalError.stack
      } : undefined,
      stack: this.stack
    };
  }

  /**
   * Creates a safe copy of context, handling circular references
   */
  private safeCopyContext(obj: any, seen = new WeakSet()): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (seen.has(obj)) {
      return '[Circular Reference]';
    }
    
    seen.add(obj);
    
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.safeCopyContext(item, seen));
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.safeCopyContext(value, seen);
    }
    
    return result;
  }

  /**
   * Returns a formatted string representation for logging
   */
  toString(): string {
    const contextInfo = Object.entries(this.context)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    
    return `${this.name}[${this.code}]: ${this.message}${contextInfo ? ` (${contextInfo})` : ''}`;
  }
}

/**
 * Type guard to check if an error is a StorageError
 */
export function isStorageError(error: any): error is StorageError {
  return error instanceof StorageError;
}

/**
 * Helper function to create a StorageError with proper typing
 */
export function createStorageError(
  code: StorageErrorCode,
  message: string,
  originalError?: any,
  context?: Partial<StorageErrorContext>
): StorageError {
  return new StorageError(code, message, originalError, context);
} 