/**
 * Projects Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile projects section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const ProjectsExtractor = {
  name: 'projects',
  
  /**
   * Quick scan for projects section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('Projects');
    
    return {
      exists: !!section,
      visibleCount: BaseExtractor.items(section).length
    };
  },
  
  /**
   * Extract projects data for completeness scoring
   * @returns {Object} Basic projects data
   */
  async extract() {
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        projects: []
      };
    }
    
    const projects = BaseExtractor.items(BaseExtractor.findSection('Projects'))
      .map(element => this.extractProjectItem(element))
      .filter(project => project.name);
    
    const result = {
      exists: true,
      count: projects.length,
      projects: projects.map(proj => ({
        name: proj.name,
        hasDescription: proj.description.length > 0
      })),
      hasTechnicalProjects: projects.some(proj => this.isTechnicalProject(proj)),
      hasRecentProjects: projects.some(proj => this.isRecentProject(proj.date))
    };
    
    return result;
  },
  
  /**
   * Extract single project item
   * Fields: name, dates, description, "Contributors: ...", skills; name and description are both text boxes
   * @param {Element} element - Project element
   * @returns {Object} Project data
   */
  extractProjectItem(element) {
    const [name = '', date = ''] = BaseExtractor.fields(element);
    const description = Array.from(element.querySelectorAll('[data-testid="expandable-text-box"]'))
      .map(box => BaseExtractor.text(box))
      .find(text => text !== name) || '';
    
    return { name, date, description };
  },
  
  /**
   * Check if project is technical
   * @param {Object} project - Project data
   * @returns {boolean}
   */
  isTechnicalProject(project) {
    const techIndicators = /\b(software|application|website|app|system|platform|tool|api|database|algorithm|machine learning|AI|data)\b/i;
    return techIndicators.test(project.name + ' ' + project.description);
  },
  
  /**
   * Check if project is recent
   * @param {string} dateStr - Project date
   * @returns {boolean}
   */
  isRecentProject(dateStr) {
    if (!dateStr) return false;
    
    const currentYear = new Date().getFullYear();
    const yearMatch = dateStr.match(/\d{4}/);
    
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      return (currentYear - year) <= 2;
    }
    
    return false;
  },
  
  /**
   * Extract keywords from project
   * @param {Object} project - Project data
   * @returns {Array<string>} Keywords
   */
  extractKeywords(project) {
    const stopWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i']);
    
    const words = (project.name + ' ' + project.description)
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    // Count frequency
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Return top keywords
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  },
  
  /**
   * Calculate average description length
   * @param {Array<Object>} projects - Projects
   * @returns {number} Average length
   */
  calculateAverageDescriptionLength(projects) {
    if (projects.length === 0) return 0;
    
    const totalLength = projects.reduce((sum, proj) => sum + proj.description.length, 0);
    return Math.round(totalLength / projects.length);
  }
};