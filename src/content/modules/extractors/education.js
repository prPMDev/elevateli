/**
 * Education Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile education section
 */

const EducationExtractor = {
  /**
   * Quick scan for education section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('Education');
    
    return {
      exists: !!section,
      visibleCount: BaseExtractor.items(section).length
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
    
    const educationItems = BaseExtractor.items(BaseExtractor.findSection('Education'))
      .map(element => this.extractEducationItem(element))
      .filter(item => item.school);
    
    const result = {
      exists: true,
      count: educationItems.length,
      schools: educationItems,
      hasUniversity: educationItems.some(item => 
        item.school.toLowerCase().includes('university') || 
        item.school.toLowerCase().includes('college')
      ),
      highestDegree: this.determineHighestDegree(educationItems)
    };
    
    return result;
  },
  
  /**
   * Extract single education item
   * Fields: school, "Degree, Field of study", dates, grade, activities, description, skills
   * @param {Element} element - Education item element
   * @returns {Object} Education data
   */
  extractEducationItem(element) {
    const [school = '', degreeLine = ''] = BaseExtractor.fields(element);
    // A row without a degree has its dates second
    const [degree = '', ...field] = /\d{4}/.test(degreeLine) ? [] : degreeLine.split(',');
    
    return {
      school,
      degree: degree.trim(),
      field: field.join(',').trim()
    };
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