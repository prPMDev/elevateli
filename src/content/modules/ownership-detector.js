/**
 * [CRITICAL_PATH:OWNERSHIP_DETECTION] - P0: Profile ownership verification
 * Detects if the current LinkedIn profile belongs to the user (content scripts: isOwnProfile, the popup's saveProfile message)
 */

const OwnershipDetector = {
  /**
   * Check for ownership indicators on the profile page
   * The Edit intro link only appears on your own profile and carries its slug (/in/<slug>/edit/intro/),
   * so a previous profile's top card still in the DOM after SPA navigation can't match the new URL
   * @returns {boolean} true if ownership indicators are found
   */
  hasOwnershipIndicators() {
    // Compare pathnames, not the raw href: a.pathname is percent-encoded like location.pathname, so non-ASCII slugs match
    const id = extractProfileIdFromUrl()?.toLowerCase();
    return !!id && Array.from(document.querySelectorAll('main a[href*="/edit/intro/"]'))
      .some(a => a.pathname.toLowerCase().startsWith(`/in/${id}/edit/intro`));
  }
};
