/**
 * Main entry point for ElevateLI content script
 * Coordinates all modules and initializes the extension
 */

// Wrap in IIFE to avoid global scope pollution
(function() {
  'use strict';

  // Initialize the extension
  async function init() {
    if (!chrome.runtime?.id || !isProfilePage() || !extractProfileIdFromUrl()) return;

    // [CRITICAL_PATH:OVERLAY_INJECTION] - P0: Core UI visibility
    // The overlay MUST show on user's own profile, even in zero state
    if (!(await isOwnProfile())) return;

    // initialize() reads compliance and restores cached results itself
    await OverlayManager.initialize();
    // No setup yet: show the zero state
    if (!OverlayManager.hasCompliance && OverlayManager.overlayElement) OverlayManager.showZeroState();
  }

  // The run in progress; a second Analyze click (e.g. from a rebuilt overlay) must not start a parallel one
  let activeAnalyzer = null;

  // Navigation away, Reset analysis and Factory Reset stop the running analysis from reading the page,
  // saving or painting (Analyzer checks this.cancelled) and free the slot and its spinning buttons for a new run
  function cancelAnalysis() {
    if (!activeAnalyzer) return;
    activeAnalyzer.cancelled = true;
    activeAnalyzer = null;
    OverlayManager.resetButtons();
    // The cancelled run paints nothing more: don't leave its spinner and elapsed counter running
    OverlayManager.stopElapsedTimeDisplay();
    if (OverlayManager.overlayElement) OverlayManager.hideStatusIndicator();
  }

  // Start analysis when requested
  async function startAnalysis(forceRefresh = false) {
    // That run's finally resets the buttons. After an extension reload it may never settle, so let the
    // orphaned-context check below run and show "Extension was updated"
    if (activeAnalyzer && chrome.runtime?.id) return;
    const analyzer = activeAnalyzer = new Analyzer();

    try {
      // Check if extension context is still valid (setState paints nothing without an overlay)
      if (!chrome.runtime?.id) {
        OverlayManager.setState(OverlayManager.states.ERROR, {
          message: 'Extension was updated. Please refresh the page to continue.'
        });
        return;
      }

      const settings = await chrome.storage.local.get(['compliance', 'enableAI', 'encryptedApiKey', 'aiProvider', 'aiModel']);
      if (!settings.compliance?.hasAcknowledged) {
        // Setup was reset elsewhere (Factory Reset in another tab): back to first-run, where Analyze offers setup
        OverlayManager.hasCompliance = false;
        OverlayManager.setState(OverlayManager.states.INITIALIZING);
        return;
      }

      // Always the current page's profile ID for cache operations, never the saved one.
      // isProfilePage() rejects /details/ and /recent-activity/ subpages: they lack most sections, and analyzing
      // one would overwrite this profile's cache. /in/<id>/overlay/... modals still have the profile behind them.
      const profileId = extractProfileIdFromUrl();
      if (!profileId || !isProfilePage()) return;

      const isOwn = await isOwnProfile();

      await analyzer.init(profileId, isOwn, settings);
      await analyzer.analyze(forceRefresh);
    } finally {
      // Also covers the early returns above, which would otherwise leave the clicked button spinning.
      // A cancelled run no longer owns the buttons.
      if (activeAnalyzer === analyzer) {
        activeAnalyzer = null;
        OverlayManager.resetButtons();
        // A no-op after a final state; stops the counter of a run that ended without one (aborted, left the profile)
        OverlayManager.stopElapsedTimeDisplay();
      }
    }
  }

  // Navigation observer for SPA navigation
  function observeNavigation() {
    let lastPath = location.pathname;
    // The profile page the overlay belongs to (null elsewhere, e.g. the feed or a /details/ subpage)
    let lastProfileId = isProfilePage() ? extractProfileIdFromUrl() : null;
    const leftProfile = () => !!lastProfileId && (extractProfileIdFromUrl() !== lastProfileId || !isProfilePage());
    // Checked on every mutation, not only once the DOM settles, so a quick A -> B -> Back to A still counts
    let left = false;

    const handle = debounce(() => {
      // Orphaned after an extension reload/update: stop, or close() would remove the new script's overlay
      if (!chrome.runtime?.id) { observer.disconnect(); return; }
      const wasLeft = left || leftProfile();
      left = false;
      // Same page and the overlay (if any) still attached: nothing to do
      if (location.pathname === lastPath && !wasLeft && OverlayManager.overlayElement?.isConnected !== false) return;
      lastPath = location.pathname;
      lastProfileId = isProfilePage() ? extractProfileIdFromUrl() : null;

      // Modals (contact info, edit intro, endorsers...) push /in/<id>/overlay/... on the same page:
      // keep the overlay and any running analysis
      if (!wasLeft && OverlayManager.overlayElement?.isConnected) return;

      // A running analysis must not read the next page or save it under this profile
      cancelAnalysis();
      // close() also drops the stale overlayElement, so init() builds a fresh overlay
      OverlayManager.close();
      // init() checks profile page, profile id and ownership
      setTimeout(init, 500);
    }, 500);

    const observer = new MutationObserver(() => {
      if (leftProfile()) left = true;
      handle();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Chrome runtime message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // SECURITY: Validate message sender
    if (!sender || sender.id !== chrome.runtime.id) {
      return false;
    }

    // Reset Profile Analysis cleared the cache: show the not-analyzed state
    if (request.action === 'triggerAnalysis') {
      cancelAnalysis(); // a running analysis would save the cache right back
      // EMPTY_CACHE also moves currentState off the cancelled run's AI_ANALYZING and clears the error styling.
      // Safe without an overlay (setState returns early).
      OverlayManager.setState(OverlayManager.states.EMPTY_CACHE);
      sendResponse({ success: true });
      return;
    }

    // Handle full extension reset
    if (request.action === 'resetToZeroState') {
      cancelAnalysis(); // a running analysis would write the profile back after storage is cleared
      // Storage was cleared: INITIALIZING without compliance shows the zero state
      OverlayManager.hasCompliance = false;
      OverlayManager.setState(OverlayManager.states.INITIALIZING);
      sendResponse({ success: true });
      return;
    }

    // After setup in the popup (updateComplianceState has already set hasCompliance). show() initializes a
    // missing overlay, and initialize() reads compliance and restores the cache itself
    if (request.action === 'showOverlay') {
      isOwnProfile().then(isOwn => {
        if (isOwn && isProfilePage()) OverlayManager.show();
        sendResponse({ success: isOwn });
      }).catch(() => sendResponse({ success: false }));
      return true; // Async response
    }

    // Setup in the popup: report this page's profile; the popup saves it once the user confirms
    if (request.action === 'saveProfile') {
      const profileId = extractProfileIdFromUrl();
      sendResponse({
        success: true,
        userProfile: {
          profileId,
          profileName: BaseExtractor.topCard()?.querySelector('h2')?.textContent.trim() || profileId,
          profileUrl: window.location.href.split('?')[0],
          savedAt: Date.now(),
          verifiedOwnership: OwnershipDetector.hasOwnershipIndicators()
        }
      });
      return;
    }

    if (request.action === 'updateOverlayVisibility') {
      if (request.showAnalysis === false) {
        // Hide the overlay without destroying it
        OverlayManager.hide();
      } else {
        // Show the overlay if we're on own profile, as init() would: not on /details/ or /recent-activity/
        isOwnProfile().then(isOwn => {
          if (isOwn && isProfilePage()) {
            // Show the existing overlay, or initialize one with automatic state management
            if (OverlayManager.overlayElement) {
              OverlayManager.show();
            } else {
              OverlayManager.initialize();
            }
          }
        });
      }
      sendResponse({ success: true });
      return;
    }

    if (request.action === 'updateComplianceState') {
      OverlayManager.hasCompliance = request.hasCompliance;
      // The overlay was built before setup, so the collapsed Analyze button is disabled and the
      // zero state says "click the extension icon". Redraw (EMPTY_CACHE or cache); both re-enable the button.
      if (OverlayManager.overlayElement && request.hasCompliance) {
        OverlayManager.restoreAppropriateState();
      }
      sendResponse({ success: true });
      return;
    }
  });

  // run_at document_idle: the DOM is parsed
  init();
  observeNavigation();

  // Isolated-world handle: OverlayManager's Analyze/Refresh buttons call startAnalysis here. For debugging,
  // OverlayManager, Analyzer and extractProfileIdFromUrl are globals in the same console context.
  window.ElevateLI = { startAnalysis };

})();
