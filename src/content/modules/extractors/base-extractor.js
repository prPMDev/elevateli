/**
 * Base Extractor Module for ElevateLI
 * Provides common functionality for all section extractors
 */

const BaseExtractor = {
  /**
   * Common utility to extract text content safely
   */
  extractTextContent(element) {
    if (!element) return '';
    
    // Check for aria-hidden="true" spans first (LinkedIn's actual text)
    const ariaHiddenSpan = element.querySelector('span[aria-hidden="true"]');
    if (ariaHiddenSpan) {
      return ariaHiddenSpan.textContent?.trim() || '';
    }
    
    // Fallback to regular text content
    return element.textContent?.trim() || '';
  },
  
  /**
   * Wait for element with timeout
   */
  async waitForElement(selector, timeout = 3000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  },
  
  /**
   * Click "Show all" button if present
   */
  async expandSection(section, buttonSelector) {
    if (!section) return false;
    
    const showAllButton = section.querySelector(buttonSelector);
    if (!showAllButton || showAllButton.disabled) return false;
    
    showAllButton.click();
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return true;
  },
  
  /**
   * Find section by multiple strategies
   */
  findSection(selectors, headingText) {
    // Filter out invalid selectors (jQuery-specific :contains())
    const validSelectors = selectors.filter(sel => !sel.includes(':contains('));
    
    // Try valid selectors
    for (const selector of validSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          // Skip if this is just an anchor element
          if (element.classList.contains('pv-profile-card__anchor')) {
            continue;
          }
          return element;
        }
      } catch (e) {
        // Silently skip invalid selectors
      }
    }
    
    // Try anchor-based search (LinkedIn's pattern)
    if (headingText) {
      // Try different ID patterns based on section name
      const sectionName = headingText.toLowerCase();
      const possibleIds = [
        sectionName.replace(/\s+/g, '-'),
        sectionName.replace(/\s+/g, ''),
        sectionName.split(' ')[0],
        sectionName
      ];
      
      for (const id of possibleIds) {
        const anchor = document.querySelector(`div#${id}.pv-profile-card__anchor`);
        if (anchor) {
          // For skills and recommendations, skip parent section and check siblings
          if (sectionName !== 'skills' && sectionName !== 'recommendations') {
            // First try parent section for other sections
            const section = anchor.closest('section');
            if (section) {
              return section;
            }
          }
          
          // Try siblings after anchor
          let sibling = anchor.nextElementSibling;
          let siblingCount = 0;
          while (sibling && siblingCount < 5) {
            // For skills, need BOTH skill items AND show all link
            if (sectionName === 'skills') {
              const skillLinks = sibling.querySelectorAll('[data-field="skill_card_skill_topic"]');
              
              // Only return if we have actual skill items
              if (skillLinks.length > 0) {
                return sibling;
              }
            }
            
            // Check if sibling contains meaningful content
            const hasLists = sibling.querySelector('ul, .pvs-list');
            const hasItems = sibling.querySelectorAll('li').length > 0;
            
            if (hasLists || hasItems) {
              // Additional check: make sure it's not just an empty container
              const textContent = sibling.textContent.trim();
              if (textContent.length > 20) {
                return sibling;
              }
            }
            
            sibling = sibling.nextElementSibling;
            siblingCount++;
          }
        }
      }
    }
    
    // Enhanced heading text search
    if (headingText) {
      const headings = document.querySelectorAll('h2');
      for (const heading of headings) {
        // Check for exact match or contains
        if (heading.textContent?.trim() === headingText || 
            heading.textContent?.includes(headingText)) {
          // Try multiple parent containers
          const section = heading.closest('section') || 
                         heading.closest('div[data-view-name="profile-card"]') ||
                         heading.closest('div[class*="profile-card"]');
          if (section) return section;
        }
      }
    }
    
    return null;
  },
  
  /**
   * Count items in a section
   */
  countItems(section, itemSelector) {
    if (!section) return 0;
    return section.querySelectorAll(itemSelector).length;
  },
  
  /**
   * Chunk large text for AI processing
   */
  chunkText(text, maxSize = 1000) {
    if (!text || text.length <= maxSize) return [text];
    
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  },
  
  /**
   * Extract count from "Show all" button without clicking
   */
  extractShowAllInfo(section, sectionName) {
    if (!section) return { totalCount: 0, showAllUrl: null };
    
    // Common patterns for "Show all" buttons/links
    const showAllSelectors = [
      `a[href*="/details/${sectionName}"]`,
      `a[href*="/details/${sectionName}/"]`,
      `[aria-label*="Show all"][aria-label*="${sectionName}"]`,
      `[aria-label*="Show all ${sectionName}"]`,
      'button[aria-label*="Show all"]',
      'a[aria-label*="Show all"]',
      '.pvs-list__footer-wrapper a',
      `a[id*="Show-all"][id*="${sectionName}"]`,
      'a[id*="navigation-index-Show-all"]'
    ];
    
    let totalCount = 0;
    let showAllUrl = null;
    
    for (const selector of showAllSelectors) {
      try {
        const element = section.querySelector(selector);
        if (element) {
          // Extract count from aria-label or text content
          const ariaLabel = element.getAttribute('aria-label') || '';
          const textContent = element.textContent || '';
          const combinedText = ariaLabel + ' ' + textContent;
          
          // Try to match the number with multiple patterns
          const patterns = [
            /Show\s+all\s+(\d+)/i,
            /Show\s+all\s+\((\d+)\)/i,
            new RegExp(`(\\d+)\\s+${sectionName}`, 'i'),
            new RegExp(`${sectionName}\\s*\\((\\d+)\\)`, 'i'),
            /(\d+)\s+items?/i
          ];
          
          for (const pattern of patterns) {
            const match = combinedText.match(pattern);
            if (match) {
              totalCount = parseInt(match[1]);
              break;
            }
          }
          
          // Extract URL if it's a link
          if (element.tagName === 'A' && element.href) {
            showAllUrl = element.href;
          }
          
          if (totalCount > 0) break;
        }
      } catch (e) {
        // Continue with next selector
      }
    }
    
    // If no count found, look for text patterns
    if (totalCount === 0) {
      const textElements = section.querySelectorAll('span, div, a');
      for (const el of textElements) {
        const text = el.textContent || '';
        if (text.length > 200) continue;
        
        const patterns = [
          new RegExp(`(\\d+)\\s+${sectionName}`, 'i'),
          new RegExp(`${sectionName}\\s*\\((\\d+)\\)`, 'i'),
          new RegExp(`Show\\s+all\\s+(\\d+)`, 'i'),
          new RegExp(`View\\s+all\\s+(\\d+)`, 'i'),
          new RegExp(`(\\d+)\\s+total`, 'i')
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            totalCount = parseInt(match[1]);
            break;
          }
        }
        if (totalCount > 0) break;
      }
    }
    
    return { totalCount, showAllUrl };
  },
  
  /**
   * Check if section has meaningful content
   */
  hasContent(data) {
    if (!data || !data.exists) return false;
    
    // Check various indicators of content
    if (data.count && data.count > 0) return true;
    if (data.charCount && data.charCount > 0) return true;
    if (data.items && data.items.length > 0) return true;
    if (data.text && data.text.length > 0) return true;
    
    return false;
  },
  
  /**
   * Log extraction timing
   */
  logTiming(section, startTime, metadata = {}) {
    const duration = Date.now() - startTime;
    // Production: timing logged silently
  }
};