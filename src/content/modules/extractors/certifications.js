/**
 * Certifications Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile certifications section
 */

const CertificationsExtractor = {
  async scan() {
    const section = BaseExtractor.findSection('Licenses & certifications');
    // Heading carries the total: "Licenses & certifications (14)"; count() falls back to the visible rows
    return { exists: !!section, totalCount: section ? BaseExtractor.count(section) : 0 };
  },

  async extract() {
    const { exists, totalCount } = await this.scan();
    return { exists, count: totalCount };
  }
};
