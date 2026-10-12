/**
 * About Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile About section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const AboutExtractor = {
  name: 'about',

  /**
   * Quick scan for about section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('About');

    return {
      exists: !!section,
      hasShowMore: !!section?.querySelector('[data-testid="expandable-text-box"] button')
    };
  },
  
  /**
   * Extract about text for completeness scoring
   * @returns {Object} Basic about data with character count
   */
  async extract() {
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        charCount: 0,
        text: '',
        hasShowMore: false
      };
    }
    
    const section = BaseExtractor.findSection('About');
    const text = BaseExtractor.longText(section);

    // Check if the text is essentially empty
    const isEffectivelyEmpty = text.length <= 5;

    const result = {
      exists: true,
      charCount: isEffectivelyEmpty ? 0 : text.length,
      text: isEffectivelyEmpty ? '' : text, // Full text: the AI reads it as the whole About
      hasShowMore: scanResult.hasShowMore,
      wordCount: isEffectivelyEmpty ? 0 : text.split(/\s+/).filter(w => w.length > 0).length,
      paragraphs: isEffectivelyEmpty ? 0 : text.split(/\n\n+/).filter(p => p.trim()).length
    };
    
    return result;
  },
  
  /**
   * Extract keywords from about text
   * @param {string} text - About text
   * @returns {Array<string>} Keywords
   */
  extractKeywords(text) {
    const commonWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 
      'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 
      'do', 'at', 'this', 'but', 'his', 'by', 'from'
    ]);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word));
    
    // Count frequency
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Return top keywords
    return Object.entries(frequency)
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  },
  
  /**
   * Simple sentiment analysis
   * @param {string} text - About text
   * @returns {string} Sentiment (positive/neutral/negative)
   */
  analyzeSentiment(text) {
    const positive = [
      'passionate', 'excited', 'love', 'enjoy', 'enthusiastic',
      'dedicated', 'driven', 'motivated', 'inspire', 'achieve'
    ];
    
    const negative = [
      'frustrated', 'disappointed', 'difficult', 'challenge',
      'struggle', 'problem', 'issue', 'concern'
    ];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    positive.forEach(word => {
      if (lowerText.includes(word)) score++;
    });
    
    negative.forEach(word => {
      if (lowerText.includes(word)) score--;
    });
    
    return score > 1 ? 'positive' : score < -1 ? 'negative' : 'neutral';
  },
};