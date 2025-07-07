// LinkedIn Optimizer - Skills Extraction Fix
// This fixes the broken skills extraction returning 0

// Replace the getSkillsInfo() function in analyzer.js with this updated version:

getSkillsInfo() {
  console.log('=== Extracting Skills ===');
  
  // Multiple strategies to find skills section
  let section = document.querySelector('section#skills') ||
               document.querySelector('section[data-view-name="profile-card"]:has(#skills)') || // Won't work in Chrome
               document.querySelector('#skills')?.closest('section') ||
               Array.from(document.querySelectorAll('section')).find(s => {
                 const h2 = s.querySelector('h2');
                 const h2Text = h2?.textContent?.toLowerCase() || '';
                 const spanText = h2?.querySelector('span')?.textContent?.toLowerCase() || '';
                 return h2Text.includes('skills') || spanText.includes('skills');
               });
               
  if (!section) {
    console.log('Skills section not found');
    return { exists: false, visibleCount: 0, totalCount: 0, count: 0 };
  }
  
  console.log('Skills section found:', section);
  
  // Strategy 1: Look for "Show all X skills" link in footer
  const showAllLink = section.querySelector('a[href*="/details/skills"]') ||
                     section.querySelector('.pvs-list__footer-wrapper a');
  
  if (showAllLink) {
    const linkText = showAllLink.textContent || '';
    console.log('Skills show all link text:', linkText);
    
    // Try multiple regex patterns
    const patterns = [
      /Show all (\d+) skills?/i,
      /(\d+) skills?/i,
      /All (\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = linkText.match(pattern);
      if (match) {
        const totalCount = parseInt(match[1]);
        console.log('Skills total from link:', totalCount);
        return {
          exists: true,
          totalCount,
          count: totalCount, // CRITICAL: Add count for compatibility
          detailsUrl: showAllLink.href,
          visibleCount: this.countVisibleSkills(section)
        };
      }
    }
  }
  
  // Strategy 2: Check for "Show all" button
  const showAllBtn = section.querySelector('button[aria-label*="Show all"][aria-label*="skill"]');
  if (showAllBtn) {
    const ariaLabel = showAllBtn.getAttribute('aria-label') || '';
    const match = ariaLabel.match(/(\d+)/);
    if (match) {
      const totalCount = parseInt(match[1]);
      console.log('Skills total from button:', totalCount);
      return {
        exists: true,
        totalCount,
        count: totalCount, // Add count for compatibility
        visibleCount: this.countVisibleSkills(section)
      };
    }
  }
  
  // Strategy 3: Count visible skills items
  const visibleCount = this.countVisibleSkills(section);
  console.log('Visible skills count:', visibleCount);
  
  // Strategy 4: Check for skills in the page's JSON-LD data
  const jsonLd = document.querySelector('script[type="application/ld+json"]');
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd.textContent);
      if (data.skills && Array.isArray(data.skills)) {
        const totalCount = data.skills.length;
        console.log('Skills from JSON-LD:', totalCount);
        return {
          exists: true,
          totalCount,
          count: totalCount,
          visibleCount
        };
      }
    } catch (e) {
      console.log('JSON-LD parsing failed for skills');
    }
  }
  
  // Fallback: return visible count as total
  return {
    exists: visibleCount > 0,
    totalCount: visibleCount,
    count: visibleCount, // Critical for compatibility
    visibleCount
  };
},

countVisibleSkills(section) {
  if (!section) return 0;
  
  // Multiple selectors for skill items
  const selectors = [
    '.pvs-entity',
    'li.artdeco-list__item',
    '[data-view-name="profile-component-entity"]',
    '.skill-item',
    '[data-field="skill_name"]'
  ];
  
  let validItems = [];
  
  for (const selector of selectors) {
    const items = section.querySelectorAll(selector);
    if (items.length > 0) {
      // Filter out non-skill items
      validItems = Array.from(items).filter(item => {
        // Exclude footer/navigation items
        if (item.querySelector('.pvs-list__footer-wrapper')) return false;
        if (item.querySelector('a[href*="/details/"]')) return false;
        
        // Check if it contains skill-like content
        const text = item.textContent || '';
        const hasSkillContent = text.length > 2 && text.length < 100; // Skills are typically short
        
        return hasSkillContent;
      });
      
      if (validItems.length > 0) break;
    }
  }
  
  console.log(`Found ${validItems.length} visible skills`);
  return validItems.length;
},