/**
 * SmartLogger stub for production
 * Maps SmartLogger calls to production Logger without exposing internals
 */

const SmartLogger = {
  /**
   * Log a message - production stub
   */
  log(category, action, data = {}) {
    // Production: no-op for regular logs
    // Only critical errors are logged via Logger.error()
  },
  
  /**
   * Log an error with context
   */
  error(category, action, error, context = {}) {
    // Production: delegate to Logger for critical errors only
    Logger.error(`[${category}] ${action}`, {
      message: error.message,
      ...context
    });
  },
  
  /**
   * Log a warning - production stub
   */
  warn(category, action, data = {}) {
    // Production: no-op
  },
  
  /**
   * Time a function execution - production stub
   */
  async time(category, action, asyncFn) {
    // Production: just execute without timing
    try {
      return await asyncFn();
    } catch (error) {
      this.error(category, `${action} failed`, error);
      throw error;
    }
  }
};