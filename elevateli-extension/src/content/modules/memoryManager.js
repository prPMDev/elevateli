/**
 * Memory management utilities for preventing memory leaks
 */

import { ExtensionState } from './state.js';

/**
 * Add a managed event listener that can be cleaned up later
 */
export function addManagedEventListener(element, event, handler, options) {
  if (!element) return;
  
  // Remove any existing listener with same signature
  removeManagedEventListener(element, event, handler);
  
  element.addEventListener(event, handler, options);
  ExtensionState.eventListeners.push({ element, event, handler, options });
}

/**
 * Remove a managed event listener
 */
export function removeManagedEventListener(element, event, handler) {
  if (!element) return;
  
  element.removeEventListener(event, handler);
  ExtensionState.eventListeners = ExtensionState.eventListeners.filter(
    listener => !(listener.element === element && listener.event === event && listener.handler === handler)
  );
}

/**
 * Add a managed timeout that can be cleaned up later
 */
export function addManagedTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    callback();
    ExtensionState.timeouts = ExtensionState.timeouts.filter(id => id !== timeoutId);
  }, delay);
  ExtensionState.timeouts.push(timeoutId);
  return timeoutId;
}

/**
 * Clear a managed timeout
 */
export function clearManagedTimeout(timeoutId) {
  clearTimeout(timeoutId);
  ExtensionState.timeouts = ExtensionState.timeouts.filter(id => id !== timeoutId);
}

/**
 * Add a managed interval that can be cleaned up later
 */
export function addManagedInterval(callback, delay) {
  const intervalId = setInterval(callback, delay);
  ExtensionState.intervals.push(intervalId);
  return intervalId;
}

/**
 * Clear a managed interval
 */
export function clearManagedInterval(intervalId) {
  clearInterval(intervalId);
  ExtensionState.intervals = ExtensionState.intervals.filter(id => id !== intervalId);
}

/**
 * Comprehensive cleanup function
 */
export function cleanup() {
  // Disconnect all mutation observers
  ExtensionState.observers.forEach(obs => {
    try {
      obs.disconnect();
    } catch (e) {
      console.error('Error disconnecting observer:', e);
    }
  });
  ExtensionState.observers = [];
  
  // Remove all event listeners
  ExtensionState.eventListeners.forEach(({ element, event, handler, options }) => {
    try {
      element.removeEventListener(event, handler, options);
    } catch (e) {
      console.error('Error removing event listener:', e);
    }
  });
  ExtensionState.eventListeners = [];
  
  // Clear all timeouts
  ExtensionState.timeouts.forEach(timeoutId => {
    try {
      clearTimeout(timeoutId);
    } catch (e) {
      console.error('Error clearing timeout:', e);
    }
  });
  ExtensionState.timeouts = [];
  
  // Clear all intervals
  ExtensionState.intervals.forEach(intervalId => {
    try {
      clearInterval(intervalId);
    } catch (e) {
      console.error('Error clearing interval:', e);
    }
  });
  ExtensionState.intervals = [];
  
  // Remove storage listener if exists
  if (ExtensionState.storageListener && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(ExtensionState.storageListener);
    ExtensionState.storageListener = null;
  }
  
  // Reset state flags
  ExtensionState.badgeInjected = false;
  ExtensionState.isExtracting = false;
}