/**
 * Education Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile education section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const EducationExtractor = {
  name: 'education',
  
  selectors: [
    'section#education-section',
    'section[data-section="education"]',
    'div[data-view-name="profile-card"]:has(div#education)',
    'section:has(h2:contains("Education"))',
    'section.pv-education-section',
    'div[id*="education-section"]'
  ],
  
  /**
   * Quick scan for education section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Education');
    const exists = !!section;
    
    let visibleCount = 0;
    if (exists) {
      // Count visible education items
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      visibleCount = items.length;
    }
    
    Logger.debug(`[EducationExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      visibleCount
    });
    
    return {
      exists,
      visibleCount
    };
  },
  
  /**
   * Extract education data for completeness scoring
   * @returns {Object} Basic education data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[EducationExtractor] Education section not found');
      return {
        exists: false,
        count: 0,
        schools: []
      };
    }
    
    const section = BaseExtractor.findSection(this.selectors, 'Education');
    const educationItems = await this.extractEducationItems(section);
    
    const result = {
      exists: true,
      count: educationItems.length,
      schools: educationItems.map(item => ({
        school: item.school,
        degree: item.degree,
        field: item.field
      })),
      hasUniversity: educationItems.some(item => 
        item.school.toLowerCase().includes('university') || 
        item.school.toLowerCase().includes('college')
      ),
      highestDegree: this.determineHighestDegree(educationItems)
    };
    
    Logger.info(`[EducationExtractor] Extracted ${result.count} education entries in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed education data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Education');
    const detailedEducation = await this.extractDetailedEducation(section);
    
    const result = {
      ...basicData,
      education: detailedEducation,
      
      // Analysis features
      totalYears: this.calculateTotalEducationYears(detailedEducation),
      recentEducation: detailedEducation.find(e => this.isRecent(e.endDate)),
      hasCertifications: detailedEducation.some(e => e.activities || e.honors),
      fieldsOfStudy: this.extractFieldsOfStudy(detailedEducation),
      
      // For AI processing
      educationSummary: this.summarizeEducation(detailedEducation)
    };
    
    Logger.info(`[EducationExtractor] Deep extraction completed in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Extract education items
   * @param {Element} section - Education section
   * @returns {Array<Object>} Education items
   */
  async extractEducationItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractEducationItem(element);
      if (item.school) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single education item
   * @param {Element} element - Education item element
   * @returns {Object} Education data
   */
  async extractEducationItem(element) {
    const education = {
      school: '',
      degree: '',
      field: '',
      startDate: '',
      endDate: '',
      duration: '',
      description: '',
      activities: '',
      honors: ''
    };
    
    // Extract school name
    const schoolEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    education.school = BaseExtractor.extractTextContent(schoolEl);
    
    // Extract degree and field
    const degreeEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    if (degreeEl) {
      const degreeText = BaseExtractor.extractTextContent(degreeEl);
      // Parse degree and field (e.g., "Bachelor of Science - BS, Computer Science")
      const parts = degreeText.split(',');
      if (parts.length > 0) {
        education.degree = parts[0].trim();
        if (parts.length > 1) {
          education.field = parts.slice(1).join(',').trim();
        }
      }
    }
    
    // Extract dates
    const dateEl = element.querySelector('.pvs-entity__caption-wrapper');
    const dateText = BaseExtractor.extractTextContent(dateEl);
    if (dateText) {
      const dateMatch = dateText.match(/(\d{4})\s*-\s*(\d{4}|Present)/i);
      if (dateMatch) {
        education.startDate = dateMatch[1];
        education.endDate = dateMatch[2];
      }
      education.duration = dateText;
    }
    
    // Extract description/activities
    const descEl = element.querySelector('.pvs-list__outer-container > ul li');
    if (descEl) {
      const descText = BaseExtractor.extractTextContent(descEl);
      if (descText.toLowerCase().includes('activities')) {
        education.activities = descText;
      } else {
        education.description = descText;
      }
    }
    
    return education;
  },
  
  /**
   * Extract detailed education information
   * @param {Element} section - Education section
   * @returns {Array<Object>} Detailed education data
   */
  async extractDetailedEducation(section) {
    const detailedItems = await this.extractEducationItems(section);
    
    // Enhance with additional analysis
    return detailedItems.map(item => ({
      ...item,
      degreeLevel: this.classifyDegreeLevel(item.degree),
      fieldCategory: this.categorizeField(item.field),
      isOngoing: item.endDate === 'Present',
      duration: this.calculateDuration(item.startDate, item.endDate)
    }));
  },
  
  /**
   * Determine highest degree level
   * @param {Array<Object>} educationItems - Education items
   * @returns {string} Highest degree
   */
  determineHighestDegree(educationItems) {
    const levels = {
      'phd': 5,
      'doctorate': 5,
      'master': 4,
      'mba': 4,
      'bachelor': 3,
      'associate': 2,
      'certificate': 1
    };
    
    let highest = 'none';
    let highestLevel = 0;
    
    educationItems.forEach(item => {
      const degreeLower = (item.degree || '').toLowerCase();
      
      for (const [degree, level] of Object.entries(levels)) {
        if (degreeLower.includes(degree) && level > highestLevel) {
          highest = degree;
          highestLevel = level;
        }
      }
    });
    
    return highest;
  },
  
  /**
   * Classify degree level
   * @param {string} degree - Degree text
   * @returns {string} Degree level
   */
  classifyDegreeLevel(degree) {
    const degreeLower = degree.toLowerCase();
    
    if (degreeLower.includes('phd') || degreeLower.includes('doctorate')) {
      return 'doctoral';
    } else if (degreeLower.includes('master') || degreeLower.includes('mba')) {
      return 'masters';
    } else if (degreeLower.includes('bachelor')) {
      return 'bachelors';
    } else if (degreeLower.includes('associate')) {
      return 'associates';
    } else if (degreeLower.includes('certificate') || degreeLower.includes('certification')) {
      return 'certificate';
    }
    
    return 'other';
  },
  
  /**
   * Categorize field of study
   * @param {string} field - Field text
   * @returns {string} Field category
   */
  categorizeField(field) {
    const fieldLower = field.toLowerCase();
    
    const categories = {
      'stem': /computer|engineering|mathematics|science|technology|physics|chemistry|biology/i,
      'business': /business|management|finance|marketing|economics|accounting|mba/i,
      'arts': /art|design|music|theater|literature|creative|media/i,
      'social': /psychology|sociology|anthropology|political|social|history/i,
      'medical': /medicine|medical|nursing|health|pharmacy|dentistry/i,
      'law': /law|legal|jurisprudence/i,
      'education': /education|teaching|pedagogy/i
    };
    
    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(fieldLower)) {
        return category;
      }
    }
    
    return 'other';
  },
  
  /**
   * Calculate education duration
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {number} Duration in years
   */
  calculateDuration(startDate, endDate) {
    if (!startDate) return 0;
    
    const start = parseInt(startDate);
    const end = endDate === 'Present' ? new Date().getFullYear() : parseInt(endDate);
    
    return end - start;
  },
  
  /**
   * Calculate total education years
   * @param {Array<Object>} education - Education items
   * @returns {number} Total years
   */
  calculateTotalEducationYears(education) {
    return education.reduce((total, item) => {
      return total + (item.duration || 0);
    }, 0);
  },
  
  /**
   * Check if education is recent (within 5 years)
   * @param {string} endDate - End date
   * @returns {boolean}
   */
  isRecent(endDate) {
    if (endDate === 'Present') return true;
    
    const year = parseInt(endDate);
    const currentYear = new Date().getFullYear();
    
    return (currentYear - year) <= 5;
  },
  
  /**
   * Extract unique fields of study
   * @param {Array<Object>} education - Education items
   * @returns {Array<string>} Fields
   */
  extractFieldsOfStudy(education) {
    const fields = new Set();
    
    education.forEach(item => {
      if (item.field) {
        fields.add(item.fieldCategory);
      }
    });
    
    return Array.from(fields);
  },
  
  /**
   * Summarize education for AI
   * @param {Array<Object>} education - Education items
   * @returns {string} Summary
   */
  summarizeEducation(education) {
    if (education.length === 0) return 'No education listed';
    
    const parts = [];
    
    education.forEach(item => {
      let summary = item.degree || 'Degree';
      if (item.field) summary += ` in ${item.field}`;
      summary += ` from ${item.school}`;
      if (item.endDate) summary += ` (${item.endDate})`;
      
      parts.push(summary);
    });
    
    return parts.join('; ');
  }
};