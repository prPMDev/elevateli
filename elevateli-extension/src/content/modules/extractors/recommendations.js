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
    
    // Log section details
    if (section) {
      Logger.info('[RecommendationsExtractor] Section found for deep extraction:', {
        tagName: section.tagName,
        className: section.className,
        hasShowAllLink: !!section.querySelector('a[href*="/details/recommendations"]'),
        childElementCount: section.childElementCount
      });
    } else {
      Logger.error('[RecommendationsExtractor] No section found for deep extraction!');
      return basicData;
    }
    
    // Extract detailed recommendations
    let received = await this.extractReceivedRecommendations(section);
    const given = await this.extractGivenRecommendations(section);
    
    // Try to fetch all recommendations if "Show all" link exists
    const showAllLink = section?.querySelector('a[href*="/details/recommendations"]');
    if (showAllLink?.href && received.length < basicData.receivedCount) {
      Logger.info('[RecommendationsExtractor] Found show all link, attempting to fetch all recommendations');
      try {
        const allRecommendations = await this.fetchAllRecommendations(showAllLink.href);
        if (allRecommendations.length > received.length) {
          Logger.info(`[RecommendationsExtractor] Fetched ${allRecommendations.length} recommendations vs ${received.length} visible`);
          received = allRecommendations;
        }
      } catch (error) {
        Logger.warn('[RecommendationsExtractor] Failed to fetch all recommendations:', error);
      }
    }
    
    // Get experience data from the page to match recommendations
    const experienceData = await this.getExperienceDataForMatching();
    
    // Enhance recommendations with matched experience data
    if (experienceData && experienceData.length > 0) {
      received = this.matchRecommendationsToExperience(received, experienceData);
    }
    
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
    
    // Log the final result structure
    Logger.info('[RecommendationsExtractor] Final deep extraction result:', {
      hasRecommendationChunks: !!result.recommendationChunks,
      chunksLength: result.recommendationChunks?.length || 0,
      receivedLength: result.received?.length || 0,
      firstChunk: result.recommendationChunks?.[0] ? {
        hasText: !!result.recommendationChunks[0].text,
        textLength: result.recommendationChunks[0].text?.length || 0,
        recommender: result.recommendationChunks[0].recommender
      } : null
    });
    
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
    
    Logger.info('[RecommendationsExtractor] Starting extractReceivedRecommendations', {
      sectionExists: !!section,
      sectionTagName: section?.tagName
    });
    
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
    
    // Extract recommendation items - try multiple selectors
    const itemSelectors = [
      '.pvs-list__paged-list-item',
      '.artdeco-list__item', 
      'li.artdeco-list__item',
      '[data-view-name="profile-component-entity"]',
      'li[class*="artdeco-list__item"]'
    ];
    
    let items = [];
    for (const selector of itemSelectors) {
      items = section.querySelectorAll(selector);
      if (items.length > 0) {
        Logger.info(`[RecommendationsExtractor] Found ${items.length} items with selector: ${selector}`);
        break;
      }
    }
    
    if (items.length === 0) {
      Logger.warn('[RecommendationsExtractor] No recommendation items found with any selector');
      // Try finding any li elements in the section
      items = section.querySelectorAll('li');
      Logger.info(`[RecommendationsExtractor] Found ${items.length} li elements as fallback`);
    }
    
    for (const item of items) {
      Logger.debug('[RecommendationsExtractor] Processing item:', {
        className: item.className,
        hasProfileLink: !!item.querySelector('a[href*="/in/"]'),
        hasBoldText: !!item.querySelector('[class*="t-bold"]'),
        innerTextLength: item.innerText?.length
      });
      
      const recommendation = await this.extractRecommendationItem(item);
      Logger.debug('[RecommendationsExtractor] Extracted recommendation:', recommendation);
      if (recommendation.recommenderName) {
        recommendations.push(recommendation);
      }
    }
    
    Logger.info(`[RecommendationsExtractor] Extracted ${recommendations.length} recommendations`);
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
    
    // Pattern 1: Look for name in bold text with link
    const namePatterns = [
      // Look for any element with t-bold class containing a span with aria-hidden
      () => {
        const boldElements = element.querySelectorAll('[class*="t-bold"]');
        for (const el of boldElements) {
          const span = el.querySelector('span[aria-hidden="true"]');
          if (span) {
            const text = BaseExtractor.extractTextContent(span);
            // Check if it looks like a name (not a title or other text)
            if (text && text.length > 2 && text.length < 50 && !text.includes('·')) {
              return text;
            }
          }
        }
        return null;
      },
      // Look in links that go to profiles
      () => {
        const profileLinks = element.querySelectorAll('a[href*="/in/"]');
        for (const link of profileLinks) {
          const span = link.querySelector('span[aria-hidden="true"]');
          if (span) {
            const text = BaseExtractor.extractTextContent(span);
            if (text && !text.includes('·')) return text;
          }
        }
        return null;
      }
    ];
    
    for (const pattern of namePatterns) {
      const name = pattern();
      if (name) {
        recommendation.recommenderName = name;
        break;
      }
    }
    
    // Pattern 2: Look for title in t-14 text that's not bold and not a caption
    const titlePatterns = [
      () => {
        const textElements = element.querySelectorAll('[class*="t-14"]:not([class*="t-bold"]):not([class*="caption"])');
        for (const el of textElements) {
          const span = el.querySelector('span[aria-hidden="true"]');
          if (span) {
            const text = BaseExtractor.extractTextContent(span);
            // Check if it looks like a job title
            if (text && text.length > 5 && !text.includes(',') && 
                (text.includes('Manager') || text.includes('Director') || 
                 text.includes('Engineer') || text.includes('Analyst') ||
                 text.includes('Lead') || text.includes('Senior') ||
                 text.includes('Specialist') || text.includes('Coordinator') ||
                 text.includes('Developer') || text.includes('Designer') ||
                 text.includes('Consultant') || text.includes('VP') ||
                 text.includes('President') || text.includes('Chief'))) {
              return text;
            }
          }
        }
        // Fallback: any t-14 text that's not the name and doesn't look like a date
        const allT14 = element.querySelectorAll('[class*="t-14"] span[aria-hidden="true"]');
        for (const span of allT14) {
          const text = BaseExtractor.extractTextContent(span);
          if (text && text !== recommendation.recommenderName && 
              !text.includes('·') && !text.match(/\d{4}/) &&
              text.length > 5 && text.length < 100) {
            return text;
          }
        }
        return null;
      }
    ];
    
    for (const pattern of titlePatterns) {
      const title = pattern();
      if (title) {
        recommendation.recommenderTitle = title;
        break;
      }
    }
    
    // Pattern 3: Look for date and relationship in caption wrapper
    const captionElements = element.querySelectorAll('[class*="caption"]');
    for (const caption of captionElements) {
      const text = BaseExtractor.extractTextContent(caption);
      if (text && text.includes(',')) {
        // Parse date and relationship
        const dateMatch = text.match(/(\w+\s+\d+,\s+\d{4})/);
        if (dateMatch) {
          recommendation.date = dateMatch[1];
        }
        
        // Extract relationship
        if (text.includes('worked with')) {
          if (text.includes('different teams')) {
            recommendation.relationship = 'worked together on different teams';
          } else if (text.includes('same team')) {
            recommendation.relationship = 'worked together on same team';
          } else {
            recommendation.relationship = 'worked together';
          }
        } else if (text.includes('managed')) {
          recommendation.relationship = text.includes('was managed') ? 'was your manager' : 'you managed';
        } else if (text.includes('reported')) {
          recommendation.relationship = 'reported to you';
        }
      }
    }
    
    // Pattern 4: Look for recommendation text in show-more containers or long text blocks
    const textPatterns = [
      // Look for inline-show-more-text containers
      () => {
        const showMoreContainers = element.querySelectorAll('[class*="inline-show-more-text"]');
        for (const container of showMoreContainers) {
          const span = container.querySelector('span[aria-hidden="true"]');
          if (span) {
            const text = BaseExtractor.extractTextContent(span);
            // Recommendation text is usually longer than 100 chars
            if (text && text.length > 100) return text;
          }
        }
        return null;
      },
      // Look for any long text in nested structure
      () => {
        const allSpans = element.querySelectorAll('li span[aria-hidden="true"]');
        for (const span of allSpans) {
          const text = BaseExtractor.extractTextContent(span);
          // Skip if it's name, title, or date
          if (text && text.length > 100 && 
              text !== recommendation.recommenderName && 
              text !== recommendation.recommenderTitle &&
              !text.match(/^\w+\s+\d+,\s+\d{4}/)) {
            return text;
          }
        }
        return null;
      }
    ];
    
    for (const pattern of textPatterns) {
      const text = pattern();
      if (text) {
        recommendation.text = text;
        break;
      }
    }
    
    Logger.debug('[RecommendationsExtractor] extractRecommendationItem result:', recommendation);
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
    const currentYear = new Date().getFullYear();
    const twoYearsAgo = currentYear - 2;
    
    return recommendations.some(rec => {
      const date = rec.date || '';
      // Check if date contains any year within last 2 years
      for (let year = currentYear; year >= twoYearsAgo; year--) {
        if (date.includes(year.toString())) {
          return true;
        }
      }
      return false;
    });
  },
  
  /**
   * Prepare recommendations for AI processing
   * [CRITICAL_PATH:RECOMMENDATIONS_PREPARE_AI] - P0: Must format recommendations correctly for AI
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<Object>} Chunked recommendations
   */
  prepareForAI(recommendations) {
    return recommendations.map((rec, index) => ({
      index: index + 1,
      recommender: `${rec.recommenderName} (${rec.recommenderTitle})`,
      relationship: rec.relationship,
      date: rec.date || 'Date not available',
      text: rec.text || '', // Keep original text, don't chunk here
      keywords: this.extractKeywords([rec]),
      company: rec.recommenderCompany || this.extractCompanyFromTitle(rec.recommenderTitle),
      relatedRole: rec.relatedRole || 'Not specified'
    }));
  },

  /**
   * Extract company from title string
   * @param {string} title - Title like "Product Manager at CompanyName"
   * @returns {string} Company name
   */
  extractCompanyFromTitle(title) {
    if (!title) return 'Unknown';
    
    // Check if title contains "at Company"
    const atMatch = title.match(/at\s+(.+?)$/i);
    if (atMatch) return atMatch[1].trim();
    
    // Check if title is just the role (no company mentioned)
    // In this case, we might need to look elsewhere for company
    const rolePatterns = ['Manager', 'Director', 'Engineer', 'Developer', 'Analyst', 'Lead', 'Specialist'];
    const hasRoleOnly = rolePatterns.some(pattern => title.includes(pattern));
    
    if (hasRoleOnly && !title.includes(' at ')) {
      return 'Company not specified in title';
    }
    
    return 'Unknown';
  },

  /**
   * Fetch all recommendations from the details page
   * @param {string} url - URL to recommendations page
   * @returns {Array<Object>} All recommendations
   */
  async fetchAllRecommendations(url) {
    Logger.info('[RecommendationsExtractor] Fetching all recommendations from:', url);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract all recommendation items from the fetched page
      const recommendationItems = doc.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      const recommendations = [];
      
      for (const item of recommendationItems) {
        const rec = await this.extractRecommendationItemEnhanced(item, doc);
        if (rec.recommenderName) {
          recommendations.push(rec);
        }
      }
      
      Logger.info(`[RecommendationsExtractor] Successfully extracted ${recommendations.length} recommendations from details page`);
      return recommendations;
      
    } catch (error) {
      Logger.error('[RecommendationsExtractor] Error fetching all recommendations:', error);
      throw error;
    }
  },

  /**
   * Enhanced extraction with more context
   * @param {Element} element - Recommendation element
   * @param {Document} doc - Document context
   * @returns {Object} Recommendation data with enhanced context
   */
  async extractRecommendationItemEnhanced(element, doc) {
    const recommendation = await this.extractRecommendationItem(element);
    
    // Try to extract company from the recommender's title
    if (recommendation.recommenderTitle && !recommendation.recommenderCompany) {
      recommendation.recommenderCompany = this.extractCompanyFromTitle(recommendation.recommenderTitle);
    }
    
    // Try to determine which role this recommendation relates to
    // by matching company names or time periods
    if (recommendation.text) {
      const textLower = recommendation.text.toLowerCase();
      // Look for company names in the recommendation text
      const companies = ['avalara', 'microsoft', 'google', 'amazon']; // Add known companies
      for (const company of companies) {
        if (textLower.includes(company.toLowerCase())) {
          recommendation.relatedRole = `Related to role at ${company}`;
          break;
        }
      }
    }
    
    return recommendation;
  },

  /**
   * Get experience data from the page for matching
   * @returns {Array<Object>} Experience data
   */
  async getExperienceDataForMatching() {
    try {
      // Look for experience section on the page
      const experienceSection = document.querySelector('section[data-section="experience"]') ||
                               document.querySelector('#experience') ||
                               document.querySelector('.experience-section');
      
      if (!experienceSection) {
        Logger.warn('[RecommendationsExtractor] No experience section found for matching');
        return [];
      }
      
      const experiences = [];
      const experienceItems = experienceSection.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      
      for (const item of experienceItems) {
        const titleEl = item.querySelector('.t-bold span[aria-hidden="true"]');
        const companyEl = item.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
        const dateEl = item.querySelector('.pvs-entity__caption-wrapper');
        
        if (titleEl && companyEl) {
          const title = BaseExtractor.extractTextContent(titleEl);
          const companyText = BaseExtractor.extractTextContent(companyEl);
          const dateText = BaseExtractor.extractTextContent(dateEl);
          
          // Parse company name (might be "Company · Full-time")
          const company = companyText.split('·')[0].trim();
          
          experiences.push({
            title,
            company,
            dateRange: dateText,
            fullText: `${title} at ${company}`
          });
        }
      }
      
      Logger.info(`[RecommendationsExtractor] Found ${experiences.length} experiences for matching`);
      return experiences;
      
    } catch (error) {
      Logger.error('[RecommendationsExtractor] Error getting experience data:', error);
      return [];
    }
  },

  /**
   * Match recommendations to user's experience timeline
   * @param {Array<Object>} recommendations - Recommendations
   * @param {Array<Object>} experiences - User's experiences
   * @returns {Array<Object>} Enhanced recommendations
   */
  matchRecommendationsToExperience(recommendations, experiences) {
    return recommendations.map(rec => {
      const enhanced = { ...rec };
      
      // Try to match by company name
      const recCompany = rec.recommenderCompany || this.extractCompanyFromTitle(rec.recommenderTitle);
      
      if (recCompany && recCompany !== 'Unknown') {
        // Find matching experience by company
        const matchedExp = experiences.find(exp => 
          exp.company.toLowerCase().includes(recCompany.toLowerCase()) ||
          recCompany.toLowerCase().includes(exp.company.toLowerCase())
        );
        
        if (matchedExp) {
          enhanced.relatedRole = `${matchedExp.title} at ${matchedExp.company}`;
          enhanced.relatedCompany = matchedExp.company;
          enhanced.experienceContext = matchedExp;
          Logger.debug(`[RecommendationsExtractor] Matched recommendation from ${rec.recommenderName} to ${enhanced.relatedRole}`);
        }
      }
      
      // Also check recommendation text for company mentions
      if (!enhanced.relatedRole && rec.text) {
        const textLower = rec.text.toLowerCase();
        for (const exp of experiences) {
          if (textLower.includes(exp.company.toLowerCase())) {
            enhanced.relatedRole = `${exp.title} at ${exp.company}`;
            enhanced.relatedCompany = exp.company;
            enhanced.experienceContext = exp;
            break;
          }
        }
      }
      
      return enhanced;
    });
  }
};