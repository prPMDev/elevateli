/**
 * Profile section discovery module
 * Discovers and analyzes various LinkedIn profile sections
 */

import { extractTextContent, findElement, safeQuerySelector, safeQuerySelectorAll } from './domUtils.js';
import { SELECTORS, CHAR_LIMITS } from './constants.js';

/**
 * Main profile section discovery object
 */
export const ProfileSectionDiscovery = {
  discoverSections() {
    const startTime = performance.now();
    
    const sections = {
      photo: this.hasPhoto(),
      backgroundBanner: this.hasCustomBanner(),
      location: this.hasLocation(),
      headline: this.getHeadlineInfo(),
      about: this.getAboutInfo(),
      experience: this.getExperienceInfo(),
      skills: this.getSkillsInfo(),
      education: this.getEducationInfo(),
      certifications: this.getCertificationsInfo(),
      projects: this.getProjectsInfo(),
      volunteer: this.getVolunteerInfo(),
      languages: this.getLanguagesInfo(),
      recommendations: this.getRecommendationsInfo(),
      honors: this.getHonorsInfo(),
      testScores: this.getTestScoresInfo(),
      topSkills: this.getTopSkillsInfo(),
      featured: this.getFeaturedInfo(),
      connections: this.getConnectionsInfo(),
      activity: this.getActivityInfo(),
      githubLink: this.hasGitHubLink(),
      openToWork: this.getOpenToWorkInfo()
    };
    
    sections.discoveryTime = Math.round(performance.now() - startTime) + 'ms';
    return sections;
  },
  
  hasPhoto() {
    const photoElement = document.querySelector(SELECTORS.PROFILE_PHOTO);
    return !!photoElement;
  },
  
  hasCustomBanner() {
    const banner = document.querySelector('.profile-background-image img') || 
                  document.querySelector('.pv-top-card__background-container img');
    return !!banner;
  },
  
  hasLocation() {
    const location = document.querySelector('.pv-text-details__left-panel .text-body-small:last-child') ||
                    document.querySelector('.pv-top-card--list-bullet li:first-child span') ||
                    document.querySelector('.pv-top-card__location span');
    return !!location && !!extractTextContent(location);
  },
  
  getHeadlineInfo() {
    const element = findElement([
      '.pv-text-details__left-panel .text-body-medium',
      '.pv-top-card-v2-section__headline',
      'div[data-field="headline"]'
    ]);
    
    if (!element) return { exists: false, charCount: 0, text: '' };
    
    const text = extractTextContent(element);
    return {
      exists: true,
      charCount: text.length,
      text: text,
      hasKeywords: /\b(senior|lead|expert|specialist|consultant|architect|manager|director|engineer|developer|designer)\b/i.test(text)
    };
  },
  
  getAboutInfo() {
    const section = document.querySelector(SELECTORS.ABOUT_SECTION);
    if (!section) return { exists: false, charCount: 0, text: '' };
    
    const contentDiv = section.querySelector('.pvs-list__outer-container span[aria-hidden="true"]') ||
                      section.querySelector('.pv-shared-text-with-see-more span[aria-hidden="true"]') ||
                      section.querySelector('.pv-about__summary-text span');
    
    if (!contentDiv) return { exists: false, charCount: 0, text: '' };
    
    const text = extractTextContent(contentDiv);
    return {
      exists: true,
      charCount: text.length,
      text: text,
      hasKeywords: /\b(passionate|experienced|skilled|proven|expert|results|achieve|deliver|leader)\b/i.test(text),
      wellFormatted: text.split('\n').length > 1 || text.split('.').length > 3
    };
  },
  
  getExperienceInfo() {
    const section = document.querySelector(SELECTORS.EXPERIENCE_SECTION);
    if (!section) return { exists: false, experiences: [] };
    
    // Check for "Show all X experiences" link
    const showAllLink = section.querySelector('.pvs-list__footer-wrapper a[href*="/details/experience"]');
    let totalCount = 0;
    
    if (showAllLink) {
      const text = extractTextContent(showAllLink);
      const match = text.match(/Show all (\d+) experiences/i);
      if (match) totalCount = parseInt(match[1]);
    }
    
    const experienceItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    const experiences = [];
    
    experienceItems.forEach(item => {
      const titleElement = item.querySelector('.t-bold span[aria-hidden="true"]');
      const companyElement = item.querySelector('.t-normal:not(.t-black--light) span[aria-hidden="true"]');
      const descElement = item.querySelector('.pvs-list__outer-container > ul span[aria-hidden="true"]');
      
      if (titleElement) {
        const description = extractTextContent(descElement);
        experiences.push({
          title: extractTextContent(titleElement),
          company: extractTextContent(companyElement),
          charCount: description.length,
          hasMetrics: /\b(\d+%|\$\d+|\d+x|increased|decreased|improved|reduced|saved|generated)\b/i.test(description),
          hasQuantifiedAchievements: /\b\d+[%$kKmM]\b/.test(description)
        });
      }
    });
    
    return {
      exists: experiences.length > 0,
      count: totalCount || experiences.length,
      experiences: experiences,
      averageDescriptionLength: experiences.length > 0 
        ? Math.round(experiences.reduce((sum, exp) => sum + exp.charCount, 0) / experiences.length)
        : 0
    };
  },
  
  getSkillsInfo() {
    const section = document.querySelector(SELECTORS.SKILLS_SECTION);
    if (!section) return { exists: false, count: 0, skills: [] };
    
    // Check for "Show all X skills" link
    const showAllLink = section.querySelector('.pvs-list__footer-wrapper a[href*="/details/skills"]');
    let totalCount = 0;
    
    if (showAllLink) {
      const text = extractTextContent(showAllLink);
      const match = text.match(/Show all (\d+) skills/i);
      if (match) totalCount = parseInt(match[1]);
    }
    
    const skillElements = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    const skills = [];
    
    skillElements.forEach(item => {
      const skillName = item.querySelector('.t-bold span[aria-hidden="true"]');
      if (skillName) {
        skills.push(extractTextContent(skillName));
      }
    });
    
    return {
      exists: skills.length > 0,
      count: totalCount || skills.length,
      skills: skills.slice(0, 10),
      hasEndorsements: section.querySelector('.pv-skill-category-entity__endorsement-count') !== null
    };
  },
  
  getEducationInfo() {
    const section = document.querySelector(SELECTORS.EDUCATION_SECTION);
    if (!section) return { exists: false, count: 0, education: [] };
    
    const educationItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    const education = [];
    
    educationItems.forEach(item => {
      const schoolElement = item.querySelector('.t-bold span[aria-hidden="true"]');
      const degreeElement = item.querySelector('.t-normal:not(.t-black--light) span[aria-hidden="true"]');
      
      if (schoolElement) {
        education.push({
          school: extractTextContent(schoolElement),
          degree: extractTextContent(degreeElement)
        });
      }
    });
    
    return {
      exists: education.length > 0,
      count: education.length,
      education: education
    };
  },
  
  getCertificationsInfo() {
    const section = document.querySelector('#licenses_and_certifications')?.closest('section') ||
                   document.querySelector('section[data-section="certifications"]');
    if (!section) return { exists: false, count: 0 };
    
    const certItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    return {
      exists: certItems.length > 0,
      count: certItems.length
    };
  },
  
  getProjectsInfo() {
    const section = document.querySelector('#projects')?.closest('section') ||
                   document.querySelector('section[data-section="projects"]');
    if (!section) return { exists: false, count: 0 };
    
    const projectItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    return {
      exists: projectItems.length > 0,
      count: projectItems.length
    };
  },
  
  getVolunteerInfo() {
    const section = document.querySelector('#volunteering_experience')?.closest('section') ||
                   document.querySelector('section[data-section="volunteering"]');
    if (!section) return { exists: false, count: 0 };
    
    const volunteerItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    return {
      exists: volunteerItems.length > 0,
      count: volunteerItems.length
    };
  },
  
  getLanguagesInfo() {
    const section = document.querySelector('#languages')?.closest('section') ||
                   document.querySelector('section[data-section="languages"]');
    if (!section) return { exists: false, count: 0 };
    
    const languageItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    return {
      exists: languageItems.length > 0,
      count: languageItems.length
    };
  },
  
  getRecommendationsInfo() {
    const section = document.querySelector('#recommendations')?.closest('section') ||
                   document.querySelector('section[data-section="recommendations"]');
    if (!section) return { exists: false, received: 0, given: 0 };
    
    const tabs = safeQuerySelectorAll(section, '[role="tab"]');
    let received = 0, given = 0;
    
    tabs.forEach(tab => {
      const text = extractTextContent(tab);
      const receivedMatch = text.match(/Received \((\d+)\)/);
      const givenMatch = text.match(/Given \((\d+)\)/);
      
      if (receivedMatch) received = parseInt(receivedMatch[1]);
      if (givenMatch) given = parseInt(givenMatch[1]);
    });
    
    return {
      exists: received > 0 || given > 0,
      received: received,
      given: given
    };
  },
  
  getHonorsInfo() {
    const section = document.querySelector('#honors')?.closest('section') ||
                   document.querySelector('#honors_and_awards')?.closest('section');
    if (!section) return { exists: false, count: 0 };
    
    const honorItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    return {
      exists: honorItems.length > 0,
      count: honorItems.length
    };
  },
  
  getTestScoresInfo() {
    const section = document.querySelector('#test_scores')?.closest('section') ||
                   document.querySelector('section[data-section="test-scores"]');
    if (!section) return { exists: false, count: 0 };
    
    const scoreItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    return {
      exists: scoreItems.length > 0,
      count: scoreItems.length
    };
  },
  
  getTopSkillsInfo() {
    const section = document.querySelector('.pv-top-card--list') ||
                   document.querySelector('.pv-highlights-section');
    if (!section) return { exists: false, count: 0 };
    
    const skillButtons = safeQuerySelectorAll(section, 'button[aria-label*="skill"]');
    return {
      exists: skillButtons.length > 0,
      count: skillButtons.length
    };
  },
  
  getFeaturedInfo() {
    const section = document.querySelector('#featured')?.closest('section') ||
                   document.querySelector('section[data-section="featured"]');
    if (!section) return { exists: false, count: 0 };
    
    const featuredItems = safeQuerySelectorAll(section, '.pvs-list__paged-list-item');
    return {
      exists: featuredItems.length > 0,
      count: featuredItems.length
    };
  },
  
  getConnectionsInfo() {
    const connectionsElement = document.querySelector('.pv-top-card--list-bullet li span') ||
                              document.querySelector('a[href*="/connections"] span');
    
    if (!connectionsElement) return { exists: false, count: 0 };
    
    const text = extractTextContent(connectionsElement);
    const match = text.match(/(\d+[,\d]*)\+?\s*(connections|followers)/i);
    
    if (match) {
      const count = parseInt(match[1].replace(/,/g, ''));
      return {
        exists: true,
        count: count,
        is500Plus: text.includes('500+')
      };
    }
    
    return { exists: false, count: 0 };
  },
  
  getActivityInfo() {
    const section = document.querySelector('#content_collections')?.closest('section') ||
                   document.querySelector('section[data-section="posts"]');
    if (!section) return { exists: false, hasRecentActivity: false };
    
    const activityItems = safeQuerySelectorAll(section, '.feed-shared-update-v2');
    return {
      exists: activityItems.length > 0,
      hasRecentActivity: activityItems.length > 0,
      postCount: activityItems.length
    };
  },
  
  hasGitHubLink() {
    const contactInfo = document.querySelector('#top-card-text-details-contact-info') ||
                       document.querySelector('section.pv-contact-info');
    
    if (contactInfo) {
      const links = safeQuerySelectorAll(contactInfo, 'a[href*="github.com"]');
      return links.length > 0;
    }
    
    // Check featured section
    const featuredLinks = safeQuerySelectorAll(document, '#featured a[href*="github.com"]');
    return featuredLinks.length > 0;
  },
  
  getOpenToWorkInfo() {
    const badge = document.querySelector('.pv-member-badge--opentowork') ||
                 document.querySelector('[aria-label*="Open to work"]');
    return {
      exists: !!badge,
      isVisible: !!badge
    };
  }
};