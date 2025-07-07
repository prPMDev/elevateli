/**
 * Logger Module for ElevateLI
 * Provides structured logging with storage and export capabilities
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const Logger = {
  // Configuration
  MAX_LOGS: 1000, // Maximum number of log entries to keep
  LOG_KEY: 'elevateli_logs',
  
  // Log levels
  levels: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
  },
  
  // Current log level (can be configured)
  currentLevel: 'INFO',
  
  /**
   * Initialize logger
   */
  init() {
    // Set log level from storage if available
    chrome.storage.local.get('logLevel', (data) => {
      if (data.logLevel && this.levels[data.logLevel]) {
        this.currentLevel = data.logLevel;
      }
    });
    
    console.log('[Logger] Initialized with level:', this.currentLevel);
  },
  
  /**
   * Core logging function
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  async log(level, message, data = {}) {
    // Check if we should log this level
    if (!this.shouldLog(level)) return;
    
    const entry = {
      timestamp: Date.now(),
      level,
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
   * @returns {boolean}
   */
  shouldLog(level) {
    const levelOrder = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentIndex = levelOrder.indexOf(this.currentLevel);
    const checkIndex = levelOrder.indexOf(level);
    return checkIndex >= currentIndex;
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
      oldestEntry: null,
      newestEntry: null
    };
    
    // Count by level
    Object.values(this.levels).forEach(level => {
      summary.byLevel[level] = logs.filter(log => log.level === level).length;
    });
    
    // Get time range
    if (logs.length > 0) {
      summary.oldestEntry = new Date(logs[0].timestamp).toISOString();
      summary.newestEntry = new Date(logs[logs.length - 1].timestamp).toISOString();
    }
    
    return summary;
  }
};

// Initialize logger when module loads
if (typeof chrome !== 'undefined' && chrome.storage) {
  Logger.init();
}/**
 * Cache Manager Module for ElevateLI
 * Handles content-based caching with no time expiration
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const CacheManager = {
  // Cache key prefixes
  AI_CACHE_PREFIX: 'aiCache_',
  COMPLETENESS_CACHE_PREFIX: 'completeness_',
  
  /**
   * Generate content hash including profile data and settings
   * @param {Object} profileData - Extracted profile data
   * @param {Object} settings - Analysis settings (targetRole, seniorityLevel, etc)
   * @returns {string} Content hash
   */
  generateHash(profileData, settings) {
    // Include all data points that affect analysis
    const dataPoints = [
      // Profile content
      profileData.photo ? 1 : 0,
      profileData.headline?.charCount || 0,
      profileData.about?.charCount || 0,
      profileData.experience?.count || 0,
      profileData.skills?.count || 0,
      profileData.education?.count || 0,
      profileData.recommendations?.count || 0,
      profileData.certifications?.count || 0,
      profileData.featured ? 1 : 0,
      profileData.projects?.count || 0,
      profileData.connections || 0,
      // Settings that affect analysis
      settings.targetRole || 'none',
      settings.seniorityLevel || 'none',
      settings.customInstructions ? 'custom' : 'default'
    ];
    
    return dataPoints.join('-');
  },
  
  /**
   * Check cache and return data if valid (content unchanged)
   * @param {string} profileId - LinkedIn profile ID
   * @param {Object} currentSettings - Current analysis settings
   * @returns {Object|null} Cached data or null
   */
  async checkAndReturn(profileId, currentSettings) {
    if (!profileId) {
      console.log('[CacheManager] No profile ID provided');
      return null;
    }
    
    const aiKey = `${this.AI_CACHE_PREFIX}${profileId}`;
    const completenessKey = `${this.COMPLETENESS_CACHE_PREFIX}${profileId}`;
    
    try {
      // Get both caches in parallel for performance
      const [aiCache, completenessCache] = await Promise.all([
        chrome.storage.local.get(aiKey),
        chrome.storage.local.get(completenessKey)
      ]);
      
      // Check if AI cache exists
      if (aiCache[aiKey]?.analysis) {
        console.log('[CacheManager] Found AI cache for profile:', profileId);
        
        // Return combined cache data
        return {
          // Spread AI analysis data
          ...aiCache[aiKey].analysis,
          // Add completeness data
          completenessData: completenessCache[completenessKey] || null,
          // Add metadata
          timestamp: aiCache[aiKey].timestamp,
          contentHash: aiCache[aiKey].contentHash,
          fromCache: true,
          cacheKey: aiKey
        };
      }
      
      // Check if only completeness cache exists (AI disabled scenario)
      if (completenessCache[completenessKey]) {
        console.log('[CacheManager] Found completeness-only cache for profile:', profileId);
        return {
          completenessData: completenessCache[completenessKey],
          completeness: completenessCache[completenessKey].score,
          timestamp: completenessCache[completenessKey].timestamp,
          fromCache: true,
          aiDisabled: true
        };
      }
      
      console.log('[CacheManager] No cache found for profile:', profileId);
      return null;
      
    } catch (error) {
      console.error('[CacheManager] Error checking cache:', error);
      return null;
    }
  },
  
  /**
   * Validate if cache is still valid based on content hash
   * @param {Object} cached - Cached data
   * @param {Object} profileData - Current profile data
   * @param {Object} settings - Current settings
   * @param {boolean} forceRefresh - Force bypass cache
   * @returns {boolean} True if cache is valid
   */
  isValid(cached, profileData, settings, forceRefresh = false) {
    if (forceRefresh) {
      console.log('[CacheManager] Force refresh requested, cache invalid');
      return false;
    }
    
    if (!cached || !cached.contentHash) {
      console.log('[CacheManager] No content hash in cache, invalid');
      return false;
    }
    
    const currentHash = this.generateHash(profileData, settings);
    const isValid = cached.contentHash === currentHash;
    
    console.log('[CacheManager] Cache validation:', {
      cachedHash: cached.contentHash,
      currentHash: currentHash,
      isValid: isValid
    });
    
    return isValid;
  },
  
  /**
   * Save analysis results to cache
   * @param {string} profileId - LinkedIn profile ID
   * @param {Object} analysis - AI analysis results
   * @param {Object} profileData - Profile data used for analysis
   * @param {Object} settings - Settings used for analysis
   */
  async save(profileId, analysis, profileData, settings) {
    if (!profileId) {
      console.error('[CacheManager] Cannot save cache without profile ID');
      return;
    }
    
    const aiKey = `${this.AI_CACHE_PREFIX}${profileId}`;
    const contentHash = this.generateHash(profileData, settings);
    const timestamp = Date.now();
    
    try {
      // Save AI analysis cache
      const cacheData = {
        [aiKey]: {
          timestamp: timestamp,
          contentHash: contentHash,
          analysis: analysis
        }
      };
      
      await chrome.storage.local.set(cacheData);
      console.log('[CacheManager] Saved cache for profile:', profileId, 'Hash:', contentHash);
      
      // Also update lastAnalyzed timestamp
      await chrome.storage.local.set({ lastAnalyzed: timestamp });
      
    } catch (error) {
      console.error('[CacheManager] Error saving cache:', error);
    }
  },
  
  /**
   * Save completeness-only cache (when AI is disabled)
   * @param {string} profileId - LinkedIn profile ID
   * @param {Object} completenessData - Completeness calculation results
   */
  async saveCompleteness(profileId, completenessData) {
    if (!profileId) return;
    
    const key = `${this.COMPLETENESS_CACHE_PREFIX}${profileId}`;
    const cacheData = {
      [key]: {
        ...completenessData,
        timestamp: Date.now()
      }
    };
    
    try {
      await chrome.storage.local.set(cacheData);
      console.log('[CacheManager] Saved completeness cache for profile:', profileId);
    } catch (error) {
      console.error('[CacheManager] Error saving completeness cache:', error);
    }
  },
  
  /**
   * Clear cache for a specific profile
   * @param {string} profileId - LinkedIn profile ID
   */
  async clear(profileId) {
    if (!profileId) return;
    
    const keys = [
      `${this.AI_CACHE_PREFIX}${profileId}`,
      `${this.COMPLETENESS_CACHE_PREFIX}${profileId}`
    ];
    
    try {
      await chrome.storage.local.remove(keys);
      console.log('[CacheManager] Cleared cache for profile:', profileId);
    } catch (error) {
      console.error('[CacheManager] Error clearing cache:', error);
    }
  },
  
  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  async getStats() {
    try {
      const storage = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(storage).filter(key => 
        key.startsWith(this.AI_CACHE_PREFIX) || 
        key.startsWith(this.COMPLETENESS_CACHE_PREFIX)
      );
      
      let totalSize = 0;
      let oldestTimestamp = Date.now();
      
      cacheKeys.forEach(key => {
        const item = storage[key];
        const size = JSON.stringify(item).length;
        totalSize += size;
        
        if (item.timestamp && item.timestamp < oldestTimestamp) {
          oldestTimestamp = item.timestamp;
        }
      });
      
      return {
        count: cacheKeys.length,
        sizeKB: Math.round(totalSize / 1024),
        oldestDate: new Date(oldestTimestamp)
      };
      
    } catch (error) {
      console.error('[CacheManager] Error getting stats:', error);
      return { count: 0, sizeKB: 0, oldestDate: null };
    }
  }
};/**
 * Overlay Manager Module for ElevateLI
 * Handles progressive UI states and smooth transitions
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const OverlayManager = {
  // UI States
  states: {
    INITIALIZING: 'initializing',
    CACHE_LOADED: 'cache_loaded',
    EXTRACTING: 'extracting',
    ANALYZING: 'analyzing',
    COMPLETE: 'complete',
    ERROR: 'error'
  },
  
  // Current state tracking
  currentState: null,
  overlayElement: null,
  
  /**
   * Initialize overlay and show immediately
   * @returns {OverlayManager} Self for chaining
   */
  async initialize() {
    console.log('[OverlayManager] Initializing overlay');
    this.setState(this.states.INITIALIZING);
    this.createAndInject();
    return this;
  },
  
  /**
   * Create overlay HTML with skeleton UI
   */
  createAndInject() {
    // Create wrapper for proper integration
    const wrapperHtml = `
      <div class="elevateli-overlay-wrapper artdeco-card pv-profile-card break-words mt4">
        <div id="elevateli-overlay" class="elevateli-overlay" data-state="${this.currentState}">
          <div class="overlay-header">
            <div class="header-left">
              <h3>ElevateLI Analysis</h3>
              <span class="timestamp-display"></span>
            </div>
            <div class="header-right">
              <button class="overlay-close" aria-label="Close overlay">&times;</button>
            </div>
          </div>
        
        <div class="scores-container">
          <div class="score-block completeness">
            <label>Profile Completeness</label>
            <div class="score-display">
              <span class="score-value skeleton">--</span>
              <span class="score-suffix">%</span>
            </div>
            <div class="score-bar">
              <div class="score-bar-fill skeleton" style="width: 0%"></div>
            </div>
          </div>
          
          <div class="score-block quality">
            <label>Content Quality (AI)</label>
            <div class="score-display">
              <span class="score-value skeleton">--</span>
              <span class="score-suffix">/10</span>
            </div>
            <div class="score-bar">
              <div class="score-bar-fill skeleton" style="width: 0%"></div>
            </div>
            <div class="ai-status"></div>
          </div>
        </div>
        
        <div class="status-indicator">
          <span class="status-icon"></span>
          <span class="status-text">Initializing...</span>
        </div>
        
        <div class="recommendations-section hidden">
          <h4>Top Recommendations</h4>
          <ul class="recommendations-list"></ul>
        </div>
        
        <div class="insights-section hidden">
          <h4>Key Insights</h4>
          <div class="insights-content"></div>
        </div>
        
        <div class="overlay-actions">
          <button class="action-button analyze-button hidden">
            <span class="button-icon">🚀</span>
            Analyze Profile
          </button>
          <button class="action-button refresh-button hidden">
            <span class="button-icon">🔄</span>
            Re-analyze
          </button>
          <button class="action-button details-button hidden">
            <span class="button-icon">📊</span>
            View Details
          </button>
        </div>
      </div>
      </div><!-- Close wrapper -->
    `;
    
    // Remove any existing overlay wrapper
    const existingWrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (existingWrapper) existingWrapper.remove();
    
    // Find the right place to inject - after the top card but before main content
    let injectionTarget = null;
    
    // Try to find the main content area
    const mainContent = document.querySelector('main[role="main"], .scaffold-layout__main');
    if (mainContent) {
      // Look for the top card section
      const topCard = mainContent.querySelector('.pv-top-card, .pv-profile-sticky-header-v2')?.parentElement;
      if (topCard) {
        injectionTarget = topCard;
      } else {
        // Fallback: Find first artdeco-card or section
        const firstCard = mainContent.querySelector('.artdeco-card, section');
        if (firstCard) {
          injectionTarget = firstCard.parentElement;
        }
      }
    }
    
    // If we still don't have a target, use the main content area
    if (!injectionTarget) {
      injectionTarget = mainContent || document.body;
    }
    
    // Inject the overlay wrapper after the target
    if (injectionTarget === document.body) {
      injectionTarget.insertAdjacentHTML('beforeend', wrapperHtml);
    } else {
      // Find the profile sections container
      const sectionsContainer = injectionTarget.closest('.pvs-list') || injectionTarget.parentElement;
      if (sectionsContainer) {
        // Insert after the top card, before other sections
        const topCardElement = sectionsContainer.querySelector('.pv-top-card')?.closest('.pvs-list__paged-list-item') || sectionsContainer.firstElementChild;
        if (topCardElement && topCardElement.nextSibling) {
          topCardElement.insertAdjacentHTML('afterend', wrapperHtml);
        } else {
          sectionsContainer.insertAdjacentHTML('afterbegin', wrapperHtml);
        }
      } else {
        injectionTarget.insertAdjacentHTML('afterend', wrapperHtml);
      }
    }
    
    this.overlayElement = document.getElementById('elevateli-overlay');
    
    // Attach event listeners
    this.attachEventListeners();
    
    console.log('[OverlayManager] Overlay injected into DOM');
  },
  
  /**
   * Attach event listeners to overlay elements
   */
  attachEventListeners() {
    // Close button
    const closeBtn = this.overlayElement.querySelector('.overlay-close');
    closeBtn?.addEventListener('click', () => this.close());
    
    // Analyze button (for first-time analysis)
    const analyzeBtn = this.overlayElement.querySelector('.analyze-button');
    analyzeBtn?.addEventListener('click', () => this.handleAnalyze());
    
    // Refresh button (for re-analysis)
    const refreshBtn = this.overlayElement.querySelector('.refresh-button');
    refreshBtn?.addEventListener('click', () => this.handleRefresh());
    
    // Details button
    const detailsBtn = this.overlayElement.querySelector('.details-button');
    detailsBtn?.addEventListener('click', () => this.handleViewDetails());
  },
  
  /**
   * Update overlay state and UI
   * @param {string} newState - New state from states enum
   * @param {Object} data - Data for the new state
   */
  setState(newState, data = {}) {
    console.log(`[OverlayManager] State change: ${this.currentState} → ${newState}`);
    this.currentState = newState;
    
    if (!this.overlayElement) return;
    
    this.overlayElement.setAttribute('data-state', newState);
    
    // State-specific updates
    const stateHandlers = {
      [this.states.INITIALIZING]: () => {
        this.updateStatus('Initializing analysis...', '⣾');
        this.showSkeletons();
        // Show analyze button for first-time analysis
        this.showActionButtons({ showAnalyze: true, showDetails: false });
      },
      
      [this.states.CACHE_LOADED]: () => {
        this.updateStatus('Loaded from cache', '✓');
        this.hideSkeletons();
        this.populateScores(data);
        this.showTimestamp(data.timestamp);
        this.showRecommendations(data.recommendations);
        // Show re-analyze button for cached results
        this.showActionButtons({ showRefresh: true });
      },
      
      [this.states.EXTRACTING]: () => {
        this.updateStatus('Reading profile sections...', '⣾');
        this.showProgressBar('extracting');
      },
      
      [this.states.ANALYZING]: () => {
        this.updateStatus('Running AI analysis...', '⣾');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        this.showProgressBar('analyzing');
      },
      
      [this.states.COMPLETE]: () => {
        this.updateStatus('Analysis complete', '✓');
        this.hideSkeletons();
        this.populateScores(data);
        this.showTimestamp(Date.now());
        this.showRecommendations(data.recommendations);
        this.showInsights(data.insights);
        // Show re-analyze button after fresh analysis
        this.showActionButtons({ showRefresh: true });
      },
      
      [this.states.ERROR]: () => {
        this.updateStatus(data.message || 'Analysis failed', '✗');
        this.hideSkeletons();
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        // Show analyze button to retry
        this.showActionButtons({ showAnalyze: true });
      }
    };
    
    // Execute state handler
    const handler = stateHandlers[newState];
    if (handler) {
      handler();
    }
  },
  
  /**
   * Update status indicator
   * @param {string} text - Status message
   * @param {string} icon - Status icon
   */
  updateStatus(text, icon = '') {
    const statusText = this.overlayElement.querySelector('.status-text');
    const statusIcon = this.overlayElement.querySelector('.status-icon');
    
    if (statusText) {
      statusText.style.opacity = '0';
      setTimeout(() => {
        statusText.textContent = text;
        statusText.style.opacity = '1';
      }, 150);
    }
    
    if (statusIcon && icon) {
      statusIcon.textContent = icon;
      statusIcon.className = 'status-icon';
      if (icon === '⣾') {
        statusIcon.classList.add('spinning');
      }
    }
  },
  
  /**
   * Show skeleton loaders
   */
  showSkeletons() {
    const skeletons = this.overlayElement.querySelectorAll('.skeleton');
    skeletons.forEach(el => el.classList.add('loading'));
  },
  
  /**
   * Hide skeleton loaders
   */
  hideSkeletons() {
    const skeletons = this.overlayElement.querySelectorAll('.skeleton');
    skeletons.forEach(el => {
      el.classList.remove('skeleton', 'loading');
    });
  },
  
  /**
   * Update completeness score
   * @param {number} score - Completeness percentage
   */
  updateCompleteness(score) {
    const valueEl = this.overlayElement.querySelector('.completeness .score-value');
    const barEl = this.overlayElement.querySelector('.completeness .score-bar-fill');
    
    if (valueEl) {
      valueEl.textContent = Math.round(score);
      valueEl.classList.remove('skeleton');
    }
    
    if (barEl) {
      barEl.style.width = `${score}%`;
      barEl.classList.remove('skeleton');
      
      // Color based on score
      if (score >= 80) barEl.style.backgroundColor = '#057642';
      else if (score >= 60) barEl.style.backgroundColor = '#f59e0b';
      else barEl.style.backgroundColor = '#dc2626';
    }
  },
  
  /**
   * Populate all scores
   * @param {Object} data - Score data
   */
  populateScores(data) {
    // Update completeness
    if (data.completeness !== undefined) {
      this.updateCompleteness(data.completeness);
    }
    
    // Update quality score
    if (data.contentScore !== undefined) {
      const valueEl = this.overlayElement.querySelector('.quality .score-value');
      const barEl = this.overlayElement.querySelector('.quality .score-bar-fill');
      const statusEl = this.overlayElement.querySelector('.ai-status');
      
      if (valueEl) {
        valueEl.textContent = data.contentScore.toFixed(1);
        valueEl.classList.remove('skeleton');
      }
      
      if (barEl) {
        barEl.style.width = `${data.contentScore * 10}%`;
        barEl.classList.remove('skeleton');
        
        // Color based on score
        if (data.contentScore >= 8) barEl.style.backgroundColor = '#057642';
        else if (data.contentScore >= 6) barEl.style.backgroundColor = '#f59e0b';
        else barEl.style.backgroundColor = '#dc2626';
      }
      
      if (statusEl) {
        statusEl.textContent = data.fromCache ? 'Cached' : 'Fresh';
      }
    } else if (data.aiDisabled) {
      // AI disabled state
      const statusEl = this.overlayElement.querySelector('.ai-status');
      if (statusEl) {
        statusEl.textContent = 'AI analysis disabled';
        statusEl.style.color = '#666';
      }
    }
  },
  
  /**
   * Show timestamp
   * @param {number} timestamp - Unix timestamp
   */
  showTimestamp(timestamp) {
    const timestampEl = this.overlayElement.querySelector('.timestamp-display');
    if (!timestampEl || !timestamp) return;
    
    const date = new Date(timestamp);
    const formatted = date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    timestampEl.textContent = `Last analyzed: ${formatted}`;
    timestampEl.style.opacity = '1';
  },
  
  /**
   * Show recommendations
   * @param {Array|Object} recommendations - Recommendations data
   */
  showRecommendations(recommendations) {
    if (!recommendations) return;
    
    const section = this.overlayElement.querySelector('.recommendations-section');
    const list = this.overlayElement.querySelector('.recommendations-list');
    
    if (!section || !list) return;
    
    // Clear existing
    list.innerHTML = '';
    
    // Extract recommendations array
    let items = [];
    if (Array.isArray(recommendations)) {
      items = recommendations;
    } else if (recommendations.critical) {
      items = recommendations.critical;
    } else if (recommendations.high) {
      items = recommendations.high;
    }
    
    // Show top 3-5 recommendations
    items.slice(0, 5).forEach(rec => {
      const li = document.createElement('li');
      li.className = 'recommendation-item';
      li.textContent = typeof rec === 'string' ? rec : (rec.action || rec.message || rec);
      list.appendChild(li);
    });
    
    if (items.length > 0) {
      section.classList.remove('hidden');
    }
  },
  
  /**
   * Show insights
   * @param {Object} insights - Insights data
   */
  showInsights(insights) {
    if (!insights) return;
    
    const section = this.overlayElement.querySelector('.insights-section');
    const content = this.overlayElement.querySelector('.insights-content');
    
    if (!section || !content) return;
    
    // Format insights
    let insightText = '';
    if (insights.strengths) {
      insightText += `<strong>Strengths:</strong> ${insights.strengths}<br>`;
    }
    if (insights.improvements) {
      insightText += `<strong>Areas to improve:</strong> ${insights.improvements}`;
    }
    
    if (insightText) {
      content.innerHTML = insightText;
      section.classList.remove('hidden');
    }
  },
  
  /**
   * Show action buttons based on current state
   * @param {Object} options - Button visibility options
   */
  showActionButtons(options = {}) {
    const analyzeBtn = this.overlayElement.querySelector('.analyze-button');
    const refreshBtn = this.overlayElement.querySelector('.refresh-button');
    const detailsBtn = this.overlayElement.querySelector('.details-button');
    
    // Hide all buttons first
    [analyzeBtn, refreshBtn, detailsBtn].forEach(btn => btn?.classList.add('hidden'));
    
    // Show appropriate buttons based on state
    if (options.showAnalyze) {
      analyzeBtn?.classList.remove('hidden');
    }
    if (options.showRefresh) {
      refreshBtn?.classList.remove('hidden');
    }
    if (options.showDetails !== false) { // Default to showing details
      detailsBtn?.classList.remove('hidden');
    }
  },
  
  /**
   * Show progress bar
   * @param {string} phase - Current phase
   */
  showProgressBar(phase) {
    // Could add a progress bar UI element if desired
    console.log(`[OverlayManager] Progress phase: ${phase}`);
  },
  
  /**
   * Handle analyze button click (first-time analysis)
   */
  handleAnalyze() {
    console.log('[OverlayManager] Analysis requested');
    // Send message to trigger analysis
    window.postMessage({ type: 'ELEVATE_REFRESH' }, '*');
  },
  
  /**
   * Handle refresh button click (re-analysis)
   */
  handleRefresh() {
    console.log('[OverlayManager] Refresh requested');
    // Send message to trigger re-analysis
    window.postMessage({ type: 'ELEVATE_REFRESH' }, '*');
  },
  
  /**
   * Handle view details button click
   */
  handleViewDetails() {
    console.log('[OverlayManager] View details requested');
    // Could expand overlay or open popup
    chrome.runtime.sendMessage({ action: 'openDashboard' });
  },
  
  /**
   * Close overlay
   */
  close() {
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      wrapper.style.opacity = '0';
      setTimeout(() => {
        wrapper.remove();
        this.overlayElement = null;
      }, 300);
    }
  }
};// ElevateLI - Bundled Version (Modular Structure)
// All modules bundled for Manifest V3 compatibility

/*
 * TABLE OF CONTENTS:
 * 1. Chrome API Safety Wrappers (lines ~10-90)
 * 2. State Management (lines ~90-100)
 * 3. DOM Utilities (lines ~100-150)
 * 4. Profile Section Discovery (lines ~150-800)
 * 5. Profile Extractors (lines ~800-1500)
 * 6. Profile Completeness Calculator (lines ~1500-1600)
 * 7. UI Components (lines ~1600-2200)
 * 8. Main Initialization (lines ~2200-2600)
 */

(function() {
  'use strict';
  
  console.log('ElevateLI analyzer running on:', window.location.href);
  
  // Safe Chrome API helpers to prevent "Extension context invalidated" errors
  function safeChrome() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  }
  
  function safeStorageSet(data, callback) {
    if (!safeChrome()) {
      console.log('Extension context lost - storage.set skipped');
      return;
    }
    
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.log('Storage error:', chrome.runtime.lastError);
        } else if (callback) {
          callback();
        }
      });
    } catch (err) {
      console.log('Storage set error:', err);
    }
  }
  
  function safeStorageGet(keys, callback) {
    if (!safeChrome()) {
      console.log('Extension context lost - storage.get skipped');
      callback({});
      return;
    }
    
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.log('Storage error:', chrome.runtime.lastError);
          callback({});
        } else {
          callback(result);
        }
      });
    } catch (err) {
      console.log('Storage get error:', err);
      callback({});
    }
  }
  
  function safeSendMessage(message, callback) {
    if (!safeChrome()) {
      console.log('Extension context lost - message send skipped');
      if (callback) callback(null);
      return;
    }
    
    // Standardize message format
    const standardizedMessage = {
      action: message.action || 'unknown',
      payload: message.payload || message,
      timestamp: Date.now(),
      source: 'content'
    };
    
    // If message already has action at top level, preserve other fields
    if (message.action) {
      const { action, ...otherFields } = message;
      standardizedMessage.payload = otherFields;
    }
    
    try {
      chrome.runtime.sendMessage(standardizedMessage, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Message error:', chrome.runtime.lastError);
          if (callback) callback(null);
        } else if (callback) {
          callback(response);
        }
      });
    } catch (err) {
      console.log('Message send error:', err);
      if (callback) callback(null);
    }
  }
  
  /* ============================================
   * SECTION 2: STATE MANAGEMENT
   * ============================================ */
  const ExtensionState = {
    isExtracting: false,
    lastExtraction: null,
    badgeInjected: false,
    lastPath: location.pathname,
    observers: [],
    eventListeners: [],
    timeouts: [],
    intervals: [],
    lastCompletenessScore: 0,
    storageListener: null
  };
  
  /* ============================================
   * SECTION 3: MEMORY MANAGEMENT HELPERS
   * ============================================ */
  function addManagedEventListener(element, event, handler, options) {
    if (!element) return;
    
    // Remove any existing listener with same signature
    removeManagedEventListener(element, event, handler);
    
    element.addEventListener(event, handler, options);
    ExtensionState.eventListeners.push({ element, event, handler, options });
  }
  
  function removeManagedEventListener(element, event, handler) {
    if (!element) return;
    
    element.removeEventListener(event, handler);
    ExtensionState.eventListeners = ExtensionState.eventListeners.filter(
      listener => !(listener.element === element && listener.event === event && listener.handler === handler)
    );
  }
  
  function addManagedTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      callback();
      ExtensionState.timeouts = ExtensionState.timeouts.filter(id => id !== timeoutId);
    }, delay);
    ExtensionState.timeouts.push(timeoutId);
    return timeoutId;
  }
  
  function clearManagedTimeout(timeoutId) {
    clearTimeout(timeoutId);
    ExtensionState.timeouts = ExtensionState.timeouts.filter(id => id !== timeoutId);
  }
  
  function addManagedInterval(callback, delay) {
    const intervalId = setInterval(callback, delay);
    ExtensionState.intervals.push(intervalId);
    return intervalId;
  }
  
  function clearManagedInterval(intervalId) {
    clearInterval(intervalId);
    ExtensionState.intervals = ExtensionState.intervals.filter(id => id !== intervalId);
  }
  
  /* ============================================
   * SECTION 4: DOM UTILITIES
   * ============================================ */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  function waitForElement(selector, callback, maxWait = 5000) {
    const startTime = Date.now();
    let timeoutId = null;
    
    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) {
        if (timeoutId) clearManagedTimeout(timeoutId);
        callback(element);
      } else if (Date.now() - startTime < maxWait) {
        timeoutId = addManagedTimeout(checkElement, 100);
      }
    };
    
    checkElement();
  }
  
  function isProfilePage() {
    const path = window.location.pathname;
    return path.includes('/in/') && !path.includes('/messaging/') && !path.includes('/jobs/');
  }
  
  async function isOwnProfile() {
    return new Promise(resolve => {
      safeStorageGet(['linkedinProfile'], function(result) {
        if (result.linkedinProfile) {
          const currentUrl = window.location.href;
          const profileId = result.linkedinProfile.split('/in/')[1]?.split('/')[0];
          resolve(profileId && currentUrl.includes(profileId));
        } else {
          resolve(false);
        }
      });
    });
  }
  
  function formatMarkdownInline(text) {
    // DEPRECATED: This function returns HTML strings which is unsafe
    // Use createMarkdownElement instead for secure DOM manipulation
    console.warn('formatMarkdownInline is deprecated due to XSS risk. Use createMarkdownElement instead.');
    if (!text) return '';
    
    // Escape HTML entities to prevent XSS
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };
    
    text = escapeHtml(text);
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\n/g, '<br>');
    text = text.replace(/^(\d+)\.\s(.+)$/gm, '<div style="margin: 8px 0; padding-left: 15px;"><strong>$1.</strong> $2</div>');
    return text;
  }
  
  function createMarkdownElement(text) {
    if (!text) return document.createDocumentFragment();
    
    const container = document.createElement('span');
    
    // Handle numbered lists first
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) {
        container.appendChild(document.createElement('br'));
      }
      
      const listMatch = line.match(/^(\d+)\.\s(.+)$/);
      if (listMatch) {
        // Numbered list item
        const div = document.createElement('div');
        div.style.cssText = 'margin: 8px 0; padding-left: 15px;';
        const strong = document.createElement('strong');
        strong.textContent = listMatch[1] + '.';
        div.appendChild(strong);
        div.appendChild(document.createTextNode(' '));
        
        // Process the rest of the line for bold text
        processLineForBold(listMatch[2], div);
        container.appendChild(div);
      } else {
        // Regular line - process for bold text
        processLineForBold(line, container);
      }
    });
    
    return container;
    
    function processLineForBold(text, parent) {
      const boldRegex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(text)) !== null) {
        // Add text before the bold part
        if (match.index > lastIndex) {
          parent.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
        }
        
        // Add bold text
        const strong = document.createElement('strong');
        strong.textContent = match[1];
        parent.appendChild(strong);
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < text.length) {
        parent.appendChild(document.createTextNode(text.substring(lastIndex)));
      }
    }
  }
  
  // ============= Scoring Module =============
  // Removed - using ProfileScanner.calculateCompleteness as single source of truth
  
  /* ============================================
   * SECTION 4: PROFILE SECTION DISCOVERY
   * Lightweight scanning for profile completeness
   * ============================================ */
  const ProfileSectionDiscovery = {
    discoverSections() {
      const startTime = performance.now();
      
      const sections = {
        photo: this.hasPhoto(),
        backgroundBanner: this.hasCustomBanner(),
        location: this.hasLocation(),
        headline: this.getHeadlineInfo(),
        about: this.getAboutInfo(),
        experience: this.getExperienceInfo(),
        skills: this.getSkillsInfo(),
        education: this.getEducationInfo(),
        certifications: this.getCertificationsInfo(),
        projects: this.getProjectsInfo(),
        volunteer: this.getVolunteerInfo(),
        languages: this.getLanguagesInfo(),
        recommendations: this.getRecommendationsInfo(),
        honors: this.getHonorsInfo(),
        testScores: this.getTestScoresInfo(),
        topSkills: this.getTopSkillsInfo(),
        featured: this.getFeaturedInfo(),
        connections: this.getConnectionsInfo(),
        activity: this.getActivityInfo(),
        githubLink: this.hasGitHubLink(),
        openToWork: this.getOpenToWorkInfo()
      };
      
      sections.discoveryTime = Math.round(performance.now() - startTime) + 'ms';
      return sections;
    },
    
    getHonorsInfo() {
      const section = document.querySelector('#honors')?.closest('section') ||
                     document.querySelector('#honors_and_awards')?.closest('section') ||
                     Array.from(document.querySelectorAll('section')).find(s => {
                       const h2 = s.querySelector('h2');
                       return h2 && (h2.textContent?.includes('Honors') || h2.textContent?.includes('Awards'));
                     });
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X honors & awards" link
      const showAllLink = section.querySelector('.pvs-list__footer-wrapper a[href*="/details/honors"]');
      if (showAllLink) {
        const text = showAllLink.querySelector('.pvs-navigation__text')?.textContent || showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) honors/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) honors/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      // Count visible items - filter properly
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper') &&
        !item.querySelector('a[href*="/details/recommendations"]')
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },
    
    getTopSkillsInfo() {
      // Look for Top Skills section (often in profile highlights)
      const topSkillsLink = document.querySelector('a[href*="/overlay/top-skills-details"]');
      if (topSkillsLink) {
        const section = topSkillsLink.closest('.artdeco-card');
        if (section) {
          const skillsText = section.querySelector('.t-14.t-normal')?.textContent || '';
          const skills = skillsText.split('•').map(s => s.trim()).filter(s => s.length > 0);
          return { exists: true, count: skills.length, skills };
        }
      }
      
      // Alternative check for Top Skills section
      const topSkillsSection = Array.from(document.querySelectorAll('.pvs-entity')).find(entity => 
        entity.textContent?.includes('Top skills')
      );
      if (topSkillsSection) {
        const skillsText = topSkillsSection.querySelector('.t-14.t-normal')?.textContent || '';
        const skills = skillsText.split('•').map(s => s.trim()).filter(s => s.length > 0);
        return { exists: skills.length > 0, count: skills.length, skills };
      }
      
      return { exists: false, count: 0 };
    },
    
    getFeaturedInfo() {
      // Check for Featured section (carousel with posts/links)
      const featuredSection = document.getElementById('featured')?.closest('section') ||
                             document.querySelector('.pvs-carousel')?.closest('section');
      if (featuredSection) {
        // Count carousel items
        const items = featuredSection.querySelectorAll('.artdeco-carousel__item');
        const validItems = Array.from(items).filter(item => 
          item.querySelector('.pvs-media-content__image') || 
          item.querySelector('[aria-label*="Post"]') ||
          item.querySelector('[aria-label*="Link"]')
        );
        return { exists: validItems.length > 0, count: validItems.length };
      }
      return { exists: false, count: 0 };
    },
    
    getConnectionsInfo() {
      // Look for connections count in profile header
      const connectionsLink = document.querySelector('a[href*="/mynetwork/invite-connect/connections/"]') ||
                            document.querySelector('a[href*="connections"] .t-bold')?.closest('a');
      if (connectionsLink) {
        const text = connectionsLink.textContent || '';
        const match = text.match(/(\d+)\+?\s*connections?/i);
        if (match) {
          const count = parseInt(match[1]);
          const isMax = text.includes('+');
          return { exists: true, count: count, is500Plus: count >= 500 || isMax };
        }
      }
      return { exists: false, count: 0, is500Plus: false };
    },
    
    getActivityInfo() {
      // Look for Activity section
      const activitySection = document.getElementById('content_collections')?.closest('section') ||
                             Array.from(document.querySelectorAll('section')).find(s => {
                               const h2 = s.querySelector('h2');
                               return h2 && h2.textContent?.includes('Activity');
                             });
      
      if (!activitySection) return { exists: false, recency: null, score: 0 };
      
      // Get followers count
      const followersLink = activitySection.querySelector('a[href*="/feed/followers/"]');
      let followers = 0;
      if (followersLink) {
        const match = followersLink.textContent?.match(/([\d,]+)\s*followers?/i);
        if (match) followers = parseInt(match[1].replace(/,/g, ''));
      }
      
      // Find most recent activity timestamp
      const timestamps = activitySection.querySelectorAll('.update-components-actor__sub-description');
      let mostRecentMonths = Infinity;
      
      timestamps.forEach(timestamp => {
        const text = timestamp.textContent || '';
        // Parse timestamps like "3mo", "6mo", "1yr", "2yr"
        const monthMatch = text.match(/(\d+)mo/);
        const yearMatch = text.match(/(\d+)yr/);
        const weekMatch = text.match(/(\d+)w/);
        const dayMatch = text.match(/(\d+)d/);
        
        if (dayMatch) {
          const days = parseInt(dayMatch[1]);
          mostRecentMonths = Math.min(mostRecentMonths, days / 30);
        } else if (weekMatch) {
          const weeks = parseInt(weekMatch[1]);
          mostRecentMonths = Math.min(mostRecentMonths, weeks / 4);
        } else if (monthMatch) {
          mostRecentMonths = Math.min(mostRecentMonths, parseInt(monthMatch[1]));
        } else if (yearMatch) {
          const years = parseInt(yearMatch[1]);
          mostRecentMonths = Math.min(mostRecentMonths, years * 12);
        }
      });
      
      // Calculate activity score based on recency
      let activityScore = 0;
      if (mostRecentMonths <= 3) {
        activityScore = 7;
      } else if (mostRecentMonths <= 6) {
        activityScore = 5;
      } else if (mostRecentMonths <= 12) {
        activityScore = 3;
      } else if (mostRecentMonths < Infinity) {
        activityScore = 1;
      }
      
      return {
        exists: activityScore > 0,
        recency: mostRecentMonths < Infinity ? `${Math.ceil(mostRecentMonths)} months` : 'No activity',
        score: activityScore,
        followers
      };
    },
    
    getTestScoresInfo() {
      const section = document.querySelector('#test-scores')?.closest('section') ||
                     document.querySelector('#test_scores')?.closest('section') ||
                     Array.from(document.querySelectorAll('section')).find(s => {
                       const h2 = s.querySelector('h2');
                       return h2 && (h2.textContent?.includes('Test') || h2.textContent?.includes('Scores'));
                     });
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X test scores" link
      const showAllLink = section.querySelector('a[href*="/details/test-scores"]') ||
                         section.querySelector('a[href*="/details/testscores"]');
      if (showAllLink) {
        const text = showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) test/i) || text.match(/(\d+) test/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper') &&
        !item.querySelector('a[href*="/details/recommendations"]')
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },
    
    getOpenToWorkInfo() {
      // Look for Open to Work section
      const openToWorkSection = document.querySelector('.pv-open-to-carousel') ||
                               document.querySelector('[data-view-name*="open-to-work"]') ||
                               document.querySelector('.pv-open-to-section');
      
      if (!openToWorkSection) return { exists: false, roles: [], preferences: {} };
      
      const roles = [];
      const preferences = {};
      
      // Extract job titles looking for
      const roleElements = openToWorkSection.querySelectorAll('.pv-open-to-job-title') ||
                          openToWorkSection.querySelectorAll('[data-field="job_title"]');
      roleElements.forEach(el => {
        const role = el.textContent?.trim();
        if (role) roles.push(role);
      });
      
      // Extract preferences (remote, hybrid, on-site)
      const workplaceTypes = openToWorkSection.querySelector('.pv-open-to-workplace-types')?.textContent || '';
      if (workplaceTypes.includes('Remote')) preferences.remote = true;
      if (workplaceTypes.includes('Hybrid')) preferences.hybrid = true;
      if (workplaceTypes.includes('On-site')) preferences.onSite = true;
      
      // Extract start date preference
      const startDate = openToWorkSection.querySelector('.pv-open-to-start-date')?.textContent?.trim();
      if (startDate) preferences.startDate = startDate;
      
      // Extract employment types
      const employmentTypes = [];
      openToWorkSection.querySelectorAll('.pv-open-to-employment-type').forEach(el => {
        const type = el.textContent?.trim();
        if (type) employmentTypes.push(type);
      });
      if (employmentTypes.length) preferences.employmentTypes = employmentTypes;
      
      return {
        exists: roles.length > 0,
        roles,
        preferences,
        isPublic: !!openToWorkSection.querySelector('.pv-open-to-public-indicator')
      };
    },

    
    hasCustomBanner() {
      const banner = document.querySelector('.profile-background-image__image') || 
                    document.querySelector('.pv-top-card__photo-wrapper img');
      if (banner && banner.src && !banner.src.includes('ghosts-general')) {
        return { exists: true, url: banner.src };
      }
      return { exists: false, url: null };
    },
    
    hasLocation() {
      const locationEl = document.querySelector('.text-body-small.inline.t-black--light.break-words') ||
                       document.querySelector('.pv-top-card-section__location') ||
                       document.querySelector('[class*="location"]');
      const locationText = locationEl?.textContent?.trim();
      return { exists: !!locationText, text: locationText || null };
    },
    
    getHeadlineInfo() {
      const element = document.querySelector('.text-body-medium.break-words');
      const text = element?.textContent?.trim() || '';
      
      // Count tech keywords (common patterns)
      const techKeywords = text.match(/\b(engineer|developer|architect|manager|lead|senior|principal|full.?stack|front.?end|back.?end|data|ML|AI|DevOps|cloud|mobile|web|software|technical|product|program|java|python|javascript|react|node|aws|azure|kubernetes|docker)\b/gi) || [];
      const uniqueKeywords = [...new Set(techKeywords.map(k => k.toLowerCase()))];
      
      return { 
        exists: !!text, 
        charCount: text.length,
        charLimit: 220,
        techKeywordCount: uniqueKeywords.length
      };
    },
    
    getAboutInfo() {
      // Try to get the about section using scanner approach (sync)
      const aboutAnchor = document.getElementById('about');
      if (!aboutAnchor) {
        return { exists: false, text: '', charCount: 0, charLimit: 2600, hasQuantifiedAchievement: false };
      }
      
      let text = '';
      let currentElement = aboutAnchor.nextElementSibling;
      let iterations = 0;
      const maxIterations = 10;
      
      while (currentElement && text.length === 0 && iterations < maxIterations) {
        iterations++;
        
        // Look for elements with class containing "inline-show-more-text"
        const showMoreElements = currentElement.querySelectorAll('[class*="inline-show-more-text"]');
        for (const showMoreDiv of showMoreElements) {
          const span = showMoreDiv.querySelector('span[aria-hidden="true"]');
          if (span) {
            const content = span.textContent?.trim() || '';
            if (content.length > 100 && 
                !content.includes('About this profile') && 
                !content.includes('posts') &&
                !content.includes('Show all')) {
              text = content;
              break;
            }
          }
        }
        
        if (text) break;
        currentElement = currentElement.nextElementSibling;
      }
      
      if (!text) {
        return { exists: false, text: '', charCount: 0, charLimit: 2600, hasQuantifiedAchievement: false };
      }
      
      // Check for quantified achievements
      const quantifiedPattern = /\d+[%+]?\s*(years?|months?|revenue|users|customers|projects|teams?|products?|features?|improvement|reduction|increase|decrease|ROI|saved|generated|delivered|managed|led|million|billion|thousand)/gi;
      const hasQuantified = quantifiedPattern.test(text);
      
      return { 
        exists: true, 
        text: text,
        charCount: text.length,
        charLimit: 2600,
        hasQuantifiedAchievement: hasQuantified
      };
    },
    
    getExperienceInfo() {
      const section = document.getElementById('experience')?.closest('section');
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X experiences" link (LinkedIn's new structure)
      const showAllLink = section.querySelector('.pvs-list__footer-wrapper a[href*="/details/experience"]');
      if (showAllLink) {
        const text = showAllLink.querySelector('.pvs-navigation__text')?.textContent || showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) experience/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) experience/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      // Count visible items - LinkedIn uses pvs-entity or artdeco-list__item
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item, [data-view-name="profile-component-entity"]');
      const validItems = Array.from(items).filter(item => {
        // Exclude the "Show all" footer item
        const isFooter = item.querySelector('a[href*="/details/experience"]') || 
                        item.querySelector('.pvs-list__footer-wrapper');
        return !isFooter && (item.querySelector('.t-bold') || item.querySelector('[data-field="position_title"]'));
      });
      
      return { 
        exists: validItems.length > 0, 
        count: validItems.length
      };
    },
    
    hasPhoto() {
      const selectors = [
        'img.pv-top-card-profile-picture__image',
        'img.profile-photo-edit__preview',
        '.pv-top-card__photo-wrapper img',
        '.profile-photo-edit img'
      ];
      
      for (const selector of selectors) {
        const photoEl = document.querySelector(selector);
        if (photoEl && 
            photoEl.src && 
            photoEl.src.length > 0 && 
            !photoEl.src.includes('ghost-person') &&
            (photoEl.width > 0 || photoEl.getAttribute('width'))) {
          return {
            exists: true,
            url: photoEl.src
          };
        }
      }
      return { exists: false, url: null };
    },
    
    getSkillsInfo() {
      // LinkedIn changed structure - skills section uses data-view-name attribute
      let section = document.querySelector('[data-view-name="profile-card"][id*="skills"]')?.closest('section') ||
                   document.querySelector('section[data-section="skills"]') ||
                   document.querySelector('div[id*="skills"]')?.closest('section') ||
                   Array.from(document.querySelectorAll('section')).find(s => {
                     const h2 = s.querySelector('h2');
                     return h2 && (h2.textContent?.includes('Skills') || 
                                  h2.querySelector('span')?.textContent?.includes('Skills'));
                   });
                     
      if (!section) return { exists: false, visibleCount: 0, totalCount: 0, hasEndorsements: false };
      
      // Check for "Show all X skills" link (new structure)
      const showAllLink = section.querySelector('.pvs-list__footer-wrapper a[href*="/details/skills"]');
      
      
      if (showAllLink) {
        const text = showAllLink.querySelector('.pvs-navigation__text')?.textContent || showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) skill/i) || text.match(/(\d+) skill/i);
        if (match) {
          const totalCount = parseInt(match[1]);
          return {
            exists: true,
            totalCount,
            count: totalCount, // Add count property for compatibility
            detailsUrl: showAllLink.href,
            visibleCount: this.countVisibleSkills(section),
            hasEndorsements: this.checkEndorsements(section)
          };
        }
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      let totalCount = 0;
      
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) skill/i);
        if (match) totalCount = parseInt(match[1]);
      }
      
      // Count visible skills (exclude footer items)
      const skillItems = section.querySelectorAll('.pvs-entity, .artdeco-list__item, [data-view-name="profile-component-entity"]');
      const validItems = Array.from(skillItems).filter(item => {
        const isFooter = item.querySelector('a[href*="/details/skills"]') || 
                        item.querySelector('.pvs-list__footer-wrapper');
        return !isFooter;
      });
      const visibleCount = validItems.length;
      
      // Use whichever count is higher
      const finalCount = Math.max(totalCount, visibleCount);
      
      // Check if top 3 skills have endorsements
      let hasEndorsements = false;
      const topSkills = validItems.slice(0, 3);
      if (topSkills.length >= 3) {
        hasEndorsements = topSkills.every(skill => {
          const endorsementText = skill.textContent || '';
          return endorsementText.includes('endorsement') || endorsementText.match(/\d+\s*endorsement/);
        });
      }
      
      return { 
        exists: finalCount > 0, 
        visibleCount, 
        totalCount: finalCount,
        count: finalCount, // Add count property for compatibility
        hasEndorsements 
      };
    },
    
    countVisibleSkills(section) {
      const skillItems = section.querySelectorAll('.pvs-entity, li.artdeco-list__item, [data-view-name="profile-component-entity"]');
      const validItems = Array.from(skillItems).filter(item => {
        // Exclude footer items
        const isFooter = item.querySelector('a[href*="/details/skills"]') || 
                        item.querySelector('.pvs-list__footer-wrapper');
        return !isFooter;
      });
      return validItems.length;
    },
    
    checkEndorsements(section) {
      // Check if skills have endorsements
      const skillItems = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const topSkills = Array.from(skillItems).slice(0, 3).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper')
      );
      
      if (topSkills.length >= 3) {
        return topSkills.every(skill => {
          const endorsementText = skill.textContent || '';
          // Look for patterns like "Endorsed by X" or "X endorsement" or endorsement count
          return endorsementText.includes('Endorsed by') || 
                 endorsementText.match(/\d+\s*(person|people|endorsement)/i) ||
                 skill.querySelector('a[href*="/endorsers"]');
        });
      }
      return false;
    },
    
    getProjectsInfo() {
      const section = document.querySelector('#projects')?.closest('section');
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X projects" link
      const showAllLink = section.querySelector('a[href*="/details/projects"]');
      if (showAllLink) {
        const text = showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) project/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) project/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper')
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },
    
    getVolunteerInfo() {
      const section = document.querySelector('#volunteering_experience')?.closest('section');
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X volunteer experiences" link (new structure)
      const showAllLink = section.querySelector('a[href*="/details/volunteering-experiences"]');
      if (showAllLink) {
        const text = showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) volunteer/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) volunteer/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper')
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },
    
    getRecommendationsInfo() {
      const section = document.querySelector('#recommendations')?.closest('section');
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X received" link (new structure)
      const showAllLink = section.querySelector('.pvs-list__footer-wrapper a[href*="/details/recommendations"]');
      if (showAllLink) {
        const text = showAllLink.querySelector('.pvs-navigation__text')?.textContent || showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) received/i) || text.match(/(\d+) received/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Check header for count - e.g. "Recommendations (8)"
      const headerText = section.querySelector('h2')?.textContent || '';
      const headerMatch = headerText.match(/Recommendations\s*\((\d+)\)/);
      if (headerMatch) return { exists: true, count: parseInt(headerMatch[1]) };
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) recommendation/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper')
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },
    
    getLanguagesInfo() {
      const section = document.querySelector('#languages')?.closest('section');
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X languages" link
      const showAllLink = section.querySelector('a[href*="/details/languages"]');
      if (showAllLink) {
        const text = showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) language/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) language/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper')
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },
    
    hasGitHubLink() {
      // Check contact info section or featured section
      const contactSection = document.querySelector('#top-card-text-details-contact-info');
      const featuredSection = document.querySelector('.pv-featured-container');
      const allLinks = document.querySelectorAll('a[href*="github.com"]');
      
      return allLinks.length > 0;
    },
    
    getEducationInfo() {
      const section = document.getElementById('education')?.closest('section');
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X education" link
      const showAllLink = section.querySelector('a[href*="/details/education"]');
      if (showAllLink) {
        const text = showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) education/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) education/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper') &&
        (item.querySelector('.t-bold') || item.querySelector('[data-field="school_name"]'))
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },
    
    getCertificationsInfo() {
      const section = document.querySelector('#licenses_and_certifications')?.closest('section');
      if (!section) return { exists: false, count: 0 };
      
      // Check for "Show all X licenses & certifications" link (new structure)
      const showAllLink = section.querySelector('a[href*="/details/certifications"]');
      if (showAllLink) {
        const text = showAllLink.textContent || '';
        const match = text.match(/Show all (\d+) licenses/i);
        if (match) return { exists: true, count: parseInt(match[1]), detailsUrl: showAllLink.href };
      }
      
      // Fallback to button
      const showAllBtn = section.querySelector('button[aria-label*="Show all"]');
      if (showAllBtn) {
        const text = showAllBtn.getAttribute('aria-label') || '';
        const match = text.match(/Show all (\d+) licenses/i);
        if (match) return { exists: true, count: parseInt(match[1]) };
      }
      
      // Count visible items excluding footer
      const items = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      const validItems = Array.from(items).filter(item => 
        !item.querySelector('.pvs-list__footer-wrapper') &&
        !item.querySelector('a[href*="/details/certifications"]')
      );
      return { exists: validItems.length > 0, count: validItems.length };
    },

  };
  
  // ============= About Section Extractor Module =============
  const AboutExtractor = {
    async extract() {
      console.log('[EXTRACT-LOG] Starting About extraction...');
      
      const aboutAnchor = document.getElementById('about');
      if (!aboutAnchor) {
        console.log('[EXTRACT-LOG] About anchor not found');
        return { exists: false, text: '', charCount: 0 };
      }
      
      // Extract full text - LinkedIn has changed their structure
      let text = '';
      let currentElement = aboutAnchor.nextElementSibling;
      let iterations = 0;
      const maxIterations = 10;
      
      while (currentElement && text.length === 0 && iterations < maxIterations) {
        iterations++;
        
        // LinkedIn uses compound classes like inline-show-more-text--is-collapsed
        // Method 1: Look for elements with class containing "inline-show-more-text"
        const showMoreElements = currentElement.querySelectorAll('[class*="inline-show-more-text"]');
        for (const showMoreDiv of showMoreElements) {
          const span = showMoreDiv.querySelector('span[aria-hidden="true"]');
          if (span) {
            const content = span.textContent?.trim() || '';
            if (content.length > 100 && 
                !content.includes('About this profile') && 
                !content.includes('posts') &&
                !content.includes('Show all')) {
              text = content;
              console.log(`[EXTRACT-LOG] About text found via Method 1: ${text.length} chars`);
              console.log(`[EXTRACT-LOG] About preview: "${text.substring(0, 100)}..."`);
              break;
            }
          }
        }
        
        // Method 2: Look for any span with aria-hidden="true" that contains substantial text
        if (!text) {
          const spans = currentElement.querySelectorAll('span[aria-hidden="true"]');
        for (const span of spans) {
          const content = span.textContent?.trim() || '';
          // About sections are typically long (> 100 chars) and don't contain navigation text
          if (content.length > 100 && 
              !content.includes('About this profile') && 
              !content.includes('posts') &&
              !content.includes('Show all')) {
            text = content;
              break;
            }
          }
        }
        
        // Method 3: Check if the current element itself contains the text directly
        if (!text && currentElement.textContent) {
          // Remove any nested button/link text
          const clonedElement = currentElement.cloneNode(true);
          const buttons = clonedElement.querySelectorAll('button, a');
          buttons.forEach(btn => btn.remove());
          
          const content = clonedElement.textContent?.trim() || '';
          if (content.length > 100) {
            text = content;
            break;
          }
        }
        
        // Method 4: Look for div with obfuscated class that contains the about text
        if (!text) {
          const divs = currentElement.querySelectorAll('div');
          for (const div of divs) {
            // Skip if it has child sections or articles (likely not text content)
            if (div.querySelector('section, article, button, a')) continue;
            
            const content = div.textContent?.trim() || '';
            if (content.length > 100 && content.length < 3000) { // About text has limits
              text = content;
              break;
            }
          }
        }
        
        currentElement = currentElement.nextElementSibling;
      }
      
      // Fallback: Try broader selectors if sibling traversal didn't work
      if (!text) {
        
        // First, let's debug what's actually near the about section
        const debugInfo = {
          aboutAnchorExists: !!aboutAnchor,
          nextSibling: aboutAnchor?.nextElementSibling?.tagName,
          nextSiblingClasses: aboutAnchor?.nextElementSibling?.className,
          parentElement: aboutAnchor?.parentElement?.tagName,
          parentClasses: aboutAnchor?.parentElement?.className
        };
        
        // LinkedIn uses compound classes like inline-show-more-text--is-collapsed
        const allShowMore = document.querySelectorAll('[class*="inline-show-more-text"]');
        
        // Check each one to see if it might be the about section
        for (const showMore of allShowMore) {
          const span = showMore.querySelector('span[aria-hidden="true"]');
          if (span) {
            const content = span.textContent?.trim() || '';
            if (content.length > 200) { // About sections are usually long
              // Check if this element is somewhere near the about anchor
              let parent = showMore;
              let nearAbout = false;
              for (let i = 0; i < 10; i++) {
                parent = parent.parentElement;
                if (!parent) break;
                if (parent.querySelector('#about')) {
                  nearAbout = true;
                  break;
                }
              }
              
              if (nearAbout) {
                text = content;
                break;
              }
            }
          }
        }
        
        // If still not found, try more specific selectors
        if (!text) {
          const selectors = [
            // LinkedIn 2024/2025 selectors
            'section:has(#about) [class*="inline-show-more-text"] span[aria-hidden="true"]',
            '[id="about"] ~ div [class*="inline-show-more-text"] span[aria-hidden="true"]',
            '.pv-profile-card:has(#about) [class*="inline-show-more-text"] span[aria-hidden="true"]',
            '.pv-about-section [class*="inline-show-more-text"] span[aria-hidden="true"]',
            // Try without inline-show-more-text
            '#about ~ div span[aria-hidden="true"]',
            'section:has(#about) div[data-field="about_section"] span[aria-hidden="true"]'
          ];
          
          for (const selector of selectors) {
            try {
              const el = document.querySelector(selector);
              if (el) {
                const content = el.textContent?.trim() || '';
                if (content.length > 100 && !content.includes('About this profile') && !content.includes('posts')) {
                  text = content;
                  break;
                }
              }
            } catch (e) {
              // :has() might not be supported in all browsers
              if (!e.message.includes(':has')) {
                console.error('[AboutExtractor] Selector error:', e.message);
              }
            }
          }
        }
      }
      
      
      const result = {
        exists: text.length > 0,
        text: text,
        charCount: text.length,
        charLimit: 2600
      };
      
      console.log(`[EXTRACT-LOG] About extraction complete:`, {
        exists: result.exists,
        charCount: result.charCount,
        preview: result.text.substring(0, 150) + '...'
      });
      
      return result;
    },
    
    async analyze(aboutData, settings) {
      if (!aboutData.text) return null;
      
      const response = await new Promise((resolve) => {
        safeSendMessage({
          action: 'analyzeSection',
          section: 'about',
          data: aboutData,
          settings: settings
        }, resolve);
      });
      
      return response;
    }
  };
  
  // ============= Profile Completeness Calculator =============
  const ProfileCompletenessCalculator = {
    calculate(discoveryData) {
      
      // Based on LinkedIn optimization best practices
      const scoringCriteria = {
        // High Weight (20/15 points each)
        profile_photo_exists: { value: discoveryData.photo.exists, weight: 15 },
        experience_entries_count: { value: discoveryData.experience.count >= 1, weight: 20 },
        
        // Medium Weight (10 points each)  
        headline_char_count: { value: discoveryData.headline.charCount >= 100, weight: 10 },
        about_section_char_count: { value: discoveryData.about.charCount >= 800, weight: 10 },
        experience_multiple: { value: discoveryData.experience.count >= 2, weight: 10 },
        skills_count: { value: (discoveryData.skills.totalCount || discoveryData.skills.count || 0) >= 15, weight: 10 },
        
        // Low Weight (5 points each)
        education_entries_count: { value: discoveryData.education.count >= 1, weight: 5 },
        location_exists: { value: discoveryData.location.exists, weight: 5 },
        has_custom_banner: { value: discoveryData.backgroundBanner.exists, weight: 5 },
        pinned_skills_count: { value: (discoveryData.topSkills?.count || 0) >= 3, weight: 5 },
        recommendations_count: { value: discoveryData.recommendations.count >= 1, weight: 5 },
        
        // Minimal Weight (3/2 points each)
        certifications_count: { value: discoveryData.certifications.count >= 1, weight: 3 },
        projects_count: { value: discoveryData.projects.count >= 1, weight: 2 },
        featured_section: { value: discoveryData.featured.exists, weight: 5 },
        connections_500plus: { value: discoveryData.connections.is500Plus, weight: 5 },
        recent_activity: { value: discoveryData.activity.score > 0, weight: discoveryData.activity.score || 0 }
      };
      
      let earnedPoints = 0;
      let totalPoints = 0;
      const detailedScores = {};
      
      Object.entries(scoringCriteria).forEach(([key, criterion]) => {
        totalPoints += criterion.weight;
        if (criterion.value) {
          earnedPoints += criterion.weight;
        }
        detailedScores[key] = {
          passed: criterion.value,
          weight: criterion.weight
        };
      });
      
      const completenessScore = Math.round((earnedPoints / totalPoints) * 100);
      
      return {
        score: completenessScore,
        detailedScores,
        summary: this.generateSummary(scoringCriteria, completenessScore, discoveryData)
      };
    },
    
    generateSummary(criteria, score, data) {
      const missing = [];
      const improvements = [];
      
      // High priority issues
      if (!criteria.profile_photo_exists.value) missing.push('Professional profile photo');
      if (!criteria.experience_entries_count.value) missing.push('Add at least one experience');
      
      // Medium priority  
      if (!criteria.headline_char_count.value) missing.push('Headline needs 100+ characters');
      if (!criteria.about_section_char_count.value) missing.push('Expand About section to 800+ characters');
      if (!criteria.experience_multiple.value) improvements.push('Add more experiences (2+ recommended)');
      if (!criteria.skills_count.value) improvements.push(`Add more skills (need 15+, currently ${data.skills.totalCount || data.skills.count || 0})`);
      
      // Low priority
      if (!criteria.education_entries_count.value) improvements.push('Add education information');
      if (!criteria.location_exists.value) improvements.push('Add your location to appear in local searches');
      if (!criteria.has_custom_banner.value) improvements.push('Add custom background banner');
      if (!criteria.pinned_skills_count.value) improvements.push('Pin your top 3 skills');
      if (!criteria.recommendations_count.value) improvements.push('Get at least one recommendation');
      
      // Minimal priority
      if (!criteria.certifications_count.value) improvements.push('Add certifications');
      if (!criteria.projects_count.value) improvements.push('Add projects');
      if (!criteria.featured_section.value) improvements.push('Add Featured section with posts/links');
      if (!criteria.connections_500plus.value) improvements.push('Build network to 500+ connections');
      if (!criteria.recent_activity.value || data.activity.score < 7) {
        if (data.activity.score === 5) improvements.push('Post activity within 3 months for higher engagement');
        else if (data.activity.score === 3) improvements.push('Post activity within 3 months for higher engagement');
        else if (data.activity.score === 1) improvements.push('Post recent activity (within 6 months) for better visibility');
        else improvements.push('Add recent activity to show engagement');
      }
      
      return {
        score,
        criticalMissing: missing,
        improvements,
        isOptimized: score >= 85
      };
    }
  };
  
  // ============= Experience Section Extractor Module =============
  const ExperienceExtractor = {
    async extract() {
      console.log('[EXTRACT-LOG] Starting Experience extraction...');
      
      const section = document.getElementById('experience')?.closest('section');
      if (!section) {
        console.log('[EXTRACT-LOG] Experience section not found');
        return { exists: false, experiences: [], totalCount: 0 };
      }
      
      // Check for "Show all" button for experiences
      const showAllButton = section.querySelector('button[aria-label*="Show all"][aria-label*="experience"]');
      
      if (showAllButton && !showAllButton.disabled) {
        // Click to expand all experiences
        console.log('[EXTRACT-LOG] Clicking "Show all experiences" button...');
        showAllButton.click();
        
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if modal opened
        const modal = document.querySelector('.artdeco-modal');
        if (modal) {
          console.log('[EXTRACT-LOG] Experience modal opened, extracting all experiences...');
          // Extract from modal
          const modalExperiences = [];
          const modalItems = modal.querySelectorAll('.pvs-entity, li.artdeco-list__item');
          
          for (const item of modalItems) {
            const experience = this.extractExperienceItem(item);
            if (experience.title) {
              modalExperiences.push(experience);
            }
          }
          
          // Close modal
          const closeButton = modal.querySelector('button[aria-label*="Dismiss"]');
          if (closeButton) closeButton.click();
          
          console.log(`[EXTRACT-LOG] Extracted ${modalExperiences.length} experiences from modal`);
          modalExperiences.forEach((exp, idx) => {
            console.log(`[EXTRACT-LOG] Experience ${idx + 1}:`, {
              title: exp.title,
              company: exp.company,
              duration: exp.duration,
              hasDescription: !!exp.description,
              descriptionLength: exp.description?.length || 0
            });
          });
          
          return {
            exists: true,
            experiences: modalExperiences,
            totalCount: modalExperiences.length,
            fromModal: true
          };
        }
      }
      
      // Fallback to visible experiences
      const experiences = [];
      const experienceItems = section.querySelectorAll('.pvs-entity, li.artdeco-list__item');
      
      for (const item of experienceItems) {
        // Skip footer items
        if (item.querySelector('.pvs-list__footer-wrapper')) continue;
        
        const experience = this.extractExperienceItem(item);
        if (experience.title) {
          experiences.push(experience);
        }
      }
      
      const result = {
        exists: experiences.length > 0,
        experiences: experiences,
        totalCount: experiences.length,
        hasDetailsPage: !!showAllButton,
        fromDetailsPage: false
      };
      
      console.log(`[EXTRACT-LOG] Experience extraction complete: ${result.totalCount} experiences found`);
      result.experiences.forEach((exp, idx) => {
        console.log(`[EXTRACT-LOG] Experience ${idx + 1}:`, {
          title: exp.title,
          company: exp.company,
          duration: exp.duration,
          hasDescription: !!exp.description,
          descriptionLength: exp.description?.length || 0,
          hasQuantified: exp.hasQuantifiedAchievement,
          hasTech: exp.hasTechStack
        });
      });
      
      return result;
    },
    
    extractExperienceItem(item) {
      const experience = {
        title: '',
        company: '',
        companyType: '',
        duration: '',
        durationMonths: 0,
        location: '',
        description: '',
        hasQuantifiedAchievements: false,
        hasHyperlinks: false,
        hasTechStack: false,
        bulletPoints: [],
        keywords: []
      };
      
      // Extract title
      const titleEl = item.querySelector('.t-bold span[aria-hidden="true"]');
      experience.title = titleEl?.textContent?.trim() || '';
      
      // Extract company and type (Full-time, Contract, etc)
      const companyInfoEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
      if (companyInfoEl) {
        const companyText = companyInfoEl.textContent || '';
        const parts = companyText.split(' · ');
        experience.company = parts[0]?.trim() || '';
        experience.companyType = parts[1]?.trim() || '';
      }
      
      // Extract duration and calculate months
      const durationEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
      if (durationEl) {
        const durationText = durationEl.textContent || '';
        experience.duration = durationText.split(' · ')[0]?.trim() || '';
        
        // Calculate duration in months
        const yearMatch = durationText.match(/(\d+)\s*yr/);
        const monthMatch = durationText.match(/(\d+)\s*mo/);
        if (yearMatch) experience.durationMonths += parseInt(yearMatch[1]) * 12;
        if (monthMatch) experience.durationMonths += parseInt(monthMatch[1]);
      }
      
      // Extract location
      const locationSpans = item.querySelectorAll('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
      if (locationSpans.length > 1) {
        const locationText = locationSpans[locationSpans.length - 1].textContent || '';
        const locationPart = locationText.split(' · ').pop()?.trim() || '';
        if (locationPart && !locationPart.match(/\d+\s*(yr|mo)/)) {
          experience.location = locationPart;
        }
      }
      
      // Extract description - multiple possible selectors
      const descriptionSelectors = [
        '.pvs-list__outer-container .t-14.t-normal.t-black',
        '.pvs-list__paged-list-item div[class*="t-14 t-normal t-black"] span[aria-hidden="true"]',
        '.pvs-entity__extra-details span[aria-hidden="true"]',
        '.pvs-list__outer-container span.visually-hidden + span'
      ];
      
      let descriptionText = '';
      for (const selector of descriptionSelectors) {
        const el = item.querySelector(selector);
        if (el && el.textContent && el.textContent.length > 50) {
          descriptionText = el.textContent.trim();
          break;
        }
      }
      
      if (descriptionText) {
        experience.description = descriptionText;
        
        // Check for quantified achievements (expanded pattern)
        const quantifiedPattern = /\d+[%+,kKmMbB$]*\s*(revenue|users|customers|clients|projects|growth|increase|decrease|ROI|saved|generated|delivered|managed|led|million|billion|thousand|reduction|improvement|sales|conversion|efficiency|hours|days|weeks|months|team|members|budget|cost)/gi;
        experience.hasQuantifiedAchievements = quantifiedPattern.test(descriptionText);
        
        // Check for tech stack keywords
        const techPattern = /\b(React|Angular|Vue|Node|Python|Java|JavaScript|TypeScript|AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git|SQL|NoSQL|MongoDB|PostgreSQL|Redis|Kafka|REST|GraphQL|API|Microservices|CI\/CD|Agile|Scrum)\b/gi;
        const techMatches = descriptionText.match(techPattern);
        experience.hasTechStack = !!techMatches;
        if (techMatches) {
          experience.keywords = [...new Set(techMatches.map(k => k.toLowerCase()))];
        }
        
        // Check for hyperlinks
        experience.hasHyperlinks = !!item.querySelector('a[href]:not([href*="linkedin.com"]):not([href*="/in/"])');
        
        // Extract bullet points if formatted
        const bullets = descriptionText.split(/(?:^|\n)\s*[•·\-✓]\s+/).filter(b => b.trim().length > 20);
        if (bullets.length > 1) {
          experience.bulletPoints = bullets.map(b => b.trim().replace(/\n/g, ' '));
        } else {
          // Try splitting by double line breaks
          const paragraphs = descriptionText.split(/\n\n+/).filter(p => p.trim().length > 20);
          if (paragraphs.length > 1) {
            experience.bulletPoints = paragraphs.map(p => p.trim().replace(/\n/g, ' '));
          }
        }
      }
      
      return experience;
    },
    
    async analyze(experienceData, settings) {
      if (!experienceData.experiences || experienceData.experiences.length === 0) return null;
      
      const response = await new Promise((resolve) => {
        safeSendMessage({
          action: 'analyzeSection',
          section: 'experience',
          data: experienceData,
          settings: settings
        }, resolve);
      });
      
      return response;
    }
  };
  
  // ============= Skills Section Extractor Module =============
  const SkillsExtractor = {
    async extract() {
      console.log('[EXTRACT-LOG] Starting Skills extraction...');
      
      const section = document.querySelector('[data-view-name="profile-card"][id*="skills"]')?.closest('section') ||
                     document.querySelector('div[id*="skills"]')?.closest('section') ||
                     Array.from(document.querySelectorAll('section')).find(s => {
                       const h2 = s.querySelector('h2');
                       return h2 && h2.textContent?.includes('Skills');
                     });
                     
      if (!section) {
        console.log('[EXTRACT-LOG] Skills section not found');
        return { exists: false, skills: [], totalCount: 0 };
      }
      
      // Check for "Show all" button
      const showAllButton = section.querySelector('button[aria-label*="Show all"][aria-label*="skill"]');
      
      if (showAllButton && !showAllButton.disabled) {
        // Click to expand all skills
        console.log('[EXTRACT-LOG] Clicking "Show all skills" button...');
        showAllButton.click();
        
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if modal opened
        const modal = document.querySelector('.artdeco-modal');
        if (modal) {
          console.log('[EXTRACT-LOG] Skills modal opened, extracting all skills...');
          // Extract from modal
          const modalSkills = [];
          const modalItems = modal.querySelectorAll('.pvs-entity, li.artdeco-list__item');
          
          for (const item of modalItems) {
            const skill = this.extractSkillItem(item);
            if (skill.name && !modalSkills.some(s => s.name === skill.name)) {
              modalSkills.push(skill);
            }
          }
          
          // Close modal
          const closeButton = modal.querySelector('button[aria-label*="Dismiss"]');
          if (closeButton) closeButton.click();
          
          console.log(`[EXTRACT-LOG] Extracted ${modalSkills.length} skills from modal`);
          const top5Skills = modalSkills.slice(0, 5);
          top5Skills.forEach((skill, idx) => {
            console.log(`[EXTRACT-LOG] Skill ${idx + 1}: ${skill.name} (${skill.endorsements} endorsements)`);
          });
          
          return {
            exists: true,
            skills: modalSkills,
            totalCount: modalSkills.length,
            visibleCount: modalSkills.length,
            hasEndorsements: modalSkills.some(s => s.endorsements > 0),
            fromModal: true
          };
        }
      }
      
      // Fallback to visible skills
      const skills = [];
      const skillItems = section.querySelectorAll('.pvs-entity, li.artdeco-list__item, [data-view-name="profile-component-entity"]');
      
      for (const item of skillItems) {
        // Skip footer items
        if (item.querySelector('.pvs-list__footer-wrapper')) continue;
        
        const skill = this.extractSkillItem(item);
        if (skill.name) {
          skills.push(skill);
        }
      }
      
      // Get total count from "Show all" button if available
      let totalCount = skills.length;
      if (showAllButton) {
        const text = showAllButton.textContent || '';
        const match = text.match(/Show all (\d+) skill/i);
        if (match) totalCount = parseInt(match[1]);
      }
      
      const result = {
        exists: skills.length > 0,
        skills: skills,
        visibleCount: skills.length,
        totalCount: totalCount,
        hasDetailsPage: !!showAllButton,
        hasEndorsements: skills.some(s => s.endorsements > 0),
        fromDetailsPage: false
      };
      
      console.log(`[EXTRACT-LOG] Skills extraction complete: ${result.visibleCount} visible, ${result.totalCount} total`);
      const top5Skills = result.skills.slice(0, 5);
      top5Skills.forEach((skill, idx) => {
        console.log(`[EXTRACT-LOG] Skill ${idx + 1}: ${skill.name} (${skill.endorsements} endorsements)`);
      });
      
      return result;
    },
    
    extractSkillItem(item) {
      const skill = {
        name: '',
        endorsements: 0,
        endorsers: [],
        hasRecentEndorsements: false,
        isPinned: false,
        category: '',
        proficiencyLevel: ''
      };
      
      // Extract skill name - multiple possible selectors
      const nameSelectors = [
        '.t-bold span[aria-hidden="true"]',
        '.pvs-entity__path-node span[aria-hidden="true"]',
        '[data-field="skill_card_skill_topic"] span',
        '.pvs-list__item-text span:first-child'
      ];
      
      for (const selector of nameSelectors) {
        const nameEl = item.querySelector(selector);
        if (nameEl && nameEl.textContent) {
          skill.name = nameEl.textContent.trim();
          break;
        }
      }
      
      // Extract endorsement count - improved pattern matching
      const endorsementSelectors = [
        '.t-14.t-normal span[aria-hidden="true"]',
        '.pvs-entity__caption-wrapper span',
        '[data-field="skill_endorsement_count"]'
      ];
      
      for (const selector of endorsementSelectors) {
        const endorsementEl = item.querySelector(selector);
        if (endorsementEl) {
          const text = endorsementEl.textContent || '';
          // Multiple patterns for endorsement counts
          const patterns = [
            /(\d+)\s*endorsements?/i,
            /(\d+)\s*people?\s*endorsed/i,
            /Endorsed\s*by\s*(\d+)/i,
            /(\d+)\s*\+?/  // Just a number
          ];
          
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              skill.endorsements = parseInt(match[1]);
              break;
            }
          }
          if (skill.endorsements > 0) break;
        }
      }
      
      // Check if skill is pinned (top skills)
      const isPinnedEl = item.querySelector('[aria-label*="pinned"]') || 
                         item.querySelector('.artdeco-badge--accent');
      skill.isPinned = !!isPinnedEl;
      
      // Extract category if available
      const categoryEl = item.querySelector('.pvs-entity__sub-components span') ||
                        item.querySelector('.t-12.t-black--light');
      if (categoryEl) {
        const categoryText = categoryEl.textContent || '';
        // Common LinkedIn skill categories
        const categories = ['Industry Knowledge', 'Tools & Technologies', 'Interpersonal Skills', 
                          'Other Skills', 'Languages'];
        for (const cat of categories) {
          if (categoryText.includes(cat)) {
            skill.category = cat;
            break;
          }
        }
      }
      
      // Check for endorser details (if expanded view)
      const endorserLinks = item.querySelectorAll('a[href*="/in/"]:not([href*="skill-details"])');
      endorserLinks.forEach(link => {
        // Skip the main profile link
        if (link.closest('.pvs-entity__image')) return;
        
        const nameSpan = link.querySelector('span[aria-hidden="true"]');
        if (nameSpan) {
          const name = nameSpan.textContent?.trim();
          if (name && !name.includes('endorsement') && !name.includes('people')) {
            skill.endorsers.push(name);
          }
        }
      });
      
      // Check for recent endorsements - improved detection
      const recentIndicators = [
        item.querySelector('.artdeco-badge--accent'), // NEW badge
        item.querySelector('[aria-label*="recent"]'),
        item.querySelector('.t-12.t-black--light')
      ];
      
      for (const indicator of recentIndicators) {
        if (indicator) {
          const text = indicator.textContent || indicator.getAttribute('aria-label') || '';
          // Check various recency patterns
          if (text.includes('NEW') || 
              text.includes('recent') ||
              text.match(/\d+\s*(day|week)s?\s*ago/i) ||
              (text.match(/(\d+)\s*months?\s*ago/i) && parseInt(RegExp.$1) <= 6)) {
            skill.hasRecentEndorsements = true;
            break;
          }
        }
      }
      
      // Extract proficiency level if shown (some profiles have this)
      const proficiencyEl = item.querySelector('[aria-label*="proficiency"]') ||
                           item.querySelector('.pvs-entity__supplementary-info');
      if (proficiencyEl) {
        const profText = proficiencyEl.textContent || '';
        if (profText.match(/expert|advanced|intermediate|beginner/i)) {
          skill.proficiencyLevel = profText.match(/expert|advanced|intermediate|beginner/i)[0];
        }
      }
      
      return skill;
    },
    
    async analyze(skillsData, settings) {
      if (!skillsData.skills || skillsData.skills.length === 0) return null;
      
      const response = await new Promise((resolve) => {
        safeSendMessage({
          action: 'analyzeSection',
          section: 'skills',
          data: skillsData,
          settings: settings
        }, resolve);
      });
      
      return response;
    }
  };
  
  // ============= Profile Extractor Module (Simplified) =============
  const ProfileExtractor = {
    // Extractor registry for future modular approach
    extractors: {
      about: AboutExtractor,
      experience: ExperienceExtractor,
      skills: SkillsExtractor
    },
    
    // Store sections with detailsUrls for deep extraction
    deepExtractionTargets: new Set(),
    
    async extract() {
      // First run discovery for quick counts
      const discoveryData = ProfileSectionDiscovery.discoverSections();
      const completenessResult = ProfileCompletenessCalculator.calculate(discoveryData);
      
      // Then run deep extraction for sections with extractors
      const deepData = {};
      
      // Run the actual extractors for full data
      if (this.extractors.about) {
        try {
          deepData.about = await this.extractors.about.extract();
        } catch (err) {
          console.error('About extraction error:', err);
          deepData.about = discoveryData.about;
        }
      }
      
      if (this.extractors.experience) {
        try {
          deepData.experience = await this.extractors.experience.extract();
        } catch (err) {
          console.error('Experience extraction error:', err);
          deepData.experience = discoveryData.experience;
        }
      }
      
      if (this.extractors.skills) {
        try {
          deepData.skills = await this.extractors.skills.extract();
        } catch (err) {
          console.error('Skills extraction error:', err);
          deepData.skills = discoveryData.skills;
        }
      }
      
      // Merge discovery data with deep extraction data
      const finalData = {
        ...discoveryData,
        ...deepData,
        completeness: completenessResult.score,
        deepExtractionAvailable: true
      };
      
      return finalData;
    },
    
    // Base extractor methods that can be shared
    async waitForElement(selector, timeout = 2000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const element = document.querySelector(selector);
        if (element) return element;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return null;
    },
    
    async clickShowAll(section, keyword) {
      const button = section.querySelector(`button[aria-label*="Show all"][aria-label*="${keyword}"]`);
      if (button) {
        button.click();
        await this.waitForElement('.artdeco-modal', 1000);
        return true;
      }
      return false;
    }
  };
  
  /* ============================================
   * SECTION 7: UI COMPONENTS
   * Badge, overlay, and other UI elements
   * ============================================ */
  
  // Badge Injection
  async function injectScoreBadge() {
    console.log('injectScoreBadge called');
    
    // Debug: Check if chrome.runtime.getURL is available
    if (chrome?.runtime?.getURL) {
      console.log('Scanner URL:', chrome.runtime.getURL('content/extractors/scanner.js'));
    } else {
      console.error('chrome.runtime.getURL not available');
    }
    
    if (ExtensionState.badgeInjected) {
      console.log('Badge already injected');
      return;
    }
    
    // Remove existing badges
    document.querySelectorAll('[id^="elevateli-score"]').forEach(el => el.remove());
    ExtensionState.badgeInjected = false;
    
    // Check AI configuration
    const settings = await new Promise(resolve => {
      safeStorageGet(['aiProvider', 'apiKey'], resolve);
    });
    
    // Continue even if AI not configured - we'll show link in badge
    const hasApiKey = !!(settings.aiProvider && settings.apiKey);
    if (!hasApiKey) {
      console.log('AI not configured - will show in badge');
    }
    
    // Find insertion point
    const actionsArea = document.querySelector('.pvs-profile-actions--overflow') || 
                       document.querySelector('.pv-top-card-v2-ctas__custom');
    
    if (!actionsArea) {
      console.log('Profile actions area not found');
      return;
    }
    
    const isOwn = await isOwnProfile();
    
    // Create badge
    const scoreBadge = document.createElement('button');
    scoreBadge.id = 'elevateli-score';
    scoreBadge.className = 'artdeco-button artdeco-button--2 artdeco-button--secondary';
    scoreBadge.style.cssText = `
    background: ${isOwn ? '#057642' : '#0077B5'} !important;
    color: white !important;
    border: none !important;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    
    // Create badge content using DOM methods for security
    const badgeContent = document.createElement('span');
    badgeContent.className = 'artdeco-button__text';
    badgeContent.style.cssText = 'display: flex; flex-direction: column; align-items: center; line-height: 1.2;';
    
    const completenessDiv = document.createElement('div');
    completenessDiv.id = 'badge-completeness';
    completenessDiv.style.cssText = 'font-weight: 600;';
    completenessDiv.textContent = 'Loading...';
    
    const aiStatusDiv = document.createElement('div');
    aiStatusDiv.id = 'badge-ai-status';
    aiStatusDiv.style.cssText = 'font-size: 0.85em; opacity: 0.9;';
    aiStatusDiv.textContent = 'Checking AI...';
    
    badgeContent.appendChild(completenessDiv);
    badgeContent.appendChild(aiStatusDiv);
    scoreBadge.appendChild(badgeContent);
    scoreBadge.title = isOwn ? 'Click to show/hide detailed analysis' : 'View full report';
    
    // Hover effects
    scoreBadge.onmouseover = () => scoreBadge.style.opacity = '0.8';
    scoreBadge.onmouseout = () => scoreBadge.style.opacity = '1';
    
    // Insert badge
    const resourcesButton = actionsArea.querySelector('button[aria-label="Resources"]') ||
                           actionsArea.querySelector('button:last-of-type');
    
    if (resourcesButton && resourcesButton.parentElement) {
      // Create a wrapper to avoid whitespace issues
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display: inline-block; margin-left: 8px;';
      wrapper.appendChild(scoreBadge);
      resourcesButton.parentElement.insertAdjacentElement('afterend', wrapper);
    } else {
      actionsArea.appendChild(scoreBadge);
    }
    
    ExtensionState.badgeInjected = true;
    
    // Add click handler
    const scoreBadgeClickHandler = async function() {
      if (isOwn) {
        const existingOverlay = document.getElementById('elevateli-overlay');
        if (existingOverlay) {
          // Toggle collapsed state instead of show/hide
          const isCollapsed = existingOverlay.getAttribute('data-collapsed') === 'true';
          if (isCollapsed) {
            existingOverlay.setAttribute('data-collapsed', 'false');
            existingOverlay.querySelector('#analysis-content').style.display = 'block';
            existingOverlay.querySelector('#minimize-analysis').textContent = 'Minimize';
            existingOverlay.style.transition = 'all 0.3s ease';
            existingOverlay.style.maxHeight = '2000px';
            // Update badge color
            scoreBadge.style.background = '#057642 !important';
            // Save state
            safeStorageSet({ overlayCollapsed: false });
          } else {
            existingOverlay.setAttribute('data-collapsed', 'true');
            existingOverlay.querySelector('#analysis-content').style.display = 'none';
            existingOverlay.querySelector('#minimize-analysis').textContent = 'Expand';
            existingOverlay.style.transition = 'all 0.3s ease';
            existingOverlay.style.maxHeight = '80px';
            // Update badge color to indicate minimized
            scoreBadge.style.background = '#e68900 !important';
            // Save state
            safeStorageSet({ overlayCollapsed: true });
          }
        } else {
          // Re-show overlay using last analysis
          safeStorageGet(['lastAnalysis'], (data) => {
            if (data.lastAnalysis && data.lastAnalysis.isPersonal) {
              injectAnalysisOverlay({
                contentScore: data.lastAnalysis.contentScore,
                completeness: data.lastAnalysis.completeness,
                summary: data.lastAnalysis.summary
              });
            }
          });
        }
      } else {
        // Not own profile - open dashboard
        safeSendMessage({action: 'showSuggestions'});
      }
    };
    
    addManagedEventListener(scoreBadge, 'click', scoreBadgeClickHandler);
    
    // Extract profile and update badge
    await extractAndUpdate(scoreBadge, isOwn);
  }
  
  async function extractAndUpdate(badge, isOwn) {
  // Throttle extraction
  const now = Date.now();
  if (ExtensionState.lastExtraction && (now - ExtensionState.lastExtraction) < 5000) {
    console.log('Extraction throttled');
    return;
  }
  
  ExtensionState.lastExtraction = now;
  ExtensionState.isExtracting = true;
  
  // Check AI settings and cache first
  const storageData = await new Promise(resolve => {
    safeStorageGet(['aiProvider', 'apiKey', 'enableAI', 'lastAnalysis', 'enableCache', 'cacheDuration'], resolve);
  });
  
  const hasApiKey = !!(storageData.aiProvider && storageData.apiKey);
  const aiEnabled = storageData.enableAI !== false;
  const cacheEnabled = storageData.enableCache !== false;
  const cacheDuration = storageData.cacheDuration || 7;
  
  // Check if we have valid cached data for own profile
  if (storageData.lastAnalysis && isOwn) {
    const cacheAge = Date.now() - new Date(storageData.lastAnalysis.timestamp).getTime();
    const maxCacheAge = cacheDuration * 24 * 60 * 60 * 1000; // days to ms
    
    if (cacheEnabled && cacheAge < maxCacheAge && storageData.lastAnalysis.contentScore) {
      console.log('Using cached analysis data - skipping extraction');
      
      // Just run quick discovery for current completeness
      try {
        const discoveryData = ProfileSectionDiscovery.discoverSections();
        const completenessResult = ProfileCompletenessCalculator.calculate(discoveryData);
        
        // Update badge with cached data and current completeness
        ExtensionState.lastCompletenessScore = completenessResult.score;
        updateBadgeCompleteness(completenessResult.score);
        updateBadgeAIStatus(`Quality: ${storageData.lastAnalysis.contentScore}/10`);
        
        // Show analysis overlay with cached data
        injectAnalysisOverlay({
          contentScore: storageData.lastAnalysis.contentScore,
          completeness: completenessResult.score,
          summary: storageData.lastAnalysis.summary,
          fromCache: true,
          timestamp: storageData.lastAnalysis.timestamp
        });
        
        // Update cache with fresh completeness score
        safeStorageSet({
          lastAnalysis: {
            ...storageData.lastAnalysis,
            completeness: completenessResult.score
          }
        });
        
        ExtensionState.isExtracting = false;
        return; // Exit early - no extraction needed
      } catch (err) {
        console.error('Discovery error:', err);
      }
    }
  }
  
  // Also check cache for non-AI users
  if (!aiEnabled && storageData.lastAnalysis && isOwn) {
    const cacheAge = Date.now() - new Date(storageData.lastAnalysis.timestamp).getTime();
    const maxCacheAge = cacheDuration * 24 * 60 * 60 * 1000;
    
    if (cacheEnabled && cacheAge < maxCacheAge) {
      console.log('AI disabled but using cached data');
      
      // Run discovery for completeness
      try {
        const discoveryData = ProfileSectionDiscovery.discoverSections();
        const completenessResult = ProfileCompletenessCalculator.calculate(discoveryData);
        
        ExtensionState.lastCompletenessScore = completenessResult.score;
        updateBadgeCompleteness(completenessResult.score);
        
        // Show cached quality score if available
        if (storageData.lastAnalysis.contentScore) {
          updateBadgeAIStatus(`Quality: ${storageData.lastAnalysis.contentScore}/10 (cached)`);
          
          injectAnalysisOverlay({
            contentScore: storageData.lastAnalysis.contentScore,
            completeness: completenessResult.score,
            summary: storageData.lastAnalysis.summary,
            fromCache: true,
            timestamp: storageData.lastAnalysis.timestamp
          });
        } else {
          updateBadgeAIStatus('Enable AI for quality score', true, () => {
            safeSendMessage({action: 'openPopup'});
          });
        }
        
        ExtensionState.isExtracting = false;
        return; // Exit early
      } catch (err) {
        console.error('Discovery error:', err);
      }
    }
  }
  
  // No valid cache - proceed with extraction
  try {
    // Run section discovery first (fast)
    const discoveryStartTime = performance.now();
    try {
      const discoveryData = ProfileSectionDiscovery.discoverSections();
      
      // Calculate completeness based on discovery
      const completenessResult = ProfileCompletenessCalculator.calculate(discoveryData);
      console.log('Completeness calculated:', completenessResult);
      
      // Update state and badge
      ExtensionState.lastCompletenessScore = completenessResult.score;
      updateBadgeCompleteness(completenessResult.score);
      
      // Update AI status based on settings
      if (!hasApiKey) {
        updateBadgeAIStatus('Add API key for quality score', true, () => {
          safeSendMessage({action: 'openOptions'});
        });
      } else if (!aiEnabled) {
        updateBadgeAIStatus('Enable AI for quality score', true, () => {
          safeSendMessage({action: 'openPopup'});
        });
      } else {
        updateBadgeAIStatus('Extracting details...');
      }
      
      // Save results
      safeStorageSet({ 
        lastScan: {
          scanData: {
            ...discoveryData,
            meta: {
              profileComplete: completenessResult.score
            }
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Discovery error:', err);
    }
    
    // Only run full extraction if AI is enabled and we have API key
    if (aiEnabled && hasApiKey) {
      try {
        const extractionStartTime = performance.now();
        const profileData = await ProfileExtractor.extract();
      
      // Save extraction results immediately
      safeStorageSet({
        lastAnalysis: {
          profileData: profileData,
          timestamp: new Date().toISOString(),
          isPersonal: isOwn
        }
      });
      
      // Use scanner's completeness if extraction didn't get it
      const completeness = profileData.completeness || ExtensionState.lastCompletenessScore;
      ExtensionState.isExtracting = false;
      
      // Update badge with AI analysis status
      // Show different status based on whether AI is enabled
      if (!hasApiKey) {
        updateBadgeAIStatus('Add API key for quality score', true, () => {
          safeSendMessage({action: 'openPopup'});
        });
      } else if (!aiEnabled) {
        updateBadgeAIStatus('Checking cache...');
      } else {
        updateBadgeAIStatus('Analyzing quality...');
      }
      
      // Request AI analysis (will return cached results if AI is disabled)
      safeSendMessage({action: 'calculateScore', url: window.location.href}, (response) => {
        if (!response) {
          console.log('Extension unavailable - please refresh the page');
          updateBadgeCompleteness(completeness);
          updateBadgeAIStatus('Error: Extension unavailable');
          return;
        }
        console.log('AI analysis response:', response);
        
        // Check if we have content score (from cache or fresh analysis)
        if (response && response.contentScore) {
          // Update badge with scores
          updateBadgeCompleteness(completeness);
          updateBadgeAIStatus(`Quality: ${response.contentScore}/10`);
          
          // Save AI score for popup sync
          safeStorageSet({
            lastAnalysis: {
              profileData: profileData,  // Include the extracted data
              aiScore: response.contentScore,
              contentScore: response.contentScore,
              completeness: completeness,
              summary: response.summary,
              timestamp: new Date().toISOString(), // Always use current time for consistency
              isPersonal: isOwn,
              aiProvider: response.aiProvider || 'Unknown',
              aiModel: response.aiModel || 'Unknown',
              queryStructure: response.queryStructure || 'Not available',
              fromCache: response.fromCache || false,
              cacheAge: response.cacheAgeFormatted || null
            }
          });
          
          // Show overlay for own profile
          if (isOwn && response.summary) {
            // Update badge with final score
            updateBadgeCompleteness(completeness);
            updateBadgeAIStatus(`Quality: ${response.contentScore}/10`);
            // Show analysis overlay
            addManagedTimeout(() => {
              injectAnalysisOverlay({
                contentScore: response.contentScore,
                completeness: completeness,
                summary: response.summary
              });
            }, 500);
          }
        } else if (response.aiDisabled) {
          // AI is disabled and no cached data
          updateBadgeCompleteness(completeness);
          updateBadgeAIStatus('Enable AI for quality score', true, () => {
            safeSendMessage({action: 'openPopup'});
          });
          // Save completeness without AI score
          safeStorageSet({
            lastAnalysis: {
              profileData: profileData,
              completeness: completeness,
              timestamp: new Date().toISOString(),
              isPersonal: isOwn,
              aiDisabled: true
            }
          });
        } else {
          // No score available
          updateBadgeCompleteness(completeness);
          updateBadgeAIStatus('Error: No analysis available');
        }
      });
      } catch (err) {
      console.error('Extraction error:', err);
      ExtensionState.isExtracting = false;
      updateBadgeCompleteness(ExtensionState.lastCompletenessScore || 0);
      updateBadgeAIStatus('Error analyzing');
      }
    }
  } catch (err) {
    console.error('Extraction error:', err);
    ExtensionState.isExtracting = false;
    updateBadgeCompleteness(ExtensionState.lastCompletenessScore || 0);
    updateBadgeAIStatus('Error analyzing');
  }
}
  
  function updateBadgeText(badge, text) {
    const textElement = badge.querySelector('.artdeco-button__text');
    if (textElement) {
      textElement.textContent = text;
    }
  }
  
  function updateBadgeCompleteness(score) {
    const badge = document.getElementById('elevateli-score');
    if (!badge) return;
    
    const completenessElement = badge.querySelector('#badge-completeness');
    if (completenessElement) {
      completenessElement.textContent = `Completeness: ${score}%`;
    }
  }
  
  // ============= Badge AI Status Update Function =============
  function updateBadgeAIStatus(status, isLink = false, linkAction = null) {
    const badge = document.getElementById('elevateli-score');
    if (!badge) return;
    
    const aiStatusElement = badge.querySelector('#badge-ai-status');
    if (!aiStatusElement) return;
    
    if (isLink && linkAction) {
      // Clear existing content
      aiStatusElement.textContent = '';
      
      // Create link using DOM methods for security
      const link = document.createElement('a');
      link.href = '#';
      link.style.cssText = 'color: white; text-decoration: underline;';
      link.textContent = status;
      link.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        linkAction();
      };
      
      aiStatusElement.appendChild(link);
    } else {
      aiStatusElement.textContent = status;
    }
  }
  
  // ============= Overlay UI Module =============
  function injectAnalysisOverlay(analysisData) {
    const existingOverlay = document.getElementById('elevateli-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    const targetElement = document.querySelector('.pv-top-card-v2-ctas') ||
                         document.querySelector('.pv-top-card__actions') ||
                         document.querySelector('.pvs-profile-actions') ||
                         document.querySelector('.pv-top-card') ||
                         document.querySelector('section.pv-top-card-section') ||
                         document.querySelector('main section:first-child');
    
    if (!targetElement) {
      console.log('ElevateLI: Could not find target element for overlay');
      return;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'elevateli-overlay';
    overlay.style.cssText = `
      margin: 12px 0;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      position: relative;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      z-index: 10;
    `;
    
    // Create overlay content with recommendations
    safeStorageGet(['lastAnalysis'], (data) => {
      const lastAnalysis = data.lastAnalysis || {};
      const isFromCache = analysisData.fromCache || lastAnalysis.fromCache || false;
      const analysisTimestamp = analysisData.timestamp || lastAnalysis.timestamp;
      
      // Clear any existing content
      overlay.innerHTML = '';
      
      // Create main header section
      const headerSection = document.createElement('div');
      headerSection.style.cssText = `
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      `;
      
      // Left section - Branding and scores
      const leftSection = document.createElement('div');
      leftSection.style.cssText = 'display: flex; align-items: center; gap: 16px;';
      
      // ElevateLI badge
      const badge = document.createElement('div');
      badge.style.cssText = 'display: flex; align-items: center; gap: 8px; font-weight: 600; color: #0a66c2;';
      
      // Logo
      const logoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      logoSvg.setAttribute('width', '24');
      logoSvg.setAttribute('height', '24');
      logoSvg.setAttribute('viewBox', '0 0 40 40');
      logoSvg.setAttribute('fill', 'none');
      
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', '40');
      rect.setAttribute('height', '40');
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', '#0a66c2');
      logoSvg.appendChild(rect);
      
      const pathE = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathE.setAttribute('d', 'M12 28V12H24V15H15V19H23V22H15V25H24V28H12Z');
      pathE.setAttribute('fill', 'white');
      logoSvg.appendChild(pathE);
      
      const pathL = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathL.setAttribute('d', 'M28 28V12H31V25H35V28H28Z');
      pathL.setAttribute('fill', 'white');
      logoSvg.appendChild(pathL);
      
      badge.appendChild(logoSvg);
      badge.appendChild(document.createTextNode('ElevateLI'));
      leftSection.appendChild(badge);
      
      // Scores
      const scoresDiv = document.createElement('div');
      scoresDiv.style.cssText = 'display: flex; gap: 12px; font-size: 14px;';
      
      // Completeness
      const completenessDiv = document.createElement('div');
      completenessDiv.innerHTML = `Completeness: <strong style="color: ${analysisData.completeness >= 85 ? '#057642' : '#e68900'}">${analysisData.completeness}%</strong>`;
      scoresDiv.appendChild(completenessDiv);
      
      // Quality score (if available)
      if (analysisData.contentScore) {
        const qualityDiv = document.createElement('div');
        qualityDiv.innerHTML = `Quality: <strong style="color: ${analysisData.contentScore >= 8 ? '#057642' : analysisData.contentScore >= 6 ? '#f59e0b' : '#dc2626'}">${analysisData.contentScore}/10</strong>`;
        scoresDiv.appendChild(qualityDiv);
        
        // Cache indicator
        if (isFromCache && analysisTimestamp) {
          const date = new Date(analysisTimestamp);
          const daysAgo = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
          const cacheText = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
          const cacheDiv = document.createElement('span');
          cacheDiv.style.cssText = 'color: #666; font-size: 12px;';
          cacheDiv.textContent = `(${cacheText})`;
          qualityDiv.appendChild(cacheDiv);
        }
      }
      
      leftSection.appendChild(scoresDiv);
      headerSection.appendChild(leftSection);
      
      // Right section - Actions
      const rightSection = document.createElement('div');
      rightSection.style.cssText = 'display: flex; align-items: center; gap: 12px;';
      
      // Analyze button
      const analyzeBtn = document.createElement('button');
      analyzeBtn.id = 'elevateli-analyze-btn';
      analyzeBtn.style.cssText = `
        padding: 6px 16px;
        background: #0a66c2;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      `;
      analyzeBtn.textContent = isFromCache ? 'Refresh Analysis' : 'Analyze';
      const analyzeBtnMouseOver = () => analyzeBtn.style.background = '#004182';
      const analyzeBtnMouseOut = () => analyzeBtn.style.background = '#0a66c2';
      
      addManagedEventListener(analyzeBtn, 'mouseover', analyzeBtnMouseOver);
      addManagedEventListener(analyzeBtn, 'mouseout', analyzeBtnMouseOut);
      
      // Add click handler for analyze button
      const analyzeBtnClickHandler = () => {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
        // Force fresh analysis by sending message with forceRefresh flag
        safeSendMessage({action: 'calculateScore', url: window.location.href, forceRefresh: true}, (response) => {
          analyzeBtn.disabled = false;
          analyzeBtn.textContent = 'Analyze';
          
          if (!response) {
            console.error('No response from extension service worker');
            // Show error state to user
            analyzeBtn.textContent = 'Error - Retry';
            return;
          }
          
          if (response && response.contentScore) {
            // Update overlay with new data
            const overlayContent = document.getElementById('analysis-summary');
            if (overlayContent) {
              overlayContent.textContent = `Quality: ${response.contentScore}/10 • Completeness: ${response.completeness || ExtensionState.lastCompletenessScore}% • ${response.summary ? response.summary.substring(0, 100) + '...' : 'Analysis complete'}`;
            }
            // Save updated analysis
            safeStorageSet({
              lastAnalysis: {
                ...response,
                timestamp: new Date().toISOString(),
                isPersonal: true
              }
            });
          } else if (response.error) {
            console.error('Analysis error:', response.error);
            analyzeBtn.textContent = 'Error - Retry';
          }
        });
      };
      
      addManagedEventListener(analyzeBtn, 'click', analyzeBtnClickHandler);
      
      rightSection.appendChild(analyzeBtn);
      
      // View Details link
      const detailsLink = document.createElement('a');
      detailsLink.style.cssText = `
        color: #0a66c2;
        text-decoration: none;
        font-size: 14px;
        cursor: pointer;
      `;
      detailsLink.textContent = 'View Details';
      const detailsLinkMouseOver = () => detailsLink.style.textDecoration = 'underline';
      const detailsLinkMouseOut = () => detailsLink.style.textDecoration = 'none';
      
      addManagedEventListener(detailsLink, 'mouseover', detailsLinkMouseOver);
      addManagedEventListener(detailsLink, 'mouseout', detailsLinkMouseOut);
      
      // Open dashboard on click
      const detailsLinkClickHandler = (e) => {
        e.preventDefault();
        if (safeChrome()) {
          chrome.runtime.sendMessage({ action: 'openDashboard' });
        }
      };
      
      addManagedEventListener(detailsLink, 'click', detailsLinkClickHandler);
      
      rightSection.appendChild(detailsLink);
      headerSection.appendChild(rightSection);
      overlay.appendChild(headerSection);
      
      // Add recommendations section if we have analysis data
      if (analysisData.summary || lastAnalysis.summary) {
        const recommendationsSection = document.createElement('div');
        recommendationsSection.style.cssText = `
          border-top: 1px solid #e5e7eb;
          padding: 12px 16px;
          background: #f8f9fa;
          border-radius: 0 0 8px 8px;
        `;
        
        // Parse recommendations from summary
        const summary = analysisData.summary || lastAnalysis.summary || '';
        const recommendations = parseRecommendations(summary);
        
        // Show top 3 recommendations
        const topRecs = recommendations.slice(0, 3);
        if (topRecs.length > 0) {
          const recsTitle = document.createElement('div');
          recsTitle.style.cssText = 'font-weight: 600; color: #1f2937; margin-bottom: 8px; font-size: 14px;';
          recsTitle.textContent = '🎯 Top Recommendations:';
          recommendationsSection.appendChild(recsTitle);
          
          const recsList = document.createElement('div');
          recsList.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
          
          topRecs.forEach((rec, idx) => {
            const recItem = document.createElement('div');
            recItem.style.cssText = `
              font-size: 13px;
              color: #4b5563;
              padding-left: 20px;
              position: relative;
            `;
            
            // Add bullet point
            const bullet = document.createElement('span');
            bullet.style.cssText = 'position: absolute; left: 0; color: #0a66c2; font-weight: 600;';
            bullet.textContent = `${idx + 1}.`;
            recItem.appendChild(bullet);
            
            // Add recommendation text
            const recText = document.createElement('span');
            recText.textContent = rec;
            recItem.appendChild(recText);
            
            recsList.appendChild(recItem);
          });
          
          recommendationsSection.appendChild(recsList);
          
          // Add "View all" link if there are more recommendations
          if (recommendations.length > 3) {
            const viewAllDiv = document.createElement('div');
            viewAllDiv.style.cssText = 'margin-top: 8px; text-align: center;';
            
            const viewAllLink = document.createElement('a');
            viewAllLink.style.cssText = `
              color: #0a66c2;
              text-decoration: none;
              font-size: 13px;
              cursor: pointer;
            `;
            viewAllLink.textContent = `View all ${recommendations.length} recommendations →`;
            viewAllLink.onmouseover = () => viewAllLink.style.textDecoration = 'underline';
            viewAllLink.onmouseout = () => viewAllLink.style.textDecoration = 'none';
            viewAllLink.onclick = (e) => {
              e.preventDefault();
              if (safeChrome()) {
                chrome.runtime.sendMessage({ action: 'openDashboard' });
              }
            };
            
            viewAllDiv.appendChild(viewAllLink);
            recommendationsSection.appendChild(viewAllDiv);
          }
        }
        
        overlay.appendChild(recommendationsSection);
      }
    });
    
    targetElement.insertAdjacentElement('afterend', overlay);
  }
  
  function parseRecommendations(summary) {
    if (!summary) return [];
    
    const recommendations = [];
    
    // Look for Critical Actions section
    const criticalMatch = summary.match(/\*\*Critical Actions:\*\*\n([\s\S]+?)(?=\*\*|$)/);
    if (criticalMatch) {
      const criticalLines = criticalMatch[1].split('\n');
      criticalLines.forEach(line => {
        // Match numbered items with action description
        const match = line.match(/^\d+\.\s*([^:]+):\s*(.+)/);
        if (match) {
          recommendations.push(match[2].trim());
        }
      });
    }
    
    // If no structured format, fallback to numbered items
    if (recommendations.length === 0) {
      const lines = summary.split('\n');
      let currentRec = '';
      
      lines.forEach(line => {
        if (line.match(/^\d+\./)) {
          if (currentRec) recommendations.push(currentRec.trim());
          currentRec = line.replace(/^\d+\.\s*/, '');
        } else if (currentRec && line.trim() && !line.match(/^(Why|How):/)) {
          currentRec += ' ' + line.trim();
        }
      });
      if (currentRec) recommendations.push(currentRec.trim());
    }
    
    return recommendations;
  }
  
  function getCompletenessIssues(scanData) {
    if (!scanData) return [];
    const issues = [];
    
    // High priority - Must have
    if (!scanData.photo?.exists) issues.push({
      priority: 'high', 
      text: 'Add professional profile photo',
      action: 'Click your photo placeholder → Upload photo',
      effort: '2 min',
      points: 15
    });
    if (!scanData.experience?.count) issues.push({
      priority: 'high', 
      text: 'Add at least one experience',
      action: 'Profile → Add profile section → Experience',
      effort: '5 min',
      points: 20
    });
    
    // Medium priority - Important
    if (scanData.headline?.charCount < 100) issues.push({
      priority: 'medium', 
      text: `Expand headline (${scanData.headline?.charCount || 0}/100+ chars)`,
      action: 'Click pencil next to your name → Add keywords',
      effort: '2 min',
      points: 10
    });
    if (scanData.about?.charCount < 800) issues.push({
      priority: 'medium', 
      text: `Expand About section (${scanData.about?.charCount || 0}/800+ chars)`,
      action: 'About → pencil icon → Write 2-3 paragraphs',
      effort: '10 min',
      points: 10
    });
    if ((scanData.skills?.totalCount || 0) < 15) issues.push({
      priority: 'medium', 
      text: `Add more skills (${scanData.skills?.totalCount || 0}/15+)`,
      action: 'Skills → Add skill → Select from suggestions',
      effort: '5 min',
      points: 10
    });
    if (scanData.experience?.count === 1) issues.push({
      priority: 'medium',
      text: 'Add second experience (2+ recommended)',
      action: 'Experience → + icon → Add position',
      effort: '5 min',
      points: 10
    });
    
    // Low priority - Nice to have
    if (!scanData.education?.count) issues.push({
      priority: 'low', 
      text: 'Add education',
      action: 'Add profile section → Education',
      effort: '3 min',
      points: 5
    });
    if (!scanData.location?.exists) issues.push({
      priority: 'low', 
      text: 'Add location',
      action: 'Contact info → Edit → Location',
      effort: '1 min',
      points: 5
    });
    if (!scanData.featured?.exists) issues.push({
      priority: 'low', 
      text: 'Add Featured content',
      action: 'Add profile section → Featured → Add post/link',
      effort: '2 min',
      points: 5
    });
    if (!scanData.backgroundBanner?.exists) issues.push({
      priority: 'low',
      text: 'Add background banner',
      action: 'Click camera icon on banner area',
      effort: '2 min',
      points: 5
    });
    
    return issues;
  }
  
  function formatCompletenessIssues(issues) {
    if (!issues.length) return document.createDocumentFragment();
    
    const highPriority = issues.filter(i => i.priority === 'high');
    const mediumPriority = issues.filter(i => i.priority === 'medium');
    const lowPriority = issues.filter(i => i.priority === 'low');
    
    // Calculate total points and progress
    const totalPossiblePoints = issues.reduce((sum, i) => sum + i.points, 0);
    
    const container = document.createElement('div');
    container.style.cssText = 'font-size: 12px; color: #666;';
    
    // Progress indicator
    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = 'margin-bottom: 6px; font-size: 11px; color: #915a00;';
    progressDiv.textContent = `+${totalPossiblePoints} points available • Est. ${calculateTotalTime(issues)} to complete`;
    container.appendChild(progressDiv);
    
    // High priority with actions
    if (highPriority.length) {
      const highDiv = document.createElement('div');
      highDiv.style.cssText = 'margin-bottom: 6px; padding: 6px; background: #fff3e0; border-radius: 4px;';
      
      const highTitle = document.createElement('div');
      highTitle.style.cssText = 'font-weight: 600; color: #d13212; margin-bottom: 2px; font-size: 12px;';
      highTitle.textContent = '🔴 Critical (Must Have):';
      highDiv.appendChild(highTitle);
      
      highPriority.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'margin-bottom: 4px;';
        
        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'font-weight: 500; color: #333; font-size: 12px;';
        textDiv.textContent = item.text + ' ';
        const pointsSpan = document.createElement('span');
        pointsSpan.style.cssText = 'color: #057642; font-size: 10px;';
        pointsSpan.textContent = `+${item.points}pts`;
        textDiv.appendChild(pointsSpan);
        
        const actionDiv = document.createElement('div');
        actionDiv.style.cssText = 'font-size: 11px; color: #666; margin-left: 12px;';
        actionDiv.textContent = `→ ${item.action} `;
        const effortSpan = document.createElement('span');
        effortSpan.style.cssText = 'color: #999;';
        effortSpan.textContent = `(${item.effort})`;
        actionDiv.appendChild(effortSpan);
        
        itemDiv.appendChild(textDiv);
        itemDiv.appendChild(actionDiv);
        highDiv.appendChild(itemDiv);
      });
      container.appendChild(highDiv);
    }
    
    // Medium priority with actions
    if (mediumPriority.length) {
      const medDiv = document.createElement('div');
      medDiv.style.cssText = 'margin-bottom: 6px; padding: 6px; background: #fffbf0; border-radius: 4px;';
      
      const medTitle = document.createElement('div');
      medTitle.style.cssText = 'font-weight: 600; color: #915a00; margin-bottom: 2px; font-size: 12px;';
      medTitle.textContent = '🟡 Important:';
      medDiv.appendChild(medTitle);
      
      mediumPriority.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'margin-bottom: 4px;';
        
        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'font-weight: 500; color: #333; font-size: 12px;';
        textDiv.textContent = item.text + ' ';
        const pointsSpan = document.createElement('span');
        pointsSpan.style.cssText = 'color: #057642; font-size: 10px;';
        pointsSpan.textContent = `+${item.points}pts`;
        textDiv.appendChild(pointsSpan);
        
        const actionDiv = document.createElement('div');
        actionDiv.style.cssText = 'font-size: 11px; color: #666; margin-left: 12px;';
        actionDiv.textContent = `→ ${item.action} `;
        const effortSpan = document.createElement('span');
        effortSpan.style.cssText = 'color: #999;';
        effortSpan.textContent = `(${item.effort})`;
        actionDiv.appendChild(effortSpan);
        
        itemDiv.appendChild(textDiv);
        itemDiv.appendChild(actionDiv);
        medDiv.appendChild(itemDiv);
      });
      container.appendChild(medDiv);
    }
    
    // Low priority - collapsible
    if (lowPriority.length) {
      const details = document.createElement('details');
      details.style.cssText = 'margin-bottom: 4px;';
      
      const summary = document.createElement('summary');
      summary.style.cssText = 'cursor: pointer; font-weight: 600; color: #666; margin-bottom: 2px; font-size: 12px;';
      summary.textContent = '🟢 Nice to Have (click to expand)';
      details.appendChild(summary);
      
      const lowDiv = document.createElement('div');
      lowDiv.style.cssText = 'padding: 6px; background: #f8f9fa; border-radius: 4px; margin-top: 4px;';
      
      lowPriority.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'margin-bottom: 4px;';
        
        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'color: #333; font-size: 12px;';
        textDiv.textContent = item.text + ' ';
        const pointsSpan = document.createElement('span');
        pointsSpan.style.cssText = 'color: #057642; font-size: 10px;';
        pointsSpan.textContent = `+${item.points}pts`;
        textDiv.appendChild(pointsSpan);
        
        const actionDiv = document.createElement('div');
        actionDiv.style.cssText = 'font-size: 11px; color: #666; margin-left: 12px;';
        actionDiv.textContent = `→ ${item.action} `;
        const effortSpan = document.createElement('span');
        effortSpan.style.cssText = 'color: #999;';
        effortSpan.textContent = `(${item.effort})`;
        actionDiv.appendChild(effortSpan);
        
        itemDiv.appendChild(textDiv);
        itemDiv.appendChild(actionDiv);
        lowDiv.appendChild(itemDiv);
      });
      
      details.appendChild(lowDiv);
      container.appendChild(details);
    }
    
    return container;
  }
  
  function calculateTotalTime(issues) {
    let totalMinutes = 0;
    issues.forEach(item => {
      const match = item.effort.match(/(\d+)\s*min/);
      if (match) totalMinutes += parseInt(match[1]);
    });
    return totalMinutes < 60 ? `${totalMinutes} min` : `${Math.round(totalMinutes / 60)} hour${totalMinutes >= 120 ? 's' : ''}`;
  }
  
  function formatRecommendations(recommendations) {
    if (!recommendations.length) return document.createDocumentFragment();
    
    const container = document.createElement('div');
    
    recommendations.forEach((rec, index) => {
      const recDiv = document.createElement('div');
      recDiv.style.cssText = `padding: 4px 0; ${index < recommendations.length - 1 ? 'border-bottom: 1px solid #f3f3f3;' : ''} font-size: 12px; color: #333; line-height: 1.4;`;
      
      // Use createMarkdownElement for safe markdown rendering
      const content = createMarkdownElement(rec);
      recDiv.appendChild(content);
      
      container.appendChild(recDiv);
    });
    
    return container;
  }
  
  /* ============================================
   * SECTION 8: MAIN INITIALIZATION
   * Entry point and orchestration
   * ============================================ */
  
  // ============= Main Orchestrator =============
  async function init() {
    console.log('ElevateLI: Initializing...');
    
    if (!safeChrome()) {
      console.error('Chrome APIs not available - extension context lost');
      return;
    }
    
    if (isProfilePage()) {
      waitForElement('.pvs-profile-actions--overflow, .pv-top-card-v2-ctas__custom', () => {
        addManagedTimeout(() => {
          injectScoreBadge();
          
          // Check if analysis should run on page load
          // DISABLED AUTO-AI: Now requires manual trigger to reduce costs
          /*
          safeStorageGet(['showAnalysis'], async (data) => {
            if (data.showAnalysis && await isOwnProfile()) {
              // Note: Completeness always runs (no AI needed)
              // Running AI analysis since toggle is enabled
              const badge = document.getElementById('elevateli-score');
              if (badge) {
                safeSendMessage({action: 'calculateScore', url: window.location.href});
              }
            }
          });
          */
        }, 200);
      });
    }
    
    observeNavigation();
  }
  
  // Navigation observer
  function observeNavigation() {
    const observer = new MutationObserver(debounce((mutations) => {
      const isOurMutation = mutations.some(m => 
        m.target.id?.includes('linkedin-optimizer') ||
        m.target.closest('#elevateli-overlay') ||
        m.target.closest('#elevateli-score')
      );
      if (isOurMutation) return;
      
      if (location.pathname !== ExtensionState.lastPath) {
        ExtensionState.lastPath = location.pathname;
        ExtensionState.badgeInjected = false;
        
        if (isProfilePage()) {
          waitForElement('.pvs-profile-actions--overflow, .pv-top-card-v2-ctas__custom', () => {
            addManagedTimeout(injectScoreBadge, 500);
          });
        }
      }
    }, 1000));
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    ExtensionState.observers.push(observer);
  }
  
  // Message handler
  if (safeChrome()) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request.action);
    
    if (request.action === 'extractProfile') {
      ProfileExtractor.extract()
        .then(profileData => {
          console.log('Sending profile data to service worker');
          sendResponse(profileData);
        })
        .catch(error => {
          console.error('Profile extraction failed:', error);
          sendResponse(null);
        });
      return true; // Indicates async response
    }
    
    if (request.action === 'runDiscovery') {
      try {
        const discoveryData = ProfileSectionDiscovery.discoverSections();
        const completenessResult = ProfileCompletenessCalculator.calculate(discoveryData);
        sendResponse({success: true, discovery: discoveryData, completeness: completenessResult});
      } catch (error) {
        sendResponse({success: false, error: error.message});
      }
      return true;
    }
    
    if (request.action === 'runFullExtraction') {
      ProfileExtractor.extract()
        .then(profileData => {
          // Save to storage for logs display
          chrome.storage.local.set({
            lastAnalysis: {
              profileData: profileData,
              timestamp: new Date().toISOString(),
              isPersonal: true
            }
          });
          sendResponse({success: true, data: profileData});
        })
        .catch(error => {
          console.error('Full extraction failed:', error);
          sendResponse({success: false, error: error.message});
        });
      return true;
    }
    
    if (request.action === 'extractSectionData') {
      const section = request.section;
      console.log('Extracting section data for:', section);
      
      if (section === 'about' && ProfileExtractor.extractors.about) {
        ProfileExtractor.extractors.about.extract()
          .then(data => {
            sendResponse({success: true, data: data});
          })
          .catch(error => {
            console.error('About extraction error:', error);
            sendResponse({success: false, error: error.message});
          });
      } else if (section === 'experience' && ProfileExtractor.extractors.experience) {
        ProfileExtractor.extractors.experience.extract()
          .then(data => {
            sendResponse({success: true, data: data});
          })
          .catch(error => {
            console.error('Experience extraction error:', error);
            sendResponse({success: false, error: error.message});
          });
      } else if (section === 'skills' && ProfileExtractor.extractors.skills) {
        ProfileExtractor.extractors.skills.extract()
          .then(data => {
            sendResponse({success: true, data: data});
          })
          .catch(error => {
            console.error('Skills extraction error:', error);
            sendResponse({success: false, error: error.message});
          });
      } else {
        // Fallback to ProfileSectionDiscovery for other sections
        try {
          const discoveryData = ProfileSectionDiscovery.discoverSections();
          const sectionData = discoveryData[section] || { exists: false };
          sendResponse({success: true, data: sectionData});
        } catch (error) {
          sendResponse({success: false, error: error.message});
        }
      }
      return true;
    }
  });
  }
  
  // Comprehensive cleanup
  function cleanup() {
    // Disconnect all mutation observers
    ExtensionState.observers.forEach(obs => {
      try {
        obs.disconnect();
      } catch (e) {
        console.error('Error disconnecting observer:', e);
      }
    });
    ExtensionState.observers = [];
    
    // Remove all event listeners
    ExtensionState.eventListeners.forEach(({ element, event, handler, options }) => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (e) {
        console.error('Error removing event listener:', e);
      }
    });
    ExtensionState.eventListeners = [];
    
    // Clear all timeouts
    ExtensionState.timeouts.forEach(timeoutId => {
      try {
        clearTimeout(timeoutId);
      } catch (e) {
        console.error('Error clearing timeout:', e);
      }
    });
    ExtensionState.timeouts = [];
    
    // Clear all intervals
    ExtensionState.intervals.forEach(intervalId => {
      try {
        clearInterval(intervalId);
      } catch (e) {
        console.error('Error clearing interval:', e);
      }
    });
    ExtensionState.intervals = [];
    
    // Remove storage listener if exists
    if (ExtensionState.storageListener && safeChrome()) {
      chrome.storage.onChanged.removeListener(ExtensionState.storageListener);
      ExtensionState.storageListener = null;
    }
    
    // Reset state flags
    ExtensionState.badgeInjected = false;
    ExtensionState.isExtracting = false;
  }
  
  // Start
  if (document.readyState === 'loading') {
    const domContentLoadedHandler = () => {
      document.removeEventListener('DOMContentLoaded', domContentLoadedHandler);
      init();
    };
    document.addEventListener('DOMContentLoaded', domContentLoadedHandler);
  } else {
    init();
  }
  
  // Handle navigation
  if (window.navigation) {
    window.navigation.addEventListener('navigate', () => {
      cleanup();
    });
  }
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('unload', cleanup);
  
  // Listen for storage changes to update popup scores
  if (safeChrome()) {
    ExtensionState.storageListener = (changes, namespace) => {
      if (namespace === 'local') {
        // Update popup if it's open
        if (changes.lastScan || changes.lastAnalysis) {
          // Popup will re-read scores when opened
        }
      }
    };
    chrome.storage.onChanged.addListener(ExtensionState.storageListener);
  }

// Export for debugging
  window.ElevateLI = {
    discover: () => ProfileSectionDiscovery.discoverSections(),
    calculateCompleteness: (data) => ProfileCompletenessCalculator.calculate(data || ProfileSectionDiscovery.discoverSections()),
    extract: () => ProfileExtractor.extract(),
    extractAbout: () => AboutExtractor.extract(),
    extractExperience: () => ExperienceExtractor.extract(),
    extractSkills: () => SkillsExtractor.extract(),
    state: ExtensionState
  };

})();
