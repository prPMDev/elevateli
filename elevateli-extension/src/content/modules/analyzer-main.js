/**
 * Main entry point for ElevateLI content script
 * Coordinates all modules and initializes the extension
 */

// Note: All dependencies are assumed to be available in global scope
// from previously loaded modules in the concatenated analyzer.js

// Wrap in IIFE to avoid global scope pollution
(function() {
  'use strict';
  
  console.log(`${CONFIG.EXTENSION_NAME} content script loaded`);
  
  // Check if extension context is still valid
  function isExtensionContextValid() {
    try {
      return !!(chrome?.runtime?.id);
    } catch (error) {
      console.warn('[WARN] Chrome runtime not accessible:', error);
      return false;
    }
  }
  
  // Initialize the extension
  function init() {
    console.log('[INFO] Initializing ElevateLI', { url: location.href });
    
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('[WARN] Extension context invalidated - old content script instance. This page was loaded before the extension was updated. Refresh the page to use the latest version.');
      return;
    }
    
    // Check if we're on a LinkedIn profile page
    if (!isProfilePage()) {
      console.log('[INFO] Not a profile page, skipping initialization');
      return;
    }
    
    // Get profile ID from URL
    const profileId = getProfileIdFromUrl();
    if (!profileId) {
      console.log('[WARN] Could not extract profile ID from URL');
      return;
    }
    
    console.log('[INFO] Profile ID:', profileId);
    
    // Check if it's the user's own profile
    isOwnProfile().then(isOwn => {
      console.log('[INFO] Is own profile:', isOwn);
      
      // Only initialize overlay on user's own profile
      if (!isOwn) {
        console.log('[INFO] Not user\'s profile - skipping overlay injection');
        return;
      }
      
      // Check if user has accepted terms
      if (!isExtensionContextValid()) {
        console.warn('[WARN] Extension context invalidated before checking compliance');
        return;
      }
      
      chrome.storage.local.get(['compliance', 'userProfile'], async (data) => {
        // Check for runtime errors
        if (chrome.runtime.lastError) {
          console.warn('[WARN] Failed to check compliance:', chrome.runtime.lastError);
          return;
        }
        
        if (!data.compliance?.hasAcknowledged) {
          console.log('[INFO] Terms not accepted - skipping overlay injection');
          return;
        }
        
        // Initialize overlay only after all checks pass
        OverlayManager.initialize();
        
        // Use saved profile ID for cache if available, otherwise use URL
        const cacheProfileId = data.userProfile?.profileId || profileId;
        console.log('[INFO] Using profile ID for cache:', cacheProfileId);
        
        // Get settings and check cache
        chrome.storage.local.get(['enableAI', 'apiKey', 'encryptedApiKey', 'aiProvider', 'cacheDuration'], async (settings) => {
          const hasApiKey = settings.apiKey || settings.encryptedApiKey;
          const enableAI = settings.enableAI && hasApiKey && settings.aiProvider;
          
          // Check cache first (no expiration)
          const cacheManager = new CacheManager(null);
          const cachedData = await cacheManager.get(cacheProfileId);
          
          if (cachedData && cachedData.completeness !== undefined) {
            console.log('[INFO] Found cached data', { 
              completeness: cachedData.completeness,
              contentScore: cachedData.contentScore,
              fromCache: true,
              hasSectionScores: !!cachedData.sectionScores,
              sectionScoreKeys: cachedData.sectionScores ? Object.keys(cachedData.sectionScores) : [],
              cachedDataKeys: Object.keys(cachedData)
            });
            
            // Show cached results
            OverlayManager.setState(OverlayManager.states.CACHE_LOADED, {
              completeness: cachedData.completeness,
              contentScore: cachedData.contentScore,
              completenessData: cachedData.completenessData,
              recommendations: cachedData.recommendations,
              sectionScores: cachedData.sectionScores,
              timestamp: cachedData.timestamp,
              fromCache: true,
              aiDisabled: !enableAI
            });
          } else {
            // No cache - show empty state
            console.log('[INFO] No cache found, showing empty state');
            OverlayManager.setState(OverlayManager.states.EMPTY_CACHE);
          }
        });
      });
    });
  }
  
  // Extract profile ID from URL
  function getProfileIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/in\/([^\/]+)/);
    return match ? match[1] : null;
  }
  
  // Start analysis when requested
  async function startAnalysis(forceRefresh = false) {
    console.log('[INFO] Starting analysis', { forceRefresh });
    
    // Set analysis in progress
    analysisInProgress = true;
    analysisAborted = false;
    
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('[WARN] Extension context invalidated - cannot start analysis. Please refresh the page to reload the extension.');
      
      // Try to show a user-friendly message if overlay exists
      if (typeof OverlayManager !== 'undefined' && OverlayManager.overlayElement) {
        OverlayManager.setState(OverlayManager.states.ERROR, {
          message: 'Extension was updated. Please refresh the page to continue.'
        });
      }
      
      return;
    }
    
    const profileId = getProfileIdFromUrl();
    if (!profileId) return;
    
    // Get saved profile for consistent cache key
    const savedProfile = await getSavedProfile();
    const cacheProfileId = savedProfile?.profileId || profileId;
    
    const isOwn = await isOwnProfile();
    
    let settings = {};
    try {
      settings = await new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
          resolve({});
          return;
        }
        chrome.storage.local.get(['enableAI', 'apiKey', 'encryptedApiKey', 'aiProvider', 'aiModel', 'targetRole', 'seniorityLevel', 'cacheDuration'], (data) => {
          if (chrome.runtime.lastError) {
            console.warn('[WARN] Failed to get settings:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(data);
          }
        });
      });
    } catch (error) {
      console.warn('[WARN] Error getting settings:', error);
      settings = {};
    }
    
    // Log settings for debugging
    console.log('[INFO] Settings loaded:', {
      enableAI: settings.enableAI,
      hasApiKey: !!(settings.apiKey || settings.encryptedApiKey),
      apiKeyType: settings.apiKey ? 'plain' : settings.encryptedApiKey ? 'encrypted' : 'none',
      aiProvider: settings.aiProvider,
      cacheDuration: settings.cacheDuration
    });
    
    // Create analyzer instance with consistent cache profile ID
    const analyzer = new Analyzer();
    await analyzer.init(cacheProfileId, isOwn, settings);
    
    // Run analysis
    const results = await analyzer.analyze(forceRefresh);
    
    if (results.success) {
      console.log('[INFO] Analysis complete', results);
    } else {
      console.error('[ERROR] Analysis failed', results.error);
    }
  }
  
  // Listen for messages from popup/background
  // Track if analysis is in progress
  let analysisInProgress = false;
  let analysisAborted = false;
  
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'ELEVATE_REFRESH') {
      console.log('[INFO] Refresh requested via overlay');
      analysisAborted = false;
      startAnalysis(true);
    }
    
    if (event.data.type === 'ELEVATE_CANCEL_ANALYSIS') {
      console.log('[INFO] Cancel analysis requested');
      analysisAborted = true;
      analysisInProgress = false;
    }
  });
  
  // Navigation observer for SPA navigation
  function observeNavigation() {
    let lastPath = location.pathname;
    
    const observer = new MutationObserver(debounce(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        console.log('[INFO] Navigation detected', { newPath: lastPath });
        
        // Cleanup previous overlay
        const existingOverlay = document.querySelector('.elevateli-overlay-wrapper');
        if (existingOverlay) {
          existingOverlay.remove();
        }
        
        // Reinitialize if still on a profile page
        if (isProfilePage()) {
          setTimeout(init, 500);
        }
      }
    }, 500));
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Chrome runtime message listener
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[INFO] Received message:', request);
      
      if (request.action === 'ping') {
        sendResponse({ success: true, alive: true });
        return true;
      }
      
      if (request.action === 'toggleOverlay') {
        if (request.show) {
          OverlayManager.show();
        } else {
          OverlayManager.hide();
        }
        sendResponse({ success: true });
        return true;
      }
      
      if (request.action === 'analyzeProfile') {
        startAnalysis(request.forceRefresh).then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        return true; // Keep channel open for async response
      }
      
      if (request.action === 'getProfileData') {
        const profileId = getProfileIdFromUrl();
        chrome.storage.local.get([`cache_${profileId}`], (data) => {
          sendResponse({ 
            success: true, 
            data: data[`cache_${profileId}`] || null 
          });
        });
        return true;
      }
      
      if (request.action === 'profileUpdated') {
        console.log('[INFO] Profile updated notification received');
        const currentProfileId = getProfileIdFromUrl();
        
        if (currentProfileId === request.userProfile.profileId) {
          console.log('[INFO] Current page matches saved profile, initializing overlay');
          
          // Check if overlay already exists
          if (!document.querySelector('.elevateli-overlay-wrapper')) {
            // Re-run initialization
            init();
            sendResponse({ success: true, overlayInitialized: true });
          } else {
            console.log('[INFO] Overlay already exists');
            sendResponse({ success: true, overlayExists: true });
          }
        } else {
          console.log('[INFO] Current page does not match saved profile');
          sendResponse({ success: false, reason: 'Profile mismatch' });
        }
        return true;
      }
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Start navigation observer
  observeNavigation();
  
  // Export for debugging
  window.ElevateLI = {
    startAnalysis,
    getProfileId: getProfileIdFromUrl,
    OverlayManager,
    Analyzer: typeof Analyzer !== 'undefined' ? Analyzer : null
  };
  
})();