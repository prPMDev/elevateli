/**
 * Headline Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile headline
 */

const HeadlineExtractor = {
  /**
   * Quick scan for headline existence
   * @returns {Object} Scan results
   */
  async scan() {
    // Top card <p>s after the name: optional pronouns ("He/Him"), then the headline
    // ponytail: pronouns spotted by their "X/Y" or "X/Y/Z" shape; custom pronouns with spaces would be read as the
    // headline, and a whole headline of that shape ("Founder/CEO") is taken for pronouns
    const element = Array.from(BaseExtractor.topCard()?.querySelectorAll('p') || [])
      .find(p => !/^\w+(\/\w+)+$/.test(p.textContent.trim()));

    return {
      exists: !!element,
      element
    };
  },

  /**
   * Extract headline for completeness scoring
   * @returns {Object} { exists, charCount, text }
   */
  async extract() {
    const { element } = await this.scan();
    const text = element?.textContent.trim() || '';
    return { exists: !!element, charCount: text.length, text };
  }
};
