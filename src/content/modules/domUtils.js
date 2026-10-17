/**
 * DOM utility functions
 */

/**
 * Debounce function to limit execution frequency
 */
function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Check if current page is a LinkedIn profile page
 */
function isProfilePage() {
  const path = window.location.pathname;
  // /details/ and /recent-activity/ subpages list a single section; analyzing there would overwrite the cache
  return path.includes('/in/') && !/\/(messaging|jobs|details|recent-activity)\//.test(path);
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

  // Second, check ownership indicators (for zero state/first-time users).
  // The 2026 top card renders client-side, after document_idle: wait for its name heading,
  // which renders together with the Edit intro link. Returns at once after SPA navigation.
  await BaseExtractor.waitForElement('main section h2', 10000);
  if (!OwnershipDetector.hasOwnershipIndicators()) return false;

  // Save profile for future instant detection
  await saveUserProfileId();
  return true;
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
  const profileName = BaseExtractor.topCard()?.querySelector('h2')?.textContent.trim() || profileId;
  
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
