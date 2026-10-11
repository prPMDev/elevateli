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
    
    // Timing logged;
    
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
    
    // Timing logged;
    return result;
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
};