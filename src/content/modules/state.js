/**
 * State management for the ElevateLI extension
 */

const ExtensionState = {
  isExtracting: false,
  lastExtraction: null,
  badgeInjected: false,
  lastPath: location.pathname,
  observers: [],
  eventListeners: [],
  timeouts: [],
  intervals: [],
  lastCompletenessScore: 0,
  storageListener: null
};

/**
 * Reset state flags
 */
function resetState() {
  ExtensionState.isExtracting = false;
  ExtensionState.badgeInjected = false;
  ExtensionState.lastExtraction = null;
}

/**
 * Update navigation state
 */
function updateNavigationState(newPath) {
  ExtensionState.lastPath = newPath;
  ExtensionState.badgeInjected = false;
}