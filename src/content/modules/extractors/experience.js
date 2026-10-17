/**
 * Experience Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile experience section
 */

const ExperienceExtractor = {
  /**
   * Quick scan for experience section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('Experience');
    const visibleCount = this.rows(section).length;
    // "Show all" carries no number on the new profile page, so the total is the visible rows,
    // but the link itself says older roles are hidden
    const totalCount = section ? BaseExtractor.count(section, visibleCount) : 0;
    const showAll = Array.from(section?.querySelectorAll('a') || []).some(a => /^Show all\b/.test(a.textContent.trim()));

    return {
      exists: visibleCount > 0,
      visibleCount,
      totalCount,
      hasMore: showAll || totalCount > visibleCount
    };
  },
  
  /**
   * Extract experience data for completeness scoring
   * @returns {Object} Basic experience data with total count
   */
  async extract() {
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        charCount: 0, // Added for completeness scoring
        averageDescriptionLength: 0, // Added for completeness scoring
        totalMonths: 0,
        hasCurrentRole: false
      };
    }
    
    // Use totalCount from scan
    const totalCount = scanResult.totalCount || scanResult.visibleCount;

    // Calculate total months and check for current role
    const basicInfo = await this.extractBasicInfo();
    // A company row can hold several roles (promotions), so count roles, not rows
    const count = Math.max(totalCount, basicInfo.roleCount);

    // Calculate character count for completeness scoring
    // More experience entries = more content depth
    // Average description length is ~200 chars per role
    const charCount = count * 200;

    const result = {
      exists: true,
      count,
      charCount: charCount, // Added for completeness scoring
      averageDescriptionLength: basicInfo.averageDescriptionLength, // Across visible roles, empty ones included
      emptyRoles: basicInfo.emptyRoles, // Company (or title) of each visible role without a description
      totalMonths: basicInfo.totalMonths,
      hasCurrentRole: basicInfo.hasCurrentRole,
      visibleCount: scanResult.visibleCount,
      hasMoreItems: scanResult.hasMore // Older roles hidden behind "Show all": count and months are a lower bound
    };
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed experience data
   */
  async extractDeep() {
    const basicData = await this.extract();
    
    if (!basicData.exists) {
      return basicData;
    }
    
    // Descriptions are in the DOM in full; "… more" only unclamps them
    const experiences = await this.extractDetailedExperiences();
    
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
    
    return result;
  },
  
  
  /**
   * Extract basic info like total months and current role
   * @returns {Object} Basic info
   */
  async extractBasicInfo() {
    const experiences = await this.extractDetailedExperiences();
    
    return {
      roleCount: experiences.length,
      totalMonths: this.coveredMonths(experiences),
      hasCurrentRole: experiences.some(exp => /present/i.test(exp.duration)),
      averageDescriptionLength: Math.round(
        experiences.reduce((sum, exp) => sum + exp.description.length, 0) / (experiences.length || 1)
      ),
      emptyRoles: experiences.filter(exp => !exp.description).map(exp => exp.company || exp.title)
    };
  },
  
  /**
   * Months covered by the roles, with overlapping roles merged so a side job isn't counted twice
   * @param {Array<Object>} experiences - Experience items
   * @returns {number} Months
   */
  coveredMonths(experiences) {
    const now = new Date();
    const toMonth = (date, isEnd) => {
      if (/present/i.test(date)) return now.getFullYear() * 12 + now.getMonth();
      const parsed = new Date(/^\d{4}$/.test(date) ? `${isEnd ? 'Dec' : 'Jan'} ${date}` : date);
      return isNaN(parsed) ? null : parsed.getFullYear() * 12 + parsed.getMonth();
    };
    const ranges = experiences
      .map(exp => [toMonth(exp.startDate), toMonth(exp.endDate, true)])
      .filter(([start, end]) => start !== null && end !== null)
      .sort((a, b) => a[0] - b[0]);
    
    let total = 0;
    let current = null;
    for (const [start, end] of ranges) {
      if (current && start <= current[1] + 1) {
        current[1] = Math.max(current[1], end);
      } else {
        if (current) total += current[1] - current[0] + 1;
        current = [start, end];
      }
    }
    return current ? total + current[1] - current[0] + 1 : 0;
  },
  
  /**
   * Extract detailed experience items
   * @returns {Array<Object>} Detailed experiences
   */
  async extractDetailedExperiences() {
    const roles = [];

    for (const item of this.rows(BaseExtractor.findSection('Experience'))) {
      // Several roles at one employer: a company row with one <li> per role
      const grouped = Array.from(item.querySelectorAll('li'))
        .filter(li => BaseExtractor.fields(li).some(field => this.isDateLine(field)));
      if (grouped.length === 0) {
        roles.push({ element: item, company: null });
      } else {
        const company = BaseExtractor.fields(item)[0] || '';
        grouped.forEach(li => roles.push({ element: li, company }));
      }
    }
    
    return roles
      .map((role, i) => this.extractExperienceItem(role.element, i, roles.length, role.company))
      .filter(experience => experience.title);
  },
  
  /**
   * Experience rows without LinkedIn "Career break" entries, which are not jobs
   * ponytail: English label only, same limit as the English-only headings
   */
  rows(section) {
    return BaseExtractor.items(section).filter(item => BaseExtractor.fields(item)[1] !== 'Career break');
  },

  /**
   * Dates line of a role: "Jan 2022 - Present · 2 yrs", "2011 – Present"
   */
  isDateLine(field) {
    return /\b\d{4}\s*[-–]\s*(?:\w{3}\s+)?(?:\d{4}|Present)\b/i.test(field) || /·\s*\d+\s*(yr|mo)s?\b/.test(field);
  },
  
  /**
   * Extract single experience item
   * @param {Element} item - Experience row, or one role <li> inside a company group
   * @param {string|null} groupCompany - Company of the group the role sits in
   * @returns {Object} Experience data
   */
  extractExperienceItem(item, index = 0, totalCount = 1, groupCompany = null) {
    // Fields in order: title, "Company · Full-time" (not inside a company group), "Jan 2022 - Present · 2 yrs",
    // "City · Remote", description, skills
    const fields = BaseExtractor.fields(item);
    const title = fields[0] || '';
    const companyLine = groupCompany === null ? fields[1] || '' : '';
    const durationIndex = fields.findIndex((field, i) => i > 0 && this.isDateLine(field));
    const duration = durationIndex > 0 ? fields[durationIndex] : '';
    const description = BaseExtractor.longText(item);
    const next = durationIndex > 0 ? fields[durationIndex + 1] || '' : '';
    const dateInfo = this.parseDateInfo(duration);
    
    return {
      title,
      company: groupCompany ?? companyLine.split('·')[0].trim(),
      companyDetails: { size: '', industry: '', type: '' },
      employment: {
        type: /Full-time|Part-time|Contract|Freelance|Internship/i.test(companyLine) ? this.detectEmploymentType(companyLine) : '',
        ...dateInfo
      },
      // Prompts and years-of-experience read the dates at the top level
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      duration,
      location: next && !description.startsWith(next) && !/skills?$/.test(next) ? next : '',
      description, // Raw description text; AI judges achievements and quality
      hasQuantifiedAchievements: this.hasQuantifiedAchievements(description),
      hasTechStack: this.hasTechStack(description),
      recencyScore: this.calculateRecencyScore(index, totalCount)
    };
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
    const datePattern = /((?:\w{3}\s+)?\d{4})\s*[-–]\s*((?:\w{3}\s+)?\d{4}|Present|present)/;
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
  }
};