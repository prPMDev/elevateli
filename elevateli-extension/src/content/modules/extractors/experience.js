/**
 * Experience Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile experience section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const ExperienceExtractor = {
  name: 'experience',
  
  selectors: [
    'section#experience-section',
    'section[data-section="experience"]',
    'div[data-view-name="profile-card"][id*="experience"]',
    'section:has(#experience)',
    'div:has(#experience)'
  ],
  
  /**
   * Quick scan for experience section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Experience');
    const exists = !!section;
    
    let visibleCount = 0;
    let totalCount = 0;
    let showAllUrl = null;
    
    if (exists) {
      // Quick count of visible items
      const visibleItems = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      visibleCount = visibleItems.length;
      
      // Extract "Show all" info without clicking
      const showAllInfo = BaseExtractor.extractShowAllInfo(section, 'experience');
      totalCount = showAllInfo.totalCount || visibleCount;
      showAllUrl = showAllInfo.showAllUrl;
    }
    
    BaseExtractor.logTiming('Experience scan', startTime);
    Logger.info(`[ExperienceExtractor] Scan result:`, {
      exists,
      visibleCount,
      totalCount,
      hasMore: totalCount > visibleCount,
      showAllUrl: showAllUrl ? 'found' : 'not found'
    });
    
    return {
      exists,
      visibleCount,
      totalCount,
      hasMore: totalCount > visibleCount,
      showAllUrl
    };
  },
  
  /**
   * Extract experience data for completeness scoring
   * @returns {Object} Basic experience data with total count
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        totalMonths: 0,
        hasCurrentRole: false
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Experience');
    
    // Use totalCount from scan (already extracted from "Show all")
    const totalCount = scanResult.totalCount || scanResult.visibleCount;
    
    // Calculate total months and check for current role
    const basicInfo = await this.extractBasicInfo(section);
    
    const result = {
      exists: true,
      count: totalCount,
      totalMonths: basicInfo.totalMonths,
      hasCurrentRole: basicInfo.hasCurrentRole,
      visibleCount: scanResult.visibleCount,
      hasMoreItems: totalCount > scanResult.visibleCount,
      showAllUrl: scanResult.showAllUrl
    };
    
    BaseExtractor.logTiming('Experience extract', startTime);
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed experience data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Experience');
    
    // Expand section if needed
    if (basicData.hasMoreItems) {
      await BaseExtractor.expandSection(section, 'button[aria-label*="Show all"]');
    }
    
    // Extract detailed experience items
    const experiences = await this.extractDetailedExperiences(section);
    
    const result = {
      ...basicData,
      experiences: experiences,
      
      // Analysis metrics
      averageTenure: this.calculateAverageTenure(experiences),
      careerProgression: this.analyzeCareerProgression(experiences),
      industryChanges: this.countIndustryChanges(experiences),
      hasQuantifiedAchievements: experiences.some(e => e.hasQuantifiedAchievements),
      hasTechStack: experiences.some(e => e.hasTechStack),
      
      // For AI processing
      experienceChunks: this.prepareForAI(experiences)
    };
    
    BaseExtractor.logTiming('Experience deep extract', startTime);
    return result;
  },
  
  /**
   * Extract total count from "Show all" button
   * @param {Element} section - Experience section
   * @returns {number} Total count
   */
  async extractTotalCount(section) {
    const showAllSelectors = [
      'a[href*="/details/experience"]',
      'a[aria-label*="Show all"]',
      'button[aria-label*="Show all"]'
    ];
    
    for (const selector of showAllSelectors) {
      const showAllElement = section.querySelector(selector);
      if (showAllElement) {
        const text = showAllElement.textContent || showAllElement.getAttribute('aria-label') || '';
        
        const patterns = [
          /Show all (\d+) experiences?/i,
          /(\d+)\s*experiences?/i,
          /(\d+)\s*positions?/i
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return parseInt(match[1]);
          }
        }
      }
    }
    
    return 0;
  },
  
  /**
   * Extract basic info like total months and current role
   * @param {Element} section - Experience section
   * @returns {Object} Basic info
   */
  async extractBasicInfo(section) {
    const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    let totalMonths = 0;
    let hasCurrentRole = false;
    
    for (const item of items) {
      // Check for current role (no end date)
      const dateText = BaseExtractor.extractTextContent(
        item.querySelector('.t-14:not(.t-bold), .pvs-entity__caption-wrapper')
      );
      
      if (dateText && (dateText.includes('Present') || dateText.includes('present'))) {
        hasCurrentRole = true;
      }
      
      // Extract duration if available
      const durationMatch = dateText?.match(/(\d+)\s*(yr|year|mo|month)/gi);
      if (durationMatch) {
        // Simple duration calculation (can be enhanced)
        totalMonths += this.parseDuration(dateText);
      }
    }
    
    return { totalMonths, hasCurrentRole };
  },
  
  /**
   * Extract detailed experience items
   * @param {Element} section - Experience section
   * @returns {Array<Object>} Detailed experiences
   */
  async extractDetailedExperiences(section) {
    const experiences = [];
    const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const item of items) {
      const experience = await this.extractExperienceItem(item);
      if (experience.title) {
        experiences.push(experience);
      }
    }
    
    return experiences;
  },
  
  /**
   * Extract single experience item
   * @param {Element} item - Experience item element
   * @returns {Object} Experience data
   */
  async extractExperienceItem(item) {
    const experience = {
      title: '',
      company: '',
      duration: '',
      location: '',
      description: '',
      hasQuantifiedAchievements: false,
      hasTechStack: false,
      keywords: []
    };
    
    // Extract title
    const titleElement = item.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    experience.title = BaseExtractor.extractTextContent(titleElement);
    
    // Extract company
    const companyElement = item.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    experience.company = BaseExtractor.extractTextContent(companyElement);
    
    // Extract duration
    const durationElement = item.querySelector('.pvs-entity__caption-wrapper');
    experience.duration = BaseExtractor.extractTextContent(durationElement);
    
    // Extract description
    const descElement = item.querySelector('.pvs-list__outer-container > ul li');
    experience.description = BaseExtractor.extractTextContent(descElement);
    
    // Analyze description
    if (experience.description) {
      experience.hasQuantifiedAchievements = this.hasQuantifiedAchievements(experience.description);
      experience.hasTechStack = this.hasTechStack(experience.description);
      experience.keywords = this.extractKeywords(experience.description);
    }
    
    return experience;
  },
  
  /**
   * Check for quantified achievements
   * @param {string} text - Description text
   * @returns {boolean}
   */
  hasQuantifiedAchievements(text) {
    const pattern = /\d+[%+,kKmMbB$]*\s*(revenue|users|customers|growth|increase|decrease|ROI|saved|generated|improvement|reduction)/gi;
    return pattern.test(text);
  },
  
  /**
   * Check for tech stack mentions
   * @param {string} text - Description text
   * @returns {boolean}
   */
  hasTechStack(text) {
    const techPattern = /\b(React|Angular|Vue|Node|Python|Java|JavaScript|AWS|Azure|Docker|Kubernetes|SQL|API)\b/gi;
    return techPattern.test(text);
  },
  
  /**
   * Extract keywords from text
   * @param {string} text - Description text
   * @returns {Array<string>}
   */
  extractKeywords(text) {
    const techPattern = /\b(React|Angular|Vue|Node|Python|Java|JavaScript|AWS|Azure|Docker|Kubernetes|SQL|API)\b/gi;
    const matches = text.match(techPattern) || [];
    return [...new Set(matches.map(k => k.toLowerCase()))];
  },
  
  /**
   * Parse duration string to months
   * @param {string} duration - Duration text
   * @returns {number} Total months
   */
  parseDuration(duration) {
    let months = 0;
    
    const yearMatch = duration.match(/(\d+)\s*(yr|year)/i);
    if (yearMatch) {
      months += parseInt(yearMatch[1]) * 12;
    }
    
    const monthMatch = duration.match(/(\d+)\s*(mo|month)/i);
    if (monthMatch) {
      months += parseInt(monthMatch[1]);
    }
    
    return months;
  },
  
  /**
   * Calculate average tenure
   * @param {Array<Object>} experiences - Experience items
   * @returns {number} Average months per role
   */
  calculateAverageTenure(experiences) {
    if (experiences.length === 0) return 0;
    
    const totalMonths = experiences.reduce((sum, exp) => {
      return sum + this.parseDuration(exp.duration);
    }, 0);
    
    return Math.round(totalMonths / experiences.length);
  },
  
  /**
   * Analyze career progression
   * @param {Array<Object>} experiences - Experience items
   * @returns {string} Progression analysis
   */
  analyzeCareerProgression(experiences) {
    if (experiences.length < 2) return 'insufficient_data';
    
    const titles = experiences.map(e => e.title.toLowerCase());
    const progressionIndicators = ['senior', 'lead', 'principal', 'manager', 'director', 'vp', 'chief'];
    
    let progressionScore = 0;
    for (let i = 1; i < titles.length; i++) {
      const currentLevel = progressionIndicators.findIndex(ind => titles[i].includes(ind));
      const previousLevel = progressionIndicators.findIndex(ind => titles[i-1].includes(ind));
      
      if (currentLevel > previousLevel) progressionScore++;
    }
    
    return progressionScore > experiences.length / 3 ? 'upward' : 'lateral';
  },
  
  /**
   * Count industry changes
   * @param {Array<Object>} experiences - Experience items
   * @returns {number} Number of industry changes
   */
  countIndustryChanges(experiences) {
    // Simplified - could be enhanced with industry detection
    const companies = experiences.map(e => e.company);
    const uniqueCompanies = new Set(companies);
    return Math.max(0, uniqueCompanies.size - 1);
  },
  
  /**
   * Prepare experiences for AI processing
   * @param {Array<Object>} experiences - Experience items
   * @returns {Array<Object>} Chunked data for AI
   */
  prepareForAI(experiences) {
    return experiences.map(exp => ({
      title: exp.title,
      company: exp.company,
      duration: exp.duration,
      // Chunk large descriptions
      descriptionChunks: BaseExtractor.chunkText(exp.description, 500),
      metrics: {
        hasQuantifiedAchievements: exp.hasQuantifiedAchievements,
        hasTechStack: exp.hasTechStack,
        keywordCount: exp.keywords.length
      }
    }));
  }
};