/**
 * Headline Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile headline
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const HeadlineExtractor = {
  name: 'headline',
  
  /**
   * Quick scan for headline existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const selectors = [
      // New selector based on actual LinkedIn HTML
      '.text-body-medium[data-generated-suggestion-target]',
      // Keep old selector as fallback
      '.pv-text-details__left-panel .text-body-medium',
      // Additional fallback for profile header
      'section[data-member-id] .text-body-medium'
    ];
    
    let element = null;
    let usedSelector = null;
    
    for (const selector of selectors) {
      element = document.querySelector(selector);
      if (element) {
        usedSelector = selector;
        break;
      }
    }
    
    const exists = !!element;
    
    BaseExtractor.logTiming('Headline scan', startTime);
    Logger.debug(`[HeadlineExtractor] Scan result: exists=${exists}, selector=${usedSelector}`);
    
    return {
      exists,
      selector: usedSelector,
      element
    };
  },
  
  /**
   * Extract headline for completeness scoring
   * @returns {Object} Basic headline data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        charCount: 0,
        text: ''
      };
    }
    
    const element = scanResult.element || document.querySelector(scanResult.selector);
    const text = BaseExtractor.extractTextContent(element);
    
    const result = {
      exists: true,
      charCount: text.length,
      text: text,
      // Quick quality checks for completeness
      hasKeywords: this.checkKeywords(text),
      isGeneric: this.checkIfGeneric(text),
      hasPipe: text.includes('|'),
      hasAt: text.includes('@')
    };
    
    BaseExtractor.logTiming('Headline extract', startTime);
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed headline data
   */
  async extractDeep() {
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    // Add deep analysis data
    return {
      ...basicData,
      // Linguistic analysis
      wordCount: basicData.text.split(/\s+/).length,
      keywords: this.extractKeywords(basicData.text),
      sentiment: this.analyzeSentiment(basicData.text),
      
      // Structure analysis  
      parts: this.parseHeadlineParts(basicData.text),
      hasTitle: this.containsJobTitle(basicData.text),
      hasCompany: this.containsCompany(basicData.text),
      hasValue: this.containsValueProp(basicData.text),
      
      // Optimization suggestions
      optimizationPotential: this.calculateOptimizationPotential(basicData)
    };
  },
  
  /**
   * Check for important keywords
   * @param {string} text - Headline text
   * @returns {boolean}
   */
  checkKeywords(text) {
    const keywords = [
      'senior', 'lead', 'principal', 'director', 'manager',
      'engineer', 'developer', 'designer', 'analyst', 'consultant',
      'expert', 'specialist', 'architect', 'strategist'
    ];
    
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword));
  },
  
  /**
   * Check if headline is too generic
   * @param {string} text - Headline text
   * @returns {boolean}
   */
  checkIfGeneric(text) {
    const genericPhrases = [
      'looking for opportunities',
      'seeking new role',
      'open to work',
      'unemployed',
      'student at'
    ];
    
    const lowerText = text.toLowerCase();
    return genericPhrases.some(phrase => lowerText.includes(phrase));
  },
  
  /**
   * Extract keywords for analysis
   * @param {string} text - Headline text
   * @returns {Array<string>}
   */
  extractKeywords(text) {
    // Remove common words and extract meaningful terms
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'at', 'to', 'for'];
    const words = text.toLowerCase().split(/\W+/);
    
    return words
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .filter((word, index, self) => self.indexOf(word) === index);
  },
  
  /**
   * Simple sentiment analysis
   * @param {string} text - Headline text
   * @returns {string}
   */
  analyzeSentiment(text) {
    const positive = ['passionate', 'expert', 'leader', 'innovative', 'experienced'];
    const negative = ['seeking', 'looking', 'unemployed', 'former'];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    positive.forEach(word => {
      if (lowerText.includes(word)) score++;
    });
    
    negative.forEach(word => {
      if (lowerText.includes(word)) score--;
    });
    
    return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  },
  
  /**
   * Parse headline into logical parts
   * @param {string} text - Headline text
   * @returns {Object}
   */
  parseHeadlineParts(text) {
    const parts = {
      title: '',
      company: '',
      value: '',
      other: []
    };
    
    // Split by common separators
    const segments = text.split(/[|,@•]/);
    
    segments.forEach(segment => {
      const trimmed = segment.trim();
      if (this.containsJobTitle(trimmed)) {
        parts.title = trimmed;
      } else if (this.containsCompany(trimmed)) {
        parts.company = trimmed;
      } else if (this.containsValueProp(trimmed)) {
        parts.value = trimmed;
      } else if (trimmed) {
        parts.other.push(trimmed);
      }
    });
    
    return parts;
  },
  
  /**
   * Check if text contains job title
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  containsJobTitle(text) {
    const titleKeywords = [
      'manager', 'director', 'engineer', 'developer',
      'designer', 'analyst', 'consultant', 'specialist',
      'lead', 'head', 'vp', 'president', 'chief'
    ];
    
    const lowerText = text.toLowerCase();
    return titleKeywords.some(keyword => lowerText.includes(keyword));
  },
  
  /**
   * Check if text contains company reference
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  containsCompany(text) {
    return text.includes('@') || 
           text.toLowerCase().includes(' at ') ||
           /\b(Inc|LLC|Ltd|Corp|Company)\b/i.test(text);
  },
  
  /**
   * Check if text contains value proposition
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  containsValueProp(text) {
    const valueKeywords = [
      'helping', 'building', 'creating', 'driving',
      'transforming', 'leading', 'delivering', 'solving'
    ];
    
    const lowerText = text.toLowerCase();
    return valueKeywords.some(keyword => lowerText.includes(keyword));
  },
  
  /**
   * Calculate optimization potential
   * @param {Object} data - Headline data
   * @returns {number} Score 0-100
   */
  calculateOptimizationPotential(data) {
    let score = 100;
    
    // Deduct points for issues
    if (data.charCount < 30) score -= 20;
    if (data.charCount > 220) score -= 10;
    if (!data.hasKeywords) score -= 15;
    if (data.isGeneric) score -= 25;
    if (!data.hasPipe && !data.hasAt) score -= 10;
    if (data.wordCount < 3) score -= 20;
    
    return Math.max(0, score);
  }
};