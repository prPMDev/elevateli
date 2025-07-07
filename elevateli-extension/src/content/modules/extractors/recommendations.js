/**
 * Recommendations Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile recommendations section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const RecommendationsExtractor = {
  name: 'recommendations',
  
  selectors: [
    'section[data-section="recommendations"]',
    'section.pv-recommendations-section',
    'section#recommendations-section',
    '#recommendations',
    'div[id="recommendations"]',
    // New pattern: anchor + sibling
    '#recommendations.pv-profile-card__anchor + div',
    '#recommendations ~ div'
  ],
  
  /**
   * Quick scan for recommendations section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    Logger.info('[RecommendationsExtractor] Starting scan v2 - CUSTOM SECTION FINDER');
    
    // Custom section finding for recommendations - look for anchor and get the right sibling
    const anchor = document.querySelector('div#recommendations.pv-profile-card__anchor');
    let section = null;
    
    if (anchor) {
      Logger.info('[RecommendationsExtractor] Found recommendations anchor, checking siblings');
      let sibling = anchor.nextElementSibling;
      let siblingIndex = 0;
      
      while (sibling && siblingIndex < 5) {
        // Look for recommendations content indicators
        const showAllLink = sibling.querySelector('a[href*="/details/recommendations"]');
        const hasRecommendationTabs = sibling.querySelector('[aria-label*="received"], [aria-label*="given"]');
        const hasRecommendationItems = sibling.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item, li').length > 0;
        const textContent = sibling.textContent || '';
        const hasRecommendationText = textContent.includes('recommendation') || textContent.includes('Received');
        
        Logger.info(`[RecommendationsExtractor] Sibling ${siblingIndex}: showAll: ${!!showAllLink}, tabs: ${!!hasRecommendationTabs}, items: ${hasRecommendationItems}, hasText: ${hasRecommendationText}`);
        
        // We want the sibling with actual recommendation content
        if ((showAllLink || hasRecommendationTabs || hasRecommendationItems) && hasRecommendationText) {
          section = sibling;
          Logger.info(`[RecommendationsExtractor] Found recommendations section at sibling ${siblingIndex}`);
          break;
        }
        
        sibling = sibling.nextElementSibling;
        siblingIndex++;
      }
    }
    
    // Fallback to BaseExtractor if custom method fails
    if (!section) {
      Logger.info('[RecommendationsExtractor] Custom section finder failed, using BaseExtractor');
      section = BaseExtractor.findSection(this.selectors, 'Recommendations');
    }
    
    const exists = !!section;
    
    if (section) {
      Logger.info(`[RecommendationsExtractor] Section found: ${exists}, tagName: ${section.tagName}, id: ${section.id || 'none'}, classes: ${section.className}`);
    } else {
      Logger.info('[RecommendationsExtractor] No section found');
    }
    
    let receivedCount = 0;
    let givenCount = 0;
    
    if (exists) {
      // Look for tabs or separate sections
      const buttons = section.querySelectorAll('button');
      const receivedTab = section.querySelector('[aria-label*="received"]') || 
                         Array.from(buttons).find(btn => 
                           btn.textContent && btn.textContent.includes('Received'));
      const givenTab = section.querySelector('[aria-label*="given"]') || 
                       Array.from(buttons).find(btn => 
                         btn.textContent && btn.textContent.includes('Given'));
      
      // Count visible recommendations with multiple selectors
      let recommendationItems = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      
      // Try additional selectors if none found
      if (recommendationItems.length === 0) {
        Logger.debug('[RecommendationsExtractor] No items with standard selectors, trying alternatives');
        recommendationItems = section.querySelectorAll('li[class*="pvs"], div[class*="entity"], li');
      }
      
      // Try to distinguish between received and given
      if (receivedTab && receivedTab.getAttribute('aria-selected') === 'true') {
        receivedCount = recommendationItems.length;
      } else if (givenTab && givenTab.getAttribute('aria-selected') === 'true') {
        givenCount = recommendationItems.length;
      } else {
        // Default to received if no tabs
        receivedCount = recommendationItems.length;
      }
      
      // First try to find recommendations count from show all link
      const showAllLink = section.querySelector('a[href*="/details/recommendations"]');
      if (showAllLink) {
        const linkText = showAllLink.textContent || '';
        Logger.info(`[RecommendationsExtractor] Found show all link with text: "${linkText}"`);
        
        // Try multiple patterns for extracting count
        const patterns = [
          /Show\s+all\s+(\d+)\s+recommendations?/i,
          /(\d+)\s+recommendations?/i,
          /All\s+(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = linkText.match(pattern);
          if (match) {
            receivedCount = parseInt(match[1]);
            Logger.info(`[RecommendationsExtractor] Found count from show all link: ${receivedCount}`);
            break;
          }
        }
      }
      
      // Fallback to extractShowAllInfo
      if (receivedCount === 0) {
        const showAllInfo = BaseExtractor.extractShowAllInfo(section, 'recommendations');
        if (showAllInfo.totalCount > 0) {
          Logger.info(`[RecommendationsExtractor] Found total count from show all: ${showAllInfo.totalCount}`);
          receivedCount = showAllInfo.totalCount;
        }
      }
      
      // Last resort: Text pattern matching on page
      if (receivedCount === 0) {
        // First try section text
        const sectionText = section.innerText || '';
        Logger.info(`[RecommendationsExtractor] Searching section text (${sectionText.length} chars)`);
        
        const patterns = [
          /(\d+)\s*recommendations?\s*received/i,
          /Received\s*\((\d+)\)/i,
          /(\d+)\s*people\s*have\s*recommended/i
        ];
        
        for (const pattern of patterns) {
          const match = sectionText.match(pattern);
          if (match) {
            receivedCount = parseInt(match[1]);
            Logger.info(`[RecommendationsExtractor] Found count from section text pattern: ${receivedCount}`);
            break;
          }
        }
        
        // If still 0, try page text
        if (receivedCount === 0) {
          const pageText = document.body.innerText || '';
          for (const pattern of patterns) {
            const match = pageText.match(pattern);
            if (match) {
              receivedCount = parseInt(match[1]);
              Logger.info(`[RecommendationsExtractor] Found count from page text pattern: ${receivedCount}`);
              break;
            }
          }
        }
      }
    }
    
    Logger.info(`[RecommendationsExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      receivedCount,
      givenCount
    });
    
    return {
      exists,
      receivedCount,
      givenCount,
      hasRecommendations: receivedCount > 0 || givenCount > 0
    };
  },
  
  /**
   * Extract recommendations data for completeness scoring
   * @returns {Object} Basic recommendations data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[RecommendationsExtractor] Recommendations section not found');
      return {
        exists: false,
        count: 0,
        receivedCount: 0,
        givenCount: 0
      };
    }
    
    // Use same custom section finder as scan
    const anchor = document.querySelector('div#recommendations.pv-profile-card__anchor');
    let section = null;
    
    if (anchor) {
      let sibling = anchor.nextElementSibling;
      let siblingIndex = 0;
      
      while (sibling && siblingIndex < 5) {
        const showAllLink = sibling.querySelector('a[href*="/details/recommendations"]');
        const hasRecommendationContent = sibling.textContent && sibling.textContent.includes('recommendation');
        
        if ((showAllLink || hasRecommendationContent) && sibling.querySelectorAll('li, .pvs-list__paged-list-item').length > 0) {
          section = sibling;
          break;
        }
        
        sibling = sibling.nextElementSibling;
        siblingIndex++;
      }
    }
    
    if (!section) {
      section = BaseExtractor.findSection(this.selectors, 'Recommendations');
    }
    
    // Try to get both received and given counts
    const counts = await this.extractRecommendationCounts(section);
    
    const result = {
      exists: true,
      count: counts.received + counts.given,
      receivedCount: counts.received,
      givenCount: counts.given,
      hasRecommendations: counts.received > 0,
      isActive: counts.given > 0, // Shows if user gives recommendations
      ratio: counts.received > 0 ? (counts.given / counts.received).toFixed(2) : 0
    };
    
    Logger.info(`[RecommendationsExtractor] Extracted ${result.count} recommendations (${result.receivedCount} received, ${result.givenCount} given) in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed recommendations data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    // Use same custom section finder
    const anchor = document.querySelector('div#recommendations.pv-profile-card__anchor');
    let section = null;
    
    if (anchor) {
      let sibling = anchor.nextElementSibling;
      let siblingIndex = 0;
      
      while (sibling && siblingIndex < 5) {
        const showAllLink = sibling.querySelector('a[href*="/details/recommendations"]');
        const hasRecommendationContent = sibling.textContent && sibling.textContent.includes('recommendation');
        
        if ((showAllLink || hasRecommendationContent) && sibling.querySelectorAll('li, .pvs-list__paged-list-item').length > 0) {
          section = sibling;
          break;
        }
        
        sibling = sibling.nextElementSibling;
        siblingIndex++;
      }
    }
    
    if (!section) {
      section = BaseExtractor.findSection(this.selectors, 'Recommendations');
    }
    
    // Extract detailed recommendations
    const received = await this.extractReceivedRecommendations(section);
    const given = await this.extractGivenRecommendations(section);
    
    const result = {
      ...basicData,
      received: received,
      given: given,
      
      // Analysis features
      recommenderRoles: this.extractRecommenderRoles(received),
      recommendationKeywords: this.extractKeywords(received),
      sentimentAnalysis: this.analyzeSentiments(received),
      relationshipTypes: this.categorizeRelationships(received),
      skillsMentioned: this.extractMentionedSkills(received),
      averageLength: this.calculateAverageLength(received),
      
      // Time analysis
      mostRecentDate: this.getMostRecentDate(received),
      isCurrentlyEndorsed: this.hasRecentRecommendations(received),
      
      // For AI processing
      recommendationChunks: this.prepareForAI(received)
    };
    
    Logger.info(`[RecommendationsExtractor] Deep extraction completed in ${Date.now() - startTime}ms`, {
      receivedDetails: received.length,
      givenDetails: given.length
    });
    
    return result;
  },
  
  /**
   * Extract recommendation counts
   * @param {Element} section - Recommendations section
   * @returns {Object} Counts
   */
  async extractRecommendationCounts(section) {
    const counts = { received: 0, given: 0 };
    
    // First try text pattern matching on the section
    const sectionText = section.innerText || '';
    const patterns = [
      /(\d+)\s*recommendations?\s*received/i,
      /Received\s*\((\d+)\)/i,
      /(\d+)\s*people\s*have\s*recommended/i
    ];
    
    for (const pattern of patterns) {
      const match = sectionText.match(pattern);
      if (match) {
        counts.received = parseInt(match[1]);
        Logger.info(`[RecommendationsExtractor] Found received count from text: ${counts.received}`);
        break;
      }
    }
    
    // Check for tab buttons with counts
    const tabSelectors = [
      'button[role="tab"]',
      '.artdeco-tabpanel button',
      '[aria-label*="received"]',
      '[aria-label*="given"]'
    ];
    
    for (const selector of tabSelectors) {
      const tabs = section.querySelectorAll(selector);
      tabs.forEach(tab => {
        const text = tab.textContent || tab.getAttribute('aria-label') || '';
        
        const receivedMatch = text.match(/received[^\d]*(\d+)/i);
        if (receivedMatch) {
          counts.received = parseInt(receivedMatch[1]);
        }
        
        const givenMatch = text.match(/given[^\d]*(\d+)/i);
        if (givenMatch) {
          counts.given = parseInt(givenMatch[1]);
        }
      });
    }
    
    // If no tabs found, count visible items as received
    if (counts.received === 0 && counts.given === 0) {
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      counts.received = items.length;
      
      // Also check extractShowAllInfo for total count
      const showAllInfo = BaseExtractor.extractShowAllInfo(section, 'recommendations');
      if (showAllInfo.totalCount > 0) {
        counts.received = Math.max(counts.received, showAllInfo.totalCount);
      }
    }
    
    return counts;
  },
  
  /**
   * Extract received recommendations
   * @param {Element} section - Recommendations section
   * @returns {Array<Object>} Received recommendations
   */
  async extractReceivedRecommendations(section) {
    const recommendations = [];
    
    // Click on received tab if exists
    const buttons = section.querySelectorAll('button');
    const receivedTab = section.querySelector('[aria-label*="received"]') || 
                       Array.from(buttons).find(btn => 
                         btn.textContent && btn.textContent.includes('Received'));
    if (receivedTab && receivedTab.getAttribute('aria-selected') !== 'true') {
      try {
        receivedTab.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        Logger.warn('[RecommendationsExtractor] Failed to click received tab', error);
      }
    }
    
    // Extract recommendation items
    const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const item of items) {
      const recommendation = await this.extractRecommendationItem(item);
      if (recommendation.recommenderName) {
        recommendations.push(recommendation);
      }
    }
    
    return recommendations;
  },
  
  /**
   * Extract given recommendations
   * @param {Element} section - Recommendations section
   * @returns {Array<Object>} Given recommendations
   */
  async extractGivenRecommendations(section) {
    const recommendations = [];
    
    // Click on given tab if exists
    const buttons = section.querySelectorAll('button');
    const givenTab = section.querySelector('[aria-label*="given"]') || 
                     Array.from(buttons).find(btn => 
                       btn.textContent && btn.textContent.includes('Given'));
    if (givenTab) {
      try {
        givenTab.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Extract items after tab switch
        const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
        
        for (const item of items) {
          const recommendation = await this.extractRecommendationItem(item);
          if (recommendation.recommenderName) {
            recommendations.push(recommendation);
          }
        }
      } catch (error) {
        Logger.warn('[RecommendationsExtractor] Failed to extract given recommendations', error);
      }
    }
    
    return recommendations;
  },
  
  /**
   * Extract single recommendation item
   * @param {Element} element - Recommendation element
   * @returns {Object} Recommendation data
   */
  async extractRecommendationItem(element) {
    const recommendation = {
      recommenderName: '',
      recommenderTitle: '',
      relationship: '',
      text: '',
      date: ''
    };
    
    // Extract recommender name
    const nameEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    recommendation.recommenderName = BaseExtractor.extractTextContent(nameEl);
    
    // Extract recommender title and relationship
    const subtitleEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    if (subtitleEl) {
      const subtitleText = BaseExtractor.extractTextContent(subtitleEl);
      // Parse "Title, Relationship, Date"
      const parts = subtitleText.split(',').map(p => p.trim());
      if (parts.length > 0) recommendation.recommenderTitle = parts[0];
      if (parts.length > 1) recommendation.relationship = parts[1];
      if (parts.length > 2) recommendation.date = parts[2];
    }
    
    // Extract recommendation text
    const textEl = element.querySelector('.pvs-list__outer-container span[aria-hidden="true"], .recommendation-text');
    recommendation.text = BaseExtractor.extractTextContent(textEl);
    
    return recommendation;
  },
  
  /**
   * Extract recommender roles/titles
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Unique roles
   */
  extractRecommenderRoles(recommendations) {
    const roles = new Set();
    
    recommendations.forEach(rec => {
      if (rec.recommenderTitle) {
        // Extract role from title (e.g., "Senior Developer at Company" -> "Senior Developer")
        const role = rec.recommenderTitle.split(' at ')[0].trim();
        roles.add(role);
      }
    });
    
    return Array.from(roles);
  },
  
  /**
   * Extract keywords from recommendations
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Keywords
   */
  extractKeywords(recommendations) {
    const keywords = {};
    const stopWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at']);
    
    recommendations.forEach(rec => {
      const words = rec.text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));
      
      words.forEach(word => {
        keywords[word] = (keywords[word] || 0) + 1;
      });
    });
    
    // Return top keywords
    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  },
  
  /**
   * Analyze sentiments of recommendations
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Object} Sentiment analysis
   */
  analyzeSentiments(recommendations) {
    const sentiments = {
      positive: 0,
      neutral: 0,
      negative: 0
    };
    
    const positiveWords = ['excellent', 'outstanding', 'exceptional', 'great', 'amazing', 'brilliant', 'talented', 'skilled', 'professional', 'dedicated'];
    const negativeWords = ['difficult', 'challenging', 'issue', 'problem', 'concern'];
    
    recommendations.forEach(rec => {
      const text = rec.text.toLowerCase();
      let score = 0;
      
      positiveWords.forEach(word => {
        if (text.includes(word)) score++;
      });
      
      negativeWords.forEach(word => {
        if (text.includes(word)) score--;
      });
      
      if (score > 0) sentiments.positive++;
      else if (score < 0) sentiments.negative++;
      else sentiments.neutral++;
    });
    
    return sentiments;
  },
  
  /**
   * Categorize relationships
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Object} Relationship categories
   */
  categorizeRelationships(recommendations) {
    const categories = {
      manager: 0,
      colleague: 0,
      report: 0,
      client: 0,
      other: 0
    };
    
    recommendations.forEach(rec => {
      const rel = (rec.relationship || '').toLowerCase();
      
      if (rel.includes('managed') || rel.includes('reported')) {
        categories.manager++;
      } else if (rel.includes('worked with') || rel.includes('colleague')) {
        categories.colleague++;
      } else if (rel.includes('managed directly')) {
        categories.report++;
      } else if (rel.includes('client') || rel.includes('customer')) {
        categories.client++;
      } else {
        categories.other++;
      }
    });
    
    return categories;
  },
  
  /**
   * Extract mentioned skills
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Skills mentioned
   */
  extractMentionedSkills(recommendations) {
    const skills = new Set();
    
    const skillPatterns = [
      /\b(leadership|communication|teamwork|problem solving|analytical|technical|creative|strategic)\b/gi,
      /\b(programming|software|development|engineering|design|analysis|management)\b/gi,
      /\b(java|python|javascript|react|node|sql|aws|cloud|data)\b/gi
    ];
    
    recommendations.forEach(rec => {
      skillPatterns.forEach(pattern => {
        const matches = rec.text.match(pattern);
        if (matches) {
          matches.forEach(skill => skills.add(skill.toLowerCase()));
        }
      });
    });
    
    return Array.from(skills);
  },
  
  /**
   * Calculate average recommendation length
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {number} Average length
   */
  calculateAverageLength(recommendations) {
    if (recommendations.length === 0) return 0;
    
    const totalLength = recommendations.reduce((sum, rec) => sum + rec.text.length, 0);
    return Math.round(totalLength / recommendations.length);
  },
  
  /**
   * Get most recent recommendation date
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {string} Most recent date
   */
  getMostRecentDate(recommendations) {
    // This is simplified - would need proper date parsing
    return recommendations[0]?.date || 'Unknown';
  },
  
  /**
   * Check if has recent recommendations (within 2 years)
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {boolean}
   */
  hasRecentRecommendations(recommendations) {
    // Simplified check - would need proper date parsing
    return recommendations.some(rec => {
      const date = rec.date || '';
      return date.includes('2024') || date.includes('2023');
    });
  },
  
  /**
   * Prepare recommendations for AI processing
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<Object>} Chunked recommendations
   */
  prepareForAI(recommendations) {
    return recommendations.map((rec, index) => ({
      index: index + 1,
      recommender: `${rec.recommenderName} (${rec.recommenderTitle})`,
      relationship: rec.relationship,
      text: BaseExtractor.chunkText(rec.text, 500),
      keywords: this.extractKeywords([rec])
    }));
  }
};