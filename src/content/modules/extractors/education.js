/**
 * Education Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile education section
 */

const EducationExtractor = {
  async scan() {
    return { exists: !!BaseExtractor.findSection('Education') };
  },

  /**
   * Education count for completeness scoring: rows with a school (their first field)
   * @returns {Object} { exists, count }
   */
  async extract() {
    const section = BaseExtractor.findSection('Education');
    return { exists: !!section, count: BaseExtractor.items(section).filter(el => BaseExtractor.fields(el)[0]).length };
  }
};
