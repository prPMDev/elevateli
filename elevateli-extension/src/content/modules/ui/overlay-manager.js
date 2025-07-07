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
    CACHE_LOADED: 'cache_loaded',
    SCANNING: 'scanning',
    EXTRACTING: 'extracting',
    CALCULATING: 'calculating',
    ANALYZING: 'analyzing',
    AI_ANALYZING: 'ai_analyzing',
    COMPLETE: 'complete',
    ERROR: 'error'
  },
  
  // Current state tracking
  currentState: null,
  overlayElement: null,
  
  /**
   * Initialize overlay and show immediately
   * @returns {OverlayManager} Self for chaining
   */
  async initialize() {
    console.log('[OverlayManager] Initializing overlay');
    this.setState(this.states.INITIALIZING);
    
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
        <div id="elevateli-overlay" class="elevateli-overlay" data-state="${this.currentState}">
          <div class="overlay-header">
            <div class="header-left">
              <h3>ElevateLI Analysis</h3>
              <span class="last-analyzed" style="font-size: 12px; color: #666; margin-left: 12px; opacity: 0;"></span>
            </div>
            <div class="header-right">
              <button class="overlay-close" aria-label="Close overlay">&times;</button>
            </div>
          </div>
        
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
      scaffoldMain: !!document.querySelector('.scaffold-layout__main')
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
    
    if (!injected) {
      Logger.error('[OverlayManager] Failed to inject overlay - no suitable location found', {
        url: window.location.href,
        hasMain: !!document.querySelector('main'),
        hasBody: !!document.body,
        bodyChildren: document.body.children.length
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
    // Close button
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
  },
  
  /**
   * Update overlay state and UI
   * @param {string} newState - New state from states enum
   * @param {Object} data - Data for the new state
   */
  setState(newState, data = {}) {
    console.log(`[OverlayManager] State change: ${this.currentState} → ${newState}`);
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
        
        // Show empty state message
        const scoresContainer = this.overlayElement.querySelector('.scores-container');
        if (scoresContainer) {
          scoresContainer.innerHTML = `
            <div class="empty-state-message" style="
              grid-column: 1 / -1;
              text-align: center;
              padding: 30px 20px;
              color: #666;
            ">
              <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;">📊</div>
              <p style="margin-bottom: 12px; font-size: 16px; font-weight: 600;">
                This profile hasn't been analyzed yet
              </p>
              <p style="font-size: 14px; color: #999;">
                Click below to generate your profile scores
              </p>
            </div>
          `;
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
        this.showMissingItems(data.completenessData);
        this.showRecommendations(data.recommendations);
        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
        // Show re-analyze button for cached results
        this.showActionButtons({ showRefresh: true });
      },
      
      [this.states.SCANNING]: () => {
        this.clearEmptyStateMessage();
        this.updateStatus('Scanning profile sections...', '⣾');
        this.showScanProgress();
      },
      
      [this.states.EXTRACTING]: () => {
        this.updateStatus('Extracting profile data...', '⣾');
        this.hideScanProgress();
        this.showProgressBar('extracting');
      },
      
      [this.states.CALCULATING]: () => {
        this.updateStatus('Calculating completeness...', '⣾');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
      },
      
      [this.states.ANALYZING]: () => {
        this.updateStatus('Running AI analysis...', '⣾');
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
        this.showProgressBar('analyzing');
      },
      
      [this.states.AI_ANALYZING]: () => {
        this.updateStatus('AI analyzing profile sections...', '⣾');
        this.hideScanProgress();
        if (data.completeness !== undefined) {
          this.updateCompleteness(data.completeness);
        }
      },
      
      [this.states.COMPLETE]: () => {
        this.clearEmptyStateMessage();
        this.updateStatus('Analysis complete', '✓');
        this.hideSkeletons();
        this.populateScores(data);
        this.showMissingItems(data.completenessData);
        this.showRecommendations(data.recommendations);
        this.showInsights(data.insights);
        // Show timestamp
        if (data.timestamp) {
          this.showTimestamp(data.timestamp);
        }
        // Show re-analyze button after fresh analysis
        this.showActionButtons({ showRefresh: true });
      },
      
      [this.states.ERROR]: () => {
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
          // Show analyze button to retry
          this.showActionButtons({ showAnalyze: true });
        }
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
      if (icon === '⣾') {
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
      // Restore the score blocks structure
      scoresContainer.innerHTML = `
        <div class="score-block completeness">
          <label>Profile Completeness</label>
          <div class="score-value skeleton">--</div>
          <div class="score-bar">
            <div class="score-bar-fill skeleton"></div>
          </div>
          <span class="score-unit">%</span>
        </div>
        
        <div class="score-block quality">
          <label>Content Quality (AI)</label>
          <div class="score-value skeleton">--</div>
          <div class="score-bar">
            <div class="score-bar-fill skeleton"></div>
          </div>
          <span class="score-unit">/10</span>
        </div>
      `;
    }
  },
  
  /**
   * Update completeness score
   * @param {number} score - Completeness percentage
   */
  updateCompleteness(score) {
    const valueEl = this.overlayElement.querySelector('.completeness .score-value');
    const barEl = this.overlayElement.querySelector('.completeness .score-bar-fill');
    
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
    
    // Check if AI is disabled
    if (data.aiDisabled || (!data.contentScore && data.fromCache !== true)) {
      // Replace quality score block with AI disabled message
      const qualityBlock = this.overlayElement.querySelector('.score-block.quality');
      if (qualityBlock) {
        qualityBlock.innerHTML = `
          <label>Content Quality (AI)</label>
          <div class="ai-disabled-message">
            Configure AI in extension settings
          </div>
        `;
      }
    } else if (data.contentScore !== undefined) {
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
    
    if (!recommendations) {
      console.log('[OverlayManager] No recommendations provided');
      return;
    }
    
    const section = this.overlayElement.querySelector('.recommendations-section');
    const list = this.overlayElement.querySelector('.recommendations-list');
    
    if (!section || !list) {
      console.log('[OverlayManager] Recommendations section or list not found');
      return;
    }
    
    // Clear existing
    list.innerHTML = '';
    
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
      if (recommendations.critical) allRecs = allRecs.concat(recommendations.critical.map(r => ({...r, priority: 'critical'})));
      if (recommendations.important) allRecs = allRecs.concat(recommendations.important.map(r => ({...r, priority: 'high'})));
      if (recommendations.niceToHave) allRecs = allRecs.concat(recommendations.niceToHave.map(r => ({...r, priority: 'medium'})));
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
      header.innerHTML = `
        <span>${category.label}</span>
        <span style="font-size: 11px; color: #666; font-weight: normal;">~${category.time}</span>
      `;
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
        const what = action.what || rec.what || rec.message || rec;
        const why = action.why || rec.why;
        const example = action.example || rec.example;
        const impact = rec.impactScore || rec.impact;
        
        // Create content structure
        let content = `<div style="margin-bottom: 4px;">${what}</div>`;
        
        if (why) {
          content += `<div style="font-size: 12px; color: #666; margin-top: 4px;">→ ${why}</div>`;
        }
        
        if (example) {
          content += `<div style="font-size: 11px; color: #0a66c2; margin-top: 4px; font-style: italic;">${example}</div>`;
        }
        
        if (impact) {
          content += `<div style="font-size: 11px; color: #057642; margin-top: 4px;">+${impact} points</div>`;
        }
        
        li.innerHTML = content;
        
        // Add hover effect
        li.onmouseover = () => li.style.backgroundColor = '#f3f2ef';
        li.onmouseout = () => li.style.backgroundColor = 'transparent';
        
        categoryList.appendChild(li);
      });
      
      categoryDiv.appendChild(categoryList);
      list.appendChild(categoryDiv);
    });
    
    if (list.children.length > 0) {
      section.classList.remove('hidden');
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
        analyzeBtn.innerHTML = `<span class="button-icon">⏱️</span>Retry in ${remaining}s`;
        remaining--;
      } else {
        clearInterval(this.countdownTimer);
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<span class="button-icon">🔄</span>Retry Analysis';
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
    
    // Hide all buttons first
    [analyzeBtn, refreshBtn, detailsBtn].forEach(btn => btn?.classList.add('hidden'));
    
    // Show appropriate buttons based on state
    if (options.showAnalyze && analyzeBtn) {
      analyzeBtn.classList.remove('hidden');
      // Update text based on current state
      if (this.currentState === this.states.EMPTY_CACHE) {
        analyzeBtn.innerHTML = '<span class="button-icon">🚀</span>Analyze Profile';
      } else {
        analyzeBtn.innerHTML = '<span class="button-icon">🔄</span>Re-analyze';
      }
    }
    if (options.showRefresh && refreshBtn) {
      refreshBtn.classList.remove('hidden');
      // Reset button state after analysis completes
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span class="button-icon">🔄</span>Re-analyze';
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
   * Handle analyze button click (first-time analysis)
   */
  handleAnalyze() {
    console.log('[OverlayManager] Analysis requested');
    const btn = this.overlayElement.querySelector('.analyze-button');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="button-icon">⏳</span>Analyzing...';
    }
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
      'analyzing-projects': 'AI analyzing Projects...'
    };
    
    statusText.textContent = messages[phase] || `AI analyzing ${section || 'profile'}...`;
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
    list.innerHTML = '';
    
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
   * Format and display timestamp
   * @param {number} timestamp - Unix timestamp
   */
  showTimestamp(timestamp) {
    const lastAnalyzed = this.overlayElement.querySelector('.last-analyzed');
    if (!lastAnalyzed) return;
    
    const formatted = this.formatTimestamp(timestamp);
    lastAnalyzed.textContent = `Last analyzed: ${formatted}`;
    lastAnalyzed.style.opacity = '1';
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
  }
};