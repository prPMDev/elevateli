/**
 * Smart Logger Utility
 * Structured logging with category-based filtering and performance tracking
 */

// DEBUG_CONFIG will be available from debug-config.js module
// No need to declare it here as it's already loaded

class SmartLogger {
  /**
   * Log a message with structured data
   * @param {string} category - Category in format "MAIN.SUB" (e.g., "AI.PROMPTS")
   * @param {string} action - Action being performed
   * @param {Object} data - Additional data to log
   */
  static log(category, action, data = {}) {
    if (!DEBUG_CONFIG.ENABLED) return;
    
    // Parse category
    const [mainCat, subCat] = category.split('.');
    
    // Check if this category is enabled
    if (!DEBUG_CONFIG[mainCat]?.[subCat]) return;
    
    // Build log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      category,
      action,
      ...this.sanitizeData(data)
    };
    
    // Use appropriate console method based on category
    const logMethod = this.getLogMethod(category);
    console[logMethod](`[${category}] ${action}`, logEntry);
  }
  
  /**
   * Log an error with context
   */
  static error(category, action, error, context = {}) {
    if (!DEBUG_CONFIG.ENABLED) return;
    
    const errorEntry = {
      timestamp: new Date().toISOString(),
      category,
      action,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context: this.sanitizeData(context)
    };
    
    console.error(`[${category}] ERROR: ${action}`, errorEntry);
  }
  
  /**
   * Time an operation and log the duration
   */
  static async time(category, action, asyncFn) {
    if (!DEBUG_CONFIG.ENABLED || !DEBUG_CONFIG.PERFORMANCE?.TIMING) return asyncFn();
    
    const start = performance.now();
    try {
      const result = await asyncFn();
      const duration = performance.now() - start;
      
      this.log('PERFORMANCE.TIMING', action, {
        category,
        duration: Math.round(duration * 100) / 100, // Round to 2 decimals
        durationMs: duration
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error('PERFORMANCE.TIMING', action, error, { duration });
      throw error;
    }
  }
  
  /**
   * Log a group of related operations
   */
  static group(title, fn) {
    if (!DEBUG_CONFIG.ENABLED) return fn();
    
    console.group(title);
    try {
      return fn();
    } finally {
      console.groupEnd();
    }
  }
  
  /**
   * Sanitize sensitive data before logging
   */
  static sanitizeData(data) {
    const sanitized = { ...data };
    
    // Sanitize API keys
    if (sanitized.apiKey) {
      sanitized.apiKey = sanitized.apiKey.substring(0, 4) + '...';
    }
    
    // Truncate long strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
        sanitized[key] = sanitized[key].substring(0, 1000) + '... (truncated)';
      }
    });
    
    // Limit array sizes
    Object.keys(sanitized).forEach(key => {
      if (Array.isArray(sanitized[key]) && sanitized[key].length > 10) {
        sanitized[key] = [
          ...sanitized[key].slice(0, 10),
          `... and ${sanitized[key].length - 10} more items`
        ];
      }
    });
    
    return sanitized;
  }
  
  /**
   * Determine appropriate console method based on category
   */
  static getLogMethod(category) {
    if (category.includes('ERROR')) return 'error';
    if (category.includes('WARN')) return 'warn';
    if (category.includes('PERFORMANCE')) return 'info';
    return 'log';
  }
  
  /**
   * Create a logger instance for a specific module
   */
  static createModuleLogger(moduleName) {
    return {
      log: (action, data) => SmartLogger.log(moduleName, action, data),
      error: (action, error, context) => SmartLogger.error(moduleName, action, error, context),
      time: (action, fn) => SmartLogger.time(moduleName, action, fn),
      group: (title, fn) => SmartLogger.group(`[${moduleName}] ${title}`, fn)
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartLogger;
} else {
  // For browser context
  window.SmartLogger = SmartLogger;
}