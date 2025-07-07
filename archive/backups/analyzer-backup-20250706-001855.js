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