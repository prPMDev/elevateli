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
 * Send message to extension with error handling
 */
export function safeSendMessage(message, callback) {
  if (!safeChrome()) {
    console.error('Chrome APIs not available');
    if (callback) callback(null);
    return;
  }
  
  try {
    if (callback) {
      chrome.runtime.sendMessage(message, callback);
    } else {
      chrome.runtime.sendMessage(message);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    if (callback) callback(null);
  }
}

/**
 * Get data from Chrome storage
 */
export function safeStorageGet(keys, callback) {
  if (!safeChrome() || !chrome.storage || !chrome.storage.local) {
    console.error('Chrome storage not available');
    callback({});
    return;
  }
  
  try {
    chrome.storage.local.get(keys, callback);
  } catch (error) {
    console.error('Error getting storage:', error);
    callback({});
  }
}

/**
 * Set data in Chrome storage
 */
export function safeStorageSet(data, callback) {
  if (!safeChrome() || !chrome.storage || !chrome.storage.local) {
    console.error('Chrome storage not available');
    if (callback) callback();
    return;
  }
  
  try {
    if (callback) {
      chrome.storage.local.set(data, callback);
    } else {
      chrome.storage.local.set(data);
    }
  } catch (error) {
    console.error('Error setting storage:', error);
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