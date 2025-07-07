/**
 * Featured Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile featured section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const FeaturedExtractor = {
  name: 'featured',
  
  selectors: [
    'section[data-section="featured"]',
    'section:has(h2:contains("Featured"))',
    'div[data-view-name="profile-card"]:has(h2:contains("Featured"))',
    'section.pv-profile-section:has(.pv-featured-container)',
    'section#featured-section'
  ],
  
  /**
   * Quick scan for featured section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    const section = BaseExtractor.findSection(this.selectors, 'Featured');
    const exists = !!section;
    
    let itemCount = 0;
    if (exists) {
      // Count featured items (posts, articles, media)
      const items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item, .pv-featured-container__item');
      itemCount = items.length;
    }
    
    Logger.debug(`[FeaturedExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      itemCount
    });
    
    return {
      exists,
      itemCount
    };
  },
  
  /**
   * Extract featured data for completeness scoring
   * @returns {Object} Basic featured data
   */
  async extract() {
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[FeaturedExtractor] Featured section not found');
      return {
        exists: false,
        count: 0,
        hasContent: false
      };
    }
    
    const result = {
      exists: true,
      count: scanResult.itemCount,
      hasContent: scanResult.itemCount > 0
    };
    
    Logger.info(`[FeaturedExtractor] Extracted ${result.count} featured items in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed featured data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists || basicData.count === 0) return basicData;
    
    const section = BaseExtractor.findSection(this.selectors, 'Featured');
    const featuredItems = await this.extractFeaturedItems(section);
    
    const result = {
      ...basicData,
      items: featuredItems,
      
      // Analysis features
      itemTypes: this.categorizeItems(featuredItems),
      hasExternalContent: featuredItems.some(item => item.isExternal),
      hasRecentContent: featuredItems.some(item => this.isRecent(item.date)),
      
      // For AI processing
      featuredSummary: this.summarizeFeatured(featuredItems)
    };
    
    Logger.info(`[FeaturedExtractor] Deep extraction completed in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Extract featured items
   * @param {Element} section - Featured section
   * @returns {Array<Object>} Featured items
   */
  async extractFeaturedItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractFeaturedItem(element);
      if (item.title || item.type) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single featured item
   * @param {Element} element - Featured item element
   * @returns {Object} Featured item data
   */
  async extractFeaturedItem(element) {
    const item = {
      title: '',
      type: 'unknown',
      description: '',
      url: '',
      date: '',
      isExternal: false
    };
    
    // Extract title
    const titleEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    item.title = BaseExtractor.extractTextContent(titleEl);
    
    // Extract type (post, article, media, etc.)
    const typeEl = element.querySelector('.t-12, .pv-featured-container__label');
    const typeText = BaseExtractor.extractTextContent(typeEl);
    item.type = this.determineItemType(typeText, item.title);
    
    // Extract description
    const descEl = element.querySelector('.t-14 span[aria-hidden="true"]');
    item.description = BaseExtractor.extractTextContent(descEl);
    
    // Extract URL
    const linkEl = element.querySelector('a[href]');
    if (linkEl) {
      item.url = linkEl.href;
      item.isExternal = !item.url.includes('linkedin.com');
    }
    
    // Extract date if available
    const dateEl = element.querySelector('.t-black--light');
    item.date = BaseExtractor.extractTextContent(dateEl);
    
    return item;
  },
  
  /**
   * Determine item type
   * @param {string} typeText - Type text from element
   * @param {string} title - Item title
   * @returns {string} Item type
   */
  determineItemType(typeText, title) {
    const text = (typeText + ' ' + title).toLowerCase();
    
    if (text.includes('post')) return 'post';
    if (text.includes('article')) return 'article';
    if (text.includes('video')) return 'video';
    if (text.includes('document')) return 'document';
    if (text.includes('link')) return 'link';
    if (text.includes('media')) return 'media';
    
    return 'other';
  },
  
  /**
   * Categorize featured items
   * @param {Array<Object>} items - Featured items
   * @returns {Object} Item types with counts
   */
  categorizeItems(items) {
    const types = {};
    
    items.forEach(item => {
      types[item.type] = (types[item.type] || 0) + 1;
    });
    
    return types;
  },
  
  /**
   * Check if item is recent
   * @param {string} dateStr - Date string
   * @returns {boolean}
   */
  isRecent(dateStr) {
    if (!dateStr) return false;
    
    // Simple check for recent keywords
    const recentIndicators = /today|yesterday|day ago|week ago|month ago/i;
    return recentIndicators.test(dateStr);
  },
  
  /**
   * Summarize featured items for AI
   * @param {Array<Object>} items - Featured items
   * @returns {string} Summary
   */
  summarizeFeatured(items) {
    if (items.length === 0) return 'No featured content';
    
    const typeGroups = {};
    items.forEach(item => {
      if (!typeGroups[item.type]) {
        typeGroups[item.type] = [];
      }
      typeGroups[item.type].push(item.title || 'Untitled');
    });
    
    const parts = [];
    Object.entries(typeGroups).forEach(([type, titles]) => {
      parts.push(`${type}s: ${titles.length} items`);
    });
    
    return parts.join(', ');
  }
};