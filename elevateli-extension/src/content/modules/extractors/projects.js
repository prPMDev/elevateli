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
    
    Logger.debug(`[ProjectsExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      visibleCount
    });
    
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
      Logger.info('[ProjectsExtractor] Projects section not found');
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
    
    Logger.info(`[ProjectsExtractor] Extracted ${result.count} projects in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed projects data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Projects');
    const detailedProjects = await this.extractDetailedProjects(section);
    
    const result = {
      ...basicData,
      projects: detailedProjects,
      
      // Analysis features
      projectCategories: this.categorizeProjects(detailedProjects),
      technologiesUsed: this.extractTechnologies(detailedProjects),
      projectTypes: this.classifyProjectTypes(detailedProjects),
      collaborativeProjects: detailedProjects.filter(p => p.hasCollaborators),
      
      // Metrics
      averageDescriptionLength: this.calculateAverageDescriptionLength(detailedProjects),
      projectsWithLinks: detailedProjects.filter(p => p.projectUrl).length,
      
      // For AI processing
      projectSummaries: this.prepareForAI(detailedProjects)
    };
    
    Logger.info(`[ProjectsExtractor] Deep extraction completed in ${Date.now() - startTime}ms`);
    
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
   * Extract detailed project information
   * @param {Element} section - Projects section
   * @returns {Array<Object>} Detailed projects
   */
  async extractDetailedProjects(section) {
    const projects = await this.extractProjectItems(section);
    
    // Enhance with additional analysis
    return projects.map(proj => ({
      ...proj,
      technologies: this.extractProjectTechnologies(proj),
      category: this.categorizeProject(proj),
      type: this.classifyProjectType(proj),
      hasCollaborators: proj.hasCollaborators || this.detectCollaboration(proj.description),
      complexity: this.assessComplexity(proj),
      keywords: this.extractKeywords(proj)
    }));
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
   * Extract technologies from project
   * @param {Object} project - Project data
   * @returns {Array<string>} Technologies
   */
  extractProjectTechnologies(project) {
    const technologies = new Set();
    
    const techPatterns = [
      /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|Go|Rust|PHP|Swift)\b/gi,
      /\b(React|Angular|Vue|Node\.js|Express|Django|Spring|Rails)\b/gi,
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git)\b/gi,
      /\b(MongoDB|PostgreSQL|MySQL|Redis|Elasticsearch)\b/gi,
      /\b(TensorFlow|PyTorch|Scikit-learn|Pandas|NumPy)\b/gi
    ];
    
    const searchText = project.name + ' ' + project.description;
    
    techPatterns.forEach(pattern => {
      const matches = searchText.match(pattern);
      if (matches) {
        matches.forEach(tech => technologies.add(tech));
      }
    });
    
    return Array.from(technologies);
  },
  
  /**
   * Categorize project
   * @param {Object} project - Project data
   * @returns {string} Category
   */
  categorizeProject(project) {
    const searchText = (project.name + ' ' + project.description).toLowerCase();
    
    const categories = {
      'web': /website|web app|frontend|backend|full stack/i,
      'mobile': /mobile|android|ios|app/i,
      'data': /data|analytics|visualization|dashboard|report/i,
      'ml': /machine learning|ml|ai|artificial intelligence|neural/i,
      'automation': /automation|script|bot|workflow/i,
      'opensource': /open source|github|contribution/i,
      'research': /research|study|analysis|paper/i
    };
    
    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(searchText)) {
        return category;
      }
    }
    
    return 'other';
  },
  
  /**
   * Classify project type
   * @param {Object} project - Project data
   * @returns {string} Type
   */
  classifyProjectType(project) {
    const searchText = (project.name + ' ' + project.description).toLowerCase();
    
    if (/personal|hobby|side/i.test(searchText)) return 'personal';
    if (/academic|university|course|school/i.test(searchText)) return 'academic';
    if (/work|professional|company|client/i.test(searchText)) return 'professional';
    if (/volunteer|nonprofit|charity/i.test(searchText)) return 'volunteer';
    
    return 'unspecified';
  },
  
  /**
   * Detect collaboration
   * @param {string} description - Project description
   * @returns {boolean}
   */
  detectCollaboration(description) {
    const collaborationIndicators = /\b(team|collaborated|worked with|group|together|we|our)\b/i;
    return collaborationIndicators.test(description);
  },
  
  /**
   * Assess project complexity
   * @param {Object} project - Project data
   * @returns {string} Complexity level
   */
  assessComplexity(project) {
    let score = 0;
    
    // Length of description
    if (project.description.length > 500) score += 2;
    else if (project.description.length > 200) score += 1;
    
    // Number of technologies
    if (project.technologies.length > 5) score += 2;
    else if (project.technologies.length > 2) score += 1;
    
    // Collaboration
    if (project.hasCollaborators) score += 1;
    
    // Technical indicators
    if (/architecture|system design|scalable|distributed/i.test(project.description)) score += 2;
    
    if (score >= 5) return 'complex';
    if (score >= 3) return 'moderate';
    return 'simple';
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
   * Categorize all projects
   * @param {Array<Object>} projects - Projects
   * @returns {Object} Categories with counts
   */
  categorizeProjects(projects) {
    const categories = {};
    
    projects.forEach(proj => {
      const category = proj.category || 'other';
      categories[category] = (categories[category] || 0) + 1;
    });
    
    return categories;
  },
  
  /**
   * Extract all technologies
   * @param {Array<Object>} projects - Projects
   * @returns {Array<string>} All unique technologies
   */
  extractTechnologies(projects) {
    const allTech = new Set();
    
    projects.forEach(proj => {
      (proj.technologies || []).forEach(tech => allTech.add(tech));
    });
    
    return Array.from(allTech);
  },
  
  /**
   * Classify all project types
   * @param {Array<Object>} projects - Projects
   * @returns {Object} Types with counts
   */
  classifyProjectTypes(projects) {
    const types = {};
    
    projects.forEach(proj => {
      const type = proj.type || 'unspecified';
      types[type] = (types[type] || 0) + 1;
    });
    
    return types;
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