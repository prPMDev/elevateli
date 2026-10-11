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
    const section = BaseExtractor.findSection(this.selectors, 'Education');
    const exists = !!section;
    
    let visibleCount = 0;
    if (exists) {
      // Count visible education items
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      visibleCount = items.length;
    }
    
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
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
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
};