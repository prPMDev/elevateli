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
    const photo = BaseExtractor.topCard()?.querySelector('[aria-label="Profile photo"] img[src*="/dms/image/"]');
    
    return {
      exists: !!photo,
      photoUrl: photo?.getAttribute('src') || null
    };
  },
  
  /**
   * Extract photo data for completeness scoring
   * @returns {Object} Photo data
   */
  async extract() {
    const scanResult = await this.scan();
    
    const result = {
      exists: scanResult.exists,
      hasPhoto: scanResult.exists,
      photoUrl: scanResult.photoUrl
    };
    
    return result;
  },
  
};