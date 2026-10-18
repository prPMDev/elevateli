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
    if (!scanResult.exists) return scanResult;

    const experiences = await this.extractDetailedExperiences();

    return {
      exists: true,
      // A company row can hold several roles (promotions), so count roles, not rows
      count: Math.max(scanResult.totalCount, experiences.length),
      // Across visible roles, empty ones included
      averageDescriptionLength: Math.round(
        experiences.reduce((sum, exp) => sum + exp.description.length, 0) / (experiences.length || 1)
      ),
      // Visible roles lacking a description; the scorer's tip names them
      emptyRoles: experiences.filter(exp => !exp.description).map(({ title, company }) => ({ title, company })),
      totalMonths: this.coveredMonths(experiences),
      hasCurrentRole: experiences.some(exp => /present/i.test(exp.duration)),
      visibleCount: scanResult.visibleCount,
      hasMoreItems: scanResult.hasMore // Older roles hidden behind "Show all": count and months are a lower bound
    };
  },

  /**
   * Deep extraction for AI analysis: the roles and their average tenure (analyzer-base reads only these)
   * @returns {Object} { experiences, averageTenure }
   */
  async extractDeep() {
    // Descriptions are in the DOM in full; "… more" only unclamps them
    const experiences = await this.extractDetailedExperiences();
    return { experiences, averageTenure: this.calculateAverageTenure(experiences) };
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
      .map(role => this.extractExperienceItem(role.element, role.company))
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
  extractExperienceItem(item, groupCompany = null) {
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
      employment: {
        type: /Full-time|Part-time|Contract|Freelance|Internship/i.test(companyLine) ? this.detectEmploymentType(companyLine) : '',
        ...dateInfo
      },
      // Prompts and years-of-experience read the dates at the top level
      startDate: dateInfo.startDate,
      endDate: dateInfo.endDate,
      duration,
      location: next && !description.startsWith(next) && !/skills?$/.test(next) ? next : '',
      description // Raw description text; AI judges achievements and quality
    };
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
  }
};
