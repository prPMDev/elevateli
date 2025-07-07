/**
 * Constants used throughout the ElevateLI extension
 */

// Timing constants
export const TIMINGS = {
  DEBOUNCE_DELAY: 1000,
  EXTRACTION_THROTTLE: 5000,
  ELEMENT_WAIT_TIMEOUT: 5000,
  ELEMENT_CHECK_INTERVAL: 100,
  MODAL_WAIT_DELAY: 1500,
  OVERLAY_ANIMATION_DELAY: 500,
  BADGE_INJECT_DELAY: 500
};

// Score thresholds
export const SCORE_THRESHOLDS = {
  HIGH: 8,
  MEDIUM: 6,
  COMPLETENESS_HIGH: 85,
  COMPLETENESS_MEDIUM: 60,
  HEADLINE_MIN_CHARS: 100,
  ABOUT_MIN_CHARS: 500,
  ABOUT_OPTIMAL_CHARS: 1500,
  MIN_SKILLS: 10
};

// Character limits for profile sections
export const CHAR_LIMITS = {
  HEADLINE: 220,
  ABOUT: 2600,
  EXPERIENCE_OPTIMAL: 1500
};

// Cache settings
export const CACHE_SETTINGS = {
  MAX_AGE_DAYS: 7,
  DEFAULT_DURATION_DAYS: 7
};

// UI Colors
export const COLORS = {
  HIGH_SCORE: '#057642',
  MEDIUM_SCORE: '#f59e0b',
  LOW_SCORE: '#dc2626',
  LINKEDIN_BLUE: '#0077B5',
  OWN_PROFILE: '#057642'
};

// Selectors
export const SELECTORS = {
  PROFILE_ACTIONS: '.pvs-profile-actions--overflow, .pv-top-card-v2-ctas__custom',
  PROFILE_PHOTO: '.pv-top-card-profile-picture img, .profile-photo-edit__preview',
  HEADLINE_EDIT: '.pv-text-details__left-panel h1, .text-body-medium',
  ABOUT_SECTION: 'section[data-section="summary"]',
  EXPERIENCE_SECTION: 'section#experience-section, div[data-view-name="profile-card"][id*="experience"]',
  SKILLS_SECTION: 'section[data-section="skills"], div[data-view-name="profile-card"][id*="skills"]',
  EDUCATION_SECTION: 'section#education-section, div[data-view-name="profile-card"][id*="education"]'
};

// Extension configuration
export const CONFIG = {
  EXTENSION_NAME: 'ElevateLI',
  DEBUG_MODE: false
};