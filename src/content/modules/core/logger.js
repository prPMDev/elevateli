/**
 * Logger Module for ElevateLI
 * Production version - minimal logging for critical errors only
 */

const Logger = {
  // Configuration
  levels: {
    ERROR: 'ERROR'
  },
  
  /**
   * Initialize logger (no-op in production)
   */
  init() {
    // Production: no initialization needed
  },
  
  /**
   * Core logging function - only logs critical errors in production
   */
  async log(level, message, data = {}) {
    // Production: only log critical errors
    if (level !== this.levels.ERROR) return;
    
    // Store critical errors for debugging if needed
    try {
      const entry = {
        timestamp: Date.now(),
        level,
        message,
        data,
        url: window.location.href
      };
      
      // Store in Chrome storage for error reporting
      const stored = await chrome.storage.local.get('elevateli_errors');
      let errors = stored.elevateli_errors || [];
      errors.push(entry);
      
      // Keep only last 50 errors
      if (errors.length > 50) {
        errors = errors.slice(-50);
      }
      
      await chrome.storage.local.set({ elevateli_errors: errors });
    } catch (e) {
      // Silently fail in production
    }
  },
  
  /**
   * Production stubs - no-op in production
   */
  debug() {},
  info() {},
  warn() {},
  
  /**
   * Error logging - critical errors only
   */
  error(message, data) {
    return this.log(this.levels.ERROR, message, data);
  },
  
  /**
   * Performance tracking - disabled in production
   */
  startPerformance() {
    return null;
  },
  
  endPerformance() {
    return null;
  },
  
  /**
   * Module level setting - no-op in production
   */
  setModuleLevel() {},
  
  /**
   * Export/clear functions - stripped for production
   */
  export() {
    return Promise.resolve([]);
  },
  
  clear() {
    return Promise.resolve();
  },
  
  getSummary() {
    return Promise.resolve({ total: 0 });
  },
  
  getPerformanceSummary() {
    return Promise.resolve({ message: 'Performance tracking disabled' });
  }
};

// Initialize logger
if (typeof chrome !== 'undefined' && chrome.storage) {
  Logger.init();
}