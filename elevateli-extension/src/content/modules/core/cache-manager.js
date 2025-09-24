/**
 * Cache Manager Module for ElevateLI
 * Handles content-based caching with infinite persistence
 * Cache persists until explicitly cleared by user
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

class CacheManager {
  constructor() {
    this.AI_CACHE_PREFIX = 'aiCache_';
    this.COMPLETENESS_CACHE_PREFIX = 'completeness_';
  }
  
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
  }
  
  /**
   * Get cached data for a profile
   * @param {string} profileId - LinkedIn profile ID
   * @returns {Promise<Object|null>} Cached data or null
   */
  async get(profileId) {
    return new Promise((resolve) => {
      const cacheKey = `cache_${profileId}`;
      
      chrome.storage.local.get([cacheKey], (data) => {
        if (chrome.runtime.lastError) {
          Logger.error('[CacheManager] Error reading cache:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        
        const cachedData = data[cacheKey];
        if (!cachedData) {
          Logger.info('[CacheManager] No cache found for profile:', profileId, 'key:', cacheKey);
          resolve(null);
          return;
        }
        
        Logger.info('[CacheManager] Found valid cache for profile:', profileId, {
          cacheKey,
          hasCompleteness: cachedData.completeness !== undefined,
          timestamp: cachedData.timestamp
        });
        resolve(cachedData);
      });
    });
  }
  
  /**
   * Save data to cache
   * @param {string} profileId - LinkedIn profile ID
   * @param {Object} analysisData - Analysis results to cache
   * @param {Object} extractedData - Raw extracted data
   * @returns {Promise<boolean>} Success status
   */
  async save(profileId, analysisData, extractedData) {
    return new Promise((resolve) => {
      const cacheKey = `cache_${profileId}`;
      
      const cacheData = {
        ...analysisData,
        extractedData: extractedData,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
      
      const storageData = {
        [cacheKey]: cacheData
      };
      
      chrome.storage.local.set(storageData, () => {
        if (chrome.runtime.lastError) {
          Logger.error('[CacheManager] Error saving cache:', chrome.runtime.lastError);
          resolve(false);
        } else {
          Logger.info('[CacheManager] Saved cache for profile:', profileId);
          resolve(true);
        }
      });
    });
  }
  
  /**
   * Check cache and return data if valid (content unchanged)
   * @param {string} profileId - LinkedIn profile ID
   * @param {Object} currentSettings - Current analysis settings
   * @returns {Object|null} Cached data or null
   */
  async checkAndReturn(profileId, currentSettings) {
    if (!profileId) {
      Logger.info('[CacheManager] No profile ID provided');
      return null;
    }
    
    const cachedData = await this.get(profileId);
    if (!cachedData) return null;
    
    // Return cached data if it exists
    // In future, could compare content hash to detect changes
    return cachedData;
  }
  
  /**
   * Clear cache for a specific profile
   * @param {string} profileId - LinkedIn profile ID
   * @returns {Promise<boolean>} Success status
   */
  async clear(profileId) {
    return new Promise((resolve) => {
      const cacheKey = `cache_${profileId}`;
      
      chrome.storage.local.remove([cacheKey], () => {
        if (chrome.runtime.lastError) {
          Logger.error('[CacheManager] Error clearing cache:', chrome.runtime.lastError);
          resolve(false);
        } else {
          Logger.info('[CacheManager] Cleared cache for profile:', profileId);
          resolve(true);
        }
      });
    });
  }
  
  /**
   * Clear all caches
   * @returns {Promise<boolean>} Success status
   */
  async clearAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        const cacheKeys = Object.keys(data).filter(key => key.startsWith('cache_'));
        
        if (cacheKeys.length === 0) {
          Logger.info('[CacheManager] No caches to clear');
          resolve(true);
          return;
        }
        
        chrome.storage.local.remove(cacheKeys, () => {
          if (chrome.runtime.lastError) {
            Logger.error('[CacheManager] Error clearing all caches:', chrome.runtime.lastError);
            resolve(false);
          } else {
            Logger.info('[CacheManager] Cleared all caches:', cacheKeys.length);
            resolve(true);
          }
        });
      });
    });
  }
}