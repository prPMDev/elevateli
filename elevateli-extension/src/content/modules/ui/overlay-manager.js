/**
 * Overlay Manager Module for ElevateLI
 * Handles progressive UI states and smooth transitions
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const OverlayManager = {
  // Feature Flags (DEMO ONLY - Remove before production)
  FEATURES: {
    unifiedView: true  // Toggle for before/after demo - NEW UI ENABLED
  },
  
  // UI States
  states: {
    INITIALIZING: 'initializing',
    EMPTY_CACHE: 'empty_cache',
    CACHE_LOADED: 'cache_loaded',
    SCANNING: 'scanning',
    EXTRACTING: 'extracting',
    CALCULATING: 'calculating',
    ANALYZING: 'analyzing',
    AI_ANALYZING: 'ai_analyzing',
    COMPLETE: 'complete',
    ERROR: 'error',
    ANALYSIS_FAILED_CACHE_FALLBACK: 'analysis_failed_cache_fallback'
  },
  
  // Current state tracking
  currentState: null,
  overlayElement: null,
  viewState: 'expanded', // Default to expanded (old UI) unless feature flag is on
  currentData: null, // Store the full analysis data for reference
  
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
    console.log('[OverlayManager] Initializing overlay');
    
    // Check if user wants to show analysis
    const settings = await chrome.storage.local.get(['showAnalysis']);
    if (settings.showAnalysis === false) {
      console.log('[OverlayManager] Show analysis is disabled, skipping initialization');
      return this;
    }
    
    this.setState(this.states.INITIALIZING);
    
    // Set initial viewState based on feature flag
    if (this.FEATURES.unifiedView) {
      this.viewState = 'collapsed';
    } else {
      this.viewState = 'expanded';
    }
    
    // Try to inject immediately
    this.createAndInject();
    
    // If injection failed, retry with delays
    if (!this.overlayElement) {
      console.log('[OverlayManager] Initial injection failed, scheduling retries...');
      
      // Retry after DOM settles
      setTimeout(() => {
        if (!this.overlayElement) {
          console.log('[OverlayManager] Retrying injection (attempt 2)...');
          this.createAndInject();
        }
      }, 1000);
      
      // Final retry after LinkedIn finishes loading
      setTimeout(() => {
        if (!this.overlayElement) {
          console.log('[OverlayManager] Final injection attempt (attempt 3)...');
          this.createAndInject();
        }
      }, 3000);
    }
    
    return this;
  },
  
  /**
   * Create overlay HTML with skeleton UI
   */
  createAndInject() {
    // Create wrapper for proper integration
    const wrapperHtml = `
      <div class="elevateli-overlay-wrapper artdeco-card pv-profile-card break-words mt4">
        <div id="elevateli-overlay" class="elevateli-overlay ${this.FEATURES.unifiedView ? 'unified-ui' : 'classic-ui'}" data-state="${this.currentState}" data-view-state="${this.viewState}">
          <!-- Collapsed view (new default) -->
          <div class="overlay-collapsed-view">
            <img src="${chrome.runtime.getURL('src/images/icon.png')}" class="brand-logo" alt="ElevateLI" />
            <span class="brand-name">ElevateLI</span>
            <span class="score-badge completeness">Completeness: --</span>
            <span class="score-badge quality">Content Quality (AI): --</span>
            <div class="spacer"></div>
            <span class="last-analyzed-collapsed"></span>
            <button class="analyze-btn-collapsed">Analyze</button>
            <a href="#" class="view-details-link">View details</a>
          </div>
          
          <!-- Expanded view (existing content) -->
          <div class="overlay-expanded-view">
          ${!this.FEATURES.unifiedView ? `
          <!-- Classic UI Header -->
          <div class="overlay-header">
            <div class="header-left">
              <h3>ElevateLI Analysis</h3>
              <span class="last-analyzed" style="font-size: 12px; color: #666; margin-left: 12px; opacity: 0;"></span>
            </div>
            <div class="header-right">
              <button class="overlay-close" aria-label="Close overlay">&times;</button>
            </div>
          </div>
          ` : ''}
          <!-- DEMO TOGGLE in expanded view - Remove before production -->
          <!-- Commented out for production release - uncomment for development
          <div style="text-align: right; margin-bottom: 10px;">
            <button class="demo-toggle-expanded" style="font-size: 11px; padding: 4px 8px; background: #f3f4f6; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
              Demo: ${this.FEATURES.unifiedView ? 'NEW' : 'OLD'}
            </button>
          </div>
          -->
        
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
              <span class="score-suffix">/10</span>
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
            Re-analyze
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
      applicationBody: !!document.querySelector('.application-outlet')
    });
    
    // Strategy 1: After the profile top card (most common location)
    const topCard = document.querySelector('.pv-top-card');
    if (topCard && topCard.parentElement) {
      Logger.info('[OverlayManager] Injecting after profile top card');
      topCard.parentElement.insertAdjacentHTML('afterend', wrapperHtml);
      injected = true;
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
    
    // Strategy 5: Inside main content area
    if (!injected) {
      const mainContent = document.querySelector('main.scaffold-layout__main, main[role="main"]');
      if (mainContent) {
        // Find the container that holds profile sections
        const profileContainer = mainContent.querySelector('.pv-profile-body-container, .scaffold-layout__inner');
        if (profileContainer) {
          Logger.info('[OverlayManager] Injecting in profile container');
          profileContainer.insertAdjacentHTML('afterbegin', wrapperHtml);
          injected = true;
        } else {
          Logger.info('[OverlayManager] Injecting at beginning of main content');
          mainContent.insertAdjacentHTML('afterbegin', wrapperHtml);
          injected = true;
        }
      }
    }
    
    // Strategy 6: Any artdeco-card (very generic fallback)
    if (!injected) {
      const anyCard = document.querySelector('section.artdeco-card');
      if (anyCard) {
        Logger.info('[OverlayManager] Injecting after first artdeco card (generic fallback)');
        anyCard.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 7: Look for profile wrapper with data attributes
    if (!injected) {
      const profileWrapper = document.querySelector('[data-generated-suggestion-target]');
      if (profileWrapper) {
        Logger.info('[OverlayManager] Injecting after profile wrapper');
        profileWrapper.insertAdjacentHTML('afterend', wrapperHtml);
        injected = true;
      }
    }
    
    // Strategy 8: Look for any element with class containing "profile"
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
            // Update CSS class
            if (this.FEATURES.unifiedView) {
              this.overlayElement.classList.add('unified-ui');
            } else {
              this.overlayElement.classList.add('classic-ui');
            }
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
    
    console.log('[OverlayManager] Overlay injected into DOM');
  },
  
  /**
   * Attach event listeners to overlay elements
   */
  attachEventListeners() {
    // Close button (classic UI only)
    const closeBtn = this.overlayElement.querySelector('.overlay-close');
    closeBtn?.addEventListener('click', () => this.close());
    
    // Analyze button (for first-time analysis)
    const analyzeBtn = this.overlayElement.querySelector('.analyze-button');
    analyzeBtn?.addEventListener('click', () => this.handleAnalyze());
    
    // Refresh button (for re-analysis)
    const refreshBtn = this.overlayElement.querySelector('.refresh-button');
    refreshBtn?.addEventListener('click', () => this.handleRefresh());
    
    // Details button
    const detailsBtn = this.overlayElement.querySelector('.details-button');
    detailsBtn?.addEventListener('click', () => this.handleViewDetails());
    
    // Analyze button (collapsed view)
    const analyzeBtnCollapsed = this.overlayElement.querySelector('.analyze-btn-collapsed');
    analyzeBtnCollapsed?.addEventListener('click', () => this.handleAnalyze());
    
    // View details link (collapsed view)
    const viewDetailsLink = this.overlayElement.querySelector('.view-details-link');
    viewDetailsLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleView();
    });
    
    // Demo toggle button in expanded view (DEMO ONLY)
    const demoToggleExpanded = this.overlayElement.querySelector('.demo-toggle-expanded');
    demoToggleExpanded?.addEventListener('click', () => this.toggleFeature());
  },
  
  /**
   * Update overlay state and UI
   * @param {string} newState - New state from states enum
   * @param {Object} data - Data for the new state
   */
  setState(newState, data = {}) {
    console.log(`[OverlayManager] State change: ${this.currentState} → ${newState}`, {
      hasData: !!data,
      dataKeys: Object.keys(data),
      completeness: data.completeness,
      contentScore: data.contentScore,
      hasRecommendations: !!data.recommendations,
      recommendationType: typeof data.recommendations
    });
    this.currentState = newState;
    
    if (!this.overlayElement) return;
    
    this.overlayElement.setAttribute('data-state', newState);
    
    // State-specific updates
    const stateHandlers = {
      [this.states.INITIALIZING]: () => {
        this.updateStatus('Initializing analysis...', '⣾');
        this.showSkeletons();
        // Show analyze button for first-time analysis
        this.showActionButtons({ showAnalyze: true, showDetails: false });
      },
      
      [this.states.EMPTY_CACHE]: () => {
        this.updateStatus('No previous analysis found', 'ℹ️');
        this.hideSkeletons();
        
        // Check if in NEW UI to show appropriate zero state
        if (this.FEATURES.unifiedView) {
          // Show welcome message in unified section
          this.showZeroState();
        } else {
          // Show empty state message in OLD UI
          const scoresContainer = this.overlayElement.querySelector('.scores-container');
          if (scoresContainer) {
            // Clear existing content safely
            while (scoresContainer.firstChild) {
              scoresContainer.removeChild(scoresContainer.firstChild);
            }
            
            // Create empty state message using DOM methods
            const emptyStateDiv = document.createElement('div');
            emptyStateDiv.className = 'empty-state-message';
            emptyStateDiv.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 30px 20px; color: #666;';
            
            const iconDiv = document.createElement('div');
            iconDiv.style.cssText = 'font-size: 48px; margin-bottom: 16px; opacity: 0.3;';
            iconDiv.textContent = '📊';
            
            const titleP = document.createElement('p');
            titleP.style.cssText = 'margin-bottom: 12px; font-size: 16px; font-weight: 600;';
            titleP.textContent = 'This profile hasn\'t been analyzed yet';
            
            const subtitleP = document.createElement('p');
            subtitleP.style.cssText = 'font-size: 14px; color: #999;';
            subtitleP.textContent = 'Click below to generate your profile scores';
            
            emptyStateDiv.appendChild(iconDiv);
            emptyStateDiv.appendChild(titleP);
            emptyStateDiv.appendChild(subtitleP);
            scoresContainer.appendChild(emptyStateDiv);
          }
        }
        
        // Show prominent analyze button
        this.showActionButtons({ 
          showAnalyze: true,
          showRefresh: false,
          showDetails: false 
        });
      },
      
      [this.states.CACHE_LOADED]: () => {
        this.clearEmptyStateMessage();
        this.updateStatus('Analysis complete', '✓');
        this.hideSkeletons();
        this.populateScores(data);
        
        // Store the data for reference
        this.currentData = data;
        
        // Feature flag check
        if (this.FEATURES.unifiedView) {
          // NEW: Show unified view
          this.showUnifiedView(data);
          // In NEW UI, don't show action buttons in expanded view
          this.showActionButtons({ showRefresh: false });
        } else {
          // CURRENT: Show existing separate sections
          this.hideUnifiedView();
          this.showMissingItems(data.completenessData);
          if (data.recommendations) {
            this.showRecommendations(data.recommendations);
          } else {
            console.log('[OverlayManager] No recommendations in data');
            // Show a message indicating AI analysis is needed for recommendations
            this.showNoRecommendationsMessage();
          }
          // In OLD UI, show re-analyze button for cached results
          this.showActionButtons({ showRefresh: true });
        }
        
        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
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
        
        // Also clear unified section if in NEW mode
        const unifiedSection = this.overlayElement.querySelector('.unified-section');
        if (unifiedSection && this.FEATURES?.unifiedView) {
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
      
      [this.states.COMPLETE]: () => {
        this.clearEmptyStateMessage();
        this.updateStatus('Analysis complete', '✓');
        this.hideSkeletons();
        this.stopElapsedTimeDisplay();
        this.populateScores(data);
        
        // Store the full data for reference by other methods
        this.currentData = data;
        
        // Feature flag check for demo
        if (this.FEATURES.unifiedView) {
          // NEW: Show unified view (placeholder for now)
          this.showUnifiedView(data);
          // In NEW UI, don't show action buttons in expanded view
          this.showActionButtons({ showRefresh: false });
        } else {
          // CURRENT: Show existing separate sections
          this.hideUnifiedView();  // Make sure unified is hidden
          this.showMissingItems(data.completenessData);
          if (data.recommendations) {
            this.showRecommendations(data.recommendations);
          } else {
            console.log('[OverlayManager] No recommendations in data');
          }
          // In OLD UI, show re-analyze button after fresh analysis
          this.showActionButtons({ showRefresh: true });
        }
        
        this.showInsights(data.insights);
        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
      },
      
      [this.states.ERROR]: () => {
        // Stop elapsed time display if running
        this.stopElapsedTimeDisplay();
        
        // Determine error icon and message based on type
        let errorIcon = '❌';
        let errorMessage = data.message || 'Analysis failed';
        let showSettings = false;
        
        if (data.aiError) {
          switch (data.aiError.type) {
            case 'AUTH':
              errorIcon = '🔑';
              showSettings = true;
              break;
            case 'RATE_LIMIT':
              errorIcon = '⏱️';
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
          this.showActionButtons({ showSettings: true });
        } else {
          // Show refresh button to retry
          this.showActionButtons({ showRefresh: true });
        }
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
        
        // Feature flag check for demo
        if (this.FEATURES.unifiedView) {
          // NEW: Show unified view with cache fallback indicator
          this.showUnifiedView(data);
          // In NEW UI, don't show action buttons in expanded view
          this.showActionButtons({ showRefresh: false });
        } else {
          // CURRENT: Show existing separate sections
          this.hideUnifiedView();
          this.showMissingItems(data.completenessData);
          if (data.recommendations) {
            this.showRecommendations(data.recommendations);
          } else {
            console.log('[OverlayManager] No recommendations in data');
          }
          // In OLD UI, show re-analyze button
          this.showActionButtons({ showRefresh: true });
        }
        
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
        
        // Insert after status indicator
        const statusIndicator = this.overlayElement.querySelector('.status-indicator');
        if (statusIndicator) {
          statusIndicator.insertAdjacentElement('afterend', warningBanner);
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
      scoresContainer.appendChild(this.createScoreBlock('quality', 'Content Quality (AI)', '/10'));
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
      collapsedBadge.textContent = `Completeness: ${Math.round(score)}%`;
      // Remove old color classes
      collapsedBadge.classList.remove('high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
      
      // Apply new color system if using unified UI
      if (this.FEATURES.unifiedView) {
        const colorClass = this.getScoreClass(score, false);
        collapsedBadge.classList.add(colorClass);
      } else {
        // Keep old system for classic UI
        if (score >= 80) collapsedBadge.classList.add('high');
        else if (score >= 60) collapsedBadge.classList.add('medium');
        else collapsedBadge.classList.add('low');
      }
    }
  },
  
  /**
   * Populate all scores
   * @param {Object} data - Score data
   */
  populateScores(data) {
    // Log section scores if available
    if (data.sectionScores) {
      console.log('[OverlayManager] Section scores:', data.sectionScores);
    }
    
    // Update completeness
    if (data.completeness !== undefined) {
      this.updateCompleteness(data.completeness);
    }
    
    // Check if AI is disabled or API key error
    const qualityBadge = this.overlayElement.querySelector('.score-badge.quality');
    
    // Debug logging
    console.log('[OverlayManager] Quality badge update check:', {
      aiDisabled: data.aiDisabled,
      contentScore: data.contentScore,
      fromCache: data.fromCache,
      willShowEnableAI: data.aiDisabled || (!data.contentScore && data.fromCache !== true),
      qualityBadgeExists: !!qualityBadge
    });
    
    if (data.aiDisabled || (data.contentScore === undefined || data.contentScore === null) && data.fromCache !== true) {
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
      }
      // Update collapsed view badge
      if (qualityBadge) {
        if (data.apiKeyError) {
          qualityBadge.textContent = 'Content Quality (AI): Invalid Key';
          qualityBadge.classList.add('ai-disabled', 'error');
        } else {
          qualityBadge.textContent = 'Content Quality (AI): Enable AI';
          qualityBadge.classList.add('ai-disabled');
        }
      }
    } else if (data.contentScore !== undefined && data.contentScore !== null) {
      // Update quality score normally
      const valueEl = this.overlayElement.querySelector('.quality .score-value');
      const barEl = this.overlayElement.querySelector('.quality .score-bar-fill');
      const statusEl = this.overlayElement.querySelector('.ai-status');
      
      if (valueEl) {
        valueEl.textContent = data.contentScore.toFixed(1);
        valueEl.classList.remove('skeleton');
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
        console.log('[OverlayManager] Updating quality badge with score:', data.contentScore);
        qualityBadge.textContent = `Content Quality (AI): ${data.contentScore.toFixed(1)}/10`;
        qualityBadge.classList.remove('ai-disabled', 'high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
        
        // Apply new color system if using unified UI
        if (this.FEATURES.unifiedView) {
          const colorClass = this.getScoreClass(data.contentScore, true);
          qualityBadge.classList.add(colorClass);
        } else {
          // Keep old system for classic UI
          if (data.contentScore >= 8) qualityBadge.classList.add('high');
          else if (data.contentScore >= 6) qualityBadge.classList.add('medium');
          else qualityBadge.classList.add('low');
        }
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
    console.log('[OverlayManager] showRecommendations called with:', recommendations);
    
    // Add detailed logging for recommendations structure
    console.log('[OverlayManager] Recommendations structure:', {
      recommendations,
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
      console.log('[OverlayManager] No recommendations provided');
      return;
    }
    
    // Debug: Check if it's an empty object vs null/undefined
    if (typeof recommendations === 'object' && !Array.isArray(recommendations)) {
      const hasAnyRecommendations = 
        (recommendations.critical && recommendations.critical.length > 0) ||
        (recommendations.important && recommendations.important.length > 0) ||
        (recommendations.niceToHave && recommendations.niceToHave.length > 0);
      
      if (!hasAnyRecommendations) {
        console.log('[OverlayManager] Recommendations object is empty or has no items');
      }
    }
    
    const section = this.overlayElement.querySelector('.recommendations-section');
    const list = this.overlayElement.querySelector('.recommendations-list');
    
    if (!section || !list) {
      console.log('[OverlayManager] Recommendations section or list not found');
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
          console.warn('[OverlayManager] Invalid recommendation format:', {
            rec: rec,
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
    
    console.log('[OverlayManager] Final recommendations list:', {
      listChildrenCount: list.children.length,
      sectionClasses: section.className,
      willShow: list.children.length > 0
    });
    
    if (list.children.length > 0) {
      section.classList.remove('hidden');
      console.log('[OverlayManager] Showing recommendations section');
    } else {
      console.log('[OverlayManager] No recommendations to show, keeping section hidden');
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
        analyzeBtn.disabled = false;
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
    
    // For NEW UI, hide the entire actions div in expanded view
    if (this.FEATURES.unifiedView && actionsDiv) {
      actionsDiv.style.display = 'none';
      return; // Don't show any buttons in NEW UI expanded view
    }
    
    // For OLD UI, show the actions div
    if (actionsDiv) {
      actionsDiv.style.display = 'block';
    }
    
    // Hide all buttons first
    [analyzeBtn, refreshBtn, detailsBtn].forEach(btn => btn?.classList.add('hidden'));
    
    // Show appropriate buttons based on state
    if (options.showAnalyze && analyzeBtn) {
      analyzeBtn.classList.remove('hidden');
      // Update text based on current state
      if (this.currentState === this.states.EMPTY_CACHE) {
        this.updateButtonContent(analyzeBtn, '🚀', 'Analyze Profile');
      } else {
        this.updateButtonContent(analyzeBtn, '🔄', 'Re-analyze');
      }
    }
    if (options.showRefresh && refreshBtn) {
      refreshBtn.classList.remove('hidden');
      // Reset button state after analysis completes
      refreshBtn.disabled = false;
      this.updateButtonContent(refreshBtn, '🔄', 'Re-analyze');
    }
    if (options.showSettings && analyzeBtn) {
      // Repurpose analyze button for settings
      analyzeBtn.classList.remove('hidden');
      analyzeBtn.innerHTML = '<span class="button-icon">⚙️</span>Open Settings';
      // Change click handler temporarily
      analyzeBtn.onclick = (e) => {
        e.preventDefault();
        // Open extension popup/settings
        chrome.runtime.sendMessage({ action: 'openPopup' });
      };
    }
  },
  
  /**
   * Show progress bar
   * @param {string} phase - Current phase
   */
  showProgressBar(phase) {
    // Could add a progress bar UI element if desired
    console.log(`[OverlayManager] Progress phase: ${phase}`);
  },
  
  
  /**
   * Handle refresh button click (re-analysis)
   */
  handleRefresh() {
    console.log('[OverlayManager] Refresh requested');
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
    console.log('[OverlayManager] View details requested');
    const btn = this.overlayElement.querySelector('.details-button');
    if (btn) {
      btn.disabled = true;
    }
    // Open dashboard
    chrome.runtime.sendMessage({ action: 'openDashboard' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to open dashboard:', chrome.runtime.lastError);
        if (btn) btn.disabled = false;
      }
    });
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
    // TEMPORARILY COMMENTED OUT - Section score details display
    // Keeping for future use when we want to show progressive scoring
    return;
    
    /* 
    // Create or update section scores display
    let scoresDisplay = this.overlayElement.querySelector('.section-scores-display');
    if (!scoresDisplay) {
      scoresDisplay = document.createElement('div');
      scoresDisplay.className = 'section-scores-display';
      scoresDisplay.style.cssText = 'margin: 16px 0; padding: 12px; background: #f3f2ef; border-radius: 6px;';
      
      const statusIndicator = this.overlayElement.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.insertAdjacentElement('afterend', scoresDisplay);
      }
    }
    
    // Update or add section score
    let sectionItem = scoresDisplay.querySelector(`[data-section="${section}"]`);
    if (!sectionItem) {
      sectionItem = document.createElement('div');
      sectionItem.setAttribute('data-section', section);
      sectionItem.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 13px;';
      scoresDisplay.appendChild(sectionItem);
    }
    
    // Format section name
    const displayName = this.formatSectionName(section);
    const scoreColor = score >= 8 ? '#057642' : score >= 6 ? '#f59e0b' : '#dc2626';
    
    sectionItem.innerHTML = `
      <span>${displayName}</span>
      <span style="font-weight: 600; color: ${scoreColor};">${score.toFixed(1)}/10</span>
    `;
    
    // Add animation
    sectionItem.style.opacity = '0';
    setTimeout(() => {
      sectionItem.style.transition = 'opacity 0.3s ease';
      sectionItem.style.opacity = '1';
    }, 50);
    */
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
        <div style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;">🤖</div>
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
        " onclick="chrome.runtime.sendMessage({action: 'openPopup'})">
          Configure AI
        </button>
        <span style="font-size: 12px; color: #999;">
          or click "Re-analyze" with AI enabled
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
    
    if (lastAnalyzed) {
      lastAnalyzed.textContent = `Last analyzed: ${formatted}`;
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
    console.log('[OverlayManager] Resetting all buttons');
    
    if (!this.overlayElement) return;
    
    // Re-enable all action buttons
    const buttons = this.overlayElement.querySelectorAll('.action-button');
    buttons.forEach(btn => {
      btn.disabled = false;
      
      // Reset button text to original
      if (btn.classList.contains('analyze-button')) {
        btn.innerHTML = '<span class="button-icon">🚀</span>Analyze Profile';
      } else if (btn.classList.contains('refresh-button')) {
        btn.innerHTML = '<span class="button-icon">🔄</span>Re-analyze';
      } else if (btn.classList.contains('details-button')) {
        btn.innerHTML = '<span class="button-icon">📊</span>View Details';
      }
    });
    
    // Reset collapsed view button
    const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    if (collapsedBtn) {
      collapsedBtn.disabled = false;
      // Check if we have cached data to determine button text
      if (this.currentData || this.currentState === this.states.COMPLETE) {
        collapsedBtn.textContent = 'Re-analyze';
      } else {
        collapsedBtn.textContent = 'Analyze';
      }
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
    console.log('[OverlayManager] Analyze requested');
    const btn = this.overlayElement.querySelector('.analyze-button');
    const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="button-icon spinning">⏳</span>Analyzing...';
    }
    
    if (collapsedBtn) {
      collapsedBtn.disabled = true;
      collapsedBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Analyzing';
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
    console.log('[OverlayManager] Refresh requested');
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
      console.log('[OverlayManager] 3-minute timeout reached');
      this.resetButtons();
      
      // Don't set error state here - let the analyzer handle timeout
      // It will show partial results if available
      if (this.currentState === this.states.SCANNING || 
          this.currentState === this.states.EXTRACTING || 
          this.currentState === this.states.CALCULATING || 
          this.currentState === this.states.ANALYZING || 
          this.currentState === this.states.AI_ANALYZING) {
        console.log('[OverlayManager] Waiting for analyzer to handle timeout...');
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
      
      if (minutes > 0) {
        elapsedDisplay.textContent = `Elapsed: ${minutes}m ${seconds}s`;
      } else {
        elapsedDisplay.textContent = `Elapsed: ${seconds}s`;
      }
      
      // Progressive time estimates
      if (elapsed > 120) {
        elapsedDisplay.innerHTML += ' <span style="color: #059669;">(Almost done!)</span>';
      } else if (elapsed > 90) {
        elapsedDisplay.innerHTML += ' <span style="color: #0a66c2;">(Finalizing...)</span>';
      } else if (elapsed > 60) {
        elapsedDisplay.innerHTML += ' <span style="color: #f59e0b;">(Complex analysis in progress)</span>';
      }
    };
    
    updateElapsed();
    // Use longer interval to reduce performance impact
    this.elapsedTimeInterval = setInterval(updateElapsed, 5000);
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
    
    // Update link text
    const viewDetailsLink = this.overlayElement.querySelector('.view-details-link');
    if (viewDetailsLink) {
      viewDetailsLink.textContent = this.viewState === 'collapsed' ? 'View details' : 'Hide details';
    }
  },
  
  /**
   * Handle cancel analysis
   */
  handleCancelAnalysis() {
    console.log('[OverlayManager] Cancel analysis requested');
    
    // Reset buttons to enabled state
    this.resetButtons();
    
    // Send cancel message
    window.postMessage({ type: 'ELEVATE_CANCEL_ANALYSIS' }, '*');
    
    // If we have cached data, restore it
    const profileId = window.location.pathname.match(/\/in\/([^\/]+)/)?.[1];
    if (profileId) {
      chrome.storage.local.get([`cache_${profileId}`], (data) => {
        const cachedData = data[`cache_${profileId}`];
        if (cachedData) {
          // Restore to cached state
          this.setState(this.states.CACHE_LOADED, cachedData);
          this.updateStatus('Analysis cancelled - showing previous results', 'ℹ️');
        } else {
          // No cache, go back to empty state
          this.setState(this.states.EMPTY_CACHE);
          this.updateStatus('Analysis cancelled', 'ℹ️');
        }
      });
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
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      wrapper.style.display = 'block';
    } else {
      // Re-initialize if not present
      this.initialize();
    }
  },
  
  /**
   * Hide overlay
   */
  hide() {
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      wrapper.style.display = 'none';
    }
  },
  
  /**
   * Toggle feature flag (DEMO ONLY)
   */
  toggleFeature() {
    this.FEATURES.unifiedView = !this.FEATURES.unifiedView;
    
    // Update CSS class on overlay element
    if (this.overlayElement) {
      if (this.FEATURES.unifiedView) {
        this.overlayElement.classList.remove('classic-ui');
        this.overlayElement.classList.add('unified-ui');
        this.viewState = 'collapsed'; // Show collapsed view in new UI
      } else {
        this.overlayElement.classList.remove('unified-ui');
        this.overlayElement.classList.add('classic-ui');
        this.viewState = 'expanded'; // Show expanded view in old UI
      }
      
      // Update data attribute for view state
      this.overlayElement.setAttribute('data-view-state', this.viewState);
      
      // Update view details link text
      const viewDetailsLink = this.overlayElement.querySelector('.view-details-link');
      if (viewDetailsLink) {
        viewDetailsLink.textContent = this.viewState === 'collapsed' ? 'View details' : 'Hide details';
      }
    }
    
    // Update toggle button in expanded view
    const demoToggleExpanded = this.overlayElement?.querySelector('.demo-toggle-expanded');
    
    if (demoToggleExpanded) {
      demoToggleExpanded.textContent = `Demo: ${this.FEATURES.unifiedView ? 'NEW' : 'OLD'}`;
    }
    
    // If we're in complete state, refresh the view
    if (this.currentState === this.states.COMPLETE || 
        this.currentState === this.states.CACHE_LOADED) {
      // Get the last data and re-render
      const profileId = window.location.pathname.match(/\/in\/([^\/]+)/)?.[1];
      if (profileId) {
        chrome.storage.local.get([`cache_${profileId}`], (data) => {
          const cachedData = data[`cache_${profileId}`];
          if (cachedData) {
            // Re-trigger the complete state with cached data
            this.setState(this.states.COMPLETE, cachedData);
          }
        });
      }
    }
  },
  
  /**
   * Show unified view with progressive improvement system
   */
  showUnifiedView(data) {
    // Hide the old sections
    const missingSection = this.overlayElement.querySelector('.missing-items-section');
    const recsSection = this.overlayElement.querySelector('.recommendations-section');
    const insightsSection = this.overlayElement.querySelector('.insights-section');
    
    if (missingSection) missingSection.classList.add('hidden');
    if (recsSection) recsSection.classList.add('hidden');
    if (insightsSection) insightsSection.classList.add('hidden');
    
    // Hide the big score blocks in NEW view for cleaner look
    const scoresContainer = this.overlayElement.querySelector('.scores-container');
    if (scoresContainer) scoresContainer.style.display = 'none';
    
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
    
    console.log('[OverlayManager] Progressive data generated:', {
      hasSections: progressiveData.sections?.length > 0,
      sectionsCount: progressiveData.sections?.length,
      sections: progressiveData.sections,
      coachingSummary: progressiveData.coachingSummary,
      unifiedSectionFound: !!unifiedSection,
      expandedViewFound: !!this.overlayElement.querySelector('.overlay-expanded-view')
    });
    
    // Build HTML with progressive improvements
    unifiedSection.innerHTML = `
      <div style="margin: 16px 0;">
        <!-- Coaching Summary -->
        <div style="background: #f0f8ff; border-left: 3px solid #0a66c2; padding: 12px 16px; margin-bottom: 20px; border-radius: 0 6px 6px 0;">
          <p style="font-size: 14px; line-height: 1.5; margin: 0; color: #333;">
            ${progressiveData.coachingSummary}
          </p>
        </div>
        
        <!-- Progressive Improvements by Section -->
        <div style="margin-top: 24px;">
          ${progressiveData.sections.map(section => this.renderSection(section)).join('')}
        </div>
        
        <!-- Re-engagement Prompt -->
        ${progressiveData.reEngagementPrompt ? `
          <div style="margin-top: 24px; padding: 16px; background: #e8f5e9; border-radius: 8px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #2e7d32;">
              ${progressiveData.reEngagementPrompt}
            </p>
          </div>
        ` : ''}
      </div>
    `;
    
    unifiedSection.classList.remove('hidden');
    
    console.log('[OverlayManager] Unified section updated:', {
      innerHTML: unifiedSection.innerHTML.substring(0, 200) + '...',
      isHidden: unifiedSection.classList.contains('hidden'),
      display: window.getComputedStyle(unifiedSection).display,
      parentElement: unifiedSection.parentElement?.className
    });
  },
  
  /**
   * Transform data into progressive improvement format
   */
  transformToProgressiveFormat(data) {
    const completeness = data.completeness || 0;
    const contentScore = data.contentScore || 0;
    const missingItems = data.completenessData?.missingItems || [];
    
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
      console.log('[OverlayManager] No recommendations found in data');
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
    
    console.log('[OverlayManager] transformToProgressiveFormat input:', {
      completeness,
      contentScore,
      missingItemsCount: missingItems.length,
      recommendationsCount: recommendationsArray.length,
      recommendations: data.recommendations,
      recommendationsArray: recommendationsArray,
      dataKeys: Object.keys(data),
      hasSectionScores: !!data.sectionScores,
      sectionScoreKeys: data.sectionScores ? Object.keys(data.sectionScores) : 'none'
    });
    
    // Generate coaching summary
    const coachingSummary = this.generateCoachingSummary(completeness, contentScore, data);
    
    // Analyze sections and create improvements
    const sections = this.analyzeSections(data, missingItems, recommendationsArray || []);
    
    // Generate re-engagement prompt
    const reEngagementPrompt = this.generateReEngagementPrompt(completeness, contentScore, sections);
    
    return {
      coachingSummary,
      sections,
      reEngagementPrompt
    };
  },
  
  /**
   * Convert AI score (0-10) to star rating (0-5)
   */
  scoreToRating(score) {
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
    // First check if we have a coaching summary from AI
    if (data.insights?.coachingSummary) {
      return data.insights.coachingSummary;
    }
    
    // Fallback to default summaries if AI didn't provide one
    if (completeness === 100 && contentScore >= 8.5) {
      return "✨ Outstanding! Your profile demonstrates exceptional professional branding with comprehensive details and compelling content. You're in the top tier of LinkedIn profiles.";
    } else if (completeness >= 90 && contentScore >= 7.5) {
      return "🎯 Excellent profile! You've built a strong professional presence with clear messaging. A few strategic enhancements will maximize your visibility to recruiters and opportunities.";
    } else if (completeness >= 80 && contentScore >= 6.5) {
      return "💪 Strong foundation! Your profile effectively communicates your professional story. Let's focus on the details that will make you stand out in searches.";
    } else if (completeness >= 70) {
      return "📈 Good progress! Your profile has the essentials in place. Adding key missing sections will significantly boost your discoverability.";
    } else if (completeness >= 50) {
      return "🚀 Great start! You're halfway there. Let's prioritize the most impactful sections to quickly improve your profile's effectiveness.";
    } else {
      return "👋 Welcome! Let's build your professional presence step by step. Starting with the basics will create immediate impact.";
    }
  },
  
  /**
   * Analyze sections and create improvements
   */
  analyzeSections(data, missingItems, recommendations) {
    const sections = [];
    
    // Check if we have sectionScores from AI analysis
    const sectionScores = data.sectionScores || {};
    const hasAIInsights = Object.keys(sectionScores).length > 0;
    
    console.log('[OverlayManager] analyzeSections - sectionScores:', {
      hasSectionScores: !!data.sectionScores,
      sectionScoreKeys: Object.keys(sectionScores),
      profileIntro: sectionScores.profile_intro,
      experienceRoles: sectionScores.experience_roles,
      skills: sectionScores.skills,
      hasAIInsights
    });
    
    // Log detailed section content
    if (sectionScores.profile_intro) {
      console.log('[OverlayManager] profile_intro details:', {
        score: sectionScores.profile_intro.score,
        hasPositiveInsight: !!sectionScores.profile_intro.positiveInsight,
        positiveInsightPreview: sectionScores.profile_intro.positiveInsight?.substring(0, 50),
        hasActionItems: !!sectionScores.profile_intro.actionItems,
        actionItemCount: sectionScores.profile_intro.actionItems?.length,
        allKeys: Object.keys(sectionScores.profile_intro),
        fullObject: sectionScores.profile_intro
      });
    }
    
    if (sectionScores.skills) {
      console.log('[OverlayManager] skills details:', {
        score: sectionScores.skills.score,
        hasPositiveInsight: !!sectionScores.skills.positiveInsight,
        positiveInsightPreview: sectionScores.skills.positiveInsight?.substring(0, 50),
        hasActionItems: !!sectionScores.skills.actionItems,
        actionItemCount: sectionScores.skills.actionItems?.length
      });
    }
    
    // Profile photo section
    const photoMissing = missingItems.some(item => item.toLowerCase().includes('photo'));
    const photoRecs = this.findRecommendations(recommendations, ['photo', 'picture', 'headshot']);
    sections.push({
      name: 'Profile Photo',
      rating: photoMissing ? 0 : (photoRecs.length > 0 ? 3 : 5),
      positive: photoMissing ? null : "Professional photo makes a strong first impression",
      improvements: photoMissing ? 
        ["Add a professional headshot - profiles with photos get 21x more views"] :
        photoRecs.slice(0, 2)
    });
    
    // Headline section
    const headlineMissing = missingItems.some(item => item.toLowerCase().includes('headline'));
    const headlineRecs = this.findRecommendations(recommendations, ['headline', 'title']);
    
    // Check for AI insights for profile intro (headline + about)
    const profileIntroScore = sectionScores.profile_intro;
    if (profileIntroScore && profileIntroScore.actionItems) {
      // Use AI insights for headline
      const headlineItems = profileIntroScore.actionItems.filter(item => 
        item.what?.toLowerCase().includes('headline') || 
        item.what?.toLowerCase().includes('title')
      );
      
      sections.push({
        name: 'Professional Headline',
        rating: this.scoreToRating(profileIntroScore.score),
        positive: profileIntroScore.positiveInsight || profileIntroScore.strengths?.[0] || null,
        improvements: headlineItems.map(item => ({
          text: item.what,
          why: item.how,
          priority: item.priority
        })).slice(0, 2)
      });
    } else {
      // Fallback to old logic
      sections.push({
        name: 'Professional Headline',
        rating: headlineMissing ? 0 : (headlineRecs.length > 0 ? 3 : 4),
        positive: headlineMissing ? null : null, // Let AI provide positive feedback
        improvements: headlineMissing ?
          ["Create a compelling headline that showcases your value proposition"] :
          headlineRecs.slice(0, 2)
      });
    }
    
    // About/Summary section
    const aboutMissing = missingItems.some(item => item.toLowerCase().includes('about') || item.toLowerCase().includes('summary'));
    const aboutRecs = this.findRecommendations(recommendations, ['about', 'summary']);
    
    // Check for AI insights for about section (from profile_intro)
    if (profileIntroScore && profileIntroScore.actionItems) {
      // Filter actionItems for about section
      const aboutItems = profileIntroScore.actionItems.filter(item => 
        item.what?.toLowerCase().includes('about') || 
        item.what?.toLowerCase().includes('summary') ||
        !item.what?.toLowerCase().includes('headline')  // Items not specifically for headline
      );
      
      sections.push({
        name: 'About Section',
        rating: this.scoreToRating(profileIntroScore.score),
        positive: profileIntroScore.positiveInsight || profileIntroScore.strengths?.[0] || null,
        improvements: aboutItems.map(item => ({
          text: item.what,
          why: item.how,
          priority: item.priority
        })).slice(0, 2)
      });
    } else {
      // Fallback to old logic
      sections.push({
        name: 'About Section',
        rating: aboutMissing ? 0 : (aboutRecs.length > 0 ? 3 : 4),
        positive: aboutMissing ? null : null,
        improvements: aboutMissing ?
          ["Write a compelling summary highlighting your unique value and achievements"] :
          aboutRecs.slice(0, 2)
      });
    }
    
    // Experience section - check for AI analysis scores
    const experienceMissing = missingItems.some(item => item.toLowerCase().includes('experience'));
    const experienceRecs = this.findRecommendations(recommendations, ['experience', 'role', 'position', 'achievement', 'impact', 'description']);
    
    // Check if we have experience AI scores
    let experienceRating = 0;
    let experiencePositive = null;
    let experienceImprovements = [];
    
    if (experienceMissing) {
      experienceRating = 0;
      experienceImprovements = ["Add your work experience with key achievements and impact"];
    } else {
      // Check for experience scores from AI analysis
      const sectionScores = data.sectionScores || {};
      const experienceScores = [];
      let experienceActionItems = [];
      
      // Check if we have experience_roles array
      if (sectionScores.experience_roles && Array.isArray(sectionScores.experience_roles)) {
        sectionScores.experience_roles.forEach(role => {
          if (typeof role.score === 'number') {
            experienceScores.push(role.score);
          }
          // Collect actionItems from each role
          if (role.actionItems && Array.isArray(role.actionItems)) {
            role.actionItems.forEach(item => {
              experienceActionItems.push({
                text: item.what,
                why: item.how,
                priority: item.priority,
                score: role.score
              });
            });
          }
        });
      }
      
      if (experienceScores.length > 0) {
        // Calculate average experience score
        const avgScore = experienceScores.reduce((a, b) => a + b, 0) / experienceScores.length;
        
        // Convert AI score (0-10) to star rating (0-5)
        experienceRating = Math.round(avgScore / 2);
        
        // Get positive feedback from AI analysis
        const avgExperienceAnalysis = sectionScores.experience_roles?.find(role => typeof role.score === 'number');
        if (avgExperienceAnalysis?.positiveInsight) {
          experiencePositive = avgExperienceAnalysis.positiveInsight;
        }
        
        // Use AI actionItems if available, otherwise use legacy recommendations
        if (experienceActionItems.length > 0) {
          // Sort by priority and take top 2
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          experienceImprovements = experienceActionItems
            .sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2))
            .slice(0, 2)
            .map(item => ({
              text: item.text,
              why: item.why,
              priority: item.priority
            }));
        } else {
          experienceImprovements = experienceRecs.slice(0, 2);
        }
      } else {
        // No AI scores, use default logic
        experienceRating = experienceRecs.length > 0 ? 3 : 4;
        // Don't set generic positive feedback - let AI provide it
        experienceImprovements = experienceRecs.slice(0, 2);
      }
    }
    
    sections.push({
      name: 'Experience',
      rating: experienceRating,
      positive: experiencePositive,
      improvements: experienceImprovements
    });
    
    // Skills section
    const skillsMissing = missingItems.some(item => item.toLowerCase().includes('skill'));
    const skillsRecs = this.findRecommendations(recommendations, ['skill', 'expertise']);
    
    // Check for AI insights for skills
    const skillsScore = sectionScores.skills;
    if (skillsScore && skillsScore.actionItems) {
      sections.push({
        name: 'Skills & Expertise',
        rating: this.scoreToRating(skillsScore.score),
        positive: skillsScore.positiveInsight || skillsScore.strengths?.[0] || null,
        gapAnalysis: skillsScore.gapAnalysis,
        improvements: skillsScore.actionItems.slice(0, 2).map(item => ({
          text: item.what,
          why: item.how,
          priority: item.priority
        }))
      });
    } else {
      sections.push({
        name: 'Skills & Expertise',
        rating: skillsMissing ? 0 : (skillsRecs.length > 0 ? 3 : 4),
        positive: skillsMissing ? null : null, // Let AI provide positive feedback
        improvements: skillsMissing ?
          ["Add at least 5 relevant skills to improve search visibility"] :
          skillsRecs.slice(0, 2)
      });
    }
    
    // Recommendations section - analyze HOW they're perceived
    const recommendationsMissing = missingItems.some(item => item.toLowerCase().includes('recommendation'));
    const recommendationsRecs = this.findRecommendations(recommendations, ['recommendation', 'endorsement', 'testimonial']);
    
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
    let isDefaultRating = false;
    
    if (recommendationsMissing || !hasRecommendations) {
      recommendationsRating = 0;
      recommendationsImprovements = ["Request recommendations to build credibility - profiles with 2+ get 5x more inquiries"];
    } else {
      // We have recommendations - analyze their quality from AI insights
      const recAnalysis = this.analyzeRecommendationPerception(recommendationsRecs, recommendationsData);
      recommendationsRating = recAnalysis.rating;
      recommendationsPositive = recAnalysis.positive;
      recommendationsImprovements = recAnalysis.improvements;
      isDefaultRating = recAnalysis.isDefaultRating || false;
    }
    
    sections.push({
      name: 'Recommendations',
      rating: recommendationsRating,
      positive: recommendationsPositive,
      improvements: recommendationsImprovements,
      isDefaultRating: isDefaultRating
    });
    
    // If no sections need improvement, show at least the first 3 sections
    const needsImprovement = sections.filter(section => section.rating < 5);
    if (needsImprovement.length > 0) {
      return needsImprovement;
    } else {
      // Show top 3 sections even if they're perfect
      return sections.slice(0, 3);
    }
  },
  
  /**
   * Analyze how recommendations are perceived
   */
  analyzeRecommendationPerception(aiRecs, recData) {
    const result = {
      rating: 3, // Default middle rating
      positive: null,
      improvements: [],
      isDefaultRating: false
    };
    
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
      
      if (perceptionFeedback.length > 0) {
        // Use AI's specific feedback about how recommendations are perceived
        result.improvements = perceptionFeedback.slice(0, 2).map(rec => ({
          text: rec.text,
          why: rec.why || "Enhances how your profile is perceived by recruiters",
          example: rec.example
        }));
      } else if (recommendationsScore.actionItems && recommendationsScore.actionItems.length > 0) {
        // Use AI actionItems
        result.improvements = recommendationsScore.actionItems.slice(0, 2).map(item => ({
          text: item.what,
          why: item.how,
          priority: item.priority
        }));
      } else {
        // Fallback to general improvements
        result.improvements = this.generateRecommendationImprovements(score, recData.count);
      }
    } else {
      // No AI analysis - check if we have any recommendation data
      const hasRecommendationData = recData && (recData.count > 0 || recData.recommendations?.length > 0);
      
      if (!hasRecommendationData) {
        // No recommendations at all
        result.rating = 0;
        result.positive = null;
        result.improvements = ["Request recommendations to build credibility - profiles with 2+ get 5x more inquiries"];
        result.isDefaultRating = false; // This is accurate, not a default
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
          // No specific AI feedback AND we have recommendations - parsing likely failed
          result.isDefaultRating = true;
          result.rating = 1; // Low rating when we can't analyze quality
          result.positive = "Unable to analyze recommendation quality";
          
          // When analysis fails, always show it as a limitation
          result.improvements = [
            "Recommendation content wasn't fully visible to analyze quality",
            "This is a known LinkedIn limitation - try re-analyzing in a few minutes"
          ];
          
          // If we're showing cached data due to analysis failure, mention it
          if (this.currentData?.isCacheFallback) {
            result.positive = "Showing previous analysis results";
            result.improvements[0] = "Current analysis incomplete - showing cached results";
          }
        }
      }
    }
    
    return result;
  },
  
  /**
   * Generate recommendation improvements based on score and count
   */
  generateRecommendationImprovements(score, count) {
    if (score && score >= 8) {
      return ["Consider adding a C-level recommendation to further boost executive presence"];
    } else if (score && score >= 6) {
      return [
        "Request recommendations that quantify your specific business impact",
        "Seek a recommendation from a cross-functional partner to show collaboration"
      ];
    } else if (count >= 5) {
      return ["Review older recommendations - update or request fresh ones highlighting recent wins"];
    } else if (count >= 2) {
      return [
        "Coach future recommenders to include specific metrics and outcomes",
        "Request recommendations from different perspectives (client, peer, manager)"
      ];
    } else {
      return [
        "Request 2-3 recommendations focusing on concrete achievements with numbers",
        "Provide recommenders with bullet points of your key accomplishments to reference"
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
    return `
      <div style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <h5 style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">
            ${section.name}
            ${section.isDefaultRating ? `
              <span style="font-size: 11px; color: #666; font-weight: normal; margin-left: 8px;">
                (Limited data - default rating)
              </span>
            ` : ''}
          </h5>
          <div class="star-rating" style="font-size: 16px;">${this.renderStars(section.rating)}</div>
        </div>
        ${section.positive ? `
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #057642;">
            ✓ ${section.positive}
          </p>
        ` : ''}
        ${section.isDefaultRating && section.name === 'Recommendations' ? `
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #f59e0b; background: #fef3c7; padding: 8px; border-radius: 4px;">
            ⚠️ Recommendation quality couldn't be fully analyzed. ${section.positive && section.positive.includes('previous') ? 'Using cached data.' : 'Limited visibility of recommendation content.'}
          </p>
        ` : ''}
        ${section.improvements.length > 0 ? `
          <ul style="margin: 8px 0 0 0; padding-left: 20px; list-style: none;">
            ${section.improvements.map(imp => `
              <li style="margin-bottom: 6px; position: relative; padding-left: 8px; font-size: 13px; color: #666;">
                <span style="position: absolute; left: -8px;">→</span>
                ${typeof imp === 'string' ? imp : imp.text}
                ${imp.why ? `<div style="font-size: 12px; color: #999; margin-top: 2px; margin-left: 8px;">${imp.why}</div>` : ''}
              </li>
            `).join('')}
          </ul>
        ` : ''}
      </div>
    `;
  },
  
  /**
   * Render star rating
   */
  renderStars(rating) {
    const filled = '★';
    const empty = '☆';
    let stars = '';
    
    for (let i = 1; i <= 5; i++) {
      const delay = i * 0.1; // Stagger star animations
      if (i <= rating) {
        stars += `<span style="color: #f59e0b; animation-delay: ${delay}s">${filled}</span>`;
      } else {
        stars += `<span style="color: #d1d5db; animation-delay: ${delay}s">${empty}</span>`;
      }
    }
    
    return stars;
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
      console.log('[OverlayManager] No valid recommendations array to filter');
      return [];
    }
    
    // Categorize recommendations
    recommendations.forEach(rec => {
      const section = rec.section?.toLowerCase() || '';
      const action = rec.action?.what?.toLowerCase() || rec.text?.toLowerCase() || '';
      
      // Check if this is a completeness recommendation
      const isCompletenessRec = 
        missingItems.some(item => action.includes(item.toLowerCase())) ||
        action.includes('add') ||
        action.includes('missing') ||
        action.includes('create') ||
        action.includes('include') ||
        (section && missingItems.some(item => item.toLowerCase().includes(section)));
      
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
    
    console.log('[OverlayManager] Recommendation allocation:', {
      total: recommendations.length,
      completenessFound: completenessRecs.length,
      qualityFound: qualityRecs.length,
      completenessSelected: selectedCompleteness.length,
      qualitySelected: selectedQuality.length,
      finalCount: combined.length,
      allocation
    });
    
    return combined;
  },
  
  /**
   * Generate re-engagement prompt
   */
  generateReEngagementPrompt(completeness, contentScore, sections) {
    const totalStars = sections.reduce((sum, section) => sum + section.rating, 0);
    const maxStars = sections.length * 5;
    const progress = Math.round((totalStars / maxStars) * 100);
    
    if (progress >= 80) {
      return "🏆 You're almost there! Complete these final improvements to achieve an elite profile.";
    } else if (progress >= 60) {
      return "🎯 Great momentum! You're " + (100 - progress) + "% away from a standout profile.";
    } else if (progress >= 40) {
      return "📈 You're making excellent progress! Each improvement increases your visibility.";
    } else {
      return "🚀 Start with one section today - small improvements create big impact!";
    }
  },
  
  /**
   * Show zero state for new users
   */
  showZeroState() {
    // Hide old sections
    const missingSection = this.overlayElement.querySelector('.missing-items-section');
    const recsSection = this.overlayElement.querySelector('.recommendations-section');
    
    if (missingSection) missingSection.classList.add('hidden');
    if (recsSection) recsSection.classList.add('hidden');
    
    // Hide score blocks
    const scoresContainer = this.overlayElement.querySelector('.scores-container');
    if (scoresContainer) scoresContainer.style.display = 'none';
    
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
      <div style="margin: 16px 0;">
        <div style="background: #f0f8ff; border: 1px solid #e7f3ff; padding: 32px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0 0 16px 0; font-size: 24px; color: #0a66c2;">
            👋 Welcome to ElevateLI!
          </h3>
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 24px;">
            Analyze your LinkedIn profile to discover:
          </p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; max-width: 600px; margin: 0 auto 24px;">
            <div style="text-align: left; padding: 16px; background: white; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
              <div style="color: #0a66c2; font-size: 20px; margin-bottom: 8px;">✓</div>
              <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">Profile Completeness</h4>
              <p style="margin: 0; font-size: 13px; color: #666;">Free analysis of missing sections</p>
            </div>
            <div style="text-align: left; padding: 16px; background: white; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
              <div style="color: #0a66c2; font-size: 20px; margin-bottom: 8px;">🎯</div>
              <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">Content Quality Score</h4>
              <p style="margin: 0; font-size: 13px; color: #666;">AI-powered content analysis</p>
            </div>
            <div style="text-align: left; padding: 16px; background: white; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
              <div style="color: #0a66c2; font-size: 20px; margin-bottom: 8px;">💡</div>
              <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">Smart Recommendations</h4>
              <p style="margin: 0; font-size: 13px; color: #666;">Personalized improvement tips</p>
            </div>
          </div>
          <button style="
            background: #0a66c2;
            color: white;
            border: none;
            padding: 12px 32px;
            border-radius: 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-bottom: 12px;
          " onclick="window.postMessage({ type: 'ELEVATE_REFRESH' }, '*')">
            Analyze Your Profile
          </button>
          <p style="margin: 0; font-size: 13px; color: #666;">
            💡 Tip: Configure your API key in settings for AI-powered insights
          </p>
        </div>
      </div>
    `;
    
    unifiedSection.classList.remove('hidden');
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
  }
};