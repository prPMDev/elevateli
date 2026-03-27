/**
 * DOM utility functions
 */


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
  const currentProfileId = extractProfileIdFromUrl();
  if (!currentProfileId) return false;
  
  // First, check saved profile (URL-based, instant and reliable)
  const savedProfile = await getSavedProfile();
  if (savedProfile?.profileId === currentProfileId) {
    return true;
  }
  
  // Second, check ownership indicators (for zero state/first-time users)
  
  if (typeof OwnershipDetector !== 'undefined') {
    // Wait for DOM to be ready before checking ownership indicators
    // This prevents false positives on non-owned profiles during initial load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (OwnershipDetector.hasOwnershipIndicators()) {
      // Save profile for future instant detection
      await saveUserProfileId();
      return true;
    }
  }
  
  
  // The above two checks are sufficient for reliable ownership detection
  
  return false;
}

/**
 * Extract profile ID from current URL
 */
function extractProfileIdFromUrl() {
  const match = window.location.pathname.match(/\/in\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Get saved user profile from storage
 */
async function getSavedProfile() {
  return new Promise((resolve) => {
    // Check if chrome APIs are available
    if (!chrome?.storage?.local) {
      resolve(null);
      return;
    }
    
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      resolve(null);
      return;
    }
    
    try {
      chrome.storage.local.get(['userProfile'], (data) => {
        // Check for runtime errors
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(data.userProfile || null);
      });
    } catch (error) {
      resolve(null);
    }
  });
}

/**
 * Detect profile ownership indicators on the page
 */
async function detectOwnProfileIndicators() {
  // Wait a bit for page to load if needed
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check for edit intro button (LinkedIn uses "Edit intro" not "Edit profile")
  const editButton = document.querySelector('button[aria-label*="Edit intro"]') ||
                     document.querySelector('a[href*="/edit/intro/"]') ||
                     document.querySelector('.pvs-profile-actions__edit-profile') ||
                     Array.from(document.querySelectorAll('button')).find(btn => 
                       btn.getAttribute('aria-label')?.includes('Edit'));
  
  // Check for "Add profile section" button
  const addSectionButton = document.querySelector('button[aria-label*="Add profile section"]') ||
                          document.querySelector('a[href*="add-edit/"]') ||
                          Array.from(document.querySelectorAll('button')).find(btn => 
                            btn.textContent?.includes('Add profile section'));
  
  // Check for analytics button (only on own profile)
  const analyticsButton = document.querySelector('button[aria-label*="View profile analytics"]') ||
                         document.querySelector('a[href*="/dashboard/"]') ||
                         Array.from(document.querySelectorAll('button')).find(btn => 
                           btn.textContent?.includes('View profile analytics'));
  
  // Check for Resources button (another ownership indicator)
  const resourcesButton = Array.from(document.querySelectorAll('button')).find(btn => 
                         btn.textContent?.trim() === 'Resources');
  
  // Check if any ownership indicator exists
  const hasOwnershipIndicator = !!(editButton || addSectionButton || analyticsButton || resourcesButton);
  
  if (hasOwnershipIndicator) {
  }
  
  return hasOwnershipIndicator;
}

/**
 * Save user's profile ID when detected
 */
async function saveUserProfileId() {
  let profileId = extractProfileIdFromUrl();
  
  // If it's /in/me/, wait for redirect to actual profile
  if (profileId === 'me') {
    
    // Wait up to 3 seconds for redirect
    let attempts = 0;
    while (profileId === 'me' && attempts < 6) {
      await new Promise(resolve => setTimeout(resolve, 500));
      profileId = extractProfileIdFromUrl();
      attempts++;
    }
    
    // If still 'me' after waiting, can't save
    if (profileId === 'me') {
      return;
    }
  }
  
  if (!profileId) return;
  
  // Get profile name from the page
  const profileNameElement = document.querySelector('h1.text-heading-xlarge');
  const profileName = profileNameElement ? profileNameElement.textContent.trim() : profileId;
  
  const userProfile = {
    profileId,
    profileName,
    profileUrl: window.location.href.split('?')[0],
    savedAt: Date.now(),
    verifiedOwnership: true // Auto-detected profiles are verified
  };
  
  try {
    // Check if chrome storage is available
    if (!chrome?.storage?.local) {
      return;
    }
    
    await chrome.storage.local.set({ userProfile });
  } catch (error) {
  }
}

// REMOVED: extractTextContent - duplicate function, use BaseExtractor.extractTextContent instead

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
    return [];
  }
}