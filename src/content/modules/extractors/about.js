/**
 * About Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile About section
 */

const AboutExtractor = {
  /**
   * Quick scan for about section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('About');

    return {
      exists: !!section,
      hasShowMore: !!section?.querySelector('[data-testid="expandable-text-box"] button')
    };
  },

  /**
   * Extract about text for completeness scoring
   * @returns {Object} Basic about data with character count
   */
  async extract() {
    const scanResult = await this.scan();

    if (!scanResult.exists) {
      return {
        exists: false,
        charCount: 0,
        text: '',
        hasShowMore: false
      };
    }

    const section = BaseExtractor.findSection('About');
    const text = BaseExtractor.longText(section);

    // Check if the text is essentially empty
    const isEffectivelyEmpty = text.length <= 5;

    const result = {
      exists: true,
      charCount: isEffectivelyEmpty ? 0 : text.length,
      text: isEffectivelyEmpty ? '' : text, // Full text: the AI reads it as the whole About
      hasShowMore: scanResult.hasShowMore,
      wordCount: isEffectivelyEmpty ? 0 : text.split(/\s+/).filter(w => w.length > 0).length,
      paragraphs: isEffectivelyEmpty ? 0 : text.split(/\n\n+/).filter(p => p.trim()).length
    };

    return result;
  }
};
