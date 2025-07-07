/**
 * DOM utility functions
 */

// Note: TIMINGS, addManagedTimeout, and clearManagedTimeout are assumed to be available in global scope
// from previously loaded modules in the concatenated analyzer.js

/**
 * Debounce function to limit execution frequency
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Wait for an element to appear in the DOM
 */
function waitForElement(selector, callback, maxWait = TIMINGS.ELEMENT_WAIT_TIMEOUT) {
  const startTime = Date.now();
  let timeoutId = null;
  
  const checkElement = () => {
    const element = document.querySelector(selector);
    if (element) {
      if (timeoutId) clearManagedTimeout(timeoutId);
      callback(element);
    } else if (Date.now() - startTime < maxWait) {
      timeoutId = addManagedTimeout(checkElement, TIMINGS.ELEMENT_CHECK_INTERVAL);
    }
  };
  
  checkElement();
}

/**
 * Check if current page is a LinkedIn profile page
 */
function isProfilePage() {
  const path = window.location.pathname;
  return path.includes('/in/') && !path.includes('/messaging/') && !path.includes('/jobs/');
}

/**
 * Check if viewing own profile
 */
async function isOwnProfile() {
  // Check if URL contains /in/me/ (LinkedIn's "view your own profile" URL)
  if (window.location.pathname.includes('/in/me/')) {
    // Auto-save profile ID when user is on their own profile
    await saveUserProfileId();
    return true;
  }
  
  // Get saved user profile ID and compare with current URL
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve(false);
      return;
    }
    
    chrome.storage.local.get(['userProfile'], (data) => {
      if (data.userProfile?.profileId) {
        const currentProfileId = extractProfileIdFromUrl();
        resolve(currentProfileId === data.userProfile.profileId);
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * Extract profile ID from current URL
 */
function extractProfileIdFromUrl() {
  const match = window.location.pathname.match(/\/in\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Save user's profile ID when detected
 */
async function saveUserProfileId() {
  const profileId = extractProfileIdFromUrl();
  if (!profileId || profileId === 'me') return;
  
  // Get profile name from the page
  const profileNameElement = document.querySelector('h1.text-heading-xlarge');
  const profileName = profileNameElement ? profileNameElement.textContent.trim() : profileId;
  
  const userProfile = {
    profileId,
    profileName,
    profileUrl: window.location.href.split('?')[0],
    savedAt: Date.now()
  };
  
  try {
    await chrome.storage.local.set({ userProfile });
    console.log('[INFO] User profile saved:', userProfile);
  } catch (error) {
    console.error('[ERROR] Failed to save user profile:', error);
  }
}

/**
 * Extract text content safely
 */
function extractTextContent(element, maxLength = null) {
  if (!element) return '';
  
  const text = element.textContent?.trim() || '';
  return maxLength ? text.substring(0, maxLength) : text;
}

/**
 * Find element by multiple selectors
 */
function findElement(selectors) {
  if (!Array.isArray(selectors)) {
    selectors = [selectors];
  }
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  
  return null;
}

/**
 * Create DOM element with attributes and children
 */
function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.substring(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  });
  
  // Add children
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  });
  
  return element;
}

/**
 * Safe querySelector that handles errors
 */
function safeQuerySelector(element, selector) {
  try {
    return element.querySelector(selector);
  } catch (e) {
    console.error('Invalid selector:', selector, e);
    return null;
  }
}

/**
 * Safe querySelectorAll that handles errors
 */
function safeQuerySelectorAll(element, selector) {
  try {
    return element.querySelectorAll(selector);
  } catch (e) {
    console.error('Invalid selector:', selector, e);
    return [];
  }
}