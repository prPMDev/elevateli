/**
 * [CRITICAL_PATH:OWNERSHIP_DETECTION] - P0: Profile ownership verification
 * Shared module for detecting if the current LinkedIn profile belongs to the user
 * Used by both popup and content scripts
 */

const OwnershipDetector = {
  /**
   * Check for ownership indicators on the profile page
   * The Edit intro link only appears on your own profile and carries its slug (/in/<slug>/edit/intro/),
   * so a previous profile's top card still in the DOM after SPA navigation can't match the new URL
   * @returns {boolean} true if ownership indicators are found
   */
  hasOwnershipIndicators() {
    // A pathname segment can't hold `"` or `\` (the URL parser encodes them), so it is safe in a quoted selector
    const id = extractProfileIdFromUrl();
    return !!(id && document.querySelector(`main a[href*="/in/${id}/edit/intro/" i]`));
  }
};

// Export for use in both environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OwnershipDetector;
}