/**
 * Logger Module for ElevateLI
 * Provides structured logging with storage and export capabilities
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const Logger = {
  // Configuration
  MAX_LOGS: 1000, // Maximum number of log entries to keep
  LOG_KEY: 'elevateli_logs',
  PERFORMANCE_KEY: 'elevateli_performance',
  
  // Log levels
  levels: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
  },
  
  // Current log level (can be configured)
  currentLevel: 'INFO',
  
  // Module-specific log levels
  moduleLevels: {},
  
  // Performance tracking
  performanceMetrics: {},
  performanceEnabled: true,
  
  /**
   * Initialize logger
   */
  init() {
    // Set log level from storage if available
    chrome.storage.local.get(['logLevel', 'moduleLevels', 'performanceEnabled'], (data) => {
      if (data.logLevel && this.levels[data.logLevel]) {
        this.currentLevel = data.logLevel;
      }
      if (data.moduleLevels) {
        this.moduleLevels = data.moduleLevels;
      }
      if (data.performanceEnabled !== undefined) {
        this.performanceEnabled = data.performanceEnabled;
      }
    });
    
    console.log('[Logger] Initialized with level:', this.currentLevel);
  },
  
  /**
   * Set log level for specific module
   * @param {string} module - Module name
   * @param {string} level - Log level
   */
  setModuleLevel(module, level) {
    if (this.levels[level]) {
      this.moduleLevels[module] = level;
      chrome.storage.local.set({ moduleLevels: this.moduleLevels });
    }
  },
  
  /**
   * Core logging function
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  async log(level, message, data = {}) {
    // Extract module from message if present
    const moduleMatch = message.match(/^\[([^\]]+)\]/);
    const module = moduleMatch ? moduleMatch[1] : 'General';
    
    // Check if we should log this level
    if (!this.shouldLog(level, module)) return;
    
    const entry = {
      timestamp: Date.now(),
      level,
      module,
      message,
      data,
      url: window.location.href,
      profileId: this.getProfileId()
    };
    
    // Log to console
    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](`[${level}] ${message}`, data);
    
    // Store in Chrome storage
    try {
      const stored = await chrome.storage.local.get(this.LOG_KEY);
      let logs = stored[this.LOG_KEY] || [];
      
      // Add new entry
      logs.push(entry);
      
      // Keep only recent logs
      if (logs.length > this.MAX_LOGS) {
        logs = logs.slice(-this.MAX_LOGS);
      }
      
      await chrome.storage.local.set({ [this.LOG_KEY]: logs });
    } catch (error) {
      console.error('[Logger] Failed to store log:', error);
    }
  },
  
  /**
   * Convenience methods for different log levels
   */
  debug(message, data) {
    return this.log(this.levels.DEBUG, message, data);
  },
  
  info(message, data) {
    return this.log(this.levels.INFO, message, data);
  },
  
  warn(message, data) {
    return this.log(this.levels.WARN, message, data);
  },
  
  error(message, data) {
    return this.log(this.levels.ERROR, message, data);
  },
  
  /**
   * Check if we should log at this level
   * @param {string} level - Log level to check
   * @param {string} module - Module name
   * @returns {boolean}
   */
  shouldLog(level, module = 'General') {
    const levelOrder = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    
    // Check module-specific level first
    const moduleLevel = this.moduleLevels[module] || this.currentLevel;
    const currentIndex = levelOrder.indexOf(moduleLevel);
    const checkIndex = levelOrder.indexOf(level);
    
    return checkIndex >= currentIndex;
  },
  
  /**
   * Start performance measurement
   * @param {string} operation - Operation name
   * @returns {string} Measurement ID
   */
  startPerformance(operation) {
    if (!this.performanceEnabled) return null;
    
    const id = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.performanceMetrics[id] = {
      operation,
      startTime: performance.now(),
      startMemory: performance.memory ? performance.memory.usedJSHeapSize : 0
    };
    
    return id;
  },
  
  /**
   * End performance measurement
   * @param {string} id - Measurement ID
   * @param {Object} metadata - Additional metadata
   */
  async endPerformance(id, metadata = {}) {
    if (!this.performanceEnabled || !id || !this.performanceMetrics[id]) return;
    
    const metric = this.performanceMetrics[id];
    const duration = performance.now() - metric.startTime;
    const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const memoryDelta = endMemory - metric.startMemory;
    
    const performanceData = {
      operation: metric.operation,
      duration: Math.round(duration * 100) / 100,
      memoryDelta: Math.round(memoryDelta / 1024),
      timestamp: Date.now(),
      ...metadata
    };
    
    // Log performance data
    this.debug(`[Performance] ${metric.operation} completed`, performanceData);
    
    // Store performance metrics
    try {
      const stored = await chrome.storage.local.get(this.PERFORMANCE_KEY);
      let metrics = stored[this.PERFORMANCE_KEY] || [];
      
      metrics.push(performanceData);
      
      // Keep only recent metrics (last 500)
      if (metrics.length > 500) {
        metrics = metrics.slice(-500);
      }
      
      await chrome.storage.local.set({ [this.PERFORMANCE_KEY]: metrics });
    } catch (error) {
      console.error('[Logger] Failed to store performance metric:', error);
    }
    
    // Clean up
    delete this.performanceMetrics[id];
    
    return performanceData;
  },
  
  /**
   * Get current profile ID from URL
   * @returns {string|null}
   */
  getProfileId() {
    const match = window.location.pathname.match(/\/in\/([^\/]+)/);
    return match ? match[1] : null;
  },
  
  /**
   * Export logs for debugging
   * @param {Object} options - Export options
   * @returns {Promise<Array>} Log entries
   */
  async export(options = {}) {
    const stored = await chrome.storage.local.get(this.LOG_KEY);
    let logs = stored[this.LOG_KEY] || [];
    
    // Filter by options
    if (options.level) {
      logs = logs.filter(log => log.level === options.level);
    }
    
    if (options.profileId) {
      logs = logs.filter(log => log.profileId === options.profileId);
    }
    
    if (options.since) {
      logs = logs.filter(log => log.timestamp >= options.since);
    }
    
    // Format for export
    return logs.map(log => ({
      ...log,
      time: new Date(log.timestamp).toISOString()
    }));
  },
  
  /**
   * Clear all logs
   */
  async clear() {
    await chrome.storage.local.remove(this.LOG_KEY);
    console.log('[Logger] All logs cleared');
  },
  
  /**
   * Get logs summary
   * @returns {Promise<Object>} Summary statistics
   */
  async getSummary() {
    const stored = await chrome.storage.local.get(this.LOG_KEY);
    const logs = stored[this.LOG_KEY] || [];
    
    const summary = {
      total: logs.length,
      byLevel: {},
      byModule: {},
      oldestEntry: null,
      newestEntry: null
    };
    
    // Count by level
    Object.values(this.levels).forEach(level => {
      summary.byLevel[level] = logs.filter(log => log.level === level).length;
    });
    
    // Count by module
    logs.forEach(log => {
      const module = log.module || 'General';
      summary.byModule[module] = (summary.byModule[module] || 0) + 1;
    });
    
    // Get time range
    if (logs.length > 0) {
      summary.oldestEntry = new Date(logs[0].timestamp).toISOString();
      summary.newestEntry = new Date(logs[logs.length - 1].timestamp).toISOString();
    }
    
    return summary;
  },
  
  /**
   * Get performance summary
   * @returns {Promise<Object>} Performance statistics
   */
  async getPerformanceSummary() {
    const stored = await chrome.storage.local.get(this.PERFORMANCE_KEY);
    const metrics = stored[this.PERFORMANCE_KEY] || [];
    
    if (metrics.length === 0) {
      return { message: 'No performance metrics available' };
    }
    
    // Group by operation
    const byOperation = {};
    metrics.forEach(metric => {
      if (!byOperation[metric.operation]) {
        byOperation[metric.operation] = {
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          minDuration: Infinity,
          maxDuration: 0
        };
      }
      
      const op = byOperation[metric.operation];
      op.count++;
      op.totalDuration += metric.duration;
      op.minDuration = Math.min(op.minDuration, metric.duration);
      op.maxDuration = Math.max(op.maxDuration, metric.duration);
    });
    
    // Calculate averages
    Object.values(byOperation).forEach(op => {
      op.avgDuration = Math.round(op.totalDuration / op.count * 100) / 100;
    });
    
    return {
      totalMetrics: metrics.length,
      operations: byOperation,
      timeRange: {
        start: new Date(metrics[0].timestamp).toISOString(),
        end: new Date(metrics[metrics.length - 1].timestamp).toISOString()
      }
    };
  }
};

// Initialize logger when module loads
if (typeof chrome !== 'undefined' && chrome.storage) {
  Logger.init();
}