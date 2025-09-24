/**
 * Overlay Manager Module for ElevateLI
 * Handles progressive UI states and smooth transitions
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

// Debug logging system for Mac testing
window.elevateliDebug = {
  logs: [],
  enabled: false,
  
  init() {
    // Enable debug mode if URL contains debug=true
    this.enabled = window.location.href.includes('debug=true');
    if (this.enabled) {
      console.log('[ElevateLI Debug] Debug mode enabled');
    }
  },
  
  addLog(component, message, data = {}) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      component,
      message,
      data,
      platform: navigator.platform,
      userAgent: navigator.userAgent
    };
    
    this.logs.push(logEntry);
    console.log(`[${component}]`, message, data);
  },
  
  getLogs() {
    return JSON.stringify(this.logs, null, 2);
  },
  
  clearLogs() {
    this.logs = [];
  }
};

// Initialize debug system
window.elevateliDebug.init();

const OverlayManager = {
  // UI States
  states: {
    INITIALIZING: 'initializing',
    EMPTY_CACHE: 'empty_cache',
    SCANNING: 'scanning',
    EXTRACTING: 'extracting',
    CALCULATING: 'calculating',
    ANALYZING: 'analyzing',
    AI_ANALYZING: 'ai_analyzing',
    AI_RETRYING: 'ai_retrying',
    COMPLETE: 'complete',
    ERROR: 'error',
    ANALYSIS_FAILED_CACHE_FALLBACK: 'analysis_failed_cache_fallback'
  },
  
  // Current state tracking
  currentState: null,
  overlayElement: null,
  viewState: 'collapsed', // Always start in collapsed view
  currentData: null, // Store the full analysis data for reference
  isRestoringState: false, // Track restoration to prevent duplicates
  lastRestoredProfile: null, // Track last restored profile to avoid redundant restoration
  
  /**
   * Get color class based on score value
   * @param {number} score - The score value
   * @param {boolean} isQuality - Whether this is a quality score (0-10) or completeness (0-100)
   * @returns {string} CSS class name
   */
  getScoreClass(score, isQuality = false) {
    if (isQuality) {
      if (score >= 8.5) return 'score-excellent';
      if (score >= 7) return 'score-good';
      if (score >= 5) return 'score-moderate';
      return 'score-poor';
    } else {
      // Completeness percentage
      if (score >= 90) return 'score-excellent';
      if (score >= 70) return 'score-good';
      if (score >= 50) return 'score-moderate';
      return 'score-poor';
    }
  },

  /**
   * Initialize overlay and show immediately
   * @returns {OverlayManager} Self for chaining
   */
  async initialize() {
    SmartLogger.log('UI.STATES', 'Initializing overlay');
    
    // Check if extension context is still valid
    try {
      if (!chrome?.runtime?.id) {
        SmartLogger.log('UI.STATES', 'Extension context invalid, skipping initialization');
        return this;
      }
    } catch (e) {
      SmartLogger.log('UI.STATES', 'Extension context check failed, skipping initialization');
      return this;
    }
    
    // Check if user wants to show analysis and compliance
    try {
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get(['showAnalysis', 'compliance'], (data) => {
          if (chrome.runtime.lastError) {
            SmartLogger.log('UI.STATES', 'Chrome storage error:', chrome.runtime.lastError.message);
            resolve({});
            return;
          }
          resolve(data);
        });
      });
      
      if (settings.showAnalysis === false) {
        SmartLogger.log('UI.STATES', 'Show analysis is disabled, skipping initialization');
        return this;
      }
      
      // Store compliance status for button state management
      this.hasCompliance = settings.compliance?.hasAcknowledged || false;
    } catch (error) {
      // Continue with initialization on error
      SmartLogger.log('UI.STATES', 'Error checking settings:', error);
      this.hasCompliance = false;
    }
    
    this.setState(this.states.INITIALIZING);
    
    // Always start in collapsed view
    this.viewState = 'collapsed';
    
    // Try to inject immediately
    this.createAndInject();
    
    // If injection failed, retry with delays
    if (!this.overlayElement) {
      SmartLogger.log('UI.ERRORS', 'Initial injection failed, scheduling retries');
      
      // Retry after DOM settles
      setTimeout(() => {
        if (!this.overlayElement) {
          SmartLogger.log('UI.STATES', 'Retrying injection (attempt 2)');
          this.createAndInject();
        }
      }, 1000);
      
      // Final retry after LinkedIn finishes loading
      setTimeout(() => {
        if (!this.overlayElement) {
          SmartLogger.log('UI.STATES', 'Final injection attempt (attempt 3)');
          this.createAndInject();
        }
      }, 3000);
    }
    
    // CRITICAL: Restore cached data automatically after overlay is created
    // This ensures returning users see their previous analysis immediately
    // We need to handle two cases:
    // 1. No compliance - show zero state with disabled analyze button
    // 2. Has compliance but no cache - show zero state with enabled analyze button
    // 3. Has compliance and cache - restore cached data
    if (this.overlayElement) {
      if (this.hasCompliance) {
        SmartLogger.log('UI.STATES', 'User has compliance, checking for cached data on initialization');
        // Use setTimeout to ensure DOM is fully ready
        setTimeout(async () => {
          // Check if we already have scores displayed (from popup-triggered analysis)
          const hasScores = this.overlayElement?.querySelector('.completeness-score')?.textContent;
          if (hasScores && hasScores !== '0' && hasScores !== '') {
            SmartLogger.log('UI.STATES', 'Scores already displayed, skipping restoration on init');
            return;
          }
          // This will check for cache and either restore it or show EMPTY_CACHE state
          await this.restoreAppropriateState();
        }, 100);
      } else {
        SmartLogger.log('UI.STATES', 'No compliance yet, showing zero state with disabled analyze button');
        // The INITIALIZING state handler will show zero state for no compliance
        // No need to call restoreAppropriateState
      }
    }
    
    return this;
  },
  
  
  /**
   * Create overlay HTML with skeleton UI
   * @param {boolean} hidden - Whether to create the overlay in hidden state
   */
  createAndInject(hidden = false) {
    // Create wrapper for proper integration
    const wrapperHtml = `
      <style>
        /* Ensure overlay takes full width and doesn't go to sidebar */
        .elevateli-overlay-wrapper {
          width: 100% !important;
          max-width: none !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          display: block !important;
          position: relative !important;
          clear: both !important;
        }
        
        /* LinkedIn card appearance without their layout rules */
        .elevateli-card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 2px 3px rgba(0,0,0,.04);
          margin-top: 16px;
          margin-bottom: 16px;
          padding: 0;
          overflow: hidden;
        }
        
        /* Zero state responsive layout with fallbacks */
        .elevateli-overlay .zero-state-tiles {
          /* Flexbox fallback for older browsers */
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 16px;
          
          /* Modern grid layout */
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          max-width: 800px;
          margin: 0 auto 24px;
        }
        
        /* Flexbox fallback styling */
        @supports not (display: grid) {
          .elevateli-overlay .zero-state-tiles > div {
            flex: 0 1 calc(33.333% - 16px);
            min-width: 200px;
          }
        }
        
        /* Responsive breakpoints */
        @media (max-width: 768px) {
          .elevateli-overlay .zero-state-tiles {
            grid-template-columns: repeat(2, 1fr);
          }
          
          /* Center the third tile */
          .elevateli-overlay .zero-state-tiles > div:nth-child(3) {
            grid-column: 1 / -1;
            max-width: 300px;
            margin: 0 auto;
          }
          
          /* Flexbox fallback for tablet */
          @supports not (display: grid) {
            .elevateli-overlay .zero-state-tiles > div {
              flex: 0 1 calc(50% - 16px);
            }
            .elevateli-overlay .zero-state-tiles > div:nth-child(3) {
              flex: 0 1 100%;
              max-width: 300px;
            }
          }
        }
        
        @media (max-width: 480px) {
          .elevateli-overlay .zero-state-tiles {
            grid-template-columns: 1fr;
          }
          
          .elevateli-overlay .zero-state-tiles > div:nth-child(3) {
            grid-column: auto;
            max-width: none;
            margin: 0;
          }
          
          /* Flexbox fallback for mobile */
          @supports not (display: grid) {
            .elevateli-overlay .zero-state-tiles > div {
              flex: 0 1 100%;
            }
          }
        }
        
        /* Container query support for more accurate responsiveness */
        @supports (container-type: inline-size) {
          .elevateli-overlay-wrapper {
            container-type: inline-size;
          }
          
          @container (max-width: 700px) {
            .elevateli-overlay .zero-state-tiles {
              grid-template-columns: repeat(2, 1fr);
            }
            .elevateli-overlay .zero-state-tiles > div:nth-child(3) {
              grid-column: 1 / -1;
              max-width: 300px;
              margin: 0 auto;
            }
          }
          
          @container (max-width: 450px) {
            .elevateli-overlay .zero-state-tiles {
              grid-template-columns: 1fr;
            }
            .elevateli-overlay .zero-state-tiles > div:nth-child(3) {
              grid-column: auto;
              max-width: none;
              margin: 0;
            }
          }
        }
      </style>
      <div class="elevateli-overlay-wrapper elevateli-card" ${hidden ? 'style="display: none;"' : ''}>
        <div id="elevateli-overlay" class="elevateli-overlay unified-ui" data-state="${this.currentState}" data-view-state="${this.viewState}">
          <!-- Collapsed view (new default) -->
          <div class="overlay-collapsed-view">
            <img src="${chrome?.runtime?.id ? chrome.runtime.getURL('src/images/icon.png') : ''}" class="brand-logo" alt="ElevateLI" />
            <span class="brand-name">ElevateLI</span>
            <span class="score-badge completeness"><span class="label-full">Completeness</span><span class="label-short">Complete</span>: --</span>
            <span class="score-badge quality"><span class="label-full">Content Quality</span><span class="label-short">Quality</span>: --</span>
            <div class="spacer"></div>
            <span class="last-analyzed-collapsed"></span>
            <button class="analyze-btn-collapsed">Analyze</button>
            <a href="#" class="view-details-link">
              <span class="details-text-full">View details</span>
              <span class="details-text-medium">Details</span>
              <span class="details-icon">▼</span>
            </a>
          </div>
          
          <!-- Expanded view -->
          <div class="overlay-expanded-view">
          <!-- Header removed - branding already in collapsed bar -->
        
        <div class="scores-container">
          <div class="score-block completeness">
            <label>Profile Completeness</label>
            <div class="score-display">
              <span class="score-value skeleton">--</span>
              <span class="score-suffix">%</span>
            </div>
            <div class="score-bar">
              <div class="score-bar-fill skeleton" style="width: 0%"></div>
            </div>
          </div>
          
          <div class="score-block quality">
            <label>Content Quality (AI)</label>
            <div class="score-display">
              <span class="score-value skeleton">--</span>
              <span class="score-suffix"></span>
            </div>
            <div class="score-bar">
              <div class="score-bar-fill skeleton" style="width: 0%"></div>
            </div>
            <div class="ai-status"></div>
          </div>
        </div>
        
        <div class="status-indicator">
          <span class="status-icon"></span>
          <span class="status-text">Initializing...</span>
        </div>
        
        <div class="scan-progress hidden">
          <h4>Scanning Profile Sections</h4>
          <div class="scan-items"></div>
        </div>
        
        <div class="missing-items-section hidden">
          <h4>To Reach 100% Completeness</h4>
          <div class="missing-items-list"></div>
        </div>
        
        <div class="recommendations-section hidden">
          <h4>Top Recommendations</h4>
          <ul class="recommendations-list"></ul>
        </div>
        
        <div class="insights-section hidden">
          <h4>Key Insights</h4>
          <div class="insights-content"></div>
        </div>
        
        <div class="overlay-actions">
          <button class="action-button analyze-button hidden">
            <span class="button-icon">🚀</span>
            Analyze Profile
          </button>
          <button class="action-button refresh-button hidden">
            <span class="button-icon">🔄</span>
            Refresh
          </button>
          <button class="action-button details-button hidden">
            <span class="button-icon">📊</span>
            View Details
          </button>
        </div>
        </div><!-- Close expanded view -->
      </div>
      </div><!-- Close wrapper -->
    `;
    
    // Remove any existing overlay wrapper
    const existingWrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (existingWrapper) existingWrapper.remove();
    
    // Find the right place to inject
    let injected = false;
    
    // Log available elements for debugging
    Logger.debug('[OverlayManager] Looking for injection points...', {
      profileCard: !!document.querySelector('section.artdeco-card[data-member-id]'),
      profileSection: !!document.querySelector('.pv-top-card'),
      aboutSection: !!document.querySelector('#about'),
      mainContent: !!document.querySelector('main'),
      scaffoldMain: !!document.querySelector('.scaffold-layout__main'),
      profileWrapper: !!document.querySelector('[data-generated-suggestion-target]'),
      profileMain: !!document.querySelector('.profile-detail'),
      bodyContainer: !!document.querySelector('.body-container'),
      applicationBody: !!document.querySelector('.application-outlet'),
      profileContentMain: !!document.querySelector('.pv-oc'),
      profileViewContainer: !!document.querySelector('[data-view-name="profile-view"]')
    });
    
    // Strategy 0: Look for main profile content container first
    const profileMainContent = document.querySelector('.pv-oc') || 
                              document.querySelector('[data-view-name="profile-view"]') ||
                              document.querySelector('.profile-detail');
    
    if (profileMainContent && !injected) {
      const topCard = profileMainContent.querySelector('.pv-top-card');
      if (topCard) {
        Logger.info('[OverlayManager] Injecting after top card in main profile content');
        topCard.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 1: After the profile top card (most common location)
    const topCard = document.querySelector('.pv-top-card');
    if (topCard) {
      // Check if parent is the main content area, not a sidebar
      const parent = topCard.parentElement;
      const isMainContent = parent && !parent.classList.contains('scaffold-layout__sidebar') && 
                           !parent.closest('.scaffold-layout__sidebar') &&
                           !parent.classList.contains('pv-profile-sticky-header-v2__container');
      
      if (isMainContent) {
        Logger.info('[OverlayManager] Injecting after profile top card', {
          parentClasses: parent.className,
          parentId: parent.id,
          parentTag: parent.tagName
        });
        topCard.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      } else {
        Logger.warn('[OverlayManager] Top card found but parent appears to be sidebar or header');
      }
    }
    
    // Strategy 2: After the profile photo/intro section
    if (!injected) {
      const profileSection = document.querySelector('section.artdeco-card.pv-top-card-profile-picture');
      if (profileSection) {
        Logger.info('[OverlayManager] Injecting after profile intro section');
        profileSection.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 3: After any section with class pv-profile-card
    if (!injected) {
      const profileCards = document.querySelectorAll('section.pv-profile-card');
      if (profileCards.length > 0) {
        Logger.info('[OverlayManager] Injecting after first profile card');
        profileCards[0].insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 4: After About section (if exists)
    if (!injected) {
      const aboutSection = document.querySelector('section#about, div#about');
      if (aboutSection && aboutSection.parentElement) {
        Logger.info('[OverlayManager] Injecting after About section');
        aboutSection.parentElement.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 5: Any artdeco-card (very generic fallback)
    if (!injected) {
      const anyCard = document.querySelector('section.artdeco-card');
      if (anyCard) {
        Logger.info('[OverlayManager] Injecting after first artdeco card (generic fallback)');
        anyCard.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 6: Look for profile wrapper with data attributes
    if (!injected) {
      const profileWrapper = document.querySelector('[data-generated-suggestion-target]');
      if (profileWrapper) {
        Logger.info('[OverlayManager] Injecting after profile wrapper');
        profileWrapper.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 7: Look for any element with class containing "profile"
    if (!injected) {
      const profileElements = Array.from(document.querySelectorAll('[class*="profile"]')).filter(el => 
        el.tagName === 'SECTION' || el.tagName === 'DIV'
      );
      if (profileElements.length > 0) {
        Logger.info('[OverlayManager] Injecting after first profile element');
        profileElements[0].insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 8: Inside main content area (safer injection)
    if (!injected) {
      // Look for main content area, avoiding sidebars
      const mainContent = document.querySelector('main.scaffold-layout__main, main[role="main"], .scaffold-layout__inner');
      if (mainContent) {
        // Try to find the profile content specifically
        const profileContent = mainContent.querySelector('.profile-detail, .pv-profile-body-container, [data-view-name="profile-view"]');
        
        if (profileContent) {
          // Find the first section/card in profile content
          const firstSection = profileContent.querySelector('section, .artdeco-card');
          if (firstSection) {
            Logger.info('[OverlayManager] Injecting after first profile section in main content');
            firstSection.insertAdjacentHTML('afterend', wrapperHtml);
            injected = true;
          } else {
            // Instead of afterbegin, find first child and inject after it
            const firstChild = profileContent.querySelector('*');
            if (firstChild) {
              Logger.info('[OverlayManager] Injecting after first child of profile content');
              firstChild.insertAdjacentHTML('afterend', wrapperHtml);
              injected = true;
            } else {
              Logger.warn('[OverlayManager] Profile content found but no suitable injection point');
            }
          }
        } else {
          // Instead of injecting at beginning of main, find first substantial child
          const firstMainChild = mainContent.querySelector('section, article, div.artdeco-card, div[class*="profile"]');
          if (firstMainChild) {
            Logger.info('[OverlayManager] Injecting after first substantial child in main content');
            firstMainChild.insertAdjacentHTML('afterend', wrapperHtml);
            injected = true;
          } else {
            Logger.warn('[OverlayManager] Main content found but no suitable injection point - skipping');
          }
        }
      }
    }
    
    // Strategy 9: Delayed injection - wait for DOM to fully load
    if (!injected) {
      Logger.warn('[OverlayManager] No immediate injection point found, trying delayed injection...');
      setTimeout(() => {
        const delayedTopCard = document.querySelector('.pv-top-card, .profile-detail, section[data-member-id]');
        if (delayedTopCard && delayedTopCard.parentElement) {
          Logger.info('[OverlayManager] Delayed injection successful');
          delayedTopCard.parentElement.insertAdjacentHTML('afterend', wrapperHtml);
          this.overlayElement = document.getElementById('elevateli-overlay');
          if (this.overlayElement) {
            this.attachEventListeners();
            // Add unified UI class
            this.overlayElement.classList.add('unified-ui');
            this.overlayElement.setAttribute('data-view-state', this.viewState);
          }
        } else {
          Logger.error('[OverlayManager] Delayed injection also failed');
        }
      }, 2000);
      return; // Exit early and let delayed injection handle it
    }
    
    if (!injected) {
      Logger.error('[OverlayManager] Failed to inject overlay - no suitable location found', {
        url: window.location.href,
        hasMain: !!document.querySelector('main'),
        hasBody: !!document.body,
        bodyChildren: document.body.children.length,
        allSections: document.querySelectorAll('section').length,
        allArtdecoCards: document.querySelectorAll('.artdeco-card').length
      });
      return;
    }
    
    this.overlayElement = document.getElementById('elevateli-overlay');
    
    // Attach event listeners
    this.attachEventListeners();
    
    SmartLogger.log('UI.RENDERING', 'Overlay injected into DOM');
  },
  
  /**
   * Attach event listeners to overlay elements
   */
  attachEventListeners() {
    // Analyze button (for first-time analysis)
    const analyzeBtn = this.overlayElement.querySelector('.analyze-button');
    if (analyzeBtn) {
      if (!this.hasCompliance) {
        analyzeBtn.disabled = true;
        analyzeBtn.title = 'Please complete setup in extension popup first';
      } else {
        analyzeBtn.addEventListener('click', () => this.handleAnalyze());
      }
    }
    
    // Refresh button (for re-analysis)
    const refreshBtn = this.overlayElement.querySelector('.refresh-button');
    if (refreshBtn) {
      if (!this.hasCompliance) {
        refreshBtn.disabled = true;
        refreshBtn.title = 'Please complete setup in extension popup first';
      } else {
        refreshBtn.addEventListener('click', () => this.handleRefresh());
      }
    }
    
    // Details button
    const detailsBtn = this.overlayElement.querySelector('.details-button');
    detailsBtn?.addEventListener('click', () => this.handleViewDetails());
    
    // Analyze button (collapsed view) - always attach listener
    const analyzeBtnCollapsed = this.overlayElement.querySelector('.analyze-btn-collapsed');
    if (analyzeBtnCollapsed) {
      // Always add the event listener
      analyzeBtnCollapsed.addEventListener('click', () => this.handleAnalyze());
      
      // Set initial disabled state based on compliance
      analyzeBtnCollapsed.disabled = !this.hasCompliance;
      if (!this.hasCompliance) {
        analyzeBtnCollapsed.title = 'Please complete setup in extension popup first';
      }
    }
    
    // View details link (collapsed view)
    const viewDetailsLink = this.overlayElement.querySelector('.view-details-link');
    viewDetailsLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleView();
    });
  },
  
  /**
   * Update overlay state and UI
   * @param {string} newState - New state from states enum
   * @param {Object} data - Data for the new state
   */
  setState(newState, data = {}) {
    // Add null/undefined check for newState
    if (!newState) {
      SmartLogger.error('UI.STATES', 'setState called with null/undefined state', {
        providedState: newState,
        currentState: this.currentState,
        stackTrace: new Error().stack
      });
      // Default to EMPTY_CACHE if no state provided
      newState = this.states.EMPTY_CACHE;
    }
    
    // Validate that the state exists in our defined states
    const validStates = Object.values(this.states);
    if (!validStates.includes(newState)) {
      SmartLogger.error('UI.STATES', 'setState called with invalid state', {
        providedState: newState,
        validStates: validStates,
        currentState: this.currentState
      });
      // Default to EMPTY_CACHE for invalid states
      newState = this.states.EMPTY_CACHE;
    }
    
    SmartLogger.log('UI.STATES', 'State change', {
      from: this.currentState,
      to: newState,
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : [],
      completeness: data?.completeness,
      contentScore: data?.contentScore,
      hasRecommendations: !!data?.recommendations,
      recommendationType: data?.recommendations ? typeof data.recommendations : 'undefined'
    });
    this.currentState = newState;
    
    if (!this.overlayElement) return;
    
    this.overlayElement.setAttribute('data-state', newState);
    
    // State-specific updates
    const stateHandlers = {
      [this.states.INITIALIZING]: () => {
        // Check if we have compliance - if not, show zero state
        if (!this.hasCompliance) {
          this.clearEmptyStateMessage();
          this.hideStatusIndicator();
          this.hideSkeletons();
          this.showZeroState();
          // Don't show analyze button until setup is complete
          this.showActionButtons({ 
            showAnalyze: false,
            showRefresh: false,
            showDetails: false 
          });
        } else {
          this.updateStatus('Initializing analysis...', '⣾');
          this.showSkeletons();
          // Show analyze button for first-time analysis
          this.showActionButtons({ showAnalyze: true, showDetails: false });
        }
      },
      
      [this.states.EMPTY_CACHE]: () => {
        this.updateStatus('No previous analysis found', 'ℹ️');
        this.hideSkeletons();
        
        // Clear score values and stars
        const completenessValue = this.overlayElement.querySelector('.completeness .score-value');
        const qualityValue = this.overlayElement.querySelector('.quality .score-value');
        const qualitySuffix = this.overlayElement.querySelector('.quality .score-suffix');
        
        if (completenessValue) {
          completenessValue.textContent = '--';
          completenessValue.classList.add('skeleton');
        }
        if (qualityValue) {
          qualityValue.textContent = '--';
          qualityValue.classList.add('skeleton');
        }
        if (qualitySuffix) {
          qualitySuffix.textContent = '';
        }
        
        // Reset progress bars
        const completenessBar = this.overlayElement.querySelector('.completeness .score-bar-fill');
        const qualityBar = this.overlayElement.querySelector('.quality .score-bar-fill');
        if (completenessBar) {
          completenessBar.style.width = '0%';
          completenessBar.classList.add('skeleton');
        }
        if (qualityBar) {
          qualityBar.style.width = '0%';
          qualityBar.classList.add('skeleton');
        }
        
        // Clear collapsed view badges
        const completenessBadge = this.overlayElement.querySelector('.score-badge.completeness');
        const qualityBadge = this.overlayElement.querySelector('.score-badge.quality');
        const timestampBadge = this.overlayElement.querySelector('.last-analyzed-collapsed');
        
        if (completenessBadge) {
          completenessBadge.innerHTML = '<span class="label-full">Completeness</span><span class="label-short">Complete</span>: --';
          completenessBadge.classList.remove('high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
        }
        if (qualityBadge) {
          qualityBadge.innerHTML = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: --';
          qualityBadge.classList.remove('ai-disabled', 'high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
        }
        if (timestampBadge) {
          timestampBadge.textContent = '';
          timestampBadge.style.color = '';
        }
        
        // Reset collapsed analyze button text
        const collapsedAnalyzeBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
        if (collapsedAnalyzeBtn) {
          collapsedAnalyzeBtn.textContent = 'Analyze';
        }
        
        // Show welcome message in unified section
        this.showZeroState();
        
        // Show prominent analyze button
        this.showActionButtons({ 
          showAnalyze: true,
          showRefresh: false,
          showDetails: false 
        });
      },
      
      [this.states.SCANNING]: () => {
        this.clearEmptyStateMessage();
        this.updateStatus('Scanning profile sections...', '⏳');
        this.showScanProgress();
        this.startElapsedTimeDisplay();
        
        // Clear recommendations when starting new analysis
        const recommendationsList = this.overlayElement.querySelector('.recommendations-list');
        if (recommendationsList) {
          // Clear recommendations list safely
          while (recommendationsList.firstChild) {
            recommendationsList.removeChild(recommendationsList.firstChild);
          }
        }
        
        // Hide recommendations section during analysis
        const recommendationsSection = this.overlayElement.querySelector('.recommendations-section');
        if (recommendationsSection) {
          recommendationsSection.classList.add('hidden');
        }
        
        // Also clear unified section
        const unifiedSection = this.overlayElement.querySelector('.unified-section');
        if (unifiedSection) {
          // Clear unified section safely
          while (unifiedSection.firstChild) {
            unifiedSection.removeChild(unifiedSection.firstChild);
          }
          // Keep the section visible but empty during analysis
          unifiedSection.classList.remove('hidden');
        }
      },
      
      [this.states.EXTRACTING]: () => {
        this.updateStatus('Extracting profile data...', '⏳');
        this.hideScanProgress();
        this.showProgressBar('extracting');
      },
      
      [this.states.CALCULATING]: () => {
        this.updateStatus('Calculating completeness...', '⏳');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
      },
      
      [this.states.ANALYZING]: () => {
        this.updateStatus('Running AI analysis...', '⏳');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        this.showProgressBar('analyzing');
      },
      
      [this.states.AI_ANALYZING]: () => {
        this.updateStatus('AI analyzing profile sections...', '⏳');
        this.hideScanProgress();
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        
        // Start elapsed time display
        this.startElapsedTimeDisplay();
      },
      
      [this.states.AI_RETRYING]: () => {
        // Show retry status with attempt counter
        const message = data.message || 'Connection issue. Retrying...';
        const attemptInfo = data.attempt && data.maxAttempts ? 
          ` (${data.attempt}/${data.maxAttempts})` : '';
        this.updateStatus(message + attemptInfo, '🔄');
        
        // Show toast for first retry
        if (data.attempt === 1) {
          this.showToast('Network issue detected - retrying...', 'info', 3000);
        }
        
        // Keep showing completeness
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        
        // Don't stop elapsed time display during retries
      },
      
      [this.states.COMPLETE]: () => {
        this.clearEmptyStateMessage();
        // Hide status indicator after analysis
        this.hideStatusIndicator();
        this.hideSkeletons();
        
        // Only stop elapsed time if not from cache
        if (!data.fromCache) {
          this.stopElapsedTimeDisplay();
        }
        
        this.populateScores(data);
        
        // Store the full data for reference by other methods
        this.currentData = data;
        
        // Show unified view
        this.showUnifiedView(data);
        // Don't show action buttons in expanded view
        this.showActionButtons({ showRefresh: false });
        
        this.showInsights(data.insights);
        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
        
        // Ensure analyze button is enabled if compliance is set (for cached data)
        if (data.fromCache || data.cacheRestored) {
          const analyzeBtnCollapsed = this.overlayElement.querySelector('.analyze-btn-collapsed');
          if (analyzeBtnCollapsed && this.hasCompliance) {
            analyzeBtnCollapsed.disabled = false;
            analyzeBtnCollapsed.title = '';
          }
        }
        
        // Show toast if AI failed but completeness succeeded
        if (data.partialUpdate && data.aiFailedWithCache) {
          this.showToast('AI analysis failed. Showing previous AI results with updated completeness.', 'warning', 7000);
        } else if (data.apiKeyError) {
          this.showToast('Invalid API key. Please check your settings for AI analysis.', 'error');
        }
      },
      
      [this.states.ERROR]: () => {
        // Stop elapsed time display if running
        this.stopElapsedTimeDisplay();
        
        // Determine error icon and message based on type
        let errorIcon = '❌';
        let errorMessage = data.message || 'Analysis failed';
        let showSettings = false;
        let toastType = 'error';
        
        if (data.aiError) {
          switch (data.aiError.type) {
            case 'AUTH':
              errorIcon = '🔑';
              showSettings = true;
              errorMessage = 'Invalid API key - please check your settings';
              break;
            case 'RATE_LIMIT':
              errorIcon = '⏱️';
              toastType = 'warning';
              if (data.aiError.retryAfter) {
                errorMessage = data.aiError.message;
                // Start countdown timer
                this.startRetryCountdown(data.aiError.retryAfter);
              }
              break;
            case 'NETWORK':
              errorIcon = '🌐';
              break;
            case 'SERVICE_UNAVAILABLE':
              errorIcon = '🔧';
              break;
            default:
              errorIcon = '⚠️';
          }
          errorMessage = data.aiError.message;
        }
        
        this.updateStatus(errorMessage, errorIcon);
        this.hideSkeletons();
        
        // Show completeness if available (analysis partially succeeded)
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        
        // Show appropriate action button
        if (showSettings) {
          // Show button to open settings
          this.showActionButtons({ showSettings: true, hasError: true });
        } else {
          // Show refresh button to retry
          this.showActionButtons({ showRefresh: true, hasError: true });
        }
        
        // Show toast notification
        this.showToast(errorMessage, toastType);
      },
      
      [this.states.ANALYSIS_FAILED_CACHE_FALLBACK]: () => {
        // Stop elapsed time display if running
        this.stopElapsedTimeDisplay();
        
        this.clearEmptyStateMessage();
        this.hideSkeletons();
        
        // Show cached data
        this.populateScores(data);
        
        // Store the data with a flag indicating it's a fallback
        this.currentData = { ...data, isCacheFallback: true };
        
        // Show unified view with cache fallback indicator
        this.showUnifiedView(data);
        // Don't show action buttons in expanded view
        this.showActionButtons({ showRefresh: false });
        
        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
        
        // Show warning banner about failed analysis
        const warningBanner = document.createElement('div');
        warningBanner.className = 'analysis-warning-banner';
        warningBanner.style.cssText = `
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 6px;
          padding: 12px;
          margin: 12px 0;
          font-size: 14px;
          color: #92400e;
          display: flex;
          align-items: center;
          gap: 8px;
        `;
        // Create warning content safely
        const warningIcon = document.createElement('span');
        warningIcon.style.cssText = 'font-size: 16px;';
        warningIcon.textContent = '⚠️';
        
        const warningText = document.createElement('span');
        warningText.textContent = data.message || 'Analysis couldn\'t complete. Showing cached results. Please try again in a few minutes.';
        
        warningBanner.appendChild(warningIcon);
        warningBanner.appendChild(warningText);
        
        // Insert warning banner at the top of the unified section
        const unifiedSection = this.overlayElement.querySelector('.unified-section');
        if (unifiedSection && unifiedSection.firstChild) {
          unifiedSection.insertBefore(warningBanner, unifiedSection.firstChild);
        }
        
        // Update status
        this.updateStatus('Showing cached results', 'ℹ️');
        
        // Show refresh button
        this.showActionButtons({ showRefresh: true });
      }
    };
    
    // Execute state handler
    const handler = stateHandlers[newState];
    if (handler) {
      handler();
    }
  },
  
  /**
   * Update status indicator
   * @param {string} text - Status message
   * @param {string} icon - Status icon
   */
  updateStatus(text, icon = '') {
    const statusText = this.overlayElement.querySelector('.status-text');
    const statusIcon = this.overlayElement.querySelector('.status-icon');
    
    if (statusText) {
      statusText.style.opacity = '0';
      setTimeout(() => {
        statusText.textContent = text;
        statusText.style.opacity = '1';
      }, 150);
    }
    
    if (statusIcon && icon) {
      statusIcon.textContent = icon;
      statusIcon.className = 'status-icon';
      if (icon === '⏳' || icon === '⣾') {
        statusIcon.classList.add('spinning');
      }
    }
  },
  
  /**
   * Hide status indicator
   */
  hideStatusIndicator() {
    const statusIndicator = this.overlayElement.querySelector('.status-indicator');
    if (statusIndicator) {
      statusIndicator.style.display = 'none';
    }
  },
  
  /**
   * Show skeleton loaders
   */
  showSkeletons() {
    const skeletons = this.overlayElement.querySelectorAll('.skeleton');
    skeletons.forEach(el => el.classList.add('loading'));
  },
  
  /**
   * Hide skeleton loaders
   */
  hideSkeletons() {
    const skeletons = this.overlayElement.querySelectorAll('.skeleton');
    skeletons.forEach(el => {
      el.classList.remove('skeleton', 'loading');
    });
  },
  
  /**
   * Update button content safely
   */
  updateButtonContent(button, iconText, labelText) {
    // Clear existing content
    while (button.firstChild) {
      button.removeChild(button.firstChild);
    }
    
    // Create icon span
    const iconSpan = document.createElement('span');
    iconSpan.className = 'button-icon';
    iconSpan.textContent = iconText;
    
    // Add text node
    const textNode = document.createTextNode(labelText);
    
    button.appendChild(iconSpan);
    button.appendChild(textNode);
  },
  
  /**
   * Create a score block element safely
   */
  createScoreBlock(type, label, unit) {
    const scoreBlock = document.createElement('div');
    scoreBlock.className = `score-block ${type}`;
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    
    const scoreValue = document.createElement('div');
    scoreValue.className = 'score-value skeleton';
    scoreValue.textContent = '--';
    
    const scoreBar = document.createElement('div');
    scoreBar.className = 'score-bar';
    
    const scoreBarFill = document.createElement('div');
    scoreBarFill.className = 'score-bar-fill skeleton';
    scoreBar.appendChild(scoreBarFill);
    
    const scoreUnit = document.createElement('span');
    scoreUnit.className = 'score-unit';
    scoreUnit.textContent = unit;
    
    scoreBlock.appendChild(labelEl);
    scoreBlock.appendChild(scoreValue);
    scoreBlock.appendChild(scoreBar);
    scoreBlock.appendChild(scoreUnit);
    
    return scoreBlock;
  },
  
  /**
   * Clear empty state message
   */
  clearEmptyStateMessage() {
    const emptyMessage = this.overlayElement.querySelector('.empty-state-message');
    if (emptyMessage) {
      emptyMessage.remove();
    }
    
    // Also restore scores container if it was cleared
    const scoresContainer = this.overlayElement.querySelector('.scores-container');
    if (scoresContainer && !scoresContainer.querySelector('.score-block')) {
      // Clear any existing content
      while (scoresContainer.firstChild) {
        scoresContainer.removeChild(scoresContainer.firstChild);
      }
      
      // Restore the score blocks structure using DOM methods
      scoresContainer.appendChild(this.createScoreBlock('completeness', 'Profile Completeness', '%'));
      scoresContainer.appendChild(this.createScoreBlock('quality', 'Content Quality (AI)', '★'));
    }
  },
  
  /**
   * Update completeness score
   * @param {number} score - Completeness percentage
   */
  updateCompleteness(score) {
    const valueEl = this.overlayElement.querySelector('.completeness .score-value');
    const barEl = this.overlayElement.querySelector('.completeness .score-bar-fill');
    const collapsedBadge = this.overlayElement.querySelector('.score-badge.completeness');
    
    if (valueEl) {
      valueEl.textContent = Math.round(score);
      valueEl.classList.remove('skeleton');
    }
    
    if (barEl) {
      barEl.style.width = `${score}%`;
      barEl.classList.remove('skeleton');
      
      // Color based on score
      if (score >= 80) barEl.style.backgroundColor = '#057642';
      else if (score >= 60) barEl.style.backgroundColor = '#f59e0b';
      else barEl.style.backgroundColor = '#dc2626';
    }
    
    // Update collapsed view badge
    if (collapsedBadge) {
      collapsedBadge.innerHTML = `<span class="label-full">Completeness</span><span class="label-short">Complete</span>: ${Math.round(score)}%`;
      // Remove old color classes
      collapsedBadge.classList.remove('high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
      
      // Apply new color system
      const colorClass = this.getScoreClass(score, false);
      collapsedBadge.classList.add(colorClass);
    }
  },
  
  /**
   * Populate all scores
   * @param {Object} data - Score data
   */
  populateScores(data) {
    // Log section scores if available
    if (data.sectionScores) {
      SmartLogger.log('AI.SCORING', 'Section scores', { sectionScores: data.sectionScores });
    }
    
    // Update completeness
    if (data.completeness !== undefined) {
      this.updateCompleteness(data.completeness);
    }
    
    // Check if AI is disabled or API key error
    const qualityBadge = this.overlayElement.querySelector('.score-badge.quality');
    
    // Debug logging
    SmartLogger.log('UI.RENDERING', 'Quality badge update check', {
      aiDisabled: data.aiDisabled,
      contentScore: data.contentScore,
      fromCache: data.fromCache,
      willShowEnableAI: data.aiDisabled || (!data.contentScore && data.fromCache !== true),
      qualityBadgeExists: !!qualityBadge
    });
    
    if (data.aiDisabled || ((data.contentScore === undefined || data.contentScore === null) && data.fromCache !== true)) {
      // Replace quality score block with AI disabled message
      const qualityBlock = this.overlayElement.querySelector('.score-block.quality');
      if (qualityBlock) {
        let message = 'Configure AI in extension settings';
        if (data.apiKeyError) {
          message = data.apiKeyErrorMessage || 'Invalid Key - check settings';
        }
        // Clear and rebuild quality block safely
        while (qualityBlock.firstChild) {
          qualityBlock.removeChild(qualityBlock.firstChild);
        }
        
        const label = document.createElement('label');
        label.textContent = 'Content Quality (AI)';
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-disabled-message';
        messageDiv.textContent = message;
        
        qualityBlock.appendChild(label);
        qualityBlock.appendChild(messageDiv);
        
        // Clear the star suffix when AI is disabled
        const suffixEl = this.overlayElement.querySelector('.quality .score-suffix');
        if (suffixEl) {
          suffixEl.textContent = '';
        }
      }
      // Update collapsed view badge
      if (qualityBadge) {
        if (data.contentScore === 0 && data.aiError && data.settings?.enableAI) {
          // AI is enabled but failed
          qualityBadge.innerHTML = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: No score';
          qualityBadge.classList.add('ai-error');
        } else if (data.apiKeyError) {
          qualityBadge.textContent = '';
          const labelHtml = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: ';
          qualityBadge.innerHTML = labelHtml;
          const textNode = document.createTextNode('');
          qualityBadge.appendChild(textNode);
          
          // Show empty stars with error tooltip
          const starsElement = this.renderStars(null, 'API_KEY_ERROR');
          qualityBadge.appendChild(starsElement);
          qualityBadge.classList.add('ai-disabled', 'error');
        } else {
          qualityBadge.textContent = '';
          const labelHtml = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: ';
          qualityBadge.innerHTML = labelHtml;
          const textNode = document.createTextNode('');
          qualityBadge.appendChild(textNode);
          
          // Show empty stars with "Enable AI" tooltip
          const starsElement = this.renderStars(null, null);
          qualityBadge.appendChild(starsElement);
          qualityBadge.classList.add('ai-disabled');
        }
      }
    } else if (data.contentScore !== undefined && data.contentScore !== null) {
      // Update quality score normally
      const valueEl = this.overlayElement.querySelector('.quality .score-value');
      const barEl = this.overlayElement.querySelector('.quality .score-bar-fill');
      const statusEl = this.overlayElement.querySelector('.ai-status');
      
      if (valueEl) {
        // Convert 10-point scale to 5-star scale
        valueEl.textContent = (data.contentScore / 2).toFixed(2);
        valueEl.classList.remove('skeleton');
        
        // Add the star suffix
        const suffixEl = this.overlayElement.querySelector('.quality .score-suffix');
        if (suffixEl) {
          suffixEl.textContent = '★';
        }
      }
      
      if (barEl) {
        barEl.style.width = `${data.contentScore * 10}%`;
        barEl.classList.remove('skeleton');
        
        // Color based on score
        if (data.contentScore >= 8) barEl.style.backgroundColor = '#057642';
        else if (data.contentScore >= 6) barEl.style.backgroundColor = '#f59e0b';
        else barEl.style.backgroundColor = '#dc2626';
      }
      
      if (statusEl) {
        statusEl.textContent = data.fromCache ? 'Cached' : 'Fresh';
      }
      
      // Update collapsed view badge
      if (qualityBadge) {
        SmartLogger.log('UI.RENDERING', 'Updating quality badge', { contentScore: data.contentScore });
        // Convert 10-point scale to 5-star scale
        const starRating = Math.round(data.contentScore / 2);
        const numericRating = (data.contentScore / 2).toFixed(1);
        
        // Clear the badge first
        qualityBadge.textContent = '';
        qualityBadge.classList.remove('ai-disabled', 'high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
        
        // Add the main text with responsive labels
        const labelSpan = document.createElement('span');
        labelSpan.innerHTML = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: ';
        qualityBadge.appendChild(labelSpan);
        
        // Add visual stars using renderStars
        const starsElement = this.renderStars(starRating, data.errorType);
        
        // Add data attribute for responsive CSS to show numeric fallback
        starsElement.setAttribute('data-numeric', `${numericRating}/5★`);
        qualityBadge.appendChild(starsElement);
        
        // Add colored asterisk only if this is cached data after an AI failure
        if (data.cachedContentScore || data.partialUpdate || data.aiFailedWithCache) {
          const asteriskSpan = document.createElement('span');
          asteriskSpan.textContent = '*';
          asteriskSpan.style.fontWeight = 'bold';
          asteriskSpan.style.marginLeft = '2px';
          asteriskSpan.style.cursor = 'help';
          
          // If score is poor (red), make asterisk yellow; otherwise make it red
          if (data.contentScore < 5) {
            asteriskSpan.style.color = '#f59e0b'; // Yellow/warning color
          } else {
            asteriskSpan.style.color = '#ef4444'; // Red color for attention
          }
          
          // Add tooltip explaining the asterisk
          if (data.aiFailedWithCache || data.partialUpdate) {
            asteriskSpan.title = '* AI analysis failed. Showing previous AI results. Click "Analyze" to retry.';
          } else if (data.cachedContentScore) {
            asteriskSpan.title = '* Showing cached AI score with updated completeness. Click "Analyze" for fresh AI analysis.';
          } else if (data.timestamp) {
            const date = new Date(data.timestamp);
            const daysSince = Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
            asteriskSpan.title = `* This is from a cached analysis (${daysSince} days ago). Click "Analyze" to refresh.`;
          } else {
            asteriskSpan.title = '* This is from a previous analysis. Click "Analyze" to refresh.';
          }
          
          qualityBadge.appendChild(asteriskSpan);
        }
        
        // Apply new color system
        const colorClass = this.getScoreClass(data.contentScore, true);
        qualityBadge.classList.add(colorClass);
      }
    }
  },
  
  /**
   * Show timestamp
   * @param {number} timestamp - Unix timestamp
   */
  showTimestamp(timestamp) {
    const timestampEl = this.overlayElement.querySelector('.timestamp-display');
    if (!timestampEl || !timestamp) return;
    
    const date = new Date(timestamp);
    const formatted = date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    timestampEl.textContent = `Last analyzed: ${formatted}`;
    timestampEl.style.opacity = '1';
  },
  
  /**
   * Show recommendations with categorization
   * @param {Array|Object} recommendations - Recommendations data
   */
  showRecommendations(recommendations) {
    SmartLogger.log('UI.RENDERING', 'showRecommendations called', { recommendations });
    
    // Add detailed logging for recommendations structure
    SmartLogger.log('UI.RENDERING', 'Recommendations structure', {
      type: typeof recommendations,
      isArray: Array.isArray(recommendations),
      hasCritical: recommendations?.critical !== undefined,
      hasImportant: recommendations?.important !== undefined,
      hasNiceToHave: recommendations?.niceToHave !== undefined,
      criticalCount: recommendations?.critical?.length || 0,
      importantCount: recommendations?.important?.length || 0,
      niceToHaveCount: recommendations?.niceToHave?.length || 0,
      arrayLength: Array.isArray(recommendations) ? recommendations.length : 0,
      firstItem: Array.isArray(recommendations) ? recommendations[0] : recommendations?.critical?.[0]
    });
    
    if (!recommendations) {
      SmartLogger.log('UI.RENDERING', 'No recommendations provided');
      return;
    }
    
    // Debug: Check if it's an empty object vs null/undefined
    if (typeof recommendations === 'object' && !Array.isArray(recommendations)) {
      const hasAnyRecommendations = 
        (recommendations.critical && recommendations.critical.length > 0) ||
        (recommendations.important && recommendations.important.length > 0) ||
        (recommendations.niceToHave && recommendations.niceToHave.length > 0);
      
      if (!hasAnyRecommendations) {
        SmartLogger.log('UI.RENDERING', 'Recommendations object is empty or has no items');
      }
    }
    
    const section = this.overlayElement.querySelector('.recommendations-section');
    const list = this.overlayElement.querySelector('.recommendations-list');
    
    if (!section || !list) {
      SmartLogger.log('UI.ERRORS', 'Recommendations section or list not found');
      return;
    }
    
    // Clear existing
    // Clear list safely
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    
    // Create categorized structure
    const categories = {
      critical: { items: [], label: '🔴 Critical Actions', time: '15 min' },
      high: { items: [], label: '🟡 High Impact', time: '30 min' },
      medium: { items: [], label: '🟢 Nice to Have', time: '1 hour' }
    };
    
    // Categorize recommendations
    let allRecs = [];
    if (Array.isArray(recommendations)) {
      allRecs = recommendations;
    } else {
      // Handle categorized format from cache or synthesis
      if (recommendations.critical) {
        recommendations.critical.forEach(r => {
          // If this has actions array (synthesis format), extract each action
          if (r.actions && Array.isArray(r.actions)) {
            r.actions.forEach(action => {
              allRecs.push({
                priority: 'critical',
                action: {
                  what: action.what,
                  why: action.expectedImpact || r.combinedImpact,
                  how: action.how || 'Review and update your profile',
                  example: action.example
                },
                section: action.section,
                timeInvestment: r.timeframe,
                impactScore: r.rank
              });
            });
          } else {
            // Already in expected format or needs priority added
            allRecs.push({...r, priority: 'critical'});
          }
        });
      }
      
      if (recommendations.important) {
        recommendations.important.forEach(r => {
          // If this has actions array (synthesis format), extract each action
          if (r.actions && Array.isArray(r.actions)) {
            r.actions.forEach(action => {
              allRecs.push({
                priority: 'high',
                action: {
                  what: action.what,
                  why: action.expectedImpact || r.combinedImpact,
                  how: action.how || 'Review and update your profile',
                  example: action.example
                },
                section: action.section,
                timeInvestment: r.timeframe,
                impactScore: r.rank
              });
            });
          } else {
            allRecs.push({...r, priority: 'high'});
          }
        });
      }
      
      if (recommendations.niceToHave) {
        recommendations.niceToHave.forEach(r => {
          // If this has actions array (synthesis format), extract each action
          if (r.actions && Array.isArray(r.actions)) {
            r.actions.forEach(action => {
              allRecs.push({
                priority: 'medium',
                action: {
                  what: action.what,
                  why: action.expectedImpact || r.combinedImpact,
                  how: action.how || 'Review and update your profile',
                  example: action.example
                },
                section: action.section,
                timeInvestment: r.timeframe,
                impactScore: r.rank
              });
            });
          } else {
            allRecs.push({...r, priority: 'medium'});
          }
        });
      }
    }
    
    // Sort into categories
    allRecs.forEach(rec => {
      const priority = rec.priority || 'medium';
      if (categories[priority]) {
        categories[priority].items.push(rec);
      }
    });
    
    // Display by category
    Object.entries(categories).forEach(([priority, category]) => {
      if (category.items.length === 0) return;
      
      // Create category header
      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'recommendation-category';
      categoryDiv.style.cssText = 'margin-bottom: 16px;';
      
      const header = document.createElement('h5');
      header.style.cssText = 'font-size: 13px; font-weight: 600; margin: 0 0 8px 0; color: #333; display: flex; align-items: center; justify-content: space-between;';
      // Create header content safely
      const labelSpan = document.createElement('span');
      labelSpan.textContent = category.label;
      
      const timeSpan = document.createElement('span');
      timeSpan.style.cssText = 'font-size: 11px; color: #666; font-weight: normal;';
      timeSpan.textContent = `~${category.time}`;
      
      header.appendChild(labelSpan);
      header.appendChild(timeSpan);
      categoryDiv.appendChild(header);
      
      const categoryList = document.createElement('ul');
      categoryList.style.cssText = 'list-style: none; padding: 0; margin: 0;';
      
      // Add items to category
      category.items.slice(0, 3).forEach(rec => {
        const li = document.createElement('li');
        li.className = 'recommendation-item';
        li.style.cssText = 'padding: 8px 0; padding-left: 24px; position: relative; font-size: 13px; line-height: 1.5;';
        
        // Extract recommendation details
        const action = rec.action || {};
        
        // Ensure we have a valid 'what' string, not an object
        let what = action.what || rec.what || rec.message;
        if (!what || typeof what === 'object') {
          SmartLogger.log('UI.ERRORS', 'Invalid recommendation format', {
            recType: typeof rec,
            recKeys: rec ? Object.keys(rec) : 'null',
            hasAction: !!rec.action,
            hasActions: !!rec.actions,
            actionWhat: action.what,
            recWhat: rec.what,
            recMessage: rec.message
          });
          
          // Try to extract from actions array if present (synthesis format)
          if (rec.actions && Array.isArray(rec.actions) && rec.actions.length > 0) {
            what = rec.actions[0].what || 'Review and improve this section';
          } else {
            what = 'Review and improve this section';
          }
        }
        
        const why = action.why || rec.why;
        const example = action.example || rec.example;
        const impact = rec.impactScore || rec.impact;
        
        // Create content structure using DOM methods
        const whatDiv = document.createElement('div');
        whatDiv.style.cssText = 'margin-bottom: 4px;';
        whatDiv.textContent = what;
        li.appendChild(whatDiv);
        
        if (why) {
          const whyDiv = document.createElement('div');
          whyDiv.style.cssText = 'font-size: 12px; color: #666; margin-top: 4px;';
          whyDiv.textContent = `→ ${why}`;
          li.appendChild(whyDiv);
        }
        
        if (example) {
          const exampleDiv = document.createElement('div');
          exampleDiv.style.cssText = 'font-size: 11px; color: #0a66c2; margin-top: 4px; font-style: italic;';
          exampleDiv.textContent = example;
          li.appendChild(exampleDiv);
        }
        
        if (impact) {
          const impactDiv = document.createElement('div');
          impactDiv.style.cssText = 'font-size: 11px; color: #057642; margin-top: 4px;';
          impactDiv.textContent = `+${impact} points`;
          li.appendChild(impactDiv);
        }
        
        // Add hover effect
        li.onmouseover = () => li.style.backgroundColor = '#f3f2ef';
        li.onmouseout = () => li.style.backgroundColor = 'transparent';
        
        categoryList.appendChild(li);
      });
      
      categoryDiv.appendChild(categoryList);
      list.appendChild(categoryDiv);
    });
    
    SmartLogger.log('UI.RENDERING', 'Final recommendations list', {
      listChildrenCount: list.children.length,
      sectionClasses: section.className,
      willShow: list.children.length > 0
    });
    
    if (list.children.length > 0) {
      section.classList.remove('hidden');
      SmartLogger.log('UI.RENDERING', 'Showing recommendations section');
    } else {
      // console.log('[OverlayManager] No recommendations to show, keeping section hidden');
    }
  },
  
  /**
   * Show insights
   * @param {Object} insights - Insights data
   */
  showInsights(insights) {
    if (!insights) return;
    
    const section = this.overlayElement.querySelector('.insights-section');
    const content = this.overlayElement.querySelector('.insights-content');
    
    if (!section || !content) return;
    
    // Format insights
    let insightText = '';
    if (insights.strengths) {
      insightText += `<strong>Strengths:</strong> ${insights.strengths}<br>`;
    }
    if (insights.improvements) {
      insightText += `<strong>Areas to improve:</strong> ${insights.improvements}`;
    }
    
    if (insightText) {
      content.innerHTML = insightText;
      section.classList.remove('hidden');
    }
  },
  
  /**
   * Start retry countdown timer
   * @param {number} seconds - Seconds to wait
   */
  startRetryCountdown(seconds) {
    const analyzeBtn = this.overlayElement.querySelector('.analyze-button');
    if (!analyzeBtn) return;
    
    // Clear any existing timer
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    
    let remaining = seconds;
    analyzeBtn.classList.remove('hidden');
    analyzeBtn.disabled = true;
    
    const updateButton = () => {
      if (remaining > 0) {
        this.updateButtonContent(analyzeBtn, '⏱️', `Retry in ${remaining}s`);
        remaining--;
      } else {
        clearInterval(this.countdownTimer);
        analyzeBtn.disabled = !this.hasCompliance;
        this.updateButtonContent(analyzeBtn, '🔄', 'Retry Analysis');
        // Restore original click handler
        analyzeBtn.onclick = () => this.handleAnalyze();
      }
    };
    
    updateButton();
    this.countdownTimer = setInterval(updateButton, 1000);
  },
  
  /**
   * Show action buttons based on current state
   * @param {Object} options - Button visibility options
   */
  showActionButtons(options = {}) {
    const analyzeBtn = this.overlayElement.querySelector('.analyze-button');
    const refreshBtn = this.overlayElement.querySelector('.refresh-button');
    const detailsBtn = this.overlayElement.querySelector('.details-button');
    const actionsDiv = this.overlayElement.querySelector('.overlay-actions');
    
    // Always hide the actions div in expanded view
    if (actionsDiv) {
      actionsDiv.style.display = 'none';
      return; // Don't show any buttons in expanded view
    }
    
    // Hide all buttons first
    [analyzeBtn, refreshBtn, detailsBtn].forEach(btn => {
      if (btn) {
        btn.classList.add('hidden');
        btn.classList.remove('has-error');
      }
    });
    
    // Show appropriate buttons based on state
    if (options.showAnalyze && analyzeBtn) {
      analyzeBtn.classList.remove('hidden');
      // Add error indicator if needed
      if (options.hasError) {
        analyzeBtn.classList.add('has-error');
      }
      // Update text based on current state
      if (this.currentState === this.states.EMPTY_CACHE) {
        this.updateButtonContent(analyzeBtn, '🚀', 'Analyze Profile');
      } else {
        this.updateButtonContent(analyzeBtn, '🔄', 'Refresh');
      }
    }
    if (options.showRefresh && refreshBtn) {
      refreshBtn.classList.remove('hidden');
      // Add error indicator if needed
      if (options.hasError) {
        refreshBtn.classList.add('has-error');
      }
      // Reset button state after analysis completes
      refreshBtn.disabled = false;
      this.updateButtonContent(refreshBtn, '🔄', 'Refresh');
    }
    if (options.showSettings && analyzeBtn) {
      // Repurpose analyze button for settings
      analyzeBtn.classList.remove('hidden');
      analyzeBtn.innerHTML = '<span class="button-icon">⚙️</span>Open Settings';
      // Change click handler temporarily
      analyzeBtn.onclick = (e) => {
        e.preventDefault();
        // Open extension popup/settings
        try {
          if (chrome?.runtime?.id) {
            chrome.runtime.sendMessage({ action: 'openPopup' }, () => {
              // Check for errors but ignore them
              if (chrome.runtime.lastError) {
                // Silently ignore
              }
            });
          }
        } catch (error) {
          // Silently ignore if extension context is invalid
        }
      };
    }
  },
  
  /**
   * Show progress bar
   * @param {string} phase - Current phase
   */
  showProgressBar(phase) {
    // Could add a progress bar UI element if desired
    // console.log(`[OverlayManager] Progress phase: ${phase}`);
  },
  
  
  /**
   * Handle refresh button click (re-analysis)
   */
  handleRefresh() {
    // console.log('[OverlayManager] Refresh requested');
    const btn = this.overlayElement.querySelector('.refresh-button');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="button-icon">⏳</span>Re-analyzing...';
    }
    // Send message to trigger re-analysis
    window.postMessage({ type: 'ELEVATE_REFRESH' }, '*');
  },
  
  /**
   * Handle view details button click
   */
  handleViewDetails() {
    // console.log('[OverlayManager] View details requested');
    const btn = this.overlayElement.querySelector('.details-button');
    if (btn) {
      btn.disabled = true;
    }
    // Open dashboard
    try {
      if (chrome?.runtime?.id) {
        chrome.runtime.sendMessage({ action: 'openDashboard' }, (response) => {
          if (chrome.runtime.lastError) {
            // console.error('Failed to open dashboard:', chrome.runtime.lastError);
            if (btn) btn.disabled = false;
          }
        });
      } else {
        if (btn) btn.disabled = false;
      }
    } catch (error) {
      if (btn) btn.disabled = false;
    }
  },
  
  /**
   * Close overlay
   */
  close() {
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      wrapper.style.opacity = '0';
      setTimeout(() => {
        wrapper.remove();
        this.overlayElement = null;
      }, 300);
    }
  },
  
  /**
   * Show scan progress UI
   */
  showScanProgress() {
    const scanProgress = this.overlayElement.querySelector('.scan-progress');
    if (scanProgress) {
      scanProgress.classList.remove('hidden');
    }
  },
  
  /**
   * Hide scan progress UI
   */
  hideScanProgress() {
    const scanProgress = this.overlayElement.querySelector('.scan-progress');
    if (scanProgress) {
      scanProgress.classList.add('hidden');
    }
  },
  
  /**
   * Update scan progress with section statuses
   * @param {Array<Object>} sections - Array of {name, status, itemCount}
   */
  updateScanProgress(sections) {
    const scanItems = this.overlayElement.querySelector('.scan-items');
    if (!scanItems) return;
    
    // Clear existing items
    scanItems.innerHTML = '';
    
    // Create progress items for each section
    sections.forEach(section => {
      const item = document.createElement('div');
      item.className = 'scan-item';
      item.setAttribute('data-status', section.status);
      
      const icon = document.createElement('span');
      icon.className = 'scan-icon';
      
      // Set icon based on status
      if (section.status === 'complete') {
        icon.textContent = '✓';
      } else if (section.status === 'scanning') {
        icon.textContent = '⣾';
        icon.classList.add('spinning');
      } else {
        icon.textContent = '○';
      }
      
      const label = document.createElement('span');
      label.className = 'scan-label';
      label.textContent = this.formatSectionName(section.name);
      
      // Add item count if available
      if (section.itemCount !== undefined && section.status === 'complete') {
        const count = document.createElement('span');
        count.className = 'scan-count';
        count.textContent = `(${section.itemCount})`;
        label.appendChild(count);
      }
      
      item.appendChild(icon);
      item.appendChild(label);
      scanItems.appendChild(item);
    });
  },
  
  /**
   * Update extraction progress
   * @param {string} currentSection - Section currently being extracted
   */
  updateExtractionProgress(currentSection) {
    const statusText = this.overlayElement.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = `Extracting ${this.formatSectionName(currentSection)}...`;
    }
  },
  
  /**
   * Update AI analysis progress
   * @param {string} phase - Current AI phase
   * @param {string} section - Current section (optional)
   */
  updateAIProgress(phase, section) {
    const statusText = this.overlayElement.querySelector('.status-text');
    if (!statusText) return;
    
    const messages = {
      'generating': 'Generating AI insights...',
      'analyzing-about': 'AI analyzing About section...',
      'analyzing-experience': 'AI analyzing Experience...',
      'analyzing-skills': 'AI analyzing Skills...',
      'analyzing-headline': 'AI analyzing Headline...',
      'analyzing-education': 'AI analyzing Education...',
      'analyzing-recommendations': 'AI analyzing Recommendations...',
      'analyzing-certifications': 'AI analyzing Certifications...',
      'analyzing-projects': 'AI analyzing Projects...',
      'synthesizing': 'Synthesizing results...'
    };
    
    // If section includes step info (e.g., "Profile Intro (Step 1 of 8)"), use it directly
    if (section && section.includes('Step')) {
      statusText.textContent = `AI analyzing ${section}...`;
    } else {
      statusText.textContent = messages[phase] || `AI analyzing ${section || 'profile'}...`;
    }
  },
  
  /**
   * Show timestamp
   * @param {string|number} timestamp - Timestamp (ISO string or Unix timestamp)
   */
  showTimestamp(timestamp) {
    const timestampEl = this.overlayElement?.querySelector('.timestamp-display');
    if (!timestampEl || !timestamp) return;
    
    let date;
    if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      date = new Date(timestamp);
    }
    
    const formatted = date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    timestampEl.textContent = `Last analyzed: ${formatted}`;
    timestampEl.style.opacity = '1';
  },
  
  /**
   * Format section name for display
   * @param {string} name - Section name
   * @returns {string} Formatted name
   */
  formatSectionName(name) {
    const nameMap = {
      'headline': 'Headline',
      'about': 'About',
      'experience': 'Experience',
      'skills': 'Skills',
      'education': 'Education',
      'recommendations': 'Recommendations',
      'certifications': 'Certifications',
      'projects': 'Projects',
      'featured': 'Featured',
      'profile_intro': 'Profile Intro',
      'experience_role': 'Experience'
    };
    
    return nameMap[name] || name.charAt(0).toUpperCase() + name.slice(1);
  },
  
  /**
   * Update section score progressively
   * @param {string} section - Section name
   * @param {number} score - Section score
   */
  updateSectionScore(section, score) {
    // Section score details display disabled - not currently used
    return;
  },
  
  /**
   * Show missing items for completeness
   * @param {Object} completenessData - Completeness analysis data
   */
  showMissingItems(completenessData) {
    if (!completenessData || !completenessData.recommendations) return;
    
    const section = this.overlayElement.querySelector('.missing-items-section');
    const list = this.overlayElement.querySelector('.missing-items-list');
    
    if (!section || !list) return;
    
    // Clear existing items
    // Clear list safely
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    
    // Get missing items sorted by priority (highest weight first)
    const missingItems = completenessData.recommendations;
    if (!missingItems || missingItems.length === 0) {
      // If 100% complete, hide the section
      section.classList.add('hidden');
      return;
    }
    
    // Create a clean list of missing items
    const itemsHtml = missingItems.slice(0, 5).map(item => {
      const iconMap = {
        photo: '📷',
        headline: '📝',
        about: '📄',
        experience: '💼',
        skills: '🎯',
        education: '🎓',
        recommendations: '👍',
        certifications: '📜',
        projects: '🚀'
      };
      
      const icon = iconMap[item.section] || '•';
      const points = item.impact || item.weight || 0;
      
      return `
        <div class="missing-item" style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 0;
          border-bottom: 1px solid #e0e0e0;
          font-size: 13px;
        ">
          <span style="font-size: 16px;">${icon}</span>
          <span style="flex: 1;">${item.message}</span>
          <span style="
            background: #f3f4f6;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            color: #666;
          ">+${points}%</span>
        </div>
      `;
    }).join('');
    
    list.innerHTML = itemsHtml;
    
    // Show the section
    section.classList.remove('hidden');
    
    // If there are more than 5 items, show count
    if (missingItems.length > 5) {
      list.innerHTML += `
        <div style="
          text-align: center;
          padding: 8px 0;
          font-size: 13px;
          color: #666;
        ">
          and ${missingItems.length - 5} more items...
        </div>
      `;
    }
  },
  
  /**
   * Show message when no AI recommendations are available
   */
  showNoRecommendationsMessage() {
    const section = this.overlayElement.querySelector('.recommendations-section');
    const list = this.overlayElement.querySelector('.recommendations-list');
    
    if (!section || !list) return;
    
    // Clear any existing content
    // Clear list safely
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    
    // Show the recommendations section with a helpful message
    list.innerHTML = `
      <div style="
        text-align: center;
        padding: 20px;
        color: #666;
      ">
        <p style="margin-bottom: 8px; font-size: 14px; font-weight: 600;">
          AI-powered recommendations not available
        </p>
        <p style="font-size: 13px; color: #999; margin-bottom: 16px;">
          Enable AI analysis to get personalized content quality recommendations beyond basic completeness
        </p>
        <button class="action-button small-button" style="
          padding: 6px 16px;
          font-size: 13px;
          background: #0a66c2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 8px;
        " onclick="try { if (chrome?.runtime?.id) { chrome.runtime.sendMessage({action: 'openPopup'}); } } catch(e) {}">
          Configure AI
        </button>
        <span style="font-size: 12px; color: #999;">
          or click "Analyze" with AI enabled
        </span>
      </div>
    `;
    
    // Show the section
    section.classList.remove('hidden');
  },
  
  /**
   * Format and display timestamp
   * @param {number} timestamp - Unix timestamp
   */
  showTimestamp(timestamp) {
    const lastAnalyzed = this.overlayElement.querySelector('.last-analyzed');
    const collapsedTimestamp = this.overlayElement.querySelector('.last-analyzed-collapsed');
    
    if (!timestamp) return;
    
    const formatted = this.formatTimestamp(timestamp);
    
    // Check if data is stale (older than 7 days)
    const now = Date.now();
    const daysSinceAnalysis = (now - timestamp) / (1000 * 60 * 60 * 24);
    const isStale = daysSinceAnalysis > 7;
    
    if (lastAnalyzed) {
      lastAnalyzed.textContent = `Last analyzed: ${formatted}`;
      if (isStale) {
        lastAnalyzed.textContent += ' ⚠️';
        lastAnalyzed.title = 'Analysis is older than 7 days - consider re-analyzing';
      }
      lastAnalyzed.style.opacity = '1';
    }
    
    if (collapsedTimestamp) {
      // Show date only format for collapsed view (no time)
      const date = new Date(timestamp);
      const options = {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      };
      const formatted = date.toLocaleDateString('en-US', options);
      collapsedTimestamp.textContent = `Last Analyzed: ${formatted}`;
      if (isStale) {
        collapsedTimestamp.textContent += ' ⚠️';
        collapsedTimestamp.title = 'Analysis is older than 7 days - consider re-analyzing';
        collapsedTimestamp.style.color = '#f59e0b';
      }
    }
  },
  
  /**
   * Format timestamp to human-readable format
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Formatted date/time string
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    
    // Check if it's today
    const isToday = date.toDateString() === now.toDateString();
    
    // Check if it's yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    // Format time
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    const timeStr = date.toLocaleTimeString('en-US', timeOptions);
    
    if (isToday) {
      return `Today at ${timeStr}`;
    } else if (isYesterday) {
      return `Yesterday at ${timeStr}`;
    } else {
      // For older dates, show month/day and time
      const dateOptions = { month: 'short', day: 'numeric' };
      const dateStr = date.toLocaleDateString('en-US', dateOptions);
      return `${dateStr} at ${timeStr}`;
    }
  },
  
  /**
   * Reset all action buttons to enabled state
   * This is called after analysis completes, fails, or times out
   */
  resetButtons() {
    // console.log('[OverlayManager] Resetting all buttons');
    
    if (!this.overlayElement) return;
    
    // Re-enable all action buttons
    const buttons = this.overlayElement.querySelectorAll('.action-button');
    buttons.forEach(btn => {
      btn.disabled = false;
      
      // Reset button text to original
      if (btn.classList.contains('analyze-button')) {
        btn.innerHTML = '<span class="button-icon">🚀</span>Analyze Profile';
      } else if (btn.classList.contains('refresh-button')) {
        btn.innerHTML = '<span class="button-icon">🔄</span>Refresh';
      } else if (btn.classList.contains('details-button')) {
        btn.innerHTML = '<span class="button-icon">📊</span>View Details';
      }
    });
    
    // Reset collapsed view button
    const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    if (collapsedBtn) {
      collapsedBtn.disabled = false;
      // [CRITICAL_PATH:BUTTON_STATE_MANAGEMENT] - Always show "Analyze" for consistency
      collapsedBtn.innerHTML = 'Analyze';
    }
    
    
    // Clear any failsafe timer if it exists
    if (this.buttonResetTimer) {
      clearTimeout(this.buttonResetTimer);
      this.buttonResetTimer = null;
    }
  },
  
  /**
   * Handle analyze button click
   */
  handleAnalyze() {
    // Check compliance at click time
    if (!this.hasCompliance) {
      console.log('[OverlayManager] Analysis blocked - no compliance');
      // Show message to complete setup
      const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
      if (collapsedBtn) {
        collapsedBtn.title = 'Please complete setup in extension popup first';
      }
      return;
    }
    
    // console.log('[OverlayManager] Analyze requested');
    const btn = this.overlayElement.querySelector('.analyze-button');
    const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="button-icon spinning">⏳</span><span class="btn-text-full">Analyzing</span><span class="btn-text-short">...</span>';
    }
    
    if (collapsedBtn) {
      collapsedBtn.disabled = true;
      collapsedBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> <span class="btn-text-full">Analyzing</span><span class="btn-text-short">...</span>';
    }
    
    // Set failsafe timer to re-enable button after 60 seconds
    this.setButtonFailsafeTimer();
    
    // Send message to trigger analysis
    window.postMessage({ type: 'ELEVATE_REFRESH' }, '*');
  },
  
  /**
   * Handle refresh button click (re-analysis)
   */
  handleRefresh() {
    // console.log('[OverlayManager] Refresh requested');
    const btn = this.overlayElement.querySelector('.refresh-button');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="button-icon">⏳</span>Re-analyzing...';
    }
    
    // Set failsafe timer to re-enable button after 60 seconds
    this.setButtonFailsafeTimer();
    
    // Send message to trigger re-analysis
    window.postMessage({ type: 'ELEVATE_REFRESH' }, '*');
  },
  
  /**
   * Set failsafe timer to re-enable buttons after 60 seconds
   */
  setButtonFailsafeTimer() {
    // Clear any existing timer
    if (this.buttonResetTimer) {
      clearTimeout(this.buttonResetTimer);
    }
    
    // Progressive messaging for long-running analysis
    const messages = [
      { time: 30000, text: 'Still analyzing your profile...', icon: '⏳' },
      { time: 60000, text: 'This is taking a bit longer than usual. Complex profiles need more time...', icon: '⏳' },
      { time: 90000, text: 'Almost there! Creating personalized recommendations...', icon: '✨' },
      { time: 120000, text: 'Finalizing your insights. Thanks for your patience...', icon: '🎯' }
    ];
    
    // Set progressive message timers
    messages.forEach(({ time, text, icon }) => {
      setTimeout(() => {
        if (this.currentState === this.states.SCANNING || 
            this.currentState === this.states.EXTRACTING || 
            this.currentState === this.states.CALCULATING || 
            this.currentState === this.states.ANALYZING || 
            this.currentState === this.states.AI_ANALYZING) {
          this.updateStatus(text, icon);
        }
      }, time);
    });
    
    // Final timeout at 3 minutes
    this.buttonResetTimer = setTimeout(() => {
      // console.log('[OverlayManager] 3-minute timeout reached');
      this.resetButtons();
      
      // Don't set error state here - let the analyzer handle timeout
      // It will show partial results if available
      if (this.currentState === this.states.SCANNING || 
          this.currentState === this.states.EXTRACTING || 
          this.currentState === this.states.CALCULATING || 
          this.currentState === this.states.ANALYZING || 
          this.currentState === this.states.AI_ANALYZING) {
        // console.log('[OverlayManager] Waiting for analyzer to handle timeout...');
        // The analyzer's handleAnalysisTimeout will be called and will show partial results
      }
    }, 300000); // 5 minutes
  },
  
  // Removed development mode indicator - not needed for production
  
  /**
   * Start elapsed time display
   */
  startElapsedTimeDisplay() {
    if (!this.overlayElement) return;
    
    // Clear any existing timer
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
    }
    
    const startTime = Date.now();
    
    // Create elapsed time display as inline span
    let elapsedDisplay = this.overlayElement.querySelector('.elapsed-time-display');
    if (!elapsedDisplay) {
      elapsedDisplay = document.createElement('span');
      elapsedDisplay.className = 'elapsed-time-display';
      elapsedDisplay.style.cssText = `
        font-size: 13px;
        color: #666;
        margin-left: 12px;
      `;
      
      const statusText = this.overlayElement.querySelector('.status-text');
      if (statusText && statusText.parentNode) {
        // Make sure the parent is a flex container for proper alignment
        statusText.parentNode.style.display = 'flex';
        statusText.parentNode.style.alignItems = 'baseline';
        statusText.parentNode.appendChild(elapsedDisplay);
      }
    }
    
    // Update elapsed time every second
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      
      // Update status text based on elapsed time
      const statusEl = this.overlayElement.querySelector('.status-text');
      
      if (minutes > 0) {
        elapsedDisplay.textContent = `Elapsed: ${minutes}m ${seconds}s`;
      } else {
        elapsedDisplay.textContent = `Elapsed: ${seconds}s`;
      }
      
      // Progressive time estimates and status updates
      // Changed from 20s/45s to 30s/60s based on alpha tester feedback
      if (elapsed >= 60 && elapsed < 65 && statusEl) {
        statusEl.textContent = 'Still trying to reach AI service...';
      } else if (elapsed >= 30 && elapsed < 35 && statusEl) {
        statusEl.textContent = 'Taking longer than expected...';
      }
      
      // Additional helper messages
      if (elapsed > 120) {
        elapsedDisplay.innerHTML += ' <span style="color: #059669;">(Almost done!)</span>';
      } else if (elapsed > 90) {
        elapsedDisplay.innerHTML += ' <span style="color: #0a66c2;">(Finalizing...)</span>';
      } else if (elapsed > 60) {
        elapsedDisplay.innerHTML += ' <span style="color: #f59e0b;">(Complex analysis in progress)</span>';
      } else if (elapsed > 30) {
        elapsedDisplay.innerHTML += ' <span style="color: #6b7280;">(This may take a moment...)</span>';
      }
    };
    
    updateElapsed();
    // Update every second for responsive feedback
    this.elapsedTimeInterval = setInterval(updateElapsed, 1000);
  },
  
  /**
   * Stop elapsed time display
   */
  stopElapsedTimeDisplay() {
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
      this.elapsedTimeInterval = null;
    }
    
    // Remove elapsed time display
    const elapsedDisplay = this.overlayElement?.querySelector('.elapsed-time-display');
    if (elapsedDisplay) {
      elapsedDisplay.remove();
    }
  },
  
  /**
   * Toggle between collapsed and expanded view
   */
  toggleView() {
    this.viewState = this.viewState === 'collapsed' ? 'expanded' : 'collapsed';
    this.overlayElement.setAttribute('data-view-state', this.viewState);
    
    // Update link text - preserve the responsive spans
    const detailsTextFull = this.overlayElement.querySelector('.details-text-full');
    const detailsTextMedium = this.overlayElement.querySelector('.details-text-medium');
    if (detailsTextFull) {
      detailsTextFull.textContent = this.viewState === 'collapsed' ? 'View details' : 'Hide details';
    }
    if (detailsTextMedium) {
      detailsTextMedium.textContent = this.viewState === 'collapsed' ? 'Details' : 'Hide';
    }
  },
  
  /**
   * Handle cancel analysis
   */
  handleCancelAnalysis() {
    // console.log('[OverlayManager] Cancel analysis requested');
    
    // Reset buttons to enabled state
    this.resetButtons();
    
    // Send cancel message
    window.postMessage({ type: 'ELEVATE_CANCEL_ANALYSIS' }, '*');
    
    // If we have cached data, restore it
    const profileId = window.location.pathname.match(/\/in\/([^\/]+)/)?.[1];
    if (profileId && chrome?.runtime?.id) {
      try {
        chrome.storage.local.get([`cache_${profileId}`], (data) => {
          if (chrome.runtime.lastError) {
            // Go back to empty state on error
            this.setState(this.states.EMPTY_CACHE);
            return;
          }
          const cachedData = data[`cache_${profileId}`];
          if (cachedData) {
            // Restore to cached state
            this.setState(this.states.COMPLETE, {
              ...cachedData,
              fromCache: true,
              cacheRestored: true
            });
            this.updateStatus('Analysis cancelled - showing previous results', 'ℹ️');
          } else {
            // No cache, go back to empty state
            this.setState(this.states.EMPTY_CACHE);
            this.updateStatus('Analysis cancelled', 'ℹ️');
          }
        });
      } catch (error) {
        // Silently ignore storage errors
      }
    }
  },
  
  /**
   * Close overlay
   */
  close() {
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      wrapper.remove();
    }
    this.overlayElement = null;
    
    // Clear any timers
    if (this.buttonResetTimer) {
      clearTimeout(this.buttonResetTimer);
      this.buttonResetTimer = null;
    }
    
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
      this.elapsedTimeInterval = null;
    }
  },
  
  /**
   * Show overlay
   */
  show() {
    if (this.overlayElement) {
      // Find the wrapper through the overlay element
      const wrapper = this.overlayElement.closest('.elevateli-overlay-wrapper');
      if (wrapper) {
        wrapper.style.setProperty('display', 'block', 'important');
        SmartLogger.log('UI.INTERACTIONS', 'Overlay shown via wrapper with !important');
        return;
      }
    }
    
    // Fallback to document query if overlayElement not available
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      wrapper.style.setProperty('display', 'block', 'important');
      SmartLogger.log('UI.INTERACTIONS', 'Overlay shown via fallback query with !important');
    } else {
      // Re-initialize if not present
      SmartLogger.log('UI.INTERACTIONS', 'No overlay found, re-initializing');
      this.initialize();
    }
  },
  
  /**
   * Hide overlay
   * Using !important due to CSS specificity conflict - some CSS rule overrides display:none
   */
  hide() {
    if (this.overlayElement) {
      // Find the wrapper through the overlay element
      const wrapper = this.overlayElement.closest('.elevateli-overlay-wrapper');
      if (wrapper) {
        // WORKAROUND: !important needed to override conflicting CSS
        wrapper.style.setProperty('display', 'none', 'important');
        SmartLogger.log('UI.INTERACTIONS', 'Overlay hidden via wrapper with !important');
        return;
      }
    }
    
    // Fallback to document query if overlayElement not available
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      // WORKAROUND: !important needed to override conflicting CSS
      wrapper.style.setProperty('display', 'none', 'important');
      SmartLogger.log('UI.INTERACTIONS', 'Overlay hidden via fallback query with !important');
    }
  },
  
  
  /**
   * Show unified view with progressive improvement system
   */
  showUnifiedView(data) {
    console.log('[OverlayManager] showUnifiedView called with data:', {
      completeness: data?.completeness,
      contentScore: data?.contentScore,
      hasCompleteness: 'completeness' in (data || {}),
      dataKeys: Object.keys(data || {}),
      hasSectionScores: !!data?.sectionScores,
      sectionScoreKeys: data?.sectionScores ? Object.keys(data.sectionScores) : [],
      experienceOverall: data?.sectionScores?.experience_overall
    });
    
    // Hide the old sections
    const missingSection = this.overlayElement.querySelector('.missing-items-section');
    const recsSection = this.overlayElement.querySelector('.recommendations-section');
    const insightsSection = this.overlayElement.querySelector('.insights-section');
    
    if (missingSection) missingSection.classList.add('hidden');
    if (recsSection) recsSection.classList.add('hidden');
    if (insightsSection) insightsSection.classList.add('hidden');
    
    // Only hide score blocks if we have actual analysis data and recommendations to show
    // This keeps the score blocks visible during analysis and for completeness-only results
    const scoresContainer = this.overlayElement.querySelector('.scores-container');
    const hasRecommendations = data.recommendations && data.recommendations.length > 0;
    const hasInsights = data.insights && Object.keys(data.insights).length > 0;
    
    if (scoresContainer && hasRecommendations && hasInsights) {
      scoresContainer.style.display = 'none';
    } else if (scoresContainer) {
      scoresContainer.style.display = '';
    }
    
    // Create or update unified section
    let unifiedSection = this.overlayElement.querySelector('.unified-section');
    if (!unifiedSection) {
      unifiedSection = document.createElement('div');
      unifiedSection.className = 'unified-section';
      // Insert in the expanded view section
      const expandedView = this.overlayElement.querySelector('.overlay-expanded-view');
      if (expandedView) {
        // Find a good insertion point - after header or status indicator
        const header = expandedView.querySelector('.overlay-header');
        const statusIndicator = expandedView.querySelector('.status-indicator');
        
        if (header && header.nextSibling) {
          header.parentNode.insertBefore(unifiedSection, header.nextSibling);
        } else if (statusIndicator && statusIndicator.parentNode) {
          // Insert after status indicator's parent container
          if (statusIndicator.nextSibling) {
            statusIndicator.parentNode.insertBefore(unifiedSection, statusIndicator.nextSibling);
          } else {
            statusIndicator.parentNode.appendChild(unifiedSection);
          }
        } else {
          // Fallback: append to expanded view
          expandedView.appendChild(unifiedSection);
        }
      }
    }
    
    // Transform recommendations into progressive improvement format
    const progressiveData = this.transformToProgressiveFormat(data);
    
    // console.log('[OverlayManager] Progressive data generated:', {
    //   hasSections: progressiveData.sections?.length > 0,
    //   sectionsCount: progressiveData.sections?.length,
    //   sections: progressiveData.sections,
    //   coachingSummary: progressiveData.coachingSummary,
    //   unifiedSectionFound: !!unifiedSection,
    //   expandedViewFound: !!this.overlayElement.querySelector('.overlay-expanded-view')
    // });
    
    // Debug the progressiveData right before setting innerHTML
    console.log('[OverlayManager] About to set innerHTML, progressiveData:', {
      hasProgressiveData: !!progressiveData,
      hasUnifiedMessage: !!progressiveData?.unifiedMessage,
      unifiedMessage: progressiveData?.unifiedMessage,
      progressiveDataKeys: Object.keys(progressiveData || {})
    });
    
    // Build HTML with progressive improvements
    unifiedSection.innerHTML = `
      <div style="margin: 8px 0;">
        <!-- Unified Message (single positive message) -->
        <div style="padding: 12px; background: #e8f5e9; border-radius: 8px; text-align: center; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 15px; color: #2e7d32; font-weight: 500;">
            ${progressiveData.unifiedMessage}
          </p>
        </div>
        
        ${window.elevateliDebug.enabled ? `
          <!-- Debug Info for Mac Testing -->
          <div style="margin: 20px 0; padding: 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; font-size: 11px;">
            <strong style="display: block; margin-bottom: 8px;">🔧 Debug Mode Active</strong>
            <div style="font-family: monospace; line-height: 1.4;">
              Platform: ${navigator.platform}<br>
              Message Length: ${progressiveData.unifiedMessage?.length || 0} chars<br>
              Completeness: ${data.completeness}%<br>
              Content Score: ${data.contentScore || 'N/A'}<br>
              <button onclick="navigator.clipboard.writeText(window.elevateliDebug.getLogs()).then(() => alert('Debug logs copied to clipboard!'))" 
                      style="margin-top: 8px; padding: 4px 12px; background: #0a66c2; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Copy Debug Logs
              </button>
            </div>
          </div>
        ` : ''}
        
        <!-- Progressive Improvements by Section -->
        <div style="margin-bottom: 16px;">
          ${progressiveData.sections && progressiveData.sections.length > 0 
            ? progressiveData.sections.map(section => this.renderSection(section)).join('')
            : `<div style="padding: 20px; text-align: center; color: #666;">
                <p style="margin: 0 0 8px 0; font-size: 14px;">No specific improvements needed for profile completeness.</p>
                <p style="margin: 0; font-size: 13px;">Enable AI analysis for personalized content quality insights.</p>
              </div>`
          }
        </div>
        
        <!-- AI Coaching Summary (only if available) -->
        ${progressiveData.coachingSummary ? `
          <div style="background: #f0f8ff; border-left: 3px solid #0a66c2; padding: 12px 16px; border-radius: 0 6px 6px 0;">
            <p style="font-size: 14px; line-height: 1.5; margin: 0; color: #333;">
              ${progressiveData.coachingSummary}
            </p>
          </div>
        ` : ''}
      </div>
    `;
    
    // Replace star placeholders with actual DOM elements
    if (this.pendingStarElements && this.pendingStarElements.length > 0) {
      console.log('[OverlayManager] Replacing star placeholders:', {
        count: this.pendingStarElements.length,
        placeholderIds: this.pendingStarElements.map(p => p.id)
      });
      
      this.pendingStarElements.forEach(({ id, element }) => {
        const placeholder = unifiedSection.querySelector(`[data-star-placeholder="${id}"]`);
        if (placeholder && element) {
          // Clear the placeholder and append the actual star element
          placeholder.innerHTML = '';
          placeholder.appendChild(element);
          console.log('[OverlayManager] Replaced placeholder:', id);
        } else {
          console.warn('[OverlayManager] Could not find placeholder or element:', { id, hasPlaceholder: !!placeholder, hasElement: !!element });
        }
      });
      // Clear pending elements after insertion
      this.pendingStarElements = [];
    } else {
      console.log('[OverlayManager] No pending star elements to replace');
    }
    
    unifiedSection.classList.remove('hidden');
    
    console.log('[OverlayManager] Unified section updated:', {
      innerHTML: unifiedSection.innerHTML.substring(0, 400) + '...',
      isHidden: unifiedSection.classList.contains('hidden'),
      display: window.getComputedStyle(unifiedSection).display,
      parentElement: unifiedSection.parentElement?.className,
      unifiedMessageInHTML: unifiedSection.innerHTML.includes(progressiveData.unifiedMessage || ''),
      actualMessage: progressiveData.unifiedMessage,
      searchFor: progressiveData.unifiedMessage,
      foundInHTML: unifiedSection.innerHTML.indexOf(progressiveData.unifiedMessage || '')
    });
    
    // Verify the element is actually in the DOM
    const verifyElement = document.querySelector('.unified-section');
    console.log('[OverlayManager] DOM verification:', {
      elementExists: !!verifyElement,
      elementVisible: verifyElement ? window.getComputedStyle(verifyElement).display !== 'none' : false,
      hasContent: verifyElement ? verifyElement.innerHTML.length > 0 : false,
      parentVisible: verifyElement?.parentElement ? window.getComputedStyle(verifyElement.parentElement).display !== 'none' : false
    });
  },
  
  /**
   * Transform data into progressive improvement format
   */
  transformToProgressiveFormat(data) {
    const completeness = data.completeness || 0;
    const contentScore = data.contentScore || 0;
    const missingItems = data.completenessData?.recommendations || [];
    
    // Debug logging for unified message
    console.log('[OverlayManager] transformToProgressiveFormat - Input data:', {
      completeness,
      contentScore,
      hasMissingItems: missingItems.length > 0,
      missingItemsCount: missingItems.length,
      dataCompleteness: data.completeness,
      dataContentScore: data.contentScore
    });
    
    // Add to debug log
    window.elevateliDebug.addLog('OverlayManager', 'transformToProgressiveFormat START', {
      completeness,
      contentScore,
      hasData: !!data,
      dataKeys: Object.keys(data || {})
    });
    
    // Log only if experience_roles data exists (reduced verbosity)
    if (data.sectionScores?.experience_roles?.length > 0) {
      SmartLogger.log('UI.EXPERIENCE', 'Experience roles data available', {
        rolesCount: data.sectionScores.experience_roles.length,
        hasOverallAnalysis: !!data.sectionScores.experience_overall
      });
    }
    
    // Convert recommendations object to flat array
    let recommendationsArray = [];
    if (data.recommendations) {
      if (Array.isArray(data.recommendations)) {
        recommendationsArray = data.recommendations;
      } else if (typeof data.recommendations === 'object') {
        // Handle {critical: [], important: [], niceToHave: []} structure
        const { critical = [], important = [], niceToHave = [] } = data.recommendations;
        recommendationsArray = [...critical, ...important, ...niceToHave];
      }
    } else {
      // console.log('[OverlayManager] No recommendations found in data');
    }
    
    // Apply recommendation allocation algorithm only if we have recommendations
    const allocation = this.calculateRecommendationMix(completeness);
    if (recommendationsArray.length > 0) {
      recommendationsArray = this.filterRecommendationsByAllocation(
        recommendationsArray, 
        missingItems, 
        allocation
      );
    }
    
    // console.log('[OverlayManager] transformToProgressiveFormat input:', {
    //   completeness,
    //   contentScore,
    //   missingItemsCount: missingItems.length,
    //   recommendationsCount: recommendationsArray.length,
    //   recommendations: data.recommendations,
    //   recommendationsArray: recommendationsArray,
    //   dataKeys: Object.keys(data),
    //   hasSectionScores: !!data.sectionScores,
    //   sectionScoreKeys: data.sectionScores ? Object.keys(data.sectionScores) : 'none'
    // });
    
    // Generate coaching summary
    const coachingSummary = this.generateCoachingSummary(completeness, contentScore, data);
    
    // Analyze sections and create improvements
    const sections = this.analyzeSections(data, missingItems, recommendationsArray || []);
    
    // Generate unified message
    window.elevateliDebug.addLog('OverlayManager', 'Before generateUnifiedMessage', {
      completeness,
      contentScore,
      sectionsLength: sections?.length,
      sections: sections?.map(s => ({ name: s.name, rating: s.rating }))
    });
    
    const unifiedMessage = this.generateUnifiedMessage(completeness, contentScore, sections, data);
    
    window.elevateliDebug.addLog('OverlayManager', 'After generateUnifiedMessage', {
      unifiedMessage,
      messageLength: unifiedMessage?.length,
      messageType: typeof unifiedMessage,
      isEmpty: !unifiedMessage || unifiedMessage.trim() === ''
    });
    
    console.log('[OverlayManager] Generated unified message:', {
      unifiedMessage,
      completenessUsed: completeness,
      contentScoreUsed: contentScore,
      sectionsCount: sections.length
    });
    
    return {
      coachingSummary,
      sections,
      unifiedMessage
    };
  },
  
  /**
   * Get improvement limit based on rating
   */
  getImprovementLimit(rating, sectionName = '') {
    // Special case for Experience section - allow more recommendations
    if (sectionName === 'Experience') {
      if (rating >= 5) return 1;  // Only critical improvements for perfect scores
      return 3; // Allow up to 3 for experience section for all other ratings
    }
    
    // Default limits for other sections
    // 5 stars: Max 1 improvement (only if critical)
    // 4 stars: 1-2 improvements  
    // 3 stars or below: 2 improvements
    if (rating >= 5) return 1;
    if (rating >= 4) return 2;
    return 2;
  },

  /**
   * Convert AI score (0-10) to star rating (0-5)
   */
  scoreToRating(score) {
    // Handle null/undefined scores (error states)
    if (score === null || score === undefined) {
      return null;
    }
    
    if (score >= 9) return 5;
    if (score >= 7) return 4;
    if (score >= 5) return 3;
    if (score >= 3) return 2;
    if (score >= 1) return 1;
    return 0;
  },

  /**
   * Generate coaching summary
   */
  generateCoachingSummary(completeness, contentScore, data) {
    // Only show coaching summary from AI analysis
    if (data.insights?.coachingSummary) {
      return data.insights.coachingSummary;
    }
    
    // No coaching summary without AI - avoid duplicate messaging
    return null;
  },
  
  /**
   * Analyze sections and create improvements
   */
  analyzeSections(data, missingItems, recommendations) {
    const sections = [];
    
    // Check if we have sectionScores from AI analysis
    const sectionScores = data.sectionScores || {};
    const hasAIInsights = Object.keys(sectionScores).length > 0;
    const completeness = data.completenessScore || 0;
    
    // MODIFIED: Skip detailed sections if high completeness without AI
    if (completeness >= 75 && !hasAIInsights) {
      // Return single card prompting for AI configuration
      return [{
        name: 'Enable AI Analysis',
        icon: '🤖',
        rating: null,
        positive: 'Your profile structure meets LinkedIn best practices',
        improvements: [
          {
            action: 'Click the extension icon to open settings',
            rationale: 'Access configuration options'
          },
          {
            action: 'Enable AI toggle and add your API key',
            rationale: 'Unlock content quality analysis'
          },
          {
            action: 'Set target role for personalized recommendations',
            rationale: 'Get industry-specific insights'
          }
        ]
      }];
    }
    
    // console.log('[OverlayManager] analyzeSections - sectionScores:', {
    //   hasSectionScores: !!data.sectionScores,
    //   sectionScoreKeys: Object.keys(sectionScores),
    //   profileIntro: sectionScores.profile_intro,
    //   experienceRoles: sectionScores.experience_roles,
    //   skills: sectionScores.skills,
    //   hasAIInsights
    // });
    
    // Log detailed section content
    if (sectionScores.profile_intro) {
      // console.log('[OverlayManager] profile_intro details:', {
      //   score: sectionScores.profile_intro.score,
      //   hasPositiveInsight: !!sectionScores.profile_intro.positiveInsight,
      //   positiveInsightPreview: sectionScores.profile_intro.positiveInsight?.substring(0, 50),
      //   hasActionItems: !!sectionScores.profile_intro.actionItems,
      //   actionItemCount: sectionScores.profile_intro.actionItems?.length,
      //   allKeys: Object.keys(sectionScores.profile_intro),
      //   fullObject: sectionScores.profile_intro
      // });
    }
    
    if (sectionScores.skills) {
      // console.log('[OverlayManager] skills details:', {
      //   score: sectionScores.skills.score,
      //   hasPositiveInsight: !!sectionScores.skills.positiveInsight,
      //   positiveInsightPreview: sectionScores.skills.positiveInsight?.substring(0, 50),
      //   hasActionItems: !!sectionScores.skills.actionItems,
      //   actionItemCount: sectionScores.skills.actionItems?.length
      // });
    }
    
    // Profile photo section - show if missing (completeness) or vision AI available
    const photoMissing = missingItems.some(item => item.section === 'photo');
    const photoRec = missingItems.find(item => item.section === 'photo');
    
    // Check if vision AI is available
    // Get settings from data object if available
    const settings = data.settings || {};
    const hasVisionAI = settings.aiProvider === 'openai' && 
                        settings.aiModel === 'gpt-4o' && 
                        settings.enableAI === true;
    
    // Only show photo as a separate section if it's missing (for completeness)
    // When photo exists, it's included in the First Impression section
    if (photoMissing) {
      let photoSection = {
        name: 'Profile Photo',
        priority: 'normal',
        rating: null, // Show blank stars for missing photo
        positive: null,
        improvements: [{
          text: photoRec?.message || "Add a professional photo", 
          why: "Profiles with photos get 21x more views"
        }]
      };
      
      sections.push(photoSection);
    }
    // Note: If photo exists, it's analyzed as part of First Impression section below
    // We don't show photo as a separate section when it exists
    
    // Banner section - only show if custom banner exists and vision AI available
    if (hasVisionAI) {
      // profileData should be part of the data object (extracted data from the profile)
      const hasCustomBanner = data.extractedData?.banner?.isCustomBanner || data.profileData?.banner?.isCustomBanner || false;
      
      if (hasCustomBanner) {
        let bannerSection = {
          name: 'Profile Banner',
          priority: 'normal'
        };
        
        // Check for banner analysis results
        const bannerScore = sectionScores.profile_banner;
        if (bannerScore && typeof bannerScore.score === 'number') {
          // Banner analysis completed
          bannerSection.rating = bannerScore.score;
          bannerSection.positive = bannerScore.positive || bannerScore.analysis;
          bannerSection.improvements = bannerScore.improvements || [];
          if (bannerScore._cacheInfo?.cached) {
            bannerSection.cached = true;
          }
        } else {
          // Banner analysis not yet completed - show blank stars with tooltip
          bannerSection.rating = null;
          bannerSection.positive = null;
          bannerSection.improvements = [];
          bannerSection.requiresVision = true;
          bannerSection.tooltip = "Banner analysis requires GPT-4o vision AI";
        }
        
        sections.push(bannerSection);
      }
    }
    
    // [CRITICAL_PATH:FIRST_IMPRESSION_UI] - P0: Display unified first impression
    // Check for first impression analysis (new) or profile intro (legacy)
    const firstImpressionScore = sectionScores.first_impression;
    const profileIntroScore = sectionScores.profile_intro; // Legacy support
    
    // Debug logging
    console.log('[OverlayManager] First Impression Check:', {
      hasFirstImpression: !!firstImpressionScore,
      firstImpressionScore: firstImpressionScore?.score,
      hasProfileIntro: !!profileIntroScore,
      sectionScoreKeys: Object.keys(sectionScores)
    });
    
    // Headline section - now part of first impression
    const headlineMissing = missingItems.some(item => item.section === 'headline');
    const headlineRec = missingItems.find(item => item.section === 'headline');
    
    // If we have first impression analysis, use that for headline display
    const headlineAnalysis = firstImpressionScore || profileIntroScore;
    if (headlineAnalysis && headlineAnalysis.actionItems) {
      // Use AI insights for headline/first impression
      const headlineItems = headlineAnalysis.actionItems.filter(item => {
        // For first impression, filter by element type
        if (firstImpressionScore && item.element === 'headline') return true;
        if (item.section === 'headline') return true;
        // Support both old (what/how) and new (category/action) formats
        const text = (item.category || item.what || '')?.toLowerCase();
        return text.includes('headline') && !text.includes('about') && !text.includes('connection');
      });
      
      const headlineRating = this.scoreToRating(headlineAnalysis.score);
      sections.push({
        name: firstImpressionScore ? 'First Impression' : 'Headline',
        rating: headlineRating,
        errorType: headlineAnalysis.errorType || null,
        positive: firstImpressionScore ? 
          headlineAnalysis.unifiedImpression || headlineAnalysis.positiveInsight :
          headlineAnalysis.headlinePositive || headlineAnalysis.positiveInsight || headlineAnalysis.strengths?.[0] || null,
        improvements: headlineItems.map(item => ({
          text: item.action || item.what || 'Improvement needed',
          why: item.impact || item.how || 'Update your profile',
          impact: item.impact,
          priority: item.priority
        })).slice(0, this.getImprovementLimit(headlineRating)),
        priority: 'normal',
        // Add visual assessment details if available
        visualAssessment: firstImpressionScore ? headlineAnalysis.visualAssessment : null
      });
      
      // If first impression includes photo/banner info, add as sub-items
      if (firstImpressionScore && sections.length > 0) {
        const firstImpressionSection = sections[sections.length - 1];
        
        // Add missing elements as sub-items
        const photoMissing = missingItems.some(item => item.section === 'photo');
        const bannerDefault = data.extractedData?.banner && !data.extractedData.banner.isCustomBanner;
        
        if (photoMissing || bannerDefault) {
          firstImpressionSection.subItems = [];
          
          if (photoMissing) {
            firstImpressionSection.subItems.push({
              type: 'missing',
              text: 'Add professional photo',
              impact: 'Profiles with photos get 21x more views'
            });
          }
          
          if (bannerDefault) {
            firstImpressionSection.subItems.push({
              type: 'suggestion',
              text: 'Customize background banner',
              impact: 'Creates cohesive visual identity'
            });
          }
        }
      }
    } else {
      // Fallback to old logic - add positive message if headline passes completeness
      const headlineData = data.extractedData?.headline || 
                          data.completenessData?.breakdown?.headline?.data;
      let headlinePositive = null;
      
      if (!headlineRec && headlineData && headlineData.charCount >= 50) {
        headlinePositive = "✓ You have a professional headline";
      }
      
      sections.push({
        name: 'Headline',
        rating: null, // Always show blank stars without AI
        positive: headlinePositive,
        improvements: headlineRec ?
          [{text: headlineRec.message, why: "Your headline is the first thing recruiters see in search results"}] :
          [],
        priority: 'normal'
      });
    }
    
    // About/Summary section - now standalone
    const aboutMissing = missingItems.some(item => item.section === 'about');
    const aboutRec = missingItems.find(item => item.section === 'about');
    
    // Check for standalone about section analysis first, then profile_intro
    const aboutScore = sectionScores.about;
    
    if (aboutScore && aboutScore.actionItems) {
      // Use standalone about section analysis
      const aboutRating = this.scoreToRating(aboutScore.score);
      sections.push({
        name: 'About Section',
        rating: aboutRating,
        errorType: aboutScore.errorType || null,
        positive: aboutScore.positiveInsight || aboutScore.strengths?.[0] || null,
        improvements: aboutScore.actionItems.map(item => ({
          text: item.action || item.what || 'Improvement needed',
          why: item.impact || item.how || 'Update your profile',
          impact: item.impact,
          priority: item.priority
        })).slice(0, this.getImprovementLimit(aboutRating)),
        priority: 'normal'
      });
    } else if (profileIntroScore && profileIntroScore.actionItems) {
      // Filter actionItems for about section - check section tag first, then content
      const aboutItems = profileIntroScore.actionItems.filter(item => {
        // First check section tag if available
        if (item.section) {
          return item.section === 'about';
        }
        // Fallback to content-based filtering
        // Support both old (what/how) and new (category/action) formats
        const text = (item.category || item.what || '')?.toLowerCase();
        return text.includes('about') || 
               text.includes('opening line') ||
               text.includes('summary') ||
               (!text.includes('headline') && 
                !text.includes('connection'));
      });
      
      // Use About-specific positive insight if available
      let aboutPositive = profileIntroScore.aboutPositive || profileIntroScore.positiveInsight || profileIntroScore.strengths?.[0] || null;
      
      // Fallback only if we don't have section-specific feedback
      if (!profileIntroScore.aboutPositive && aboutPositive && aboutPositive.toLowerCase().includes('headline') && 
          !aboutPositive.toLowerCase().includes('about')) {
        aboutPositive = "Your About section provides professional context";
      }
      
      // Debug logging
      SmartLogger.log('UI.PROGRESSIVE', 'About section analysis', {
        originalPositive: profileIntroScore.positiveInsight,
        filteredPositive: aboutPositive,
        aboutItemsCount: aboutItems.length,
        aboutItems: aboutItems.map(item => ({ 
          what: item.category || item.what, 
          section: item.section 
        }))
      });
      
      const aboutRating = this.scoreToRating(profileIntroScore.score);
      sections.push({
        name: 'About Section',
        rating: aboutRating,
        positive: aboutPositive,
        improvements: aboutItems.map(item => ({
          text: item.action || item.what || 'Improvement needed',
          why: item.impact || item.how || 'Update your profile',
          impact: item.impact,
          priority: item.priority
        })).slice(0, this.getImprovementLimit(aboutRating)),
        priority: 'normal'
      });
    } else {
      // Fallback to old logic - add positive message if about passes completeness
      const aboutData = data.extractedData?.about || 
                       data.completenessData?.breakdown?.about?.data;
      let aboutPositive = null;
      
      if (!aboutRec && aboutData && aboutData.charCount >= 800) {
        aboutPositive = "✓ Comprehensive About section";
      }
      
      sections.push({
        name: 'About Section',
        rating: null, // Always show blank stars without AI
        positive: aboutPositive,
        improvements: aboutRec ?
          [{text: aboutRec.message, why: "A strong About section increases profile views by 40%"}] :
          [],
        priority: 'normal'
      });
    }
    
    // Experience section - check for AI analysis scores
    const experienceMissing = missingItems.some(item => item.section === 'experience');
    const experienceRec = missingItems.find(item => item.section === 'experience');
    
    console.log('[UI DEBUG] Experience section flow:', {
      experienceMissing,
      hasExperienceRec: !!experienceRec,
      experienceRecMessage: experienceRec?.message,
      missingItemsCount: missingItems.length,
      missingItemsSections: missingItems.map(item => item.section),
      hasSectionScores: !!sectionScores,
      hasExperienceOverall: !!sectionScores.experience_overall
    });
    
    // Check if we have experience AI scores
    let experienceRating = 0;
    let experiencePositive = null;
    let experienceImprovements = [];
    
    // ALWAYS check for AI scores FIRST - they take priority over completeness recommendations
    if (sectionScores.experience_overall || (sectionScores.experience_roles && Array.isArray(sectionScores.experience_roles))) {
      // Check for experience scores from AI analysis
      
      // Debug logging for experience scores
      console.log('[UI DEBUG] Experience scoring data:', {
        hasSectionScores: !!sectionScores,
        sectionScoreKeys: Object.keys(sectionScores),
        hasExperienceOverall: !!sectionScores.experience_overall,
        experienceOverallScore: sectionScores.experience_overall?.score,
        hasExperienceRoles: !!sectionScores.experience_roles,
        experienceRolesLength: sectionScores.experience_roles?.length
      });
      
      // Check if we have overall experience analysis
      if (sectionScores.experience_overall) {
        SmartLogger.log('UI.EXPERIENCE', 'Using overall experience analysis', {
          score: sectionScores.experience_overall.score,
          hasPositiveInsight: !!sectionScores.experience_overall.positiveInsight,
          actionItemsCount: sectionScores.experience_overall.actionItems?.length || 0
        });
        
        // Use overall experience score and feedback
        experienceRating = this.scoreToRating(sectionScores.experience_overall.score);
        experiencePositive = sectionScores.experience_overall.positiveInsight;
        
        // Use overall strategic actionItems
        if (sectionScores.experience_overall.actionItems?.length > 0) {
          experienceImprovements = sectionScores.experience_overall.actionItems
            .slice(0, this.getImprovementLimit(experienceRating, 'Experience'))
            .map(item => ({
              text: item.action || item.what || 'Improvement needed',
              why: item.impact || item.how || 'Update your experience',
              priority: item.priority
            }));
        }
      } else if (sectionScores.experience_roles && Array.isArray(sectionScores.experience_roles)) {
        // Fallback: calculate from individual roles if no overall analysis
        SmartLogger.log('UI.EXPERIENCE', 'No overall analysis, calculating from roles', {
          rolesCount: sectionScores.experience_roles.length
        });
        
        const experienceScores = [];
        sectionScores.experience_roles.forEach(role => {
          if (typeof role.score === 'number') {
            experienceScores.push(role.score);
          }
        });
        
        if (experienceScores.length > 0) {
          const avgScore = experienceScores.reduce((a, b) => a + b, 0) / experienceScores.length;
          experienceRating = Math.round(avgScore / 2);
          experiencePositive = "Your experience shows a strong professional journey with diverse roles";
          experienceImprovements = []; // Extract from AI insights when available
        } else {
          experienceRating = null; // No rating without AI
          experienceImprovements = [];
        }
      } else {
        // No AI scores at all, no rating - add positive message if experience passes completeness
        SmartLogger.log('UI.EXPERIENCE', 'No AI analysis available');
        experienceRating = null; // No rating without AI
        experienceImprovements = [];
        
        // Add positive message if has current role and sufficient experience
        const experienceData = data.extractedData?.experience || 
                             data.completenessData?.breakdown?.experience?.data;
        if (!experienceRec && experienceData) {
          if (experienceData.hasCurrentRole) {
            experiencePositive = "✓ Your experience section is up to date";
          } else if (experienceData.count >= 2) {
            experiencePositive = `✓ ${experienceData.count} professional experiences documented`;
          }
        }
      }
      
      // If we still don't have improvements but have completeness recommendation, add it
      if (experienceImprovements.length === 0 && experienceRec) {
        experienceImprovements.push({text: experienceRec.message, why: "Work experience is essential for profile visibility"});
      }
    } else if (experienceRec) {
      // No AI scores and we have completeness recommendation
      experienceRating = null; // Show blank stars
      experienceImprovements = [{text: experienceRec.message, why: "Work experience is essential for profile visibility"}];
    }
    
    // Create main experience section
    console.log('[UI DEBUG] Final experience values before pushing:', {
      experienceRating,
      experiencePositive,
      experienceImprovementsCount: experienceImprovements.length,
      hasSectionScores: !!data.sectionScores,
      hasExperienceOverall: !!data.sectionScores?.experience_overall
    });
    
    const experienceSection = {
      name: 'Experience',
      rating: experienceRating,
      errorType: sectionScores.experience_overall?.errorType || null,
      positive: experiencePositive,
      improvements: experienceImprovements,
      priority: 'normal',
      hasSubSections: sectionScores.experience_roles && sectionScores.experience_roles.length > 0,
      subSections: []
    };
    
    // Add individual role feedback if available
    if (sectionScores.experience_roles && Array.isArray(sectionScores.experience_roles)) {
      // Sort roles by score (highest first) and limit to top 3 for UI clarity
      const topRoles = sectionScores.experience_roles
        .filter(role => role.analysis && (role.analysis.title || role.analysis.company))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 3);
      
      // Smart limit: max 3 improvements total across all roles
      let totalImprovements = 0;
      const maxTotalImprovements = 3;
      
      topRoles.forEach(role => {
        if (role.analysis && role.analysis.title && totalImprovements < maxTotalImprovements) {
          // Calculate how many improvements this role can have
          const remainingSlots = maxTotalImprovements - totalImprovements;
          const roleImprovements = (role.actionItems || [])
            .slice(0, Math.min(1, remainingSlots)) // Max 1 per role, but respect total limit
            .map(item => ({
              text: item.action || item.what || 'Improvement needed',
              why: item.impact || item.how || 'Update your experience',
              priority: item.priority
            }));
          
          // Only add the role section if it has improvements or positive feedback
          if (roleImprovements.length > 0 || role.positiveInsight) {
            const roleSection = {
              name: `${role.analysis.title} at ${role.analysis.company || 'Unknown Company'}`,
              rating: this.scoreToRating(role.score || 0),
              errorType: role.errorType || null,
              positive: role.positiveInsight,
              improvements: roleImprovements,
              isSubSection: true
            };
            
            experienceSection.subSections.push(roleSection);
            totalImprovements += roleImprovements.length;
          }
        }
      });
    }
    
    SmartLogger.log('UI.EXPERIENCE', 'Final experience section', {
      mainRating: experienceSection.rating,
      hasPositive: !!experienceSection.positive,
      mainImprovementsCount: experienceSection.improvements.length,
      hasSubSections: experienceSection.hasSubSections,
      subSectionsCount: experienceSection.subSections.length,
      subSectionDetails: experienceSection.subSections.map(sub => ({
        name: sub.name,
        rating: sub.rating,
        hasPositive: !!sub.positive,
        improvementsCount: sub.improvements.length
      }))
    });
    
    sections.push(experienceSection);
    
    // Skills section
    const skillsMissing = missingItems.some(item => item.section === 'skills');
    const skillsRec = missingItems.find(item => item.section === 'skills');
    
    // Check for AI insights for skills
    const skillsScore = sectionScores.skills;
    if (skillsScore && skillsScore.actionItems) {
      const skillsRating = this.scoreToRating(skillsScore.score);
      sections.push({
        name: 'Skills & Expertise',
        rating: skillsRating,
        errorType: skillsScore.errorType || null,
        positive: skillsScore.positiveInsight || skillsScore.strengths?.[0] || null,
        gapAnalysis: skillsScore.gapAnalysis,
        improvements: skillsScore.actionItems.slice(0, this.getImprovementLimit(skillsRating)).map(item => ({
          text: item.action || item.what || 'Improvement needed',
          why: item.impact || item.how || 'Update your skills',
          impact: item.impact,
          priority: item.priority
        })),
        priority: 'normal'
      });
    } else {
      // Add positive message if skills pass completeness
      const skillsData = data.extractedData?.skills || 
                        data.completenessData?.breakdown?.skills?.data;
      let skillsPositive = null;
      
      if (!skillsRec && skillsData && skillsData.count >= 10) {
        skillsPositive = `✓ Strong skills section with ${skillsData.count} skills`;
      }
      
      sections.push({
        name: 'Skills & Expertise',
        rating: null, // Always show blank stars without AI
        positive: skillsPositive,
        improvements: skillsRec ?
          [{text: skillsRec.message, why: "Profiles with skills appear in 13x more searches"}] :
          [],
        priority: 'normal'
      });
    }
    
    // Recommendations section - analyze HOW they're perceived
    const recommendationsMissing = missingItems.some(item => item.section === 'recommendations');
    const recommendationsRec = missingItems.find(item => item.section === 'recommendations');
    
    // Get recommendations data from various possible locations
    const recommendationsData = data.extractedData?.recommendations || 
                               data.completenessData?.breakdown?.recommendations?.data ||
                               data.recommendations;
    
    // Check if we actually have recommendations
    const hasRecommendations = recommendationsData && 
                              (recommendationsData.count > 0 || 
                               recommendationsData.receivedCount > 0 ||
                               recommendationsData.exists === true);
    
    // Analyze perception of existing recommendations
    let recommendationsPositive = null;
    let recommendationsRating = 0;
    let recommendationsImprovements = [];
    
    if (recommendationsRec) {
      recommendationsRating = null; // Show blank stars
      recommendationsImprovements = [{
        text: recommendationsRec.message,
        why: "Profiles with recommendations get 5x more inquiries"
      }];
    } else if (!hasRecommendations) {
      // Old logic for when we detect no recommendations through data
      recommendationsRating = null;
      recommendationsImprovements = [{
        text: "Request at least one recommendation",
        why: "Start with recent colleagues who can speak to your specific achievements"
      }];
    } else {
      // [CRITICAL_PATH:RECOMMENDATIONS_AI_DISPLAY] - P0: Must show AI analysis for recommendations
      // We have recommendations - check for AI insights
      const recommendationsScore = sectionScores.recommendations;
      
      if (recommendationsScore && typeof recommendationsScore.score === 'number') {
        // Use AI insights for recommendations
        recommendationsRating = this.scoreToRating(recommendationsScore.score);
        recommendationsPositive = recommendationsScore.positiveInsight || recommendationsScore.strengths?.[0] || null;
        
        // Extract improvements from AI analysis
        if (recommendationsScore.actionItems && recommendationsScore.actionItems.length > 0) {
          recommendationsImprovements = recommendationsScore.actionItems
            .slice(0, this.getImprovementLimit(recommendationsRating))
            .map(item => ({
              text: item.action || item.what || 'Improvement needed',
              why: item.impact || item.how || 'Update your recommendations',
              impact: item.impact,
              priority: item.priority
            }));
        }
      } else {
        // No AI insights - show completeness only
        recommendationsRating = null; // No rating without AI
        recommendationsPositive = null;
        recommendationsImprovements = [];
        
        // Add positive message if has recommendations
        if (hasRecommendations && recommendationsData.count > 0) {
          recommendationsPositive = `✓ You have ${recommendationsData.count} recommendation${recommendationsData.count > 1 ? 's' : ''}`;
        }
      }
    }
    
    sections.push({
      name: 'Recommendations',
      rating: recommendationsRating,
      positive: recommendationsPositive,
      improvements: recommendationsImprovements,
      // Removed isDefaultRating - use null rating instead
      priority: 'high'  // Always show recommendations section
    });
    
    // Sort sections to match LinkedIn's visual hierarchy
    const sectionOrder = [
      'First Impression', // Includes photo + headline when photo exists
      'Profile Photo',    // Only shown when missing
      'Profile Banner',    // Only with vision AI
      'Headline',         // Only shown if no First Impression
      'About Section',
      'Experience',
      'Recommendations',
      'Skills & Expertise'
    ];
    
    sections.sort((a, b) => {
      const indexA = sectionOrder.indexOf(a.name);
      const indexB = sectionOrder.indexOf(b.name);
      // If section not in order list, put it at the end
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
    
    // Priority-based filtering:
    // 1. Always include high-priority sections
    // 2. Include all sections that need improvement (rating < 5)
    // 3. If space remains, include other sections up to a limit
    
    const highPrioritySections = sections.filter(section => section.priority === 'high');
    const needsImprovement = sections.filter(section => section.rating < 5 && section.priority !== 'high');
    const perfectSections = sections.filter(section => section.rating >= 5 && section.priority !== 'high');
    
    // Combine sections with priority order
    let finalSections = [...highPrioritySections, ...needsImprovement];
    
    // Add perfect sections if we have room (max 6-8 total sections)
    const maxSections = 8;
    const remainingSlots = maxSections - finalSections.length;
    if (remainingSlots > 0) {
      finalSections = [...finalSections, ...perfectSections.slice(0, remainingSlots)];
    }
    
    // Re-sort final sections to maintain LinkedIn order
    finalSections.sort((a, b) => {
      const indexA = sectionOrder.indexOf(a.name);
      const indexB = sectionOrder.indexOf(b.name);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
    
    return finalSections;
  },
  
  /**
   * Analyze how recommendations are perceived
   */
  analyzeRecommendationPerception(aiRecs, recData) {
    const result = {
      rating: 3, // Default middle rating
      positive: null,
      improvements: [],
      // Removed isDefaultRating
    };
    
    // Debug logging
    console.log('[Recommendations Debug]', {
      aiRecs: aiRecs,
      aiRecsLength: aiRecs?.length,
      recData: recData,
      recDataCount: recData?.count
    });
    
    // Check if we have AI analysis scores for recommendations
    const aiSectionScores = this.currentData?.sectionScores || {};
    const recommendationsScore = aiSectionScores.recommendations;
    if (recommendationsScore && recommendationsScore.score) {
      // Use AI's detailed analysis of recommendation perception
      const score = recommendationsScore.score || 5;
      
      // Map AI score to star rating (1-10 to 1-5 stars)
      result.rating = Math.ceil(score / 2);
      
      // Extract perception insights from AI analysis
      if (score >= 8) {
        result.positive = "Your recommendations powerfully validate your expertise and achievements";
      } else if (score >= 6) {
        result.positive = "Recommendations provide solid credibility from diverse perspectives";
      } else if (score >= 4) {
        result.positive = "You have social proof, but recommendations could be more impactful";
      } else {
        result.positive = "Current recommendations need more specific examples of your impact";
      }
      
      // Look for specific perception feedback in recommendations
      const perceptionFeedback = aiRecs.filter(rec => {
        const text = (rec.text || '').toLowerCase();
        return text.includes('perceive') || text.includes('impression') || 
               text.includes('generic') || text.includes('specific') ||
               text.includes('credib') || text.includes('impact') ||
               text.includes('validate') || text.includes('strong');
      });
      
      console.log('[Recommendations Debug] perceptionFeedback:', {
        found: perceptionFeedback.length,
        items: perceptionFeedback
      });
      
      if (perceptionFeedback.length > 0) {
        // Use AI's specific feedback about how recommendations are perceived
        result.improvements = perceptionFeedback.slice(0, 2).map(rec => ({
          text: rec.text || "Improve recommendation quality",
          why: rec.why || "Enhances how your profile is perceived by recruiters",
          example: rec.example
        }));
      } else if (recommendationsScore.actionItems && recommendationsScore.actionItems.length > 0) {
        console.log('[Recommendations Debug] Using actionItems:', recommendationsScore.actionItems);
        // Use AI actionItems - handle both string and object formats
        // Limit improvements based on rating (5 stars = 1 improvement)
        const improvementLimit = result.rating >= 5 ? 1 : 2;
        result.improvements = recommendationsScore.actionItems.slice(0, improvementLimit).map(item => {
          if (typeof item === 'string') {
            // AI returned plain strings instead of objects
            // Try to parse the string to extract what and why
            const sentences = item.split(/\.(?=\s|$)/).filter(s => s.trim());
            const firstSentence = sentences[0] ? sentences[0].trim() + '.' : item;
            const remainingSentences = sentences.slice(1).join('. ').trim();
            
            console.log('[Recommendations Debug] Parsing string item:', {
              original: item,
              firstSentence: firstSentence,
              remainingSentences: remainingSentences
            });
            
            return {
              text: firstSentence, // AI now handles length (150-200 chars)
              why: remainingSentences || "This will enhance your profile's credibility and visibility"
            };
          } else {
            // Expected object format
            console.log('[Recommendations Debug] Processing object item:', item);
            return {
              text: item.action || item.what || item.text || "Improve recommendations",
              why: item.impact || item.how || item.why || "To enhance profile credibility",
              impact: item.impact,
              priority: item.priority
            };
          }
        });
      } else {
        console.log('[Recommendations Debug] Using fallback improvements');
        // Fallback to general improvements
        const fallbackImprovements = this.generateRecommendationImprovements(score, recData.count);
        console.log('[Recommendations Debug] Fallback improvements:', fallbackImprovements);
        result.improvements = fallbackImprovements;
      }
      
      // Ensure improvements is always an array with valid objects
      if (!Array.isArray(result.improvements) || result.improvements.length === 0) {
        console.log('[Recommendations Debug] No improvements found, using default');
        result.improvements = [{
          text: "Request specific recommendations that highlight your achievements",
          why: "Specific examples are more impactful than generic praise"
        }];
      }
    } else {
      // No AI analysis - check if we have any recommendation data
      const hasRecommendationData = recData && (recData.count > 0 || recData.recommendations?.length > 0);
      
      if (!hasRecommendationData) {
        // No recommendations at all
        result.rating = 0;
        result.positive = null;
        result.improvements = [{
          text: "Request recommendations to build credibility - profiles with 2+ get 5x more inquiries",
          why: "Start with recent colleagues who can speak to your specific achievements"
        }];
        // No default ratings - either proper rating or null
      } else {
        // We have recommendations but limited AI analysis
        const qualityInsights = aiRecs.filter(rec => {
          const text = (rec.text || '').toLowerCase();
          return text.includes('specific') || text.includes('generic') || 
                 text.includes('credib') || text.includes('impact') ||
                 text.includes('vague') || text.includes('strong');
        });
        
        if (qualityInsights.length > 0) {
          // AI has provided specific feedback about recommendation quality
          const hasPositiveFeedback = qualityInsights.some(rec => 
            (rec.text || '').toLowerCase().match(/strong|specific|credible|detailed|impressive/));
          
          const hasNegativeFeedback = qualityInsights.some(rec => 
            (rec.text || '').toLowerCase().match(/generic|vague|weak|improve/));
          
          if (hasPositiveFeedback && !hasNegativeFeedback) {
            result.rating = 4;
            result.positive = "Your recommendations effectively validate your expertise";
          } else if (hasPositiveFeedback && hasNegativeFeedback) {
            result.rating = 3;
            result.positive = "You have social proof from colleagues";
          } else if (hasNegativeFeedback) {
            result.rating = 2;
            result.positive = "Recommendations exist but could be more impactful";
          }
          
          // Add specific improvements from AI
          result.improvements = aiRecs.slice(0, 2).map(rec => ({
            text: rec.text,
            why: rec.why,
            example: rec.example
          }));
        } else {
          // No AI analysis available - set rating to null to show "AI required"
          result.rating = null;
          result.positive = "";
          result.improvements = [];
        }
      }
    }
    
    // Final validation to ensure improvements array is valid
    if (!Array.isArray(result.improvements)) {
      console.log('[Recommendations Debug] CRITICAL: improvements is not an array!', result.improvements);
      result.improvements = [];
    }
    
    // Ensure each improvement has required properties
    result.improvements = result.improvements.map((imp, index) => {
      if (typeof imp === 'string') {
        console.log(`[Recommendations Debug] Converting string improvement ${index} to object:`, imp);
        return { text: imp, why: "To enhance your profile effectiveness" };
      }
      if (!imp || typeof imp !== 'object') {
        console.log(`[Recommendations Debug] Invalid improvement ${index}:`, imp);
        return { text: "Enhance recommendation quality", why: "To improve profile credibility" };
      }
      return {
        text: imp.text || "Improve recommendations",
        why: imp.why || "To enhance profile effectiveness"
      };
    });
    
    console.log('[Recommendations Debug] Final result:', result);
    return result;
  },
  
  /**
   * Generate recommendation improvements based on score and count
   */
  generateRecommendationImprovements(score, count) {
    if (score && score >= 8) {
      return [{
        text: "Consider adding a C-level recommendation to further boost executive presence",
        why: "Senior endorsements significantly enhance credibility for leadership roles"
      }];
    } else if (score && score >= 6) {
      return [
        {
          text: "Request recommendations that quantify your specific business impact",
          why: "Numbers and metrics make your achievements more credible and memorable"
        },
        {
          text: "Seek a recommendation from a cross-functional partner to show collaboration",
          why: "Demonstrates your ability to work effectively across teams"
        }
      ];
    } else if (count >= 5) {
      return [{
        text: "Review older recommendations - update or request fresh ones highlighting recent wins",
        why: "Recent recommendations (last 1-2 years) carry more weight with recruiters"
      }];
    } else if (count >= 2) {
      return [
        {
          text: "Coach future recommenders to include specific metrics and outcomes",
          why: "Specific examples are 3x more impactful than generic praise"
        },
        {
          text: "Request recommendations from different perspectives (client, peer, manager)",
          why: "Diverse viewpoints demonstrate well-rounded leadership capabilities"
        }
      ];
    } else {
      return [
        {
          text: "Request 2-3 recommendations focusing on concrete achievements with numbers",
          why: "Profiles with 2+ recommendations receive 5x more inquiries"
        },
        {
          text: "Provide recommenders with bullet points of your key accomplishments to reference",
          why: "Makes it easier for them to write specific, impactful recommendations"
        }
      ];
    }
  },
  
  /**
   * Find recommendations matching keywords
   */
  findRecommendations(recommendations, keywords) {
    const results = [];
    
    // Guard against undefined or null recommendations
    if (!recommendations || !Array.isArray(recommendations)) {
      return results;
    }
    
    recommendations.forEach(rec => {
      const text = (rec.action?.what || rec.text || rec.message || '').toLowerCase();
      if (keywords.some(keyword => text.includes(keyword))) {
        results.push({
          text: rec.action?.what || rec.text || rec.message,
          why: rec.action?.why || rec.why,
          example: rec.action?.example || rec.example
        });
      }
    });
    
    return results;
  },
  
  /**
   * Render a section with star rating
   */
  renderSection(section) {
    // Generate a unique placeholder ID for this section's stars
    const starPlaceholderId = `star-placeholder-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store the star element to insert later
    if (!this.pendingStarElements) {
      this.pendingStarElements = [];
    }
    this.pendingStarElements.push({
      id: starPlaceholderId,
      element: this.renderStars(section.rating, section.errorType)
    });
    
    return `
      <div style="margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <h5 style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">
            ${section.name}
          </h5>
          <div class="star-rating" style="font-size: 16px;" data-star-placeholder="${starPlaceholderId}"></div>
        </div>
        ${section.positive ? `
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #057642;">
            ${section.positive}
          </p>
        ` : ''}
        ${section.improvements.length > 0 ? `
          <ul style="margin: 8px 0 0 0; padding-left: 20px; list-style: none;">
            ${section.improvements.map(imp => `
              <li style="margin-bottom: 6px; position: relative; padding-left: 8px; font-size: 12px; color: #666;">
                <span style="position: absolute; left: -8px;">→</span>
                ${typeof imp === 'string' ? imp : imp.text}
                ${imp.why ? `<div style="font-size: 11px; color: #999; margin-top: 2px; margin-left: 8px;">${imp.why}</div>` : ''}
              </li>
            `).join('')}
          </ul>
        ` : ''}
        
        <!-- Sub-sections for Experience roles -->
        ${section.hasSubSections && section.subSections && section.subSections.length > 0 ? `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 12px 0; font-size: 12px; color: #666; font-weight: 600;">Individual Role Analysis:</p>
            ${section.subSections.map(subSection => `
              <div style="margin-bottom: 12px; padding: 12px; background: white; border-radius: 6px; border-left: 3px solid ${this.getRatingColor(subSection.rating)};">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                  <h6 style="margin: 0; font-size: 13px; font-weight: 600; color: #333;">
                    ${subSection.name}
                  </h6>
                  <div class="star-rating" style="font-size: 14px;" data-star-placeholder="${(() => {
                    const subStarId = `star-placeholder-${Math.random().toString(36).substr(2, 9)}`;
                    this.pendingStarElements.push({
                      id: subStarId,
                      element: this.renderStars(subSection.rating, subSection.errorType)
                    });
                    return subStarId;
                  })()}"></div>
                </div>
                ${subSection.positive ? `
                  <p style="margin: 0 0 6px 0; font-size: 12px; color: #057642;">
                    ${subSection.positive}
                  </p>
                ` : ''}
                ${subSection.improvements && subSection.improvements.length > 0 ? `
                  <ul style="margin: 4px 0 0 0; padding-left: 16px; list-style: none;">
                    ${subSection.improvements.map(imp => `
                      <li style="margin-bottom: 4px; position: relative; padding-left: 6px; font-size: 12px; color: #666;">
                        <span style="position: absolute; left: -6px;">→</span>
                        ${typeof imp === 'string' ? imp : imp.text}
                        ${imp.why ? `<div style="font-size: 11px; color: #999; margin-top: 1px; margin-left: 6px;">${imp.why}</div>` : ''}
                      </li>
                    `).join('')}
                  </ul>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },
  
  /**
   * Render star rating
   */
  renderStars(rating, errorType = null) {
    const filled = '★';
    const empty = '☆';
    
    // Create wrapper span
    const wrapper = document.createElement('span');
    
    // If no rating (no AI analysis), show responsive display
    if (rating === null || rating === undefined) {
      const tooltip = this.getFailureTooltip(errorType);
      wrapper.title = tooltip;
      wrapper.style.cssText = 'cursor: help; opacity: 0.5;';
      
      // Visual stars span
      const visualSpan = document.createElement('span');
      visualSpan.className = 'stars-visual';
      visualSpan.textContent = empty.repeat(5);
      
      // Numeric span
      const numericSpan = document.createElement('span');
      numericSpan.className = 'stars-numeric';
      numericSpan.textContent = '0/5★';
      
      wrapper.appendChild(visualSpan);
      wrapper.appendChild(numericSpan);
      return wrapper;
    }
    
    // Calculate numerical rating for tooltip
    const numericalRating = rating.toFixed(1);
    let qualityText = '';
    if (rating >= 5) qualityText = 'Excellent';
    else if (rating >= 4) qualityText = 'Good';
    else if (rating >= 3) qualityText = 'Average';
    else if (rating >= 2) qualityText = 'Below Average';
    else qualityText = 'Needs Improvement';
    
    const tooltip = `${numericalRating}/5.0 - ${qualityText}`;
    wrapper.title = tooltip;
    
    // Create individual star spans with animation
    for (let i = 1; i <= 5; i++) {
      const starSpan = document.createElement('span');
      const delay = i * 0.1; // Stagger star animations
      if (i <= rating) {
        starSpan.style.cssText = `color: #f59e0b; animation-delay: ${delay}s`;
        starSpan.textContent = filled;
      } else {
        starSpan.style.cssText = `color: #d1d5db; animation-delay: ${delay}s`;
        starSpan.textContent = empty;
      }
      wrapper.appendChild(starSpan);
    }
    
    wrapper.style.cursor = 'help';
    return wrapper;
  },
  
  /**
   * Get tooltip for failure scenarios
   */
  getFailureTooltip(errorType) {
    const tooltipMap = {
      'ANALYSIS_FAILED': 'AI was unable to analyze this section',
      'RESPONSE_PARSE_ERROR': 'AI response could not be read',
      'DATA_READ_ERROR': 'AI was unable to read data for this section',
      'API_KEY_ERROR': 'Invalid API key - check settings',
      'DEFAULT': 'Enable AI analysis for quality insights'
    };
    
    return tooltipMap[errorType] || tooltipMap['DEFAULT'];
  },
  
  /**
   * Get color based on rating
   */
  getRatingColor(rating) {
    if (rating >= 4) return '#057642'; // Green
    if (rating >= 3) return '#f59e0b'; // Yellow/Orange
    return '#dc2626'; // Red
  },
  
  /**
   * Calculate recommendation mix based on completeness
   */
  calculateRecommendationMix(completenessScore) {
    // Diminishing returns on completeness recommendations
    const completenessWeight = Math.max(0.1, 1 - (completenessScore / 100) * 1.2);
    const qualityWeight = 1 - completenessWeight;
    
    return {
      completenessRecs: Math.round(8 * completenessWeight),
      qualityRecs: Math.round(8 * qualityWeight),
      completenessWeight,
      qualityWeight
    };
  },
  
  /**
   * Filter recommendations based on allocation
   */
  filterRecommendationsByAllocation(recommendations, missingItems, allocation) {
    const completenessRecs = [];
    const qualityRecs = [];
    
    // Guard against undefined or null recommendations
    if (!recommendations || !Array.isArray(recommendations)) {
      // console.log('[OverlayManager] No valid recommendations array to filter');
      return [];
    }
    
    // Categorize recommendations
    recommendations.forEach(rec => {
      const section = rec.section?.toLowerCase() || '';
      const action = rec.action?.what?.toLowerCase() || rec.text?.toLowerCase() || '';
      
      // Check if this is a completeness recommendation
      const isCompletenessRec = 
        missingItems.some(item => action.includes(item.section?.toLowerCase() || '')) ||
        action.includes('add') ||
        action.includes('missing') ||
        action.includes('create') ||
        action.includes('include') ||
        (section && missingItems.some(item => (item.section?.toLowerCase() || '').includes(section)));
      
      if (isCompletenessRec) {
        completenessRecs.push(rec);
      } else {
        qualityRecs.push(rec);
      }
    });
    
    // Apply allocation limits
    const selectedCompleteness = completenessRecs.slice(0, allocation.completenessRecs);
    const selectedQuality = qualityRecs.slice(0, allocation.qualityRecs);
    
    // Combine and limit to 8 total
    const combined = [...selectedCompleteness, ...selectedQuality].slice(0, 8);
    
    // console.log('[OverlayManager] Recommendation allocation:', {
    //   total: recommendations.length,
    //   completenessFound: completenessRecs.length,
    //   qualityFound: qualityRecs.length,
    //   completenessSelected: selectedCompleteness.length,
    //   qualitySelected: selectedQuality.length,
    //   finalCount: combined.length,
    //   allocation
    // });
    
    return combined;
  },
  
  /**
   * Generate unified positive message
   */
  generateUnifiedMessage(completeness, contentScore, sections, data) {
    // Add platform detection for debugging
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    console.log('[OverlayManager] generateUnifiedMessage called with:', {
      completeness,
      contentScore,
      sectionsLength: sections?.length,
      completenessType: typeof completeness,
      completenessValue: completeness,
      hasData: !!data,
      aiError: data?.aiError,
      settings: data?.settings,
      platform: navigator.platform,
      isMac
    });
    
    try {
      // Force safe type conversion
      const safeCompleteness = Number(completeness) || 0;
      const safeContentScore = Number(contentScore) || 0;
      
      // Initialize message parts array for safer concatenation
      const messageParts = [];
      
      // Check for AI failures first
      if (safeContentScore === 0 && data?.aiError && data?.settings?.enableAI) {
        // AI is enabled but analysis failed
        if (safeCompleteness >= 100) {
          return "✅ Your profile is 100% complete! ⚠️ AI analysis failed. Please try again.";
        } else {
          return `⚠️ AI analysis failed. Profile ${safeCompleteness}% complete. Please try again.`;
        }
      }
      
      // Check if this is from cache after AI failure
      if (data?.aiFailedWithCache && data?.cachedContentScore) {
        if (safeCompleteness >= 100) {
          return "✅ Your profile is 100% complete! AI analysis failed - showing previous results. Click 'Analyze' to retry.";
        } else {
          return `Profile ${safeCompleteness}% complete. AI analysis failed - showing previous results. Click 'Analyze' to retry.`;
        }
      }
      
      // Check if AI analysis has been run
      const hasAIAnalysis = sections && sections.some(section => section.rating !== null && section.rating !== undefined);
      
      // MODIFIED: Check for high completeness without AI first
      if (safeCompleteness >= 75 && !hasAIAnalysis) {
        // High completeness but no AI - prompt to enable AI
        if (safeCompleteness >= 100) {
          return "🎉 Your profile structure is perfect! Configure and Enable AI for comprehensive content quality analysis.";
        } else if (safeCompleteness >= 90) {
          return `🎯 Excellent profile structure! ${safeCompleteness}% complete. Configure and Enable AI for comprehensive content quality analysis.`;
        } else {
          return `📈 Strong profile foundation! ${safeCompleteness}% complete. Configure and Enable AI for comprehensive content quality analysis.`;
        }
      }
      
      // Build completeness message for < 75% or with AI
      let completenessMessage = "";
      
      // Completeness part with safe string concatenation
      if (safeCompleteness >= 100) {
        completenessMessage = "🎉 Your profile is 100% complete!";
      } else if (safeCompleteness >= 90) {
        completenessMessage = `🎯 Almost there! ${safeCompleteness}% complete.`;
      } else if (safeCompleteness >= 70) {
        completenessMessage = `📈 Great progress! ${safeCompleteness}% complete.`;
      } else if (safeCompleteness >= 50) {
        completenessMessage = `🚀 Good start! ${safeCompleteness}% complete.`;
      } else {
        completenessMessage = `💪 Let's build your profile! ${safeCompleteness}% complete.`;
      }
      
      messageParts.push(completenessMessage);
      
      // Add content quality if AI is enabled
      if (hasAIAnalysis) {
        try {
          const totalStars = sections.reduce((sum, section) => sum + (section.rating || 0), 0);
          const maxStars = sections.length * 5;
          const starProgress = Math.round((totalStars / maxStars) * 100);
          
          let qualityMessage = "";
          if (starProgress >= 80) {
            qualityMessage = " Content quality: Excellent.";
          } else if (starProgress >= 60) {
            qualityMessage = " Content quality: Good.";
          } else if (starProgress >= 40) {
            qualityMessage = " Content quality: Fair.";
          } else {
            qualityMessage = " Content quality: Needs improvement.";
          }
          messageParts.push(qualityMessage);
        } catch (e) {
          console.error('[OverlayManager] Error calculating star progress:', e);
          messageParts.push(" AI analysis complete.");
        }
      } else {
        // Only show AI nudge if completeness is < 75% - otherwise it's handled above
        // When < 75%, focus on structure first
        if (safeCompleteness < 75) {
          // Don't distract with AI - focus on completeness
          const structureMessage = " Focus on completing missing sections first.";
          messageParts.push(structureMessage);
        }
      }
      
      // Join all parts safely
      const finalMessage = messageParts.filter(Boolean).join('');
      
      console.log('[OverlayManager] generateUnifiedMessage returning:', {
        finalMessage,
        messageParts,
        partsLength: messageParts.length,
        finalLength: finalMessage.length,
        isMac
      });
      
      // Ensure we never return empty string
      return finalMessage || "Profile analysis complete.";
      
    } catch (error) {
      console.error('[OverlayManager] Error in generateUnifiedMessage:', error, {
        completeness,
        contentScore,
        platform: navigator.platform
      });
      
      // Fallback message that always works
      const fallbackCompleteness = Number(completeness) || 0;
      return `Profile ${fallbackCompleteness}% complete. Analysis results available above.`;
    }
  },
  
  /**
   * Show zero state for new users
   * @param {boolean} isAfterReset - True if showing after reset, false for initial setup
   */
  showZeroState(isAfterReset = false) {
    // Keep current view state - don't force expansion
    // Users can expand if they want to see the welcome message
    
    // Hide old sections
    const missingSection = this.overlayElement.querySelector('.missing-items-section');
    const recsSection = this.overlayElement.querySelector('.recommendations-section');
    
    if (missingSection) missingSection.classList.add('hidden');
    if (recsSection) recsSection.classList.add('hidden');
    
    // Hide score blocks
    const scoresContainer = this.overlayElement.querySelector('.scores-container');
    if (scoresContainer) scoresContainer.style.display = 'none';
    
    // Determine text based on context AND compliance
    let actionText = "Click the extension icon to get started";
    let timeText = "⏱️ Setup takes 30 seconds";
    let afterText = "After setup, you'll get:";
    
    // Check if setup is complete (has compliance)
    if (isAfterReset || this.hasCompliance) {
      actionText = "Click Analyze to analyze your profile";
      timeText = "⏱️ Analysis takes 30-60 seconds";
      afterText = "After analysis, you'll get:";
    }
    
    // Create or update unified section with welcome message
    let unifiedSection = this.overlayElement.querySelector('.unified-section');
    if (!unifiedSection) {
      unifiedSection = document.createElement('div');
      unifiedSection.className = 'unified-section';
      const expandedView = this.overlayElement.querySelector('.overlay-expanded-view');
      if (expandedView) {
        const header = expandedView.querySelector('.overlay-header');
        if (header && header.nextSibling) {
          header.parentNode.insertBefore(unifiedSection, header.nextSibling);
        } else {
          expandedView.appendChild(unifiedSection);
        }
      }
    }
    
    unifiedSection.innerHTML = `
      <div style="margin: 8px 0;">
        <div style="background: #f0f8ff; border: 1px solid #e7f3ff; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0 0 12px 0; font-size: 22px; color: #0a66c2;">
            Welcome to ElevateLI! 🚀
          </h3>
          <p style="font-size: 15px; line-height: 1.5; color: #333; margin-bottom: 16px;">
            Get data-driven insights for your LinkedIn profile
          </p>
          <div style="text-align: center; margin: 16px 0;">
            <p style="font-size: 14px; color: #666; margin: 8px 0;">${actionText}</p>
            <p style="font-size: 12px; color: #888; margin: 4px 0;">${timeText}</p>
          </div>
          
          <div style="background: #fff; padding: 16px 0; margin: 16px 0; border-top: 1px solid #e1e9ee;">
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #666; text-align: center;">${afterText}</p>
            <div class="feature-tiles" style="display: flex; justify-content: center; gap: 16px;">
              <div style="display: flex; align-items: center; padding: 10px 14px; background: #f0f8ff; border-radius: 6px;">
                <span style="color: #0a66c2; font-size: 18px; margin-right: 6px;">📊</span>
                <span style="font-size: 12px; color: #333;">Instant completeness analysis</span>
              </div>
              <div style="display: flex; align-items: center; padding: 10px 14px; background: #f0f8ff; border-radius: 6px;">
                <span style="color: #0a66c2; font-size: 18px; margin-right: 6px;">✨</span>
                <span style="font-size: 12px; color: #333;">Enhanced AI insights*</span>
              </div>
              <div style="display: flex; align-items: center; padding: 10px 14px; background: #f0f8ff; border-radius: 6px;">
                <span style="color: #0a66c2; font-size: 18px; margin-right: 6px;">🎯</span>
                <span style="font-size: 12px; color: #333;">Personalized recommendations*</span>
              </div>
            </div>
            <p style="margin: 8px 0 0 0; font-size: 10px; color: #888; text-align: center;">* AI setup unlocks enhanced features</p>
          </div>
          
        </div>
      </div>
    `;
    
    unifiedSection.classList.remove('hidden');
    
    // Also update collapsed view to show zero state values
    const completenessBadge = this.overlayElement.querySelector('.score-badge.completeness');
    const qualityBadge = this.overlayElement.querySelector('.score-badge.quality');
    const lastAnalyzedSpan = this.overlayElement.querySelector('.last-analyzed-collapsed');
    const analyzeBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    
    if (completenessBadge) {
      completenessBadge.innerHTML = '<span class="label-full">Completeness</span><span class="label-short">Complete</span>: —';
      completenessBadge.classList.remove('high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
    }
    if (qualityBadge) {
      qualityBadge.innerHTML = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: —';
      qualityBadge.classList.remove('ai-disabled', 'high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
    }
    if (lastAnalyzedSpan) lastAnalyzedSpan.textContent = 'Not analyzed';
    if (analyzeBtn) analyzeBtn.textContent = 'Analyze';
    
    // Update the status indicator with more informative text
    const statusText = this.overlayElement.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = 'Ready to analyze • Click extension icon to set up';
    }
  },
  
  /**
   * Hide unified view and show old sections
   */
  hideUnifiedView() {
    // Hide unified section
    const unifiedSection = this.overlayElement.querySelector('.unified-section');
    if (unifiedSection) {
      unifiedSection.classList.add('hidden');
    }
    
    // Restore the score blocks
    const scoresContainer = this.overlayElement.querySelector('.scores-container');
    if (scoresContainer) scoresContainer.style.display = '';
    
    // Show the old sections
    const missingSection = this.overlayElement.querySelector('.missing-items-section');
    const recsSection = this.overlayElement.querySelector('.recommendations-section');
    
    if (missingSection && missingSection.querySelector('.missing-items-list').children.length > 0) {
      missingSection.classList.remove('hidden');
    }
    if (recsSection && recsSection.querySelector('.recommendations-list').children.length > 0) {
      recsSection.classList.remove('hidden');
    }
  },

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {string} type - Type of toast: 'info', 'success', 'warning', 'error'
   * @param {number} duration - Duration in milliseconds (default: 5000)
   */
  showToast(message, type = 'info', duration = 5000) {
    // Remove any existing toasts
    const existingToasts = document.querySelectorAll('.elevateli-toast');
    existingToasts.forEach(toast => toast.remove());
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `elevateli-toast elevateli-toast-${type}`;
    
    // Create icon based on type
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    
    // Create content
    const icon = document.createElement('span');
    icon.className = 'elevateli-toast-icon';
    icon.textContent = icons[type] || icons.info;
    
    const text = document.createElement('span');
    text.className = 'elevateli-toast-text';
    text.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(text);
    
    // Add to body
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('elevateli-toast-show');
    });
    
    // Auto-dismiss
    const dismissTimer = setTimeout(() => {
      toast.classList.add('elevateli-toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
    
    // Click to dismiss
    toast.addEventListener('click', () => {
      clearTimeout(dismissTimer);
      toast.classList.add('elevateli-toast-hide');
      setTimeout(() => toast.remove(), 300);
    });
    
    return toast;
  },

  // ============================================================================
  // CENTRAL STATE RESTORATION SYSTEM
  // ============================================================================

  /**
   * Promise-based compliance check helper
   * @returns {Promise<Object|null>} Compliance data or null
   */
  async getCompliance() {
    return new Promise((resolve) => {
      try {
        if (!chrome?.storage?.local) {
          resolve(null);
          return;
        }
        
        chrome.storage.local.get(['compliance'], (data) => {
          if (chrome.runtime.lastError) {
            SmartLogger.log('STATE.RESTORATION', 'Failed to get compliance', { error: chrome.runtime.lastError });
            resolve(null);
            return;
          }
          resolve(data.compliance);
        });
      } catch (error) {
        SmartLogger.error('STATE.RESTORATION', 'Error getting compliance', error);
        resolve(null);
      }
    });
  },

  /**
   * Promise-based settings check helper
   * @returns {Promise<Object>} Settings object (empty if failed)
   */
  async getSettings() {
    return new Promise((resolve) => {
      try {
        if (!chrome?.storage?.local) {
          resolve({});
          return;
        }
        
        chrome.storage.local.get(['enableAI', 'apiKey', 'encryptedApiKey', 'aiProvider', 'aiModel'], (data) => {
          if (chrome.runtime.lastError) {
            SmartLogger.log('STATE.RESTORATION', 'Failed to get settings', { error: chrome.runtime.lastError });
            resolve({});
            return;
          }
          resolve(data);
        });
      } catch (error) {
        SmartLogger.error('STATE.RESTORATION', 'Error getting settings', error);
        resolve({});
      }
    });
  },

  /**
   * Pure function to determine overlay state from data and context
   * @param {Object|null} cachedData - Cached analysis data
   * @param {Object} settings - Current settings
   * @param {Object} compliance - Compliance status
   * @param {Object} context - Additional context (error info, etc.)
   * @returns {Object} State and data to set
   */
  /**
   * Get cached data for a profile
   * @param {string} profileId - Profile ID
   * @returns {Promise<Object|null>} Cached data or null
   */
  async getCachedData(profileId) {
    if (!profileId || !chrome?.storage?.local) {
      return null;
    }
    
    const cacheKey = `cache_${profileId}`;
    return new Promise((resolve) => {
      chrome.storage.local.get([cacheKey], (data) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(data[cacheKey] || null);
        }
      });
    });
  },
  
  determineStateFromData(cachedData, settings, compliance, context = {}) {
    // Check compliance first
    if (!compliance?.hasAcknowledged) {
      return {
        state: this.states.INITIALIZING,
        data: null
      };
    }

    // If we have cached data, restore it
    if (cachedData && cachedData.completeness !== undefined) {
      const hasApiKey = settings.apiKey || settings.encryptedApiKey;
      const enableAI = settings.enableAI && hasApiKey && settings.aiProvider;
      
      const stateData = {
        completeness: cachedData.completeness,
        contentScore: cachedData.contentScore,
        completenessData: cachedData.completenessData,
        recommendations: cachedData.recommendations,
        sectionScores: cachedData.sectionScores,
        timestamp: cachedData.timestamp,
        fromCache: true,
        aiDisabled: !enableAI,
        settings: {
          enableAI: settings.enableAI,
          aiProvider: settings.aiProvider,
          aiModel: settings.aiModel
        },
        ...context // Include any additional context (error messages, etc.)
      };

      // Choose appropriate state based on context
      if (context.isErrorFallback) {
        return {
          state: this.states.ANALYSIS_FAILED_CACHE_FALLBACK,
          data: {
            ...stateData,
            analysisError: context.error || 'Analysis error',
            message: context.message || 'Analysis failed. Showing cached results.'
          }
        };
      } else {
        return {
          state: this.states.COMPLETE,
          data: {
            ...stateData,
            fromCache: true,
            cacheRestored: true
          }
        };
      }
    }

    // No cache available - show empty state
    return {
      state: this.states.EMPTY_CACHE,
      data: null
    };
  },

  /**
   * Central method to restore appropriate overlay state
   * Replaces duplicate cache restoration logic throughout the codebase
   * @param {string|null} profileId - Profile ID (will extract from URL if not provided)
   * @param {Object} context - Additional context for state determination
   * @returns {Promise<boolean>} Success status
   */
  async restoreAppropriateState(profileId = null, context = {}) {
    try {
      // Prevent duplicate restoration attempts
      if (this.isRestoringState) {
        SmartLogger.log('STATE.RESTORATION', 'Restoration already in progress, skipping duplicate call', {
          profileId,
          lastRestoredProfile: this.lastRestoredProfile
        });
        return true;
      }
      
      // Skip restoration if we're already in a final state with data
      if (this.currentState === this.states.COMPLETE) {
        // Check if we have actual data displayed
        const hasScores = this.overlayElement?.querySelector('.completeness-score')?.textContent;
        if (hasScores && hasScores !== '0') {
          SmartLogger.log('STATE.RESTORATION', 'Already in COMPLETE state with data, skipping restoration', {
            currentState: this.currentState,
            hasScores: !!hasScores
          });
          return true;
        }
      }
      
      // Only skip restoration if actively analyzing
      if (this.currentState === this.states.AI_ANALYZING ||
          this.currentState === this.states.ANALYZING ||
          this.currentState === this.states.SCANNING ||
          this.currentState === this.states.EXTRACTING ||
          this.currentState === this.states.CALCULATING) {
        SmartLogger.log('STATE.RESTORATION', 'Skipping restoration - analysis in progress', {
          currentState: this.currentState,
          profileId
        });
        return true; // Don't interrupt active analysis
      }
      
      // Get profile ID if not provided
      if (!profileId) {
        // Try to extract profile ID from URL
        try {
          profileId = extractProfileIdFromUrl();
        } catch (error) {
          SmartLogger.log('STATE.RESTORATION', 'Error extracting profile ID', { error: error.message });
          // Don't fail restoration just because of profile ID extraction
          // The function might be temporarily unavailable
        }
        
        if (!profileId) {
          SmartLogger.log('STATE.RESTORATION', 'No profile ID available for state restoration');
          // Don't return false here - let restoration continue without profile ID
          // Some operations might still work
        }
      }
      
      // Set restoration flag to prevent duplicates
      this.isRestoringState = true;

      // Get compliance, settings and cached data in parallel with individual error handling
      let compliance = null;
      let settings = null;
      let cachedData = null;
      
      try {
        [compliance, settings, cachedData] = await Promise.all([
          this.getCompliance().catch(err => {
            SmartLogger.log('STATE.RESTORATION', 'Failed to get compliance', err);
            return null;
          }),
          this.getSettings().catch(err => {
            SmartLogger.log('STATE.RESTORATION', 'Failed to get settings', err);
            return {};
          }),
          this.getCachedData(profileId).catch(err => {
            SmartLogger.log('STATE.RESTORATION', 'Failed to get cached data', err);
            return null;
          })
        ]);
      } catch (promiseError) {
        SmartLogger.log('STATE.RESTORATION', 'Promise.all failed', promiseError);
        // Continue with null values
      }
      
      SmartLogger.log('STATE.RESTORATION', 'Data loaded', {
        profileId,
        hasCache: !!cachedData,
        hasCompliance: !!compliance?.hasAcknowledged
      });
      
      // Determine appropriate state
      const stateInfo = this.determineStateFromData(cachedData, settings, compliance, context) || 
                        { state: this.states.EMPTY_CACHE, data: null };
      
      const { state, data } = stateInfo;

      // Set the determined state
      this.setState(state, data);
      
      SmartLogger.log('STATE.RESTORATION', 'Restoration complete', {
        state: state,
        profileId: profileId
      });
      
      // Update last restored profile and clear restoration flag
      this.lastRestoredProfile = profileId;
      this.isRestoringState = false;

      return true;

    } catch (error) {
      // Create a proper error object if needed
      const errorObj = error instanceof Error ? error : 
        new Error(typeof error === 'string' ? error : 'Unknown restoration error');
      
      SmartLogger.error('STATE.RESTORATION', 'Restoration failed', errorObj, {
        profileId: profileId,
        currentState: this.currentState
      });
      
      // Only fallback to empty cache if we're not already in a good state
      // Don't overwrite COMPLETE state with EMPTY_CACHE
      if (this.currentState !== this.states.COMPLETE && 
          this.currentState !== this.states.AI_ANALYZING &&
          this.currentState !== this.states.ANALYZING) {
        try {
          this.setState(this.states.EMPTY_CACHE);
        } catch (fallbackError) {
          const fallbackErrorObj = fallbackError instanceof Error ? fallbackError : 
            new Error(typeof fallbackError === 'string' ? fallbackError : 'Fallback state setting failed');
          SmartLogger.error('STATE.RESTORATION', 'Fallback state setting failed', fallbackErrorObj, {
            profileId: profileId
          });
        }
      } else {
        SmartLogger.log('STATE.RESTORATION', 'Keeping current state - already in valid state', {
          currentState: this.currentState
        });
      }
      
      // Clear restoration flag on error
      this.isRestoringState = false;
      
      return false;
    }
  }
};