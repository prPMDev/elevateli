/**
 * Chrome API utility functions
 */

/**
 * Check if Chrome APIs are available
 */
export function safeChrome() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

/**
 * Check if extension context is still valid
 * More robust than just checking chrome.runtime.id
 */
export function isContextValid() {
  try {
    // First check basic requirements
    if (!safeChrome()) {
      return false;
    }
    
    // Try to access chrome.runtime.id - this will throw if context is invalid
    const runtimeId = chrome.runtime.id;
    if (!runtimeId) {
      return false;
    }
    
    // Additional check - try to access storage
    // This helps catch cases where runtime.id exists but context is partially invalid
    if (!chrome.storage || !chrome.storage.local) {
      return false;
    }
    
    return true;
  } catch (e) {
    // Any error means context is invalid
    return false;
  }
}

/**
 * Send message to extension with error handling and retry
 */
export function safeSendMessage(message, callback, retryCount = 0) {
  if (!safeChrome()) {
    // console.error('Chrome APIs not available');
    if (callback) callback(null);
    return;
  }
  
  try {
    if (callback) {
      chrome.runtime.sendMessage(message, (response) => {
        // Check for Chrome runtime errors
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || '';
          // console.error('[SafeSendMessage] Chrome runtime error:', errorMsg);
          
          // Common errors when service worker is not available
          const isServiceWorkerError = 
            errorMsg.includes('Could not establish connection') ||
            errorMsg.includes('message port closed') ||
            errorMsg.includes('No SW') ||
            errorMsg.includes('Extension context invalidated');
          
          if (isServiceWorkerError) {
            // console.warn('[SafeSendMessage] Service worker not available.');
            
            // Try to wake up the service worker by accessing chrome APIs
            if (retryCount === 0) {
              // console.log('[SafeSendMessage] Attempting to wake service worker...');
              // Access storage to potentially wake the service worker
              chrome.storage.local.get(null, () => {
                // Retry once after a short delay
                setTimeout(() => {
                  safeSendMessage(message, callback, 1);
                }, 100);
              });
              return;
            }
            
            // If retry failed, suggest page refresh
            if (retryCount > 0) {
              // console.warn('[SafeSendMessage] Service worker still unavailable. Please refresh the page.');
            }
          }
          
          callback(null);
        } else {
          // console.log('[SafeSendMessage] Response received:', {
          //   hasResponse: !!response,
          //   responseType: typeof response,
          //   messageAction: message.action
          // });
          callback(response);
        }
      });
    } else {
      chrome.runtime.sendMessage(message, () => {
        // Just check for errors even if no callback needed
        if (chrome.runtime.lastError) {
          // console.error('[SafeSendMessage] Chrome runtime error:', chrome.runtime.lastError.message);
        }
      });
    }
  } catch (error) {
    // console.error('[SafeSendMessage] Error sending message:', error);
    if (callback) callback(null);
  }
}

/**
 * Get data from Chrome storage
 */
export function safeStorageGet(keys, callback) {
  if (!isContextValid()) {
    // console.error('Chrome storage not available - context invalid');
    callback({});
    return;
  }
  
  try {
    chrome.storage.local.get(keys, (data) => {
      // Check for runtime errors after the call
      if (chrome.runtime.lastError) {
        // console.error('Chrome storage error:', chrome.runtime.lastError.message);
        callback({});
        return;
      }
      callback(data || {});
    });
  } catch (error) {
    // console.error('Error getting storage:', error);
    callback({});
  }
}

/**
 * Set data in Chrome storage
 */
export function safeStorageSet(data, callback) {
  if (!isContextValid()) {
    // console.error('Chrome storage not available - context invalid');
    if (callback) callback();
    return;
  }
  
  try {
    chrome.storage.local.set(data, () => {
      // Check for runtime errors after the call
      if (chrome.runtime.lastError) {
        // console.error('Chrome storage set error:', chrome.runtime.lastError.message);
      }
      if (callback) callback();
    });
  } catch (error) {
    // console.error('Error setting storage:', error);
    if (callback) callback();
  }
}

/**
 * Get storage data as Promise
 */
export function getStorageData(keys) {
  return new Promise((resolve) => {
    safeStorageGet(keys, (data) => {
      resolve(data || {});
    });
  });
}

/**
 * Set storage data as Promise
 */
export function setStorageData(data) {
  return new Promise((resolve) => {
    safeStorageSet(data, () => {
      resolve();
    });
  });
}