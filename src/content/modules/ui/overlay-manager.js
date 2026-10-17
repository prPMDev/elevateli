/**
 * Overlay Manager Module for ElevateLI
 * Handles progressive UI states and smooth transitions
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

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
    
    // Check if extension context is still valid
    try {
      if (!chrome?.runtime?.id) {
        return this;
      }
    } catch (e) {
      return this;
    }
    
    // Check if user wants to show analysis and compliance
    try {
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get(['showAnalysis', 'compliance'], (data) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(data);
        });
      });
      
      if (settings.showAnalysis === false) {
        return this;
      }
      
      // Store compliance status for button state management
      this.hasCompliance = settings.compliance?.hasAcknowledged || false;
    } catch (error) {
      // Continue with initialization on error
      this.hasCompliance = false;
    }
    
    this.setState(this.states.INITIALIZING);
    
    // Always start in collapsed view
    this.viewState = 'collapsed';
    
    // The profile renders client-side; wait for its top card, then inject. No timed retries: an overlay
    // injected later would skip the cached-state restore below
    await BaseExtractor.waitForElement('main section h2', 10000);
    this.createAndInject();
    
    // CRITICAL: Restore cached data automatically after overlay is created
    // This ensures returning users see their previous analysis immediately
    // We need to handle two cases:
    // 1. No compliance - show zero state with disabled analyze button
    // 2. Has compliance but no cache - show zero state with enabled analyze button
    // 3. Has compliance and cache - restore cached data
    if (this.overlayElement) {
      if (this.hasCompliance) {
        // Use setTimeout to ensure DOM is fully ready
        setTimeout(async () => {
          // Check if we already have scores displayed (from popup-triggered analysis)
          const hasScores = this.overlayElement?.querySelector('.completeness-score')?.textContent;
          if (hasScores && hasScores !== '0' && hasScores !== '') {
            return;
          }
          // This will check for cache and either restore it or show EMPTY_CACHE state
          await this.restoreAppropriateState();
        }, 100);
      } else {
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
    
    // Inject right after the profile top card (name, headline, photo)
    const topCard = BaseExtractor.topCard();
    if (!topCard) {
      return;
    }
    topCard.insertAdjacentHTML('afterend', wrapperHtml);
    
    this.overlayElement = document.getElementById('elevateli-overlay');
    
    // Attach event listeners
    this.attachEventListeners();
    
    this.keepAttached();
  },
  
  /**
   * LinkedIn re-renders the profile column after load and drops nodes it doesn't own.
   * Put the same overlay nodes back after the top card while they are still the live overlay on this page.
   */
  keepAttached() {
    const wrapper = this.overlayElement.closest('.elevateli-overlay-wrapper');
    const nodes = [wrapper.previousElementSibling, wrapper]; // inline <style>, wrapper
    const overlay = this.overlayElement;
    const path = location.pathname;
    
    this.reattachObserver?.disconnect();
    this.reattachObserver = new MutationObserver(() => {
      if (wrapper.isConnected) return;
      
      // close(), profile navigation and an extension reload (orphaned script) remove the overlay on purpose
      if (this.overlayElement !== overlay || location.pathname !== path || !chrome.runtime?.id) {
        this.reattachObserver.disconnect();
        return;
      }
      
      BaseExtractor.topCard()?.after(...nodes);
    });
    this.reattachObserver.observe(document.body, { childList: true, subtree: true });
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
      // Default to EMPTY_CACHE if no state provided
      newState = this.states.EMPTY_CACHE;
    }
    
    // Validate that the state exists in our defined states
    const validStates = Object.values(this.states);
    if (!validStates.includes(newState)) {
      // Default to EMPTY_CACHE for invalid states
      newState = this.states.EMPTY_CACHE;
    }
    
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
          (() => {
        const fragment = document.createDocumentFragment();
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'label-full';
        fullSpan.textContent = 'Completeness';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'label-short';
        shortSpan.textContent = 'Complete';
        
        const separator = document.createTextNode(': ');
        const remaining = document.createTextNode('--');
        
        fragment.appendChild(fullSpan);
        fragment.appendChild(shortSpan);
        fragment.appendChild(separator);
        fragment.appendChild(remaining);
        
        completenessBadge.replaceChildren(fragment);
      })();
          completenessBadge.classList.remove('high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
        }
        if (qualityBadge) {
          (() => {
        const fragment = document.createDocumentFragment();
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'label-full';
        fullSpan.textContent = 'Content Quality';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'label-short';
        shortSpan.textContent = 'Quality';
        
        const separator = document.createTextNode(': ');
        const remaining = document.createTextNode('--');
        
        fragment.appendChild(fullSpan);
        fragment.appendChild(shortSpan);
        fragment.appendChild(separator);
        fragment.appendChild(remaining);
        
        qualityBadge.replaceChildren(fragment);
      })();
          qualityBadge.classList.remove('ai-disabled', 'error', 'ai-error', 'high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
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
        // COMPLETE (incl. every cache restore) hides the indicator; the status and elapsed counter live in it
        const statusIndicator = this.overlayElement.querySelector('.status-indicator');
        if (statusIndicator) statusIndicator.style.display = '';
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
        // Elapsed timer keeps running from SCANNING - one counter for the whole analysis
      },
      
      [this.states.COMPLETE]: () => {
        this.clearEmptyStateMessage();
        // Hide status indicator after analysis
        this.hideStatusIndicator();
        this.hideSkeletons();
        
        // Always stop: cache-backed results (analyze()'s cache hit, AI failure with cached AI
        // fields) also arrive after SCANNING started the timer; a no-op on plain restores
        this.stopElapsedTimeDisplay();
        
        this.populateScores(data);
        
        // Store the full data for reference by other methods
        this.currentData = data;
        
        // Show unified view
        this.showUnifiedView(data);
        // Don't show action buttons in expanded view
        this.showActionButtons({ showRefresh: false });

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
        
        // A fresh AI failure with cached AI results lands in ANALYSIS_FAILED_CACHE_FALLBACK (banner);
        // here partialUpdate only arrives via cache restore, where the asterisk + message suffice
        if (data.apiKeyError) {
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

    // Synchronous, so a later per-section write (updateAIProgress) always wins
    if (statusText) statusText.textContent = text;
    
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
      (() => {
        const fragment = document.createDocumentFragment();
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'label-full';
        fullSpan.textContent = 'Completeness';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'label-short';
        shortSpan.textContent = 'Complete';
        
        const separator = document.createTextNode(': ');
        const remaining = document.createTextNode(`${Math.round(score)}%`);
        
        fragment.appendChild(fullSpan);
        fragment.appendChild(shortSpan);
        fragment.appendChild(separator);
        fragment.appendChild(remaining);
        
        collapsedBadge.replaceChildren(fragment);
      })();
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
    
    // Update completeness
    if (data.completeness !== undefined) {
      this.updateCompleteness(data.completeness);
    }
    
    // Check if AI is disabled or API key error
    const qualityBadge = this.overlayElement.querySelector('.score-badge.quality');
    // Drop the previous result's state classes so e.g. a red 'error' badge can't outlive its run
    qualityBadge?.classList.remove('ai-disabled', 'error', 'ai-error', 'high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');

    if (data.aiDisabled || ((data.contentScore === undefined || data.contentScore === null) && data.fromCache !== true)) {
      // Replace quality score block with AI disabled message
      const qualityBlock = this.overlayElement.querySelector('.score-block.quality');
      if (qualityBlock) {
        let message = 'Configure AI in extension settings';
        // AI is on but the run failed or timed out: say why instead of "Configure AI"
        if (data.aiError && data.settings?.enableAI) message = data.aiError.message;
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
          (() => {
        const fragment = document.createDocumentFragment();
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'label-full';
        fullSpan.textContent = 'Content Quality';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'label-short';
        shortSpan.textContent = 'Quality';
        
        const separator = document.createTextNode(': ');
        const remaining = document.createTextNode('No score');
        
        fragment.appendChild(fullSpan);
        fragment.appendChild(shortSpan);
        fragment.appendChild(separator);
        fragment.appendChild(remaining);
        
        qualityBadge.replaceChildren(fragment);
      })();
          qualityBadge.classList.add('ai-error');
        } else if (data.apiKeyError) {
          qualityBadge.textContent = '';
          const labelHtml = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: ';
          (() => {
              qualityBadge.textContent = '';
              qualityBadge.insertAdjacentHTML('afterbegin', labelHtml);
            })();
          const textNode = document.createTextNode('');
          qualityBadge.appendChild(textNode);
          
          // Show empty stars with error tooltip
          const starsElement = this.renderStars(null, 'API_KEY_ERROR');
          qualityBadge.appendChild(starsElement);
          qualityBadge.classList.add('ai-disabled', 'error');
        } else {
          qualityBadge.textContent = '';
          const labelHtml = '<span class="label-full">Content Quality</span><span class="label-short">Quality</span>: ';
          (() => {
              qualityBadge.textContent = '';
              qualityBadge.insertAdjacentHTML('afterbegin', labelHtml);
            })();
          const textNode = document.createTextNode('');
          qualityBadge.appendChild(textNode);
          
          // Show empty stars with "Enable AI" tooltip
          const starsElement = this.renderStars(null, null);
          qualityBadge.appendChild(starsElement);
          qualityBadge.classList.add('ai-disabled');
        }
      }
    } else if (data.contentScore !== undefined && data.contentScore !== null) {
      // An earlier AI-off render replaced the quality block with a message; rebuild it before filling it
      const qualityBlock = this.overlayElement.querySelector('.score-block.quality');
      if (qualityBlock && !qualityBlock.querySelector('.score-value')) {
        qualityBlock.replaceWith(this.createScoreBlock('quality', 'Content Quality (AI)', '★'));
      }
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
        // Convert 10-point scale to 5-star scale
        const starRating = Math.round(data.contentScore / 2);
        const numericRating = (data.contentScore / 2).toFixed(1);
        
        // Clear the badge first
        qualityBadge.textContent = '';

        // Add the main text with responsive labels
        const labelSpan = document.createElement('span');
        (() => {
        const fragment = document.createDocumentFragment();
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'label-full';
        fullSpan.textContent = 'Content Quality';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'label-short';
        shortSpan.textContent = 'Quality';
        
        const separator = document.createTextNode(': ');
        const remaining = document.createTextNode(' ');
        
        fragment.appendChild(fullSpan);
        fragment.appendChild(shortSpan);
        fragment.appendChild(separator);
        fragment.appendChild(remaining);
        
        labelSpan.replaceChildren(fragment);
      })();
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
      (() => {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.textContent = '⚙️';
            const textNode = document.createTextNode('Open Settings');
            analyzeBtn.replaceChildren(iconSpan, textNode);
          })();
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
  },
  
  
  /**
   * Handle view details button click
   */
  handleViewDetails() {
    const btn = this.overlayElement.querySelector('.details-button');
    if (btn) {
      btn.disabled = true;
    }
    // Open dashboard
    try {
      if (chrome?.runtime?.id) {
        chrome.runtime.sendMessage({ action: 'openDashboard' }, (response) => {
          if (chrome.runtime.lastError) {
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
    scanItems.textContent = '';
    
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
      'featured': 'Featured'
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
   * Show the last-analyzed date in the collapsed bar, flagged when older than 7 days
   * @param {string|number} timestamp - ISO string (cache) or epoch ms (timeout path)
   */
  showTimestamp(timestamp) {
    const collapsedTimestamp = this.overlayElement.querySelector('.last-analyzed-collapsed');
    if (!timestamp || !collapsedTimestamp) return;

    const date = new Date(timestamp);
    const isStale = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24) > 7;
    const formatted = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

    collapsedTimestamp.textContent = `Last Analyzed: ${formatted}${isStale ? ' ⚠️' : ''}`;
    collapsedTimestamp.title = isStale ? 'Analysis is older than 7 days - consider re-analyzing' : '';
    collapsedTimestamp.style.color = isStale ? '#f59e0b' : '';
  },
  
  /**
   * Reset all action buttons to enabled state
   * This is called after analysis completes, fails, or times out
   */
  resetButtons() {
    
    if (!this.overlayElement) return;
    
    // Re-enable all action buttons
    const buttons = this.overlayElement.querySelectorAll('.action-button');
    buttons.forEach(btn => {
      btn.disabled = false;
      
      // Reset button text to original
      if (btn.classList.contains('analyze-button')) {
        (() => {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.textContent = '🚀';
            const textNode = document.createTextNode('Analyze Profile');
            btn.replaceChildren(iconSpan, textNode);
          })();
      } else if (btn.classList.contains('refresh-button')) {
        (() => {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.textContent = '🔄';
            const textNode = document.createTextNode('Refresh');
            btn.replaceChildren(iconSpan, textNode);
          })();
      } else if (btn.classList.contains('details-button')) {
        (() => {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.textContent = '📊';
            const textNode = document.createTextNode('View Details');
            btn.replaceChildren(iconSpan, textNode);
          })();
      }
    });
    
    // Reset collapsed view button
    const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    if (collapsedBtn) {
      collapsedBtn.disabled = false;
      // [CRITICAL_PATH:BUTTON_STATE_MANAGEMENT] - Always show "Analyze" for consistency
      collapsedBtn.textContent = 'Analyze';
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
      // Show message to complete setup
      const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
      if (collapsedBtn) {
        collapsedBtn.title = 'Please complete setup in extension popup first';
      }
      return;
    }
    
    const btn = this.overlayElement.querySelector('.analyze-button');
    const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    
    if (btn) {
      btn.disabled = true;
      (() => {
          btn.textContent = '';
          btn.insertAdjacentHTML('afterbegin', '<span class="button-icon spinning">⏳</span><span class="btn-text-full">Analyzing</span><span class="btn-text-short">...</span>');
        })();
    }
    
    if (collapsedBtn) {
      collapsedBtn.disabled = true;
      (() => {
          collapsedBtn.textContent = '';
          collapsedBtn.insertAdjacentHTML('afterbegin', '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> <span class="btn-text-full">Analyzing</span><span class="btn-text-short">...</span>');
        })();
    }
    
    // Set failsafe timer to re-enable button if the analyzer never reports back
    this.setButtonFailsafeTimer();
    
    // Direct call in this isolated world; a window message could be posted by any page script
    window.ElevateLI?.startAnalysis(true);
  },
  
  /**
   * Handle refresh button click (re-analysis)
   */
  handleRefresh() {
    const btn = this.overlayElement.querySelector('.refresh-button');
    if (btn) {
      btn.disabled = true;
      (() => {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'button-icon';
            iconSpan.textContent = '⏳';
            const textNode = document.createTextNode('Re-analyzing...');
            btn.replaceChildren(iconSpan, textNode);
          })();
    }
    
    // Set failsafe timer to re-enable button if the analyzer never reports back
    this.setButtonFailsafeTimer();
    
    window.ElevateLI?.startAnalysis(true);
  },
  
  /**
   * Set failsafe timer to re-enable buttons after 20 minutes (analyzer-base ANALYSIS_TOTAL).
   * Long-run feedback comes from the elapsed counter; the analyzer's own timeout shows results.
   */
  setButtonFailsafeTimer() {
    // Clear any existing timer
    if (this.buttonResetTimer) {
      clearTimeout(this.buttonResetTimer);
    }

    this.buttonResetTimer = setTimeout(() => this.resetButtons(), 1200000); // 20 minutes
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
    
    // Update elapsed time every second; the hint is appended so the counter stays visible
    // and the per-section status text (set by the analyzer) is never overwritten
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const hint = elapsed > 90 ? ' (Finalizing...)' :
                   elapsed > 60 ? ' (Complex analysis in progress)' :
                   elapsed > 30 ? ' (This may take a moment...)' : '';
      elapsedDisplay.textContent = `Elapsed: ${minutes > 0 ? `${minutes}m ` : ''}${seconds}s${hint}`;
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
    // SPA navigation can remove the wrapper without clearing overlayElement; a stale
    // reference would block initialize()'s injection retries and cache restore
    if (!this.overlayElement?.isConnected) {
      this.overlayElement = null;
    }

    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      wrapper.style.setProperty('display', 'block', 'important');
    } else {
      // Re-initialize if not present
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
        return;
      }
    }
    
    // Fallback to document query if overlayElement not available
    const wrapper = document.querySelector('.elevateli-overlay-wrapper');
    if (wrapper) {
      // WORKAROUND: !important needed to override conflicting CSS
      wrapper.style.setProperty('display', 'none', 'important');
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
    
    
    
    // Build HTML with progressive improvements
    (() => {
        const parser = new DOMParser();
        const htmlContent = `
      <div style="margin: 8px 0;">
        <!-- Unified Message (single positive message) -->
        <div style="padding: 12px; background: #e8f5e9; border-radius: 8px; text-align: center; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 15px; color: #2e7d32; font-weight: 500;">
            ${this.escapeHtml(progressiveData.unifiedMessage)}
          </p>
        </div>
        
        <!-- Progressive Improvements by Section -->
        <div style="margin-bottom: 16px;">
          ${progressiveData.sections && progressiveData.sections.length > 0 
            ? progressiveData.sections.map(section => this.renderSection(section)).join('')
            : `<div style="padding: 20px; text-align: center; color: #666;">
                <p style="margin: 0 0 8px 0; font-size: 14px;">No specific improvements needed for profile completeness.</p>
                <p style="margin: 0; font-size: 13px;">Enable AI analysis for personalized content quality insights.</p>
              </div>`}
        </div>
        
        <!-- AI Coaching Summary (only if available) -->
        ${progressiveData.coachingSummary ? `
          <div style="background: #f0f8ff; border-left: 3px solid #0a66c2; padding: 12px 16px; border-radius: 0 6px 6px 0;">
            <p style="font-size: 14px; line-height: 1.5; margin: 0; color: #333;">
              ${this.escapeHtml(progressiveData.coachingSummary)}
            </p>
          </div>
        ` : ''}
      </div>
    `;
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        unifiedSection.replaceChildren(fragment);
      })();
    
    // Replace star placeholders with actual DOM elements
    if (this.pendingStarElements && this.pendingStarElements.length > 0) {
      
      this.pendingStarElements.forEach(({ id, element }) => {
        const placeholder = unifiedSection.querySelector(`[data-star-placeholder="${id}"]`);
        if (placeholder && element) {
          // Clear the placeholder and append the actual star element
          placeholder.textContent = '';
          placeholder.appendChild(element);
        }
      });
      // Clear pending elements after insertion
      this.pendingStarElements = [];
    }
    
    unifiedSection.classList.remove('hidden');
  },
  
  /**
   * Transform data into progressive improvement format
   */
  transformToProgressiveFormat(data) {
    const completeness = data.completeness || 0;
    const contentScore = data.contentScore || 0;
    // Every gap, not the top-5 'recommendations' slice - smaller gaps would get a false ✓
    const missingItems = data.completenessData?.allRecommendations || [];

    // Generate coaching summary
    const coachingSummary = this.generateCoachingSummary(completeness, contentScore, data);

    // Analyze sections and create improvements
    const sections = this.analyzeSections(data, missingItems);
    
    // Generate unified message
    const unifiedMessage = this.generateUnifiedMessage(completeness, contentScore, sections, data);
    
    
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
  analyzeSections(data, missingItems) {
    const sections = [];
    
    // Check if we have sectionScores from AI analysis
    const sectionScores = data.sectionScores || {};

    // Profile photo section - show if missing (completeness)
    const photoMissing = missingItems.some(item => item.section === 'photo');
    const photoRec = missingItems.find(item => item.section === 'photo');
    
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
    
    // We don't show photo as a separate section when it exists
    
    
    // [CRITICAL_PATH:FIRST_IMPRESSION_UI] - P0: Display unified first impression
    // Check for first impression analysis
    const firstImpressionScore = sectionScores.first_impression;
    
    
    // Headline section - now part of first impression
    const headlineRec = missingItems.find(item => item.section === 'headline');
    
    // If we have first impression analysis, use that for headline display
    const headlineAnalysis = firstImpressionScore;
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
    const aboutRec = missingItems.find(item => item.section === 'about');
    
    // Check for standalone about section analysis
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
    const experienceRec = missingItems.find(item => item.section === 'experience');
    // experience_overall, or the single 'experience' section the analyzer sends when deep extraction fails
    const experienceScore = sectionScores.experience_overall || sectionScores.experience;

    let experienceRating = null; // No rating without AI
    let experiencePositive = null;
    let experienceImprovements = [];

    // AI scores take priority over completeness recommendations
    if (experienceScore) {
      experienceRating = this.scoreToRating(experienceScore.score);
      experiencePositive = experienceScore.positiveInsight;

      if (experienceScore.actionItems?.length > 0) {
        experienceImprovements = experienceScore.actionItems
          .slice(0, this.getImprovementLimit(experienceRating, 'Experience'))
          .map(item => ({
            text: item.action || item.what || 'Improvement needed',
            why: item.impact || item.how || 'Update your experience',
            priority: item.priority
          }));
      }

      // If we still don't have improvements but have completeness recommendation, add it
      if (experienceImprovements.length === 0 && experienceRec) {
        experienceImprovements.push({text: experienceRec.message, why: "Work experience is essential for profile visibility"});
      }
    } else if (experienceRec) {
      // No AI scores and we have completeness recommendation
      experienceImprovements = [{text: experienceRec.message, why: "Work experience is essential for profile visibility"}];
    } else {
      // No AI scores and no completeness gap - add positive message
      const experienceData = data.extractedData?.experience ||
                           data.completenessData?.breakdown?.experience?.data;
      if (experienceData?.hasCurrentRole) {
        experiencePositive = "✓ Your experience section is up to date";
      } else if (experienceData?.count >= 2) {
        experiencePositive = `✓ ${experienceData.count} professional experiences documented`;
      }
    }

    const experienceSection = {
      name: 'Experience',
      rating: experienceRating,
      errorType: experienceScore?.errorType || null,
      positive: experiencePositive,
      improvements: experienceImprovements,
      priority: 'normal'
    };

    sections.push(experienceSection);
    
    // Skills section
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
      errorType: sectionScores.recommendations?.errorType || null,
      // Removed isDefaultRating - use null rating instead
      priority: 'high'  // Always show recommendations section
    });

    // Completeness gaps no card above covers (education, certifications, projects)
    const cardSections = ['photo', 'headline', 'about', 'experience', 'skills', 'recommendations'];
    const otherGaps = missingItems.filter(item => !cardSections.includes(item.section));
    if (otherGaps.length > 0) {
      sections.push({
        name: 'Other Sections',
        rating: null,
        positive: null,
        improvements: otherGaps.map(item => ({ text: item.message, why: `+${Math.round(item.impact)}% completeness` })),
        priority: 'normal'
      });
    }

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
   * Escape text for the HTML templates below - AI output and profile text must render as text
   */
  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
            ${this.escapeHtml(section.name)}
          </h5>
          <div class="star-rating" style="font-size: 16px;" data-star-placeholder="${starPlaceholderId}"></div>
        </div>
        ${section.positive ? `
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #057642;">
            ${this.escapeHtml(section.positive)}
          </p>
        ` : ''}
        ${section.improvements.length > 0 ? `
          <ul style="margin: 8px 0 0 0; padding-left: 20px; list-style: none;">
            ${section.improvements.map(imp => `
              <li style="margin-bottom: 6px; position: relative; padding-left: 8px; font-size: 12px; color: #666;">
                <span style="position: absolute; left: -8px;">→</span>
                ${this.escapeHtml(typeof imp === 'string' ? imp : imp.text)}
                ${imp.why ? `<div style="font-size: 11px; color: #999; margin-top: 2px; margin-left: 8px;">${this.escapeHtml(imp.why)}</div>` : ''}
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
      
      // Numeric span (narrow screens) - 'not rated', never a fake zero score
      const numericSpan = document.createElement('span');
      numericSpan.className = 'stars-numeric';
      numericSpan.textContent = '–/5★';
      
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
   * Generate unified positive message
   */
  generateUnifiedMessage(completeness, contentScore, sections, data) {
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
          // Only AI-rated cards count; unrated (null) cards are not 0 stars. hasAIAnalysis guarantees one.
          const rated = sections.filter(section => typeof section.rating === 'number');
          const totalStars = rated.reduce((sum, section) => sum + section.rating, 0);
          const starProgress = Math.round((totalStars / (rated.length * 5)) * 100);
          
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
      
      
      // Ensure we never return empty string
      return finalMessage || "Profile analysis complete.";
      
    } catch (error) {
      
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
    
    (() => {
        const parser = new DOMParser();
        const htmlContent = `
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
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        unifiedSection.replaceChildren(fragment);
      })();
    
    unifiedSection.classList.remove('hidden');
    
    // Also update collapsed view to show zero state values
    const completenessBadge = this.overlayElement.querySelector('.score-badge.completeness');
    const qualityBadge = this.overlayElement.querySelector('.score-badge.quality');
    const lastAnalyzedSpan = this.overlayElement.querySelector('.last-analyzed-collapsed');
    const analyzeBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    
    if (completenessBadge) {
      (() => {
        const fragment = document.createDocumentFragment();
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'label-full';
        fullSpan.textContent = 'Completeness';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'label-short';
        shortSpan.textContent = 'Complete';
        
        const separator = document.createTextNode(': ');
        const remaining = document.createTextNode('—');
        
        fragment.appendChild(fullSpan);
        fragment.appendChild(shortSpan);
        fragment.appendChild(separator);
        fragment.appendChild(remaining);
        
        completenessBadge.replaceChildren(fragment);
      })();
      completenessBadge.classList.remove('high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
    }
    if (qualityBadge) {
      (() => {
        const fragment = document.createDocumentFragment();
        
        const fullSpan = document.createElement('span');
        fullSpan.className = 'label-full';
        fullSpan.textContent = 'Content Quality';
        
        const shortSpan = document.createElement('span');
        shortSpan.className = 'label-short';
        shortSpan.textContent = 'Quality';
        
        const separator = document.createTextNode(': ');
        const remaining = document.createTextNode('—');
        
        fragment.appendChild(fullSpan);
        fragment.appendChild(shortSpan);
        fragment.appendChild(separator);
        fragment.appendChild(remaining);
        
        qualityBadge.replaceChildren(fragment);
      })();
      qualityBadge.classList.remove('ai-disabled', 'error', 'ai-error', 'high', 'medium', 'low', 'score-excellent', 'score-good', 'score-moderate', 'score-poor');
    }
    if (lastAnalyzedSpan) {
      // Drop the stale-analysis styling a previous result left behind
      lastAnalyzedSpan.textContent = 'Not analyzed';
      lastAnalyzedSpan.title = '';
      lastAnalyzedSpan.style.color = '';
    }
    if (analyzeBtn) {
      analyzeBtn.textContent = 'Analyze';
      // Re-sync with compliance: setup can finish (or a factory reset happen) after the overlay was built
      analyzeBtn.disabled = !this.hasCompliance;
      analyzeBtn.title = this.hasCompliance ? '' : 'Please complete setup in extension popup first';
    }
    
    // Update the status indicator with more informative text
    const statusText = this.overlayElement.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = 'Ready to analyze • Click extension icon to set up';
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
            resolve(null);
            return;
          }
          resolve(data.compliance);
        });
      } catch (error) {
        console.error('STATE.RESTORATION', 'Error getting compliance', error);
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
        
        chrome.storage.local.get(['enableAI', 'aiProvider', 'aiModel'], (data) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(data);
        });
      } catch (error) {
        console.error('STATE.RESTORATION', 'Error getting settings', error);
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
      // Keep every cached field (insights, AI-failure flags, extractedData), as analyzer-base's cache path does
      const stateData = {
        ...cachedData,
        fromCache: true,
        // Only mark AI as disabled if there's no content score - matches analyzer-base's cache path
        aiDisabled: cachedData.contentScore === undefined || cachedData.contentScore === null,
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
   * @returns {Promise<boolean>} True only when cached results were applied
   */
  async restoreAppropriateState(profileId = null, context = {}) {
    try {
      // Prevent duplicate restoration attempts
      if (this.isRestoringState) {
        return false;
      }

      // Don't interrupt active analysis - unless the running analysis itself asks for its error fallback
      if (!context.isErrorFallback &&
          (this.currentState === this.states.AI_ANALYZING ||
           this.currentState === this.states.ANALYZING ||
           this.currentState === this.states.SCANNING ||
           this.currentState === this.states.EXTRACTING ||
           this.currentState === this.states.CALCULATING)) {
        return false;
      }
      
      // Get profile ID if not provided
      if (!profileId) {
        // Try to extract profile ID from URL
        try {
          profileId = extractProfileIdFromUrl();
        } catch (error) {
          // Don't fail restoration just because of profile ID extraction
          // The function might be temporarily unavailable
        }
        
        if (!profileId) {
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
            return null;
          }),
          this.getSettings().catch(err => {
            return {};
          }),
          this.getCachedData(profileId).catch(err => {
            return null;
          })
        ]);
      } catch (promiseError) {
        // Continue with null values
      }
      
      
      // Determine appropriate state
      const { state, data } = this.determineStateFromData(cachedData, settings, compliance, context);

      // An error fallback with nothing cached is left to the caller (it shows its own error)
      if (data || !context.isErrorFallback) {
        this.setState(state, data);
      }

      // Update last restored profile and clear restoration flag
      this.lastRestoredProfile = profileId;
      this.isRestoringState = false;

      return !!data;

    } catch (error) {
      // Create a proper error object if needed
      const errorObj = error instanceof Error ? error : 
        new Error(typeof error === 'string' ? error : 'Unknown restoration error');
      
      console.error('STATE.RESTORATION', 'Restoration failed', errorObj, {
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
          console.error('STATE.RESTORATION', 'Fallback state setting failed', fallbackErrorObj, {
            profileId: profileId
          });
        }
      }
      
      // Clear restoration flag on error
      this.isRestoringState = false;
      
      return false;
    }
  }
};