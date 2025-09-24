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
      Logger.debug('[SkillsExtractor] Found skills anchor, checking siblings');
      let sibling = anchor.nextElementSibling;
      let siblingIndex = 0;
      
      while (sibling && siblingIndex < 5) {
        const skillLinks = sibling.querySelectorAll('[data-field="skill_card_skill_topic"]');
        const showAllLink = sibling.querySelector('a[href*="/details/skills"]');
        
        Logger.debug(`[SkillsExtractor] Sibling ${siblingIndex}: ${skillLinks.length} skill links, showAll: ${!!showAllLink}`);
        
        // We want the sibling with actual skill items
        if (skillLinks.length > 0) {
          Logger.debug(`[SkillsExtractor] Unified finder: Found skills section at sibling ${siblingIndex} with ${skillLinks.length} skills`);
          return sibling;
        }
        
        sibling = sibling.nextElementSibling;
        siblingIndex++;
      }
    }
    
    // Fallback to BaseExtractor if custom method fails
    Logger.info('[SkillsExtractor] Custom section finder failed, using BaseExtractor fallback');
    return BaseExtractor.findSection(this.selectors, 'Skills');
  },
  
  /**
   * Quick scan for skills section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const startTime = Date.now();
    
    Logger.info('[SkillsExtractor] Starting scan v4 - UNIFIED SECTION FINDER');
    
    // Use unified section finder (same logic as extract() will use)
    const section = this.findSkillsSection();
    
    const exists = !!section;
    
    if (section) {
      Logger.info(`[SkillsExtractor] Section found: ${exists}, tagName: ${section.tagName}, id: ${section.id || 'none'}, classes: ${section.className}`);
    } else {
      Logger.info('[SkillsExtractor] No section found');
    }
    
    let visibleCount = 0;
    let totalCount = 0;
    let showAllUrl = null;
    
    if (exists) {
      // Debug: log the section HTML structure
      Logger.info('[SkillsExtractor] Section EXISTS, checking for skill items');
      Logger.info('[SkillsExtractor] Section found, checking structure');
      
      // Check section structure
      const sectionId = section.getAttribute('id');
      const sectionClasses = section.getAttribute('class');
      Logger.info(`[SkillsExtractor] Section ID: "${sectionId}", Classes: "${sectionClasses}"`);
      
      // Look for the actual skills container
      const containers = section.querySelectorAll('div[class*="pvs-list"], ul');
      Logger.info(`[SkillsExtractor] Found ${containers.length} potential containers`);
      containers.forEach((container, idx) => {
        const containerClasses = container.getAttribute('class');
        const childCount = container.children.length;
        Logger.info(`[SkillsExtractor] Container ${idx}: class="${containerClasses}", children=${childCount}`);
      });
      
      // Count visible skill items - specifically look for skill topic links
      const skillLinks = section.querySelectorAll('a[data-field="skill_card_skill_topic"]');
      Logger.info(`[SkillsExtractor] Found ${skillLinks.length} skill topic links`);
      
      if (skillLinks.length > 0) {
        visibleCount = skillLinks.length;
        
        // Log first few skills for verification
        skillLinks.forEach((link, i) => {
          if (i < 3) {
            const skillName = link.querySelector('span[aria-hidden="true"]')?.textContent?.trim();
            Logger.info(`[SkillsExtractor] Skill ${i}: ${skillName}`);
          }
        });
      } else {
        // Fallback to other selectors if skill topic links not found
        for (const selector of this.skillItemSelectors) {
          const items = section.querySelectorAll(selector);
          Logger.info(`[SkillsExtractor] Fallback - trying selector "${selector}" - found ${items.length} items`);
          if (items.length > 0) {
            // Additional filtering to ensure we're getting skills, not endorsements
            const filteredItems = Array.from(items).filter(item => {
              // Check if item contains skill link or looks like a skill
              return item.querySelector('[data-field="skill_card_skill_topic"]') || 
                     (item.textContent.length < 100 && !item.textContent.includes('endorsement'));
            });
            if (filteredItems.length > 0) {
              visibleCount = filteredItems.length;
              Logger.info(`[SkillsExtractor] Filtered to ${visibleCount} actual skill items`);
              break;
            }
          }
        }
      }
      
      // If no items found with standard selectors, try a broader search
      if (visibleCount === 0) {
        Logger.info('[SkillsExtractor] No items found with standard selectors, trying broader search');
        
        // Log the section structure for debugging
        Logger.info('[SkillsExtractor] Section structure analysis in progress');
        
        // Try finding any list items
        const allListItems = section.querySelectorAll('li');
        Logger.info(`[SkillsExtractor] Found ${allListItems.length} total li elements`);
        
        // Try finding divs that might contain skills
        const skillDivs = section.querySelectorAll('div[class*="entity"], div[class*="skill"]');
        Logger.info(`[SkillsExtractor] Found ${skillDivs.length} potential skill divs`);
        
        // Check all lists
        const allLists = section.querySelectorAll('ul');
        Logger.info(`[SkillsExtractor] Found ${allLists.length} ul elements in section`);
        
        allLists.forEach((list, index) => {
          const listItems = list.querySelectorAll('li');
          if (listItems.length > 0 && visibleCount === 0) {
            const firstItem = listItems[0];
            const itemText = firstItem.textContent.trim();
            
            // Log first item for debugging
            Logger.info(`[SkillsExtractor] List ${index} first item text: "${itemText.substring(0, 50)}..."`);
            
            // More flexible skill detection
            const hasSkillLink = firstItem.querySelector('a[data-field*="skill"], a[href*="skill"]');
            const hasSpanWithText = firstItem.querySelector('span[aria-hidden="true"]');
            const looksLikeSkill = itemText.length > 1 && itemText.length < 200 && 
                                  !itemText.toLowerCase().includes('show') && 
                                  !itemText.toLowerCase().includes('see more') &&
                                  !itemText.toLowerCase().includes('load');
            
            if (hasSkillLink || hasSpanWithText || looksLikeSkill) {
              visibleCount = listItems.length;
              Logger.info(`[SkillsExtractor] Found skills in list ${index} with ${listItems.length} items`);
            }
          }
        });
      }
      
      // First try specific skills details link
      const detailsLinks = section.querySelectorAll('a[href*="/details/"], a[href*="skills"]');
      Logger.info(`[SkillsExtractor] Found ${detailsLinks.length} potential details links`);
      detailsLinks.forEach((link, idx) => {
        const href = link.getAttribute('href') || '';
        const text = link.textContent || '';
        Logger.info(`[SkillsExtractor] Link ${idx}: href="${href}", text="${text.substring(0, 50)}"`);
      });
      
      const showAllLink = section.querySelector('a[href*="/details/skills"]');
      if (showAllLink) {
        const linkText = showAllLink.textContent || '';
        Logger.info(`[SkillsExtractor] Found show all link with text: "${linkText}"`);
        
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
            Logger.info(`[SkillsExtractor] Found total count from link: ${totalCount}`);
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
    
    Logger.info(`[SkillsExtractor] Scan completed in ${Date.now() - startTime}ms`, {
      exists,
      visibleCount,
      totalCount,
      hasMore: totalCount > visibleCount,
      showAllUrl: showAllUrl ? 'found' : 'not found'
    });
    
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
    const startTime = Date.now();
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      Logger.info('[SkillsExtractor] Skills section not found');
      return {
        exists: false,
        count: 0,
        charCount: 0, // Added for completeness scoring
        skills: []
      };
    }
    
    // Use unified section finder (same logic as scan() uses)
    const section = this.findSkillsSection();
    
    // Add validation logging to verify section consistency
    Logger.info('[SkillsExtractor] Extract using unified section finder:', {
      sectionFound: !!section,
      sectionType: section?.tagName || 'none',
      skillLinksFound: section ? section.querySelectorAll('[data-field="skill_card_skill_topic"]').length : 0
    });
    
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
    
    Logger.info(`[SkillsExtractor] Extracted ${totalCount} total skills (${scanResult.visibleCount} visible) in ${Date.now() - startTime}ms`);
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed skills data
   */
  async extractDeep() {
    const startTime = Date.now();
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    // Use unified section finder (same logic as scan() and extract() use)
    const section = this.findSkillsSection();
    
    // Expand section if needed
    if (basicData.hasMoreSkills) {
      Logger.debug('[SkillsExtractor] Clicking "Show all" for skills');
      await this.expandSkillsSection(section);
      
      // Wait for skills to load
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Extract all skills after expansion
    const allSkills = await this.extractAllSkills(section);
    
    // Add visibility tier information
    const skillsWithTiers = allSkills.map((skill, index) => ({
      ...skill,
      visibilityTier: index < 3 ? 'top3' : 
                      index < basicData.visibleCount ? 'visible' : 
                      'expanded',
      requiresExpansion: index >= basicData.visibleCount
    }));
    
    const result = {
      ...basicData,
      count: allSkills.length,
      skills: skillsWithTiers,
      
      // Analysis features
      skillsByCategory: this.categorizeSkills(skillsWithTiers),
      topEndorsedSkills: this.getTopEndorsedSkills(skillsWithTiers),
      skillKeywords: this.extractSkillKeywords(skillsWithTiers),
      technicalSkills: skillsWithTiers.filter(s => this.isTechnicalSkill(s.name)),
      softSkills: skillsWithTiers.filter(s => this.isSoftSkill(s.name)),
      
      // Metrics
      totalEndorsements: skillsWithTiers.reduce((sum, s) => sum + s.endorsementCount, 0),
      averageEndorsements: skillsWithTiers.length > 0 
        ? Math.round(skillsWithTiers.reduce((sum, s) => sum + s.endorsementCount, 0) / skillsWithTiers.length)
        : 0,
      endorsedSkillsCount: skillsWithTiers.filter(s => s.endorsementCount > 0).length,
      
      // Visibility metrics
      top3Skills: skillsWithTiers.filter(s => s.visibilityTier === 'top3'),
      visibleSkillsCount: basicData.visibleCount,
      expandedSkillsCount: skillsWithTiers.filter(s => s.requiresExpansion).length,
      
      // For AI processing
      skillGroups: this.groupSkillsForAI(skillsWithTiers)
    };
    
    Logger.info(`[SkillsExtractor] Deep extraction completed in ${Date.now() - startTime}ms`, {
      totalSkills: result.count,
      endorsed: result.endorsedSkillsCount,
      categories: Object.keys(result.skillsByCategory).length
    });
    
    return result;
  },
  
  /**
   * Extract total count from "Show all" button
   * @param {Element} section - Skills section
   * @returns {number} Total count
   */
  async extractTotalCount(section) {
    const showAllSelectors = [
      'a[aria-label*="Show all"][aria-label*="skills"]',
      'button[aria-label*="Show all"][aria-label*="skills"]',
      'a[href*="/details/skills"]',
      '.pvs-list__footer-wrapper a'
    ];
    
    for (const selector of showAllSelectors) {
      const element = section.querySelector(selector);
      if (element) {
        const text = element.textContent || element.getAttribute('aria-label') || '';
        
        // Try different patterns
        const patterns = [
          /Show all (\d+) skills?/i,
          /(\d+)\s*skills?/i,
          /View all\s*\((\d+)\)/i
        ];
        
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            const count = parseInt(match[1]);
            Logger.debug(`[SkillsExtractor] Found total count from button: ${count}`);
            return count;
          }
        }
      }
    }
    
    return 0;
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
   * Extract all skills (after expansion)
   * @param {Element} section - Skills section
   * @returns {Array<Object>} All skills data
   */
  async extractAllSkills(section) {
    // Re-query after expansion
    const skills = [];
    
    let skillElements = [];
    for (const selector of this.skillItemSelectors) {
      skillElements = Array.from(section.querySelectorAll(selector));
      if (skillElements.length > 0) break;
    }
    
    Logger.debug(`[SkillsExtractor] Found ${skillElements.length} skill elements after expansion`);
    
    for (let i = 0; i < skillElements.length; i++) {
      const element = skillElements[i];
      const skill = await this.extractSkillItem(element, i);
      if (skill.name) {
        skills.push(skill);
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
      Logger.debug(`[SkillsExtractor] Found sub-components for skill: ${skill.name}`);
      
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
            Logger.debug(`[SkillsExtractor] Found endorsement recency with count: ${skill.endorsementCount} - ${skill.endorsementRecency}`);
          } else {
            Logger.debug(`[SkillsExtractor] Found endorsement recency: ${skill.endorsementRecency}`);
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
            Logger.debug(`[SkillsExtractor] Found experience context:`, skill.experienceContext);
          }
        }
        
        // Check for education context (institution names)
        if (item.querySelector('img[alt="Company logo"]') && !itemText.includes('experiences')) {
          const educationName = itemText.trim();
          if (educationName && !educationName.includes('Show all')) {
            skill.educationContext.push(educationName);
            Logger.debug(`[SkillsExtractor] Found education context: ${educationName}`);
          }
        }
        
        // Check for "Show all X details" link
        if (itemText.includes('Show all') && itemText.includes('details')) {
          skill.hasDetails = true;
          const detailsMatch = itemText.match(/Show all (\d+) details/);
          if (detailsMatch) {
            skill.detailsCount = parseInt(detailsMatch[1]);
          }
          Logger.debug(`[SkillsExtractor] Skill has ${skill.detailsCount} expandable details`);
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
  
  /**
   * Expand skills section by clicking "Show all"
   * @param {Element} section - Skills section
   */
  async expandSkillsSection(section) {
    const showAllSelectors = [
      'a[aria-label*="Show all"][aria-label*="skills"]',
      'button[aria-label*="Show all"][aria-label*="skills"]',
      'a[href*="/details/skills"]',
      '.pvs-list__footer-wrapper a',
      '.pvs-list__footer-wrapper button'
    ];
    
    for (const selector of showAllSelectors) {
      const button = section.querySelector(selector);
      if (button && !button.disabled) {
        try {
          button.click();
          Logger.debug('[SkillsExtractor] Clicked show all skills button');
          return true;
        } catch (error) {
          Logger.warn('[SkillsExtractor] Failed to click show all button', error);
        }
      }
    }
    
    return false;
  },
  
  /**
   * Categorize skills based on common patterns
   * @param {Array<Object>} skills - Skills array
   * @returns {Object} Categorized skills
   */
  categorizeSkills(skills) {
    const categories = {
      programming: [],
      frameworks: [],
      databases: [],
      cloud: [],
      tools: [],
      soft: [],
      other: []
    };
    
    const patterns = {
      programming: /\b(java|python|javascript|typescript|c\+\+|c#|ruby|go|rust|php|swift|kotlin)\b/i,
      frameworks: /\b(react|angular|vue|django|spring|express|rails|laravel|flutter)\b/i,
      databases: /\b(sql|mysql|postgresql|mongodb|redis|elasticsearch|cassandra)\b/i,
      cloud: /\b(aws|azure|gcp|docker|kubernetes|cloud|devops)\b/i,
      tools: /\b(git|jenkins|jira|agile|scrum|ci\/cd)\b/i,
      soft: /\b(leadership|communication|teamwork|management|problem solving|analytical)\b/i
    };
    
    skills.forEach(skill => {
      let categorized = false;
      
      for (const [category, pattern] of Object.entries(patterns)) {
        if (pattern.test(skill.name)) {
          categories[category].push(skill);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categories.other.push(skill);
      }
    });
    
    // Remove empty categories
    Object.keys(categories).forEach(key => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });
    
    return categories;
  },
  
  /**
   * Get top endorsed skills
   * @param {Array<Object>} skills - Skills array
   * @returns {Array<Object>} Top endorsed skills
   */
  getTopEndorsedSkills(skills) {
    return skills
      .filter(s => s.endorsementCount > 0)
      .sort((a, b) => b.endorsementCount - a.endorsementCount)
      .slice(0, 10);
  },
  
  /**
   * Extract keywords from skills
   * @param {Array<Object>} skills - Skills array
   * @returns {Array<string>} Keywords
   */
  extractSkillKeywords(skills) {
    const keywords = new Set();
    
    skills.forEach(skill => {
      // Split compound skills
      const words = skill.name
        .split(/[\s\-\/&,]+/)
        .filter(w => w.length > 2);
      
      words.forEach(word => keywords.add(word.toLowerCase()));
    });
    
    return Array.from(keywords);
  },
  
  /**
   * Check if skill is technical
   * @param {string} skillName - Skill name
   * @returns {boolean}
   */
  isTechnicalSkill(skillName) {
    const technicalPattern = /\b(programming|software|development|engineering|technical|code|data|system|network|security|database|api|framework|library|platform|technology)\b/i;
    return technicalPattern.test(skillName);
  },
  
  /**
   * Check if skill is soft skill
   * @param {string} skillName - Skill name
   * @returns {boolean}
   */
  isSoftSkill(skillName) {
    const softPattern = /\b(leadership|communication|management|teamwork|problem solving|analytical|creative|strategic|organizational|interpersonal|presentation|negotiation)\b/i;
    return softPattern.test(skillName);
  },
  
  /**
   * Group skills for AI processing
   * @param {Array<Object>} skills - Skills array
   * @returns {Array<Object>} Grouped skills
   */
  groupSkillsForAI(skills) {
    const groups = [];
    const groupSize = 20;
    
    for (let i = 0; i < skills.length; i += groupSize) {
      groups.push({
        skills: skills.slice(i, i + groupSize).map(s => ({
          name: s.name,
          endorsements: s.endorsementCount
        })),
        groupIndex: Math.floor(i / groupSize) + 1,
        totalGroups: Math.ceil(skills.length / groupSize)
      });
    }
    
    return groups;
  }
};