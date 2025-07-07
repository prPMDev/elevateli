/**
 * ElevateLI Analyzer Base
 * Main orchestrator for LinkedIn profile analysis
 * Expects these modules to be available: Logger, CacheManager, OverlayManager, extractors, scorers
 */

/* ============================================
 * CONSTANTS & CONFIGURATION
 * ============================================ */
const SELECTORS = {
  PROFILE_ACTIONS: '.pvs-profile-actions--overflow, .pv-top-card-v2-ctas__custom',
  SCAFFOLD_ACTIONS: '.pv-profile-sticky-header-v2__actions-container .display-flex',
  PROFILE_PHOTO: '.pv-top-card-profile-picture img, .profile-photo-edit__preview',
  ABOUT_SECTION: 'section[data-section="summary"]',
  EXPERIENCE_SECTION: 'section#experience-section, div[data-view-name="profile-card"][id*="experience"]',
  SKILLS_SECTION: 'section[data-section="skills"], div[data-view-name="profile-card"][id*="skills"]',
  EDUCATION_SECTION: 'section#education-section, div[data-view-name="profile-card"][id*="education"]'
};

const TIMINGS = {
  DEBOUNCE_DELAY: 500,
  EXTRACTION_THROTTLE: 2000,
  WAIT_FOR_ELEMENT_TIMEOUT: 10000,
  CONTENT_LOAD_DELAY: 1500
};

/* ============================================
 * STATE MANAGEMENT
 * ============================================ */
const ExtensionState = {
  isExtracting: false,
  lastExtraction: null,
  lastPath: location.pathname,
  observers: [],
  eventListeners: [],
  timeouts: [],
  intervals: [],
  forceRefresh: false,
  lastCompletenessResult: null,
  storageListener: null
};

/* ============================================
 * CHROME API WRAPPERS
 * ============================================ */
function safeChrome() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

function safeSendMessage(message, callback, retries = 3) {
  if (!safeChrome()) {
    Logger.error('Chrome APIs not available');
    if (callback) callback(null);
    return;
  }
  
  const attemptSend = (retriesLeft) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          Logger.error('Message error:', chrome.runtime.lastError.message);
          
          if (retriesLeft > 0 && chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
            Logger.info(`Retrying message send... (${retriesLeft} retries left)`);
            setTimeout(() => attemptSend(retriesLeft - 1), 1000);
            return;
          }
          
          if (callback) callback({ error: chrome.runtime.lastError.message });
          return;
        }
        
        if (callback) callback(response);
      });
    } catch (error) {
      Logger.error('Message send failed:', error);
      if (callback) callback({ error: error.message });
    }
  };
  
  attemptSend(retries);
}

/* ============================================
 * MAIN ANALYZER ORCHESTRATOR
 * ============================================ */
const Analyzer = {
  // Available extractors (will be defined in separate files)
  extractors: {
    headline: typeof HeadlineExtractor !== 'undefined' ? HeadlineExtractor : null,
    about: typeof AboutExtractor !== 'undefined' ? AboutExtractor : null,
    experience: typeof ExperienceExtractor !== 'undefined' ? ExperienceExtractor : null,
    skills: typeof SkillsExtractor !== 'undefined' ? SkillsExtractor : null,
    education: typeof EducationExtractor !== 'undefined' ? EducationExtractor : null,
    recommendations: typeof RecommendationsExtractor !== 'undefined' ? RecommendationsExtractor : null,
    certifications: typeof CertificationsExtractor !== 'undefined' ? CertificationsExtractor : null,
    projects: typeof ProjectsExtractor !== 'undefined' ? ProjectsExtractor : null,
    featured: typeof FeaturedExtractor !== 'undefined' ? FeaturedExtractor : null
  },
  
  // Initialize and log extractor status
  initializeExtractors() {
    const loadedExtractors = [];
    const missingExtractors = [];
    
    Object.entries(this.extractors).forEach(([name, extractor]) => {
      if (extractor) {
        loadedExtractors.push(name);
      } else {
        missingExtractors.push(name);
      }
    });
    
    Logger.info('[Analyzer] Extractor load status:', {
      loaded: loadedExtractors,
      missing: missingExtractors,
      total: Object.keys(this.extractors).length
    });
    
    // Also check if the extractor objects are defined globally
    Logger.debug('[Analyzer] Global extractor check:', {
      HeadlineExtractor: typeof HeadlineExtractor,
      ExperienceExtractor: typeof ExperienceExtractor,
      SkillsExtractor: typeof SkillsExtractor,
      RecommendationsExtractor: typeof RecommendationsExtractor,
      CertificationsExtractor: typeof CertificationsExtractor
    });
    
    return { loadedExtractors, missingExtractors };
  },
  
  // Error recovery configuration
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2
  },
  
  /**
   * Main analysis flow with progressive UI updates
   * @param {Object} overlay - OverlayManager instance
   * @param {string} profileId - LinkedIn profile ID
   * @param {Object} settings - Analysis settings
   * @param {boolean} isOwn - Is user's own profile
   */
  async analyze(overlay, profileId, settings, isOwn) {
    const analysisId = Logger.startPerformance('full_analysis');
    Logger.info('Starting analysis', { profileId, isOwn, settings });
    
    // Initialize and check extractors
    const { loadedExtractors, missingExtractors } = this.initializeExtractors();
    if (missingExtractors.length > 0) {
      Logger.warn('[Analyzer] Some extractors are missing, analysis may be incomplete');
    }
    
    try {
      // Phase 1: Quick scan (show sections being scanned)
      overlay.setState(OverlayManager.states.SCANNING);
      const scanPerfId = Logger.startPerformance('scan_phase');
      const scanResults = await this.scanAllSections(overlay);
      await Logger.endPerformance(scanPerfId, { sectionsFound: Object.keys(scanResults).length });
      
      // Phase 2: Extract for completeness
      overlay.setState(OverlayManager.states.EXTRACTING);
      const extractPerfId = Logger.startPerformance('extract_phase');
      const extractionResults = await this.extractForCompleteness(scanResults, overlay);
      await Logger.endPerformance(extractPerfId);
      
      // Phase 3: Calculate completeness
      overlay.setState(OverlayManager.states.CALCULATING);
      const calcPerfId = Logger.startPerformance('calculate_completeness');
      const completenessResult = CompletenessScorer.calculate(extractionResults);
      await Logger.endPerformance(calcPerfId, { score: completenessResult.score });
      
      // Update overlay with completeness
      overlay.setState(OverlayManager.states.CALCULATING, {
        completeness: completenessResult.score
      });
      
      // Store result
      ExtensionState.lastCompletenessResult = completenessResult;
      await CacheManager.saveCompleteness(profileId, completenessResult);
      
      // Phase 4: AI analysis (if enabled and own profile)
      if (isOwn && settings.enableAI && settings.apiKey) {
        overlay.setState(OverlayManager.states.AI_ANALYZING);
        
        try {
          // Deep extract for AI
          const deepPerfId = Logger.startPerformance('deep_extract_phase');
          const deepData = await this.extractDeepSelectively(extractionResults, settings, overlay);
          await Logger.endPerformance(deepPerfId);
          
          // Send to AI
          await this.requestAIAnalysis(deepData, completenessResult, overlay, profileId, settings);
        } catch (aiError) {
          Logger.error('AI analysis failed:', aiError);
          // Fallback to completeness-only result
          overlay.setState(OverlayManager.states.COMPLETE, {
            completeness: completenessResult.score,
            completenessData: completenessResult,
            aiError: true,
            error: aiError.message
          });
        }
      } else {
        // Complete without AI
        overlay.setState(OverlayManager.states.COMPLETE, {
          completeness: completenessResult.score,
          completenessData: completenessResult,
          aiDisabled: !settings.enableAI || !settings.apiKey,
          notOwnProfile: !isOwn
        });
      }
      
      await Logger.endPerformance(analysisId, {
        success: true,
        completenessScore: completenessResult.score
      });
      
    } catch (error) {
      Logger.error('Analysis error:', error);
      
      await Logger.endPerformance(analysisId, {
        success: false,
        error: error.message
      });
      
      // Attempt graceful recovery
      const fallbackData = await this.attemptRecovery(profileId, overlay);
      
      overlay.setState(OverlayManager.states.ERROR, {
        message: 'Analysis failed: ' + error.message,
        completeness: fallbackData?.completeness || ExtensionState.lastCompletenessResult?.score,
        completenessData: fallbackData,
        recoveryAttempted: true
      });
    } finally {
      ExtensionState.isExtracting = false;
      ExtensionState.forceRefresh = false;
    }
  },
  
  /**
   * Attempt recovery from analysis failure
   * @param {string} profileId - Profile ID
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object|null} Recovery data
   */
  async attemptRecovery(profileId, overlay) {
    Logger.info('Attempting recovery from analysis failure');
    
    try {
      // Try to get cached data
      const cached = await CacheManager.checkAndReturn(profileId, {});
      if (cached) {
        Logger.info('Recovery successful - found cached data');
        return cached.completenessData;
      }
      
      // Try minimal extraction
      const minimalData = await this.minimalExtraction();
      if (minimalData) {
        Logger.info('Recovery successful - minimal extraction');
        return CompletenessScorer.calculate(minimalData);
      }
      
    } catch (recoveryError) {
      Logger.error('Recovery failed:', recoveryError);
    }
    
    return null;
  },
  
  /**
   * Perform minimal extraction for recovery
   * @returns {Object|null} Minimal extraction data
   */
  async minimalExtraction() {
    try {
      return {
        photo: !!document.querySelector(SELECTORS.PROFILE_PHOTO),
        headline: { exists: !!document.querySelector('.pv-text-details__left-panel .text-body-medium') },
        about: { exists: !!document.querySelector(SELECTORS.ABOUT_SECTION) },
        experience: { exists: !!document.querySelector(SELECTORS.EXPERIENCE_SECTION) },
        skills: { exists: !!document.querySelector(SELECTORS.SKILLS_SECTION) },
        education: { exists: !!document.querySelector(SELECTORS.EDUCATION_SECTION) }
      };
    } catch (error) {
      Logger.error('Minimal extraction failed:', error);
      return null;
    }
  },
  
  /**
   * Scan all sections quickly
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object} Scan results
   */
  async scanAllSections(overlay) {
    const sections = Object.keys(this.extractors);
    const results = {};
    
    // Update UI to show scanning
    overlay.updateScanProgress(sections.map(s => ({ 
      name: s, 
      status: 'pending' 
    })));
    
    // Scan sections in parallel for speed
    const scanPromises = sections.map(async (section) => {
      if (!this.extractors[section]) return;
      
      // Update UI to show scanning this section
      overlay.updateScanProgress(sections.map(s => ({ 
        name: s, 
        status: s === section ? 'scanning' : results[s] ? 'complete' : 'pending'
      })));
      
      try {
        const startTime = Date.now();
        results[section] = await this.extractors[section].scan();
        Logger.debug(`Scanned ${section} in ${Date.now() - startTime}ms`);
        
        // Update UI to show complete
        overlay.updateScanProgress(sections.map(s => ({ 
          name: s, 
          status: results[s] ? 'complete' : s === section ? 'complete' : 'pending',
          itemCount: results[s]?.visibleCount
        })));
        
      } catch (error) {
        // Log DOM exceptions at debug level to reduce noise
        if (error.name === 'DOMException' || error.name === 'SyntaxError') {
          Logger.debug(`[Scanner] DOM exception for ${section}:`, error.message);
        } else {
          Logger.error(`Error scanning ${section}:`, error);
        }
        results[section] = { exists: false, error: true };
      }
    });
    
    // Wait for all scans with timeout
    await Promise.race([
      Promise.all(scanPromises),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]);
    
    return results;
  },
  
  /**
   * Extract data for completeness scoring with retry logic
   * @param {Object} scanResults - Results from scanning
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object} Extraction results
   */
  async extractForCompleteness(scanResults, overlay) {
    const results = {};
    
    // Extract sections that exist
    for (const [section, scanResult] of Object.entries(scanResults)) {
      if (!scanResult || !scanResult.exists || !this.extractors[section]) {
        results[section] = scanResult || { exists: false };
        continue;
      }
      
      // Extract with retry logic
      results[section] = await this.extractWithRetry(
        section,
        () => this.extractors[section].extract(),
        overlay
      );
    }
    
    // Add photo check (special case)
    results.photo = !!document.querySelector(SELECTORS.PROFILE_PHOTO);
    
    return results;
  },
  
  /**
   * Extract with retry logic
   * @param {string} section - Section name
   * @param {Function} extractFn - Extraction function
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object} Extraction result
   */
  async extractWithRetry(section, extractFn, overlay) {
    let lastError;
    let delay = this.retryConfig.retryDelay;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Show extracting this section
        overlay.updateExtractionProgress(section);
        
        const perfId = Logger.startPerformance(`extract_${section}`);
        const result = await extractFn();
        
        await Logger.endPerformance(perfId, {
          section,
          attempt,
          success: true
        });
        
        Logger.debug(`Extracted ${section} on attempt ${attempt}:`, result);
        return result;
        
      } catch (error) {
        lastError = error;
        Logger.warn(`[${section}] Extraction attempt ${attempt} failed:`, error);
        
        if (attempt < this.retryConfig.maxRetries) {
          Logger.info(`[${section}] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= this.retryConfig.backoffMultiplier;
        }
      }
    }
    
    // All retries failed
    Logger.error(`[${section}] All extraction attempts failed:`, lastError);
    return { 
      exists: false, 
      error: true, 
      errorMessage: lastError.message,
      attempts: this.retryConfig.maxRetries
    };
  },
  
  /**
   * Selectively deep extract for AI analysis
   * @param {Object} basicData - Basic extraction results
   * @param {Object} settings - User settings
   * @param {Object} overlay - OverlayManager instance
   * @returns {Object} Deep extraction results
   */
  async extractDeepSelectively(basicData, settings, overlay) {
    const deepResults = {};
    
    // Prioritize sections based on role and data availability
    const prioritizedSections = this.prioritizeSections(basicData, settings);
    
    for (const section of prioritizedSections) {
      if (!this.extractors[section] || !this.extractors[section].extractDeep) {
        continue;
      }
      
      try {
        // Update UI
        overlay.updateAIProgress(`analyzing-${section}`, section);
        
        deepResults[section] = await this.extractors[section].extractDeep();
        Logger.debug(`Deep extracted ${section}`);
        
      } catch (error) {
        Logger.error(`Error deep extracting ${section}:`, error);
        deepResults[section] = basicData[section];
      }
    }
    
    return deepResults;
  },
  
  /**
   * Prioritize sections for deep extraction
   * @param {Object} basicData - Basic extraction results
   * @param {Object} settings - User settings
   * @returns {Array<string>} Prioritized section names
   */
  prioritizeSections(basicData, settings) {
    const sections = [];
    
    // Always prioritize these if they have content
    if (BaseExtractor.hasContent(basicData.about)) sections.push('about');
    if (BaseExtractor.hasContent(basicData.experience)) sections.push('experience');
    if (BaseExtractor.hasContent(basicData.skills)) sections.push('skills');
    
    // Role-specific prioritization
    if (settings.targetRole?.includes('engineer')) {
      sections.push('projects', 'certifications');
    } else if (settings.targetRole?.includes('manager')) {
      sections.push('recommendations');
    }
    
    // Add other sections with content
    Object.keys(basicData).forEach(section => {
      if (!sections.includes(section) && BaseExtractor.hasContent(basicData[section])) {
        sections.push(section);
      }
    });
    
    return sections;
  },
  
  /**
   * Request AI analysis from service worker
   * @param {Object} deepData - Deep extraction results
   * @param {Object} completenessResult - Completeness scoring result
   * @param {Object} overlay - OverlayManager instance
   * @param {string} profileId - Profile ID
   * @param {Object} settings - User settings
   */
  async requestAIAnalysis(deepData, completenessResult, overlay, profileId, settings) {
    overlay.updateAIProgress('generating');
    
    safeSendMessage({
      action: 'calculateScore',
      url: window.location.href,
      profileData: deepData,
      completenessResult: completenessResult,
      forceRefresh: ExtensionState.forceRefresh,
      settings: settings
    }, async (response) => {
      Logger.info('AI analysis response:', response);
      
      if (response && response.error) {
        overlay.setState(OverlayManager.states.ERROR, {
          message: response.error,
          completeness: completenessResult.score,
          completenessData: completenessResult
        });
        return;
      }
      
      if (response && response.contentScore !== undefined) {
        overlay.setState(OverlayManager.states.COMPLETE, {
          completeness: completenessResult.score,
          completenessData: completenessResult,
          contentScore: response.contentScore,
          recommendations: response.recommendations,
          insights: response.insights,
          sectionScores: response.sectionScores,
          fromCache: response.fromCache
        });
        
        // Save to cache if fresh
        if (!response.fromCache) {
          await CacheManager.save(profileId, {
            contentScore: response.contentScore,
            recommendations: response.recommendations,
            insights: response.insights,
            sectionScores: response.sectionScores
          }, deepData, settings);
        }
      }
    });
  }
};

/* ============================================
 * INITIALIZATION
 * ============================================ */
async function init() {
  Logger.info('Initializing ElevateLI', { url: location.href });
  
  if (!safeChrome()) {
    Logger.error('Chrome APIs not available');
    return;
  }
  
  if (!isProfilePage()) {
    Logger.info('Not a profile page, skipping');
    return;
  }
  
  // Get profile ID
  const profileId = getProfileId();
  if (!profileId) {
    Logger.error('Could not determine profile ID');
    return;
  }
  
  // Detect if own profile
  const isOwn = await isOwnProfile();
  
  // Initialize overlay immediately
  const overlay = await OverlayManager.initialize();
  
  // Get settings
  const settings = await chrome.storage.local.get([
    'targetRole', 
    'seniorityLevel', 
    'customInstructions',
    'enableAI',
    'apiKey',
    'aiProvider'
  ]);
  
  // Check cache first
  const cached = await CacheManager.checkAndReturn(profileId, settings);
  
  if (cached && !ExtensionState.forceRefresh) {
    // Check if cache has actual score data
    if (!cached.completeness && !cached.contentScore) {
      Logger.info('Cache exists but no scores found');
      overlay.setState(OverlayManager.states.EMPTY_CACHE);
      return;
    }
    
    Logger.info('Using cached analysis', { 
      completeness: cached.completeness,
      hasAI: !!cached.contentScore 
    });
    overlay.setState(OverlayManager.states.CACHE_LOADED, cached);
    
    if (cached.completenessData) {
      ExtensionState.lastCompletenessResult = cached.completenessData;
    }
    
    return;
  }
  
  // Start analysis
  Logger.info('Starting fresh analysis');
  await Analyzer.analyze(overlay, profileId, settings, isOwn);
}

/* ============================================
 * UTILITY FUNCTIONS
 * ============================================ */
function isProfilePage() {
  return location.pathname.includes('/in/');
}

function getProfileId() {
  const match = location.pathname.match(/\/in\/([^\/]+)/);
  return match ? match[1] : null;
}

async function isOwnProfile() {
  // Check URL first
  if (location.pathname.includes('/in/me')) return true;
  
  // Check stored profile
  const stored = await chrome.storage.local.get('userProfile');
  if (stored.userProfile?.profileId) {
    const currentId = getProfileId();
    return currentId === stored.userProfile.profileId;
  }
  
  // Check for edit buttons
  return !!document.querySelector('.pv-top-card-v2-ctas__edit');
}

/* ============================================
 * MESSAGE LISTENERS
 * ============================================ */
if (safeChrome()) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    Logger.debug('Message received:', request.action);
    
    if (request.action === 'ping') {
      sendResponse({ status: 'ready', url: window.location.href });
      return true;
    }
    
    if (request.action === 'triggerAnalysis') {
      Logger.info('Manual analysis triggered');
      ExtensionState.forceRefresh = true;
      init().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
    }
    
    if (request.action === 'removeOverlay') {
      const wrapper = document.querySelector('.elevateli-overlay-wrapper');
      if (wrapper) {
        wrapper.remove();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No overlay found' });
      }
      return true;
    }
  });
}

// Window message listeners for overlay actions
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'ELEVATE_REFRESH') {
    Logger.info('Refresh requested via overlay');
    ExtensionState.forceRefresh = true;
    
    // Update overlay to show it's working
    if (OverlayManager.overlayElement) {
      OverlayManager.setState(OverlayManager.states.INITIALIZING);
    }
    
    // Re-run analysis
    init();
  }
});

/* ============================================
 * STARTUP
 * ============================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(init, 100);
  });
} else {
  setTimeout(init, 100);
}

// Export for debugging
window.ElevateLI = {
  state: ExtensionState,
  analyzer: Analyzer,
  init: init
};