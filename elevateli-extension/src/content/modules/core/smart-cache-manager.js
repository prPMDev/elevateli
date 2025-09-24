/**
 * Smart Cache Manager - Content-hash based infinite caching
 * Eliminates unnecessary AI analysis costs by caching until content actually changes
 */

const SmartCacheManager = {
  
  /**
   * Validate LinkedIn profile ID format for security
   * @param {string} profileId - Profile ID to validate
   * @returns {string} - Validated profile ID
   * @throws {Error} - If profile ID format is invalid
   */
  validateProfileId(profileId) {
    if (!profileId || typeof profileId !== 'string') {
      Logger.error('[SmartCacheManager] Invalid profileId type:', typeof profileId);
      throw new Error('Profile ID must be a non-empty string');
    }
    
    // LinkedIn profile IDs contain only: letters, numbers, dash, underscore
    // Examples: john-doe, jane_smith123, user-name-123
    const validFormat = /^[a-zA-Z0-9_-]+$/;
    
    if (!validFormat.test(profileId)) {
      Logger.error('[SmartCacheManager] Invalid profileId format:', profileId);
      throw new Error('Invalid profile ID format - potential injection attempt');
    }
    
    // Additional check for suspicious patterns
    if (profileId.includes('..') || profileId.includes('./') || profileId.includes('//')) {
      Logger.error('[SmartCacheManager] Suspicious profileId pattern:', profileId);
      throw new Error('Profile ID contains suspicious patterns');
    }
    
    return profileId;
  },
  
  /**
   * Generate content hash for text-based profile data
   * @param {Object} profileData - Extracted profile data
   * @returns {Promise<string>} - SHA-256 hash of content
   */
  async generateTextContentHash(profileData) {
    try {
      // Extract all text content that affects AI analysis
      const textContent = {
        about: profileData.about?.text || '',
        headline: profileData.headline?.text || '',
        experience: JSON.stringify(profileData.experience || []),
        skills: JSON.stringify(profileData.skills || []),
        education: JSON.stringify(profileData.education || []),
        recommendations: JSON.stringify(profileData.recommendations || []),
        certifications: JSON.stringify(profileData.certifications || []),
        projects: JSON.stringify(profileData.projects || []),
        featured: JSON.stringify(profileData.featured || [])
      };
      
      // Create deterministic string for hashing
      const contentString = JSON.stringify(textContent, Object.keys(textContent).sort());
      
      // Generate SHA-256 hash
      const encoder = new TextEncoder();
      const data = encoder.encode(contentString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (error) {
      Logger.error('[SmartCacheManager] Error generating text content hash:', error);
      // Fallback to timestamp-based cache key if hashing fails
      return `fallback_${Date.now()}`;
    }
  },

  /**
   * Generate image hash for vision analysis
   * @param {string} imageDataUrl - Base64 image data URL
   * @returns {Promise<string>} - SHA-256 hash of image content
   */
  async generateImageHash(imageDataUrl) {
    try {
      if (!imageDataUrl) {
        return 'no_image';
      }
      
      // Extract base64 data (remove data:image/...;base64, prefix)
      const base64Data = imageDataUrl.split(',')[1];
      if (!base64Data) {
        return 'invalid_image';
      }
      
      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Generate SHA-256 hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (error) {
      Logger.error('[SmartCacheManager] Error generating image hash:', error);
      return `img_fallback_${Date.now()}`;
    }
  },

  /**
   * Get cached AI analysis based on content hash
   * @param {string} profileId - LinkedIn profile identifier
   * @param {string} contentHash - Hash of the content
   * @param {string} analysisType - 'text' or 'vision'
   * @returns {Promise<Object|null>} - Cached analysis or null if not found
   */
  async getCachedAnalysis(profileId, contentHash, analysisType = 'text') {
    try {
      // Validate profile ID to prevent injection
      const validProfileId = this.validateProfileId(profileId);
      
      const cacheKey = `ai_${analysisType}_${validProfileId}_${contentHash}`;
      const result = await chrome.storage.local.get(cacheKey);
      
      if (result[cacheKey]) {
        const cachedData = result[cacheKey];
        
        // Add cache metadata
        cachedData._cacheInfo = {
          cached: true,
          cacheKey,
          cachedAt: cachedData.cachedAt || 'unknown',
          contentHash,
          analysisType
        };
        
        Logger.info(`[SmartCacheManager] Cache HIT for ${analysisType} analysis`, {
          profileId,
          contentHash: contentHash.substring(0, 8) + '...',
          cachedAt: cachedData.cachedAt
        });
        
        return cachedData;
      }
      
      Logger.info(`[SmartCacheManager] Cache MISS for ${analysisType} analysis`, {
        profileId,
        contentHash: contentHash.substring(0, 8) + '...'
      });
      
      return null;
    } catch (error) {
      Logger.error('[SmartCacheManager] Error retrieving cached analysis:', error);
      return null;
    }
  },

  /**
   * Store AI analysis with infinite cache duration
   * @param {string} profileId - LinkedIn profile identifier  
   * @param {string} contentHash - Hash of the content
   * @param {Object} analysisResult - AI analysis result to cache
   * @param {string} analysisType - 'text' or 'vision'
   * @returns {Promise<boolean>} - Success status
   */
  async cacheAnalysis(profileId, contentHash, analysisResult, analysisType = 'text') {
    try {
      // Validate profile ID to prevent injection
      const validProfileId = this.validateProfileId(profileId);
      
      const cacheKey = `ai_${analysisType}_${validProfileId}_${contentHash}`;
      
      // Add cache metadata to the result
      const cacheData = {
        ...analysisResult,
        cachedAt: new Date().toISOString(),
        contentHash,
        analysisType,
        profileId
      };
      
      await chrome.storage.local.set({
        [cacheKey]: cacheData
      });
      
      Logger.info(`[SmartCacheManager] Cached ${analysisType} analysis`, {
        profileId,
        contentHash: contentHash.substring(0, 8) + '...',
        cacheKey,
        dataSize: JSON.stringify(cacheData).length
      });
      
      // Track cache statistics
      await this.updateCacheStats(analysisType, 'store');
      
      return true;
    } catch (error) {
      Logger.error('[SmartCacheManager] Error caching analysis:', error);
      return false;
    }
  },

  /**
   * Clear all cached analysis data
   * @param {string} profileId - Optional: clear only for specific profile
   * @returns {Promise<number>} - Number of items cleared
   */
  async clearCache(profileId = null) {
    try {
      // If profileId provided, validate it first
      const validProfileId = profileId ? this.validateProfileId(profileId) : null;
      
      const allItems = await chrome.storage.local.get(null);
      const keysToRemove = [];
      
      Object.keys(allItems).forEach(key => {
        if (key.startsWith('ai_')) {
          if (!validProfileId || key.includes(validProfileId)) {
            keysToRemove.push(key);
          }
        }
      });
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        Logger.info(`[SmartCacheManager] Cleared ${keysToRemove.length} cached analyses`, {
          profileId,
          clearedKeys: keysToRemove.length
        });
      }
      
      return keysToRemove.length;
    } catch (error) {
      Logger.error('[SmartCacheManager] Error clearing cache:', error);
      return 0;
    }
  },

  /**
   * Get cache statistics
   * @returns {Promise<Object>} - Cache usage statistics
   */
  async getCacheStats() {
    try {
      const allItems = await chrome.storage.local.get(null);
      const stats = {
        totalCachedAnalyses: 0,
        textAnalyses: 0,
        visionAnalyses: 0,
        totalSizeBytes: 0,
        oldestCache: null,
        newestCache: null
      };
      
      Object.entries(allItems).forEach(([key, value]) => {
        if (key.startsWith('ai_')) {
          stats.totalCachedAnalyses++;
          
          if (key.includes('_text_')) {
            stats.textAnalyses++;
          } else if (key.includes('_vision_')) {
            stats.visionAnalyses++;
          }
          
          stats.totalSizeBytes += JSON.stringify(value).length;
          
          if (value.cachedAt) {
            const cacheDate = new Date(value.cachedAt);
            if (!stats.oldestCache || cacheDate < new Date(stats.oldestCache)) {
              stats.oldestCache = value.cachedAt;
            }
            if (!stats.newestCache || cacheDate > new Date(stats.newestCache)) {
              stats.newestCache = value.cachedAt;
            }
          }
        }
      });
      
      return stats;
    } catch (error) {
      Logger.error('[SmartCacheManager] Error getting cache stats:', error);
      return {
        totalCachedAnalyses: 0,
        textAnalyses: 0,
        visionAnalyses: 0,
        totalSizeBytes: 0,
        error: error.message
      };
    }
  },

  /**
   * Update cache usage statistics
   * @param {string} analysisType - 'text' or 'vision'
   * @param {string} operation - 'store' or 'retrieve'
   */
  async updateCacheStats(analysisType, operation) {
    try {
      const statsKey = 'cache_stats';
      const result = await chrome.storage.local.get(statsKey);
      const stats = result[statsKey] || {
        textStores: 0,
        textRetrieves: 0,
        visionStores: 0,
        visionRetrieves: 0,
        lastUpdated: new Date().toISOString()
      };
      
      const counterKey = `${analysisType}${operation === 'store' ? 'Stores' : 'Retrieves'}`;
      stats[counterKey] = (stats[counterKey] || 0) + 1;
      stats.lastUpdated = new Date().toISOString();
      
      await chrome.storage.local.set({ [statsKey]: stats });
    } catch (error) {
      // Don't log errors for stats updates to avoid noise
    }
  },

  /**
   * Check if content has changed since last analysis
   * @param {string} profileId - LinkedIn profile identifier
   * @param {string} currentContentHash - Current content hash
   * @param {string} analysisType - 'text' or 'vision'
   * @returns {Promise<boolean>} - True if content has changed
   */
  async hasContentChanged(profileId, currentContentHash, analysisType = 'text') {
    const cached = await this.getCachedAnalysis(profileId, currentContentHash, analysisType);
    return !cached; // If no cache found, content has changed (or is new)
  },

  /**
   * Get smart cache recommendation for user
   * @param {string} profileId - LinkedIn profile identifier
   * @param {string} contentHash - Current content hash
   * @param {boolean} forceRefresh - User requested fresh analysis
   * @returns {Promise<Object>} - Cache recommendation
   */
  async getCacheRecommendation(profileId, contentHash, forceRefresh = false) {
    try {
      if (forceRefresh) {
        return {
          useCache: false,
          reason: 'user_requested_fresh',
          cost: 0.05,
          message: 'Running fresh analysis (will cost ~$0.05)'
        };
      }
      
      const cached = await this.getCachedAnalysis(profileId, contentHash, 'text');
      
      if (cached) {
        return {
          useCache: true,
          reason: 'content_unchanged',
          cost: 0,
          message: 'Using cached analysis (free)',
          cachedAt: cached.cachedAt
        };
      } else {
        return {
          useCache: false,
          reason: 'content_changed',
          cost: 0.05,
          message: 'Content changed - running fresh analysis (~$0.05)'
        };
      }
    } catch (error) {
      Logger.error('[SmartCacheManager] Error getting cache recommendation:', error);
      return {
        useCache: false,
        reason: 'error',
        cost: 0.05,
        message: 'Running fresh analysis (~$0.05)'
      };
    }
  }
};

// Make globally available
if (typeof window !== 'undefined') {
  window.SmartCacheManager = SmartCacheManager;
}