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
    'div:has(#experience)',
    'section:has(div#experience.pv-profile-card__anchor)', // Current LinkedIn structure
    // New pattern: anchor + sibling
    '#experience.pv-profile-card__anchor + div',
    '#experience ~ div',
    // More flexible patterns
    'div#experience',
    'section#experience'
  ],
  
  // Selectors for experience items
  experienceItemSelectors: [
    '[data-view-name="profile-component-entity"]',
    '.pvs-entity',
    '.pvs-list__paged-list-item',
    'li.artdeco-list__item',
    'div.pvs-entity',
    'li.pvs-list__item--line-separated',
    '.experience-item'
  ],
  
  /**
   * Quick scan for experience section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    Logger.info('[ExperienceExtractor] Starting scan');
    
    // Use BaseExtractor's findSection method like other extractors
    const section = await BaseExtractor.findSection(this.selectors);
    
    if (!section) {
      Logger.info('[ExperienceExtractor] No experience section found');
      return { exists: false, visibleCount: 0, totalCount: 0 };
    }
    
    Logger.info('[ExperienceExtractor] Found experience section:', {
      tagName: section.tagName,
      id: section.id,
      className: section.className
    });
    
    // Look for experience items within the section
    let visibleCount = 0;
    let items = [];
    
    // Try each item selector
    for (const selector of this.experienceItemSelectors) {
      items = section.querySelectorAll(selector);
      if (items.length > 0) {
        visibleCount = items.length;
        Logger.info(`[ExperienceExtractor] Found ${visibleCount} experience items with selector: ${selector}`);
        break;
      }
    }
    
    // If still no items, check for LinkedIn's anchor pattern
    if (visibleCount === 0) {
      const anchor = section.querySelector('#experience.pv-profile-card__anchor') || section.querySelector('#experience');
      if (anchor) {
        Logger.info('[ExperienceExtractor] Found experience anchor, checking siblings');
        let sibling = anchor.nextElementSibling;
        while (sibling && visibleCount < 10) {
          if (sibling.getAttribute('data-view-name') === 'profile-component-entity' || 
              sibling.classList.contains('pvs-entity')) {
            visibleCount++;
          }
          sibling = sibling.nextElementSibling;
        }
      }
    }
    
    // For now, visible count = total count (can enhance with "Show all" later)
    const totalCount = visibleCount;
    
    BaseExtractor.logTiming('Experience scan', startTime);
    Logger.info(`[ExperienceExtractor] Scan result:`, {
      exists: visibleCount > 0,
      visibleCount,
      totalCount,
      hasMore: totalCount > visibleCount,
      showAllUrl: null
    });
    
    return {
      exists: visibleCount > 0,
      visibleCount,
      totalCount,
      hasMore: totalCount > visibleCount,
      showAllUrl: null
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
    
    // Use totalCount from scan
    const totalCount = scanResult.totalCount || scanResult.visibleCount;
    
    // Calculate total months and check for current role
    const basicInfo = await this.extractBasicInfo();
    
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
    Logger.info('[ExperienceExtractor] Starting extractDeep');
    
    const basicData = await this.extract();
    Logger.info('[ExperienceExtractor] Basic data extracted:', {
      exists: basicData.exists,
      count: basicData.count
    });
    
    if (!basicData.exists) {
      Logger.info('[ExperienceExtractor] No experience section found, returning basic data');
      return basicData;
    }
    
    // Click all "see more" buttons to expand descriptions
    const allSeeMoreButtons = document.querySelectorAll('.inline-show-more-text__button');
    Logger.info(`[ExperienceExtractor] Found ${allSeeMoreButtons.length} see more buttons`);
    
    for (const btn of allSeeMoreButtons) {
      if (btn && btn.offsetParent !== null && !btn.getAttribute('aria-expanded')) {
        Logger.debug('[ExperienceExtractor] Clicking see more button');
        btn.click();
        await BaseExtractor.wait(200);
      }
    }
    
    // Extract detailed experience items (pass null since we don't use section)
    Logger.info('[ExperienceExtractor] Extracting detailed experiences');
    const experiences = await this.extractDetailedExperiences(null);
    Logger.info('[ExperienceExtractor] Extracted experiences:', {
      count: experiences.length,
      firstTitle: experiences[0]?.title,
      firstCompany: experiences[0]?.company
    });
    
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
      rolesWithDescriptions: experiences.filter(e => e.description).length,
      
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
  async extractBasicInfo() {
    // Find experience section using BaseExtractor
    const section = await BaseExtractor.findSection(this.selectors);
    if (!section) return { totalMonths: 0, hasCurrentRole: false };
    
    const items = [];
    
    // Find experience items using selectors
    for (const selector of this.experienceItemSelectors) {
      const foundItems = section.querySelectorAll(selector);
      if (foundItems.length > 0) {
        foundItems.forEach(item => items.push(item));
        break;
      }
    }
    
    // If no items found, try anchor pattern
    if (items.length === 0) {
      const anchor = section.querySelector('#experience.pv-profile-card__anchor') || section.querySelector('#experience');
      if (anchor) {
        let sibling = anchor.nextElementSibling;
        while (sibling && items.length < 10) {
          if (sibling.getAttribute('data-view-name') === 'profile-component-entity' || 
              sibling.classList.contains('pvs-entity')) {
            items.push(sibling);
          }
          sibling = sibling.nextElementSibling;
        }
      }
    }
    
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
  async extractDetailedExperiences(passedSection) {
    const experiences = [];
    
    // Find experience section if not passed
    const section = passedSection || await BaseExtractor.findSection(this.selectors);
    if (!section) {
      Logger.warn('[ExperienceExtractor] No experience section found in extractDetailedExperiences');
      return experiences;
    }
    
    // Collect all experience items
    const items = [];
    
    // Try experience item selectors
    for (const selector of this.experienceItemSelectors) {
      const foundItems = section.querySelectorAll(selector);
      if (foundItems.length > 0) {
        foundItems.forEach(item => items.push(item));
        Logger.info(`[ExperienceExtractor] Found ${foundItems.length} items with selector: ${selector}`);
        break;
      }
    }
    
    // If no items found, try anchor pattern
    if (items.length === 0) {
      const anchor = section.querySelector('#experience.pv-profile-card__anchor') || section.querySelector('#experience');
      if (anchor) {
        Logger.info('[ExperienceExtractor] Found anchor, checking siblings');
        let sibling = anchor.nextElementSibling;
        while (sibling && items.length < 10) {
          if (sibling.getAttribute('data-view-name') === 'profile-component-entity' || 
              sibling.classList.contains('pvs-entity')) {
            items.push(sibling);
          }
          sibling = sibling.nextElementSibling;
        }
      }
    }
    
    Logger.info(`[ExperienceExtractor] Found ${items.length} experience items`);
    const totalCount = items.length;
    
    for (let i = 0; i < items.length; i++) {
      Logger.debug(`[ExperienceExtractor] Processing experience item ${i + 1} of ${totalCount}`);
      const experience = await this.extractExperienceItem(items[i], i, totalCount);
      
      Logger.debug(`[ExperienceExtractor] Extracted experience ${i + 1}:`, {
        title: experience.title,
        company: experience.company,
        hasDescription: !!experience.description,
        descriptionLength: experience.description?.length || 0,
        hasDescription: !!experience.description
      });
      
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
  async extractExperienceItem(item, index = 0, totalCount = 1) {
    Logger.debug('[ExperienceExtractor] Extracting experience item', { index });
    
    const experience = {
      title: '',
      company: '',
      companyDetails: { size: '', industry: '', type: '' },
      employment: {
        type: '',
        startDate: '',
        endDate: '',
        duration: '',
        isCurrent: false,
        monthsInRole: 0
      },
      duration: '',
      location: '',
      description: '', // Raw description text
      recencyScore: this.calculateRecencyScore(index, totalCount)
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
          // Parse detailed date info
          const dateInfo = this.parseDateInfo(text);
          experience.employment = { ...experience.employment, ...dateInfo };
        }
        // Check if it's location (contains location indicators)
        else if (text.includes(',') || text.match(/Remote|On-site|Hybrid/i)) {
          experience.location = text;
        }
        // Check for employment type
        else if (text.match(/Full-time|Part-time|Contract|Freelance|Internship/i)) {
          experience.employment.type = this.detectEmploymentType(text);
        }
        // Check for company details
        else if (text.match(/employees|· .*industry/i)) {
          experience.companyDetails = this.parseCompanyDetails(text);
        }
      }
    });
    
    // Extract description - LinkedIn stores it as a single text block
    const subComponents = item.querySelector('.pvs-entity__sub-components');
    if (subComponents) {
      Logger.debug('[ExperienceExtractor] Found sub-components container');
      
      // Look for all inline-show-more-text containers within sub-components
      const textContainers = subComponents.querySelectorAll('.inline-show-more-text');
      Logger.debug(`[ExperienceExtractor] Found ${textContainers.length} text containers`);
      
      let allText = [];
      
      for (const container of textContainers) {
        // Click "see more" if present to expand the text
        const seeMoreBtn = container.querySelector('.inline-show-more-text__button');
        if (seeMoreBtn && seeMoreBtn.offsetParent !== null && !seeMoreBtn.getAttribute('aria-expanded')) {
          Logger.debug('[ExperienceExtractor] Clicking see more button in sub-component');
          seeMoreBtn.click();
          await BaseExtractor.wait(300);
        }
        
        // Extract the full text
        const textContent = BaseExtractor.extractTextContent(container);
        if (textContent && textContent.length > 10) {
          // Clean up the text and remove "see more" if it exists
          const cleanText = textContent.replace(/…see more$/, '').trim();
          allText.push(cleanText);
        }
      }
      
      // Combine all text into description
      if (allText.length > 0) {
        experience.description = allText.join(' ');
        Logger.debug('[ExperienceExtractor] Extracted description:', {
          length: experience.description.length,
          preview: experience.description.substring(0, 100) + '...'
        });
      }
    }
    
    // Fallback: Look for any text content in the item if nothing found yet
    if (!experience.description) {
      Logger.debug('[ExperienceExtractor] Using fallback text extraction');
      
      // Try to find any text that looks like a description
      const allTextElements = item.querySelectorAll('.t-14.t-normal.t-black');
      for (const element of allTextElements) {
        const text = BaseExtractor.extractTextContent(element);
        // Skip if it's a date, location, or company info
        if (text && text.length > 50 && 
            !text.match(/\d{4}/) && 
            !text.includes('·') && 
            !text.match(/Present|Full-time|Part-time/)) {
          experience.description = text;
          break;
        }
      }
    }
    
    // No analysis here - just send raw description to AI
    // AI will determine achievements, responsibilities, quality, etc.
    
    Logger.debug('[ExperienceExtractor] Extracted experience:', {
      title: experience.title,
      company: experience.company,
      hasDescription: !!experience.description,
      descriptionLength: experience.description?.length || 0
    });
    
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
      // Core data that AI needs
      title: exp.title,
      company: exp.company,
      duration: exp.duration,
      location: exp.location,
      description: exp.description || '', // Full description text
      
      // Employment details
      employment: exp.employment,
      companyDetails: exp.companyDetails,
      
      // Simple metadata
      recencyScore: exp.recencyScore,
      descriptionLength: exp.description ? exp.description.length : 0
    }));
  },
  
  /**
   * Expand all "Show more" buttons within experience descriptions
   * @param {Element} section - Experience section
   */
  async expandAllDescriptions(section) {
    const showMoreSelectors = [
      'button.inline-show-more-text__button',
      'button[aria-label*="more"][aria-label*="description"]',
      'button[data-control-name="see_more"]',
      '.see-more-inline button',
      '.inline-show-more-text__button--light'
    ];
    
    let expandedCount = 0;
    for (const selector of showMoreSelectors) {
      const buttons = section.querySelectorAll(selector);
      Logger.debug(`[ExperienceExtractor] Found ${buttons.length} show more buttons with selector: ${selector}`);
      
      for (const button of buttons) {
        if (button && button.offsetParent !== null && !button.getAttribute('aria-expanded')) {
          Logger.debug('[ExperienceExtractor] Clicking show more button:', {
            text: button.textContent,
            selector: selector
          });
          button.click();
          expandedCount++;
          await BaseExtractor.wait(300);
        }
      }
    }
    
    if (expandedCount > 0) {
      Logger.info(`[ExperienceExtractor] Expanded ${expandedCount} description(s)`);
      await BaseExtractor.wait(500); // Wait for content to load
    }
  },
  
  /**
   * Calculate average description length
   * @param {Array<Object>} experiences - Experience items
   * @returns {number} Average length
   */
  calculateAverageDescriptionLength(experiences) {
    const withDescriptions = experiences.filter(e => e.description);
    if (withDescriptions.length === 0) return 0;
    
    const totalLength = withDescriptions.reduce((sum, exp) => {
      const descLength = exp.description ? exp.description.length : 0;
      return sum + descLength;
    }, 0);
    
    return Math.round(totalLength / withDescriptions.length);
  },
  
  /**
   * Calculate recency score for position
   * @param {number} index - Position index (0 = most recent)
   * @param {number} totalCount - Total number of positions
   * @returns {number} Score from 0-1 (1 = most recent)
   */
  calculateRecencyScore(index, totalCount) {
    if (totalCount <= 1) return 1;
    // Exponential decay - recent positions weighted much higher
    return Math.pow(0.8, index);
  },
  
  /**
   * Detect employment type from text
   * @param {string} text - Text to analyze
   * @returns {string} Employment type
   */
  detectEmploymentType(text) {
    const types = {
      'full-time': /full[\s-]?time/i,
      'part-time': /part[\s-]?time/i,
      'contract': /contract|contractor/i,
      'freelance': /freelance/i,
      'internship': /intern|internship/i,
      'temporary': /temp|temporary/i,
      'volunteer': /volunteer/i
    };
    
    for (const [type, pattern] of Object.entries(types)) {
      if (pattern.test(text)) return type;
    }
    
    return 'Full-time'; // Default assumption
  },
  
  /**
   * Parse company details from LinkedIn data
   * @param {string} text - Company details text
   * @returns {Object} Parsed company details
   */
  parseCompanyDetails(text) {
    const details = {
      size: '',
      industry: '',
      type: ''
    };
    
    // Extract employee count
    const sizeMatch = text.match(/(\d[\d,\+\s-]*) employees?/i);
    if (sizeMatch) {
      details.size = sizeMatch[1].trim();
    }
    
    // Extract company type
    const typePatterns = [
      /Public Company/i,
      /Private Company/i,
      /Nonprofit/i,
      /Government Agency/i,
      /Educational Institution/i,
      /Self-Employed/i
    ];
    
    for (const pattern of typePatterns) {
      if (pattern.test(text)) {
        details.type = text.match(pattern)[0];
        break;
      }
    }
    
    // Extract industry (usually after ·)
    const industryMatch = text.match(/·\s*([^\u00b7]+)(?:\s*·|$)/);
    if (industryMatch && !industryMatch[1].match(/employees?/i)) {
      details.industry = industryMatch[1].trim();
    }
    
    return details;
  },
  
  /**
   * Parse date information from duration text
   * @param {string} text - Duration text (e.g., "Jan 2022 - Present · 2 yrs")
   * @returns {Object} Parsed date info
   */
  parseDateInfo(text) {
    const info = {
      startDate: '',
      endDate: '',
      duration: '',
      isCurrent: false,
      monthsInRole: 0
    };
    
    // Extract dates
    const datePattern = /(\w{3}\s+\d{4})\s*[-–]\s*(\w{3}\s+\d{4}|Present|present)/;
    const dateMatch = text.match(datePattern);
    
    if (dateMatch) {
      info.startDate = dateMatch[1];
      info.endDate = dateMatch[2];
      info.isCurrent = dateMatch[2].toLowerCase() === 'present';
    }
    
    // Extract duration
    const durationMatch = text.match(/(\d+\s*(?:yr|year)s?(?:\s+\d+\s*(?:mo|month)s?)?|\d+\s*(?:mo|month)s?)/);
    if (durationMatch) {
      info.duration = durationMatch[0];
      info.monthsInRole = this.parseDuration(durationMatch[0]);
    }
    
    return info;
  },
  
  /**
   * Check if a bullet point is an achievement vs responsibility
   * @param {string} text - Bullet text
   * @returns {boolean}
   */
  isAchievement(text) {
    // Achievements often have metrics, results, or action verbs indicating completion
    const achievementPatterns = [
      /\d+[%\$kKmMbB]/,  // Numbers with units
      /increased|improved|reduced|saved|generated|achieved|delivered|launched/i,
      /resulted in|leading to|drove|contributed to/i,
      /award|recognition|promoted/i
    ];
    
    return achievementPatterns.some(pattern => pattern.test(text));
  },
  
  /**
   * Extract mentioned skills from text
   * @param {string} text - Content to analyze
   * @returns {Array<string>}
   */
  extractMentionedSkills(text) {
    // Comprehensive list of technical and professional skills
    const skillPatterns = [
      // Programming languages
      /\b(Python|Java|JavaScript|TypeScript|C\+\+|C#|Ruby|Go|Swift|Kotlin|PHP|R|Scala|Rust)\b/gi,
      // Frameworks and libraries
      /\b(React|Angular|Vue|Node\.js|Django|Flask|Spring|Rails|Express|Next\.js)\b/gi,
      // Databases
      /\b(SQL|MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|DynamoDB|Cassandra)\b/gi,
      // Cloud and DevOps
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|CI\/CD|Terraform|Ansible)\b/gi,
      // Data and ML
      /\b(Machine Learning|Deep Learning|TensorFlow|PyTorch|Pandas|NumPy|Spark|Hadoop)\b/gi,
      // Professional skills
      /\b(Agile|Scrum|Project Management|Leadership|Strategy|Analytics|Communication)\b/gi
    ];
    
    const skills = new Set();
    skillPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(skill => skills.add(skill));
      }
    });
    
    return Array.from(skills);
  },
  
  /**
   * Calculate content quality score
   * @param {Object} experience - Experience object
   * @returns {number} Score 0-10
   */
  calculateContentQualityScore(experience) {
    let score = 5; // Base score
    
    // Positive factors
    if (experience.achievements.length > 0) score += 1;
    if (experience.hasQuantifiedAchievements) score += 1.5;
    if (experience.description && experience.description.length > 300) score += 1;
    if (experience.hasTechStack) score += 0.5;
    if (experience.mentionedSkills.length > 3) score += 0.5;
    if (experience.description.length > 200) score += 0.5;
    
    // Negative factors
    if (!experience.description || experience.description.length === 0) score -= 2;
    if (experience.description.length < 50) score -= 1;
    if (!experience.employment.startDate) score -= 0.5;
    
    // Cap between 0-10
    return Math.max(0, Math.min(10, score));
  }
};