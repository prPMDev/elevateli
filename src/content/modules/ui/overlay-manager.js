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
    CALCULATING: 'calculating',
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
    // Before any await: the profile this call was made for (another member's page must not get the overlay)
    const profileId = extractProfileIdFromUrl();

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
    
    // The profile renders client-side, slowly on bad links: wait for its top card with no deadline, but only
    // while this profile is still the page (navigation re-runs init()). Profile ids, not paths, so modals still count.
    while (!BaseExtractor.topCard()) {
      if (extractProfileIdFromUrl() !== profileId || !chrome.runtime?.id) return this;
      await BaseExtractor.wait(250);
    }
    if (extractProfileIdFromUrl() !== profileId) return this;
    this.createAndInject();
    
    // CRITICAL: Restore cached data automatically after overlay is created
    // This ensures returning users see their previous analysis immediately
    // We need to handle two cases:
    // 1. No compliance - zero state with the consent card (Analyze leads to it)
    // 2. Has compliance but no cache - zero state pointing at Analyze
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
        // INITIALIZING ran before injection; every caller (init, show, Show analysis) needs the consent card
        this.showZeroState();
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
            <span class="score-badge completeness"><span class="label-full">Completeness</span><span class="label-short">Complete</span>: —</span>
            <span class="score-badge quality"><span class="label-full">Content quality</span><span class="label-short">Quality</span>: —</span>
            <div class="spacer"></div>
            <span class="last-analyzed-collapsed"></span>
            <button class="analyze-btn-collapsed" data-action="analyze">Analyze</button>
            <a href="#" class="view-details-link" data-action="details">
              <span class="details-text-full">View details</span>
              <span class="details-text-medium">Details</span>
              <span class="details-icon">▼</span>
            </a>
            <button type="button" class="eli-hide" data-action="hide" aria-label="Hide ElevateLI on my profile" title="Hide ElevateLI on my profile">×</button>
            <span class="elevateli-sr-only" role="status"></span>
          </div>
          
          <!-- Expanded view -->
          <div class="overlay-expanded-view">
            <div class="status-indicator">
              <span class="status-icon"></span>
              <span class="status-text">Initializing...</span>
            </div>
            <div class="unified-section hidden"></div>
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
    // One delegated listener, because the results markup is rebuilt from strings. Script-dispatched
    // clicks (isTrusted false) are ignored: page scripts must not start analyses billed to the user's key.
    this.overlayElement.addEventListener('click', e => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      e.preventDefault();
      if (!e.isTrusted) return;
      const actions = {
        analyze: () => this.handleAnalyze(),
        details: () => this.toggleView(),
        consent: () => this.acceptConsent(),
        hide: () => this.hideOnProfile(),
        'open-settings': () => this.openSettings(target)
      };
      actions[target.dataset.action]?.();
    });
  },

  /**
   * First-run consent from the welcome card. Writes what the popup's setup writes (the overlay only
   * exists on the user's verified own profile), then runs the analysis the user asked for.
   */
  async acceptConsent() {
    if (!chrome.runtime?.id) return;
    try {
      await saveUserProfileId();
      await chrome.storage.local.set({ compliance: { hasAcknowledged: true, acknowledgedAt: Date.now(), version: '1.0' } });
    } catch (error) {
      console.error('[ElevateLI] Saving setup failed:', error);
      this.showError('Setup failed. Refresh the page and try again.');
      return;
    }
    this.hasCompliance = true;
    this.handleAnalyze();
  },

  /**
   * The bar's ×: hide the overlay on the profile until Show analysis is turned back on in the popup
   */
  hideOnProfile() {
    if (!chrome.runtime?.id) return;
    chrome.storage.local.set({ showAnalysis: false });
    this.hide();
    this.showToast('ElevateLI is hidden. Turn it back on from the ElevateLI icon.', 'info');
  },

  /**
   * Open the extension popup (settings). Chrome refuses when the window isn't focused; then point at the icon.
   * @param {Element} link - The clicked control, replaced by the hint on failure
   */
  openSettings(link) {
    safeSendMessage({ action: 'openPopup' }, response => {
      if (!response?.success) link.replaceWith("Open ElevateLI from Chrome's puzzle-piece menu.");
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
      // Set before injection (a no-op then) and after a factory reset: the zero state handles both setup cases
      [this.states.INITIALIZING]: () => this.showZeroState(),

      // Set up, nothing cached for this profile (also after Reset Profile Analysis)
      [this.states.EMPTY_CACHE]: () => this.showZeroState(),

      [this.states.SCANNING]: () => {
        // COMPLETE (incl. every cache restore) hides the indicator; the status and elapsed counter live in it
        this.overlayElement.querySelector('.status-indicator').style.display = '';
        this.updateStatus('Scanning profile sections...', '⏳');
        this.startElapsedTimeDisplay();
        this.overlayElement.querySelector('.unified-section').replaceChildren();
      },

      [this.states.CALCULATING]: () => {
        this.updateStatus('Calculating completeness...', '⏳');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
      },

      [this.states.AI_ANALYZING]: () => {
        this.updateStatus('AI analyzing profile sections...', '⏳');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        // Elapsed timer keeps running from SCANNING - one counter for the whole analysis
      },
      
      [this.states.COMPLETE]: () => {
        // Hide status indicator after analysis
        this.hideStatusIndicator();

        // Always stop: cache-backed results (analyze()'s cache hit, AI failure with cached AI
        // fields) also arrive after SCANNING started the timer; a no-op on plain restores
        this.stopElapsedTimeDisplay();
        
        this.populateScores(data);
        
        // Store the full data for reference by other methods
        this.currentData = data;
        
        // Show unified view
        this.showUnifiedView(data);

        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
        
        // A run that just failed AI says so next to its date; a restore shows the amber "No score" badge
        if (!data.fromCache && !data.cacheRestored && this.aiFailed(data)) {
          this.showError('AI analysis failed', data.aiError);
        }
      },

      [this.states.ERROR]: () => {
        // Stop elapsed time display if running
        this.stopElapsedTimeDisplay();

        // The provider's own message (e.g. rate limit wait) is the useful part
        const errorMessage = data.aiError?.message || data.message || 'Analysis failed';

        this.updateStatus(errorMessage, '❌');

        // Show completeness if available (analysis partially succeeded)
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }

        this.showError(errorMessage, data.aiError);
      },

      [this.states.ANALYSIS_FAILED_CACHE_FALLBACK]: () => {
        // Stop elapsed time display if running
        this.stopElapsedTimeDisplay();
        this.hideStatusIndicator();

        // Show cached data
        this.populateScores(data);

        // The flag makes the results banner carry data.message (what failed) in amber
        this.currentData = { ...data, isCacheFallback: true };
        this.showUnifiedView(this.currentData);

        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
        this.showError('Showing previous results', data.aiError || { message: data.message });
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
   * AI was on for this result but its run failed (cached results keep aiError until a run succeeds).
   * A fresh result has no settings, and only AI-enabled runs set aiError, so missing settings counts as on.
   */
  aiFailed(data) {
    return !!data.aiError && data.settings?.enableAI !== false;
  },

  /**
   * Error line in the collapsed bar, the only part of the overlay visible in both views. Key and
   * provider-check failures get an "Open settings" link; the Analyze button is the retry.
   * @param {string} message - Short text; the full reason goes in the title and the expanded banner
   * @param {Object} [aiError] - aiError of the result, if the failure was AI's
   */
  showError(message, aiError) {
    const slot = this.overlayElement.querySelector('.last-analyzed-collapsed');
    slot.textContent = message;
    slot.title = aiError?.message || message;
    slot.className = 'last-analyzed-collapsed has-error';
    if (['AUTH', 'validation_failed'].includes(aiError?.type)) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'eli-link';
      link.dataset.action = 'open-settings';
      link.textContent = 'Open settings';
      slot.append(' ', link);
    }
    this.announce(aiError?.message ? `${message}: ${aiError.message}` : message);
  },

  /**
   * Say it to screen readers through the bar's role="status" region
   */
  announce(text) {
    const region = this.overlayElement?.querySelector('.elevateli-sr-only');
    if (region) region.textContent = text;
  },
  
  /**
   * Fill a collapsed-bar badge: responsive label, ': ', then the value (text or nodes).
   * Resets the class, so a previous state's colour can't outlive its result.
   * @returns {Element} The badge, for the caller's state class
   */
  setBadge(type, ...value) {
    const badge = this.overlayElement.querySelector(`.score-badge.${type}`);
    const [full, short] = type === 'completeness' ? ['Completeness', 'Complete'] : ['Content quality', 'Quality'];
    const fullSpan = document.createElement('span');
    fullSpan.className = 'label-full';
    fullSpan.textContent = full;
    const shortSpan = document.createElement('span');
    shortSpan.className = 'label-short';
    shortSpan.textContent = short;
    badge.replaceChildren(fullSpan, shortSpan, ': ', ...value);
    badge.className = `score-badge ${type}`;
    badge.title = '';
    return badge;
  },

  /**
   * Update completeness score
   * @param {number} score - Completeness percentage
   */
  updateCompleteness(score) {
    this.setBadge('completeness', `${Math.round(score)}%`).classList.add(this.getScoreClass(score, false));
  },

  /**
   * Populate all scores
   * @param {Object} data - Score data
   */
  populateScores(data) {
    if (data.completeness !== undefined) {
      this.updateCompleteness(data.completeness);
    }

    // aiDisabled also marks the timeout path's placeholder contentScore 0
    if (typeof data.contentScore === 'number' && !data.aiDisabled) {
      // 10-point AI score as 5 stars
      const badge = this.setBadge('quality', this.renderStars(Math.round(data.contentScore / 2), data.errorType));
      // These AI results are from an earlier run: this one's AI step failed
      if (data.aiFailedWithCache) {
        const asterisk = document.createElement('span');
        asterisk.className = 'eli-asterisk';
        asterisk.textContent = '*';
        asterisk.title = 'AI analysis failed, so these are your previous AI results. Click Analyze to retry.';
        badge.appendChild(asterisk);
      }
      badge.classList.add(this.getScoreClass(data.contentScore, true));
    } else if (this.aiFailed(data)) {
      // Same "No score" for a fresh failure, a failed key check, a timeout and a restored failure
      const badge = this.setBadge('quality', 'No score');
      badge.classList.add('ai-error');
      badge.title = data.aiError.message;
    } else {
      // Blank stars, never 0/5
      this.setBadge('quality', this.renderStars(null, null)).classList.add('ai-disabled');
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
    // The consent card, progress and results all live in the expanded view
    if (this.viewState === 'collapsed') this.toggleView();

    // First run: the welcome card's consent button is the setup step
    if (!this.hasCompliance) {
      this.overlayElement.querySelector('[data-action="consent"]')?.focus();
      return;
    }

    const collapsedBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');

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
    const unifiedSection = this.overlayElement.querySelector('.unified-section');

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

    // Analyze sections and create improvements
    const sections = this.analyzeSections(data, missingItems);

    // Generate unified message
    const unifiedMessage = this.generateUnifiedMessage(completeness, contentScore, sections, data);

    return {
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
      
      // A run that just fell back to cached results: the analyzer's message says what failed
      if (data.isCacheFallback && data.message) return data.message;

      // AI failed with no earlier AI results to show: say why (a restore of earlier ones has the asterisk)
      if (this.aiFailed(data) && !data.aiFailedWithCache) {
        const reason = String(data.aiError.message || 'unknown error').replace(/\.$/, '');
        return `AI analysis failed (${reason}). Profile ${safeCompleteness}% complete. Click Analyze to retry.`;
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
   * Fill a container from a template string with DOMParser (no innerHTML). Dynamic text must go through escapeHtml.
   */
  fillFromTemplate(container, html) {
    container.replaceChildren(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
  },

  /**
   * Zero state: no result to show. Before setup the welcome card asks for consent right here (Analyze
   * leads to it); once set up, or after Reset Profile Analysis, one line points at Analyze.
   */
  showZeroState() {
    // Reset Profile Analysis also reaches tabs without an overlay (another member's profile, Show analysis off)
    if (!this.overlayElement) return;
    // A reset can land mid-run: no status line or ticking counter over the zero state
    this.stopElapsedTimeDisplay();
    this.hideStatusIndicator();

    const scrollNote = 'The page scrolls briefly while ElevateLI reads your profile. Under 30 seconds, or a few minutes with AI.';
    const unifiedSection = this.overlayElement.querySelector('.unified-section');
    this.fillFromTemplate(unifiedSection, this.hasCompliance
      ? `<p class="eli-welcome-text">Click Analyze to score your profile. ${scrollNote}</p>`
      : `<div class="eli-welcome">
          <h3 class="eli-welcome-title">Welcome to ElevateLI</h3>
          <p class="eli-welcome-text">See how complete your profile is and what to add next. ${scrollNote}</p>
          <p class="eli-welcome-consent">ElevateLI analyzes only your own profile and keeps the results in this browser.</p>
          <button type="button" class="eli-primary" data-action="consent">Confirm and analyze</button>
        </div>`);
    unifiedSection.classList.remove('hidden');

    this.setBadge('completeness', '—');
    this.setBadge('quality', '—');
    const slot = this.overlayElement.querySelector('.last-analyzed-collapsed');
    slot.textContent = this.hasCompliance ? 'Not analyzed' : 'Setup needed';
    slot.title = '';
    slot.className = 'last-analyzed-collapsed';

    // Enabled before setup too: Analyze opens the consent card
    const analyzeBtn = this.overlayElement.querySelector('.analyze-btn-collapsed');
    analyzeBtn.textContent = 'Analyze';
    analyzeBtn.disabled = false;
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
           this.currentState === this.states.SCANNING ||
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
          this.currentState !== this.states.AI_ANALYZING) {
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