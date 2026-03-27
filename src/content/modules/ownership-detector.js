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
    // Edit intro button - primary indicator (specific aria-label)
    const editIntroButton = document.querySelector('button[aria-label="Edit intro"]');
    
    // Edit intro link - backup indicator
    const editIntroLink = document.querySelector('a[href*="/edit/intro/?profileFormEntryPoint"]');
    
    // Add/edit section links - secondary indicator
    const addEditLink = document.querySelector('a[href*="/add-edit/"][href*="profileFormEntryPoint"]');
    
    // Create post button - strong ownership indicator
    const createPostButton = document.querySelector('a[id*="create-post"]') ||
                           document.querySelector('a[href*="/overlay/create-post"]');
    
    // View analytics button - tertiary indicator
    const analyticsButton = document.querySelector('button[aria-label="View profile analytics"]') ||
                          document.querySelector('a[href*="/dashboard/"]');
    
    // Add profile section button - specific aria-label
    const addSectionButton = document.querySelector('button[aria-label="Add profile section"]');
    
    // Note: Removed generic Array.from searches that were causing false positives
    // Now using specific aria-labels and href patterns from actual LinkedIn HTML
    
    return !!(editIntroButton || editIntroLink || addEditLink || createPostButton || analyticsButton || addSectionButton);
  },

  /**
   * Get detailed ownership information
   * @returns {object} Object with ownership details
   */
  getOwnershipDetails() {
    const editButton = document.querySelector('button[aria-label*="Edit intro"]') ||
                       document.querySelector('a[href*="/edit/intro/"]') ||
                       document.querySelector('.pvs-profile-actions__edit-profile') ||
                       Array.from(document.querySelectorAll('button')).find(btn => 
                         btn.getAttribute('aria-label')?.includes('Edit'));
    
    const addSectionButton = document.querySelector('button[aria-label*="Add profile section"]') ||
                           document.querySelector('a[href*="add-edit/"]') ||
                           Array.from(document.querySelectorAll('button')).find(btn => 
                             btn.textContent?.includes('Add profile section'));
    
    const analyticsButton = document.querySelector('button[aria-label*="View profile analytics"]') ||
                          document.querySelector('a[href*="/dashboard/"]') ||
                          Array.from(document.querySelectorAll('button')).find(btn => 
                            btn.textContent?.includes('View profile analytics'));
    
    const isMeUrl = window.location.pathname.includes('/in/me/');
    const hasIndicators = !!(editButton || addSectionButton || analyticsButton);
    
    return {
      hasIndicators,
      isMeUrl,
      indicators: {
        editButton: !!editButton,
        addSectionButton: !!addSectionButton,
        analyticsButton: !!analyticsButton
      }
    };
  }
};

// Export for use in both environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OwnershipDetector;
}