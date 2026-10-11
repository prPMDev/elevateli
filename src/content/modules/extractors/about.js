/**
 * About Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile About section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const AboutExtractor = {
  name: 'about',
  
  // Multiple selectors to handle LinkedIn's changing DOM
  selectors: [
    'section[data-section="summary"]',
    'section:has(div#about)',
    'section:has(h2:contains("About"))',
    'div[data-view-name="profile-card"]:has(div#about)',
    'section.pv-about-section',
    'section.pv-profile-section:has(.pv-about__summary-text)'
  ],
  
  // Selectors for the actual text content
  textSelectors: [
    '[class*="inline-show-more-text"] span[aria-hidden="true"]',
    '.pv-about__summary-text span[aria-hidden="true"]',
    '.pv-shared-text-with-see-more span[aria-hidden="true"]',
    '[class*="full-width"] span[aria-hidden="true"]',
    '.pvs-list__outer-container span[aria-hidden="true"]'
  ],
  
  /**
   * Quick scan for about section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection(this.selectors, 'About');
    const exists = !!section;
    
    let hasShowMore = false;
    if (exists) {
      // Check for "Show more" button
      const showMoreSelectors = [
        'button[aria-label*="more about"]',
        'button[aria-label*="Show more"]',
        'a[aria-label*="see more"]',
        'button.inline-show-more-text__button',
        '[class*="inline-show-more-text"] button'
      ];
      
      hasShowMore = showMoreSelectors.some(selector => 
        section.querySelector(selector) !== null
      );
    }
    
    return {
      exists,
      hasShowMore,
      selector: section ? this.selectors.find(s => document.querySelector(s)) : null
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
    
    const section = BaseExtractor.findSection(this.selectors, 'About');
    
    // Try to extract text using multiple strategies
    let text = '';
    
    // Strategy 1: Try each text selector
    for (const selector of this.textSelectors) {
      const elements = section.querySelectorAll(selector);
      if (elements.length > 0) {
        text = Array.from(elements)
          .map(el => el.textContent?.trim())
          .filter(t => t)
          .join(' ');
        
        if (text.length > 0) {
          // Clean the text to remove UI elements
          text = this.cleanAboutText(text);
          if (text.length > 0) {
            break;
          }
        }
      }
    }
    
    // Strategy 2: If no text found, try getting all text content
    if (!text) {
      const container = section.querySelector('.pvs-list__outer-container, .pv-about__summary-text');
      if (container) {
        text = BaseExtractor.extractTextContent(container);
        // Clean the extracted text
        text = this.cleanAboutText(text);
      }
    }
    
    // Strategy 3: Last resort - get all visible text
    if (!text) {
      const visibleText = section.innerText || section.textContent || '';
      // Use cleanAboutText to remove all UI elements including "Top skills"
      text = this.cleanAboutText(visibleText);
    }
    
    // Check if the cleaned text is essentially empty (just "About" or whitespace)
    const isEffectivelyEmpty = text.length <= 5 || text.toLowerCase() === 'about' || text.trim() === '';
    
    const result = {
      exists: true,
      charCount: isEffectivelyEmpty ? 0 : text.length,
      text: isEffectivelyEmpty ? '' : text.substring(0, 500), // Limit for basic extraction
      hasShowMore: scanResult.hasShowMore,
      wordCount: isEffectivelyEmpty ? 0 : text.split(/\s+/).filter(w => w.length > 0).length,
      paragraphs: isEffectivelyEmpty ? 0 : text.split(/\n\n+/).filter(p => p.trim()).length
    };
    
    return result;
  },
  
  /**
   * Clean about text by removing UI elements
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  cleanAboutText(text) {
    return text
      .replace(/^About\s*/i, '')
      .replace(/Show\s+more\s*/gi, '')
      .replace(/Show\s+less\s*/gi, '')
      .replace(/Top\s+skills[\s\S]*/i, '') // Remove everything from "Top skills" onward
      .replace(/\s+/g, ' ')
      .trim();
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