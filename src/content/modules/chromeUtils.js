/**
 * Chrome API utility functions
 */

/**
 * Check if Chrome APIs are available
 */
function safeChrome() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

/**
 * Send message to extension with error handling and retry
 */
function safeSendMessage(message, callback, retryCount = 0) {
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