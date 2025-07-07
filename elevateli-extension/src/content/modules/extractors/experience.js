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
    
    // Expand all "Show more" buttons within experience descriptions
    await this.expandAllDescriptions(section);
    
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
      
      // Content quality metrics
      averageDescriptionLength: this.calculateAverageDescriptionLength(experiences),
      rolesWithDescriptions: experiences.filter(e => e.description || e.bullets.length > 0).length,
      totalBulletPoints: experiences.reduce((sum, e) => sum + e.bullets.length, 0),
      
      // For AI processing
      experienceChunks: this.prepareForAI(experiences)
    };
    
    BaseExtractor.logTiming('Experience deep extract', startTime);
    Logger.info('[ExperienceExtractor] Deep extraction complete:', {
      totalRoles: experiences.length,
      withDescriptions: result.rolesWithDescriptions,
      withAchievements: result.hasQuantifiedAchievements,
      withTechStack: result.hasTechStack,
      avgDescLength: result.averageDescriptionLength
    });
    
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
      bullets: [],
      hasQuantifiedAchievements: false,
      hasTechStack: false,
      keywords: []
    };
    
    // Extract title - multiple selectors for different LinkedIn layouts
    const titleSelectors = [
      '.t-bold span[aria-hidden="true"]',
      'h3 span[aria-hidden="true"]',
      '.t-bold:not(.t-14) span',
      '[data-field="job_title"]'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = item.querySelector(selector);
      if (titleElement) {
        experience.title = BaseExtractor.extractTextContent(titleElement);
        if (experience.title) break;
      }
    }
    
    // Extract company - look for company name in various places
    const companySelectors = [
      '.t-14.t-normal span[aria-hidden="true"]:not(.t-black--light)',
      '.t-14:not(.t-bold) span[aria-hidden="true"]',
      '[data-field="company_name"]',
      'span.t-14.t-normal'
    ];
    
    for (const selector of companySelectors) {
      const companyElement = item.querySelector(selector);
      const text = BaseExtractor.extractTextContent(companyElement);
      // Filter out duration text that might be picked up
      if (text && !text.match(/\d+\s*(yr|year|mo|month)/i)) {
        experience.company = text.split('·')[0].trim(); // Remove employment type
        if (experience.company) break;
      }
    }
    
    // Extract duration and location
    const captionElements = item.querySelectorAll('.pvs-entity__caption-wrapper, .t-14.t-normal.t-black--light');
    captionElements.forEach(element => {
      const text = BaseExtractor.extractTextContent(element);
      if (text) {
        // Check if it's duration (contains time indicators)
        if (text.match(/\d+\s*(yr|year|mo|month)/i) || text.includes('Present')) {
          experience.duration = text;
        }
        // Check if it's location (contains location indicators)
        else if (text.includes(',') || text.match(/Remote|On-site|Hybrid/i)) {
          experience.location = text;
        }
      }
    });
    
    // Extract description and bullet points
    const descriptionSelectors = [
      '.pvs-list__outer-container > ul',
      '.pv-shared-text-with-see-more',
      '[data-field="description"]',
      '.inline-show-more-text'
    ];
    
    for (const selector of descriptionSelectors) {
      const descContainer = item.querySelector(selector);
      if (descContainer) {
        // Check for bullet points
        const bullets = descContainer.querySelectorAll('li');
        if (bullets.length > 0) {
          bullets.forEach(bullet => {
            const bulletText = BaseExtractor.extractTextContent(bullet);
            if (bulletText && bulletText.length > 10) { // Filter out empty or very short bullets
              experience.bullets.push(bulletText);
            }
          });
          // Combine bullets into description
          experience.description = experience.bullets.join(' • ');
        } else {
          // Single paragraph description
          experience.description = BaseExtractor.extractTextContent(descContainer);
        }
        
        if (experience.description) break;
      }
    }
    
    // Analyze content
    const fullContent = experience.description || experience.bullets.join(' ');
    if (fullContent) {
      experience.hasQuantifiedAchievements = this.hasQuantifiedAchievements(fullContent);
      experience.hasTechStack = this.hasTechStack(fullContent);
      experience.keywords = this.extractKeywords(fullContent);
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
      location: exp.location,
      description: exp.description,
      bullets: exp.bullets,
      // Chunk large descriptions
      descriptionChunks: BaseExtractor.chunkText(exp.description, 500),
      metrics: {
        hasQuantifiedAchievements: exp.hasQuantifiedAchievements,
        hasTechStack: exp.hasTechStack,
        keywordCount: exp.keywords.length,
        bulletCount: exp.bullets.length,
        descriptionLength: exp.description.length
      }
    }));
  },
  
  /**
   * Expand all "Show more" buttons within experience descriptions
   * @param {Element} section - Experience section
   */
  async expandAllDescriptions(section) {
    const showMoreSelectors = [
      'button[aria-label*="more"][aria-label*="description"]',
      'button.inline-show-more-text__button',
      'button[data-control-name="see_more"]',
      '.see-more-inline button'
    ];
    
    let expanded = false;
    for (const selector of showMoreSelectors) {
      const buttons = section.querySelectorAll(selector);
      for (const button of buttons) {
        if (button && button.offsetParent !== null) {
          Logger.debug('[ExperienceExtractor] Clicking show more button');
          button.click();
          expanded = true;
          await BaseExtractor.wait(300);
        }
      }
    }
    
    if (expanded) {
      await BaseExtractor.wait(500); // Wait for content to load
    }
  },
  
  /**
   * Calculate average description length
   * @param {Array<Object>} experiences - Experience items
   * @returns {number} Average length
   */
  calculateAverageDescriptionLength(experiences) {
    const withDescriptions = experiences.filter(e => e.description || e.bullets.length > 0);
    if (withDescriptions.length === 0) return 0;
    
    const totalLength = withDescriptions.reduce((sum, exp) => {
      const descLength = exp.description ? exp.description.length : 0;
      const bulletsLength = exp.bullets.reduce((s, b) => s + b.length, 0);
      return sum + descLength + bulletsLength;
    }, 0);
    
    return Math.round(totalLength / withDescriptions.length);
  }
};