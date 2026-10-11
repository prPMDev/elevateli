/**
 * Main entry point for ElevateLI content script
 * Coordinates all modules and initializes the extension
 */


// from previously loaded modules in the concatenated analyzer.js

// Wrap in IIFE to avoid global scope pollution
(function() {
  'use strict';
  
  
  
  // Initialize the extension
  function init() {
    
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      return;
    }
    
    // Check if we're on a LinkedIn profile page
    if (!isProfilePage()) {
      return;
    }
    
    // Get profile ID from URL
    const profileId = getProfileIdFromUrl();
    if (!profileId) {
      return;
    }
    
    
    // Check if it's the user's own profile
    isOwnProfile().then(async isOwn => {
      
      
      // [CRITICAL_PATH:OVERLAY_INJECTION] - P0: Core UI visibility
      // The overlay MUST show on user's own profile, even in zero state
      
      // Check if we should inject overlay
      const shouldInjectOverlay = isOwn;
      
      
      if (!shouldInjectOverlay) {
        return;
      }
      
      // Check if user has accepted terms
      if (!chrome.runtime?.id) {
        return;
      }
      
      chrome.storage.local.get(['compliance', 'userProfile'], async (complianceData) => {
        // Check for runtime errors
        if (chrome.runtime.lastError) {
          return;
        }
        
        // Double-check context is still valid after async callback
        if (!chrome.runtime?.id) {
          return;
        }
        
        // Always initialize overlay, but show zero state if not compliant
        if (!complianceData.compliance?.hasAcknowledged) {
          OverlayManager.hasCompliance = false;
          OverlayManager.initialize();
          
          // Wait for overlay to be ready before showing zero state
          // Check for overlay element to be available
          const checkOverlayReady = () => {
            if (OverlayManager.overlayElement && OverlayManager.showZeroState) {
              OverlayManager.showZeroState();
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
    
    // Set analysis in progress
    analysisInProgress = true;
    analysisAborted = false;
    
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      
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
              resolve(null);
              return;
            }
            resolve(data.compliance);
          });
        } catch (err) {
          // Handle any synchronous errors in Promise executor
          resolve(null);
        }
      });
      
      if (!compliance?.hasAcknowledged) {
        
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
            (() => {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.textContent = '📊';
            const textNode = document.createTextNode('Analyze');
            analyzeBtn.replaceChildren(iconSpan, textNode);
          })();
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
      console.error('COMPLIANCE', 'Failed to check compliance', error);
      
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
          (() => {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.textContent = '📊';
            const textNode = document.createTextNode('Analyze');
            analyzeBtn.replaceChildren(iconSpan, textNode);
          })();
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
      settings = {};
    }
    
    
    // Create analyzer instance with consistent cache profile ID
    const analyzer = new Analyzer();
    await analyzer.init(cacheProfileId, isOwn, settings);
    
    // Run analysis
    await analyzer.analyze(forceRefresh);
    
  }
  
  // Listen for messages from popup/background
  // Track if analysis is in progress
  let analysisInProgress = false;
  let analysisAborted = false;
  
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'ELEVATE_REFRESH') {
      analysisAborted = false;
      startAnalysis(true);
    }
    
    if (event.data.type === 'ELEVATE_CANCEL_ANALYSIS') {
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
        
        if (!isOwn) {
          // Not user's profile - remove overlay
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
        return false;
      }
      
      
      if (request.action === 'ping') {
        sendResponse({ success: true, alive: true });
        return true;
      }
      
      // Handle showOverlay message from popup after successful setup
      if (request.action === 'triggerAnalysis') {
        // Handle cache clear - update overlay to show reset state
        
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
        
        // Handle async ownership check
        isOwnProfile().then(isOwn => {
          try {
            if (!isOwn) {
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
            existingOverlay.style.display = 'block';
            
            // Get compliance status and update OverlayManager
            chrome.storage.local.get(['compliance'], (compData) => {
              if (!chrome.runtime.lastError && compData.compliance?.hasAcknowledged) {
                OverlayManager.hasCompliance = true;
              }
            });
            
            if (typeof OverlayManager !== 'undefined' && OverlayManager.show) {
              OverlayManager.show();
              
              // Removed duplicate restoreAppropriateState() call that was causing race conditions
            }
            sendResponse({ success: true, action: 'shown' });
          } else {
            // No overlay, need to initialize
            
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
            console.error('UI.ERRORS', 'Error handling showOverlay request', error);
            sendResponse({ success: false, error: error.message });
          }
        }).catch(error => {
          console.error('UI.ERRORS', 'Error checking profile ownership', error);
          sendResponse({ success: false, error: 'Failed to verify profile ownership' });
        });
        
        return true;
      }
      
      if (request.action === 'saveProfile') {
        
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
          sendResponse({ success: true, userProfile });
          return true;
        }
        
        // Otherwise, save profile data as before
        chrome.storage.local.set({ userProfile }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, userProfile });
          }
        });
        
        return true; // Keep channel open for async response
      }
      
      if (request.action === 'updateOverlayVisibility') {
        
        if (typeof OverlayManager !== 'undefined') {
          if (request.showAnalysis === false) {
            // Hide the overlay without destroying it
            OverlayManager.hide();
          } else {
            // Show the overlay if we're on own profile
            isOwnProfile().then(async isOwn => {
              if (isOwn) {
                // Check if overlay already exists
                if (OverlayManager.overlayElement) {
                  // Just show the existing overlay
                  OverlayManager.show();
                } else {
                  // Initialize with automatic state management
                  OverlayManager.initialize();
                  
                  
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
        
        if (typeof OverlayManager !== 'undefined') {
          // Update the compliance state in OverlayManager
          OverlayManager.hasCompliance = request.hasCompliance;
          
          // If the overlay exists and we have compliance, update the button states
          if (OverlayManager.overlayElement && request.hasCompliance) {
            // Update button states to be clickable
            
            
            
            // The event listeners are already attached, just the compliance state needed updating
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
      }
    });
  } else {
    try {
      init();
    } catch (error) {
    }
  }
  
  // Start navigation observer
  try {
    observeNavigation();
  } catch (error) {
  }
  
  // Export for debugging
  window.ElevateLI = {
    startAnalysis,
    getProfileId: getProfileIdFromUrl,
    OverlayManager,
    Analyzer: typeof Analyzer !== 'undefined' ? Analyzer : null
  };
  
})();