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
    this.showToast('ElevateLI is hidden. Turn it back on from the ElevateLI icon.');
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

    // The scroll notice lasts only while SCANNING scrolls <main>
    if (newState !== this.states.SCANNING) this.scrollToast?.remove();

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
        // Lower sections mount only when <main> scrolls to them, which carries the overlay out of view.
        // The toast is fixed, so it explains the motion; 20 s is a backstop, the next state removes it.
        this.scrollToast = this.showToast('Scrolling through your profile so LinkedIn loads every section…', 20000);
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
        if (!data.fromCache && !data.cacheRestored) {
          if (this.aiFailed(data)) this.showError('AI analysis failed', data.aiError);
          else this.announce(`Analysis complete. Profile ${Math.round(data.completeness)}% complete.`);
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
   * AI is set up now but this result has no AI scores (e.g. cached from an AI-off run): the next step is Analyze
   */
  aiReady(data) {
    return !data.aiError && !!data.settings?.enableAI && !!data.settings?.aiProvider;
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
      this.setBadge('quality', this.renderStars(null, this.aiReady(data) ? 'AI_READY' : null)).classList.add('ai-disabled');
    }
  },

  /**
   * AI progress: the status line, and the step on the collapsed Analyze button (visible in both views)
   * @param {string} phase - 'analyzing' or 'synthesizing'
   * @param {string} section - Section name, e.g. "Skills (58 total)"
   * @param {number} [step] - 1-based number of the section being analyzed
   * @param {number} [total] - Number of sections
   */
  updateAIProgress(phase, section, step, total) {
    const statusText = this.overlayElement?.querySelector('.status-text');
    if (!statusText) return;
    if (phase === 'synthesizing') {
      statusText.textContent = 'Synthesizing results...';
      return;
    }
    const count = step ? ` (${step} of ${total})` : '';
    statusText.textContent = `AI analyzing ${String(section).replace(/ \(.*\)$/, '')}${count}...`;
    if (step) this.overlayElement.querySelector('.analyze-btn-collapsed').textContent = `Analyzing ${step}/${total}`;
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

    collapsedTimestamp.textContent = `Last analyzed: ${formatted}${isStale ? ' (outdated)' : ''}`;
    collapsedTimestamp.title = isStale ? 'Analysis is older than 7 days - consider re-analyzing' : '';
    // Also drops an earlier error state; the stale colour (#b45309) passes 4.5:1 on white
    collapsedTimestamp.className = `last-analyzed-collapsed${isStale ? ' is-stale' : ''}`;
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
      // Plain text; resetButtons puts "Analyze" back on every exit path
      collapsedBtn.textContent = 'Analyzing…';
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
    
    // Its own span, so the per-section status text (set by the analyzer) is never overwritten.
    // No time-based hints: they guessed ("Finalizing" at 90 s) while AI could be on section 2 of 5.
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      elapsedDisplay.textContent = `Elapsed: ${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`;
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
    this.scrollToast?.remove();

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
   * Results: a banner with the outcome and the next step, a caption while nothing is AI-rated, one row per section
   */
  showUnifiedView(data) {
    const unifiedSection = this.overlayElement.querySelector('.unified-section');
    // Every gap, not the top-5 'recommendations' slice - smaller gaps would get a false ✓
    const sections = this.analyzeSections(data, data.completenessData?.allRecommendations || []);
    const rated = sections.some(section => typeof section.rating === 'number');
    // Neutral, amber for a failure: a green banner on a 51% score or a failed run read as success
    const warn = data.isCacheFallback || (this.aiFailed(data) && !data.aiFailedWithCache);

    // Blank stars are explained once, here, instead of only in a tooltip on every row
    let caption = '';
    if (!rated && !this.aiFailed(data)) {
      caption = this.aiReady(data)
        ? '<p class="eli-caption">AI is set up. Click Analyze to rate your content.</p>'
        : '<p class="eli-caption">Star ratings need AI. <button type="button" class="eli-link" data-action="open-settings">Turn on AI</button></p>';
    }

    this.fillFromTemplate(unifiedSection, `
      <p class="eli-banner${warn ? ' is-warning' : ''}">${this.escapeHtml(this.generateUnifiedMessage(data, sections))}</p>
      ${caption}
      ${sections.map(section => this.renderSection(section)).join('')}
    `);

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
   * AI action items as advice rows: most important first, then capped by the section's rating
   */
  aiImprovements(items, rating, sectionName) {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...(items || [])]
      .sort((a, b) => (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4))
      .slice(0, this.getImprovementLimit(rating, sectionName))
      .map(item => ({ text: item.action || 'Improvement needed', why: item.impact }));
  },

  /**
   * One row per section in LinkedIn's page order. A section the AI rated shows the AI's advice; every
   * row also leads with its completeness gap and the points fixing it adds.
   */
  analyzeSections(data, missingItems) {
    const sectionScores = data.sectionScores || {};
    const gap = section => missingItems.find(item => item.section === section);
    // A section whose AI call failed is stored as { score: null, errorType }: not a rating, so the row falls back
    const scored = analysis => typeof analysis?.score === 'number';
    const extracted = section => data.extractedData?.[section] || data.completenessData?.breakdown?.[section]?.data;
    const photoMissing = !!gap('photo');
    const sections = [];

    // [CRITICAL_PATH:FIRST_IMPRESSION_UI] - P0: Display unified first impression
    const firstImpression = sectionScores.first_impression;
    if (scored(firstImpression)) {
      const rating = this.scoreToRating(firstImpression.score);
      // Keep headline, photo, untagged '10/10' and plain-string items (schema-ignoring local models). Drop banner
      // items (no banner is extracted) and photo items when the Profile Photo row already says to add one.
      const items = (firstImpression.actionItems || [])
        .filter(item => item.element !== 'banner' && !(photoMissing && item.element === 'photo'));
      sections.push({
        name: 'First Impression',
        key: 'headline',
        rating,
        positive: firstImpression.positiveInsight || null,
        improvements: this.aiImprovements(items, rating)
      });
    } else {
      sections.push({
        name: 'Headline',
        key: 'headline',
        rating: null, // Always show blank stars without AI
        errorType: firstImpression?.errorType || null,
        positive: !gap('headline') && extracted('headline')?.charCount >= 50 ? '✓ You have a professional headline' : null,
        improvements: []
      });
    }

    // Profile photo: a row only when missing (First Impression covers a present one); never AI-rated
    if (photoMissing) {
      sections.push({ name: 'Profile Photo', key: 'photo', stars: false, rating: null, positive: null, improvements: [] });
    }

    const about = sectionScores.about;
    if (scored(about)) {
      const rating = this.scoreToRating(about.score);
      sections.push({ name: 'About Section', key: 'about', rating, positive: about.positiveInsight || null,
        improvements: this.aiImprovements(about.actionItems, rating) });
    } else {
      sections.push({ name: 'About Section', key: 'about', rating: null, errorType: about?.errorType || null,
        positive: !gap('about') && extracted('about')?.charCount >= 800 ? '✓ Comprehensive About section' : null,
        improvements: [] });
    }

    // experience_overall, or the single 'experience' section the analyzer sends when deep extraction fails
    const experience = sectionScores.experience_overall || sectionScores.experience;
    if (scored(experience)) {
      const rating = this.scoreToRating(experience.score);
      sections.push({ name: 'Experience', key: 'experience', rating, positive: experience.positiveInsight || null,
        improvements: this.aiImprovements(experience.actionItems, rating, 'Experience') });
    } else {
      const experienceData = extracted('experience');
      let positive = null;
      if (!gap('experience') && experienceData?.hasCurrentRole) {
        positive = '✓ Your experience section is up to date';
      } else if (!gap('experience') && experienceData?.count >= 2) {
        positive = `✓ ${experienceData.count} professional experiences documented`;
      }
      sections.push({ name: 'Experience', key: 'experience', rating: null, errorType: experience?.errorType || null,
        positive, improvements: [] });
    }

    // [CRITICAL_PATH:RECOMMENDATIONS_AI_DISPLAY] - P0: Must show AI analysis for recommendations
    // Shown whenever the AI rated them, also next to a completeness gap (e.g. none from the last 2 years)
    const recommendations = sectionScores.recommendations;
    if (scored(recommendations)) {
      const rating = this.scoreToRating(recommendations.score);
      sections.push({ name: 'Recommendations', key: 'recommendations', rating, positive: recommendations.positiveInsight || null,
        improvements: this.aiImprovements(recommendations.actionItems, rating) });
    } else {
      const count = extracted('recommendations')?.count;
      sections.push({ name: 'Recommendations', key: 'recommendations', rating: null, errorType: recommendations?.errorType || null,
        positive: !gap('recommendations') && count > 0 ? `✓ You have ${count} recommendation${count > 1 ? 's' : ''}` : null,
        improvements: [] });
    }

    const skills = sectionScores.skills;
    if (scored(skills)) {
      const rating = this.scoreToRating(skills.score);
      sections.push({ name: 'Skills & Expertise', key: 'skills', rating, positive: skills.positiveInsight || null,
        improvements: this.aiImprovements(skills.actionItems, rating) });
    } else {
      const count = extracted('skills')?.count;
      sections.push({ name: 'Skills & Expertise', key: 'skills', rating: null, errorType: skills?.errorType || null,
        positive: !gap('skills') && count >= 10 ? `✓ Strong skills section with ${count} skills` : null,
        improvements: [] });
    }

    // Each row leads with its completeness gap and what fixing it adds: the scorer's weight, in % points
    sections.forEach(section => {
      const rec = gap(section.key);
      if (rec) section.improvements.unshift({ text: rec.message, why: `+${Math.round(rec.impact)}% completeness` });
    });

    // Sections without a row: their gaps, and which already earn full credit, so the score adds up
    const rowKeys = sections.map(section => section.key);
    const breakdown = data.completenessData?.breakdown || {};
    const otherGaps = missingItems.filter(item => !rowKeys.includes(item.section));
    const fullCredit = Object.keys(breakdown).filter(key => !rowKeys.includes(key) && breakdown[key].scoreMultiplier === 1);
    if (otherGaps.length || fullCredit.length) {
      sections.push({
        name: 'Other Sections',
        stars: false,
        rating: null,
        positive: fullCredit.length ? `✓ Full credit: ${fullCredit.map(key => key[0].toUpperCase() + key.slice(1)).join(', ')}` : null,
        improvements: otherGaps.map(item => ({ text: item.message, why: `+${Math.round(item.impact)}% completeness` }))
      });
    }

    return sections;
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
    // Profile Photo and Other Sections are never AI-rated, so they get no star row
    let stars = '';
    if (section.stars !== false) {
      // Generate a unique placeholder ID for this section's stars, filled in by showUnifiedView
      const starPlaceholderId = `star-placeholder-${Math.random().toString(36).substr(2, 9)}`;
      if (!this.pendingStarElements) {
        this.pendingStarElements = [];
      }
      this.pendingStarElements.push({
        id: starPlaceholderId,
        element: this.renderStars(section.rating, section.errorType)
      });
      stars = `<div class="star-rating" data-star-placeholder="${starPlaceholderId}"></div>`;
    }

    return `
      <div class="eli-row">
        <div class="eli-row-head">
          <h5 class="eli-row-title">${this.escapeHtml(section.name)}</h5>
          ${stars}
        </div>
        ${section.errorType ? '<p class="eli-row-note">Couldn\'t rate this section with AI. Click Analyze to retry.</p>' : ''}
        ${section.positive ? `<p class="eli-row-positive">${this.escapeHtml(section.positive)}</p>` : ''}
        ${section.improvements.length > 0 ? `
          <ul class="eli-advice">
            ${section.improvements.map(imp => `
              <li>
                ${this.escapeHtml(imp.text)}
                ${imp.why ? `<div class="eli-why">${this.escapeHtml(imp.why)}</div>` : ''}
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

    // Create wrapper span. role="img" reads the label instead of five "white star" glyphs
    const wrapper = document.createElement('span');
    wrapper.setAttribute('role', 'img');

    // If no rating (no AI analysis), show responsive display
    if (rating === null || rating === undefined) {
      const tooltip = this.getFailureTooltip(errorType);
      wrapper.title = tooltip;
      wrapper.setAttribute('aria-label', `Not rated. ${tooltip}`);
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
    wrapper.setAttribute('aria-label', `${rating} out of 5 stars, ${qualityText}`);

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
      'AI_READY': 'Click Analyze for AI content analysis',
      'DEFAULT': 'No AI rating yet. Turn on AI in settings, then click Analyze.'
    };

    return tooltipMap[errorType] || tooltipMap['DEFAULT'];
  },

  /**
   * Banner text: what failed, or the completeness, the AI verdict and the next step
   */
  generateUnifiedMessage(data, sections) {
    const percent = Math.round(Number(data.completeness) || 0);

    // A run that just fell back to cached results: the analyzer's message says what failed
    if (data.isCacheFallback && data.message) return data.message;

    // AI failed with no earlier AI results to show: say why (a restore of earlier ones has the asterisk)
    if (this.aiFailed(data) && !data.aiFailedWithCache) {
      const reason = String(data.aiError.message || 'unknown error').replace(/\.$/, '');
      return `AI analysis failed (${reason}). Profile ${percent}% complete. Click Analyze to retry.`;
    }

    const parts = [percent >= 100 ? 'Your profile is complete.' : `${percent}% complete.`];
    // Same scale as the quality badge's colour, so text, stars and colour agree
    if (typeof data.contentScore === 'number' && sections.some(section => typeof section.rating === 'number')) {
      const verdict = { 'score-excellent': 'Excellent', 'score-good': 'Good', 'score-moderate': 'Fair', 'score-poor': 'Needs improvement' };
      parts.push(`Content quality: ${verdict[this.getScoreClass(data.contentScore, true)]}.`);
    }
    // The biggest gap first: the scorer sorts its recommendations by impact
    const next = data.completenessData?.allRecommendations?.[0];
    if (next) parts.push(`Next: ${next.message}`);
    return parts.join(' ');
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
   * Fixed notice at the top right, clear of LinkedIn's Messaging dock, visible while <main> scrolls.
   * role="status" with the text set after insertion, so screen readers announce it.
   * @param {string} message - Message to display
   * @param {number} duration - Milliseconds before it removes itself (click removes it too)
   * @returns {Element} The toast, for early removal
   */
  showToast(message, duration = 5000) {
    document.querySelectorAll('.elevateli-toast').forEach(toast => toast.remove());

    const toast = document.createElement('div');
    toast.className = 'elevateli-toast';
    toast.setAttribute('role', 'status');
    toast.addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.textContent = message;
      toast.classList.add('elevateli-toast-show');
    });
    setTimeout(() => toast.remove(), duration);

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