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
    const startTime = Date.now();
    
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
    
    Logger.debug(`[AboutExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      hasShowMore
    });
    
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
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[AboutExtractor] About section not found');
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
          Logger.debug(`[AboutExtractor] Found text with selector: ${selector}`);
          break;
        }
      }
    }
    
    // Strategy 2: If no text found, try getting all text content
    if (!text) {
      const container = section.querySelector('.pvs-list__outer-container, .pv-about__summary-text');
      if (container) {
        text = BaseExtractor.extractTextContent(container);
      }
    }
    
    // Strategy 3: Last resort - get all visible text
    if (!text) {
      const visibleText = section.innerText || section.textContent || '';
      // Remove common UI elements
      text = visibleText
        .replace(/About\s*$/i, '')
        .replace(/Show\s+more\s*/gi, '')
        .replace(/Show\s+less\s*/gi, '')
        .trim();
    }
    
    const result = {
      exists: true,
      charCount: text.length,
      text: text.substring(0, 500), // Limit for basic extraction
      hasShowMore: scanResult.hasShowMore,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
      paragraphs: text.split(/\n\n+/).filter(p => p.trim()).length
    };
    
    Logger.info(`[AboutExtractor] Extracted ${result.charCount} characters in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed about data with full text
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'About');
    
    // Expand "Show more" if present
    if (basicData.hasShowMore) {
      Logger.debug('[AboutExtractor] Clicking "Show more" button');
      await this.expandAboutSection(section);
    }
    
    // Re-extract after expansion
    let fullText = '';
    
    // Try all text extraction strategies again
    for (const selector of this.textSelectors) {
      const elements = section.querySelectorAll(selector);
      if (elements.length > 0) {
        fullText = Array.from(elements)
          .map(el => el.textContent?.trim())
          .filter(t => t)
          .join(' ');
        
        if (fullText.length > 0) break;
      }
    }
    
    // Fallback to container text
    if (!fullText) {
      const container = section.querySelector('.pvs-list__outer-container, .pv-about__summary-text');
      if (container) {
        fullText = BaseExtractor.extractTextContent(container);
      }
    }
    
    // Clean up the text
    fullText = this.cleanAboutText(fullText);
    
    const result = {
      ...basicData,
      text: fullText,
      charCount: fullText.length,
      wordCount: fullText.split(/\s+/).filter(w => w.length > 0).length,
      
      // Analysis features
      paragraphs: this.extractParagraphs(fullText),
      keywords: this.extractKeywords(fullText),
      hasCallToAction: this.hasCallToAction(fullText),
      hasContactInfo: this.hasContactInfo(fullText),
      sentiment: this.analyzeSentiment(fullText),
      readabilityScore: this.calculateReadability(fullText),
      
      // For AI processing
      textChunks: BaseExtractor.chunkText(fullText, 1000)
    };
    
    Logger.info(`[AboutExtractor] Deep extraction completed in ${Date.now() - startTime}ms`, {
      charCount: result.charCount,
      chunks: result.textChunks.length
    });
    
    return result;
  },
  
  /**
   * Expand the about section by clicking "Show more"
   * @param {Element} section - About section element
   */
  async expandAboutSection(section) {
    const showMoreSelectors = [
      'button[aria-label*="more about"]',
      'button[aria-label*="Show more"]',
      'button.inline-show-more-text__button',
      '[class*="inline-show-more-text"] button'
    ];
    
    for (const selector of showMoreSelectors) {
      const button = section.querySelector(selector);
      if (button && !button.disabled) {
        try {
          button.click();
          // Wait for content to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          Logger.debug('[AboutExtractor] Successfully expanded About section');
          return true;
        } catch (error) {
          Logger.warn('[AboutExtractor] Failed to click show more button', error);
        }
      }
    }
    
    return false;
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
      .replace(/\s+/g, ' ')
      .trim();
  },
  
  /**
   * Extract paragraphs from text
   * @param {string} text - About text
   * @returns {Array<string>} Paragraphs
   */
  extractParagraphs(text) {
    return text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
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
   * Check if about section has a call to action
   * @param {string} text - About text
   * @returns {boolean}
   */
  hasCallToAction(text) {
    const ctaPatterns = [
      /contact\s+me/i,
      /reach\s+out/i,
      /get\s+in\s+touch/i,
      /let's\s+connect/i,
      /feel\s+free\s+to/i,
      /don't\s+hesitate/i,
      /available\s+for/i,
      /looking\s+for/i,
      /open\s+to/i
    ];
    
    return ctaPatterns.some(pattern => pattern.test(text));
  },
  
  /**
   * Check if about section contains contact information
   * @param {string} text - About text
   * @returns {boolean}
   */
  hasContactInfo(text) {
    const contactPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
      /\bwww\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/, // Website
      /\bhttps?:\/\/[^\s]+/i // URL
    ];
    
    return contactPatterns.some(pattern => pattern.test(text));
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
  
  /**
   * Calculate readability score (simplified Flesch Reading Ease)
   * @param {string} text - About text
   * @returns {number} Readability score
   */
  calculateReadability(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length || 1;
    const words = text.split(/\s+/).filter(w => w).length || 1;
    const syllables = text.toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiou]/gi, '').length || 1;
    
    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    // Simplified Flesch Reading Ease formula
    const score = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
    
    // Normalize to 0-100
    return Math.max(0, Math.min(100, score));
  }
};