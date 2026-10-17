/**
 * Featured Extractor Module for ElevateLI
 * Detects the profile's Featured section (not scored; shown in the scan list)
 */

const FeaturedExtractor = {
  async scan() {
    return { exists: !!BaseExtractor.findSection('Featured') };
  },

  async extract() {
    return this.scan();
  }
};
