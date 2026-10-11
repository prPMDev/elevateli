/**
 * Skills Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile skills section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const SkillsExtractor = {
  name: 'skills',
  
  // Multiple selectors for LinkedIn's changing DOM
  selectors: [
    'section[data-section="skills"]',
    'section.pv-skill-categories-section',
    'div[id*="skills-section"]',
    '#skills',
    'div[data-view-name="profile-card"][id*="skills"]',
    // New pattern: anchor + sibling
    '#skills.pv-profile-card__anchor + div',
    '#skills ~ div'
  ],
  
  // Selectors for skill items
  skillItemSelectors: [
    'li.artdeco-list__item',
    '.pvs-list__paged-list-item',
    '.pv-skill-category-entity',
    '.pv-skill-entity',
    '[data-field="skill_card_skill_topic"]',
    // Additional selectors for current LinkedIn
    'div[class*="pvs-entity"]',
    'li[class*="pvs-list__item"]',
    'div.pvs-entity',
    'li.pvs-list__item--line-separated'
  ],

  /**
   * Unified skills section finder using proven custom logic
   * Extracted from working scan() implementation for consistency between scan() and extract()
   * @returns {Element|null} Skills section element with actual skill data
   */
  findSkillsSection() {
    // Custom section finding for skills - look for anchor and get the right sibling
    const anchor = document.querySelector('div#skills.pv-profile-card__anchor');
    
    if (anchor) {
      let sibling = anchor.nextElementSibling;
      let siblingIndex = 0;
      
      while (sibling && siblingIndex < 5) {
        const skillLinks = sibling.querySelectorAll('[data-field="skill_card_skill_topic"]');
        
        
        // We want the sibling with actual skill items
        if (skillLinks.length > 0) {
          return sibling;
        }
        
        sibling = sibling.nextElementSibling;
        siblingIndex++;
      }
    }
    
    // Fallback to BaseExtractor if custom method fails
    return BaseExtractor.findSection(this.selectors, 'Skills');
  },
  
  /**
   * Quick scan for skills section existence
   * @returns {Object} Scan results
   */
  async scan() {
    
    
    // Use unified section finder (same logic as extract() will use)
    const section = this.findSkillsSection();
    
    const exists = !!section;
    
    
    let visibleCount = 0;
    let totalCount = 0;
    let showAllUrl = null;
    
    if (exists) {
      
      
      // Count visible skill items - specifically look for skill topic links
      const skillLinks = section.querySelectorAll('a[data-field="skill_card_skill_topic"]');
      
      if (skillLinks.length > 0) {
        visibleCount = skillLinks.length;
        
      } else {
        // Fallback to other selectors if skill topic links not found
        for (const selector of this.skillItemSelectors) {
          const items = section.querySelectorAll(selector);
          if (items.length > 0) {
            // Additional filtering to ensure we're getting skills, not endorsements
            const filteredItems = Array.from(items).filter(item => {
              // Check if item contains skill link or looks like a skill
              return item.querySelector('[data-field="skill_card_skill_topic"]') || 
                     (item.textContent.length < 100 && !item.textContent.includes('endorsement'));
            });
            if (filteredItems.length > 0) {
              visibleCount = filteredItems.length;
              break;
            }
          }
        }
      }
      
      // If no items found with standard selectors, try a broader search
      if (visibleCount === 0) {
        
        
        
        // Check all lists
        const allLists = section.querySelectorAll('ul');
        
        allLists.forEach((list, index) => {
          const listItems = list.querySelectorAll('li');
          if (listItems.length > 0 && visibleCount === 0) {
            const firstItem = listItems[0];
            const itemText = firstItem.textContent.trim();
            
            
            // More flexible skill detection
            const hasSkillLink = firstItem.querySelector('a[data-field*="skill"], a[href*="skill"]');
            const hasSpanWithText = firstItem.querySelector('span[aria-hidden="true"]');
            const looksLikeSkill = itemText.length > 1 && itemText.length < 200 && 
                                  !itemText.toLowerCase().includes('show') && 
                                  !itemText.toLowerCase().includes('see more') &&
                                  !itemText.toLowerCase().includes('load');
            
            if (hasSkillLink || hasSpanWithText || looksLikeSkill) {
              visibleCount = listItems.length;
            }
          }
        });
      }
      
      
      const showAllLink = section.querySelector('a[href*="/details/skills"]');
      if (showAllLink) {
        const linkText = showAllLink.textContent || '';
        
        // Try multiple patterns
        const patterns = [
          /Show\s+all\s+(\d+)\s+skills?/i,
          /(\d+)\s+skills?/i,
          /All\s+(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = linkText.match(pattern);
          if (match) {
            totalCount = parseInt(match[1]);
            showAllUrl = showAllLink.href;
            break;
          }
        }
      }
      
      // Fallback to generic extractShowAllInfo
      if (totalCount === 0) {
        const showAllInfo = BaseExtractor.extractShowAllInfo(section, 'skills');
        totalCount = showAllInfo.totalCount || visibleCount;
        showAllUrl = showAllInfo.showAllUrl;
      }
    }
    
    
    return {
      exists,
      visibleCount,
      totalCount,
      hasMore: totalCount > visibleCount,
      showAllUrl
    };
  },
  
  /**
   * Extract skills data for completeness scoring
   * @returns {Object} Basic skills data with total count
   */
  async extract() {
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        charCount: 0, // Added for completeness scoring
        skills: []
      };
    }
    
    // Use unified section finder (same logic as scan() uses)
    const section = this.findSkillsSection();
    
    
    // Use totalCount from scan (already extracted from "Show all")
    const totalCount = scanResult.totalCount || scanResult.visibleCount;
    
    // Extract visible skills for basic data
    const visibleSkills = await this.extractVisibleSkills(section);
    
    // Calculate character count for completeness scoring
    // Each skill contributes to content depth
    const charCount = totalCount * 30; // Average skill name length * count
    
    const result = {
      exists: true,
      count: totalCount,
      charCount: charCount, // Added for completeness scoring
      visibleCount: scanResult.visibleCount,
      hasMoreSkills: totalCount > scanResult.visibleCount,
      skills: visibleSkills.slice(0, 5), // Just top 5 for basic extraction
      hasEndorsements: visibleSkills.some(s => s.endorsementCount > 0),
      showAllUrl: scanResult.showAllUrl
    };
    
    
    return result;
  },
  
  /**
   * Extract visible skills from the page
   * @param {Element} section - Skills section
   * @returns {Array<Object>} Skills data
   */
  async extractVisibleSkills(section) {
    const skills = [];
    
    // First try to find skill topic links (most accurate)
    let skillElements = Array.from(section.querySelectorAll('a[data-field="skill_card_skill_topic"]'));
    
    if (skillElements.length === 0) {
      // Fallback to other selectors if skill topic links not found
      for (const selector of this.skillItemSelectors) {
        const items = Array.from(section.querySelectorAll(selector));
        // Filter to ensure we're getting skills, not endorsements
        skillElements = items.filter(item => {
          return item.querySelector('[data-field="skill_card_skill_topic"]') || 
                 (item.textContent.length < 100 && !item.textContent.includes('endorsement'));
        });
        if (skillElements.length > 0) break;
      }
    }
    
    // Extract skill data from elements with position tracking
    for (let i = 0; i < skillElements.length; i++) {
      const element = skillElements[i];
      
      if (element.tagName === 'A' && element.hasAttribute('data-field')) {
        // Direct skill link - find parent li for full context
        const parentLi = element.closest('li.artdeco-list__item, li');
        if (parentLi) {
          const skill = await this.extractSkillItem(parentLi, i);
          if (skill.name) {
            skills.push(skill);
          }
        } else {
          // Fallback for direct link without parent
          const skillName = element.querySelector('span[aria-hidden="true"]')?.textContent?.trim();
          if (skillName) {
            skills.push({
              name: skillName,
              position: i + 1,
              endorsementCount: 0,
              hasEndorsements: false,
              endorsementRecency: null,
              experienceContext: null,
              educationContext: [],
              hasDetails: false,
              detailsCount: 0
            });
          }
        }
      } else {
        // Li element containing skill
        const skill = await this.extractSkillItem(element, i);
        if (skill.name) {
          skills.push(skill);
        }
      }
    }
    
    return skills;
  },
  
  /**
   * Extract single skill item
   * @param {Element} element - Skill element
   * @param {number} index - Skill position in the list
   * @returns {Object} Skill data
   */
  async extractSkillItem(element, index = 0) {
    const skill = {
      name: '',
      position: index + 1, // 1-based position
      endorsementCount: 0,
      hasEndorsements: false,
      endorsementRecency: null,
      experienceContext: null,
      educationContext: [],
      hasDetails: false,
      detailsCount: 0
    };
    
    // Extract skill name
    const nameSelectors = [
      '.hoverable-link-text.t-bold span[aria-hidden="true"]',
      '.t-bold span[aria-hidden="true"]',
      '.pv-skill-entity__skill-name',
      '[data-field="skill_card_skill_topic"] span[aria-hidden="true"]',
      'a[data-field="skill_card_skill_topic"] span[aria-hidden="true"]'
    ];
    
    for (const selector of nameSelectors) {
      const nameEl = element.querySelector(selector);
      if (nameEl) {
        skill.name = BaseExtractor.extractTextContent(nameEl);
        if (skill.name) break;
      }
    }
    
    // Extract sub-components for rich context
    const subComponents = element.querySelector('.pvs-entity__sub-components');
    if (subComponents) {
      
      // Look for all list items in sub-components
      const subItems = subComponents.querySelectorAll('li');
      
      subItems.forEach(item => {
        const itemText = BaseExtractor.extractTextContent(item);
        
        // Check for endorsement recency (e.g., "Endorsed by 1 person in the last 6 months")
        if (itemText.includes('Endorsed by') && itemText.includes('in the last')) {
          skill.endorsementRecency = itemText.trim();
          
          // Extract the endorsement count from the recency text
          const endorsementMatch = itemText.match(/Endorsed by (\d+) (?:person|people)/i);
          if (endorsementMatch) {
            skill.endorsementCount = parseInt(endorsementMatch[1]);
            skill.hasEndorsements = true;
          }
        }
        
        // Check for experience context (e.g., "7 experiences across Avalara and 6 other companies")
        if (itemText.includes('experiences across')) {
          const experienceMatch = itemText.match(/(\d+)\s+experiences?\s+across\s+([^and]+?)(?:\s+and\s+(\d+)\s+other\s+compan(?:y|ies))?/i);
          if (experienceMatch) {
            skill.experienceContext = {
              text: itemText.trim(),
              totalExperiences: parseInt(experienceMatch[1]),
              primaryCompany: experienceMatch[2].trim(),
              otherCompaniesCount: experienceMatch[3] ? parseInt(experienceMatch[3]) : 0
            };
          }
        }
        
        // Check for education context (institution names)
        if (item.querySelector('img[alt="Company logo"]') && !itemText.includes('experiences')) {
          const educationName = itemText.trim();
          if (educationName && !educationName.includes('Show all')) {
            skill.educationContext.push(educationName);
          }
        }
        
        // Check for "Show all X details" link
        if (itemText.includes('Show all') && itemText.includes('details')) {
          skill.hasDetails = true;
          const detailsMatch = itemText.match(/Show all (\d+) details/);
          if (detailsMatch) {
            skill.detailsCount = parseInt(detailsMatch[1]);
          }
        }
      });
    }
    
    // Extract endorsement count (existing logic)
    const endorsementEl = element.querySelector('.pv-skill-entity__endorsement-count');
    if (endorsementEl) {
      const text = endorsementEl.textContent || '';
      const match = text.match(/(\d+)/);
      if (match) {
        skill.endorsementCount = parseInt(match[1]);
        skill.hasEndorsements = true;
      }
    } else {
      // Fallback: search for endorsement text
      const textElements = element.querySelectorAll('.t-14, span');
      for (const el of textElements) {
        if (el.textContent && el.textContent.includes('endorsement')) {
          const match = el.textContent.match(/(\d+)/);
          if (match) {
            skill.endorsementCount = parseInt(match[1]);
            skill.hasEndorsements = true;
            break;
          }
        }
      }
    }
    
    return skill;
  },
};