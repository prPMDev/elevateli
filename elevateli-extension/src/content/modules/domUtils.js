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
  const currentProfileId = extractProfileIdFromUrl();
  if (!currentProfileId) return false;
  
  // First, check saved profile
  const savedProfile = await getSavedProfile();
  if (savedProfile?.profileId === currentProfileId) {
    console.log('[INFO] Matched saved profile:', savedProfile.profileId);
    return true;
  }
  
  // Check if URL contains /in/me/ (LinkedIn's "view your own profile" URL)
  if (window.location.pathname.includes('/in/me/')) {
    console.log('[INFO] Detected /in/me/ URL, saving profile');
    await saveUserProfileId();
    return true;
  }
  
  // If no saved profile yet, check for ownership indicators
  if (!savedProfile) {
    const hasIndicators = await detectOwnProfileIndicators();
    if (hasIndicators) {
      console.log('[INFO] Profile ownership indicators detected, saving profile');
      await saveUserProfileId();
      return true;
    }
  }
  
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
      console.warn('[WARN] Extension context invalidated');
      resolve(null);
      return;
    }
    
    try {
      chrome.storage.local.get(['userProfile'], (data) => {
        // Check for runtime errors
        if (chrome.runtime.lastError) {
          console.warn('[WARN] Chrome storage error:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        resolve(data.userProfile || null);
      });
    } catch (error) {
      console.warn('[WARN] Error accessing chrome storage:', error);
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
    console.log('[INFO] Profile ownership indicators found:', {
      editButton: !!editButton,
      addSectionButton: !!addSectionButton,
      analyticsButton: !!analyticsButton,
      resourcesButton: !!resourcesButton
    });
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
    console.log('[INFO] Detected /in/me/ URL, waiting for redirect...');
    
    // Wait up to 3 seconds for redirect
    let attempts = 0;
    while (profileId === 'me' && attempts < 6) {
      await new Promise(resolve => setTimeout(resolve, 500));
      profileId = extractProfileIdFromUrl();
      attempts++;
    }
    
    // If still 'me' after waiting, can't save
    if (profileId === 'me') {
      console.log('[WARN] URL still shows /in/me/ after waiting, cannot save profile');
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
      console.warn('[WARN] Chrome storage not available, cannot save profile');
      return;
    }
    
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