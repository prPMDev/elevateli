/**
 * Projects Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile projects section
 */

const ProjectsExtractor = {
  async scan() {
    return { exists: !!BaseExtractor.findSection('Projects') };
  },

  /**
   * Projects count for completeness scoring: rows with a name (their first field)
   * @returns {Object} { exists, count }
   */
  async extract() {
    const section = BaseExtractor.findSection('Projects');
    return { exists: !!section, count: BaseExtractor.items(section).filter(el => BaseExtractor.fields(el)[0]).length };
  }
};
