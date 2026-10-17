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
    const visibleCount = BaseExtractor.items(section).length;
    // Heading carries the total: "Skills (58)"
    const totalCount = section ? BaseExtractor.count(section) : 0;

    return {
      exists: !!section,
      visibleCount,
      totalCount,
      hasMore: totalCount > visibleCount
    };
  },

  /**
   * Extract skills data for completeness scoring
   * @returns {Object} Basic skills data with total count
   */
  async extract() {
    const scanResult = await this.scan();

    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        charCount: 0, // Added for completeness scoring
        skills: []
      };
    }

    const totalCount = scanResult.totalCount || scanResult.visibleCount;
    const visibleSkills = BaseExtractor.items(BaseExtractor.findSection('Skills'))
      .map((item, i) => this.extractSkillItem(item, i))
      .filter(skill => skill.name);

    return {
      exists: true,
      count: totalCount,
      charCount: totalCount * 30, // Average skill name length * count, for completeness scoring
      visibleCount: scanResult.visibleCount,
      hasMoreSkills: totalCount > scanResult.visibleCount,
      skills: visibleSkills.slice(0, 5), // Just top 5 for basic extraction
      hasEndorsements: visibleSkills.some(s => s.endorsementCount > 0)
    };
  },

  /**
   * Extract single skill item
   * Fields: name, then context lines ("7 experiences at Avalara and 6 other companies", a school, "7 endorsements")
   * @param {Element} item - Skill row
   * @param {number} index - Skill position in the list
   * @returns {Object} Skill data
   */
  extractSkillItem(item, index = 0) {
    const [name = '', ...context] = BaseExtractor.fields(item);
    // "99+ endorsements" is LinkedIn's capped label
    const endorsements = context.map(field => field.match(/^(\d+)\+? endorsements?/)).find(Boolean);

    return {
      name,
      position: index + 1, // 1-based position
      endorsementCount: endorsements ? parseInt(endorsements[1]) : 0
    };
  }
};
