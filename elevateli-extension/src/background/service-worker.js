// Service worker for handling background tasks
console.log('ElevateLI service worker loaded');

// Crypto utilities for secure API key storage
class CryptoUtils {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.ivLength = 12;
    this.saltLength = 16;
    this.iterations = 100000;
  }

  async generateKey(passphrase, salt) {
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.iterations,
        hash: 'SHA-256'
      },
      passphraseKey,
      { name: this.algorithm, length: this.keyLength },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async getOrCreatePassphrase() {
    const { installationId } = await chrome.storage.local.get('installationId');
    
    if (installationId) {
      return installationId;
    }

    const newId = crypto.randomUUID() + '-' + Date.now();
    await chrome.storage.local.set({ installationId: newId });
    return newId;
  }

  async encryptApiKey(apiKey) {
    try {
      const passphrase = await this.getOrCreatePassphrase();
      const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
      const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
      const key = await this.generateKey(passphrase, salt);

      const encoder = new TextEncoder();
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        encoder.encode(apiKey)
      );

      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt API key');
    }
  }

  async decryptApiKey(encryptedData) {
    try {
      const passphrase = await this.getOrCreatePassphrase();
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const encrypted = combined.slice(this.saltLength + this.ivLength);

      const key = await this.generateKey(passphrase, salt);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt API key');
    }
  }

  async migrateExistingKeys() {
    const { apiKey, encryptedApiKey } = await chrome.storage.local.get(['apiKey', 'encryptedApiKey']);
    
    if (!apiKey || encryptedApiKey) {
      return;
    }

    try {
      const encrypted = await this.encryptApiKey(apiKey);
      await chrome.storage.local.set({ encryptedApiKey: encrypted });
      await chrome.storage.local.remove('apiKey');
      console.log('API key successfully migrated to encrypted storage');
      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      return false;
    }
  }
}

const cryptoUtils = new CryptoUtils();

// Helper function to get decrypted API key
async function getDecryptedApiKey() {
  const { encryptedApiKey, apiKey } = await chrome.storage.local.get(['encryptedApiKey', 'apiKey']);
  
  // If we have an encrypted key, decrypt it
  if (encryptedApiKey) {
    try {
      return await cryptoUtils.decryptApiKey(encryptedApiKey);
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return null;
    }
  }
  
  // If we have a plain text key (legacy), migrate it
  if (apiKey) {
    console.log('Found legacy plain text API key, migrating...');
    await cryptoUtils.migrateExistingKeys();
    // Try again with the migrated key
    const { encryptedApiKey: newEncrypted } = await chrome.storage.local.get('encryptedApiKey');
    if (newEncrypted) {
      return await cryptoUtils.decryptApiKey(newEncrypted);
    }
  }
  
  return null;
}

// Run migration on startup
chrome.runtime.onInstalled.addListener(async () => {
  await cryptoUtils.migrateExistingKeys();
});

// Rate limiting implementation
class RateLimiter {
  constructor() {
    this.providers = {
      openai: {
        maxRequests: 10,
        windowMs: 60000,
        requests: [],
        retryAfter: null
      },
      anthropic: {
        maxRequests: 5,
        windowMs: 60000,
        requests: [],
        retryAfter: null
      }
    };
  }

  async checkLimit(provider) {
    const config = this.providers[provider];
    if (!config) return { allowed: true };

    const now = Date.now();
    
    if (config.retryAfter && now < config.retryAfter) {
      return {
        allowed: false,
        waitTime: Math.ceil((config.retryAfter - now) / 1000),
        reason: 'cooldown'
      };
    }

    config.requests = config.requests.filter(time => now - time < config.windowMs);

    if (config.requests.length >= config.maxRequests) {
      const oldestRequest = Math.min(...config.requests);
      const waitTime = Math.ceil((oldestRequest + config.windowMs - now) / 1000);
      return {
        allowed: false,
        waitTime,
        reason: 'rate_limit'
      };
    }

    config.requests.push(now);
    return { allowed: true };
  }

  setCooldown(provider, seconds) {
    if (this.providers[provider]) {
      this.providers[provider].retryAfter = Date.now() + (seconds * 1000);
    }
  }
}

const rateLimiter = new RateLimiter();

// Profile Score Calculator for weighted section scoring
class ProfileScoreCalculator {
  // Section weights (when present)
  static SECTION_WEIGHTS = {
    about: 0.30,      // 30%
    experience: 0.30, // 30%
    skills: 0.20,     // 20%
    headline: 0.10,   // 10%
    education: 0.05,  // 5%
    recommendations: 0.05 // 5%
  };
  
  // Critical sections - missing these caps the score
  static CRITICAL_SECTIONS = {
    about: { required: true, maxScoreWithout: 7 },
    experience: { required: true, maxScoreWithout: 6 },
    skills: { required: false, maxScoreWithout: 9 },
    recommendations: { required: false, maxScoreWithout: 8 }
  };
  
  static calculateOverallScore(sectionScores) {
    let totalWeight = 0;
    let weightedSum = 0;
    let maxPossibleScore = 10;
    
    // Add defensive check for sectionScores
    if (!sectionScores || typeof sectionScores !== 'object') {
      console.log('[ProfileScoreCalculator] Invalid sectionScores:', sectionScores);
      return {
        overallScore: 5, // Default middle score
        baseScore: 5,
        maxPossibleScore: 10,
        sectionScores: {},
        missingCritical: []
      };
    }
    
    // Check critical sections and apply caps
    for (const [section, rules] of Object.entries(this.CRITICAL_SECTIONS)) {
      if (!sectionScores[section]?.exists) {
        maxPossibleScore = Math.min(maxPossibleScore, rules.maxScoreWithout);
      }
    }
    
    // Calculate weighted average of existing sections
    for (const [section, data] of Object.entries(sectionScores)) {
      if (data.exists && data.score !== null) {
        const weight = this.SECTION_WEIGHTS[section] || 0;
        weightedSum += data.score * weight;
        totalWeight += weight;
      }
    }
    
    // Base score from weighted average
    let baseScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
    
    // Apply cap from missing critical sections
    const finalScore = Math.min(baseScore, maxPossibleScore);
    
    return {
      overallScore: Math.round(finalScore * 10) / 10,
      baseScore: Math.round(baseScore * 10) / 10,
      maxPossibleScore,
      sectionScores,
      missingCritical: Object.entries(this.CRITICAL_SECTIONS)
        .filter(([section, rules]) => !sectionScores[section]?.exists)
        .map(([section, rules]) => ({ section, impact: 10 - rules.maxScoreWithout }))
    };
  }
}

// Keep service worker alive
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

// Handle messages
// Cache configuration
const CACHE_CONFIG = {
  defaultDuration: 7 * 24 * 60 * 60 * 1000, // 7 days default
  keyPrefix: 'aiCache_'
};

// Check cache for analysis results - Content-based validation, no time expiration
async function checkCache(cacheKey, forceRefresh = false) {
  if (forceRefresh) {
    console.log(`Force refresh requested for ${cacheKey}, bypassing cache`);
    return null;
  }
  
  try {
    const result = await chrome.storage.local.get(cacheKey);
    if (result[cacheKey]) {
      const cached = result[cacheKey];
      const age = Date.now() - cached.timestamp;
      
      // Always return cache regardless of age - content-based invalidation only
      console.log(`Cache hit for ${cacheKey}, age: ${formatCacheAge(age)}`);
      
      // Check if cached analysis has recommendations, if not try to parse from summary
      let cachedAnalysis = cached.analysis;
      if (!cachedAnalysis.recommendations && cachedAnalysis.summary && cachedAnalysis.summary.includes('"recommendations"')) {
        console.log('📦 Re-parsing cached result to extract recommendations');
        console.log('Summary preview:', cachedAnalysis.summary.substring(0, 200));
        try {
          // Extract JSON from summary if it exists
          const jsonMatch = cachedAnalysis.summary.match(/```json\n([\s\S]+?)\n```/);
          if (jsonMatch) {
            console.log('Found JSON in summary, parsing...');
            const jsonData = JSON.parse(jsonMatch[1]);
            if (jsonData.recommendations) {
              cachedAnalysis.recommendations = jsonData.recommendations;
              cachedAnalysis.insights = jsonData.insights;
              cachedAnalysis.fullAnalysis = jsonData;
              console.log('✅ Successfully extracted recommendations from cached summary');
              console.log('Recommendations structure:', {
                hasCritical: !!jsonData.recommendations.critical,
                criticalCount: jsonData.recommendations.critical?.length || 0,
                hasImportant: !!jsonData.recommendations.important,
                importantCount: jsonData.recommendations.important?.length || 0
              });
            }
          } else {
            console.log('No JSON found in summary');
          }
        } catch (e) {
          console.error('Failed to re-parse cached recommendations:', e);
        }
      }
      
      return {
        ...cachedAnalysis,
        fromCache: true,
        cacheAge: age,
        cacheAgeFormatted: formatCacheAge(age),
        timestamp: cached.timestamp
      };
    }
  } catch (error) {
    console.error('Error checking cache:', error);
  }
  return null;
}

// Format cache age for display
function formatCacheAge(ageMs) {
  const minutes = Math.floor(ageMs / 1000 / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

// Generate cache key from profile URL and content hash
function generateCacheKey(url, profileData) {
  // Extract profile ID from URL
  if (!url) {
    console.error('generateCacheKey: No URL provided');
    return `${CACHE_CONFIG.keyPrefix}unknown_0-0-0-0`;
  }
  
  const profileMatch = url.match(/linkedin\.com\/in\/([^/]+)/i);
  const profileId = profileMatch ? profileMatch[1] : 'unknown';
  
  // Create simple content hash from key profile elements
  const contentKey = [
    profileData?.about?.charCount || profileData?.about?.text?.length || 0,
    profileData?.experience?.count || profileData?.experience?.experiences?.length || 0,
    profileData?.skills?.totalCount || profileData?.skills?.skills?.length || 0,
    profileData?.headline?.charCount || profileData?.headline?.text?.length || 0
  ].join('-');
  
  return `${CACHE_CONFIG.keyPrefix}${profileId}_${contentKey}`;
}

// REMOVED: Duplicate checkCache function - using the one above

// REMOVED: Duplicate formatCacheAge function

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle both old and new message formats
  const action = request.action;
  const payload = request.payload || request;
  
  console.log('Message received:', action, 'from:', request.source || 'unknown');
  
  if (action === 'openDashboard') {
    // Open options page on Dashboard tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('options/options.html#dashboard')
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (action === 'openPopup') {
    // Open extension popup programmatically (Chrome doesn't allow this directly)
    // Instead, open the popup in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/popup/popup.html')
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (action === 'calculateScore') {
    // Use the URL from the request if provided (content script knows its URL)
    const profileUrl = request.url || payload?.url;
    
    // Get the active tab since sender.tab might be undefined when message comes from content script
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: 'No active tab found' });
        return;
      }
      
      // Use URL from request or fall back to tab URL
      const url = profileUrl || tabs[0].url;
      
      // Ensure we're on a LinkedIn profile page
      if (!url || !url.includes('linkedin.com/in/')) {
        console.log('Not on a LinkedIn profile page:', url);
        sendResponse({ error: 'Not on a LinkedIn profile page' });
        return;
      }
      
      // Small delay to ensure script is ready
      setTimeout(() => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extractProfile' }, async (profileData) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to extract profile data:', chrome.runtime.lastError.message);
            
            // If content script is not ready, return basic error
            if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
              sendResponse({ 
                error: 'Page not ready. Please refresh and try again.',
                contentScore: null,
                completeness: null
              });
            } else {
              sendResponse({ error: chrome.runtime.lastError.message });
            }
            return;
          }
          
          if (!profileData) {
            console.error('No profile data returned');
            sendResponse({ error: 'No profile data found' });
            return;
          }
          
          if (profileData.error) {
            console.error('Profile extraction error:', profileData.error);
            sendResponse({ error: profileData.error });
            return;
          }
          chrome.storage.local.get(['aiProvider', 'linkedinProfile', 'aiModel', 'targetRole', 'seniorityLevel', 'cacheDuration', 'enableCache', 'enableAI'], async (settings) => {
        // Get decrypted API key
        const apiKey = await getDecryptedApiKey();
        
        // Check if AI is properly configured
        const isAIConfigured = !!(settings.aiProvider && apiKey);
        
        // Check if AI is enabled (unless force refresh is requested)
        if (!request.forceRefresh && (!settings.enableAI || !isAIConfigured)) {
          let cachedScore = null;
          let cacheAvailable = false;
          
          // Check for cached results regardless of current AI state
          const cacheKey = generateCacheKey(url, profileData);
          const cachedResult = await checkCache(cacheKey, request.forceRefresh);
          
          if (cachedResult) {
            cachedScore = cachedResult.contentScore;
            cacheAvailable = true;
          }
          
          // Determine the AI state
          let aiState;
          if (!isAIConfigured) {
            aiState = 'not_configured';
          } else if (!settings.enableAI) {
            aiState = 'disabled';
          } else if (!cacheAvailable) {
            aiState = 'no_cache';
          }
          
          console.log(`AI state: ${aiState}, cache available: ${cacheAvailable}`);
          
          // Return status information instead of error
          sendResponse({
            aiState,
            aiConfigured: isAIConfigured,
            aiEnabled: settings.enableAI || false,
            cacheAvailable,
            cachedScore,
            completeness: profileData?.completeness || 0,
            fromCache: cacheAvailable,
            // Include full cached result if available
            ...(cachedResult || {})
          });
          return;
        }
        
        // Must have valid API configuration for new analysis
        if (!isAIConfigured) {
          console.log('AI not configured for new analysis');
          sendResponse({ 
            error: 'AI not configured - API key required', 
            completeness: profileData?.completeness || 0,
            aiConfigured: false
          });
          return;
        }
        
        // Add decrypted key to settings for analysis
        settings.apiKey = apiKey;
        
        const isOwnProfile = settings.linkedinProfile && url && url.includes(settings.linkedinProfile?.split('/in/')[1]?.split('/')[0]);
        const profileName = profileData?.headline?.text?.split(' at ')[0] || 'Unknown';
        
        // Get completeness score from extracted data
        const completeness = profileData?.completeness || 0;
        
        // Check if force refresh is requested
        const forceRefresh = request.forceRefresh || false;
        
        // Check cache first (unless disabled or force refresh)
        if (!forceRefresh && settings.enableCache !== false) {
          const cacheKey = generateCacheKey(url, profileData);
          const cachedResult = await checkCache(cacheKey, forceRefresh);
          
          if (cachedResult) {
            console.log('Returning cached AI analysis from', cachedResult.cacheAgeFormatted, 'Score:', cachedResult.contentScore);
            console.log('📦 Cached result contains:', {
              hasRecommendations: !!cachedResult.recommendations,
              recommendationsType: typeof cachedResult.recommendations,
              keys: Object.keys(cachedResult)
            });
            // Update lastAnalyzed timestamp for popup when using cache
            await chrome.storage.local.set({ lastAnalyzed: Date.now() });
            sendResponse({
              ...cachedResult,
              completeness // Use current completeness score
            });
            return;
          }
        }
        
        try {
          // Get AI analysis (cache miss or refresh)
          let aiAnalysis;
          if (settings.aiProvider === 'openai') {
            aiAnalysis = await analyzeWithOpenAI(profileData, settings);
          } else if (settings.aiProvider === 'anthropic') {
            aiAnalysis = await analyzeWithAnthropic(profileData, settings);
          } else {
            throw new Error('Unknown AI provider');
          }
          
          const { contentScore, summary, recommendations, fullAnalysis, insights } = aiAnalysis;
          
          // Prepare response data
          const responseData = {
            contentScore, 
            completeness, 
            summary,
            recommendations, // Include recommendations in the response
            insights, // Include insights if available
            fullAnalysis, // Include full analysis if available
            aiProvider: settings.aiProvider,
            aiModel: settings.aiModel,
            queryStructure: `Target Role: ${settings.targetRole || 'Not specified'}\nProfile Elements: ${Object.keys(profileData).length}\nCompleteness: ${completeness}%`
          };
          
          // Save to cache if enabled
          if (settings.enableCache !== false) {
            const cacheKey = generateCacheKey(url, profileData);
            const cacheData = {};
            cacheData[cacheKey] = {
              timestamp: Date.now(),
              analysis: responseData
            };
            await chrome.storage.local.set(cacheData);
            console.log('Saved AI analysis to cache:', cacheKey);
            
            // Update lastAnalyzed timestamp for popup
            await chrome.storage.local.set({ lastAnalyzed: Date.now() });
          }
          
          // Save last analysis if it's personal profile
          if (isOwnProfile) {
            await chrome.storage.local.set({
              lastAnalysis: {
                timestamp: new Date().toISOString(),
                contentScore,
                completeness,
                summary,
                profileData,
                isPersonal: true,
                aiProvider: settings.aiProvider,
                aiModel: settings.aiModel,
                queryStructure: responseData.queryStructure
              }
            });
          }
          
          console.log('📤 Sending response with recommendations:', {
            hasRecommendations: !!responseData.recommendations,
            recommendationsType: typeof responseData.recommendations,
            recommendationsKeys: responseData.recommendations ? Object.keys(responseData.recommendations) : [],
            recommendationsCriticalCount: responseData.recommendations?.critical?.length || 0
          });
          sendResponse(responseData);
        } catch (error) {
          console.error('AI analysis error:', error);
          console.error('API Key present:', !!settings.apiKey);
          console.error('Provider:', settings.aiProvider);
          console.error('Model:', settings.aiModel);
          
          // Fallback to mock analysis if API fails
          const contentScore = Math.floor(Math.random() * 3) + 7;
          const summary = `[MOCK DATA - API ERROR: ${error.message}]\n\n` + generateDetailedAnalysis(profileName, profileData, contentScore, completeness);
          
          sendResponse({ 
            contentScore, 
            completeness, 
            summary,
            error: error.message,
            isMockData: true
          });
        }
          });
      });
      }, 500); // 500ms delay
    });
    return true; // Keep message channel open for async response
  }
  
  // Removed dashboard-related actions - all functionality now happens in-page
  
  if (request.action === 'testApiKey') {
    testApiKey(request.provider, request.apiKey, request.model)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'analyzeSection') {
    handleSectionAnalysis(request, sendResponse);
    return true;
  }
  
  if (request.action === 'analyzeBatch') {
    handleBatchAnalysis(request, sendResponse);
    return true;
  }
  
  if (request.action === 'getSectionScores') {
    chrome.storage.local.get(['sectionScores', 'overallScore'], (data) => {
      sendResponse({
        sectionScores: data.sectionScores || {},
        overallScore: data.overallScore || null
      });
    });
    return true;
  }

  if (request.action === 'extractFromDetailsPage') {
    handleDetailsPageExtraction(request, sendResponse);
    return true;
  }
  
  // Handle API key testing
  if (action === 'testApiKey') {
    testApiKey(request.provider, request.apiKey, request.model).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  // Handle AI analysis
  if (action === 'analyzeWithAI') {
    handleAIAnalysis(request, sender, sendResponse);
    return true;
  }
  
  // Handle API key encryption
  if (action === 'encryptApiKey') {
    cryptoUtils.encryptApiKey(request.apiKey).then(encryptedKey => {
      sendResponse({ success: true, encryptedApiKey: encryptedKey });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  // Handle synthesis of section scores
  if (action === 'synthesizeAnalysis') {
    handleSynthesisAnalysis(request, sendResponse);
    return true;
  }
  
  return true;
});

// Test API Key function
async function testApiKey(provider, apiKey, model) {
  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (response.ok) {
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error?.message || 'Invalid API key' };
      }
    } else if (provider === 'anthropic') {
      // Anthropic doesn't have a simple test endpoint, so we'll do a minimal request
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        })
      });
      
      if (response.ok || response.status === 429) { // 429 means rate limited but key is valid
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.error?.message || 'Invalid API key' };
      }
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Section-specific analysis handler for distributed architecture
async function handleSectionAnalysis(request, sendResponse) {
  const { section, data, context, settings } = request;
  
  console.log('[AI] Section analysis requested:', { 
    section, 
    hasData: !!data,
    hasContext: !!context 
  });
  
  chrome.storage.local.get(['aiProvider', 'aiModel', 'targetRole', 'seniorityLevel', 'customInstructions', 'sectionScores', 'enableAI'], async (config) => {
    // Get decrypted API key
    const apiKey = await getDecryptedApiKey();
    
    if (!config.aiProvider || !apiKey) {
      sendResponse({ error: 'AI not configured' });
      return;
    }
    
    // Add decrypted key to config
    config.apiKey = apiKey;
    
    // Check if AI is enabled
    if (!config.enableAI) {
      sendResponse({ 
        aiState: 'disabled',
        aiDisabled: true,
        message: 'AI analysis is currently disabled'
      });
      return;
    }
    
    try {
      // Build appropriate prompt based on section type
      let sectionPrompt;
      let modelOverride = null;
      
      switch(section) {
        case 'profile_intro':
          // Log enhanced context data being passed
          console.log('[AI] Profile intro enhanced context:', {
            hasYearsOfExperience: data.yearsOfExperience !== undefined,
            yearsOfExperience: data.yearsOfExperience,
            hasCareerProgression: !!data.careerProgression,
            careerProgression: data.careerProgression,
            hasProfileSections: !!data.profileSections,
            profileSectionKeys: data.profileSections ? Object.keys(data.profileSections) : [],
            hasCurrentRole: !!data.currentRole,
            currentRoleTitle: data.currentRole?.title,
            totalSkillsCount: data.totalSkillsCount,
            skillsWithEndorsements: data.skillsWithEndorsements
          });
          sectionPrompt = buildProfileIntroPrompt(data, config);
          modelOverride = 'gpt-3.5-turbo'; // Simple analysis
          break;
          
        case 'experience_role':
          sectionPrompt = buildExperienceRolePrompt(data, context, config);
          modelOverride = config.aiModel || 'gpt-4'; // Complex analysis
          break;
          
        case 'skills':
          sectionPrompt = buildSkillsPrompt(data, config);
          modelOverride = 'gpt-3.5-turbo'; // List analysis
          break;
          
        case 'recommendations':
          sectionPrompt = buildRecommendationsPrompt(data, config);
          modelOverride = 'gpt-3.5-turbo';
          break;
          
        default:
          sectionPrompt = buildSectionPrompt(section, data, {...config, ...settings});
      }
      
      // Use model override if specified
      if (modelOverride && config.aiProvider === 'openai') {
        config.aiModel = modelOverride;
      }
      
      let result;
      if (config.aiProvider === 'openai') {
        result = await analyzeWithOpenAI({}, {...config, sectionPrompt});
      } else if (config.aiProvider === 'anthropic') {
        result = await analyzeWithAnthropic({}, {...config, sectionPrompt});
      }
      
      // Store section score
      const sectionScores = config.sectionScores || {};
      sectionScores[section] = {
        exists: true,
        score: result.contentScore,
        recommendations: result.summary,
        timestamp: new Date().toISOString()
      };
      
      // Recalculate overall score
      const overallResult = ProfileScoreCalculator.calculateOverallScore(sectionScores);
      
      // Save updated scores
      await chrome.storage.local.set({ 
        sectionScores,
        overallScore: overallResult
      });
      
      // Add logging to debug section response
      console.log('[AI] Section analysis result:', {
        section,
        score: result.contentScore,
        hasRecommendations: !!result.recommendations,
        recommendationType: typeof result.recommendations,
        hasSummary: !!result.summary,
        hasFullAnalysis: !!result.fullAnalysis
      });
      
      sendResponse({
        success: true,
        section,
        score: result.contentScore,
        analysis: result.fullAnalysis,
        recommendations: result.recommendations || [],
        insights: result.insights || {},
        summary: result.summary,
        overallScore: overallResult.overallScore,
        missingCritical: overallResult.missingCritical
      });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  });
}

// Batch analysis handler
async function handleBatchAnalysis(request, sendResponse) {
  const { sections, data } = request;
  
  console.log('[BATCH] Analyzing sections:', sections);
  
  chrome.storage.local.get(['aiProvider', 'aiModel', 'targetRole', 'customInstructions', 'sectionScores', 'enableAI'], async (config) => {
    // Get decrypted API key
    const apiKey = await getDecryptedApiKey();
    
    if (!config.aiProvider || !apiKey) {
      sendResponse({ error: 'AI not configured' });
      return;
    }
    
    // Add decrypted key to config
    config.apiKey = apiKey;
    
    if (!config.enableAI) {
      sendResponse({ 
        aiState: 'disabled',
        aiDisabled: true,
        message: 'AI analysis is currently disabled'
      });
      return;
    }
    
    try {
      // Build combined prompt for all sections
      const batchPrompt = buildBatchPrompt(sections, data, config);
      let result;
      
      if (config.aiProvider === 'openai') {
        result = await analyzeWithOpenAI({}, {...config, sectionPrompt: batchPrompt});
      } else if (config.aiProvider === 'anthropic') {
        result = await analyzeWithAnthropic({}, {...config, sectionPrompt: batchPrompt});
      }
      
      // Parse batch results
      const sectionResults = parseBatchResults(result.summary, sections);
      
      // Update section scores
      const sectionScores = config.sectionScores || {};
      Object.entries(sectionResults).forEach(([section, sectionResult]) => {
        sectionScores[section] = {
          exists: true,
          score: sectionResult.score,
          recommendations: sectionResult.recommendations,
          timestamp: new Date().toISOString()
        };
      });
      
      // Recalculate overall score
      const overallResult = ProfileScoreCalculator.calculateOverallScore(sectionScores);
      
      // Save updated scores
      await chrome.storage.local.set({ 
        sectionScores,
        overallScore: overallResult
      });
      
      sendResponse({
        sectionResults,
        overallScore: overallResult.overallScore,
        missingCritical: overallResult.missingCritical
      });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  });
}

function buildBatchPrompt(sections, data, settings) {
  const targetRole = settings.targetRole || 'Professional';
  
  let prompt = `Analyze these LinkedIn profile sections for a ${targetRole}. Provide individual scores and recommendations for each section.\n\n`;
  
  sections.forEach(section => {
    if (data[section]) {
      prompt += `\n=== ${section.toUpperCase()} SECTION ===\n`;
      const sectionPrompt = buildSectionPrompt(section, data[section], settings);
      // Extract just the data part from the section prompt
      const dataMatch = sectionPrompt.match(/(?:TEXT|SKILLS DATA|EXPERIENCE DATA)[\s\S]+?(?=EVALUATE|$)/);
      if (dataMatch) {
        prompt += dataMatch[0] + '\n';
      }
    }
  });
  
  prompt += `\nFor each section, provide:
1. Section name
2. Score (X/10)
3. Top 3 specific recommendations

Format your response exactly like this for each section:
[SECTION: About]
[SCORE: 7/10]
[RECOMMENDATIONS:
1. First recommendation
2. Second recommendation  
3. Third recommendation]

[SECTION: Experience]
[SCORE: 8/10]
...and so on`;
  
  return prompt;
}

function parseBatchResults(aiResponse, sections) {
  try {
    // First try to parse as JSON array
    const jsonResults = JSON.parse(aiResponse);
    const results = {};
    
    if (Array.isArray(jsonResults)) {
      jsonResults.forEach(sectionResult => {
        if (sectionResult.section && sections.includes(sectionResult.section)) {
          results[sectionResult.section] = {
            score: sectionResult.score,
            recommendations: sectionResult.recommendations.map(rec => 
              `${rec.priority}. ${rec.action.what} - ${rec.action.why}`
            ).join('\n')
          };
        }
      });
      return results;
    }
  } catch (e) {
    // Fall back to text parsing
    console.log('[BATCH] Falling back to text parsing');
  }
  
  const results = {};
  
  // Original text parsing logic
  sections.forEach(section => {
    const sectionRegex = new RegExp(`\\[SECTION:\\s*${section}\\s*\\][\\s\\S]*?\\[SCORE:\\s*(\\d+)\\/10\\][\\s\\S]*?\\[RECOMMENDATIONS:([\\s\\S]*?)\\](?=\\[SECTION:|$)`, 'i');
    const match = aiResponse.match(sectionRegex);
    
    if (match) {
      results[section] = {
        score: parseInt(match[1]),
        recommendations: match[2].trim()
      };
      console.log(`[BATCH] Parsed ${section} score:`, match[1]);
    }
  });
  
  return results;
}

function buildSectionPrompt(section, data, settings) {
  // Use target role directly from settings
  const targetRole = settings.targetRole || 'Professional';
  
  // Add role-specific instructions for sections too
  let sectionRoleInstructions = '';
  if (targetRole === 'Product Manager') {
    sectionRoleInstructions = '\n\nIMPORTANT: For Product Manager role, focus on product strategy, metrics, user outcomes, and business impact. DO NOT focus on project timelines or project management aspects.';
  }
  
  if (section === 'about') {
    // Build JSON prompt for About section
    const sectionData = {
      text: data.text || '',
      charCount: data.charCount || 0,
      maxChars: 2600
    };
    
    const baseInstructions = `Analyze this LinkedIn About section for a ${targetRole} and respond with ONLY valid JSON.${sectionRoleInstructions}

ABOUT SECTION DATA:
- Character count: ${sectionData.charCount}/${sectionData.maxChars}
- Content: "${sectionData.text}"

EVALUATION CRITERIA:
1. Opening Hook (0-2 pts): Grabs attention in first 2 lines
2. Value Proposition (0-2 pts): Clear statement of unique value
3. Quantified Achievements (0-2 pts): Specific metrics and numbers
4. Keywords (0-2 pts): ${targetRole}-relevant terms for search
5. Call to Action (0-2 pts): Clear next steps or contact info

RESPOND WITH THIS JSON STRUCTURE:
{
  "section": "about",
  "score": [0-10],
  "breakdown": {
    "hook": [0-2],
    "value": [0-2],
    "achievements": [0-2],
    "keywords": [0-2],
    "cta": [0-2]
  },
  "status": "excellent|good|needs_improvement|missing",
  "analysis": {
    "currentState": "Brief description of what exists",
    "idealState": "What an excellent About section would include",
    "gaps": ["Gap 1", "Gap 2", "Gap 3"]
  },
  "recommendations": [
    {
      "priority": 1,
      "action": {
        "what": "Specific action",
        "why": "Impact/benefit",
        "how": "Implementation steps",
        "example": "Concrete example text"
      },
      "impact": "high|medium|low",
      "effort": "minimal|low|medium|high"
    }
  ]
}`;
    
    // Add custom instructions if provided
    if (settings.customInstructions) {
      return baseInstructions + `\n\nADDITIONAL REQUIREMENTS:\n${settings.customInstructions}\n\nIncorporate these into your analysis.`;
    }
    
    return baseInstructions;
  }
  
  if (section === 'experience') {
    const experienceData = data.experiences?.map((exp, idx) => ({
      position: idx + 1,
      title: exp.title,
      company: exp.company,
      duration: exp.duration,
      location: exp.location,
      description: exp.description || 'No description',
      hasMetrics: exp.hasQuantifiedAchievements || false,
      hasLinks: exp.hasHyperlinks || false
    }));
    
    const baseInstructions = `Analyze these LinkedIn Experience entries for a ${targetRole} and respond with ONLY valid JSON.

EXPERIENCE DATA:
${JSON.stringify(experienceData, null, 2)}

EVALUATION CRITERIA:
1. Title-Content Match (0-2 pts): Descriptions align with titles
2. Quantifiable Impact (0-3 pts): Metrics, revenue, percentages
3. Comprehensiveness (0-2 pts): Detailed achievements
4. Evidence/Links (0-1 pt): External validation
5. Career Progression (0-2 pts): Clear growth trajectory

RESPOND WITH THIS JSON STRUCTURE:
{
  "section": "experience",
  "score": [0-10],
  "breakdown": {
    "titleMatch": [0-2],
    "impact": [0-3],
    "comprehensiveness": [0-2],
    "evidence": [0-1],
    "progression": [0-2]
  },
  "status": "excellent|good|needs_improvement|missing",
  "analysis": {
    "currentState": "Summary of experience section",
    "idealState": "What excellent experience entries include",
    "gaps": ["Missing metrics in recent roles", "No external links", "Generic descriptions"]
  },
  "recommendations": [
    {
      "priority": 1,
      "position": "Which position to improve (1, 2, etc)",
      "action": {
        "what": "Add quantified achievements",
        "why": "Increases credibility and searchability",
        "how": "Replace 'managed team' with 'Led team of 12 engineers'",
        "example": "Increased user engagement by 35% through A/B testing of 3 new features"
      },
      "impact": "high",
      "effort": "low"
    }
  ]
}`;
    
    if (settings.customInstructions) {
      return baseInstructions + `\n\nADDITIONAL REQUIREMENTS:\n${settings.customInstructions}`;
    }
    
    return baseInstructions;
  }
  
  if (section === 'skills') {
    const skillsData = {
      totalCount: data.totalCount || 0,
      skills: data.skills?.map(skill => ({
        name: skill.name,
        endorsements: skill.endorsements || 0,
        hasRecentEndorsements: skill.hasRecentEndorsements || false
      })) || []
    };
    
    const baseInstructions = `Analyze these LinkedIn Skills for a ${targetRole} and respond with ONLY valid JSON.

SKILLS DATA:
${JSON.stringify(skillsData, null, 2)}

EVALUATION CRITERIA:
1. Role Relevance (0-3 pts): Skills match ${targetRole} requirements
2. Endorsement Quality (0-3 pts): Strong validation for key skills
3. Recency Bonus (0-1 pt): Recent endorsements show active profile
4. Skill Coverage (0-2 pts): Complete coverage of required skills
5. Strategic Ordering (0-1 pt): Most relevant skills at top

RESPOND WITH THIS JSON STRUCTURE:
{
  "section": "skills",
  "score": [0-10],
  "breakdown": {
    "relevance": [0-3],
    "endorsements": [0-3],
    "recency": [0-1],
    "coverage": [0-2],
    "ordering": [0-1]
  },
  "status": "excellent|good|needs_improvement|missing",
  "analysis": {
    "currentState": "${skillsData.totalCount} skills with varying endorsements",
    "idealState": "25+ relevant skills with strong endorsements",
    "missingCritical": ["List critical missing skills for ${targetRole}"]
  },
  "recommendations": [
    {
      "priority": 1,
      "action": {
        "what": "Add missing critical skills",
        "why": "Improves search ranking and recruiter matching",
        "how": "Add skills one by one, starting with most critical",
        "skillsToAdd": ["Skill 1", "Skill 2", "Skill 3"]
      },
      "impact": "high",
      "effort": "minimal"
    },
    {
      "priority": 2,
      "action": {
        "what": "Request endorsements for top skills",
        "why": "Validated skills rank higher in search",
        "how": "Message 3-5 colleagues who can endorse specific skills",
        "targetSkills": ["Skills needing endorsements"]
      },
      "impact": "medium",
      "effort": "low"
    }
  ]
}`;
    
    if (settings.customInstructions) {
      return baseInstructions + `\n\nADDITIONAL REQUIREMENTS:\n${settings.customInstructions}`;
    }
    
    return baseInstructions;
  }
  
  // Add other sections later
  return '';
}


// Handle details page extraction without opening visible tabs
async function handleDetailsPageExtraction(request, sendResponse) {
  const { url, section } = request;
  
  try {
    // Create background tab
    const tab = await chrome.tabs.create({ 
      url: url, 
      active: false,  // Don't show the tab
      pinned: true    // Minimize visual impact
    });
    
    // Wait for page to load
    await new Promise(resolve => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });
    
    // Execute extraction script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sectionType) => {
        // Extract data based on section type
        const data = [];
        
        if (sectionType === 'skills') {
          document.querySelectorAll('.pvs-entity').forEach(item => {
            const name = item.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim();
            const endorsementText = item.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent || '';
            const endorsements = parseInt(endorsementText.match(/\d+/)?.[0] || '0');
            if (name) data.push({ name, endorsements });
          });
        } else if (sectionType === 'experience') {
          document.querySelectorAll('.pvs-entity').forEach(item => {
            const title = item.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim();
            const company = item.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim();
            const description = item.querySelector('.pvs-list__outer-container .t-14.t-normal.t-black')?.textContent?.trim();
            if (title) data.push({ title, company, description });
          });
        }
        
        return data;
      },
      args: [request.section]
    });
    
    // Close the background tab
    await chrome.tabs.remove(tab.id);
    
    sendResponse({ success: true, data: results[0].result });
  } catch (error) {
    console.error('Details page extraction error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// AI Integration Functions
async function analyzeWithOpenAI(profileData, settings) {
  // Use section prompt if provided, otherwise use full analysis prompt
  const prompt = settings.sectionPrompt || buildAnalysisPrompt(profileData, settings);
  
  try {
    // Prepare messages
    const messages = [
      { 
        role: 'system', 
        content: 'You are a LinkedIn profile optimization expert. Analyze profiles and provide structured feedback. IMPORTANT: Respond with ONLY valid JSON - no markdown formatting, no code blocks, no \`\`\`json markers, just the raw JSON object. Focus on actionable recommendations with specific implementation steps and measurable outcomes.'
      }
    ];
    
    // Add photo analysis if available and model supports it
    if (profileData.photo?.url && settings.aiModel === 'gpt-4o') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'First, analyze this profile photo for professionalism:'
          },
          {
            type: 'image_url',
            image_url: {
              url: profileData.photo.url
            }
          }
        ]
      });
    }
    
    // Add main analysis prompt
    messages.push({ role: 'user', content: prompt });
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.aiModel || 'gpt-3.5-turbo',
        messages,
        temperature: 0.1,
        // Token limits by model:
        // - GPT-4 and GPT-4o: No limit needed (they handle it automatically)
        // - GPT-3.5-turbo: 4096 max completion tokens
        ...(settings.aiModel?.includes('gpt-4') ? {} : { max_tokens: 4096 })
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      
      // Categorize the error
      if (response.status === 401) {
        throw new Error(JSON.stringify({
          type: 'AUTH',
          message: 'Invalid API key. Please check your OpenAI API key in settings.',
          status: 401
        }));
      } else if (response.status === 429) {
        // Extract retry-after if available
        const retryAfter = response.headers.get('retry-after') || '60';
        throw new Error(JSON.stringify({
          type: 'RATE_LIMIT',
          message: `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`,
          status: 429,
          retryAfter: parseInt(retryAfter)
        }));
      } else if (response.status === 503) {
        throw new Error(JSON.stringify({
          type: 'SERVICE_UNAVAILABLE',
          message: 'OpenAI service is temporarily unavailable. Please try again in a few moments.',
          status: 503
        }));
      } else {
        throw new Error(JSON.stringify({
          type: 'API_ERROR',
          message: `OpenAI API error: ${errorMessage}`,
          status: response.status
        }));
      }
    }
    
    const data = await response.json();
    console.log('[AI] OpenAI raw response:', {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      hasContent: !!data.choices?.[0]?.message?.content,
      contentLength: data.choices?.[0]?.message?.content?.length,
      finishReason: data.choices?.[0]?.finish_reason,
      usage: data.usage
    });
    return parseAIResponse(data.choices[0].message.content, profileData);
  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // If it's already a categorized error, pass it through
    if (error.message.startsWith('{')) {
      throw error;
    }
    
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(JSON.stringify({
        type: 'NETWORK',
        message: 'Network connection error. Please check your internet connection.',
        status: 0
      }));
    }
    
    // Generic error
    throw new Error(JSON.stringify({
      type: 'GENERIC',
      message: error.message || 'An unexpected error occurred',
      status: 0
    }));
  }
}

async function analyzeWithAnthropic(profileData, settings) {
  // Use section prompt if provided, otherwise use full analysis prompt
  const prompt = settings.sectionPrompt || buildAnalysisPrompt(profileData, settings);
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.aiModel || 'claude-3-sonnet-20240229',
        messages: [
          { 
            role: 'system', 
            content: 'You are a LinkedIn profile optimization expert. IMPORTANT: Respond with ONLY valid JSON - no markdown formatting, no code blocks, no \`\`\`json markers, just the raw JSON object. Focus on actionable recommendations with metrics.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 8000,  // Increased to allow complete responses
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      
      // Categorize the error
      if (response.status === 401) {
        throw new Error(JSON.stringify({
          type: 'AUTH',
          message: 'Invalid API key. Please check your Anthropic API key in settings.',
          status: 401
        }));
      } else if (response.status === 429) {
        // Anthropic uses error object for rate limit info
        const retryAfter = errorData.error?.retry_after || 60;
        throw new Error(JSON.stringify({
          type: 'RATE_LIMIT',
          message: `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`,
          status: 429,
          retryAfter: retryAfter
        }));
      } else if (response.status === 503 || response.status === 529) {
        throw new Error(JSON.stringify({
          type: 'SERVICE_UNAVAILABLE',
          message: 'Anthropic service is temporarily overloaded. Please try again in a few moments.',
          status: response.status
        }));
      } else {
        throw new Error(JSON.stringify({
          type: 'API_ERROR',
          message: `Anthropic API error: ${errorMessage}`,
          status: response.status
        }));
      }
    }
    
    const data = await response.json();
    console.log('[AI] Anthropic raw response:', {
      hasContent: !!data.content,
      contentLength: data.content?.length,
      hasText: !!data.content?.[0]?.text,
      textLength: data.content?.[0]?.text?.length,
      stopReason: data.stop_reason,
      usage: data.usage
    });
    return parseAIResponse(data.content[0].text, profileData);
  } catch (error) {
    console.error('Anthropic API error:', error);
    
    // If it's already a categorized error, pass it through
    if (error.message.startsWith('{')) {
      throw error;
    }
    
    // Network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(JSON.stringify({
        type: 'NETWORK',
        message: 'Network connection error. Please check your internet connection.',
        status: 0
      }));
    }
    
    // Generic error
    throw new Error(JSON.stringify({
      type: 'GENERIC',
      message: error.message || 'An unexpected error occurred',
      status: 0
    }));
  }
}

// Section-specific prompt builders for distributed analysis

function buildProfileIntroPrompt(data, config) {
  // Extract all the rich context we built in analyzer-base.js
  const { 
    headline, 
    about, 
    photo, 
    topSkills,
    totalExperience,
    currentRole,
    yearsOfExperience,
    careerProgression,
    profileSections,
    totalSkillsCount,
    skillsWithEndorsements,
    targetRole: contextTargetRole,
    seniorityLevel: contextSeniorityLevel
  } = data;
  
  // Use context-provided role/level or fallback to config
  const targetRole = contextTargetRole || config.targetRole || 'Professional';
  const seniorityLevel = contextSeniorityLevel || config.seniorityLevel || 'mid';
  
  return `Analyze this LinkedIn profile introduction for a ${targetRole} at ${seniorityLevel} level.

Profile Overview:
- Years of Experience: ${yearsOfExperience || 'Unknown'}
- Career Progression: ${careerProgression || 'Unknown'}
- Current Role: ${currentRole?.title || 'Not specified'} at ${currentRole?.company || 'Unknown'}
- Total Experience Entries: ${totalExperience || 0}

Profile Completeness:
- Photo: ${profileSections?.hasPhoto ? 'Present' : 'Missing'}
- Headline: ${profileSections?.hasHeadline ? 'Present' : 'Missing'}
- About: ${profileSections?.hasAbout ? 'Present' : 'Missing'} 
- Experience: ${profileSections?.hasExperience ? 'Present' : 'Missing'}
- Education: ${profileSections?.hasEducation ? 'Present' : 'Missing'}
- Skills: ${profileSections?.hasSkills ? `Present (${totalSkillsCount} total, ${skillsWithEndorsements} endorsed)` : 'Missing'}
- Certifications: ${profileSections?.hasCertifications ? 'Present' : 'Missing'}
- Recommendations: ${profileSections?.hasRecommendations ? 'Present' : 'Missing'}

Core Introduction Data:
- Headline: "${headline?.text || 'Missing'}" (${headline?.charCount || 0}/220 chars)
- About Section: ${about?.charCount || 0}/2600 chars
${about?.text ? `Content: "${about.text}"` : 'No about section'}
- Top Skills: ${topSkills?.join(', ') || 'None visible'}

Given this career context and completeness data, evaluate the profile introduction quality.
Consider how well the headline and about section:
1. Reflect the ${yearsOfExperience} years of experience
2. Support the ${careerProgression} career trajectory
3. Align with ${targetRole} at ${seniorityLevel} level
4. Leverage the ${totalSkillsCount} skills in the profile

Respond with ONLY valid JSON (no markdown):
{
  "score": [0-10],
  "analysis": {
    "headline": {
      "score": [0-10],
      "strengths": ["specific strength"],
      "issues": ["specific issue"],
      "roleAlignment": [0-10],
      "leveragesExperience": "How well it uses ${yearsOfExperience} years of experience",
      "careerProgressionReflection": "Does it show ${careerProgression} trajectory"
    },
    "about": {
      "score": [0-10],
      "narrativeQuality": [0-10],
      "keywordDensity": [0-10],
      "uniqueness": [0-10],
      "missingElements": ["what's missing"],
      "careerStoryAlignment": "How well it tells the ${careerProgression} story",
      "skillsIntegration": "How well it integrates the ${totalSkillsCount} skills"
    },
    "firstImpression": {
      "score": [0-10],
      "professionalismScore": [0-10],
      "seniorityAlignment": "Does it match ${seniorityLevel} level expectations",
      "completenessImpact": "How missing sections (${Object.values(profileSections || {}).filter(v => !v).length} missing) affect impression"
    }
  },
  "recommendations": [
    {
      "priority": "critical|high|medium",
      "section": "headline|about|photo",
      "action": {
        "what": "Specific action to take",
        "why": "Impact on profile",
        "how": "Implementation steps",
        "example": "Before → After example"
      },
      "timeInvestment": "5min|15min|30min",
      "impactScore": [0-10],
      "contextualReasoning": "Why this matters for ${targetRole} with ${yearsOfExperience} years experience"
    }
  ],
  "insights": {
    "profileHook": "What makes this profile memorable",
    "marketPositioning": "How well positioned for ${targetRole} at ${seniorityLevel} level",
    "differentiators": ["unique aspects based on ${careerProgression} progression"],
    "redFlags": ["concerns for recruiters given ${yearsOfExperience} years experience"],
    "leveragedStrengths": ["How well current content uses the ${totalExperience} experiences"],
    "missedOpportunities": ["What's not being leveraged from their background"]
  }
}`;
}

function buildExperienceRolePrompt(data, context, config) {
  const { title, company, duration, location, description, bullets, hasQuantifiedAchievements, hasTechStack, keywords } = data;
  const { position, totalRoles, previousRole, nextRole } = context;
  const targetRole = config.targetRole || 'Professional';
  
  // Calculate content metrics
  const contentLength = (description?.length || 0) + bullets?.reduce((sum, b) => sum + b.length, 0) || 0;
  const hasContent = contentLength > 50;
  
  return `Analyze this specific work experience for a ${targetRole} profile.

Role Context:
- Position: ${position + 1} of ${totalRoles} total roles
- Career Progression: ${previousRole?.title || 'Start'} → ${title} → ${nextRole?.title || 'Current'}

Role Data:
- Title: ${title}
- Company: ${company}
- Duration: ${duration}
- Location: ${location || 'Not specified'}
- Content Length: ${contentLength} characters
- Has Quantified Achievements: ${hasQuantifiedAchievements}
- Has Tech Stack: ${hasTechStack}
- Keywords Found: ${keywords?.join(', ') || 'None'}

Content:
${description ? `Description: "${description}"` : 'No description provided'}
${bullets?.length ? `\nKey Achievements:\n${bullets.map((b, i) => `${i+1}. ${b}`).join('\n')}` : ''}

Evaluate for ${targetRole} relevance and respond with ONLY valid JSON:
{
  "score": [0-10],
  "analysis": {
    "relevance": {
      "score": [0-10],
      "keySkillsShown": ["skill1", "skill2"],
      "missingForRole": ["what's missing for ${targetRole}"],
      "roleAlignment": "how well this aligns with ${targetRole} career path"
    },
    "impact": {
      "score": [0-10],
      "quantifiedResults": ["specific metrics found"],
      "missingMetrics": ["metrics that should be added"],
      "achievementQuality": "none|basic|good|excellent"
    },
    "progression": {
      "score": [0-10],
      "growthShown": "how role shows growth",
      "alignmentToTarget": [0-10],
      "seniorityProgression": "lateral|upward|unclear"
    },
    "storytelling": {
      "score": [0-10],
      "clarity": [0-10],
      "specificity": [0-10],
      "completeness": [0-10]
    }
  },
  "recommendations": [
    {
      "priority": "critical|high|medium",
      "action": {
        "what": "${hasContent ? 'Enhance' : 'Add'} specific metric or achievement",
        "why": "Impact for ${targetRole} applications",
        "how": "Specific implementation steps",
        "example": "Before → After example with metrics"
      },
      "impactScore": [0-10],
      "timeInvestment": "5min|15min|30min"
    }
  ],
  "extractedMetrics": {
    "teamSize": "number or null",
    "budget": "amount or null",
    "impact": ["quantified results found"],
    "timeline": ["project durations found"],
    "technologies": ["tech stack mentioned"]
  },
  "contentAssessment": {
    "hasDescription": ${hasContent},
    "descriptionQuality": ${hasContent ? '"evaluate quality"' : '"missing"'},
    "bulletPointsEffective": ${bullets?.length > 0},
    "keywordOptimization": "poor|fair|good|excellent"
  }
}`;
}

function buildSkillsPrompt(data, config) {
  const { skills, totalCount } = data;
  const targetRole = config.targetRole || 'Professional';
  
  return `Analyze the skills section for a ${targetRole} profile.

Skills Data:
- Total Skills: ${totalCount}
- Skills with Endorsements: ${skills?.length || 0}
${skills?.slice(0, 20).map(s => `- ${s.name}: ${s.endorsements} endorsements`).join('\n')}

Market Context: Evaluate against current ${targetRole} job requirements.

Respond with ONLY valid JSON:
{
  "score": [0-10],
  "analysis": {
    "relevance": {
      "score": [0-10],
      "criticalSkillsCoverage": [0-100],
      "missingCriticalSkills": ["skill1", "skill2"]
    },
    "credibility": {
      "score": [0-10],
      "endorsementStrength": "strong|moderate|weak",
      "topEndorsedRelevant": true|false
    },
    "marketAlignment": {
      "score": [0-10],
      "trendingSkillsCovered": ["skill1", "skill2"],
      "outdatedSkills": ["skill1", "skill2"]
    }
  },
  "recommendations": [
    {
      "priority": "critical|high|medium",
      "action": {
        "what": "Add/remove/reorder specific skills",
        "why": "Market demand reasoning",
        "how": "Specific steps"
      },
      "impactScore": [0-10]
    }
  ],
  "insights": {
    "skillGaps": ["Missing ${targetRole} skills"],
    "endorsementStrategy": "How to improve endorsements",
    "competitiveAdvantage": ["Unique skill combinations"]
  }
}`;
}

// Synthesis handler for aggregating section scores
async function handleSynthesisAnalysis(request, sendResponse) {
  const { sectionScores, sectionRecommendations } = request;
  
  console.log('[AI] Synthesis requested for sections:', Object.keys(sectionScores || {}));
  console.log('[AI] Section scores received:', sectionScores);
  console.log('[AI] Section recommendations received:', sectionRecommendations);
  
  // Handle empty synthesis case
  if (!sectionScores || Object.keys(sectionScores).length === 0) {
    console.log('[AI] No section scores to synthesize');
    sendResponse({
      success: true,
      finalScore: 5,
      synthesis: { message: 'No sections analyzed' },
      overallRecommendations: [],
      careerNarrative: { message: 'Unable to synthesize - no section data' }
    });
    return;
  }
  
  chrome.storage.local.get(['aiProvider', 'aiModel', 'targetRole', 'seniorityLevel'], async (config) => {
    const apiKey = await getDecryptedApiKey();
    
    if (!config.aiProvider || !apiKey) {
      sendResponse({ error: 'AI not configured' });
      return;
    }
    
    config.apiKey = apiKey;
    
    try {
      const synthesisPrompt = buildSynthesisPrompt(sectionScores, sectionRecommendations, config);
      
      let result;
      if (config.aiProvider === 'openai') {
        // Use GPT-4 for synthesis
        result = await analyzeWithOpenAI({}, {...config, aiModel: 'gpt-4', sectionPrompt: synthesisPrompt});
      } else if (config.aiProvider === 'anthropic') {
        result = await analyzeWithAnthropic({}, {...config, sectionPrompt: synthesisPrompt});
      }
      
      // Add logging to debug synthesis result
      console.log('[AI] Synthesis result structure:', {
        hasContentScore: result.contentScore !== undefined,
        contentScore: result.contentScore,
        hasOverallScore: result.overallScore !== undefined,
        overallScore: result.overallScore,
        hasScore: result.score !== undefined,
        score: result.score,
        resultKeys: Object.keys(result)
      });
      
      // Handle different possible score field names
      const finalScore = result.overallScore || result.contentScore || result.score || 5;
      
      sendResponse({
        success: true,
        finalScore: finalScore,
        synthesis: result.fullAnalysis || JSON.parse(result.summary),
        overallRecommendations: result.recommendations,
        careerNarrative: result.insights
      });
      
    } catch (error) {
      console.error('[AI] Synthesis error:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  });
}

function buildSynthesisPrompt(sectionScores, sectionRecommendations, config) {
  const targetRole = config.targetRole || 'Professional';
  const seniorityLevel = config.seniorityLevel || 'mid';
  
  return `Synthesize the LinkedIn profile analysis for a ${targetRole} at ${seniorityLevel} level.

Section Analysis Results:
${Object.entries(sectionScores || {}).map(([section, data]) => {
  // Handle both old format (data.score) and new format (just the result object)
  const score = data.score !== undefined ? data.score : (data.success ? 6 : 0);
  return `
${section}:
- Score: ${score}/10
- Analysis: ${data.analysis ? 'Completed' : 'Pending'}
- Has Recommendations: ${data.recommendations ? 'Yes' : 'No'}`;
}).join('\n')}

Top Recommendations by Section:
${Object.entries(sectionRecommendations || {}).map(([section, recs]) => {
  if (!recs || !Array.isArray(recs)) return `${section}: No recommendations`;
  return `${section}: ${recs.slice(0, 2).map(r => r.action?.what || r).join('; ')}`;
}).join('\n')}

Provide a holistic analysis with ONLY valid JSON:
{
  "overallScore": [0-10],
  "scoreBreakdown": {
    "contentQuality": [0-10],
    "roleAlignment": [0-10],
    "marketPositioning": [0-10],
    "narrativeCoherence": [0-10]
  },
  "careerNarrative": {
    "story": "The coherent career story being told",
    "progression": "Career growth trajectory analysis",
    "positioning": "Current market position for ${targetRole}",
    "gaps": ["Major gaps in the narrative"]
  },
  "prioritizedRecommendations": [
    {
      "rank": 1,
      "category": "quick_wins|high_impact|strategic",
      "timeframe": "immediate|this_week|this_month",
      "actions": [
        {
          "section": "which section",
          "what": "Specific action",
          "expectedImpact": "+X points to overall score"
        }
      ],
      "combinedImpact": "Overall expected improvement"
    }
  ],
  "competitiveAnalysis": {
    "estimatedPercentile": [0-100],
    "standoutFactors": ["What makes this profile unique"],
    "competitiveGaps": ["What competitors likely have"],
    "marketReadiness": "ready|needs_work|significant_gaps"
  },
  "nextSteps": {
    "immediate": ["Do within 24 hours"],
    "shortTerm": ["Do within a week"],
    "longTerm": ["Strategic improvements"]
  }
}`;
}

function buildRecommendationsPrompt(data, config) {
  const { recommendations, count } = data;
  const targetRole = config.targetRole || 'Professional';
  
  return `Analyze the recommendations section for a ${targetRole} profile.

Recommendations Data:
- Total Count: ${count}
${recommendations?.slice(0, 3).map((r, i) => `
Recommendation ${i+1}:
- From: ${r.recommenderTitle} at ${r.recommenderCompany}
- Relationship: ${r.relationship}
- Content: "${r.text?.substring(0, 200)}..."`).join('\n')}

Respond with ONLY valid JSON:
{
  "score": [0-10],
  "analysis": {
    "quantity": {
      "score": [0-10],
      "adequacy": "insufficient|adequate|strong"
    },
    "quality": {
      "score": [0-10],
      "specificity": [0-10],
      "credibility": [0-10],
      "diversity": [0-10]
    },
    "relevance": {
      "score": [0-10],
      "roleAlignment": "how well they support ${targetRole}",
      "skillsHighlighted": ["skill1", "skill2"]
    }
  },
  "recommendations": [
    {
      "priority": "critical|high|medium",
      "action": {
        "what": "Request specific type of recommendation",
        "why": "Gap it would fill",
        "who": "Type of person to ask",
        "template": "Message template to use"
      },
      "impactScore": [0-10]
    }
  ]
}`;
}

function buildAnalysisPrompt(profileData, settings) {
  const { headline, about, experience, skills, education, recommendations, location, openToWork, photo } = profileData;
  
  // Log all profile data being sent to AI
  console.log('[AI] Profile data for analysis:', {
    photo: {
      exists: photo?.exists,
      url: photo?.url ? photo.url.substring(0, 100) + '...' : 'No URL'
    },
    headline: {
      exists: headline?.exists,
      text: headline?.text,
      charCount: headline?.charCount
    },
    about: {
      exists: about?.exists,
      text: about?.text ? about.text.substring(0, 200) + '...' : 'No text',
      charCount: about?.charCount
    },
    experience: {
      count: experience?.count || experience?.totalCount,
      experiences: experience?.experiences?.slice(0, 2).map(exp => ({
        title: exp.title,
        company: exp.company,
        duration: exp.duration,
        hasDescription: !!exp.description
      }))
    },
    skills: {
      count: skills?.count || skills?.totalCount,
      topSkills: skills?.skills?.slice(0, 5).map(s => {
        const name = s?.name || s?.skill || 'Unknown';
        const endorsements = s?.endorsements || s?.endorsementCount || 0;
        return `${name}(${endorsements})`;
      }) || []
    },
    education: {
      count: education?.count,
      schools: education?.schools?.slice(0, 2).map(s => s.school)
    },
    recommendations: {
      count: recommendations?.count,
      hasRecommendations: recommendations?.count > 0
    }
  });
  
  // Generate unique analysis ID
  const analysisId = crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  
  // Use target role and seniority from settings
  const targetRole = settings.targetRole || 'Professional';
  const seniorityLevel = settings.seniorityLevel || 'mid';
  
  // Build open to work description
  let openToWorkText = 'Not actively looking';
  if (openToWork?.exists) {
    openToWorkText = `Looking for: ${openToWork.roles.join(', ')}\n`;
    if (openToWork.preferences) {
      const prefs = [];
      if (openToWork.preferences.remote) prefs.push('Remote');
      if (openToWork.preferences.hybrid) prefs.push('Hybrid');
      if (openToWork.preferences.onSite) prefs.push('On-site');
      if (prefs.length) openToWorkText += `  Work type: ${prefs.join(', ')}\n`;
      if (openToWork.preferences.startDate) openToWorkText += `  Start date: ${openToWork.preferences.startDate}\n`;
    }
  }
  
  // Add role-specific instructions
  let roleSpecificInstructions = '';
  if (targetRole === 'Product Manager') {
    roleSpecificInstructions = '\n\nIMPORTANT: For Product Manager role, focus on product strategy, metrics, user outcomes, and business impact. DO NOT focus on project timelines or project management aspects.';
  }
  
  // Map seniority levels to descriptions
  const seniorityDescriptions = {
    'entry': 'Entry Level (0-2 years experience)',
    'mid': 'Mid Level (3-5 years experience)',
    'senior': 'Senior Level (6-10 years experience)',
    'lead': 'Lead/Principal Level (10+ years experience)',
    'director': 'Director Level and above'
  };
  
  // Build structured prompt for JSON response
  const prompt = `Analyze this LinkedIn profile and provide a comprehensive assessment in JSON format.

Target Role: ${targetRole}${roleSpecificInstructions}
Seniority Level: ${seniorityDescriptions[seniorityLevel] || seniorityLevel}
Open to Work Status: ${openToWorkText}

Profile Data:
- Photo: ${photo?.exists ? 'Present' : 'Missing'}
- Headline: ${headline?.text || 'Missing'} (${headline?.charCount || 0}/220 chars)
- Location: ${location?.text || location || 'Not specified'}
- About: ${about?.charCount || 0}/2600 chars ${about?.exists ? '' : '- MISSING'}
${about?.text ? `  Content: "${about.text}"` : ''}
- Experience: ${experience?.totalCount || experience?.count || 0} positions
${experience?.experiences ? experience.experiences.slice(0, 3).map((exp, i) => 
  `  ${i+1}. ${exp.title} at ${exp.company} (${exp.duration})\n     ${exp.description ? exp.description.substring(0, 200) + '...' : 'No description'}`
).join('\n') : ''}
- Skills: ${skills?.totalCount || skills?.count || 0} total
${skills?.skills ? `  Top: ${skills.skills.slice(0, 10).map(s => `${s.name}(${s.endorsements || 0})`).join(', ')}` : ''}
- Recommendations: ${recommendations?.count || 0} ${recommendations?.count === 0 ? '- MISSING' : ''}
- Education: ${education?.count || 0} institutions

IMPORTANT: Respond with ONLY valid JSON matching this exact structure:

{
  "metadata": {
    "analysisId": "${analysisId}",
    "timestamp": "${new Date().toISOString()}",
    "profileUrl": "${settings.profileUrl || 'unknown'}",
    "targetRole": "${targetRole}",
    "aiProvider": "${settings.aiProvider}",
    "aiModel": "${settings.aiModel}",
    "version": "1.0.0"
  },
  "overallScore": {
    "score": [0-10 with one decimal],
    "maxScore": 10,
    "percentage": [0-100],
    "grade": ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"],
    "trend": "new"
  },
  "sectionScores": {
    "photo": { "exists": boolean, "score": [0-10 or null], "weight": 0.05, "impact": ["critical"|"high"|"medium"|"low"], "status": ["excellent"|"good"|"needs_improvement"|"missing"], "details": { "currentState": "string", "idealState": "string", "gapAnalysis": "string" } },
    "headline": { ... same structure ... },
    "about": { ... same structure with weight 0.30 ... },
    "experience": { ... same structure with weight 0.30 ... },
    "skills": { ... same structure with weight 0.20 ... },
    "education": { ... same structure with weight 0.05 ... },
    "recommendations": { ... same structure with weight 0.05 ... }
  },
  "recommendations": {
    "critical": [
      {
        "id": "rec-001",
        "section": "string",
        "action": {
          "what": "Specific action to take",
          "why": "Business impact and reasoning",
          "how": "Step-by-step implementation"
        },
        "priority": [1-10],
        "effort": ["minimal"|"low"|"medium"|"high"],
        "impact": ["transformative"|"significant"|"moderate"|"minor"],
        "timeframe": ["immediate"|"this_week"|"this_month"|"ongoing"],
        "metrics": {
          "expectedImprovement": "string",
          "measurementMethod": "string"
        }
      }
    ],
    "important": [ ... 2-3 recommendations ... ],
    "niceToHave": [ ... 1-2 recommendations ... ]
  },
  "insights": {
    "strengths": ["string array of 3 key strengths"],
    "gaps": ["string array of 3 main gaps"],
    "opportunities": ["string array of 3 opportunities"],
    "competitivePosition": {
      "percentile": [0-100],
      "marketAlignment": ["excellent"|"good"|"fair"|"poor"],
      "standoutFactors": ["string array of differentiators"]
    }
  }
}

Critical requirements:
1. Return ONLY valid JSON, no additional text or markdown
2. Do NOT wrap the JSON in code blocks or use \`\`\`json markers
3. Score sections based on ${targetRole} requirements
4. Provide actionable recommendations with specific examples
5. Prioritize by impact and effort required
6. Include metrics and measurement methods

REMINDER: Output raw JSON only - no markdown, no code blocks, no explanations.`;

  // Log the complete prompt being sent
  console.log('[AI] Complete prompt length:', prompt.length);
  console.log('[AI] Prompt preview (first 1000 chars):', prompt.substring(0, 1000));
  
  return prompt;
}

function parseAIResponse(aiText, profileData) {
  console.log('[AI] Parsing AI response, length:', aiText?.length);
  console.log('[AI] First 500 chars of response:', aiText?.substring(0, 500));
  
  try {
    // Remove markdown code block markers if present
    let cleanedText = aiText;
    
    // Log the raw text for debugging
    console.log('[AI] Raw response (first 100 chars):', aiText.substring(0, 100));
    
    // More robust markdown removal
    if (aiText.includes('```')) {
      // Match everything between first ``` and last ```
      const jsonMatch = aiText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch && jsonMatch[1]) {
        cleanedText = jsonMatch[1].trim();
        console.log('[AI] Extracted JSON from markdown blocks');
      } else {
        // Fallback: just remove all ``` markers
        cleanedText = aiText.replace(/```(?:json)?\s*/g, '').trim();
        console.log('[AI] Removed markdown markers (fallback)');
      }
    }
    
    console.log('[AI] Cleaned text (first 100 chars):', cleanedText.substring(0, 100));
    console.log('[AI] Cleaned text (last 100 chars):', cleanedText.substring(cleanedText.length - 100));
    
    // First try to parse as JSON (new format)
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.log('[AI] JSON.parse failed:', parseError.message);
      console.log('[AI] Failed at character position:', parseError.message.match(/position (\d+)/)?.[1]);
      
      // Try to extract score from the beginning of the response even if JSON is malformed
      const scoreMatch = cleanedText.match(/"score"\s*:\s*(\d+)/);
      if (scoreMatch) {
        console.log('[AI] Extracted score from malformed JSON:', scoreMatch[1]);
        // Create a minimal valid response
        jsonResponse = {
          score: parseInt(scoreMatch[1]),
          analysis: {},
          recommendations: [],
          insights: {}
        };
      } else {
        throw parseError;
      }
    }
    console.log('[AI] Successfully parsed JSON response:', {
      hasOverallScore: !!jsonResponse.overallScore,
      hasRecommendations: !!jsonResponse.recommendations,
      hasSectionScores: !!jsonResponse.sectionScores,
      hasInsights: !!jsonResponse.insights
    });
    
    // Log the parsed JSON structure
    console.log('[AI] Parsed JSON structure:', {
      hasMetadata: !!jsonResponse.metadata,
      hasOverallScore: !!jsonResponse.overallScore,
      overallScore: jsonResponse.overallScore?.score,
      hasRecommendations: !!jsonResponse.recommendations,
      recommendationsKeys: jsonResponse.recommendations ? Object.keys(jsonResponse.recommendations) : [],
      hasSectionScores: !!jsonResponse.sectionScores,
      sectionScoreKeys: jsonResponse.sectionScores ? Object.keys(jsonResponse.sectionScores) : [],
      hasInsights: !!jsonResponse.insights,
      insightKeys: jsonResponse.insights ? Object.keys(jsonResponse.insights) : []
    });
    
    // Validate required fields - check for score at root, overallScore, or overallScore.score
    const hasScore = jsonResponse.score !== undefined || 
                     jsonResponse.overallScore !== undefined ||
                     jsonResponse.overallScore?.score !== undefined;
    
    if (hasScore) {
      // Convert JSON response to expected format
      // For section analysis: score is at root level
      // For synthesis: overallScore is a number directly
      // For full analysis: score is in overallScore.score
      let contentScore;
      if (jsonResponse.score !== undefined) {
        contentScore = jsonResponse.score;
      } else if (typeof jsonResponse.overallScore === 'number') {
        contentScore = jsonResponse.overallScore;
      } else if (jsonResponse.overallScore?.score !== undefined) {
        contentScore = jsonResponse.overallScore.score;
      }
      
      // Build summary from insights and top recommendations
      let summary = `**Summary**\n`;
      summary += `Your LinkedIn profile scores ${contentScore}/10 for ${jsonResponse.metadata?.targetRole || 'Professional'}. `;
      
      // Add insights if available
      if (jsonResponse.insights?.strengths?.[0]) {
        summary += `${jsonResponse.insights.strengths[0]}. `;
      }
      if (jsonResponse.insights?.gaps?.[0]) {
        summary += `Key gaps: ${jsonResponse.insights.gaps[0]}.\n\n`;
      }
      
      // Add focused logging for recommendations structure
      console.log('[AI] Parsed recommendations structure:', {
        hasRecommendations: !!jsonResponse.recommendations,
        recommendationType: typeof jsonResponse.recommendations,
        isArray: Array.isArray(jsonResponse.recommendations),
        hasCritical: !!jsonResponse.recommendations?.critical,
        criticalCount: jsonResponse.recommendations?.critical?.length || 0,
        hasImportant: !!jsonResponse.recommendations?.important,
        importantCount: jsonResponse.recommendations?.important?.length || 0,
        hasNiceToHave: !!jsonResponse.recommendations?.niceToHave,
        niceToHaveCount: jsonResponse.recommendations?.niceToHave?.length || 0,
        firstCritical: jsonResponse.recommendations?.critical?.[0]
      });
      
      // Add recommendations if available
      if (jsonResponse.recommendations?.critical?.length > 0) {
        summary += `**Critical Actions:**\n`;
        jsonResponse.recommendations.critical.forEach((rec, idx) => {
          summary += `${idx + 1}. ${rec.section}: ${rec.action.what}\n`;
          summary += `   Why: ${rec.action.why}\n`;
          summary += `   How: ${rec.action.how}\n\n`;
        });
      }
      
      if (jsonResponse.recommendations?.important?.length > 0) {
        summary += `**Important Improvements:**\n`;
        jsonResponse.recommendations.important.forEach((rec, idx) => {
          summary += `${idx + 1}. ${rec.section}: ${rec.action.what}\n`;
        });
      }
      
      // Store full JSON response for detailed analysis
      // Handle different recommendation formats
      let recommendations = jsonResponse.recommendations || jsonResponse.prioritizedRecommendations || [];
      
      // If prioritizedRecommendations is an array, convert to categorized format
      if (Array.isArray(recommendations) && recommendations.length > 0) {
        const categorized = { critical: [], important: [], niceToHave: [] };
        
        // Log the structure we're transforming
        console.log('[AI] Transforming prioritizedRecommendations:', {
          count: recommendations.length,
          firstItem: recommendations[0],
          hasActions: recommendations[0]?.actions !== undefined
        });
        
        recommendations.forEach(rec => {
          // If this recommendation has an actions array, we need to extract each action
          if (rec.actions && Array.isArray(rec.actions)) {
            rec.actions.forEach(action => {
              // Transform synthesis format to UI format
              const transformedRec = {
                priority: rec.category === 'quick_wins' || rec.rank <= 2 ? 'critical' :
                         rec.category === 'high_impact' || rec.rank <= 4 ? 'high' : 'medium',
                section: action.section,
                action: {
                  what: action.what,
                  why: action.expectedImpact || rec.combinedImpact,
                  how: action.how || 'Review and update your profile',
                  example: action.example
                },
                timeInvestment: rec.timeframe,
                impactScore: rec.rank
              };
              
              // Add to appropriate category
              if (rec.category === 'quick_wins' || rec.rank <= 2) {
                categorized.critical.push(transformedRec);
              } else if (rec.category === 'high_impact' || rec.rank <= 4) {
                categorized.important.push(transformedRec);
              } else {
                categorized.niceToHave.push(transformedRec);
              }
            });
          } else {
            // Fallback for recommendations without actions array
            const transformedRec = {
              priority: rec.priority || (rec.rank <= 2 ? 'critical' : rec.rank <= 4 ? 'high' : 'medium'),
              action: rec.action || {
                what: rec.what || rec.message || 'Improve profile section',
                why: rec.why || rec.impact || 'Enhance profile visibility',
                how: rec.how || 'Update profile information'
              },
              timeInvestment: rec.timeInvestment || rec.timeframe,
              impactScore: rec.impactScore || rec.rank
            };
            
            if (rec.category === 'quick_wins' || rec.rank <= 2) {
              categorized.critical.push(transformedRec);
            } else if (rec.category === 'high_impact' || rec.rank <= 4) {
              categorized.important.push(transformedRec);
            } else {
              categorized.niceToHave.push(transformedRec);
            }
          }
        });
        
        console.log('[AI] Transformed recommendations:', {
          criticalCount: categorized.critical.length,
          importantCount: categorized.important.length,
          niceToHaveCount: categorized.niceToHave.length,
          sampleCritical: categorized.critical[0]
        });
        
        recommendations = categorized;
      } else if (!recommendations.critical) {
        // Ensure we have the expected structure
        recommendations = { critical: [], important: [], niceToHave: [] };
      }
      
      const result = {
        contentScore: contentScore,
        summary: summary,
        fullAnalysis: jsonResponse,
        sectionScores: jsonResponse.sectionScores || {},
        recommendations: recommendations,
        insights: jsonResponse.insights || jsonResponse.careerNarrative || { strengths: [], gaps: [], opportunities: [] }
      };
      
      console.log('[AI] Parsed result:', {
        contentScore: result.contentScore,
        hasRecommendations: !!result.recommendations,
        recommendationsKeys: result.recommendations ? Object.keys(result.recommendations) : [],
        hasInsights: !!result.insights,
        insightsKeys: result.insights ? Object.keys(result.insights) : [],
        hasSectionScores: !!result.sectionScores
      });
      
      // Add detailed logging before returning
      console.log('[AI] Final recommendations being returned:', {
        structure: result.recommendations,
        criticalCount: result.recommendations?.critical?.length || 0,
        importantCount: result.recommendations?.important?.length || 0,
        niceToHaveCount: result.recommendations?.niceToHave?.length || 0,
        sampleCritical: result.recommendations?.critical?.[0]
      });
      
      // If we have profileData, merge with weighted scoring
      if (profileData && ProfileScoreCalculator && jsonResponse.sectionScores) {
        try {
          const weightedResult = ProfileScoreCalculator.calculateOverallScore(jsonResponse.sectionScores);
          result.weightedScore = weightedResult.overallScore;
          result.missingCritical = weightedResult.missingCritical;
        } catch (e) {
          console.log('[AI] Error calculating weighted score:', e.message);
          // Continue without weighted scoring
        }
      }
      
      return result;
    }
  } catch (jsonError) {
    console.log('[AI] Error in JSON parsing or processing:', jsonError.message);
    console.log('[AI] Error stack:', jsonError.stack);
    console.log('Response is not JSON, falling back to text parsing');
  }
  
  // Fallback to original text parsing for backward compatibility
  const scoreMatch = aiText.match(/CONTENT_SCORE:\s*(\d+)/i);
  const contentScore = scoreMatch ? parseInt(scoreMatch[1]) : 7;
  
  const analysisMatch = aiText.match(/ANALYSIS:\s*([\s\S]+)/i);
  const summary = analysisMatch ? analysisMatch[1].trim() : aiText;
  
  const validScore = Math.min(Math.max(contentScore, 1), 10);
  
  if (profileData) {
    const sectionScores = {
      about: {
        exists: profileData.about?.exists || false,
        score: profileData.about?.exists ? validScore : null
      },
      experience: {
        exists: (profileData.experience?.count || 0) > 0,
        score: (profileData.experience?.count || 0) > 0 ? validScore : null
      },
      skills: {
        exists: (profileData.skills?.totalCount || 0) > 0,
        score: (profileData.skills?.totalCount || 0) > 0 ? validScore : null
      },
      headline: {
        exists: profileData.headline?.exists || false,
        score: profileData.headline?.exists ? validScore : null
      },
      education: {
        exists: (profileData.education?.count || 0) > 0,
        score: (profileData.education?.count || 0) > 0 ? validScore : null
      },
      recommendations: {
        exists: (profileData.recommendations?.count || 0) > 0,
        score: (profileData.recommendations?.count || 0) > 0 ? validScore : null
      }
    };
    
    const weightedResult = ProfileScoreCalculator.calculateOverallScore(sectionScores);
    
    return {
      contentScore: weightedResult.overallScore,
      summary: summary,
      sectionScores: weightedResult.sectionScores,
      missingCritical: weightedResult.missingCritical,
      baseScore: weightedResult.baseScore,
      maxPossibleScore: weightedResult.maxPossibleScore
    };
  }
  
  // Try to extract recommendations from the summary if it contains JSON
  let extractedRecommendations = null;
  let extractedInsights = null;
  
  try {
    const jsonMatch = summary.match(/```json\n([\s\S]+?)\n```/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);
      if (jsonData.recommendations) {
        extractedRecommendations = jsonData.recommendations;
        extractedInsights = jsonData.insights;
        console.log('📋 Extracted recommendations from fallback text parsing');
      }
    }
  } catch (e) {
    console.log('Could not extract JSON from summary in fallback');
  }
  
  return {
    contentScore: validScore,
    summary: summary,
    recommendations: extractedRecommendations,
    insights: extractedInsights
  };
}

// Generate formatted analysis (fallback for when AI is not available)
function generateDetailedAnalysis(profileName, profileData, contentScore, completeness) {
  if (!profileData) {
    return 'Unable to analyze profile - no data extracted.';
  }
  const { headline, about, experience, skills, education, recommendations, location } = profileData;
  
  // Build formatted analysis matching requested format
  let analysis = `**Summary**\n`;
  analysis += `Your LinkedIn profile for ${profileName} scores ${contentScore}/10 for content quality and ${completeness}% for completeness. `;
  
  if (completeness >= 80 && contentScore >= 8) {
    analysis += `Strong foundation with comprehensive content that positions you well for opportunities. Key gaps include missing quantifiable achievements and limited skills section.`;
  } else if (completeness >= 60 || contentScore >= 7) {
    analysis += `Profile shows promise but needs strategic improvements in content depth and missing sections. Focus on expanding your about section and adding metrics to experience.`;
  } else {
    analysis += `Profile requires significant enhancement to meet professional standards. Multiple critical elements are missing or underdeveloped.`;
  }
  
  // Recommendations section
  analysis += `\n\n**Recommendations:**\n`;
  
  const recs = [];
  
  // Quick fixes
  if (!profileData.photo?.exists) recs.push('Profile Photo: Add a professional headshot to increase profile views by 21x');
  if (headline?.charCount < 100) recs.push(`Headline: Expand to include key skills and value proposition (currently ${headline?.charCount || 0}/220 chars)`);
  if (!profileData.customUrl) recs.push('Custom URL: Create a personalized LinkedIn URL for professional branding');
  if (!location) recs.push('Location: Add your location to appear in local searches');
  
  // Content improvements
  if (about?.charCount < 500) recs.push(`About Section: Expand to 500+ words highlighting achievements and expertise (currently ${about?.charCount || 0} chars)`);
  if ((skills?.totalCount || 0) < 10) recs.push(`Skills: Add ${10 - (skills?.totalCount || 0)} more relevant skills to improve searchability`);
  if (experience?.count > 0 && !about?.hasQuantifiedAchievement) recs.push('Experience Metrics: Add quantifiable achievements (revenue, percentages, team sizes) to your experience');
  
  // Strategic enhancements
  if ((recommendations?.count || 0) < 2) recs.push(`Recommendations: Request ${3 - (recommendations?.count || 0)} recommendations from colleagues or managers`);
  if ((education?.count || 0) === 0) recs.push('Education: Add educational background to complete profile');
  recs.push('Engagement Strategy: Post weekly industry insights and engage with network content to boost visibility');
  
  // Format top 5 recommendations
  for (let i = 0; i < Math.min(5, recs.length); i++) {
    analysis += `${i + 1}. ${recs[i]}\n`;
  }
  
  return analysis;
}

// Handle AI analysis from content script
async function handleAIAnalysis(request, sender, sendResponse) {
  try {
    console.log('[AI] handleAIAnalysis called with:', { 
      hasData: !!request.data, 
      hasSettings: !!request.settings,
      dataKeys: request.data ? Object.keys(request.data) : []
    });
    
    // Extract data from the correct structure
    const extractedData = request.data || request.profileData;
    const requestSettings = request.settings || {};
    
    if (!extractedData) {
      console.error('[AI] No profile data provided');
      sendResponse({ 
        success: false,
        error: 'No profile data provided for analysis'
      });
      return;
    }
    
    // Get stored settings
    const storedSettings = await chrome.storage.local.get([
      'aiProvider', 
      'enableAI', 
      'targetRole', 
      'seniorityLevel',
      'customInstructions',
      'aiModel'
    ]);
    
    // Merge request settings with stored settings
    const settings = {
      ...storedSettings,
      ...requestSettings
    };
    
    // Get decrypted API key
    const apiKey = await getDecryptedApiKey();
    
    if (!settings.enableAI || !apiKey || !settings.aiProvider) {
      console.error('[AI] AI not configured:', { 
        enableAI: settings.enableAI, 
        hasApiKey: !!apiKey, 
        provider: settings.aiProvider 
      });
      sendResponse({ 
        success: false,
        error: 'AI not configured',
        aiState: 'not_configured'
      });
      return;
    }
    
    // Check rate limits
    const rateLimitCheck = await rateLimiter.checkLimit(settings.aiProvider);
    if (!rateLimitCheck.allowed) {
      sendResponse({
        success: false,
        error: `Rate limit exceeded. Please wait ${rateLimitCheck.waitTime} seconds.`,
        rateLimited: true,
        waitTime: rateLimitCheck.waitTime
      });
      return;
    }
    
    try {
      // Add API key to settings for the analysis
      settings.apiKey = apiKey;
      
      // Perform full profile analysis
      console.log('[AI] Starting full profile analysis with provider:', settings.aiProvider);
      let aiAnalysis;
      
      if (settings.aiProvider === 'openai' || settings.aiProvider === 'openai-gpt-3.5') {
        aiAnalysis = await analyzeWithOpenAI(extractedData, settings);
      } else if (settings.aiProvider === 'anthropic') {
        aiAnalysis = await analyzeWithAnthropic(extractedData, settings);
      } else {
        throw new Error(`Unknown AI provider: ${settings.aiProvider}`);
      }
      
      console.log('[AI] Analysis complete:', {
        score: aiAnalysis.contentScore,
        hasRecommendations: !!aiAnalysis.recommendations,
        recommendationsType: typeof aiAnalysis.recommendations,
        recommendationsKeys: aiAnalysis.recommendations ? Object.keys(aiAnalysis.recommendations) : [],
        hasInsights: !!aiAnalysis.insights,
        insightsType: typeof aiAnalysis.insights,
        insightsKeys: aiAnalysis.insights ? Object.keys(aiAnalysis.insights) : [],
        hasSectionScores: !!aiAnalysis.sectionScores
      });
      
      // Log section scores if available
      if (aiAnalysis.sectionScores) {
        console.log('[AI] Section scores:', Object.entries(aiAnalysis.sectionScores).map(([section, data]) => ({
          section,
          score: data.score,
          exists: data.exists,
          weight: data.weight
        })));
      }
      
      console.log('[AI] Analysis complete, sending response:', {
        score: aiAnalysis.contentScore,
        hasRecommendations: !!aiAnalysis.recommendations,
        hasInsights: !!aiAnalysis.insights,
        hasSectionScores: !!aiAnalysis.sectionScores,
        recommendationsType: typeof aiAnalysis.recommendations,
        insightsType: typeof aiAnalysis.insights
      });
      
      // Add focused logging before sending response back
      console.log('[AI] Sending response back to content script:', {
        success: true,
        score: aiAnalysis.contentScore,
        hasRecommendations: !!aiAnalysis.recommendations,
        recommendationsType: typeof aiAnalysis.recommendations,
        recommendationKeys: aiAnalysis.recommendations ? Object.keys(aiAnalysis.recommendations) : [],
        criticalCount: aiAnalysis.recommendations?.critical?.length || 0,
        importantCount: aiAnalysis.recommendations?.important?.length || 0,
        hasInsights: !!aiAnalysis.insights,
        hasSectionScores: !!aiAnalysis.sectionScores
      });
      
      sendResponse({
        success: true,
        score: aiAnalysis.contentScore,
        recommendations: aiAnalysis.recommendations,
        insights: aiAnalysis.insights,
        summary: aiAnalysis.summary,
        sectionScores: aiAnalysis.sectionScores
      });
      
    } catch (error) {
      console.error('[AI] Analysis error:', error);
      
      // Parse error if it's JSON
      let errorInfo = { type: 'GENERIC', message: error.message };
      try {
        if (error.message.startsWith('{')) {
          errorInfo = JSON.parse(error.message);
        }
      } catch (e) {
        // Keep default errorInfo
      }
      
      // If rate limited, set cooldown
      if (errorInfo.type === 'RATE_LIMIT' && errorInfo.retryAfter) {
        rateLimiter.setCooldown(settings.aiProvider, errorInfo.retryAfter);
      }
      
      sendResponse({
        success: false,
        error: errorInfo.message,
        errorType: errorInfo.type,
        errorStatus: errorInfo.status,
        retryAfter: errorInfo.retryAfter
      });
    }
    
  } catch (error) {
    console.error('[AI] handleAIAnalysis error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Analyze individual section
async function analyzeSection(sectionName, content, profileData, settings, apiKey) {
  const prompts = {
    about: `Analyze this LinkedIn About section for a ${settings.targetRole || 'professional'} at ${settings.seniorityLevel || 'mid'} level. Score 1-10.
Content: ${content}
${settings.customInstructions ? `Additional guidance: ${settings.customInstructions}` : ''}`,
    
    experience: `Analyze this LinkedIn Experience section for impact and clarity. Score 1-10.
Content: ${content}`,
    
    skills: `Analyze this LinkedIn Skills section for relevance to ${settings.targetRole || 'professional role'}. Score 1-10.
Content: ${content}`,
    
    headline: `Analyze this LinkedIn headline for a ${settings.targetRole || 'professional'}. Score 1-10.
Content: ${content}`
  };
  
  const prompt = prompts[sectionName] || `Analyze this LinkedIn ${sectionName} section. Score 1-10.\nContent: ${content}`;
  
  // Call AI API based on provider
  const aiSettings = {
    ...settings,
    apiKey,
    sectionPrompt: prompt
  };
  
  if (settings.aiProvider === 'openai' || settings.aiProvider === 'openai-gpt-3.5') {
    return await analyzeWithOpenAI({ [sectionName]: content }, aiSettings);
  } else if (settings.aiProvider === 'anthropic') {
    return await analyzeWithAnthropic({ [sectionName]: content }, aiSettings);
  }
  
  throw new Error('Unsupported AI provider');
}

// Calculate overall content score from section scores
function calculateContentScore(sectionScores) {
  const weights = {
    about: 0.3,
    experience: 0.3,
    skills: 0.2,
    headline: 0.1,
    other: 0.1
  };
  
  let totalScore = 0;
  let totalWeight = 0;
  
  for (const [section, result] of Object.entries(sectionScores)) {
    if (result.score) {
      const weight = weights[section] || weights.other;
      totalScore += result.score * weight;
      totalWeight += weight;
    }
  }
  
  return totalWeight > 0 ? Math.round(totalScore / totalWeight * 10) / 10 : 0;
}

// Generate recommendations from analysis results
function generateRecommendations(sectionScores, profileData) {
  const recommendations = [];
  
  for (const [section, result] of Object.entries(sectionScores)) {
    if (result.recommendations) {
      recommendations.push(...result.recommendations.map(rec => ({
        section,
        ...rec
      })));
    }
  }
  
  // Sort by priority/impact
  return recommendations.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('ElevateLI installed');
});