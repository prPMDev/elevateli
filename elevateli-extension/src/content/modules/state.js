/**
 * State management for the ElevateLI extension
 */

export const ExtensionState = {
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
export function resetState() {
  ExtensionState.isExtracting = false;
  ExtensionState.badgeInjected = false;
  ExtensionState.lastExtraction = null;
}

/**
 * Update navigation state
 */
export function updateNavigationState(newPath) {
  ExtensionState.lastPath = newPath;
  ExtensionState.badgeInjected = false;
}