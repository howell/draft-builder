/**
 * Deep clone utility that prefers structuredClone when available,
 * falling back to JSON.parse(JSON.stringify()) for compatibility
 * with older environments (like JSDOM in tests).
 */

/**
 * Performs a deep clone of the given value
 * @param value - The value to clone
 * @returns A deep copy of the value
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      // structuredClone may fail for non-cloneable objects
      // Fall back to JSON method
    }
  }
  
  // Fallback for environments without structuredClone or when it fails
  return JSON.parse(JSON.stringify(value));
} 