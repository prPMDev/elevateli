# LinkedIn DOM Analysis & Extraction Guide (2025)

## DOM Structure Findings

### Profile Layout
LinkedIn profiles use a modular card-based structure:

```css
/* Main profile containers */
.scaffold-layout__main /* Main content area */
.pv-profile-card /* Individual section cards */
.artdeco-card /* Generic card component */

/* Section identifiers */
#experience /* Experience section */
#education /* Education section */
#skills /* Skills section */
#volunteer_causes /* Volunteer section */
#browsemap_recommendation /* People you may know */
#pymk_recommendation_from_company /* Company recommendations */
```

### Key CSS Selectors

#### Profile Header
```css
.pv-text-details__left-panel /* Name, headline, location */
.pv-top-card-profile-picture /* Profile photo */
.text-body-medium.break-words /* Headline */
.text-body-small.inline.t-black--light /* Location */
```

#### About Section
```css
#about /* Section anchor */
.inline-show-more-text /* About text container */
.inline-show-more-text__button /* Show more button */
```

#### Experience
```css
.pvs-entity /* Individual experience item */
.pvs-entity__path-node /* Company logo */
.t-bold span[aria-hidden="true"] /* Job title */
.pvs-entity__caption-wrapper /* Duration */
```

#### Skills
```css
.pvs-list__paged-list-item /* Skill item */
.artdeco-list__item /* List item wrapper */
```

### Dynamic Elements

**Ember IDs**: LinkedIn uses Ember.js, creating dynamic IDs like `ember87`, `ember579`. These change between sessions and profiles.

**Data Attributes**: More reliable than Ember IDs:
```css
[data-view-name="profile-component-entity"]
[data-field="active_tab_*"]
```

## Hidden Data Extraction

### Script Tag Method (Most Reliable)
LinkedIn stores structured data in JSON-LD format:

```javascript
// Find hidden data
const scriptTag = document.querySelector('script[type="application/ld+json"]');
const profileData = JSON.parse(scriptTag.textContent);
```

This contains:
- Basic profile info
- Work history
- Education
- Skills
- Structured data for SEO

### Benefits of Hidden Data
- Not affected by UI changes
- Complete data in structured format
- Faster extraction
- More reliable than DOM scraping

## Extraction Best Practices

### 1. Use Multiple Selectors
```javascript
// Primary selector with fallbacks
const getAboutText = () => {
  return document.querySelector('.inline-show-more-text')?.textContent ||
         document.querySelector('[data-field="about"]')?.textContent ||
         document.querySelector('#about + div')?.textContent;
};
```

### 2. Handle Dynamic Loading
LinkedIn uses lazy loading and infinite scroll:
```javascript
// Wait for content to load
const waitForElement = (selector, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject('Timeout');
    }, timeout);
  });
};
```

### 3. Rate Limiting
- Free accounts: 80-100 profiles/day
- Premium/Sales Navigator: 150 profiles/day
- Add random delays: 2-5 seconds between actions
- Mimic human behavior (scroll, mouse movements)

### 4. CSS vs XPath
**Use CSS selectors when possible:**
- More performant
- Better browser support
- Cleaner syntax

**XPath only when necessary:**
- Text content matching
- Complex parent-child relationships

## Section-Specific Extraction

### Experience Section
```javascript
const extractExperience = () => {
  const experiences = [];
  document.querySelectorAll('#experience ~ .pvs-list__container .pvs-entity').forEach(item => {
    experiences.push({
      title: item.querySelector('.t-bold span[aria-hidden="true"]')?.textContent,
      company: item.querySelector('.t-normal span[aria-hidden="true"]')?.textContent,
      duration: item.querySelector('.pvs-entity__caption-wrapper')?.textContent,
      description: item.querySelector('.pvs-list__outer-container')?.textContent
    });
  });
  return experiences;
};
```

### Skills Section
```javascript
const extractSkills = () => {
  const skills = [];
  document.querySelectorAll('#skills ~ .pvs-list__container .pvs-entity').forEach(item => {
    const skillName = item.querySelector('.t-bold span')?.textContent;
    if (skillName) skills.push(skillName);
  });
  return skills;
};
```

### Education Section
```javascript
const extractEducation = () => {
  const education = [];
  document.querySelectorAll('#education ~ .pvs-list__container .pvs-entity').forEach(item => {
    education.push({
      school: item.querySelector('.t-bold span')?.textContent,
      degree: item.querySelector('.t-normal span')?.textContent,
      dates: item.querySelector('.pvs-entity__caption-wrapper')?.textContent
    });
  });
  return education;
};
```

## Handling DOM Variations

LinkedIn serves different DOM structures based on:
- User type (free vs premium)
- Device (desktop vs mobile)
- A/B testing
- Geographic location

### Adaptive Extraction
```javascript
const extractProfileData = () => {
  // Try hidden data first
  const jsonLd = document.querySelector('script[type="application/ld+json"]');
  if (jsonLd) {
    return JSON.parse(jsonLd.textContent);
  }
  
  // Fallback to DOM scraping
  return {
    name: document.querySelector('.text-heading-xlarge')?.textContent ||
          document.querySelector('h1')?.textContent,
    headline: document.querySelector('.text-body-medium.break-words')?.textContent,
    about: extractAbout(),
    experience: extractExperience(),
    education: extractEducation(),
    skills: extractSkills()
  };
};
```

## Modern Extraction Tools

### Browser Extensions
- Use content scripts for DOM access
- Handle authentication automatically
- Can bypass some anti-scraping measures

### Headless Browsers
- Puppeteer/Playwright for automation
- Handle JavaScript rendering
- Can simulate user interactions

### API-Based Solutions
- Use proxy networks
- Rotate sessions/IPs
- Handle rate limiting automatically

## Compliance & Ethics

1. **Respect robots.txt**: Check LinkedIn's robots.txt
2. **Rate limit**: Stay within daily limits
3. **Data usage**: Only extract public data
4. **GDPR compliance**: Handle EU citizen data carefully
5. **Terms of Service**: Review LinkedIn's ToS regularly

## Future-Proofing

1. **Monitor changes**: LinkedIn updates DOM frequently
2. **Use data attributes**: More stable than classes
3. **Implement fallbacks**: Multiple extraction methods
4. **Log failures**: Track what breaks
5. **Update regularly**: Review selectors monthly

## Current Extraction Status (December 2024 - Updated)

### ✅ Working Well
- **Headline**: 110 chars extracted successfully
- **About section**: 956 chars using `.inline-show-more-text`
- **Experience**: 13 items with titles, companies, dates
- **Volunteer**: 2 items extracted
- **Photo detection**: Working
- **Custom URL**: Extracted from page
- **Location**: Working
- **Skills**: FIXED - Now extracts all skills from dedicated section with "Show all" handling
- **Education**: FIXED - Returns structured objects with school, degree, fieldOfStudy, dates
- **Recommendations**: FIXED - Text pattern matching finds "X recommendations received" 
- **Certifications**: FIXED - Handles "Show all" button, extracts name, issuer, date, credential ID, URL

### ❌ Still Not Working
- **Languages**: Section not found at all
- **Publications**: No extraction
- **Projects**: No extraction  
- **Honors & Awards**: No extraction
- **Courses**: No extraction

## Updated Selectors (2025)

### Skills Section Fix
```javascript
const extractAllSkills = () => {
  const skills = [];
  
  // Method 1: Dedicated skills section
  const skillsSection = document.querySelector('section[data-view-name="profile-card"]:has(#skills)');
  if (skillsSection) {
    // Check for "Show all" button and click if needed
    const showAllBtn = skillsSection.querySelector('button[aria-label*="Show all"][aria-label*="skills"]');
    if (showAllBtn) showAllBtn.click();
    
    // Wait for expansion then extract
    setTimeout(() => {
      skillsSection.querySelectorAll('.pvs-entity').forEach(item => {
        const skillName = item.querySelector('.mr1 span[aria-hidden="true"]')?.textContent?.trim();
        if (skillName) skills.push(skillName);
      });
    }, 500);
  }
  
  // Method 2: Skills from profile top card (current method)
  const topCardSkills = document.querySelector('.pv-skill-categories-section__top-skills');
  if (topCardSkills) {
    topCardSkills.querySelectorAll('.pv-skill-category-entity__name').forEach(skill => {
      const name = skill.textContent?.trim();
      if (name && !skills.includes(name)) skills.push(name);
    });
  }
  
  return skills;
};
```

### Education Structure Fix
```javascript
const extractEducation = () => {
  const education = [];
  const eduSection = document.querySelector('#education').parentElement;
  
  eduSection?.querySelectorAll('.pvs-entity').forEach(item => {
    const textElements = item.querySelectorAll('.mr1 span[aria-hidden="true"]');
    if (textElements.length >= 2) {
      education.push({
        school: textElements[0]?.textContent?.trim(),
        degree: textElements[1]?.textContent?.trim(),
        dates: item.querySelector('.pvs-entity__caption-wrapper')?.textContent?.trim(),
        description: item.querySelector('.pvs-list__outer-container')?.textContent?.trim()
      });
    }
  });
  
  return education;
};
```

### Recommendations Extraction
```javascript
const extractRecommendations = () => {
  // Method 1: Look for recommendations received text
  const patterns = [
    /(\d+)\s*recommendations?\s*received/i,
    /Received\s*\((\d+)\)/i,
    /(\d+)\s*people have recommended/i
  ];
  
  const pageText = document.body.innerText;
  for (const pattern of patterns) {
    const match = pageText.match(pattern);
    if (match) {
      return { count: parseInt(match[1]), text: match[0] };
    }
  }
  
  // Method 2: Look for recommendations section
  const recSection = document.querySelector('section:has([href*="recommendations"])');
  if (recSection) {
    const count = recSection.querySelector('.pvs-header__subtitle')?.textContent?.match(/\d+/)?.[0];
    return { count: parseInt(count) || 0 };
  }
  
  return { count: 0 };
};
```

### Certifications Full Extraction
```javascript
const extractCertifications = async () => {
  const certs = [];
  const certSection = document.querySelector('#licenses_and_certifications').parentElement;
  
  if (!certSection) return certs;
  
  // Click "Show all" if present
  const showAllBtn = certSection.querySelector('button[aria-label*="Show all"][aria-label*="certifications"]');
  if (showAllBtn) {
    showAllBtn.click();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  certSection.querySelectorAll('.pvs-entity').forEach(item => {
    certs.push({
      name: item.querySelector('.mr1 span[aria-hidden="true"]')?.textContent?.trim(),
      issuer: item.querySelector('.t-14 span[aria-hidden="true"]')?.textContent?.trim(),
      date: item.querySelector('.pvs-entity__caption-wrapper')?.textContent?.trim(),
      credentialId: item.querySelector('[aria-label*="credential ID"]')?.textContent?.trim()
    });
  });
  
  return certs;
};
```

### Languages Section
```javascript
const extractLanguages = () => {
  const languages = [];
  
  // Method 1: Look in accomplishments section
  const langSection = document.querySelector('section:has(.pvs-header__title:has-text("Languages"))');
  if (langSection) {
    langSection.querySelectorAll('.pvs-entity').forEach(item => {
      const lang = item.querySelector('.mr1 span')?.textContent?.trim();
      const proficiency = item.querySelector('.t-14 span')?.textContent?.trim();
      if (lang) languages.push({ language: lang, proficiency });
    });
  }
  
  // Method 2: Additional info section
  const additionalSection = document.querySelector('[data-section="additionalInfo"]');
  if (additionalSection) {
    const langText = additionalSection.textContent.match(/Languages[:\s]+([^\n]+)/i)?.[1];
    if (langText) {
      langText.split(/[,;]/).forEach(lang => {
        languages.push({ language: lang.trim() });
      });
    }
  }
  
  return languages;
};
```

## Chrome Extension Integration

For the LinkedIn Optimizer extension:

```javascript
// Content script pattern
const LinkedInExtractor = {
  init() {
    // Wait for page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', this.extract.bind(this));
    } else {
      this.extract();
    }
  },
  
  extract() {
    // Try multiple extraction methods
    const data = this.extractHiddenData() || this.extractFromDOM();
    
    // Send to background script
    chrome.runtime.sendMessage({
      action: 'profileExtracted',
      data: data
    });
  },
  
  extractHiddenData() {
    // Implementation
  },
  
  extractFromDOM() {
    // Implementation with all selectors
  }
};
```

## Implementation Strategy

### Phase 1: Fix Critical Issues (Immediate)
1. **Skills Extraction**
   - Implement "Show all" button clicking
   - Extract from dedicated skills section
   - Maintain fallback to top card skills

2. **Education Structure**
   - Parse education entries into objects
   - Group school, degree, and dates properly

3. **Recommendations**
   - Implement text pattern matching
   - Search multiple locations for count

### Phase 2: Complete Missing Sections (Next Sprint)
1. **Certifications**
   - Handle pagination/expansion
   - Extract all 14+ certifications

2. **Languages**
   - Find correct section location
   - Try accomplishments and additional info

3. **Other Sections**
   - Publications
   - Projects  
   - Honors & Awards
   - Courses

### Phase 3: Optimization
1. **Performance**
   - Batch DOM queries
   - Implement caching
   - Progressive extraction

2. **Reliability**
   - Add retry logic
   - Better error handling
   - Fallback selectors

## Key Insights from Research

1. **LinkedIn Chrome Extensions Focus**: Most extensions focus on email/contact extraction, not comprehensive profile analysis

2. **Skills Limitations**: LinkedIn allows up to 100 skills but recommends 10-12 for clarity

3. **DOM Instability**: LinkedIn uses dynamic classes that change frequently - use data attributes when possible

4. **Expansion Handling**: Many sections have "Show all" buttons that need to be clicked for full data

5. **Text Pattern Matching**: For sections without clear DOM structure, use regex on page text

## Testing Selectors

Always test selectors across:
- Different profile types (own vs others)
- Account types (free vs premium)
- Languages
- Mobile vs desktop views
- Recently updated vs old profiles
- Profiles with varying amounts of content
