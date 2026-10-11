/**
 * Projects Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile projects section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const ProjectsExtractor = {
  name: 'projects',
  
  selectors: [
    'section[data-section="projects"]',
    'section:has(h2:contains("Projects"))',
    'div[data-view-name="profile-card"]:has(h2:contains("Projects"))',
    'section.pv-accomplishments-section:has(h3:contains("Project"))',
    'section#projects-section'
  ],
  
  /**
   * Quick scan for projects section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Projects');
    const exists = !!section;
    
    let visibleCount = 0;
    if (exists) {
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      visibleCount = items.length;
    }
    
    return {
      exists,
      visibleCount
    };
  },
  
  /**
   * Extract projects data for completeness scoring
   * @returns {Object} Basic projects data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        projects: []
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Projects');
    const projects = await this.extractProjectItems(section);
    
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
   * Extract project items
   * @param {Element} section - Projects section
   * @returns {Array<Object>} Project items
   */
  async extractProjectItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractProjectItem(element);
      if (item.name) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single project item
   * @param {Element} element - Project element
   * @returns {Object} Project data
   */
  async extractProjectItem(element) {
    const project = {
      name: '',
      description: '',
      date: '',
      collaborators: [],
      projectUrl: '',
      technologies: []
    };
    
    // Extract project name
    const nameEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    project.name = BaseExtractor.extractTextContent(nameEl);
    
    // Extract date
    const dateEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    project.date = BaseExtractor.extractTextContent(dateEl);
    
    // Extract description
    const descEl = element.querySelector('.pvs-list__outer-container span[aria-hidden="true"], .inline-show-more-text span[aria-hidden="true"]');
    project.description = BaseExtractor.extractTextContent(descEl);
    
    // Extract project URL
    const linkEl = element.querySelector('a[href*="project"], a[aria-label*="project"]');
    if (linkEl) {
      project.projectUrl = linkEl.href;
    }
    
    // Extract collaborators (if mentioned)
    const collaboratorText = project.description.match(/collaborated with|team of|worked with/i);
    if (collaboratorText) {
      project.hasCollaborators = true;
    }
    
    return project;
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
  },
  
  /**
   * Prepare projects for AI processing
   * @param {Array<Object>} projects - Projects
   * @returns {Array<Object>} Prepared projects
   */
  prepareForAI(projects) {
    return projects.map((proj, index) => ({
      index: index + 1,
      name: proj.name,
      category: proj.category,
      type: proj.type,
      technologies: proj.technologies.join(', '),
      complexity: proj.complexity,
      description: BaseExtractor.chunkText(proj.description, 500),
      keywords: proj.keywords.slice(0, 5)
    }));
  }
};