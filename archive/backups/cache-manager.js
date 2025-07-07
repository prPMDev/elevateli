/**
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
        const cacheData = completenessCache[completenessKey];
        
        // Validate cache has required data
        if (typeof cacheData.score !== 'number' || cacheData.score < 0) {
          console.log('[CacheManager] Invalid completeness cache - missing or invalid score:', cacheData.score);
          return null;
        }
        
        console.log('[CacheManager] Found completeness-only cache for profile:', profileId, 'Score:', cacheData.score);
        return {
          completenessData: cacheData,
          completeness: cacheData.score,
          timestamp: cacheData.timestamp || Date.now(),
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
};