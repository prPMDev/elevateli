/**
 * About Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile About section
 */

const AboutExtractor = {
  async scan() {
    return { exists: !!BaseExtractor.findSection('About') };
  },

  /**
   * Extract about text for completeness scoring
   * @returns {Object} { exists, charCount, text }
   */
  async extract() {
    const section = BaseExtractor.findSection('About');
    if (!section) return { exists: false };

    // Full text: the AI reads it as the whole About. 5 characters or fewer counts as empty.
    const text = BaseExtractor.longText(section);
    return text.length > 5 ? { exists: true, charCount: text.length, text } : { exists: true, charCount: 0, text: '' };
  }
};
