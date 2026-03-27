/**
 * Cache Manager Module for ElevateLI
 * Handles content-based caching with infinite persistence
 * Cache persists until explicitly cleared by user
 */

class CacheManager {
  constructor() {
    this.AI_CACHE_PREFIX = 'aiCache_';
    this.COMPLETENESS_CACHE_PREFIX = 'completeness_';
  }
  
  /**
   * Generate content hash including profile data and settings
   */
  generateHash(profileData, settings) {
    const dataPoints = [
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
      settings.targetRole || 'none',
      settings.seniorityLevel || 'none',
      settings.customInstructions ? 'custom' : 'default'
    ];
    
    return dataPoints.join('-');
  }
  
  /**
   * Get cached data for a profile
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
          resolve(null);
          return;
        }
        
        resolve(cachedData);
      });
    });
  }
  
  /**
   * Save data to cache
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
          resolve(true);
        }
      });
    });
  }
  
  /**
   * Check cache and return data if valid
   */
  async checkAndReturn(profileId, currentSettings) {
    if (!profileId) {
      return null;
    }
    
    const cachedData = await this.get(profileId);
    if (!cachedData) return null;
    
    return cachedData;
  }
  
  /**
   * Clear cache for a specific profile
   */
  async clear(profileId) {
    return new Promise((resolve) => {
      const cacheKey = `cache_${profileId}`;
      
      chrome.storage.local.remove([cacheKey], () => {
        if (chrome.runtime.lastError) {
          Logger.error('[CacheManager] Error clearing cache:', chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
  
  /**
   * Clear all caches
   */
  async clearAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        const cacheKeys = Object.keys(data).filter(key => key.startsWith('cache_'));
        
        if (cacheKeys.length === 0) {
          resolve(true);
          return;
        }
        
        chrome.storage.local.remove(cacheKeys, () => {
          if (chrome.runtime.lastError) {
            Logger.error('[CacheManager] Error clearing all caches:', chrome.runtime.lastError);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    });
  }
}