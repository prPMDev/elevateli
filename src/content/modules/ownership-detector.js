/**
 * [CRITICAL_PATH:OWNERSHIP_DETECTION] - P0: Profile ownership verification
 * Shared module for detecting if the current LinkedIn profile belongs to the user
 * Used by both popup and content scripts
 */

const OwnershipDetector = {
  /**
   * Check for ownership indicators on the profile page
   * These elements ONLY appear when viewing your own profile
   * @returns {boolean} true if ownership indicators are found
   */
  hasOwnershipIndicators() {
    // Edit intro link - primary indicator
    const editIntroLink = document.querySelector('a[href*="/edit/intro/"]');
    
    // View analytics link (profile Analytics card) - secondary indicator
    const analyticsLink = document.querySelector('a[href*="/dashboard/"]');
    
    return !!(editIntroLink || analyticsLink);
  }
};

// Export for use in both environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OwnershipDetector;
}