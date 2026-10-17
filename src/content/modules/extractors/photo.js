/**
 * Photo Extractor Module for ElevateLI
 * Handles detection of LinkedIn profile photo
 */

const PhotoExtractor = {
  /**
   * Quick scan for profile photo existence
   * @returns {Object} Scan results
   */
  async scan() {
    // Member photos are served from /dms/image/; the no-photo ghost avatar is a static asset
    return { exists: !!BaseExtractor.topCard()?.querySelector('[aria-label="Profile photo"] img[src*="/dms/image/"]') };
  },

  async extract() {
    return this.scan();
  }
};
