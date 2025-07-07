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
  
  // Initialize the extension
  function init() {
    console.log('[INFO] Initializing ElevateLI', { url: location.href });
    
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
      chrome.storage.local.get(['compliance'], (complianceData) => {
        if (!complianceData.compliance?.hasAcknowledged) {
          console.log('[INFO] Terms not accepted - skipping overlay injection');
          return;
        }
        
        // Initialize overlay only after all checks pass
        OverlayManager.initialize();
        
        // Get settings and check cache
        chrome.storage.local.get(['enableAI', 'apiKey', 'aiProvider', 'cacheDuration'], async (settings) => {
          const enableAI = settings.enableAI && settings.apiKey && settings.aiProvider;
          
          // Check cache first
          const cacheManager = new CacheManager(settings.cacheDuration || 7);
          const cachedData = await cacheManager.get(profileId);
          
          if (cachedData && cachedData.completeness !== undefined) {
            console.log('[INFO] Found cached data', { 
              completeness: cachedData.completeness,
              contentScore: cachedData.contentScore,
              fromCache: true
            });
            
            // Show cached results
            OverlayManager.setState(OverlayManager.states.CACHE_LOADED, {
              completeness: cachedData.completeness,
              contentScore: cachedData.contentScore,
              completenessData: cachedData.completenessData,
              recommendations: cachedData.recommendations,
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
    
    const profileId = getProfileIdFromUrl();
    if (!profileId) return;
    
    const isOwn = await isOwnProfile();
    const settings = await new Promise(resolve => {
      chrome.storage.local.get(['enableAI', 'apiKey', 'aiProvider', 'cacheDuration'], resolve);
    });
    
    // Create analyzer instance
    const analyzer = new Analyzer();
    await analyzer.init(profileId, isOwn, settings);
    
    // Run analysis
    const results = await analyzer.analyze(forceRefresh);
    
    if (results.success) {
      console.log('[INFO] Analysis complete', results);
    } else {
      console.error('[ERROR] Analysis failed', results.error);
    }
  }
  
  // Listen for messages from popup/background
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'ELEVATE_REFRESH') {
      console.log('[INFO] Refresh requested via overlay');
      startAnalysis(true);
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