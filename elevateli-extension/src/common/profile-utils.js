/**
 * Shared Profile Utilities
 * Consolidated functions for profile detection and management
 * Used across popup, content script, and service worker
 */

const ProfileUtils = {
  /**
   * Extract profile ID from URL
   * @param {string} url - Optional URL to parse, defaults to current location
   * @returns {string|null} Profile ID or null
   */
  getProfileIdFromUrl(url = window.location.pathname) {
    const path = typeof url === 'string' ? url : url.pathname;
    const match = path.match(/\/in\/([^\/]+)/);
    return match ? match[1] : null;
  },

  /**
   * Get saved user profile from Chrome storage
   * @returns {Promise<Object|null>} Saved profile object or null
   */
  async getSavedProfile() {
    return new Promise((resolve) => {
      // Check if chrome APIs are available
      if (!chrome?.storage?.local) {
        resolve(null);
        return;
      }
      
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        resolve(null);
        return;
      }
      
      try {
        chrome.storage.local.get(['userProfile'], (data) => {
          // Check for runtime errors
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(data.userProfile || null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  },

  /**
   * Check if current page is user's own profile
   * @returns {Promise<boolean>} True if own profile
   */
  async isOwnProfile() {
    const currentProfileId = this.getProfileIdFromUrl();
    if (!currentProfileId) return false;
    
    // First, check saved profile (URL-based, instant and reliable)
    const savedProfile = await this.getSavedProfile();
    if (savedProfile?.profileId === currentProfileId) {
      return true;
    }
    
    // Second, check ownership indicators (for zero state/first-time users)
    // Note: OwnershipDetector must be loaded separately
    if (typeof OwnershipDetector !== 'undefined') {
      // Wait for DOM to be ready before checking ownership indicators
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (OwnershipDetector.hasOwnershipIndicators()) {
        // Save profile for future instant detection
        await this.saveCurrentProfile();
        return true;
      }
    }
    
    return false;
  },

  /**
   * Save current profile as user's profile
   * @returns {Promise<boolean>} Success status
   */
  async saveCurrentProfile() {
    const profileId = this.getProfileIdFromUrl();
    if (!profileId) return false;

    const profileNameElement = document.querySelector('.text-heading-xlarge') || 
                              document.querySelector('h1.text-heading-xlarge') ||
                              document.querySelector('[class*="profile-name"]');
    const profileName = profileNameElement ? profileNameElement.textContent.trim() : profileId;
    
    // Check ownership indicators if available
    const hasOwnershipIndicators = typeof OwnershipDetector !== 'undefined' 
      ? OwnershipDetector.hasOwnershipIndicators() 
      : false;
    
    const userProfile = {
      profileId,
      profileName,
      profileUrl: window.location.href.split('?')[0],
      savedAt: Date.now(),
      verifiedOwnership: hasOwnershipIndicators
    };

    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(false);
        return;
      }

      chrome.storage.local.set({ userProfile }, () => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  },

  /**
   * Check if current page is a LinkedIn profile page
   * @returns {boolean} True if on a profile page
   */
  isProfilePage() {
    return window.location.pathname.includes('/in/') && 
           !window.location.pathname.includes('/in/me/') &&
           !window.location.pathname.includes('/edit/') &&
           !window.location.pathname.includes('/overlay/');
  }
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProfileUtils;
}