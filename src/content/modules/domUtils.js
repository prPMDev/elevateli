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
 * The target role and level as copy reads them ({roleLabel}): "Senior Product Manager", always followed by
 * "roles", "work" or "job posts". '' when no role is set (blank or the old 'general').
 */
function targetRoleLabel({ targetRole, seniorityLevel, customRole } = {}) {
  const role = targetRole === 'other' ? customRole?.trim() : {
    'product-manager': 'Product Manager', 'software-engineer': 'Software Engineer', 'data-scientist': 'Data Scientist',
    designer: 'Designer', marketing: 'Marketing', sales: 'Sales', consultant: 'Consultant', entrepreneur: 'Founder'
  }[targetRole];
  if (!role) return '';
  // Founder and custom roles get no level: custom text may already carry one
  const level = ['other', 'entrepreneur'].includes(targetRole) ? ''
    : { entry: 'Entry-level', mid: 'Mid-level', senior: 'Senior', lead: 'Lead', director: 'Director-level' }[seniorityLevel];
  return level ? `${level} ${role}` : role;
}

/**
 * The AI provider in a sentence ({provider}): Gemini, OpenAI, Claude, or "your local model" when a server URL is set
 */
function aiProviderName({ aiProvider, aiBaseUrl } = {}) {
  if (aiBaseUrl) return 'your local model';
  return { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude' }[aiProvider] || 'your AI provider';
}

/**
 * A result's date in copy ({date}): "Oct 7, 2026"
 */
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  // The extension context dies on reload
  if (!chrome.runtime?.id) return null;
  try {
    return (await chrome.storage.local.get('userProfile')).userProfile || null;
  } catch {
    return null;
  }
}

/**
 * Save user's profile ID when detected
 */
async function saveUserProfileId() {
  let profileId = extractProfileIdFromUrl();
  // /in/me/ redirects to the real profile URL: wait up to 3 seconds for it
  for (let i = 0; i < 6 && profileId === 'me'; i++) {
    await BaseExtractor.wait(500);
    profileId = extractProfileIdFromUrl();
  }
  // The extension context dies on reload
  if (!profileId || profileId === 'me' || !chrome.runtime?.id) return;

  // Get profile name from the page; '' when not found, so copy uses its no-name variant instead of the URL slug
  const profileName = BaseExtractor.topCard()?.querySelector('h2')?.textContent.trim() || '';
  
  const userProfile = {
    profileId,
    profileName,
    profileUrl: window.location.href.split('?')[0],
    savedAt: Date.now(),
    verifiedOwnership: true // Auto-detected profiles are verified
  };
  
  try {
    await chrome.storage.local.set({ userProfile });
  } catch {
    // Not saved: the next visit runs the ownership check again
  }
}
