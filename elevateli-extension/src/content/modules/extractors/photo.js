/**
 * Photo Extractor Module for ElevateLI
 * Handles detection of LinkedIn profile photo
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const PhotoExtractor = {
  name: 'photo',
  
  selectors: [
    '.pv-top-card-profile-picture img',
    '.profile-photo-edit__preview',
    '.pv-top-card__photo img',
    '.pv-top-card-profile-picture__image',
    'img[class*="profile-photo"]',
    'img[class*="pv-top-card"][class*="photo"]'
  ],
  
  /**
   * Quick scan for profile photo existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    let exists = false;
    let photoUrl = null;
    
    // Try each selector
    for (const selector of this.selectors) {
      const photoElement = document.querySelector(selector);
      if (photoElement) {
        exists = true;
        photoUrl = photoElement.src || photoElement.getAttribute('src');
        Logger.debug(`[PhotoExtractor] Found photo with selector: ${selector}`);
        break;
      }
    }
    
    // If not found with selectors, try finding by attributes
    if (!exists) {
      const allImages = document.querySelectorAll('img');
      for (const img of allImages) {
        const alt = img.alt || '';
        const className = img.className || '';
        if (alt.toLowerCase().includes('profile photo') || 
            alt.includes('profile picture') ||
            className.includes('profile-photo')) {
          exists = true;
          photoUrl = img.src;
          Logger.debug('[PhotoExtractor] Found photo by attribute search');
          break;
        }
      }
    }
    
    Logger.info(`[PhotoExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      hasUrl: !!photoUrl
    });
    
    return {
      exists,
      photoUrl
    };
  },
  
  /**
   * Extract photo data for completeness scoring
   * @returns {Object} Photo data
   */
  async extract() {
    const scanResult = await this.scan();
    
    return {
      exists: scanResult.exists,
      hasPhoto: scanResult.exists,
      photoUrl: scanResult.photoUrl
    };
  },
  
  /**
   * Deep extraction is same as basic for photo
   * @returns {Object} Photo data
   */
  // REMOVED: extractDeep - duplicate method that just calls extract(), not used by analyzer
};