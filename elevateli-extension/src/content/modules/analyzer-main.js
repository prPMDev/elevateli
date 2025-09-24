/**
 * Main entry point for ElevateLI content script
 * Coordinates all modules and initializes the extension
 */

// Note: All dependencies are assumed to be available in global scope
// from previously loaded modules in the concatenated analyzer.js

// Wrap in IIFE to avoid global scope pollution
(function() {
  'use strict';
  
  // console.log(`${CONFIG.EXTENSION_NAME} content script loaded`);
  
  
  // Initialize the extension
  function init() {
    // console.log('[INFO] Initializing ElevateLI', { url: location.href });
    
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      // console.warn('[WARN] Extension context invalidated - old content script instance. This page was loaded before the extension was updated. Refresh the page to use the latest version.');
      return;
    }
    
    // Check if we're on a LinkedIn profile page
    if (!isProfilePage()) {
      // console.log('[INFO] Not a profile page, skipping initialization');
      return;
    }
    
    // Get profile ID from URL
    const profileId = getProfileIdFromUrl();
    if (!profileId) {
      // console.log('[WARN] Could not extract profile ID from URL');
      return;
    }
    
    // console.log('[INFO] Profile ID:', profileId);
    
    // Check if it's the user's own profile
    isOwnProfile().then(async isOwn => {
      // console.log('[INFO] Is own profile:', isOwn);
      
      // Get saved profile for validation
      let savedData = {};
      let savedProfileId = null;
      
      try {
        if (chrome.runtime?.id) {
          savedData = await chrome.storage.local.get(['userProfile', 'compliance']);
          savedProfileId = savedData.userProfile?.profileId;
        }
      } catch (error) {
        // Extension context might be invalid, continue without saved data
        console.log('[INFO] Could not access saved profile:', error.message);
      }
      
      const currentProfileId = profileId;
      
      // [CRITICAL_PATH:OVERLAY_INJECTION] - P0: Core UI visibility
      // The overlay MUST show on user's own profile, even in zero state
      
      // Check if we should inject overlay
      const shouldInjectOverlay = isOwn;
      
      // console.log('[INFO] Should inject overlay:', shouldInjectOverlay, {
      //   isOwn,
      //   savedProfileId,
      //   currentProfileId
      // });
      
      if (!shouldInjectOverlay) {
        try {
          SmartLogger.log('PROFILE', 'Overlay injection blocked - not own profile', {
            isOwn,
            savedProfileId,
            currentProfileId
          });
        } catch (e) {
          // Ignore logging errors
        }
        return;
      }
      
      // Check if user has accepted terms
      if (!chrome.runtime?.id) {
        // console.warn('[WARN] Extension context invalidated before checking compliance');
        return;
      }
      
      chrome.storage.local.get(['compliance', 'userProfile'], async (complianceData) => {
        // Check for runtime errors
        if (chrome.runtime.lastError) {
          // console.warn('[WARN] Failed to check compliance:', chrome.runtime.lastError);
          return;
        }
        
        // Double-check context is still valid after async callback
        if (!chrome.runtime?.id) {
          return;
        }
        
        // Always initialize overlay, but show zero state if not compliant
        if (!complianceData.compliance?.hasAcknowledged) {
          // console.log('[INFO] Terms not accepted - showing overlay in zero state');
          SmartLogger.log('UI.STATES', 'Terms not accepted - showing overlay in zero state');
          OverlayManager.hasCompliance = false;
          OverlayManager.initialize();
          
          // Wait for overlay to be ready before showing zero state
          // Check for overlay element to be available
          const checkOverlayReady = () => {
            if (OverlayManager.overlayElement && OverlayManager.showZeroState) {
              OverlayManager.showZeroState();
              // Mark overlay as initialized for phase tracking
              if (window.LinkedInAnalyzer) {
                window.LinkedInAnalyzer.markPhaseComplete('overlayInitialized');
              }
            } else {
              // Retry after a short interval if not ready
              requestAnimationFrame(checkOverlayReady);
            }
          };
          checkOverlayReady();
          return;
        }
        
        // Set compliance flag for OverlayManager
        OverlayManager.hasCompliance = true;
        
        // Initialize overlay normally
        OverlayManager.initialize();
        
        // IMPORTANT: Cache restoration now happens AUTOMATICALLY in OverlayManager.initialize()
        // The OverlayManager checks for cached data after the overlay is created and restores
        // it if available. This handles both zero states properly:
        // 1. No compliance - shows zero state with disabled analyze button
        // 2. Has compliance but no cache - shows zero state with enabled analyze button
        // 3. Has compliance and cache - restores cached data immediately
        const cacheProfileId = profileId;
        SmartLogger.log('CACHE', 'Overlay initialized, cache loads automatically', {
          currentProfile: cacheProfileId,
          savedProfile: complianceData.userProfile?.profileId
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
    // console.log('[INFO] Starting analysis', { forceRefresh });
    
    // Set analysis in progress
    analysisInProgress = true;
    analysisAborted = false;
    
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      // console.warn('[WARN] Extension context invalidated - cannot start analysis. Please refresh the page to reload the extension.');
      
      // Try to show a user-friendly message if overlay exists
      if (typeof OverlayManager !== 'undefined' && OverlayManager.overlayElement) {
        OverlayManager.setState(OverlayManager.states.ERROR, {
          message: 'Extension was updated. Please refresh the page to continue.'
        });
      }
      
      return;
    }
    
    // Check compliance before allowing analysis
    try {
      // First check if chrome.storage.local is available
      if (!chrome?.storage?.local?.get) {
        SmartLogger.warn('COMPLIANCE', 'Chrome storage API not available');
        // Treat as if compliance not acknowledged
        if (typeof OverlayManager !== 'undefined' && OverlayManager.overlayElement) {
          OverlayManager.setState(OverlayManager.states.ERROR, {
            message: 'Extension needs to be reloaded. Please refresh the page.'
          });
        }
        analysisInProgress = false;
        return;
      }
      
      const compliance = await new Promise((resolve) => {
        try {
          chrome.storage.local.get(['compliance'], (data) => {
            if (chrome.runtime.lastError) {
              console.warn('[WARN] Failed to get compliance:', chrome.runtime.lastError);
              resolve(null);
              return;
            }
            resolve(data.compliance);
          });
        } catch (err) {
          // Handle any synchronous errors in Promise executor
          console.warn('[WARN] Sync error in compliance check:', err);
          resolve(null);
        }
      });
      
      if (!compliance?.hasAcknowledged) {
        SmartLogger.log('COMPLIANCE', 'Analysis blocked - terms not accepted');
        
        // Show error in overlay
        if (typeof OverlayManager !== 'undefined' && OverlayManager.overlayElement) {
          OverlayManager.setState(OverlayManager.states.ERROR, {
            message: 'Please complete setup in the extension popup before analyzing.'
          });
          
          // Re-enable analyze buttons
          const analyzeBtn = OverlayManager.overlayElement.querySelector('.analyze-button');
          const collapsedBtn = OverlayManager.overlayElement.querySelector('.analyze-btn-collapsed');
          if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<span class="button-icon">📊</span>Analyze';
          }
          if (collapsedBtn) {
            collapsedBtn.disabled = false;
            collapsedBtn.textContent = 'Analyze';
          }
        }
        
        analysisInProgress = false;
        return;
      }
    } catch (error) {
      SmartLogger.error('COMPLIANCE', 'Failed to check compliance', error);
      
      // Show user-friendly error
      if (typeof OverlayManager !== 'undefined' && OverlayManager.overlayElement) {
        OverlayManager.setState(OverlayManager.states.ERROR, {
          message: 'Unable to verify settings. Please refresh the page and try again.'
        });
        
        // Re-enable analyze buttons
        const analyzeBtn = OverlayManager.overlayElement.querySelector('.analyze-button');
        const collapsedBtn = OverlayManager.overlayElement.querySelector('.analyze-btn-collapsed');
        if (analyzeBtn) {
          analyzeBtn.disabled = false;
          analyzeBtn.innerHTML = '<span class="button-icon">📊</span>Analyze';
        }
        if (collapsedBtn) {
          collapsedBtn.disabled = false;
          collapsedBtn.textContent = 'Analyze';
        }
      }
      
      analysisInProgress = false;
      return;
    }
    
    const profileId = getProfileIdFromUrl();
    if (!profileId) return;
    
    // CRITICAL: Always use current page's profile ID for cache operations
    const cacheProfileId = profileId; // Never use saved profile ID for cache
    
    const isOwn = await isOwnProfile();
    
    let settings = {};
    try {
      settings = await new Promise((resolve, reject) => {
        if (!chrome.runtime?.id) {
          resolve({});
          return;
        }
        chrome.storage.local.get(['enableAI', 'apiKey', 'encryptedApiKey', 'aiProvider', 'aiModel', 'targetRole', 'seniorityLevel'], (data) => {
          if (chrome.runtime.lastError) {
            // console.warn('[WARN] Failed to get settings:', chrome.runtime.lastError);
            resolve({});
          } else {
            // Double-check context is still valid
            if (!chrome.runtime?.id) {
              resolve({});
              return;
            }
            resolve(data);
          }
        });
      });
    } catch (error) {
      // console.warn('[WARN] Error getting settings:', error);
      settings = {};
    }
    
    // Log settings for debugging
    // console.log('[INFO] Settings loaded:', {
    //   enableAI: settings.enableAI,
    //   hasApiKey: !!(settings.apiKey || settings.encryptedApiKey),
    //   apiKeyType: settings.apiKey ? 'plain' : settings.encryptedApiKey ? 'encrypted' : 'none',
    //   aiProvider: settings.aiProvider,
    //   (removed cacheDuration - cache persists infinitely)
    // });
    
    // Create analyzer instance with consistent cache profile ID
    const analyzer = new Analyzer();
    await analyzer.init(cacheProfileId, isOwn, settings);
    
    // Run analysis
    const results = await analyzer.analyze(forceRefresh);
    
    if (results.success) {
      // console.log('[INFO] Analysis complete', results);
    } else {
      // console.error('[ERROR] Analysis failed', results.error);
    }
  }
  
  // Listen for messages from popup/background
  // Track if analysis is in progress
  let analysisInProgress = false;
  let analysisAborted = false;
  
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'ELEVATE_REFRESH') {
      // console.log('[INFO] Refresh requested via overlay');
      analysisAborted = false;
      startAnalysis(true);
    }
    
    if (event.data.type === 'ELEVATE_CANCEL_ANALYSIS') {
      // console.log('[INFO] Cancel analysis requested');
      analysisAborted = true;
      analysisInProgress = false;
    }
  });
  
  // Navigation observer for SPA navigation
  function observeNavigation() {
    let lastPath = location.pathname;
    
    const observer = new MutationObserver(debounce(async () => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        // console.log('[INFO] Navigation detected', { newPath: lastPath });
        
        // Clear any displayed data immediately
        if (OverlayManager.overlayElement) {
          try {
            OverlayManager.setState(OverlayManager.states.INITIALIZING);
          } catch (e) {
            // Ignore state change errors during navigation
          }
        }
        
        // Validate profile before reinitializing
        const newProfileId = getProfileIdFromUrl();
        let savedProfile = null;
        
        try {
          savedProfile = await getSavedProfile();
        } catch (e) {
          // Context might be invalid during navigation
        }
        
        // Check if this is the user's profile using ownership indicators
        const isOwn = await isOwnProfile();
        // console.log('[INFO] Navigation - checking ownership', { 
        //   newProfileId, 
        //   savedProfileId: savedProfile?.profileId,
        //   isOwn 
        // });
        
        if (!isOwn) {
          // Not user's profile - remove overlay
          try {
            SmartLogger.log('NAVIGATION', 'Not user profile - removing overlay', {
              profileId: newProfileId
            });
          } catch (e) {
            // Ignore logging errors
          }
          const existingOverlay = document.querySelector('.elevateli-overlay-wrapper');
          if (existingOverlay) {
            existingOverlay.remove();
          }
          return; // Don't reinitialize on other profiles
        }
        
        // User's profile - reinitialize if on profile page
        if (isProfilePage() && newProfileId && isOwn) {
          // Remove old overlay first
          const existingOverlay = document.querySelector('.elevateli-overlay-wrapper');
          if (existingOverlay) {
            existingOverlay.remove();
          }
          
          setTimeout(() => {
            try {
              init();
            } catch (error) {
              if (!error.message?.includes('Extension context invalidated')) {
                console.error('[ElevateLI] Navigation reinit error:', error);
              }
            }
          }, 500);
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
      // SECURITY: Validate message sender
      if (!sender || sender.id !== chrome.runtime.id) {
        console.warn('[SECURITY] Message rejected from unknown sender:', sender);
        return false;
      }
      
      // console.log('[INFO] Received message:', request.action, 'from verified sender');
      
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
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: 'Storage error' });
            return;
          }
          sendResponse({ 
            success: true, 
            data: data[`cache_${profileId}`] || null 
          });
        });
        return true;
      }
      
      if (request.action === 'profileUpdated') {
        // console.log('[INFO] Profile updated notification received');
        const currentProfileId = getProfileIdFromUrl();
        
        if (currentProfileId === request.userProfile.profileId) {
          // console.log('[INFO] Current page matches saved profile, initializing overlay');
          
          // Check if overlay already exists
          if (!document.querySelector('.elevateli-overlay-wrapper')) {
            // Re-run initialization
            init();
            sendResponse({ success: true, overlayInitialized: true });
          } else {
            // console.log('[INFO] Overlay already exists');
            sendResponse({ success: true, overlayExists: true });
          }
        } else {
          // console.log('[INFO] Current page does not match saved profile');
          sendResponse({ success: false, reason: 'Profile mismatch' });
        }
        return true;
      }
      
      // Handle showOverlay message from popup after successful setup
      if (request.action === 'triggerAnalysis') {
        // Handle cache clear - update overlay to show reset state
        SmartLogger.log('UI.INTERACTIONS', 'Received triggerAnalysis request - cache was cleared');
        
        // Show zero state UI with reset-appropriate text
        if (typeof OverlayManager !== 'undefined') {
          if (OverlayManager.showZeroState) {
            OverlayManager.showZeroState(true);
          }
          // Also show the analyze button
          if (OverlayManager.showActionButtons) {
            OverlayManager.showActionButtons({ 
              showAnalyze: true,
              showRefresh: false,
              showDetails: false 
            });
          }
        }
        
        sendResponse({ success: true });
        return true;
      }
      
      // Handle full extension reset
      if (request.action === 'resetToZeroState') {
        SmartLogger.log('UI.INTERACTIONS', 'Received resetToZeroState request - extension was reset');
        
        // Reset overlay to complete zero state
        if (typeof OverlayManager !== 'undefined') {
          // Clear compliance flag since storage was cleared
          OverlayManager.hasCompliance = false;
          
          // Set to INITIALIZING state - it will detect no compliance and show zero state
          if (OverlayManager.setState) {
            OverlayManager.setState(OverlayManager.states.INITIALIZING);
          }
        }
        
        sendResponse({ success: true });
        return true;
      }
      
      if (request.action === 'showOverlay') {
        SmartLogger.log('UI.INTERACTIONS', 'Received showOverlay request from popup');
        
        // Handle async ownership check
        isOwnProfile().then(isOwn => {
          try {
            if (!isOwn) {
              SmartLogger.log('UI.INTERACTIONS', 'Not user profile - blocking overlay show request');
              sendResponse({ 
                success: false, 
                error: 'Not your profile',
                message: 'ElevateLI overlay only appears on your own profile' 
              });
              return;
            }
            
            // Check if overlay already exists
            const existingOverlay = document.querySelector('.elevateli-overlay-wrapper');
          
          if (existingOverlay) {
            // Overlay exists, just ensure it's visible
            SmartLogger.log('UI.INTERACTIONS', 'Overlay already exists, ensuring visibility');
            existingOverlay.style.display = 'block';
            
            // Get compliance status and update OverlayManager
            chrome.storage.local.get(['compliance'], (compData) => {
              if (!chrome.runtime.lastError && compData.compliance?.hasAcknowledged) {
                OverlayManager.hasCompliance = true;
              }
            });
            
            if (typeof OverlayManager !== 'undefined' && OverlayManager.show) {
              OverlayManager.show();
              // NOTE: Cache restoration happens automatically when overlay is shown
              // Removed duplicate restoreAppropriateState() call that was causing race conditions
            }
            sendResponse({ success: true, action: 'shown' });
          } else {
            // No overlay, need to initialize
            SmartLogger.log('UI.INTERACTIONS', 'No overlay found, initializing');
            
            // Check if we're on the right page
            if (!isProfilePage()) {
              sendResponse({ success: false, error: 'Not on a profile page' });
              return true;
            }
            
            // Force refresh profile check and reinitialize
            chrome.storage.local.get(['userProfile', 'compliance'], async (data) => {
              if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: 'Storage error' });
                return;
              }
              
              // Double-check context is still valid
              if (!chrome.runtime?.id) {
                sendResponse({ success: false, error: 'Context invalid' });
                return;
              }
              
              // If we have both compliance and a saved profile, force reinitialization
              if (data.compliance?.hasAcknowledged && data.userProfile?.profileId) {
                const currentProfileId = getProfileIdFromUrl();
                
                // Check if current page matches saved profile
                if (currentProfileId === data.userProfile.profileId || window.location.href.includes('/in/me')) {
                  SmartLogger.log('UI.INTERACTIONS', 'Profile matches, forcing overlay initialization');
                  
                  // Update compliance flag before initialization
                  OverlayManager.hasCompliance = true;
                  
                  // Clear any existing "not your profile" state
                  if (typeof OverlayManager !== 'undefined' && OverlayManager.initialize) {
                    OverlayManager.initialize();
                    
                    // Wait for overlay to be created
                    setTimeout(() => {
                      const newOverlay = document.querySelector('.elevateli-overlay-wrapper');
                      if (newOverlay) {
                        newOverlay.style.display = 'block';
                        OverlayManager.show();
                        sendResponse({ success: true, action: 'initialized' });
                      } else {
                        // Try full reinitialization
                        try {
                          init();
                        } catch (error) {
                          if (!error.message?.includes('Extension context invalidated')) {
                            console.error('[ElevateLI] Reinit error:', error);
                          }
                        }
                        setTimeout(() => {
                          const retryOverlay = document.querySelector('.elevateli-overlay-wrapper');
                          if (retryOverlay) {
                            retryOverlay.style.display = 'block';
                            sendResponse({ success: true, action: 'initialized_retry' });
                          } else {
                            sendResponse({ success: false, error: 'Failed to create overlay' });
                          }
                        }, 1000);
                      }
                    }, 500);
                  } else {
                    // OverlayManager not available, try full init
                    try {
                      init();
                    } catch (error) {
                      if (!error.message?.includes('Extension context invalidated')) {
                        console.error('[ElevateLI] Full init error:', error);
                      }
                    }
                    setTimeout(() => {
                      const newOverlay = document.querySelector('.elevateli-overlay-wrapper');
                      if (newOverlay) {
                        sendResponse({ success: true, action: 'initialized_full' });
                      } else {
                        sendResponse({ success: false, error: 'Initialization failed' });
                      }
                    }, 1500);
                  }
                } else {
                  sendResponse({ success: false, error: 'Profile mismatch' });
                }
              } else {
                // Try standard initialization
                try {
                  init();
                } catch (error) {
                  if (!error.message?.includes('Extension context invalidated')) {
                    console.error('[ElevateLI] Standard init error:', error);
                  }
                }
                setTimeout(() => {
                  const newOverlay = document.querySelector('.elevateli-overlay-wrapper');
                  if (newOverlay) {
                    sendResponse({ success: true, action: 'initialized_standard' });
                  } else {
                    sendResponse({ success: false, error: 'Standard initialization failed' });
                  }
                }, 1500);
              }
            });
            
            return true; // Async response
          }
          } catch (error) {
            SmartLogger.error('UI.ERRORS', 'Error handling showOverlay request', error);
            sendResponse({ success: false, error: error.message });
          }
        }).catch(error => {
          SmartLogger.error('UI.ERRORS', 'Error checking profile ownership', error);
          sendResponse({ success: false, error: 'Failed to verify profile ownership' });
        });
        
        return true;
      }
      
      if (request.action === 'resetOverlay') {
        SmartLogger.log('UI.INTERACTIONS', 'Received resetOverlay request - factory reset');
        
        // Reset overlay to empty cache state
        if (typeof OverlayManager !== 'undefined' && OverlayManager.overlayElement) {
          // Clear compliance flag since storage was cleared
          OverlayManager.hasCompliance = false;
          
          // Reset to EMPTY_CACHE state - shows "No previous analysis found"
          OverlayManager.setState(OverlayManager.states.EMPTY_CACHE);
        }
        
        sendResponse({ success: true });
        return true;
      }
      
      if (request.action === 'saveProfile') {
        SmartLogger.log('UI.INTERACTIONS', 'Received saveProfile request from popup', { checkOnly: request.checkOnly });
        
        // Extract current profile information
        const profileId = getProfileIdFromUrl();
        const profileNameElement = document.querySelector('.text-heading-xlarge') || 
                                  document.querySelector('h1.text-heading-xlarge') ||
                                  document.querySelector('[class*="profile-name"]');
        const profileName = profileNameElement ? profileNameElement.textContent.trim() : profileId;
        
        // Check ownership indicators
        const hasOwnershipIndicators = OwnershipDetector.hasOwnershipIndicators();
        
        // Prepare profile data
        const userProfile = {
          profileId,
          profileName,
          profileUrl: window.location.href.split('?')[0],
          savedAt: Date.now(),
          verifiedOwnership: hasOwnershipIndicators
        };
        
        // If checkOnly flag is set, just return the info without saving
        if (request.checkOnly) {
          SmartLogger.log('UI.INTERACTIONS', 'Check-only mode: returning profile info without saving');
          sendResponse({ success: true, userProfile });
          return true;
        }
        
        // Otherwise, save profile data as before
        chrome.storage.local.set({ userProfile }, () => {
          if (chrome.runtime.lastError) {
            SmartLogger.log('UI.INTERACTIONS', 'Failed to save profile', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            SmartLogger.log('UI.INTERACTIONS', 'Profile saved successfully', userProfile);
            sendResponse({ success: true, userProfile });
          }
        });
        
        return true; // Keep channel open for async response
      }
      
      if (request.action === 'updateOverlayVisibility') {
        SmartLogger.log('UI.INTERACTIONS', 'Received updateOverlayVisibility request', { showAnalysis: request.showAnalysis });
        
        if (typeof OverlayManager !== 'undefined') {
          if (request.showAnalysis === false) {
            // Hide the overlay without destroying it
            OverlayManager.hide();
            SmartLogger.log('UI.INTERACTIONS', 'Overlay hidden due to settings change');
          } else {
            // Show the overlay if we're on own profile
            isOwnProfile().then(async isOwn => {
              if (isOwn) {
                // Check if overlay already exists
                if (OverlayManager.overlayElement) {
                  // Just show the existing overlay
                  OverlayManager.show();
                  SmartLogger.log('UI.INTERACTIONS', 'Overlay shown (existing) due to settings change');
                } else {
                  // Initialize with automatic state management
                  OverlayManager.initialize();
                  SmartLogger.log('UI.INTERACTIONS', 'Overlay initialized due to settings change');
                  
                  // NOTE: State restoration happens automatically during initialization
                  // Removed duplicate restoreAppropriateState() call that was causing race conditions
                }
              }
            });
          }
        }
        
        sendResponse({ success: true });
        return true;
      }
      
      if (request.action === 'updateComplianceState') {
        SmartLogger.log('UI.INTERACTIONS', 'Received updateComplianceState request', { hasCompliance: request.hasCompliance });
        
        if (typeof OverlayManager !== 'undefined') {
          // Update the compliance state in OverlayManager
          OverlayManager.hasCompliance = request.hasCompliance;
          
          // If the overlay exists and we have compliance, update the button states
          if (OverlayManager.overlayElement && request.hasCompliance) {
            // Update button states to be clickable
            const analyzeBtn = OverlayManager.overlayElement.querySelector('.analyze-button');
            const collapsedBtn = OverlayManager.overlayElement.querySelector('.analyze-btn-collapsed');
            
            if (analyzeBtn && !analyzeBtn.disabled) {
              SmartLogger.log('UI.INTERACTIONS', 'Analyze button already enabled in expanded view');
            }
            
            if (collapsedBtn && !collapsedBtn.disabled) {
              SmartLogger.log('UI.INTERACTIONS', 'Analyze button already enabled in collapsed view');
            }
            
            // The event listeners are already attached, just the compliance state needed updating
            SmartLogger.log('UI.INTERACTIONS', 'Compliance state updated, analyze buttons should now be clickable');
          }
        }
        
        sendResponse({ success: true });
        return true;
      }
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        init();
      } catch (error) {
        if (!error.message?.includes('Extension context invalidated')) {
          console.error('[ElevateLI] Initialization error:', error);
        }
      }
    });
  } else {
    try {
      init();
    } catch (error) {
      if (!error.message?.includes('Extension context invalidated')) {
        console.error('[ElevateLI] Initialization error:', error);
      }
    }
  }
  
  // Start navigation observer
  try {
    observeNavigation();
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[ElevateLI] Navigation observer error:', error);
    }
  }
  
  // Export for debugging
  window.ElevateLI = {
    startAnalysis,
    getProfileId: getProfileIdFromUrl,
    OverlayManager,
    Analyzer: typeof Analyzer !== 'undefined' ? Analyzer : null
  };
  
})();