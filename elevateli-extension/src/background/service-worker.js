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

// Section-specific analysis handler
async function handleSectionAnalysis(request, sendResponse) {
  const { section, data, settings } = request;
  
  chrome.storage.local.get(['aiProvider', 'aiModel', 'targetRole', 'customInstructions', 'sectionScores', 'enableAI'], async (config) => {
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
      const sectionPrompt = buildSectionPrompt(section, data, {...config, ...settings});
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
      
      sendResponse({
        section,
        score: result.contentScore,
        recommendations: result.summary,
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
        content: 'You are a LinkedIn profile optimization expert. Analyze profiles and provide structured feedback in JSON format. Focus on actionable recommendations with specific implementation steps and measurable outcomes.'
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
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }
    
    const data = await response.json();
    return parseAIResponse(data.choices[0].message.content, profileData);
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
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
            content: 'You are a LinkedIn profile optimization expert. Respond ONLY with valid JSON matching the specified schema. Focus on actionable recommendations with metrics.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.1
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Anthropic API error');
    }
    
    const data = await response.json();
    return parseAIResponse(data.content[0].text, profileData);
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
}

function buildAnalysisPrompt(profileData, settings) {
  const { headline, about, experience, skills, education, recommendations, location, openToWork, photo } = profileData;
  
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
  return `Analyze this LinkedIn profile and provide a comprehensive assessment in JSON format.

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
1. Return ONLY valid JSON, no additional text
2. Score sections based on ${targetRole} requirements
3. Provide actionable recommendations with specific examples
4. Prioritize by impact and effort required
5. Include metrics and measurement methods`;
}

function parseAIResponse(aiText, profileData) {
  try {
    // First try to parse as JSON (new format)
    const jsonResponse = JSON.parse(aiText);
    
    // Validate required fields
    if (jsonResponse.overallScore && jsonResponse.recommendations) {
      // Convert JSON response to expected format
      const contentScore = jsonResponse.overallScore.score;
      
      // Build summary from insights and top recommendations
      let summary = `**Summary**\n`;
      summary += `Your LinkedIn profile scores ${contentScore}/10 for ${jsonResponse.metadata.targetRole}. `;
      summary += `${jsonResponse.insights.strengths[0]}. `;
      summary += `Key gaps: ${jsonResponse.insights.gaps[0]}.\n\n`;
      
      summary += `**Critical Actions:**\n`;
      jsonResponse.recommendations.critical.forEach((rec, idx) => {
        summary += `${idx + 1}. ${rec.section}: ${rec.action.what}\n`;
        summary += `   Why: ${rec.action.why}\n`;
        summary += `   How: ${rec.action.how}\n\n`;
      });
      
      summary += `**Important Improvements:**\n`;
      jsonResponse.recommendations.important.forEach((rec, idx) => {
        summary += `${idx + 1}. ${rec.section}: ${rec.action.what}\n`;
      });
      
      // Store full JSON response for detailed analysis
      const result = {
        contentScore: contentScore,
        summary: summary,
        fullAnalysis: jsonResponse,
        sectionScores: jsonResponse.sectionScores,
        recommendations: jsonResponse.recommendations,
        insights: jsonResponse.insights
      };
      
      // If we have profileData, merge with weighted scoring
      if (profileData && ProfileScoreCalculator) {
        const weightedResult = ProfileScoreCalculator.calculateOverallScore(jsonResponse.sectionScores);
        result.weightedScore = weightedResult.overallScore;
        result.missingCritical = weightedResult.missingCritical;
      }
      
      return result;
    }
  } catch (jsonError) {
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
    const { profileId, profileData, sectionData } = request;
    
    // Get settings
    const settings = await chrome.storage.local.get([
      'aiProvider', 
      'enableAI', 
      'targetRole', 
      'seniorityLevel',
      'customInstructions'
    ]);
    
    // Get decrypted API key
    const apiKey = await getDecryptedApiKey();
    
    if (!settings.enableAI || !apiKey || !settings.aiProvider) {
      sendResponse({ 
        error: 'AI not configured',
        aiState: 'not_configured'
      });
      return;
    }
    
    // Check rate limits
    const rateLimitCheck = await rateLimiter.checkLimit(settings.aiProvider);
    if (!rateLimitCheck.allowed) {
      sendResponse({
        error: `Rate limit exceeded. Please wait ${rateLimitCheck.waitTime} seconds.`,
        rateLimited: true,
        waitTime: rateLimitCheck.waitTime
      });
      return;
    }
    
    // Perform section-by-section analysis
    const results = {};
    const errors = [];
    
    // Analyze each section
    for (const [sectionName, sectionContent] of Object.entries(sectionData)) {
      try {
        const sectionAnalysis = await analyzeSection(
          sectionName,
          sectionContent,
          profileData,
          settings,
          apiKey
        );
        
        results[sectionName] = sectionAnalysis;
        
        // Send progress update
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'aiAnalysisProgress',
          section: sectionName,
          completed: true
        });
      } catch (error) {
        console.error(`Error analyzing ${sectionName}:`, error);
        errors.push({ section: sectionName, error: error.message });
      }
    }
    
    // Calculate overall content score
    const contentScore = calculateContentScore(results);
    
    // Generate recommendations
    const recommendations = generateRecommendations(results, profileData);
    
    sendResponse({
      success: true,
      contentScore,
      sectionScores: results,
      recommendations,
      errors: errors.length > 0 ? errors : null
    });
    
  } catch (error) {
    console.error('AI analysis error:', error);
    sendResponse({
      error: error.message,
      success: false
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