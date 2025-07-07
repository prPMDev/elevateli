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
 * Base Extractor Module for ElevateLI
 * Provides common functionality for all section extractors
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const BaseExtractor = {
  /**
   * Common utility to extract text content safely
   * @param {Element} element - DOM element
   * @returns {string} Extracted text
   */
  extractTextContent(element) {
    if (!element) return '';
    
    // Check for aria-hidden="true" spans first (LinkedIn's actual text)
    const ariaHiddenSpan = element.querySelector('span[aria-hidden="true"]');
    if (ariaHiddenSpan) {
      return ariaHiddenSpan.textContent?.trim() || '';
    }
    
    // Fallback to regular text content
    return element.textContent?.trim() || '';
  },
  
  /**
   * Wait for element with timeout
   * @param {string} selector - CSS selector
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<Element|null>}
   */
  async waitForElement(selector, timeout = 3000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  },
  
  /**
   * Click "Show all" button if present
   * @param {Element} section - Section element
   * @param {string} buttonSelector - Button selector
   * @returns {Promise<boolean>} Success status
   */
  async expandSection(section, buttonSelector) {
    if (!section) return false;
    
    const showAllButton = section.querySelector(buttonSelector);
    if (!showAllButton || showAllButton.disabled) return false;
    
    console.log(`[Extractor] Clicking "Show all" button...`);
    showAllButton.click();
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return true;
  },
  
  /**
   * Find section by multiple strategies
   * @param {Array<string>} selectors - Array of selectors to try
   * @param {string} headingText - Text to search in headings
   * @returns {Element|null}
   */
  findSection(selectors, headingText) {
    // Try direct selectors first
    for (const selector of selectors) {
      const section = document.querySelector(selector);
      if (section) return section;
    }
    
    // Try finding by heading text
    if (headingText) {
      const sections = Array.from(document.querySelectorAll('section'));
      for (const section of sections) {
        const heading = section.querySelector('h2');
        if (heading && heading.textContent?.includes(headingText)) {
          return section;
        }
      }
    }
    
    return null;
  },
  
  /**
   * Count items in a section
   * @param {Element} section - Section element
   * @param {string} itemSelector - Item selector
   * @returns {number}
   */
  countItems(section, itemSelector) {
    if (!section) return 0;
    return section.querySelectorAll(itemSelector).length;
  },
  
  /**
   * Chunk large text for AI processing
   * @param {string} text - Text to chunk
   * @param {number} maxSize - Max chunk size
   * @returns {Array<string>}
   */
  chunkText(text, maxSize = 1000) {
    if (!text || text.length <= maxSize) return [text];
    
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  },
  
  /**
   * Check if section has meaningful content
   * @param {Object} data - Extracted data
   * @returns {boolean}
   */
  hasContent(data) {
    if (!data || !data.exists) return false;
    
    // Check various indicators of content
    if (data.count && data.count > 0) return true;
    if (data.charCount && data.charCount > 0) return true;
    if (data.items && data.items.length > 0) return true;
    if (data.text && data.text.length > 0) return true;
    
    return false;
  },
  
  /**
   * Log extraction timing
   * @param {string} section - Section name
   * @param {number} startTime - Start timestamp
   */
  logTiming(section, startTime) {
    const duration = Date.now() - startTime;
    console.log(`[${section}Extractor] Extraction completed in ${duration}ms`);
  }
};/**
 * Headline Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile headline
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const HeadlineExtractor = {
  name: 'headline',
  
  /**
   * Quick scan for headline existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const element = document.querySelector('.pv-text-details__left-panel .text-body-medium');
    const exists = !!element;
    
    BaseExtractor.logTiming('Headline scan', startTime);
    
    return {
      exists,
      selector: '.pv-text-details__left-panel .text-body-medium'
    };
  },
  
  /**
   * Extract headline for completeness scoring
   * @returns {Object} Basic headline data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        charCount: 0,
        text: ''
      };
    }
    
    const element = document.querySelector(scanResult.selector);
    const text = BaseExtractor.extractTextContent(element);
    
    const result = {
      exists: true,
      charCount: text.length,
      text: text,
      // Quick quality checks for completeness
      hasKeywords: this.checkKeywords(text),
      isGeneric: this.checkIfGeneric(text),
      hasPipe: text.includes('|'),
      hasAt: text.includes('@')
    };
    
    BaseExtractor.logTiming('Headline extract', startTime);
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed headline data
   */
  async extractDeep() {
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    // Add deep analysis data
    return {
      ...basicData,
      // Linguistic analysis
      wordCount: basicData.text.split(/\s+/).length,
      keywords: this.extractKeywords(basicData.text),
      sentiment: this.analyzeSentiment(basicData.text),
      
      // Structure analysis  
      parts: this.parseHeadlineParts(basicData.text),
      hasTitle: this.containsJobTitle(basicData.text),
      hasCompany: this.containsCompany(basicData.text),
      hasValue: this.containsValueProp(basicData.text),
      
      // Optimization suggestions
      optimizationPotential: this.calculateOptimizationPotential(basicData)
    };
  },
  
  /**
   * Check for important keywords
   * @param {string} text - Headline text
   * @returns {boolean}
   */
  checkKeywords(text) {
    const keywords = [
      'senior', 'lead', 'principal', 'director', 'manager',
      'engineer', 'developer', 'designer', 'analyst', 'consultant',
      'expert', 'specialist', 'architect', 'strategist'
    ];
    
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword));
  },
  
  /**
   * Check if headline is too generic
   * @param {string} text - Headline text
   * @returns {boolean}
   */
  checkIfGeneric(text) {
    const genericPhrases = [
      'looking for opportunities',
      'seeking new role',
      'open to work',
      'unemployed',
      'student at'
    ];
    
    const lowerText = text.toLowerCase();
    return genericPhrases.some(phrase => lowerText.includes(phrase));
  },
  
  /**
   * Extract keywords for analysis
   * @param {string} text - Headline text
   * @returns {Array<string>}
   */
  extractKeywords(text) {
    // Remove common words and extract meaningful terms
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'at', 'to', 'for'];
    const words = text.toLowerCase().split(/\W+/);
    
    return words
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .filter((word, index, self) => self.indexOf(word) === index);
  },
  
  /**
   * Simple sentiment analysis
   * @param {string} text - Headline text
   * @returns {string}
   */
  analyzeSentiment(text) {
    const positive = ['passionate', 'expert', 'leader', 'innovative', 'experienced'];
    const negative = ['seeking', 'looking', 'unemployed', 'former'];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    positive.forEach(word => {
      if (lowerText.includes(word)) score++;
    });
    
    negative.forEach(word => {
      if (lowerText.includes(word)) score--;
    });
    
    return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  },
  
  /**
   * Parse headline into logical parts
   * @param {string} text - Headline text
   * @returns {Object}
   */
  parseHeadlineParts(text) {
    const parts = {
      title: '',
      company: '',
      value: '',
      other: []
    };
    
    // Split by common separators
    const segments = text.split(/[|,@•]/);
    
    segments.forEach(segment => {
      const trimmed = segment.trim();
      if (this.containsJobTitle(trimmed)) {
        parts.title = trimmed;
      } else if (this.containsCompany(trimmed)) {
        parts.company = trimmed;
      } else if (this.containsValueProp(trimmed)) {
        parts.value = trimmed;
      } else if (trimmed) {
        parts.other.push(trimmed);
      }
    });
    
    return parts;
  },
  
  /**
   * Check if text contains job title
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  containsJobTitle(text) {
    const titleKeywords = [
      'manager', 'director', 'engineer', 'developer',
      'designer', 'analyst', 'consultant', 'specialist',
      'lead', 'head', 'vp', 'president', 'chief'
    ];
    
    const lowerText = text.toLowerCase();
    return titleKeywords.some(keyword => lowerText.includes(keyword));
  },
  
  /**
   * Check if text contains company reference
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  containsCompany(text) {
    return text.includes('@') || 
           text.toLowerCase().includes(' at ') ||
           /\b(Inc|LLC|Ltd|Corp|Company)\b/i.test(text);
  },
  
  /**
   * Check if text contains value proposition
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  containsValueProp(text) {
    const valueKeywords = [
      'helping', 'building', 'creating', 'driving',
      'transforming', 'leading', 'delivering', 'solving'
    ];
    
    const lowerText = text.toLowerCase();
    return valueKeywords.some(keyword => lowerText.includes(keyword));
  },
  
  /**
   * Calculate optimization potential
   * @param {Object} data - Headline data
   * @returns {number} Score 0-100
   */
  calculateOptimizationPotential(data) {
    let score = 100;
    
    // Deduct points for issues
    if (data.charCount < 30) score -= 20;
    if (data.charCount > 220) score -= 10;
    if (!data.hasKeywords) score -= 15;
    if (data.isGeneric) score -= 25;
    if (!data.hasPipe && !data.hasAt) score -= 10;
    if (data.wordCount < 3) score -= 20;
    
    return Math.max(0, score);
  }
};/**
 * About Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile About section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const AboutExtractor = {
  name: 'about',
  
  // Multiple selectors to handle LinkedIn's changing DOM
  selectors: [
    'section[data-section="summary"]',
    'section:has(div#about)',
    'section:has(h2:contains("About"))',
    'div[data-view-name="profile-card"]:has(div#about)',
    'section.pv-about-section',
    'section.pv-profile-section:has(.pv-about__summary-text)'
  ],
  
  // Selectors for the actual text content
  textSelectors: [
    '[class*="inline-show-more-text"] span[aria-hidden="true"]',
    '.pv-about__summary-text span[aria-hidden="true"]',
    '.pv-shared-text-with-see-more span[aria-hidden="true"]',
    '[class*="full-width"] span[aria-hidden="true"]',
    '.pvs-list__outer-container span[aria-hidden="true"]'
  ],
  
  /**
   * Quick scan for about section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'About');
    const exists = !!section;
    
    let hasShowMore = false;
    if (exists) {
      // Check for "Show more" button
      const showMoreSelectors = [
        'button[aria-label*="more about"]',
        'button[aria-label*="Show more"]',
        'a[aria-label*="see more"]',
        'button.inline-show-more-text__button',
        '[class*="inline-show-more-text"] button'
      ];
      
      hasShowMore = showMoreSelectors.some(selector => 
        section.querySelector(selector) !== null
      );
    }
    
    Logger.debug(`[AboutExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      hasShowMore
    });
    
    return {
      exists,
      hasShowMore,
      selector: section ? this.selectors.find(s => document.querySelector(s)) : null
    };
  },
  
  /**
   * Extract about text for completeness scoring
   * @returns {Object} Basic about data with character count
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[AboutExtractor] About section not found');
      return {
        exists: false,
        charCount: 0,
        text: '',
        hasShowMore: false
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'About');
    
    // Try to extract text using multiple strategies
    let text = '';
    
    // Strategy 1: Try each text selector
    for (const selector of this.textSelectors) {
      const elements = section.querySelectorAll(selector);
      if (elements.length > 0) {
        text = Array.from(elements)
          .map(el => el.textContent?.trim())
          .filter(t => t)
          .join(' ');
        
        if (text.length > 0) {
          Logger.debug(`[AboutExtractor] Found text with selector: ${selector}`);
          break;
        }
      }
    }
    
    // Strategy 2: If no text found, try getting all text content
    if (!text) {
      const container = section.querySelector('.pvs-list__outer-container, .pv-about__summary-text');
      if (container) {
        text = BaseExtractor.extractTextContent(container);
      }
    }
    
    // Strategy 3: Last resort - get all visible text
    if (!text) {
      const visibleText = section.innerText || section.textContent || '';
      // Remove common UI elements
      text = visibleText
        .replace(/About\s*$/i, '')
        .replace(/Show\s+more\s*/gi, '')
        .replace(/Show\s+less\s*/gi, '')
        .trim();
    }
    
    const result = {
      exists: true,
      charCount: text.length,
      text: text.substring(0, 500), // Limit for basic extraction
      hasShowMore: scanResult.hasShowMore,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      paragraphs: text.split(/\n\n+/).filter(p => p.trim()).length
    };
    
    Logger.info(`[AboutExtractor] Extracted ${result.charCount} characters in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed about data with full text
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'About');
    
    // Expand "Show more" if present
    if (basicData.hasShowMore) {
      Logger.debug('[AboutExtractor] Clicking "Show more" button');
      await this.expandAboutSection(section);
    }
    
    // Re-extract after expansion
    let fullText = '';
    
    // Try all text extraction strategies again
    for (const selector of this.textSelectors) {
      const elements = section.querySelectorAll(selector);
      if (elements.length > 0) {
        fullText = Array.from(elements)
          .map(el => el.textContent?.trim())
          .filter(t => t)
          .join(' ');
        
        if (fullText.length > 0) break;
      }
    }
    
    // Fallback to container text
    if (!fullText) {
      const container = section.querySelector('.pvs-list__outer-container, .pv-about__summary-text');
      if (container) {
        fullText = BaseExtractor.extractTextContent(container);
      }
    }
    
    // Clean up the text
    fullText = this.cleanAboutText(fullText);
    
    const result = {
      ...basicData,
      text: fullText,
      charCount: fullText.length,
      wordCount: fullText.split(/\s+/).filter(w => w.length > 0).length,
      
      // Analysis features
      paragraphs: this.extractParagraphs(fullText),
      keywords: this.extractKeywords(fullText),
      hasCallToAction: this.hasCallToAction(fullText),
      hasContactInfo: this.hasContactInfo(fullText),
      sentiment: this.analyzeSentiment(fullText),
      readabilityScore: this.calculateReadability(fullText),
      
      // For AI processing
      textChunks: BaseExtractor.chunkText(fullText, 1000)
    };
    
    Logger.info(`[AboutExtractor] Deep extraction completed in ${Date.now() - startTime}ms`, {
      charCount: result.charCount,
      chunks: result.textChunks.length
    });
    
    return result;
  },
  
  /**
   * Expand the about section by clicking "Show more"
   * @param {Element} section - About section element
   */
  async expandAboutSection(section) {
    const showMoreSelectors = [
      'button[aria-label*="more about"]',
      'button[aria-label*="Show more"]',
      'button.inline-show-more-text__button',
      '[class*="inline-show-more-text"] button'
    ];
    
    for (const selector of showMoreSelectors) {
      const button = section.querySelector(selector);
      if (button && !button.disabled) {
        try {
          button.click();
          // Wait for content to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          Logger.debug('[AboutExtractor] Successfully expanded About section');
          return true;
        } catch (error) {
          Logger.warn('[AboutExtractor] Failed to click show more button', error);
        }
      }
    }
    
    return false;
  },
  
  /**
   * Clean about text by removing UI elements
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  cleanAboutText(text) {
    return text
      .replace(/^About\s*/i, '')
      .replace(/Show\s+more\s*/gi, '')
      .replace(/Show\s+less\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  },
  
  /**
   * Extract paragraphs from text
   * @param {string} text - About text
   * @returns {Array<string>} Paragraphs
   */
  extractParagraphs(text) {
    return text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  },
  
  /**
   * Extract keywords from about text
   * @param {string} text - About text
   * @returns {Array<string>} Keywords
   */
  extractKeywords(text) {
    const commonWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 
      'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 
      'do', 'at', 'this', 'but', 'his', 'by', 'from'
    ]);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word));
    
    // Count frequency
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Return top keywords
    return Object.entries(frequency)
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  },
  
  /**
   * Check if about section has a call to action
   * @param {string} text - About text
   * @returns {boolean}
   */
  hasCallToAction(text) {
    const ctaPatterns = [
      /contact\s+me/i,
      /reach\s+out/i,
      /get\s+in\s+touch/i,
      /let's\s+connect/i,
      /feel\s+free\s+to/i,
      /don't\s+hesitate/i,
      /available\s+for/i,
      /looking\s+for/i,
      /open\s+to/i
    ];
    
    return ctaPatterns.some(pattern => pattern.test(text));
  },
  
  /**
   * Check if about section contains contact information
   * @param {string} text - About text
   * @returns {boolean}
   */
  hasContactInfo(text) {
    const contactPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
      /\bwww\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/, // Website
      /\bhttps?:\/\/[^\s]+/i // URL
    ];
    
    return contactPatterns.some(pattern => pattern.test(text));
  },
  
  /**
   * Simple sentiment analysis
   * @param {string} text - About text
   * @returns {string} Sentiment (positive/neutral/negative)
   */
  analyzeSentiment(text) {
    const positive = [
      'passionate', 'excited', 'love', 'enjoy', 'enthusiastic',
      'dedicated', 'driven', 'motivated', 'inspire', 'achieve'
    ];
    
    const negative = [
      'frustrated', 'disappointed', 'difficult', 'challenge',
      'struggle', 'problem', 'issue', 'concern'
    ];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    positive.forEach(word => {
      if (lowerText.includes(word)) score++;
    });
    
    negative.forEach(word => {
      if (lowerText.includes(word)) score--;
    });
    
    return score > 1 ? 'positive' : score < -1 ? 'negative' : 'neutral';
  },
  
  /**
   * Calculate readability score (simplified Flesch Reading Ease)
   * @param {string} text - About text
   * @returns {number} Readability score
   */
  calculateReadability(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length || 1;
    const words = text.split(/\s+/).filter(w => w).length || 1;
    const syllables = text.toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/gi, '').length || 1;
    
    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    // Simplified Flesch Reading Ease formula
    const score = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
    
    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }
};/**
 * Experience Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile experience section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const ExperienceExtractor = {
  name: 'experience',
  
  selectors: [
    'section#experience-section',
    'section[data-section="experience"]',
    'div[data-view-name="profile-card"][id*="experience"]',
    'section:has(#experience)',
    'div:has(#experience)'
  ],
  
  /**
   * Quick scan for experience section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Experience');
    const exists = !!section;
    
    let quickCount = 0;
    if (exists) {
      // Quick count of visible items
      const visibleItems = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      quickCount = visibleItems.length;
    }
    
    BaseExtractor.logTiming('Experience scan', startTime);
    
    return {
      exists,
      visibleCount: quickCount,
      hasShowAll: exists && !!section.querySelector('a[aria-label*="Show all"], button[aria-label*="Show all"]')
    };
  },
  
  /**
   * Extract experience data for completeness scoring
   * @returns {Object} Basic experience data with total count
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        totalMonths: 0,
        hasCurrentRole: false
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Experience');
    
    // Try to get total count from "Show all" button
    let totalCount = await this.extractTotalCount(section);
    
    // If no total count found, use visible count
    if (totalCount === 0) {
      totalCount = scanResult.visibleCount;
    }
    
    // Calculate total months and check for current role
    const basicInfo = await this.extractBasicInfo(section);
    
    const result = {
      exists: true,
      count: totalCount,
      totalMonths: basicInfo.totalMonths,
      hasCurrentRole: basicInfo.hasCurrentRole,
      visibleCount: scanResult.visibleCount,
      hasMoreItems: totalCount > scanResult.visibleCount
    };
    
    BaseExtractor.logTiming('Experience extract', startTime);
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed experience data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Experience');
    
    // Expand section if needed
    if (basicData.hasMoreItems) {
      await BaseExtractor.expandSection(section, 'button[aria-label*="Show all"]');
    }
    
    // Extract detailed experience items
    const experiences = await this.extractDetailedExperiences(section);
    
    const result = {
      ...basicData,
      experiences: experiences,
      
      // Analysis metrics
      averageTenure: this.calculateAverageTenure(experiences),
      careerProgression: this.analyzeCareerProgression(experiences),
      industryChanges: this.countIndustryChanges(experiences),
      hasQuantifiedAchievements: experiences.some(e => e.hasQuantifiedAchievements),
      hasTechStack: experiences.some(e => e.hasTechStack),
      
      // For AI processing
      experienceChunks: this.prepareForAI(experiences)
    };
    
    BaseExtractor.logTiming('Experience deep extract', startTime);
    return result;
  },
  
  /**
   * Extract total count from "Show all" button
   * @param {Element} section - Experience section
   * @returns {number} Total count
   */
  async extractTotalCount(section) {
    const showAllSelectors = [
      'a[href*="/details/experience"]',
      'a[aria-label*="Show all"]',
      'button[aria-label*="Show all"]'
    ];
    
    for (const selector of showAllSelectors) {
      const showAllElement = section.querySelector(selector);
      if (showAllElement) {
        const text = showAllElement.textContent || showAllElement.getAttribute('aria-label') || '';
        
        const patterns = [
          /Show all (\d+) experiences?/i,
          /(\d+)\s*experiences?/i,
          /(\d+)\s*positions?/i
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return parseInt(match[1]);
          }
        }
      }
    }
    
    return 0;
  },
  
  /**
   * Extract basic info like total months and current role
   * @param {Element} section - Experience section
   * @returns {Object} Basic info
   */
  async extractBasicInfo(section) {
    const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    let totalMonths = 0;
    let hasCurrentRole = false;
    
    for (const item of items) {
      // Check for current role (no end date)
      const dateText = BaseExtractor.extractTextContent(
        item.querySelector('.t-14:not(.t-bold), .pvs-entity__caption-wrapper')
      );
      
      if (dateText && (dateText.includes('Present') || dateText.includes('present'))) {
        hasCurrentRole = true;
      }
      
      // Extract duration if available
      const durationMatch = dateText?.match(/(\d+)\s*(yr|year|mo|month)/gi);
      if (durationMatch) {
        // Simple duration calculation (can be enhanced)
        totalMonths += this.parseDuration(dateText);
      }
    }
    
    return { totalMonths, hasCurrentRole };
  },
  
  /**
   * Extract detailed experience items
   * @param {Element} section - Experience section
   * @returns {Array<Object>} Detailed experiences
   */
  async extractDetailedExperiences(section) {
    const experiences = [];
    const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const item of items) {
      const experience = await this.extractExperienceItem(item);
      if (experience.title) {
        experiences.push(experience);
      }
    }
    
    return experiences;
  },
  
  /**
   * Extract single experience item
   * @param {Element} item - Experience item element
   * @returns {Object} Experience data
   */
  async extractExperienceItem(item) {
    const experience = {
      title: '',
      company: '',
      duration: '',
      location: '',
      description: '',
      hasQuantifiedAchievements: false,
      hasTechStack: false,
      keywords: []
    };
    
    // Extract title
    const titleElement = item.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    experience.title = BaseExtractor.extractTextContent(titleElement);
    
    // Extract company
    const companyElement = item.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    experience.company = BaseExtractor.extractTextContent(companyElement);
    
    // Extract duration
    const durationElement = item.querySelector('.pvs-entity__caption-wrapper');
    experience.duration = BaseExtractor.extractTextContent(durationElement);
    
    // Extract description
    const descElement = item.querySelector('.pvs-list__outer-container > ul li');
    experience.description = BaseExtractor.extractTextContent(descElement);
    
    // Analyze description
    if (experience.description) {
      experience.hasQuantifiedAchievements = this.hasQuantifiedAchievements(experience.description);
      experience.hasTechStack = this.hasTechStack(experience.description);
      experience.keywords = this.extractKeywords(experience.description);
    }
    
    return experience;
  },
  
  /**
   * Check for quantified achievements
   * @param {string} text - Description text
   * @returns {boolean}
   */
  hasQuantifiedAchievements(text) {
    const pattern = /\d+[%+,kKmMbB$]*\s*(revenue|users|customers|growth|increase|decrease|ROI|saved|generated|improvement|reduction)/gi;
    return pattern.test(text);
  },
  
  /**
   * Check for tech stack mentions
   * @param {string} text - Description text
   * @returns {boolean}
   */
  hasTechStack(text) {
    const techPattern = /\b(React|Angular|Vue|Node|Python|Java|JavaScript|AWS|Azure|Docker|Kubernetes|SQL|API)\b/gi;
    return techPattern.test(text);
  },
  
  /**
   * Extract keywords from text
   * @param {string} text - Description text
   * @returns {Array<string>}
   */
  extractKeywords(text) {
    const techPattern = /\b(React|Angular|Vue|Node|Python|Java|JavaScript|AWS|Azure|Docker|Kubernetes|SQL|API)\b/gi;
    const matches = text.match(techPattern) || [];
    return [...new Set(matches.map(k => k.toLowerCase()))];
  },
  
  /**
   * Parse duration string to months
   * @param {string} duration - Duration text
   * @returns {number} Total months
   */
  parseDuration(duration) {
    let months = 0;
    
    const yearMatch = duration.match(/(\d+)\s*(yr|year)/i);
    if (yearMatch) {
      months += parseInt(yearMatch[1]) * 12;
    }
    
    const monthMatch = duration.match(/(\d+)\s*(mo|month)/i);
    if (monthMatch) {
      months += parseInt(monthMatch[1]);
    }
    
    return months;
  },
  
  /**
   * Calculate average tenure
   * @param {Array<Object>} experiences - Experience items
   * @returns {number} Average months per role
   */
  calculateAverageTenure(experiences) {
    if (experiences.length === 0) return 0;
    
    const totalMonths = experiences.reduce((sum, exp) => {
      return sum + this.parseDuration(exp.duration);
    }, 0);
    
    return Math.round(totalMonths / experiences.length);
  },
  
  /**
   * Analyze career progression
   * @param {Array<Object>} experiences - Experience items
   * @returns {string} Progression analysis
   */
  analyzeCareerProgression(experiences) {
    if (experiences.length < 2) return 'insufficient_data';
    
    const titles = experiences.map(e => e.title.toLowerCase());
    const progressionIndicators = ['senior', 'lead', 'principal', 'manager', 'director', 'vp', 'chief'];
    
    let progressionScore = 0;
    for (let i = 1; i < titles.length; i++) {
      const currentLevel = progressionIndicators.findIndex(ind => titles[i].includes(ind));
      const previousLevel = progressionIndicators.findIndex(ind => titles[i-1].includes(ind));
      
      if (currentLevel > previousLevel) progressionScore++;
    }
    
    return progressionScore > experiences.length / 3 ? 'upward' : 'lateral';
  },
  
  /**
   * Count industry changes
   * @param {Array<Object>} experiences - Experience items
   * @returns {number} Number of industry changes
   */
  countIndustryChanges(experiences) {
    // Simplified - could be enhanced with industry detection
    const companies = experiences.map(e => e.company);
    const uniqueCompanies = new Set(companies);
    return Math.max(0, uniqueCompanies.size - 1);
  },
  
  /**
   * Prepare experiences for AI processing
   * @param {Array<Object>} experiences - Experience items
   * @returns {Array<Object>} Chunked data for AI
   */
  prepareForAI(experiences) {
    return experiences.map(exp => ({
      title: exp.title,
      company: exp.company,
      duration: exp.duration,
      // Chunk large descriptions
      descriptionChunks: BaseExtractor.chunkText(exp.description, 500),
      metrics: {
        hasQuantifiedAchievements: exp.hasQuantifiedAchievements,
        hasTechStack: exp.hasTechStack,
        keywordCount: exp.keywords.length
      }
    }));
  }
};/**
 * Skills Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile skills section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const SkillsExtractor = {
  name: 'skills',
  
  // Multiple selectors for LinkedIn's changing DOM
  selectors: [
    'section[data-section="skills"]',
    'section:has(div#skills)',
    'div[data-view-name="profile-card"]:has(div#skills)',
    'section:has(h2:contains("Skills"))',
    'section.pv-skill-categories-section',
    'div[id*="skills-section"]'
  ],
  
  // Selectors for skill items
  skillItemSelectors: [
    '.pvs-list__paged-list-item',
    '.pv-skill-category-entity',
    '.pv-skill-entity',
    '[data-field="skill_card_skill_topic"]',
    '.artdeco-list__item'
  ],
  
  /**
   * Quick scan for skills section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Skills');
    const exists = !!section;
    
    let visibleCount = 0;
    let hasShowAll = false;
    
    if (exists) {
      // Count visible skill items
      for (const selector of this.skillItemSelectors) {
        const items = section.querySelectorAll(selector);
        if (items.length > 0) {
          visibleCount = items.length;
          break;
        }
      }
      
      // Check for "Show all" button
      const showAllSelectors = [
        'a[aria-label*="Show all"][aria-label*="skills"]',
        'button[aria-label*="Show all"][aria-label*="skills"]',
        'a[href*="/details/skills"]',
        '.pvs-list__footer-wrapper a',
        '.pvs-list__footer-wrapper button'
      ];
      
      hasShowAll = showAllSelectors.some(selector => 
        section.querySelector(selector) !== null
      );
    }
    
    Logger.debug(`[SkillsExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      visibleCount,
      hasShowAll
    });
    
    return {
      exists,
      visibleCount,
      hasShowAll
    };
  },
  
  /**
   * Extract skills data for completeness scoring
   * @returns {Object} Basic skills data with total count
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[SkillsExtractor] Skills section not found');
      return {
        exists: false,
        count: 0,
        skills: []
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Skills');
    
    // Try to get total count from "Show all" button
    let totalCount = await this.extractTotalCount(section);
    
    // If no total count found, use visible count
    if (totalCount === 0) {
      totalCount = scanResult.visibleCount;
    }
    
    // Extract visible skills for basic data
    const visibleSkills = await this.extractVisibleSkills(section);
    
    const result = {
      exists: true,
      count: totalCount,
      visibleCount: scanResult.visibleCount,
      hasMoreSkills: totalCount > scanResult.visibleCount,
      skills: visibleSkills.slice(0, 5), // Just top 5 for basic extraction
      hasEndorsements: visibleSkills.some(s => s.endorsementCount > 0)
    };
    
    Logger.info(`[SkillsExtractor] Extracted ${totalCount} total skills (${scanResult.visibleCount} visible) in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed skills data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Skills');
    
    // Expand section if needed
    if (basicData.hasMoreSkills) {
      Logger.debug('[SkillsExtractor] Clicking "Show all" for skills');
      await this.expandSkillsSection(section);
      
      // Wait for skills to load
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Extract all skills after expansion
    const allSkills = await this.extractAllSkills(section);
    
    const result = {
      ...basicData,
      count: allSkills.length,
      skills: allSkills,
      
      // Analysis features
      skillsByCategory: this.categorizeSkills(allSkills),
      topEndorsedSkills: this.getTopEndorsedSkills(allSkills),
      skillKeywords: this.extractSkillKeywords(allSkills),
      technicalSkills: allSkills.filter(s => this.isTechnicalSkill(s.name)),
      softSkills: allSkills.filter(s => this.isSoftSkill(s.name)),
      
      // Metrics
      totalEndorsements: allSkills.reduce((sum, s) => sum + s.endorsementCount, 0),
      averageEndorsements: allSkills.length > 0 
        ? Math.round(allSkills.reduce((sum, s) => sum + s.endorsementCount, 0) / allSkills.length)
        : 0,
      endorsedSkillsCount: allSkills.filter(s => s.endorsementCount > 0).length,
      
      // For AI processing
      skillGroups: this.groupSkillsForAI(allSkills)
    };
    
    Logger.info(`[SkillsExtractor] Deep extraction completed in ${Date.now() - startTime}ms`, {
      totalSkills: result.count,
      endorsed: result.endorsedSkillsCount,
      categories: Object.keys(result.skillsByCategory).length
    });
    
    return result;
  },
  
  /**
   * Extract total count from "Show all" button
   * @param {Element} section - Skills section
   * @returns {number} Total count
   */
  async extractTotalCount(section) {
    const showAllSelectors = [
      'a[aria-label*="Show all"][aria-label*="skills"]',
      'button[aria-label*="Show all"][aria-label*="skills"]',
      'a[href*="/details/skills"]',
      '.pvs-list__footer-wrapper a'
    ];
    
    for (const selector of showAllSelectors) {
      const element = section.querySelector(selector);
      if (element) {
        const text = element.textContent || element.getAttribute('aria-label') || '';
        
        // Try different patterns
        const patterns = [
          /Show all (\d+) skills?/i,
          /(\d+)\s*skills?/i,
          /View all\s*\((\d+)\)/i
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            const count = parseInt(match[1]);
            Logger.debug(`[SkillsExtractor] Found total count from button: ${count}`);
            return count;
          }
        }
      }
    }
    
    return 0;
  },
  
  /**
   * Extract visible skills from the page
   * @param {Element} section - Skills section
   * @returns {Array<Object>} Skills data
   */
  async extractVisibleSkills(section) {
    const skills = [];
    
    // Try each selector to find skill items
    let skillElements = [];
    for (const selector of this.skillItemSelectors) {
      skillElements = Array.from(section.querySelectorAll(selector));
      if (skillElements.length > 0) break;
    }
    
    for (const element of skillElements) {
      const skill = await this.extractSkillItem(element);
      if (skill.name) {
        skills.push(skill);
      }
    }
    
    return skills;
  },
  
  /**
   * Extract all skills (after expansion)
   * @param {Element} section - Skills section
   * @returns {Array<Object>} All skills data
   */
  async extractAllSkills(section) {
    // Re-query after expansion
    const skills = [];
    
    let skillElements = [];
    for (const selector of this.skillItemSelectors) {
      skillElements = Array.from(section.querySelectorAll(selector));
      if (skillElements.length > 0) break;
    }
    
    Logger.debug(`[SkillsExtractor] Found ${skillElements.length} skill elements after expansion`);
    
    for (const element of skillElements) {
      const skill = await this.extractSkillItem(element);
      if (skill.name) {
        skills.push(skill);
      }
    }
    
    return skills;
  },
  
  /**
   * Extract single skill item
   * @param {Element} element - Skill element
   * @returns {Object} Skill data
   */
  async extractSkillItem(element) {
    const skill = {
      name: '',
      endorsementCount: 0,
      hasEndorsements: false
    };
    
    // Extract skill name
    const nameSelectors = [
      '.t-bold span[aria-hidden="true"]',
      '.pv-skill-entity__skill-name',
      '[data-field="skill_card_skill_topic"] span',
      'span[aria-hidden="true"]'
    ];
    
    for (const selector of nameSelectors) {
      const nameEl = element.querySelector(selector);
      if (nameEl) {
        skill.name = BaseExtractor.extractTextContent(nameEl);
        if (skill.name) break;
      }
    }
    
    // Extract endorsement count
    const endorsementSelectors = [
      '.pv-skill-entity__endorsement-count',
      '.t-14:contains("endorsement")',
      'span:contains("endorsement")'
    ];
    
    for (const selector of endorsementSelectors) {
      const endorsementEl = element.querySelector(selector);
      if (endorsementEl) {
        const text = endorsementEl.textContent || '';
        const match = text.match(/(\d+)/);
        if (match) {
          skill.endorsementCount = parseInt(match[1]);
          skill.hasEndorsements = true;
        }
        break;
      }
    }
    
    return skill;
  },
  
  /**
   * Expand skills section by clicking "Show all"
   * @param {Element} section - Skills section
   */
  async expandSkillsSection(section) {
    const showAllSelectors = [
      'a[aria-label*="Show all"][aria-label*="skills"]',
      'button[aria-label*="Show all"][aria-label*="skills"]',
      'a[href*="/details/skills"]',
      '.pvs-list__footer-wrapper a',
      '.pvs-list__footer-wrapper button'
    ];
    
    for (const selector of showAllSelectors) {
      const button = section.querySelector(selector);
      if (button && !button.disabled) {
        try {
          button.click();
          Logger.debug('[SkillsExtractor] Clicked show all skills button');
          return true;
        } catch (error) {
          Logger.warn('[SkillsExtractor] Failed to click show all button', error);
        }
      }
    }
    
    return false;
  },
  
  /**
   * Categorize skills based on common patterns
   * @param {Array<Object>} skills - Skills array
   * @returns {Object} Categorized skills
   */
  categorizeSkills(skills) {
    const categories = {
      programming: [],
      frameworks: [],
      databases: [],
      cloud: [],
      tools: [],
      soft: [],
      other: []
    };
    
    const patterns = {
      programming: /\b(java|python|javascript|typescript|c\+\+|c#|ruby|go|rust|php|swift|kotlin)\b/i,
      frameworks: /\b(react|angular|vue|django|spring|express|rails|laravel|flutter)\b/i,
      databases: /\b(sql|mysql|postgresql|mongodb|redis|elasticsearch|cassandra)\b/i,
      cloud: /\b(aws|azure|gcp|docker|kubernetes|cloud|devops)\b/i,
      tools: /\b(git|jenkins|jira|agile|scrum|ci\/cd)\b/i,
      soft: /\b(leadership|communication|teamwork|management|problem solving|analytical)\b/i
    };
    
    skills.forEach(skill => {
      let categorized = false;
      
      for (const [category, pattern] of Object.entries(patterns)) {
        if (pattern.test(skill.name)) {
          categories[category].push(skill);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categories.other.push(skill);
      }
    });
    
    // Remove empty categories
    Object.keys(categories).forEach(key => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });
    
    return categories;
  },
  
  /**
   * Get top endorsed skills
   * @param {Array<Object>} skills - Skills array
   * @returns {Array<Object>} Top endorsed skills
   */
  getTopEndorsedSkills(skills) {
    return skills
      .filter(s => s.endorsementCount > 0)
      .sort((a, b) => b.endorsementCount - a.endorsementCount)
      .slice(0, 10);
  },
  
  /**
   * Extract keywords from skills
   * @param {Array<Object>} skills - Skills array
   * @returns {Array<string>} Keywords
   */
  extractSkillKeywords(skills) {
    const keywords = new Set();
    
    skills.forEach(skill => {
      // Split compound skills
      const words = skill.name
        .split(/[\s\-\/&,]+/)
        .filter(w => w.length > 2);
      
      words.forEach(word => keywords.add(word.toLowerCase()));
    });
    
    return Array.from(keywords);
  },
  
  /**
   * Check if skill is technical
   * @param {string} skillName - Skill name
   * @returns {boolean}
   */
  isTechnicalSkill(skillName) {
    const technicalPattern = /\b(programming|software|development|engineering|technical|code|data|system|network|security|database|api|framework|library|platform|technology)\b/i;
    return technicalPattern.test(skillName);
  },
  
  /**
   * Check if skill is soft skill
   * @param {string} skillName - Skill name
   * @returns {boolean}
   */
  isSoftSkill(skillName) {
    const softPattern = /\b(leadership|communication|management|teamwork|problem solving|analytical|creative|strategic|organizational|interpersonal|presentation|negotiation)\b/i;
    return softPattern.test(skillName);
  },
  
  /**
   * Group skills for AI processing
   * @param {Array<Object>} skills - Skills array
   * @returns {Array<Object>} Grouped skills
   */
  groupSkillsForAI(skills) {
    const groups = [];
    const groupSize = 20;
    
    for (let i = 0; i < skills.length; i += groupSize) {
      groups.push({
        skills: skills.slice(i, i + groupSize).map(s => ({
          name: s.name,
          endorsements: s.endorsementCount
        })),
        groupIndex: Math.floor(i / groupSize) + 1,
        totalGroups: Math.ceil(skills.length / groupSize)
      });
    }
    
    return groups;
  }
};/**
 * Education Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile education section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const EducationExtractor = {
  name: 'education',
  
  selectors: [
    'section#education-section',
    'section[data-section="education"]',
    'div[data-view-name="profile-card"]:has(div#education)',
    'section:has(h2:contains("Education"))',
    'section.pv-education-section',
    'div[id*="education-section"]'
  ],
  
  /**
   * Quick scan for education section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Education');
    const exists = !!section;
    
    let visibleCount = 0;
    if (exists) {
      // Count visible education items
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      visibleCount = items.length;
    }
    
    Logger.debug(`[EducationExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      visibleCount
    });
    
    return {
      exists,
      visibleCount
    };
  },
  
  /**
   * Extract education data for completeness scoring
   * @returns {Object} Basic education data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[EducationExtractor] Education section not found');
      return {
        exists: false,
        count: 0,
        schools: []
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Education');
    const educationItems = await this.extractEducationItems(section);
    
    const result = {
      exists: true,
      count: educationItems.length,
      schools: educationItems.map(item => ({
        school: item.school,
        degree: item.degree,
        field: item.field
      })),
      hasUniversity: educationItems.some(item => 
        item.school.toLowerCase().includes('university') || 
        item.school.toLowerCase().includes('college')
      ),
      highestDegree: this.determineHighestDegree(educationItems)
    };
    
    Logger.info(`[EducationExtractor] Extracted ${result.count} education entries in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed education data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Education');
    const detailedEducation = await this.extractDetailedEducation(section);
    
    const result = {
      ...basicData,
      education: detailedEducation,
      
      // Analysis features
      totalYears: this.calculateTotalEducationYears(detailedEducation),
      recentEducation: detailedEducation.find(e => this.isRecent(e.endDate)),
      hasCertifications: detailedEducation.some(e => e.activities || e.honors),
      fieldsOfStudy: this.extractFieldsOfStudy(detailedEducation),
      
      // For AI processing
      educationSummary: this.summarizeEducation(detailedEducation)
    };
    
    Logger.info(`[EducationExtractor] Deep extraction completed in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Extract education items
   * @param {Element} section - Education section
   * @returns {Array<Object>} Education items
   */
  async extractEducationItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractEducationItem(element);
      if (item.school) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single education item
   * @param {Element} element - Education item element
   * @returns {Object} Education data
   */
  async extractEducationItem(element) {
    const education = {
      school: '',
      degree: '',
      field: '',
      startDate: '',
      endDate: '',
      duration: '',
      description: '',
      activities: '',
      honors: ''
    };
    
    // Extract school name
    const schoolEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    education.school = BaseExtractor.extractTextContent(schoolEl);
    
    // Extract degree and field
    const degreeEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    if (degreeEl) {
      const degreeText = BaseExtractor.extractTextContent(degreeEl);
      // Parse degree and field (e.g., "Bachelor of Science - BS, Computer Science")
      const parts = degreeText.split(',');
      if (parts.length > 0) {
        education.degree = parts[0].trim();
        if (parts.length > 1) {
          education.field = parts.slice(1).join(',').trim();
        }
      }
    }
    
    // Extract dates
    const dateEl = element.querySelector('.pvs-entity__caption-wrapper');
    const dateText = BaseExtractor.extractTextContent(dateEl);
    if (dateText) {
      const dateMatch = dateText.match(/(\d{4})\s*-\s*(\d{4}|Present)/i);
      if (dateMatch) {
        education.startDate = dateMatch[1];
        education.endDate = dateMatch[2];
      }
      education.duration = dateText;
    }
    
    // Extract description/activities
    const descEl = element.querySelector('.pvs-list__outer-container > ul li');
    if (descEl) {
      const descText = BaseExtractor.extractTextContent(descEl);
      if (descText.toLowerCase().includes('activities')) {
        education.activities = descText;
      } else {
        education.description = descText;
      }
    }
    
    return education;
  },
  
  /**
   * Extract detailed education information
   * @param {Element} section - Education section
   * @returns {Array<Object>} Detailed education data
   */
  async extractDetailedEducation(section) {
    const detailedItems = await this.extractEducationItems(section);
    
    // Enhance with additional analysis
    return detailedItems.map(item => ({
      ...item,
      degreeLevel: this.classifyDegreeLevel(item.degree),
      fieldCategory: this.categorizeField(item.field),
      isOngoing: item.endDate === 'Present',
      duration: this.calculateDuration(item.startDate, item.endDate)
    }));
  },
  
  /**
   * Determine highest degree level
   * @param {Array<Object>} educationItems - Education items
   * @returns {string} Highest degree
   */
  determineHighestDegree(educationItems) {
    const levels = {
      'phd': 5,
      'doctorate': 5,
      'master': 4,
      'mba': 4,
      'bachelor': 3,
      'associate': 2,
      'certificate': 1
    };
    
    let highest = 'none';
    let highestLevel = 0;
    
    educationItems.forEach(item => {
      const degreeLower = (item.degree || '').toLowerCase();
      
      for (const [degree, level] of Object.entries(levels)) {
        if (degreeLower.includes(degree) && level > highestLevel) {
          highest = degree;
          highestLevel = level;
        }
      }
    });
    
    return highest;
  },
  
  /**
   * Classify degree level
   * @param {string} degree - Degree text
   * @returns {string} Degree level
   */
  classifyDegreeLevel(degree) {
    const degreeLower = degree.toLowerCase();
    
    if (degreeLower.includes('phd') || degreeLower.includes('doctorate')) {
      return 'doctoral';
    } else if (degreeLower.includes('master') || degreeLower.includes('mba')) {
      return 'masters';
    } else if (degreeLower.includes('bachelor')) {
      return 'bachelors';
    } else if (degreeLower.includes('associate')) {
      return 'associates';
    } else if (degreeLower.includes('certificate') || degreeLower.includes('certification')) {
      return 'certificate';
    }
    
    return 'other';
  },
  
  /**
   * Categorize field of study
   * @param {string} field - Field text
   * @returns {string} Field category
   */
  categorizeField(field) {
    const fieldLower = field.toLowerCase();
    
    const categories = {
      'stem': /computer|engineering|mathematics|science|technology|physics|chemistry|biology/i,
      'business': /business|management|finance|marketing|economics|accounting|mba/i,
      'arts': /art|design|music|theater|literature|creative|media/i,
      'social': /psychology|sociology|anthropology|political|social|history/i,
      'medical': /medicine|medical|nursing|health|pharmacy|dentistry/i,
      'law': /law|legal|jurisprudence/i,
      'education': /education|teaching|pedagogy/i
    };
    
    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(fieldLower)) {
        return category;
      }
    }
    
    return 'other';
  },
  
  /**
   * Calculate education duration
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {number} Duration in years
   */
  calculateDuration(startDate, endDate) {
    if (!startDate) return 0;
    
    const start = parseInt(startDate);
    const end = endDate === 'Present' ? new Date().getFullYear() : parseInt(endDate);
    
    return end - start;
  },
  
  /**
   * Calculate total education years
   * @param {Array<Object>} education - Education items
   * @returns {number} Total years
   */
  calculateTotalEducationYears(education) {
    return education.reduce((total, item) => {
      return total + (item.duration || 0);
    }, 0);
  },
  
  /**
   * Check if education is recent (within 5 years)
   * @param {string} endDate - End date
   * @returns {boolean}
   */
  isRecent(endDate) {
    if (endDate === 'Present') return true;
    
    const year = parseInt(endDate);
    const currentYear = new Date().getFullYear();
    
    return (currentYear - year) <= 5;
  },
  
  /**
   * Extract unique fields of study
   * @param {Array<Object>} education - Education items
   * @returns {Array<string>} Fields
   */
  extractFieldsOfStudy(education) {
    const fields = new Set();
    
    education.forEach(item => {
      if (item.field) {
        fields.add(item.fieldCategory);
      }
    });
    
    return Array.from(fields);
  },
  
  /**
   * Summarize education for AI
   * @param {Array<Object>} education - Education items
   * @returns {string} Summary
   */
  summarizeEducation(education) {
    if (education.length === 0) return 'No education listed';
    
    const parts = [];
    
    education.forEach(item => {
      let summary = item.degree || 'Degree';
      if (item.field) summary += ` in ${item.field}`;
      summary += ` from ${item.school}`;
      if (item.endDate) summary += ` (${item.endDate})`;
      
      parts.push(summary);
    });
    
    return parts.join('; ');
  }
};/**
 * Recommendations Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile recommendations section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const RecommendationsExtractor = {
  name: 'recommendations',
  
  selectors: [
    'section[data-section="recommendations"]',
    'section:has(h2:contains("Recommendations"))',
    'div[data-view-name="profile-card"]:has(h2:contains("Recommendations"))',
    'section.pv-recommendations-section',
    'section#recommendations-section'
  ],
  
  /**
   * Quick scan for recommendations section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Recommendations');
    const exists = !!section;
    
    let receivedCount = 0;
    let givenCount = 0;
    
    if (exists) {
      // Look for tabs or separate sections
      const receivedTab = section.querySelector('[aria-label*="received"], button:contains("Received")');
      const givenTab = section.querySelector('[aria-label*="given"], button:contains("Given")');
      
      // Count visible recommendations
      const recommendationItems = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      
      // Try to distinguish between received and given
      if (receivedTab && receivedTab.getAttribute('aria-selected') === 'true') {
        receivedCount = recommendationItems.length;
      } else if (givenTab && givenTab.getAttribute('aria-selected') === 'true') {
        givenCount = recommendationItems.length;
      } else {
        // Default to received if no tabs
        receivedCount = recommendationItems.length;
      }
    }
    
    Logger.debug(`[RecommendationsExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      receivedCount,
      givenCount
    });
    
    return {
      exists,
      receivedCount,
      givenCount,
      hasRecommendations: receivedCount > 0 || givenCount > 0
    };
  },
  
  /**
   * Extract recommendations data for completeness scoring
   * @returns {Object} Basic recommendations data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[RecommendationsExtractor] Recommendations section not found');
      return {
        exists: false,
        count: 0,
        receivedCount: 0,
        givenCount: 0
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Recommendations');
    
    // Try to get both received and given counts
    const counts = await this.extractRecommendationCounts(section);
    
    const result = {
      exists: true,
      count: counts.received + counts.given,
      receivedCount: counts.received,
      givenCount: counts.given,
      hasRecommendations: counts.received > 0,
      isActive: counts.given > 0, // Shows if user gives recommendations
      ratio: counts.received > 0 ? (counts.given / counts.received).toFixed(2) : 0
    };
    
    Logger.info(`[RecommendationsExtractor] Extracted ${result.count} recommendations (${result.receivedCount} received, ${result.givenCount} given) in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed recommendations data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Recommendations');
    
    // Extract detailed recommendations
    const received = await this.extractReceivedRecommendations(section);
    const given = await this.extractGivenRecommendations(section);
    
    const result = {
      ...basicData,
      received: received,
      given: given,
      
      // Analysis features
      recommenderRoles: this.extractRecommenderRoles(received),
      recommendationKeywords: this.extractKeywords(received),
      sentimentAnalysis: this.analyzeSentiments(received),
      relationshipTypes: this.categorizeRelationships(received),
      skillsMentioned: this.extractMentionedSkills(received),
      averageLength: this.calculateAverageLength(received),
      
      // Time analysis
      mostRecentDate: this.getMostRecentDate(received),
      isCurrentlyEndorsed: this.hasRecentRecommendations(received),
      
      // For AI processing
      recommendationChunks: this.prepareForAI(received)
    };
    
    Logger.info(`[RecommendationsExtractor] Deep extraction completed in ${Date.now() - startTime}ms`, {
      receivedDetails: received.length,
      givenDetails: given.length
    });
    
    return result;
  },
  
  /**
   * Extract recommendation counts
   * @param {Element} section - Recommendations section
   * @returns {Object} Counts
   */
  async extractRecommendationCounts(section) {
    const counts = { received: 0, given: 0 };
    
    // Check for tab buttons with counts
    const tabSelectors = [
      'button[role="tab"]',
      '.artdeco-tabpanel button',
      '[aria-label*="received"]',
      '[aria-label*="given"]'
    ];
    
    for (const selector of tabSelectors) {
      const tabs = section.querySelectorAll(selector);
      tabs.forEach(tab => {
        const text = tab.textContent || tab.getAttribute('aria-label') || '';
        
        const receivedMatch = text.match(/received[^\d]*(\d+)/i);
        if (receivedMatch) {
          counts.received = parseInt(receivedMatch[1]);
        }
        
        const givenMatch = text.match(/given[^\d]*(\d+)/i);
        if (givenMatch) {
          counts.given = parseInt(givenMatch[1]);
        }
      });
    }
    
    // If no tabs found, count visible items as received
    if (counts.received === 0 && counts.given === 0) {
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      counts.received = items.length;
    }
    
    return counts;
  },
  
  /**
   * Extract received recommendations
   * @param {Element} section - Recommendations section
   * @returns {Array<Object>} Received recommendations
   */
  async extractReceivedRecommendations(section) {
    const recommendations = [];
    
    // Click on received tab if exists
    const receivedTab = section.querySelector('[aria-label*="received"], button:contains("Received")');
    if (receivedTab && receivedTab.getAttribute('aria-selected') !== 'true') {
      try {
        receivedTab.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        Logger.warn('[RecommendationsExtractor] Failed to click received tab', error);
      }
    }
    
    // Extract recommendation items
    const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const item of items) {
      const recommendation = await this.extractRecommendationItem(item);
      if (recommendation.recommenderName) {
        recommendations.push(recommendation);
      }
    }
    
    return recommendations;
  },
  
  /**
   * Extract given recommendations
   * @param {Element} section - Recommendations section
   * @returns {Array<Object>} Given recommendations
   */
  async extractGivenRecommendations(section) {
    const recommendations = [];
    
    // Click on given tab if exists
    const givenTab = section.querySelector('[aria-label*="given"], button:contains("Given")');
    if (givenTab) {
      try {
        givenTab.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Extract items after tab switch
        const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
        
        for (const item of items) {
          const recommendation = await this.extractRecommendationItem(item);
          if (recommendation.recommenderName) {
            recommendations.push(recommendation);
          }
        }
      } catch (error) {
        Logger.warn('[RecommendationsExtractor] Failed to extract given recommendations', error);
      }
    }
    
    return recommendations;
  },
  
  /**
   * Extract single recommendation item
   * @param {Element} element - Recommendation element
   * @returns {Object} Recommendation data
   */
  async extractRecommendationItem(element) {
    const recommendation = {
      recommenderName: '',
      recommenderTitle: '',
      relationship: '',
      text: '',
      date: ''
    };
    
    // Extract recommender name
    const nameEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    recommendation.recommenderName = BaseExtractor.extractTextContent(nameEl);
    
    // Extract recommender title and relationship
    const subtitleEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    if (subtitleEl) {
      const subtitleText = BaseExtractor.extractTextContent(subtitleEl);
      // Parse "Title, Relationship, Date"
      const parts = subtitleText.split(',').map(p => p.trim());
      if (parts.length > 0) recommendation.recommenderTitle = parts[0];
      if (parts.length > 1) recommendation.relationship = parts[1];
      if (parts.length > 2) recommendation.date = parts[2];
    }
    
    // Extract recommendation text
    const textEl = element.querySelector('.pvs-list__outer-container span[aria-hidden="true"], .recommendation-text');
    recommendation.text = BaseExtractor.extractTextContent(textEl);
    
    return recommendation;
  },
  
  /**
   * Extract recommender roles/titles
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Unique roles
   */
  extractRecommenderRoles(recommendations) {
    const roles = new Set();
    
    recommendations.forEach(rec => {
      if (rec.recommenderTitle) {
        // Extract role from title (e.g., "Senior Developer at Company" -> "Senior Developer")
        const role = rec.recommenderTitle.split(' at ')[0].trim();
        roles.add(role);
      }
    });
    
    return Array.from(roles);
  },
  
  /**
   * Extract keywords from recommendations
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Keywords
   */
  extractKeywords(recommendations) {
    const keywords = {};
    const stopWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at']);
    
    recommendations.forEach(rec => {
      const words = rec.text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));
      
      words.forEach(word => {
        keywords[word] = (keywords[word] || 0) + 1;
      });
    });
    
    // Return top keywords
    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  },
  
  /**
   * Analyze sentiments of recommendations
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Object} Sentiment analysis
   */
  analyzeSentiments(recommendations) {
    const sentiments = {
      positive: 0,
      neutral: 0,
      negative: 0
    };
    
    const positiveWords = ['excellent', 'outstanding', 'exceptional', 'great', 'amazing', 'brilliant', 'talented', 'skilled', 'professional', 'dedicated'];
    const negativeWords = ['difficult', 'challenging', 'issue', 'problem', 'concern'];
    
    recommendations.forEach(rec => {
      const text = rec.text.toLowerCase();
      let score = 0;
      
      positiveWords.forEach(word => {
        if (text.includes(word)) score++;
      });
      
      negativeWords.forEach(word => {
        if (text.includes(word)) score--;
      });
      
      if (score > 0) sentiments.positive++;
      else if (score < 0) sentiments.negative++;
      else sentiments.neutral++;
    });
    
    return sentiments;
  },
  
  /**
   * Categorize relationships
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Object} Relationship categories
   */
  categorizeRelationships(recommendations) {
    const categories = {
      manager: 0,
      colleague: 0,
      report: 0,
      client: 0,
      other: 0
    };
    
    recommendations.forEach(rec => {
      const rel = (rec.relationship || '').toLowerCase();
      
      if (rel.includes('managed') || rel.includes('reported')) {
        categories.manager++;
      } else if (rel.includes('worked with') || rel.includes('colleague')) {
        categories.colleague++;
      } else if (rel.includes('managed directly')) {
        categories.report++;
      } else if (rel.includes('client') || rel.includes('customer')) {
        categories.client++;
      } else {
        categories.other++;
      }
    });
    
    return categories;
  },
  
  /**
   * Extract mentioned skills
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Skills mentioned
   */
  extractMentionedSkills(recommendations) {
    const skills = new Set();
    
    const skillPatterns = [
      /\b(leadership|communication|teamwork|problem solving|analytical|technical|creative|strategic)\b/gi,
      /\b(programming|software|development|engineering|design|analysis|management)\b/gi,
      /\b(java|python|javascript|react|node|sql|aws|cloud|data)\b/gi
    ];
    
    recommendations.forEach(rec => {
      skillPatterns.forEach(pattern => {
        const matches = rec.text.match(pattern);
        if (matches) {
          matches.forEach(skill => skills.add(skill.toLowerCase()));
        }
      });
    });
    
    return Array.from(skills);
  },
  
  /**
   * Calculate average recommendation length
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {number} Average length
   */
  calculateAverageLength(recommendations) {
    if (recommendations.length === 0) return 0;
    
    const totalLength = recommendations.reduce((sum, rec) => sum + rec.text.length, 0);
    return Math.round(totalLength / recommendations.length);
  },
  
  /**
   * Get most recent recommendation date
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {string} Most recent date
   */
  getMostRecentDate(recommendations) {
    // This is simplified - would need proper date parsing
    return recommendations[0]?.date || 'Unknown';
  },
  
  /**
   * Check if has recent recommendations (within 2 years)
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {boolean}
   */
  hasRecentRecommendations(recommendations) {
    // Simplified check - would need proper date parsing
    return recommendations.some(rec => {
      const date = rec.date || '';
      return date.includes('2024') || date.includes('2023');
    });
  },
  
  /**
   * Prepare recommendations for AI processing
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<Object>} Chunked recommendations
   */
  prepareForAI(recommendations) {
    return recommendations.map((rec, index) => ({
      index: index + 1,
      recommender: `${rec.recommenderName} (${rec.recommenderTitle})`,
      relationship: rec.relationship,
      text: BaseExtractor.chunkText(rec.text, 500),
      keywords: this.extractKeywords([rec])
    }));
  }
};/**
 * Certifications Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile certifications section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const CertificationsExtractor = {
  name: 'certifications',
  
  selectors: [
    'section[data-section="certifications"]',
    'section:has(h2:contains("Licenses & certifications"))',
    'section:has(h2:contains("Certifications"))',
    'div[data-view-name="profile-card"]:has(h2:contains("certifications"))',
    'section#licenses-and-certifications',
    'section.pv-accomplishments-section:has(h3:contains("Certification"))'
  ],
  
  /**
   * Quick scan for certifications section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Certifications');
    const exists = !!section;
    
    let visibleCount = 0;
    if (exists) {
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      visibleCount = items.length;
    }
    
    Logger.debug(`[CertificationsExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      visibleCount
    });
    
    return {
      exists,
      visibleCount
    };
  },
  
  /**
   * Extract certifications data for completeness scoring
   * @returns {Object} Basic certifications data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[CertificationsExtractor] Certifications section not found');
      return {
        exists: false,
        count: 0,
        certifications: []
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Certifications');
    const certifications = await this.extractCertificationItems(section);
    
    const result = {
      exists: true,
      count: certifications.length,
      certifications: certifications.map(cert => ({
        name: cert.name,
        issuer: cert.issuer
      })),
      hasActiveCertifications: certifications.some(cert => !cert.expired),
      hasTechCertifications: certifications.some(cert => this.isTechnicalCertification(cert.name))
    };
    
    Logger.info(`[CertificationsExtractor] Extracted ${result.count} certifications in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed certifications data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Certifications');
    const detailedCertifications = await this.extractDetailedCertifications(section);
    
    const result = {
      ...basicData,
      certifications: detailedCertifications,
      
      // Analysis features
      certificationsByIssuer: this.groupByIssuer(detailedCertifications),
      certificationCategories: this.categorizeCertifications(detailedCertifications),
      recentCertifications: detailedCertifications.filter(cert => this.isRecent(cert.issueDate)),
      expiringCertifications: detailedCertifications.filter(cert => this.isExpiringSoon(cert.expirationDate)),
      
      // Metrics
      averageCertificationAge: this.calculateAverageAge(detailedCertifications),
      renewalRate: this.calculateRenewalRate(detailedCertifications),
      
      // For AI processing
      certificationSummary: this.summarizeCertifications(detailedCertifications)
    };
    
    Logger.info(`[CertificationsExtractor] Deep extraction completed in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Extract certification items
   * @param {Element} section - Certifications section
   * @returns {Array<Object>} Certification items
   */
  async extractCertificationItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractCertificationItem(element);
      if (item.name) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single certification item
   * @param {Element} element - Certification element
   * @returns {Object} Certification data
   */
  async extractCertificationItem(element) {
    const certification = {
      name: '',
      issuer: '',
      issueDate: '',
      expirationDate: '',
      credentialId: '',
      credentialUrl: '',
      expired: false
    };
    
    // Extract certification name
    const nameEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    certification.name = BaseExtractor.extractTextContent(nameEl);
    
    // Extract issuer
    const issuerEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    certification.issuer = BaseExtractor.extractTextContent(issuerEl);
    
    // Extract dates
    const dateEl = element.querySelector('.pvs-entity__caption-wrapper');
    const dateText = BaseExtractor.extractTextContent(dateEl);
    if (dateText) {
      // Parse "Issued Jan 2023 · Expires Jan 2025"
      const issuedMatch = dateText.match(/Issued\s+([A-Za-z]+\s+\d{4})/);
      if (issuedMatch) {
        certification.issueDate = issuedMatch[1];
      }
      
      const expiresMatch = dateText.match(/Expires?\s+([A-Za-z]+\s+\d{4})/);
      if (expiresMatch) {
        certification.expirationDate = expiresMatch[1];
        // Check if expired
        certification.expired = this.isExpired(expiresMatch[1]);
      }
      
      // No expiration date mentioned
      if (!expiresMatch && dateText.includes('No Expiration')) {
        certification.expirationDate = 'No Expiration';
      }
    }
    
    // Extract credential ID
    const credentialEl = element.querySelector('.pvs-list__outer-container');
    if (credentialEl) {
      const credentialText = BaseExtractor.extractTextContent(credentialEl);
      const idMatch = credentialText.match(/Credential ID[:\s]+([^\s]+)/i);
      if (idMatch) {
        certification.credentialId = idMatch[1];
      }
    }
    
    // Extract credential URL
    const linkEl = element.querySelector('a[href*="credential"]');
    if (linkEl) {
      certification.credentialUrl = linkEl.href;
    }
    
    return certification;
  },
  
  /**
   * Extract detailed certification information
   * @param {Element} section - Certifications section
   * @returns {Array<Object>} Detailed certifications
   */
  async extractDetailedCertifications(section) {
    const certifications = await this.extractCertificationItems(section);
    
    // Enhance with additional analysis
    return certifications.map(cert => ({
      ...cert,
      category: this.categorizeCertification(cert.name, cert.issuer),
      isActive: !cert.expired && cert.expirationDate !== 'No Expiration',
      yearsSinceIssue: this.calculateYearsSince(cert.issueDate),
      yearsUntilExpiration: this.calculateYearsUntil(cert.expirationDate)
    }));
  },
  
  /**
   * Check if certification is technical
   * @param {string} name - Certification name
   * @returns {boolean}
   */
  isTechnicalCertification(name) {
    const techPatterns = /\b(AWS|Azure|Google Cloud|GCP|Cisco|Microsoft|Oracle|VMware|CompTIA|Linux|Red Hat|Docker|Kubernetes|Certified.*Engineer|Certified.*Developer|Certified.*Architect)\b/i;
    return techPatterns.test(name);
  },
  
  /**
   * Check if date is expired
   * @param {string} dateStr - Date string
   * @returns {boolean}
   */
  isExpired(dateStr) {
    if (!dateStr || dateStr === 'No Expiration') return false;
    
    // Simple comparison - would need proper date parsing
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.match(/\d{4}/)?.[0] || '9999');
    
    return year < currentYear;
  },
  
  /**
   * Check if certification is recent (within 2 years)
   * @param {string} dateStr - Issue date
   * @returns {boolean}
   */
  isRecent(dateStr) {
    if (!dateStr) return false;
    
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.match(/\d{4}/)?.[0] || '0');
    
    return (currentYear - year) <= 2;
  },
  
  /**
   * Check if certification is expiring soon (within 6 months)
   * @param {string} dateStr - Expiration date
   * @returns {boolean}
   */
  isExpiringSoon(dateStr) {
    if (!dateStr || dateStr === 'No Expiration') return false;
    
    // Simplified check - would need proper date parsing
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.match(/\d{4}/)?.[0] || '9999');
    
    return year === currentYear || year === currentYear + 1;
  },
  
  /**
   * Categorize certification
   * @param {string} name - Certification name
   * @param {string} issuer - Issuer name
   * @returns {string} Category
   */
  categorizeCertification(name, issuer) {
    const categories = {
      'cloud': /AWS|Azure|Google Cloud|GCP|Cloud/i,
      'security': /Security|CISSP|CEH|CompTIA Security/i,
      'networking': /Cisco|CCNA|CCNP|Network/i,
      'projectManagement': /PMP|Agile|Scrum|PRINCE2/i,
      'database': /Oracle|SQL|Database|MongoDB/i,
      'programming': /Java|Python|JavaScript|Developer/i,
      'dataScience': /Data Science|Machine Learning|AI|Analytics/i,
      'devops': /DevOps|Docker|Kubernetes|Jenkins/i
    };
    
    const combined = `${name} ${issuer}`;
    
    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(combined)) {
        return category;
      }
    }
    
    return 'other';
  },
  
  /**
   * Group certifications by issuer
   * @param {Array<Object>} certifications - Certifications
   * @returns {Object} Grouped certifications
   */
  groupByIssuer(certifications) {
    const grouped = {};
    
    certifications.forEach(cert => {
      const issuer = cert.issuer || 'Unknown';
      if (!grouped[issuer]) {
        grouped[issuer] = [];
      }
      grouped[issuer].push(cert);
    });
    
    return grouped;
  },
  
  /**
   * Categorize all certifications
   * @param {Array<Object>} certifications - Certifications
   * @returns {Object} Categories with counts
   */
  categorizeCertifications(certifications) {
    const categories = {};
    
    certifications.forEach(cert => {
      const category = cert.category || 'other';
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return categories;
  },
  
  /**
   * Calculate years since issue
   * @param {string} dateStr - Issue date
   * @returns {number} Years
   */
  calculateYearsSince(dateStr) {
    if (!dateStr) return 0;
    
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.match(/\d{4}/)?.[0] || currentYear);
    
    return currentYear - year;
  },
  
  /**
   * Calculate years until expiration
   * @param {string} dateStr - Expiration date
   * @returns {number} Years
   */
  calculateYearsUntil(dateStr) {
    if (!dateStr || dateStr === 'No Expiration') return 999;
    
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.match(/\d{4}/)?.[0] || currentYear);
    
    return year - currentYear;
  },
  
  /**
   * Calculate average certification age
   * @param {Array<Object>} certifications - Certifications
   * @returns {number} Average age in years
   */
  calculateAverageAge(certifications) {
    if (certifications.length === 0) return 0;
    
    const totalAge = certifications.reduce((sum, cert) => {
      return sum + (cert.yearsSinceIssue || 0);
    }, 0);
    
    return Math.round(totalAge / certifications.length);
  },
  
  /**
   * Calculate renewal rate
   * @param {Array<Object>} certifications - Certifications
   * @returns {number} Renewal rate percentage
   */
  calculateRenewalRate(certifications) {
    const withExpiration = certifications.filter(cert => 
      cert.expirationDate && cert.expirationDate !== 'No Expiration'
    );
    
    if (withExpiration.length === 0) return 100;
    
    const active = withExpiration.filter(cert => !cert.expired).length;
    
    return Math.round((active / withExpiration.length) * 100);
  },
  
  /**
   * Summarize certifications for AI
   * @param {Array<Object>} certifications - Certifications
   * @returns {string} Summary
   */
  summarizeCertifications(certifications) {
    if (certifications.length === 0) return 'No certifications listed';
    
    const parts = [];
    const byCategory = {};
    
    certifications.forEach(cert => {
      const category = cert.category || 'other';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(cert);
    });
    
    Object.entries(byCategory).forEach(([category, certs]) => {
      parts.push(`${category}: ${certs.map(c => c.name).join(', ')}`);
    });
    
    return parts.join('; ');
  }
};/**
 * Projects Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile projects section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const ProjectsExtractor = {
  name: 'projects',
  
  selectors: [
    'section[data-section="projects"]',
    'section:has(h2:contains("Projects"))',
    'div[data-view-name="profile-card"]:has(h2:contains("Projects"))',
    'section.pv-accomplishments-section:has(h3:contains("Project"))',
    'section#projects-section'
  ],
  
  /**
   * Quick scan for projects section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Projects');
    const exists = !!section;
    
    let visibleCount = 0;
    if (exists) {
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      visibleCount = items.length;
    }
    
    Logger.debug(`[ProjectsExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      visibleCount
    });
    
    return {
      exists,
      visibleCount
    };
  },
  
  /**
   * Extract projects data for completeness scoring
   * @returns {Object} Basic projects data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[ProjectsExtractor] Projects section not found');
      return {
        exists: false,
        count: 0,
        projects: []
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Projects');
    const projects = await this.extractProjectItems(section);
    
    const result = {
      exists: true,
      count: projects.length,
      projects: projects.map(proj => ({
        name: proj.name,
        hasDescription: proj.description.length > 0
      })),
      hasTechnicalProjects: projects.some(proj => this.isTechnicalProject(proj)),
      hasRecentProjects: projects.some(proj => this.isRecentProject(proj.date))
    };
    
    Logger.info(`[ProjectsExtractor] Extracted ${result.count} projects in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed projects data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Projects');
    const detailedProjects = await this.extractDetailedProjects(section);
    
    const result = {
      ...basicData,
      projects: detailedProjects,
      
      // Analysis features
      projectCategories: this.categorizeProjects(detailedProjects),
      technologiesUsed: this.extractTechnologies(detailedProjects),
      projectTypes: this.classifyProjectTypes(detailedProjects),
      collaborativeProjects: detailedProjects.filter(p => p.hasCollaborators),
      
      // Metrics
      averageDescriptionLength: this.calculateAverageDescriptionLength(detailedProjects),
      projectsWithLinks: detailedProjects.filter(p => p.projectUrl).length,
      
      // For AI processing
      projectSummaries: this.prepareForAI(detailedProjects)
    };
    
    Logger.info(`[ProjectsExtractor] Deep extraction completed in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Extract project items
   * @param {Element} section - Projects section
   * @returns {Array<Object>} Project items
   */
  async extractProjectItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractProjectItem(element);
      if (item.name) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single project item
   * @param {Element} element - Project element
   * @returns {Object} Project data
   */
  async extractProjectItem(element) {
    const project = {
      name: '',
      description: '',
      date: '',
      collaborators: [],
      projectUrl: '',
      technologies: []
    };
    
    // Extract project name
    const nameEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    project.name = BaseExtractor.extractTextContent(nameEl);
    
    // Extract date
    const dateEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    project.date = BaseExtractor.extractTextContent(dateEl);
    
    // Extract description
    const descEl = element.querySelector('.pvs-list__outer-container span[aria-hidden="true"], .inline-show-more-text span[aria-hidden="true"]');
    project.description = BaseExtractor.extractTextContent(descEl);
    
    // Extract project URL
    const linkEl = element.querySelector('a[href*="project"], a[aria-label*="project"]');
    if (linkEl) {
      project.projectUrl = linkEl.href;
    }
    
    // Extract collaborators (if mentioned)
    const collaboratorText = project.description.match(/collaborated with|team of|worked with/i);
    if (collaboratorText) {
      project.hasCollaborators = true;
    }
    
    return project;
  },
  
  /**
   * Extract detailed project information
   * @param {Element} section - Projects section
   * @returns {Array<Object>} Detailed projects
   */
  async extractDetailedProjects(section) {
    const projects = await this.extractProjectItems(section);
    
    // Enhance with additional analysis
    return projects.map(proj => ({
      ...proj,
      technologies: this.extractProjectTechnologies(proj),
      category: this.categorizeProject(proj),
      type: this.classifyProjectType(proj),
      hasCollaborators: proj.hasCollaborators || this.detectCollaboration(proj.description),
      complexity: this.assessComplexity(proj),
      keywords: this.extractKeywords(proj)
    }));
  },
  
  /**
   * Check if project is technical
   * @param {Object} project - Project data
   * @returns {boolean}
   */
  isTechnicalProject(project) {
    const techIndicators = /\b(software|application|website|app|system|platform|tool|api|database|algorithm|machine learning|AI|data)\b/i;
    return techIndicators.test(project.name + ' ' + project.description);
  },
  
  /**
   * Check if project is recent
   * @param {string} dateStr - Project date
   * @returns {boolean}
   */
  isRecentProject(dateStr) {
    if (!dateStr) return false;
    
    const currentYear = new Date().getFullYear();
    const yearMatch = dateStr.match(/\d{4}/);
    
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      return (currentYear - year) <= 2;
    }
    
    return false;
  },
  
  /**
   * Extract technologies from project
   * @param {Object} project - Project data
   * @returns {Array<string>} Technologies
   */
  extractProjectTechnologies(project) {
    const technologies = new Set();
    
    const techPatterns = [
      /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|Go|Rust|PHP|Swift)\b/gi,
      /\b(React|Angular|Vue|Node\.js|Express|Django|Spring|Rails)\b/gi,
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git)\b/gi,
      /\b(MongoDB|PostgreSQL|MySQL|Redis|Elasticsearch)\b/gi,
      /\b(TensorFlow|PyTorch|Scikit-learn|Pandas|NumPy)\b/gi
    ];
    
    const searchText = project.name + ' ' + project.description;
    
    techPatterns.forEach(pattern => {
      const matches = searchText.match(pattern);
      if (matches) {
        matches.forEach(tech => technologies.add(tech));
      }
    });
    
    return Array.from(technologies);
  },
  
  /**
   * Categorize project
   * @param {Object} project - Project data
   * @returns {string} Category
   */
  categorizeProject(project) {
    const searchText = (project.name + ' ' + project.description).toLowerCase();
    
    const categories = {
      'web': /website|web app|frontend|backend|full stack/i,
      'mobile': /mobile|android|ios|app/i,
      'data': /data|analytics|visualization|dashboard|report/i,
      'ml': /machine learning|ml|ai|artificial intelligence|neural/i,
      'automation': /automation|script|bot|workflow/i,
      'opensource': /open source|github|contribution/i,
      'research': /research|study|analysis|paper/i
    };
    
    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(searchText)) {
        return category;
      }
    }
    
    return 'other';
  },
  
  /**
   * Classify project type
   * @param {Object} project - Project data
   * @returns {string} Type
   */
  classifyProjectType(project) {
    const searchText = (project.name + ' ' + project.description).toLowerCase();
    
    if (/personal|hobby|side/i.test(searchText)) return 'personal';
    if (/academic|university|course|school/i.test(searchText)) return 'academic';
    if (/work|professional|company|client/i.test(searchText)) return 'professional';
    if (/volunteer|nonprofit|charity/i.test(searchText)) return 'volunteer';
    
    return 'unspecified';
  },
  
  /**
   * Detect collaboration
   * @param {string} description - Project description
   * @returns {boolean}
   */
  detectCollaboration(description) {
    const collaborationIndicators = /\b(team|collaborated|worked with|group|together|we|our)\b/i;
    return collaborationIndicators.test(description);
  },
  
  /**
   * Assess project complexity
   * @param {Object} project - Project data
   * @returns {string} Complexity level
   */
  assessComplexity(project) {
    let score = 0;
    
    // Length of description
    if (project.description.length > 500) score += 2;
    else if (project.description.length > 200) score += 1;
    
    // Number of technologies
    if (project.technologies.length > 5) score += 2;
    else if (project.technologies.length > 2) score += 1;
    
    // Collaboration
    if (project.hasCollaborators) score += 1;
    
    // Technical indicators
    if (/architecture|system design|scalable|distributed/i.test(project.description)) score += 2;
    
    if (score >= 5) return 'complex';
    if (score >= 3) return 'moderate';
    return 'simple';
  },
  
  /**
   * Extract keywords from project
   * @param {Object} project - Project data
   * @returns {Array<string>} Keywords
   */
  extractKeywords(project) {
    const stopWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i']);
    
    const words = (project.name + ' ' + project.description)
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    // Count frequency
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Return top keywords
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  },
  
  /**
   * Categorize all projects
   * @param {Array<Object>} projects - Projects
   * @returns {Object} Categories with counts
   */
  categorizeProjects(projects) {
    const categories = {};
    
    projects.forEach(proj => {
      const category = proj.category || 'other';
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return categories;
  },
  
  /**
   * Extract all technologies
   * @param {Array<Object>} projects - Projects
   * @returns {Array<string>} All unique technologies
   */
  extractTechnologies(projects) {
    const allTech = new Set();
    
    projects.forEach(proj => {
      (proj.technologies || []).forEach(tech => allTech.add(tech));
    });
    
    return Array.from(allTech);
  },
  
  /**
   * Classify all project types
   * @param {Array<Object>} projects - Projects
   * @returns {Object} Types with counts
   */
  classifyProjectTypes(projects) {
    const types = {};
    
    projects.forEach(proj => {
      const type = proj.type || 'unspecified';
      types[type] = (types[type] || 0) + 1;
    });
    
    return types;
  },
  
  /**
   * Calculate average description length
   * @param {Array<Object>} projects - Projects
   * @returns {number} Average length
   */
  calculateAverageDescriptionLength(projects) {
    if (projects.length === 0) return 0;
    
    const totalLength = projects.reduce((sum, proj) => sum + proj.description.length, 0);
    return Math.round(totalLength / projects.length);
  },
  
  /**
   * Prepare projects for AI processing
   * @param {Array<Object>} projects - Projects
   * @returns {Array<Object>} Prepared projects
   */
  prepareForAI(projects) {
    return projects.map((proj, index) => ({
      index: index + 1,
      name: proj.name,
      category: proj.category,
      type: proj.type,
      technologies: proj.technologies.join(', '),
      complexity: proj.complexity,
      description: BaseExtractor.chunkText(proj.description, 500),
      keywords: proj.keywords.slice(0, 5)
    }));
  }
};/**
 * Featured Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile featured section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const FeaturedExtractor = {
  name: 'featured',
  
  selectors: [
    'section[data-section="featured"]',
    'section:has(h2:contains("Featured"))',
    'div[data-view-name="profile-card"]:has(h2:contains("Featured"))',
    'section.pv-profile-section:has(.pv-featured-container)',
    'section#featured-section'
  ],
  
  /**
   * Quick scan for featured section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Featured');
    const exists = !!section;
    
    let itemCount = 0;
    if (exists) {
      // Count featured items (posts, articles, media)
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item, .pv-featured-container__item');
      itemCount = items.length;
    }
    
    Logger.debug(`[FeaturedExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      itemCount
    });
    
    return {
      exists,
      itemCount
    };
  },
  
  /**
   * Extract featured data for completeness scoring
   * @returns {Object} Basic featured data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[FeaturedExtractor] Featured section not found');
      return {
        exists: false,
        count: 0,
        hasContent: false
      };
    }
    
    const result = {
      exists: true,
      count: scanResult.itemCount,
      hasContent: scanResult.itemCount > 0
    };
    
    Logger.info(`[FeaturedExtractor] Extracted ${result.count} featured items in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed featured data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists || basicData.count === 0) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Featured');
    const featuredItems = await this.extractFeaturedItems(section);
    
    const result = {
      ...basicData,
      items: featuredItems,
      
      // Analysis features
      itemTypes: this.categorizeItems(featuredItems),
      hasExternalContent: featuredItems.some(item => item.isExternal),
      hasRecentContent: featuredItems.some(item => this.isRecent(item.date)),
      
      // For AI processing
      featuredSummary: this.summarizeFeatured(featuredItems)
    };
    
    Logger.info(`[FeaturedExtractor] Deep extraction completed in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Extract featured items
   * @param {Element} section - Featured section
   * @returns {Array<Object>} Featured items
   */
  async extractFeaturedItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractFeaturedItem(element);
      if (item.title || item.type) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single featured item
   * @param {Element} element - Featured item element
   * @returns {Object} Featured item data
   */
  async extractFeaturedItem(element) {
    const item = {
      title: '',
      type: 'unknown',
      description: '',
      url: '',
      date: '',
      isExternal: false
    };
    
    // Extract title
    const titleEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    item.title = BaseExtractor.extractTextContent(titleEl);
    
    // Extract type (post, article, media, etc.)
    const typeEl = element.querySelector('.t-12, .pv-featured-container__label');
    const typeText = BaseExtractor.extractTextContent(typeEl);
    item.type = this.determineItemType(typeText, item.title);
    
    // Extract description
    const descEl = element.querySelector('.t-14 span[aria-hidden="true"]');
    item.description = BaseExtractor.extractTextContent(descEl);
    
    // Extract URL
    const linkEl = element.querySelector('a[href]');
    if (linkEl) {
      item.url = linkEl.href;
      item.isExternal = !item.url.includes('linkedin.com');
    }
    
    // Extract date if available
    const dateEl = element.querySelector('.t-black--light');
    item.date = BaseExtractor.extractTextContent(dateEl);
    
    return item;
  },
  
  /**
   * Determine item type
   * @param {string} typeText - Type text from element
   * @param {string} title - Item title
   * @returns {string} Item type
   */
  determineItemType(typeText, title) {
    const text = (typeText + ' ' + title).toLowerCase();
    
    if (text.includes('post')) return 'post';
    if (text.includes('article')) return 'article';
    if (text.includes('video')) return 'video';
    if (text.includes('document')) return 'document';
    if (text.includes('link')) return 'link';
    if (text.includes('media')) return 'media';
    
    return 'other';
  },
  
  /**
   * Categorize featured items
   * @param {Array<Object>} items - Featured items
   * @returns {Object} Item types with counts
   */
  categorizeItems(items) {
    const types = {};
    
    items.forEach(item => {
      types[item.type] = (types[item.type] || 0) + 1;
    });
    
    return types;
  },
  
  /**
   * Check if item is recent
   * @param {string} dateStr - Date string
   * @returns {boolean}
   */
  isRecent(dateStr) {
    if (!dateStr) return false;
    
    // Simple check for recent keywords
    const recentIndicators = /today|yesterday|day ago|week ago|month ago/i;
    return recentIndicators.test(dateStr);
  },
  
  /**
   * Summarize featured items for AI
   * @param {Array<Object>} items - Featured items
   * @returns {string} Summary
   */
  summarizeFeatured(items) {
    if (items.length === 0) return 'No featured content';
    
    const typeGroups = {};
    items.forEach(item => {
      if (!typeGroups[item.type]) {
        typeGroups[item.type] = [];
      }
      typeGroups[item.type].push(item.title || 'Untitled');
    });
    
    const parts = [];
    Object.entries(typeGroups).forEach(([type, titles]) => {
      parts.push(`${type}s: ${titles.length} items`);
    });
    
    return parts.join(', ');
  }
};/**
 * Completeness Scorer Module for ElevateLI
 * Calculates profile completeness score based on section data
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const CompletenessScorer = {
  // Section weights (total = 100)
  weights: {
    photo: 5,
    headline: 10,
    about: 20,
    experience: 25,
    skills: 15,
    education: 10,
    recommendations: 10,
    certifications: 3,
    projects: 2
  },
  
  // Section-specific rules
  rules: {
    photo: {
      check: (data) => data.exists || data === true,
      points: 5,
      getMessage: () => "Add a professional photo"
    },
    
    headline: {
      check: (data) => data.charCount >= 50,
      points: 10,
      getMessage: (data) => {
        if (!data.exists) return "Add a professional headline";
        if (data.charCount < 30) return "Expand your headline (minimum 50 characters)";
        if (data.isGeneric) return "Make your headline more specific and value-focused";
        return "Optimize your headline with keywords";
      }
    },
    
    about: {
      check: (data) => data.charCount >= 800,
      points: 20,
      getMessage: (data) => {
        if (!data.exists || data.charCount === 0) return "Add an About section";
        if (data.charCount < 400) return "Expand your About section (aim for 800+ characters)";
        if (data.charCount < 800) return "Add more detail to your About section";
        return "Enhance your About section";
      }
    },
    
    experience: {
      check: (data) => data.count >= 2,
      points: 25,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Add your work experience";
        if (data.count === 1) return "Add more work experiences (at least 2)";
        if (!data.hasCurrentRole) return "Update with your current position";
        return "Enhance experience descriptions";
      }
    },
    
    skills: {
      check: (data) => data.count >= 15,
      points: 15,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Add relevant skills";
        if (data.count < 5) return "Add more skills (aim for 15+)";
        if (data.count < 15) return `Add ${15 - data.count} more skills`;
        return "Optimize your skills section";
      }
    },
    
    education: {
      check: (data) => data.count >= 1,
      points: 10,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Add your education";
        return "Complete your education details";
      }
    },
    
    recommendations: {
      check: (data) => data.count >= 1,
      points: 10,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Request at least one recommendation";
        if (data.count < 3) return "Request more recommendations (aim for 3+)";
        return "Request recent recommendations";
      }
    },
    
    certifications: {
      check: (data) => data.count >= 1,
      points: 3,
      getMessage: () => "Add relevant certifications"
    },
    
    projects: {
      check: (data) => data.count >= 1,
      points: 2,
      getMessage: () => "Showcase projects you've worked on"
    }
  },
  
  /**
   * Calculate completeness for all sections
   * @param {Object} sectionData - Data for all sections
   * @returns {Object} Complete scoring result
   */
  calculate(sectionData) {
    const startTime = Date.now();
    const breakdown = {};
    const recommendations = [];
    let earnedPoints = 0;
    let totalPoints = 0;
    
    // Process each section
    for (const [section, weight] of Object.entries(this.weights)) {
      const data = sectionData[section];
      const rule = this.rules[section];
      
      totalPoints += weight;
      
      if (rule && data !== undefined) {
        const passed = rule.check(data);
        const points = passed ? weight : 0;
        earnedPoints += points;
        
        breakdown[section] = {
          weight,
          earned: points,
          passed,
          data: this.summarizeData(data)
        };
        
        if (!passed) {
          recommendations.push({
            section,
            priority: this.getPriority(section, weight),
            message: rule.getMessage(data),
            impact: weight
          });
        }
      } else {
        // Section not found or no rule
        breakdown[section] = {
          weight,
          earned: 0,
          passed: false,
          data: null
        };
        
        recommendations.push({
          section,
          priority: 'high',
          message: `Add ${section} section`,
          impact: weight
        });
      }
    }
    
    // Sort recommendations by impact
    recommendations.sort((a, b) => b.impact - a.impact);
    
    const percentage = Math.round((earnedPoints / totalPoints) * 100);
    
    console.log(`[CompletenessScorer] Calculated in ${Date.now() - startTime}ms`);
    
    return {
      score: percentage,
      earnedPoints,
      totalPoints,
      breakdown,
      recommendations: recommendations.slice(0, 5), // Top 5 recommendations
      allRecommendations: recommendations,
      isOptimized: percentage >= 85,
      level: this.getLevel(percentage)
    };
  },
  
  /**
   * Calculate section-specific completeness
   * @param {string} section - Section name
   * @param {Object} data - Section data
   * @returns {Object} Section score
   */
  scoreSection(section, data) {
    const weight = this.weights[section];
    const rule = this.rules[section];
    
    if (!weight || !rule) {
      return {
        score: 0,
        maxScore: 0,
        percentage: 0,
        passed: false
      };
    }
    
    const passed = rule.check(data);
    const score = passed ? weight : 0;
    
    return {
      score,
      maxScore: weight,
      percentage: passed ? 100 : 0,
      passed,
      recommendation: !passed ? rule.getMessage(data) : null
    };
  },
  
  /**
   * Get priority level for a section
   * @param {string} section - Section name
   * @param {number} weight - Section weight
   * @returns {string} Priority level
   */
  getPriority(section, weight) {
    if (weight >= 20) return 'critical';
    if (weight >= 10) return 'high';
    if (weight >= 5) return 'medium';
    return 'low';
  },
  
  /**
   * Get completeness level
   * @param {number} percentage - Completeness percentage
   * @returns {string} Level name
   */
  getLevel(percentage) {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 75) return 'good';
    if (percentage >= 60) return 'fair';
    if (percentage >= 40) return 'needs_work';
    return 'poor';
  },
  
  /**
   * Summarize section data for storage
   * @param {Object} data - Section data
   * @returns {Object} Summary
   */
  summarizeData(data) {
    if (!data) return null;
    
    return {
      exists: data.exists || false,
      count: data.count || 0,
      charCount: data.charCount || 0,
      hasContent: BaseExtractor.hasContent(data)
    };
  },
  
  /**
   * Get actionable recommendations
   * @param {Object} scoringResult - Complete scoring result
   * @param {Object} settings - User settings
   * @returns {Array<Object>} Prioritized recommendations
   */
  getActionableRecommendations(scoringResult, settings = {}) {
    const { targetRole, seniorityLevel } = settings;
    const recommendations = [...scoringResult.allRecommendations];
    
    // Adjust priorities based on target role
    if (targetRole) {
      recommendations.forEach(rec => {
        // Boost skills for technical roles
        if (targetRole.includes('engineer') && rec.section === 'skills') {
          rec.priority = 'critical';
        }
        // Boost experience for senior roles
        if (seniorityLevel === 'senior' && rec.section === 'experience') {
          rec.priority = 'critical';
        }
      });
    }
    
    // Group by priority
    const grouped = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    recommendations.forEach(rec => {
      grouped[rec.priority].push(rec);
    });
    
    // Return top recommendations from each priority level
    return [
      ...grouped.critical.slice(0, 2),
      ...grouped.high.slice(0, 2),
      ...grouped.medium.slice(0, 1)
    ];
  }
};/**
 * Quality Scorer Module for ElevateLI
 * Prepares data for AI analysis and processes AI responses
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const QualityScorer = {
  // Section weights for final score calculation
  weights: {
    photo: 0.05,      // 5%
    headline: 0.10,   // 10%
    about: 0.30,      // 30%
    experience: 0.30, // 30%
    skills: 0.15,     // 15%
    education: 0.05,  // 5%
    other: 0.05       // 5% (recommendations, certifications, projects)
  },
  
  /**
   * Prepare profile data for AI analysis
   * @param {Object} profileData - Extracted profile data
   * @param {Object} settings - User settings
   * @param {Object} completenessResult - Completeness scoring result
   * @returns {Object} Prepared data for AI
   */
  prepareForAI(profileData, settings, completenessResult) {
    Logger.info('[QualityScorer] Preparing data for AI analysis');
    
    const prepared = {
      // Meta information
      targetRole: settings.targetRole || 'general professional',
      seniorityLevel: settings.seniorityLevel || 'mid-level',
      customInstructions: settings.customInstructions || '',
      
      // Profile sections
      sections: {},
      
      // Completeness context
      completenessScore: completenessResult.score,
      missingElements: completenessResult.recommendations.map(r => r.message),
      
      // Analysis instructions
      analysisType: settings.batchAnalysis ? 'batch' : 'individual'
    };
    
    // Prepare each section
    if (profileData.headline) {
      prepared.sections.headline = this.prepareHeadline(profileData.headline);
    }
    
    if (profileData.about) {
      prepared.sections.about = this.prepareAbout(profileData.about);
    }
    
    if (profileData.experience) {
      prepared.sections.experience = this.prepareExperience(profileData.experience);
    }
    
    if (profileData.skills) {
      prepared.sections.skills = this.prepareSkills(profileData.skills);
    }
    
    if (profileData.education) {
      prepared.sections.education = this.prepareEducation(profileData.education);
    }
    
    // Other sections (lower weight)
    prepared.sections.other = this.prepareOtherSections(profileData);
    
    Logger.debug('[QualityScorer] Prepared sections:', Object.keys(prepared.sections));
    
    return prepared;
  },
  
  /**
   * Prepare headline section
   * @param {Object} headline - Headline data
   * @returns {Object} Prepared headline
   */
  prepareHeadline(headline) {
    return {
      text: headline.text || '',
      charCount: headline.charCount || 0,
      hasKeywords: headline.hasKeywords || false,
      isGeneric: headline.isGeneric || false,
      analysis: {
        wordCount: headline.wordCount || 0,
        hasPipe: headline.hasPipe || false,
        hasCompany: headline.hasCompany || false,
        hasValue: headline.hasValue || false
      }
    };
  },
  
  /**
   * Prepare about section
   * @param {Object} about - About data
   * @returns {Object} Prepared about
   */
  prepareAbout(about) {
    return {
      text: about.text || '',
      charCount: about.charCount || 0,
      wordCount: about.wordCount || 0,
      paragraphs: about.paragraphs || [],
      analysis: {
        hasCallToAction: about.hasCallToAction || false,
        keywords: (about.keywords || []).slice(0, 10),
        sentiment: about.sentiment || 'neutral',
        readabilityScore: about.readabilityScore || 0
      }
    };
  },
  
  /**
   * Prepare experience section
   * @param {Object} experience - Experience data
   * @returns {Object} Prepared experience
   */
  prepareExperience(experience) {
    const experiences = experience.experiences || experience.experienceChunks || [];
    
    return {
      count: experience.count || 0,
      hasCurrentRole: experience.hasCurrentRole || false,
      totalMonths: experience.totalMonths || 0,
      experiences: experiences.slice(0, 5).map(exp => ({
        title: exp.title || '',
        company: exp.company || '',
        duration: exp.duration || '',
        description: this.truncateText(exp.description || '', 300),
        hasQuantifiedAchievements: exp.hasQuantifiedAchievements || false,
        hasTechStack: exp.hasTechStack || false
      })),
      analysis: {
        averageTenure: experience.averageTenure || 0,
        careerProgression: experience.careerProgression || 'unknown',
        hasQuantifiedAchievements: experience.hasQuantifiedAchievements || false
      }
    };
  },
  
  /**
   * Prepare skills section
   * @param {Object} skills - Skills data
   * @returns {Object} Prepared skills
   */
  prepareSkills(skills) {
    return {
      count: skills.count || 0,
      topSkills: (skills.skills || []).slice(0, 20).map(s => ({
        name: s.name,
        endorsed: s.endorsementCount > 0
      })),
      analysis: {
        hasEndorsements: skills.hasEndorsements || false,
        technicalCount: skills.technicalSkills?.length || 0,
        softSkillsCount: skills.softSkills?.length || 0,
        categories: Object.keys(skills.skillsByCategory || {})
      }
    };
  },
  
  /**
   * Prepare education section
   * @param {Object} education - Education data
   * @returns {Object} Prepared education
   */
  prepareEducation(education) {
    return {
      count: education.count || 0,
      highestDegree: education.highestDegree || 'none',
      schools: (education.schools || []).slice(0, 3).map(school => ({
        name: school.school || school.name || '',
        degree: school.degree || '',
        field: school.field || ''
      }))
    };
  },
  
  /**
   * Prepare other sections
   * @param {Object} profileData - All profile data
   * @returns {Object} Other sections summary
   */
  prepareOtherSections(profileData) {
    const other = {
      hasRecommendations: false,
      recommendationCount: 0,
      hasCertifications: false,
      certificationCount: 0,
      hasProjects: false,
      projectCount: 0,
      hasFeatured: false
    };
    
    if (profileData.recommendations?.exists) {
      other.hasRecommendations = profileData.recommendations.count > 0;
      other.recommendationCount = profileData.recommendations.receivedCount || 0;
    }
    
    if (profileData.certifications?.exists) {
      other.hasCertifications = profileData.certifications.count > 0;
      other.certificationCount = profileData.certifications.count || 0;
    }
    
    if (profileData.projects?.exists) {
      other.hasProjects = profileData.projects.count > 0;
      other.projectCount = profileData.projects.count || 0;
    }
    
    if (profileData.featured?.exists) {
      other.hasFeatured = profileData.featured.hasContent || false;
    }
    
    return other;
  },
  
  /**
   * Process AI response into structured scoring
   * @param {Object} aiResponse - Response from AI
   * @param {Object} profileData - Original profile data
   * @returns {Object} Processed scores and recommendations
   */
  processAIResponse(aiResponse, profileData) {
    Logger.info('[QualityScorer] Processing AI response');
    
    try {
      // Parse section scores
      const sectionScores = this.parseSectionScores(aiResponse.sectionScores || {});
      
      // Calculate weighted overall score
      const overallScore = this.calculateOverallScore(sectionScores);
      
      // Parse recommendations
      const recommendations = this.parseRecommendations(aiResponse.recommendations || {});
      
      // Parse insights
      const insights = this.parseInsights(aiResponse.insights || {});
      
      // Determine score cap based on missing sections
      const scoreCap = this.determineScoreCap(profileData);
      
      // Apply score cap if necessary
      const finalScore = Math.min(overallScore, scoreCap);
      
      Logger.debug('[QualityScorer] Calculated scores:', {
        raw: overallScore,
        capped: finalScore,
        cap: scoreCap
      });
      
      return {
        contentScore: finalScore,
        sectionScores: sectionScores,
        recommendations: recommendations,
        insights: insights,
        scoreCap: scoreCap,
        analysis: {
          strengths: this.identifyStrengths(sectionScores),
          weaknesses: this.identifyWeaknesses(sectionScores),
          priority: this.prioritizeImprovements(sectionScores, profileData)
        }
      };
      
    } catch (error) {
      Logger.error('[QualityScorer] Error processing AI response:', error);
      
      return {
        contentScore: 5.0,
        error: 'Failed to process AI response',
        sectionScores: {},
        recommendations: {
          critical: ['Unable to analyze profile quality. Please try again.']
        }
      };
    }
  },
  
  /**
   * Parse section scores from AI response
   * @param {Object} scores - Raw section scores
   * @returns {Object} Normalized scores
   */
  parseSectionScores(scores) {
    const normalized = {};
    
    Object.entries(scores).forEach(([section, score]) => {
      // Ensure score is between 0 and 10
      normalized[section] = Math.max(0, Math.min(10, parseFloat(score) || 0));
    });
    
    return normalized;
  },
  
  /**
   * Calculate weighted overall score
   * @param {Object} sectionScores - Section scores
   * @returns {number} Overall score
   */
  calculateOverallScore(sectionScores) {
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(this.weights).forEach(([section, weight]) => {
      const score = sectionScores[section];
      if (score !== undefined) {
        totalScore += score * weight;
        totalWeight += weight;
      }
    });
    
    // Normalize if not all sections were scored
    if (totalWeight > 0 && totalWeight < 1) {
      totalScore = totalScore / totalWeight;
    }
    
    return Math.round(totalScore * 10) / 10; // Round to 1 decimal
  },
  
  /**
   * Determine score cap based on missing critical sections
   * @param {Object} profileData - Profile data
   * @returns {number} Maximum possible score
   */
  determineScoreCap(profileData) {
    let cap = 10;
    
    // Critical sections that cap the score when missing
    if (!profileData.about?.exists || profileData.about?.charCount < 100) {
      cap = Math.min(cap, 7); // No meaningful About = max 7/10
    }
    
    if (!profileData.experience?.exists || profileData.experience?.count === 0) {
      cap = Math.min(cap, 6); // No experience = max 6/10
    }
    
    if (!profileData.skills?.exists || profileData.skills?.count < 5) {
      cap = Math.min(cap, 8); // Few skills = max 8/10
    }
    
    if (!profileData.headline?.exists || profileData.headline?.charCount < 30) {
      cap = Math.min(cap, 8); // Poor headline = max 8/10
    }
    
    return cap;
  },
  
  /**
   * Parse recommendations from AI response
   * @param {Object} recommendations - Raw recommendations
   * @returns {Object} Structured recommendations
   */
  parseRecommendations(recommendations) {
    const structured = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    // Handle different recommendation formats
    if (Array.isArray(recommendations)) {
      structured.high = recommendations.slice(0, 5);
    } else if (typeof recommendations === 'object') {
      Object.entries(recommendations).forEach(([priority, items]) => {
        if (structured[priority] && Array.isArray(items)) {
          structured[priority] = items;
        }
      });
    }
    
    return structured;
  },
  
  /**
   * Parse insights from AI response
   * @param {Object} insights - Raw insights
   * @returns {Object} Structured insights
   */
  parseInsights(insights) {
    return {
      strengths: insights.strengths || '',
      improvements: insights.improvements || '',
      industryAlignment: insights.industryAlignment || '',
      overallAssessment: insights.overallAssessment || ''
    };
  },
  
  /**
   * Identify profile strengths
   * @param {Object} sectionScores - Section scores
   * @returns {Array<string>} Strengths
   */
  identifyStrengths(sectionScores) {
    const strengths = [];
    
    Object.entries(sectionScores).forEach(([section, score]) => {
      if (score >= 8) {
        strengths.push(`Strong ${section} section (${score}/10)`);
      }
    });
    
    return strengths;
  },
  
  /**
   * Identify profile weaknesses
   * @param {Object} sectionScores - Section scores
   * @returns {Array<string>} Weaknesses
   */
  identifyWeaknesses(sectionScores) {
    const weaknesses = [];
    
    Object.entries(sectionScores).forEach(([section, score]) => {
      if (score < 6) {
        weaknesses.push(`Weak ${section} section (${score}/10)`);
      }
    });
    
    return weaknesses;
  },
  
  /**
   * Prioritize improvements based on scores and weights
   * @param {Object} sectionScores - Section scores
   * @param {Object} profileData - Profile data
   * @returns {Array<Object>} Prioritized improvements
   */
  prioritizeImprovements(sectionScores, profileData) {
    const improvements = [];
    
    Object.entries(this.weights).forEach(([section, weight]) => {
      const score = sectionScores[section] || 0;
      const potentialGain = (10 - score) * weight;
      
      if (score < 8) {
        improvements.push({
          section,
          currentScore: score,
          weight,
          potentialGain,
          priority: potentialGain > 1 ? 'high' : potentialGain > 0.5 ? 'medium' : 'low'
        });
      }
    });
    
    // Sort by potential gain
    improvements.sort((a, b) => b.potentialGain - a.potentialGain);
    
    return improvements;
  },
  
  /**
   * Truncate text to specified length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },
  
  /**
   * Generate prompt for AI analysis
   * @param {Object} preparedData - Prepared profile data
   * @param {string} analysisType - Type of analysis
   * @returns {string} AI prompt
   */
  generatePrompt(preparedData, analysisType = 'comprehensive') {
    const prompts = {
      comprehensive: `Analyze this LinkedIn profile for a ${preparedData.targetRole} at ${preparedData.seniorityLevel} level. 
        Score each section from 0-10 based on clarity, impact, and relevance to the target role.
        Current completeness: ${preparedData.completenessScore}%.
        Missing elements: ${preparedData.missingElements.join(', ')}.
        
        Provide:
        1. Section scores (0-10) for: headline, about, experience, skills, education, other
        2. Critical recommendations (top 3 most impactful improvements)
        3. High priority recommendations (next 3-5 improvements)
        4. Brief insights on strengths and areas for improvement
        
        ${preparedData.customInstructions}`,
      
      quick: `Quick quality check for LinkedIn profile (${preparedData.targetRole}). 
        Rate overall content quality 0-10 and provide top 3 improvements.`,
      
      section: `Analyze this specific LinkedIn section and rate 0-10 for quality and impact.`
    };
    
    return prompts[analysisType] || prompts.comprehensive;
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
    SCANNING: 'scanning',
    EXTRACTING: 'extracting',
    CALCULATING: 'calculating',
    ANALYZING: 'analyzing',
    AI_ANALYZING: 'ai_analyzing',
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
        
        <div class="scan-progress hidden">
          <h4>Scanning Profile Sections</h4>
          <div class="scan-items"></div>
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
      
      [this.states.SCANNING]: () => {
        this.updateStatus('Scanning profile sections...', '⣾');
        this.showScanProgress();
      },
      
      [this.states.EXTRACTING]: () => {
        this.updateStatus('Extracting profile data...', '⣾');
        this.hideScanProgress();
        this.showProgressBar('extracting');
      },
      
      [this.states.CALCULATING]: () => {
        this.updateStatus('Calculating completeness...', '⣾');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
      },
      
      [this.states.ANALYZING]: () => {
        this.updateStatus('Running AI analysis...', '⣾');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        this.showProgressBar('analyzing');
      },
      
      [this.states.AI_ANALYZING]: () => {
        this.updateStatus('AI analyzing profile sections...', '⣾');
        this.hideScanProgress();
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
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
  },
  
  /**
   * Show scan progress UI
   */
  showScanProgress() {
    const scanProgress = this.overlayElement.querySelector('.scan-progress');
    if (scanProgress) {
      scanProgress.classList.remove('hidden');
    }
  },
  
  /**
   * Hide scan progress UI
   */
  hideScanProgress() {
    const scanProgress = this.overlayElement.querySelector('.scan-progress');
    if (scanProgress) {
      scanProgress.classList.add('hidden');
    }
  },
  
  /**
   * Update scan progress with section statuses
   * @param {Array<Object>} sections - Array of {name, status, itemCount}
   */
  updateScanProgress(sections) {
    const scanItems = this.overlayElement.querySelector('.scan-items');
    if (!scanItems) return;
    
    // Clear existing items
    scanItems.innerHTML = '';
    
    // Create progress items for each section
    sections.forEach(section => {
      const item = document.createElement('div');
      item.className = 'scan-item';
      item.setAttribute('data-status', section.status);
      
      const icon = document.createElement('span');
      icon.className = 'scan-icon';
      
      // Set icon based on status
      if (section.status === 'complete') {
        icon.textContent = '✓';
      } else if (section.status === 'scanning') {
        icon.textContent = '⣾';
        icon.classList.add('spinning');
      } else {
        icon.textContent = '○';
      }
      
      const label = document.createElement('span');
      label.className = 'scan-label';
      label.textContent = this.formatSectionName(section.name);
      
      // Add item count if available
      if (section.itemCount !== undefined && section.status === 'complete') {
        const count = document.createElement('span');
        count.className = 'scan-count';
        count.textContent = `(${section.itemCount})`;
        label.appendChild(count);
      }
      
      item.appendChild(icon);
      item.appendChild(label);
      scanItems.appendChild(item);
    });
  },
  
  /**
   * Update extraction progress
   * @param {string} currentSection - Section currently being extracted
   */
  updateExtractionProgress(currentSection) {
    const statusText = this.overlayElement.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = `Extracting ${this.formatSectionName(currentSection)}...`;
    }
  },
  
  /**
   * Update AI analysis progress
   * @param {string} phase - Current AI phase
   * @param {string} section - Current section (optional)
   */
  updateAIProgress(phase, section) {
    const statusText = this.overlayElement.querySelector('.status-text');
    if (!statusText) return;
    
    const messages = {
      'generating': 'Generating AI insights...',
      'analyzing-about': 'AI analyzing About section...',
      'analyzing-experience': 'AI analyzing Experience...',
      'analyzing-skills': 'AI analyzing Skills...',
      'analyzing-headline': 'AI analyzing Headline...',
      'analyzing-education': 'AI analyzing Education...',
      'analyzing-recommendations': 'AI analyzing Recommendations...',
      'analyzing-certifications': 'AI analyzing Certifications...',
      'analyzing-projects': 'AI analyzing Projects...'
    };
    
    statusText.textContent = messages[phase] || `AI analyzing ${section || 'profile'}...`;
  },
  
  /**
   * Format section name for display
   * @param {string} name - Section name
   * @returns {string} Formatted name
   */
  formatSectionName(name) {
    const nameMap = {
      'headline': 'Headline',
      'about': 'About',
      'experience': 'Experience',
      'skills': 'Skills',
      'education': 'Education',
      'recommendations': 'Recommendations',
      'certifications': 'Certifications',
      'projects': 'Projects',
      'featured': 'Featured'
    };
    
    return nameMap[name] || name.charAt(0).toUpperCase() + name.slice(1);
  }
};/**
 * ElevateLI Analyzer Base
 * Main orchestrator for LinkedIn profile analysis
 * Expects these modules to be available: Logger, CacheManager, OverlayManager, extractors, scorers
 */

/* ============================================
 * CONSTANTS & CONFIGURATION
 * ============================================ */
const SELECTORS = {
  PROFILE_ACTIONS: '.pvs-profile-actions--overflow, .pv-top-card-v2-ctas__custom',
  SCAFFOLD_ACTIONS: '.pv-profile-sticky-header-v2__actions-container .display-flex',
  PROFILE_PHOTO: '.pv-top-card-profile-picture img, .profile-photo-edit__preview',
  ABOUT_SECTION: 'section[data-section="summary"]',
  EXPERIENCE_SECTION: 'section#experience-section, div[data-view-name="profile-card"][id*="experience"]',
  SKILLS_SECTION: 'section[data-section="skills"], div[data-view-name="profile-card"][id*="skills"]',
  EDUCATION_SECTION: 'section#education-section, div[data-view-name="profile-card"][id*="education"]'
};

const TIMINGS = {
  DEBOUNCE_DELAY: 500,
  EXTRACTION_THROTTLE: 2000,
  WAIT_FOR_ELEMENT_TIMEOUT: 10000,
  CONTENT_LOAD_DELAY: 1500
};

/* ============================================
 * STATE MANAGEMENT
 * ============================================ */
const ExtensionState = {
  isExtracting: false,
  lastExtraction: null,
  lastPath: location.pathname,
  observers: [],
  eventListeners: [],
  timeouts: [],
  intervals: [],
  forceRefresh: false,
  lastCompletenessResult: null,
  storageListener: null
};

/* ============================================
 * CHROME API WRAPPERS
 * ============================================ */
function safeChrome() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

function safeSendMessage(message, callback, retries = 3) {
  if (!safeChrome()) {
    Logger.error('Chrome APIs not available');
    if (callback) callback(null);
    return;
  }
  
  const attemptSend = (retriesLeft) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          Logger.error('Message error:', chrome.runtime.lastError.message);
          
          if (retriesLeft > 0 && chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
            Logger.info(`Retrying message send... (${retriesLeft} retries left)`);
            setTimeout(() => attemptSend(retriesLeft - 1), 1000);
            return;
          }
          
          if (callback) callback({ error: chrome.runtime.lastError.message });
          return;
        }
        
        if (callback) callback(response);
      });
    } catch (error) {
      Logger.error('Message send failed:', error);
      if (callback) callback({ error: error.message });
    }
  };
  
  attemptSend(retries);
}

/* ============================================
 * MAIN ANALYZER ORCHESTRATOR
 * ============================================ */
const Analyzer = {
  // Available extractors (will be defined in separate files)
  extractors: {
    headline: typeof HeadlineExtractor !== 'undefined' ? HeadlineExtractor : null,
    about: typeof AboutExtractor !== 'undefined' ? AboutExtractor : null,
    experience: typeof ExperienceExtractor !== 'undefined' ? ExperienceExtractor : null,
    skills: typeof SkillsExtractor !== 'undefined' ? SkillsExtractor : null,
    education: typeof EducationExtractor !== 'undefined' ? EducationExtractor : null,
    recommendations: typeof RecommendationsExtractor !== 'undefined' ? RecommendationsExtractor : null,
    certifications: typeof CertificationsExtractor !== 'undefined' ? CertificationsExtractor : null,
    projects: typeof ProjectsExtractor !== 'undefined' ? ProjectsExtractor : null
  },
  
  /**
   * Main analysis flow with progressive UI updates
   * @param {Object} overlay - OverlayManager instance
   * @param {string} profileId - LinkedIn profile ID
   * @param {Object} settings - Analysis settings
   * @param {boolean} isOwn - Is user's own profile
   */
  async analyze(overlay, profileId, settings, isOwn) {
    Logger.info('Starting analysis', { profileId, isOwn, settings });
    
    try {
      // Phase 1: Quick scan (show sections being scanned)
      overlay.setState(OverlayManager.states.SCANNING);
      const scanResults = await this.scanAllSections(overlay);
      
      // Phase 2: Extract for completeness
      overlay.setState(OverlayManager.states.EXTRACTING);
      const extractionResults = await this.extractForCompleteness(scanResults, overlay);
      
      // Phase 3: Calculate completeness
      const completenessResult = CompletenessScorer.calculate(extractionResults);
      
      // Update overlay with completeness
      overlay.setState(OverlayManager.states.CALCULATING, {
        completeness: completenessResult.score
      });
      
      // Store result
      ExtensionState.lastCompletenessResult = completenessResult;
      await CacheManager.saveCompleteness(profileId, completenessResult);
      
      // Phase 4: AI analysis (if enabled and own profile)
      if (isOwn && settings.enableAI) {
        overlay.setState(OverlayManager.states.AI_ANALYZING);
        
        // Deep extract for AI
        const deepData = await this.extractDeepSelectively(extractionResults, settings, overlay);
        
        // Send to AI
        await this.requestAIAnalysis(deepData, completenessResult, overlay, profileId, settings);
      } else {
        // Complete without AI
        overlay.setState(OverlayManager.states.COMPLETE, {
          completeness: completenessResult.score,
          completenessData: completenessResult,
          aiDisabled: !settings.enableAI,
          notOwnProfile: !isOwn
        });
      }
      
    } catch (error) {
      Logger.error('Analysis error:', error);
      overlay.setState(OverlayManager.states.ERROR, {
        message: 'Analysis failed: ' + error.message,
        completeness: ExtensionState.lastCompletenessResult?.score
      });
    } finally {
      ExtensionState.isExtracting = false;
      ExtensionState.forceRefresh = false;
    }
  },
  
  /**
   * Scan all sections quickly
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object} Scan results
   */
  async scanAllSections(overlay) {
    const sections = Object.keys(this.extractors);
    const results = {};
    
    // Update UI to show scanning
    overlay.updateScanProgress(sections.map(s => ({ 
      name: s, 
      status: 'pending' 
    })));
    
    // Scan sections in parallel for speed
    const scanPromises = sections.map(async (section) => {
      if (!this.extractors[section]) return;
      
      // Update UI to show scanning this section
      overlay.updateScanProgress(sections.map(s => ({ 
        name: s, 
        status: s === section ? 'scanning' : results[s] ? 'complete' : 'pending'
      })));
      
      try {
        const startTime = Date.now();
        results[section] = await this.extractors[section].scan();
        Logger.debug(`Scanned ${section} in ${Date.now() - startTime}ms`);
        
        // Update UI to show complete
        overlay.updateScanProgress(sections.map(s => ({ 
          name: s, 
          status: results[s] ? 'complete' : s === section ? 'complete' : 'pending',
          itemCount: results[s]?.visibleCount
        })));
        
      } catch (error) {
        Logger.error(`Error scanning ${section}:`, error);
        results[section] = { exists: false, error: true };
      }
    });
    
    // Wait for all scans with timeout
    await Promise.race([
      Promise.all(scanPromises),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]);
    
    return results;
  },
  
  /**
   * Extract data for completeness scoring
   * @param {Object} scanResults - Results from scanning
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object} Extraction results
   */
  async extractForCompleteness(scanResults, overlay) {
    const results = {};
    
    // Extract sections that exist
    for (const [section, scanResult] of Object.entries(scanResults)) {
      if (!scanResult || !scanResult.exists || !this.extractors[section]) {
        results[section] = scanResult || { exists: false };
        continue;
      }
      
      try {
        // Show extracting this section
        overlay.updateExtractionProgress(section);
        
        results[section] = await this.extractors[section].extract();
        Logger.debug(`Extracted ${section}:`, results[section]);
        
      } catch (error) {
        Logger.error(`Error extracting ${section}:`, error);
        results[section] = { exists: false, error: true };
      }
    }
    
    // Add photo check (special case)
    results.photo = !!document.querySelector(SELECTORS.PROFILE_PHOTO);
    
    return results;
  },
  
  /**
   * Selectively deep extract for AI analysis
   * @param {Object} basicData - Basic extraction results
   * @param {Object} settings - User settings
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object} Deep extraction results
   */
  async extractDeepSelectively(basicData, settings, overlay) {
    const deepResults = {};
    
    // Prioritize sections based on role and data availability
    const prioritizedSections = this.prioritizeSections(basicData, settings);
    
    for (const section of prioritizedSections) {
      if (!this.extractors[section] || !this.extractors[section].extractDeep) {
        continue;
      }
      
      try {
        // Update UI
        overlay.updateAIProgress(`analyzing-${section}`, section);
        
        deepResults[section] = await this.extractors[section].extractDeep();
        Logger.debug(`Deep extracted ${section}`);
        
      } catch (error) {
        Logger.error(`Error deep extracting ${section}:`, error);
        deepResults[section] = basicData[section];
      }
    }
    
    return deepResults;
  },
  
  /**
   * Prioritize sections for deep extraction
   * @param {Object} basicData - Basic extraction results
   * @param {Object} settings - User settings
   * @returns {Array<string>} Prioritized section names
   */
  prioritizeSections(basicData, settings) {
    const sections = [];
    
    // Always prioritize these if they have content
    if (BaseExtractor.hasContent(basicData.about)) sections.push('about');
    if (BaseExtractor.hasContent(basicData.experience)) sections.push('experience');
    if (BaseExtractor.hasContent(basicData.skills)) sections.push('skills');
    
    // Role-specific prioritization
    if (settings.targetRole?.includes('engineer')) {
      sections.push('projects', 'certifications');
    } else if (settings.targetRole?.includes('manager')) {
      sections.push('recommendations');
    }
    
    // Add other sections with content
    Object.keys(basicData).forEach(section => {
      if (!sections.includes(section) && BaseExtractor.hasContent(basicData[section])) {
        sections.push(section);
      }
    });
    
    return sections;
  },
  
  /**
   * Request AI analysis from service worker
   * @param {Object} deepData - Deep extraction results
   * @param {Object} completenessResult - Completeness scoring result
   * @param {Object} overlay - OverlayManager instance
   * @param {string} profileId - Profile ID
   * @param {Object} settings - User settings
   */
  async requestAIAnalysis(deepData, completenessResult, overlay, profileId, settings) {
    overlay.updateAIProgress('generating');
    
    safeSendMessage({
      action: 'calculateScore',
      url: window.location.href,
      profileData: deepData,
      completenessResult: completenessResult,
      forceRefresh: ExtensionState.forceRefresh,
      settings: settings
    }, async (response) => {
      Logger.info('AI analysis response:', response);
      
      if (response && response.error) {
        overlay.setState(OverlayManager.states.ERROR, {
          message: response.error,
          completeness: completenessResult.score,
          completenessData: completenessResult
        });
        return;
      }
      
      if (response && response.contentScore !== undefined) {
        overlay.setState(OverlayManager.states.COMPLETE, {
          completeness: completenessResult.score,
          completenessData: completenessResult,
          contentScore: response.contentScore,
          recommendations: response.recommendations,
          insights: response.insights,
          sectionScores: response.sectionScores,
          fromCache: response.fromCache
        });
        
        // Save to cache if fresh
        if (!response.fromCache) {
          await CacheManager.save(profileId, {
            contentScore: response.contentScore,
            recommendations: response.recommendations,
            insights: response.insights,
            sectionScores: response.sectionScores
          }, deepData, settings);
        }
      }
    });
  }
};

/* ============================================
 * INITIALIZATION
 * ============================================ */
async function init() {
  Logger.info('Initializing ElevateLI', { url: location.href });
  
  if (!safeChrome()) {
    Logger.error('Chrome APIs not available');
    return;
  }
  
  if (!isProfilePage()) {
    Logger.info('Not a profile page, skipping');
    return;
  }
  
  // Get profile ID
  const profileId = getProfileId();
  if (!profileId) {
    Logger.error('Could not determine profile ID');
    return;
  }
  
  // Detect if own profile
  const isOwn = await isOwnProfile();
  
  // Initialize overlay immediately
  const overlay = await OverlayManager.initialize();
  
  // Get settings
  const settings = await chrome.storage.local.get([
    'targetRole', 
    'seniorityLevel', 
    'customInstructions',
    'enableAI',
    'apiKey',
    'aiProvider'
  ]);
  
  // Check cache first
  const cached = await CacheManager.checkAndReturn(profileId, settings);
  
  if (cached && !ExtensionState.forceRefresh) {
    Logger.info('Using cached analysis');
    overlay.setState(OverlayManager.states.CACHE_LOADED, cached);
    
    if (cached.completenessData) {
      ExtensionState.lastCompletenessResult = cached.completenessData;
    }
    
    return;
  }
  
  // Start analysis
  Logger.info('Starting fresh analysis');
  await Analyzer.analyze(overlay, profileId, settings, isOwn);
}

/* ============================================
 * UTILITY FUNCTIONS
 * ============================================ */
function isProfilePage() {
  return location.pathname.includes('/in/');
}

function getProfileId() {
  const match = location.pathname.match(/\/in\/([^\/]+)/);
  return match ? match[1] : null;
}

async function isOwnProfile() {
  // Check URL first
  if (location.pathname.includes('/in/me')) return true;
  
  // Check stored profile
  const stored = await chrome.storage.local.get('userProfile');
  if (stored.userProfile?.profileId) {
    const currentId = getProfileId();
    return currentId === stored.userProfile.profileId;
  }
  
  // Check for edit buttons
  return !!document.querySelector('.pv-top-card-v2-ctas__edit');
}

/* ============================================
 * MESSAGE LISTENERS
 * ============================================ */
if (safeChrome()) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    Logger.debug('Message received:', request.action);
    
    if (request.action === 'ping') {
      sendResponse({ status: 'ready', url: window.location.href });
      return true;
    }
    
    if (request.action === 'triggerAnalysis') {
      Logger.info('Manual analysis triggered');
      ExtensionState.forceRefresh = true;
      init().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
    }
    
    if (request.action === 'removeOverlay') {
      const wrapper = document.querySelector('.elevateli-overlay-wrapper');
      if (wrapper) {
        wrapper.remove();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No overlay found' });
      }
      return true;
    }
  });
}

// Window message listeners for overlay actions
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'ELEVATE_REFRESH') {
    Logger.info('Refresh requested via overlay');
    ExtensionState.forceRefresh = true;
    init();
  }
});

/* ============================================
 * STARTUP
 * ============================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(init, 100);
  });
} else {
  setTimeout(init, 100);
}

// Export for debugging
window.ElevateLI = {
  state: ExtensionState,
  analyzer: Analyzer,
  init: init
};