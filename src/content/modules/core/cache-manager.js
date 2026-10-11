/**
 * Cache Manager Module for ElevateLI
 * Handles content-based caching with infinite persistence
 * Cache persists until explicitly cleared by user
 */

class CacheManager {
  
  /**
   * Get cached data for a profile
   */
  async get(profileId) {
    return new Promise((resolve) => {
      const cacheKey = `cache_${profileId}`;
      
      chrome.storage.local.get([cacheKey], (data) => {
        if (chrome.runtime.lastError) {
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
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}