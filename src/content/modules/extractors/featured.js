/**
 * Featured Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile featured section
 */

const FeaturedExtractor = {
  /**
   * Quick scan for featured section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('Featured');
    const exists = !!section;

    let itemCount = 0;
    if (exists) {
      // Count featured items (posts, articles, media); each key repeats inside its card
      const keys = Array.from(section.querySelectorAll('[componentkey^="FeFeaturedItemUrn"]'))
        .map(el => el.getAttribute('componentkey'));
      itemCount = new Set(keys).size;
    }
    
    return {
      exists,
      itemCount
    };
  },
  
  /**
   * Extract featured data for completeness scoring
   * @returns {Object} Basic featured data
   */
  async extract() {
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        hasContent: false
      };
    }
    
    const result = {
      exists: true,
      count: scanResult.itemCount,
      hasContent: scanResult.itemCount > 0
    };
    
    return result;
  },
  
  /**
   * Check if item is recent
   * @param {string} dateStr - Date string
   * @returns {boolean}
   */
  isRecent(dateStr) {
    if (!dateStr) return false;
    
    // Simple check for recent keywords
    const recentIndicators = /today|yesterday|day ago|week ago|month ago/i;
    return recentIndicators.test(dateStr);
  },
};