/**
 * Skills Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile skills section
 */

const SkillsExtractor = {
  /**
   * Quick scan for skills section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('Skills');

    return {
      exists: !!section,
      visibleCount: BaseExtractor.items(section).length,
      // Heading carries the total: "Skills (58)"; count() falls back to the visible rows
      totalCount: section ? BaseExtractor.count(section) : 0
    };
  },

  /**
   * Extract skills data for completeness scoring
   * @returns {Object} Basic skills data with total count
   */
  async extract() {
    const scanResult = await this.scan();
    if (!scanResult.exists) return scanResult;

    const visibleSkills = BaseExtractor.items(BaseExtractor.findSection('Skills'))
      .map(item => this.extractSkillItem(item))
      .filter(skill => skill.name);

    return {
      exists: true,
      count: scanResult.totalCount,
      visibleCount: scanResult.visibleCount,
      skills: visibleSkills.slice(0, 5) // Just top 5 for basic extraction
    };
  },

  /**
   * Extract single skill item
   * Fields: name, then context lines ("7 experiences at Avalara and 6 other companies", a school, "7 endorsements")
   * @param {Element} item - Skill row
   * @returns {Object} Skill data
   */
  extractSkillItem(item) {
    const [name = '', ...context] = BaseExtractor.fields(item);
    // "99+ endorsements" is LinkedIn's capped label
    const endorsements = context.map(field => field.match(/^(\d+)\+? endorsements?/)).find(Boolean);

    return {
      name,
      endorsementCount: endorsements ? parseInt(endorsements[1]) : 0
    };
  }
};
