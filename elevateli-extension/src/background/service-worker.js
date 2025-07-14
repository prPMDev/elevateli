/* Background Service Worker for ElevateLI */

// Check if Chrome APIs are available
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
  console.error('[Service Worker] Chrome APIs not available during initialization');
  // Service worker is being terminated or not properly initialized
  // This is normal during service worker lifecycle
}

// Crypto utilities for API key encryption
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
    try {
      // Check if Chrome storage is available
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        throw new Error('Chrome storage API not available');
      }
      
      const { installationId } = await chrome.storage.local.get('installationId');
      
      if (installationId) {
        console.log('Using existing installation ID for encryption');
        return installationId;
      }

      console.log('Creating new installation ID for encryption');
      const newId = crypto.randomUUID() + '-' + Date.now();
      await chrome.storage.local.set({ installationId: newId });
      return newId;
    } catch (error) {
      console.error('Failed to get/create passphrase:', error);
      // Fallback to a simpler ID generation if crypto.randomUUID fails
      const fallbackId = 'elevateli-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15);
      try {
        if (chrome && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ installationId: fallbackId });
        }
      } catch (e) {
        console.error('Failed to save fallback ID:', e);
      }
      return fallbackId;
    }
  }

  async encryptApiKey(apiKey) {
    try {
      console.log('Starting API key encryption');
      
      // Check if crypto.subtle is available
      if (!crypto || !crypto.subtle) {
        throw new Error('Web Crypto API not available');
      }
      
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

      const base64Result = btoa(String.fromCharCode(...combined));
      console.log('API key encrypted successfully, length:', base64Result.length);
      
      // Verify we can decrypt it immediately
      try {
        const testDecrypt = await this.decryptApiKey(base64Result);
        if (testDecrypt !== apiKey) {
          throw new Error('Encryption verification failed');
        }
        console.log('Encryption verified successfully');
      } catch (verifyError) {
        console.error('Failed to verify encryption:', verifyError);
        throw new Error('Encryption verification failed');
      }
      
      return base64Result;
    } catch (error) {
      console.error('Encryption error:', error);
      console.error('Encryption error details:', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        hasCrypto: !!crypto,
        hasCryptoSubtle: !!(crypto && crypto.subtle)
      });
      
      // Provide more specific error messages
      if (error.message.includes('Web Crypto API')) {
        throw new Error('Your browser does not support secure encryption. Please try a different browser.');
      } else if (error.message.includes('passphrase')) {
        throw new Error('Failed to generate encryption key. Please try again.');
      } else {
        throw new Error('Failed to encrypt API key: ' + error.message);
      }
    }
  }

  async decryptApiKey(encryptedData) {
    try {
      // Validate input
      if (!encryptedData || typeof encryptedData !== 'string') {
        console.error('Invalid encrypted data:', encryptedData);
        throw new Error('Encrypted data is missing or invalid');
      }

      const passphrase = await this.getOrCreatePassphrase();
      
      // Safely decode base64
      let combined;
      try {
        combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      } catch (e) {
        console.error('Failed to decode base64:', e);
        throw new Error('Invalid base64 encoded data');
      }
      
      // Validate combined data length
      const minLength = this.saltLength + this.ivLength + 1; // At least 1 byte of encrypted data
      if (combined.length < minLength) {
        console.error('Encrypted data too short:', combined.length, 'bytes, expected at least', minLength);
        throw new Error('Encrypted data is corrupted or too short');
      }
      
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
      console.error('Error details:', {
        encryptedDataLength: encryptedData?.length,
        encryptedDataType: typeof encryptedData,
        errorMessage: error.message,
        errorName: error.name,
        errorStack: error.stack
      });
      
      // Check if it's a decryption error (wrong key or corrupted data)
      if (error.name === 'OperationError' || error.message.includes('decrypt')) {
        throw new Error('API key decryption failed - key may be corrupted');
      }
      throw new Error('Failed to decrypt API key: ' + error.message);
    }
  }

  async migrateExistingKeys() {
    try {
      const { apiKey, encryptedApiKey } = await chrome.storage.local.get(['apiKey', 'encryptedApiKey']);
      
      if (!apiKey || encryptedApiKey) {
        return false;
      }

      console.log('Migrating plain text API key to encrypted storage');
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
  try {
    // Check if Chrome storage is available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      console.error('[getDecryptedApiKey] Chrome storage not available');
      return null;
    }
    
    const { encryptedApiKey, apiKey } = await chrome.storage.local.get(['encryptedApiKey', 'apiKey']);
  
  // If we have an encrypted key, decrypt it
  if (encryptedApiKey) {
    try {
      return await cryptoUtils.decryptApiKey(encryptedApiKey);
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      
      // If decryption fails, clear the corrupted key
      if (error.message.includes('decrypt') || error.message.includes('corrupted')) {
        console.log('Clearing corrupted encrypted API key');
        try {
          if (chrome && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.remove(['encryptedApiKey']);
          }
        } catch (e) {
          console.error('Failed to remove corrupted key:', e);
        }
      }
      
      return null;
    }
  }
  
  // If we have a plain text key (legacy), migrate it
  if (apiKey) {
    console.log('Found legacy plain text API key, migrating...');
    await cryptoUtils.migrateExistingKeys();
    // Try again with the migrated key
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        const { encryptedApiKey: newEncrypted } = await chrome.storage.local.get('encryptedApiKey');
        if (newEncrypted) {
          try {
            return await cryptoUtils.decryptApiKey(newEncrypted);
          } catch (error) {
            console.error('Failed to decrypt migrated key:', error);
            return null;
          }
        }
      }
    } catch (e) {
      console.error('Failed to get migrated key:', e);
    }
  }
  
  return null;
  } catch (error) {
    console.error('[getDecryptedApiKey] Error:', error);
    return null;
  }
}

// Run migration on startup
if (chrome && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async () => {
    await cryptoUtils.migrateExistingKeys();
  });
}

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
if (chrome && chrome.runtime && chrome.runtime.getPlatformInfo) {
  const keepAlive = () => setInterval(() => {
    if (chrome && chrome.runtime && chrome.runtime.getPlatformInfo) {
      chrome.runtime.getPlatformInfo(() => {
        // Keep alive ping
      });
    }
  }, 20e3);
  
  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(keepAlive);
  }
  keepAlive();
}

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
                critical: cachedAnalysis.recommendations.critical?.length || 0,
                important: cachedAnalysis.recommendations.important?.length || 0,
                niceToHave: cachedAnalysis.recommendations.niceToHave?.length || 0
              });
            }
          }
        } catch (parseError) {
          console.error('Failed to re-parse cached summary:', parseError);
        }
      }
      
      return cachedAnalysis;
    }
    
    console.log(`Cache miss for ${cacheKey}`);
    return null;
  } catch (error) {
    console.error('Cache check error:', error);
    return null;
  }
}

// Store results in cache
async function storeInCache(cacheKey, analysis) {
  try {
    const cacheData = {
      analysis,
      timestamp: Date.now()
    };
    
    const storageData = {};
    storageData[cacheKey] = cacheData;
    
    await chrome.storage.local.set(storageData);
    console.log(`Stored in cache: ${cacheKey}`);
  } catch (error) {
    console.error('Cache storage error:', error);
  }
}

// Clear old cache entries (older than 30 days)
async function cleanupOldCache() {
  try {
    const allKeys = await chrome.storage.local.get(null);
    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
    const keysToRemove = [];
    
    for (const [key, value] of Object.entries(allKeys)) {
      if (key.startsWith(CACHE_CONFIG.keyPrefix) && value.timestamp < cutoffTime) {
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`Cleaned up ${keysToRemove.length} old cache entries`);
    }
  } catch (error) {
    console.error('Cache cleanup error:', error);
  }
}

// Format cache age for logging
function formatCacheAge(ageMs) {
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  if (hours < 24) {
    return `${hours} hours`;
  }
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

// Handle AI analysis
async function handleAIAnalysis(request, sender, sendResponse) {
  console.log('[AI Analysis] Request received:', {
    sections: Object.keys(request.sections || {}),
    forceRefresh: request.forceRefresh,
    settings: request.settings
  });
  
  const { sections, settings = {}, forceRefresh = false } = request;
  
  try {
    // Check AI enabled
    const { enableAI } = await chrome.storage.local.get('enableAI');
    if (!enableAI) {
      console.log('[AI Analysis] AI is disabled');
      sendResponse({ success: false, error: 'AI analysis is disabled' });
      return;
    }
    
    // Get provider info
    const { aiProvider } = await chrome.storage.local.get('aiProvider');
    if (!aiProvider) {
      console.log('[AI Analysis] No AI provider configured');
      sendResponse({ 
        success: false, 
        error: 'No AI provider configured',
        type: 'CONFIG'
      });
      return;
    }
    
    // Check rate limit
    const rateCheck = await rateLimiter.checkLimit(aiProvider);
    if (!rateCheck.allowed) {
      console.log('[AI Analysis] Rate limit hit:', rateCheck);
      sendResponse({
        success: false,
        error: `Rate limit exceeded. Please wait ${rateCheck.waitTime} seconds.`,
        type: 'RATE_LIMIT',
        retryAfter: rateCheck.waitTime
      });
      return;
    }
    
    // Get decrypted API key
    const apiKey = await getDecryptedApiKey();
    if (!apiKey) {
      console.log('[AI Analysis] No API key found');
      sendResponse({ 
        success: false, 
        error: 'API key not configured',
        type: 'AUTH',
        message: 'Please configure your API key in the extension settings'
      });
      return;
    }
    
    // Generate cache key based on content
    const contentHash = await generateContentHash(sections);
    const cacheKey = `${CACHE_CONFIG.keyPrefix}${contentHash}`;
    
    // Check cache unless forced refresh
    const cachedAnalysis = await checkCache(cacheKey, forceRefresh);
    if (cachedAnalysis) {
      console.log('[AI Analysis] Returning cached result');
      sendResponse({ 
        success: true, 
        analysis: cachedAnalysis,
        fromCache: true 
      });
      return;
    }
    
    // Get fresh analysis
    console.log('[AI Analysis] Performing fresh analysis');
    const { aiModel } = await chrome.storage.local.get('aiModel');
    const analysis = await performDistributedAnalysis(sections, {
      apiKey,
      provider: aiProvider,
      model: aiModel,
      targetRole: settings.targetRole || 'general professional',
      seniorityLevel: settings.seniorityLevel || 'any level',
      customInstructions: settings.customInstructions || ''
    });
    
    // Store in cache
    await storeInCache(cacheKey, analysis);
    
    sendResponse({ 
      success: true, 
      analysis,
      fromCache: false 
    });
    
  } catch (error) {
    console.error('[AI Analysis] Error:', error);
    
    // Check for specific error types
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      sendResponse({
        success: false,
        error: 'Invalid API key',
        type: 'AUTH',
        message: 'Your API key is invalid. Please check and update it in settings.'
      });
    } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      const waitTime = parseInt(error.message.match(/\d+/)?.[0] || '60');
      rateLimiter.setCooldown(request.settings?.provider || 'openai', waitTime);
      sendResponse({
        success: false,
        error: `Rate limit exceeded. Please wait ${waitTime} seconds.`,
        type: 'RATE_LIMIT',
        retryAfter: waitTime
      });
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      sendResponse({
        success: false,
        error: 'Network connection error',
        type: 'NETWORK',
        message: 'Unable to connect to AI service. Please check your internet connection.'
      });
    } else {
      sendResponse({
        success: false,
        error: error.message || 'Analysis failed',
        type: 'UNKNOWN'
      });
    }
  }
}

// Generate content hash for caching
async function generateContentHash(sections) {
  const content = JSON.stringify(sections);
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Perform distributed AI analysis
async function performDistributedAnalysis(sections, config) {
  console.log('[Distributed Analysis] Starting with config:', {
    provider: config.provider,
    targetRole: config.targetRole,
    seniorityLevel: config.seniorityLevel,
    sectionsCount: Object.keys(sections).length
  });
  
  const sectionAnalyses = {};
  
  // Analyze each section independently
  for (const [sectionName, sectionContent] of Object.entries(sections)) {
    if (!sectionContent || sectionContent === 'Missing') {
      sectionAnalyses[sectionName] = {
        exists: false,
        score: 0,
        feedback: 'This section is missing from your profile.'
      };
      continue;
    }
    
    try {
      const sectionPrompt = createSectionPrompt(sectionName, sectionContent, config);
      const response = await callAIProvider(config.provider, config.apiKey, sectionPrompt, config.model);
      
      // Parse the response
      const analysis = parseSectionAnalysis(response, sectionName);
      sectionAnalyses[sectionName] = {
        exists: true,
        ...analysis
      };
      
      console.log(`[Distributed Analysis] ${sectionName} score:`, analysis.score);
      
      // Small delay between requests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`[Distributed Analysis] Error analyzing ${sectionName}:`, error);
      sectionAnalyses[sectionName] = {
        exists: true,
        score: 5,
        feedback: 'Unable to analyze this section.',
        error: error.message
      };
    }
  }
  
  // Calculate overall score
  const scoreResult = ProfileScoreCalculator.calculateOverallScore(sectionAnalyses);
  
  // Synthesize recommendations
  const synthesis = await synthesizeFinalAnalysis(sectionAnalyses, config);
  
  return {
    overallScore: scoreResult.overallScore,
    sectionScores: sectionAnalyses,
    recommendations: synthesis.recommendations,
    insights: synthesis.insights,
    summary: synthesis.summary
  };
}

// Create section-specific prompt
function createSectionPrompt(sectionName, content, config) {
  // Special handling for experience roles
  if (sectionName === 'experience_role' && typeof content === 'object') {
    return createExperienceRolePrompt(content, config);
  }
  
  // Special handling for experience section (fallback)
  if (sectionName === 'experience' && typeof content === 'object') {
    console.log('[Section Prompt] Using experience section fallback prompt');
    return createExperienceSectionPrompt(content, config);
  }
  
  // Default prompt for other sections
  const basePrompt = `You are an extremely experienced career coach specializing in helping professionals transition to ${config.targetRole} at the ${config.seniorityLevel} level. You have 20+ years of experience optimizing LinkedIn profiles for maximum impact.

Analyze this ${sectionName} section with the following approach:
1. First acknowledge what's working (be specific and honest - don't sugarcoat)
2. Identify gaps preventing this person from landing their target role
3. Provide actionable, specific improvements

Target role: ${config.targetRole}
Seniority level: ${config.seniorityLevel}
${config.customInstructions ? `Additional context: ${config.customInstructions}` : ''}

${sectionName.toUpperCase()} CONTENT:
${typeof content === 'object' ? JSON.stringify(content, null, 2) : content}

Provide your coaching analysis in EXACT JSON format:

{
  "score": 7,
  "positiveInsight": "Your skills demonstrate solid technical competency with relevant tools like Jira and SQL, showing you can handle the technical aspects of product management.",
  "gapAnalysis": "However, you're missing strategic skills that distinguish ${config.seniorityLevel} product managers. The current selection emphasizes execution over strategy and leadership.",
  "actionItems": [
    {
      "what": "Add 5-7 strategic product skills",
      "how": "Include 'Product Strategy', 'Go-to-Market Strategy', 'Market Analysis', 'Business Model Design', 'Revenue Optimization'. These signal you can think beyond features to business impact.",
      "priority": "high"
    },
    {
      "what": "Showcase leadership capabilities",
      "how": "Add 'Cross-functional Team Leadership', 'Stakeholder Management', 'Executive Communication', 'Product Vision'. These demonstrate you can influence and lead at the ${config.seniorityLevel} level.",
      "priority": "high"
    }
  ]
}

IMPORTANT: 
- Score 0-10 where 10 is perfect for landing the target role
- Be honest but constructive in your feedback
- "positiveInsight" should be genuine and specific to what you see
- "gapAnalysis" should explain what's missing for their target role
- Each actionItem must have specific "how" guidance, not generic advice`;

  return basePrompt;
}

// Create specialized prompt for experience roles
function createExperienceRolePrompt(experience, config) {
  const prompt = `You are an extremely experienced career coach specializing in helping professionals transition to ${config.targetRole} at the ${config.seniorityLevel} level. You have 20+ years of experience optimizing LinkedIn profiles.

Analyze this work experience with a coach's eye:
- What story does this role tell about their capabilities?
- How well does it position them for ${config.targetRole}?
- What's missing that would make recruiters say "yes"?

TARGET ROLE: ${config.targetRole}
SENIORITY LEVEL: ${config.seniorityLevel}

POSITION DETAILS:
Title: ${experience.title}
Company: ${experience.company}${experience.companyDetails?.size ? ` (${experience.companyDetails.size} employees)` : ''}
Industry: ${experience.companyDetails?.industry || 'Not specified'}
Employment Type: ${experience.employment?.type || 'Not specified'}
Duration: ${experience.employment?.duration || 'Not specified'} ${experience.employment?.isCurrent ? '(Current Role)' : ''}
Location: ${experience.location || 'Not specified'}

DESCRIPTION:
${experience.description || 'No description provided'}

CONTENT ANALYSIS:
- Length: ${experience.description?.length || 0} characters
- Has Quantified Results: ${experience.hasQuantifiedAchievements ? 'Yes' : 'No'}
- Mentions Tech Stack: ${experience.hasTechStack ? 'Yes' : 'No'}

MENTIONED SKILLS:
${experience.mentionedSkills?.join(', ') || 'None extracted'}

QUALITY INDICATORS:
- Has Quantified Achievements: ${experience.hasQuantifiedAchievements ? 'Yes' : 'No'}
- Mentions Tech Stack: ${experience.hasTechStack ? 'Yes' : 'No'}
- Content Quality Score: ${experience.contentQualityScore || 0}/10
- Recency Weight: ${experience.recencyScore || 0} ${experience.recencyScore > 0.8 ? '(Recent/Current)' : experience.recencyScore > 0.5 ? '(Moderately Recent)' : '(Older Position)'}

Provide your coaching analysis in EXACT JSON format:

{
  "score": 4,
  "positiveInsight": "This role demonstrates hands-on product management experience at a reputable company, showing you've worked in a product capacity.",
  "gapAnalysis": "However, the description reads like a job posting rather than achievements. For ${config.seniorityLevel} roles, recruiters need to see quantified impact and strategic thinking, not just responsibilities.",
  "specificFeedback": {
    "originalLine": "Managed product roadmap and worked with engineering team",
    "suggestion": "Led 18-month product roadmap for payment processing features, partnering with 12-person engineering team to deliver 3 major releases that increased transaction volume by 45% ($2.3M additional revenue)",
    "why": "Shows timeline, team scale, specific domain, and business impact with hard numbers"
  },
  "actionItems": [
    {
      "what": "Quantify your business impact",
      "how": "Add specific metrics: user growth (50K→150K users), revenue impact ($X generated/saved), efficiency gains (reduced churn by 25%), or process improvements (cut deployment time by 40%)",
      "priority": "high"
    },
    {
      "what": "Demonstrate strategic thinking",
      "how": "Mention market analysis, competitive positioning, or strategic decisions you made. For example: 'Identified market gap through user research, leading to new feature that captured 15% market share from competitor'",
      "priority": "high"
    }
  ]
}

IMPORTANT: 
- Score based on how well this positions them for ${config.targetRole}
- Be specific in positiveInsight - reference actual content
- gapAnalysis should explain what's missing for their target role
- specificFeedback should pick an actual line from their description
- Each actionItem must have concrete examples, not generic advice`;

  return prompt;
}

// Create prompt for experience section (when not broken into individual roles)
function createExperienceSectionPrompt(experienceData, config) {
  const prompt = `You are a LinkedIn profile optimization expert. Analyze this experience section overview.

TARGET ROLE: ${config.targetRole}
SENIORITY LEVEL: ${config.seniorityLevel}

EXPERIENCE OVERVIEW:
- Total Roles: ${experienceData.count || 0}
- Total Months of Experience: ${experienceData.totalMonths || 0}
- Has Current Role: ${experienceData.hasCurrentRole ? 'Yes' : 'No'}
- Visible Roles: ${experienceData.visibleCount || 0}

Analyze the overall experience section and provide:
1. A score from 0-10 for the experience section quality
2. Feedback on career progression and trajectory
3. Recommendations for improving the experience section

Respond in JSON format:
{
  "score": <number 0-10>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "recommendations": ["specific action 1", "specific action 2"]
}

NOTE: This is a fallback analysis. Individual role analysis would provide better insights.`;

  return prompt;
}

// Parse section analysis response
function parseSectionAnalysis(response, sectionName) {
  try {
    // Try to parse as JSON first
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Handle both old and new formats
      const actionItems = parsed.actionItems || parsed.recommendations || [];
      const improvements = parsed.improvements || [];
      
      return {
        score: Math.min(10, Math.max(0, parsed.score || 5)),
        // New format with positiveInsight and gapAnalysis
        positiveInsight: parsed.positiveInsight || parsed.strengths?.[0] || '',
        gapAnalysis: parsed.gapAnalysis || '',
        // Legacy format support
        insight: parsed.insight || parsed.feedback || `${parsed.strengths?.join('. ')}. ${improvements.join('. ')}`,
        strengths: parsed.strengths || [],
        improvements: improvements,
        actionItems: actionItems,
        specificFeedback: parsed.specificFeedback || null,
        // Keep backwards compatibility
        recommendations: actionItems.map(item => 
          typeof item === 'string' ? item : (item.what || item.text || item)
        )
      };
    }
  } catch (error) {
    console.error(`[Parse Error] Failed to parse ${sectionName} response:`, error);
  }
  
  // Fallback parsing
  return {
    score: 5,
    positiveInsight: '',
    gapAnalysis: '',
    insight: response.substring(0, 200),
    strengths: [],
    improvements: [],
    actionItems: [],
    recommendations: []
  };
}

// Synthesize final analysis from section analyses
async function synthesizeFinalAnalysis(sectionAnalyses, config) {
  console.log('[Synthesis] Creating final recommendations from section analyses');
  
  // Separate experience roles from other sections
  const experienceRoles = [];
  const otherSections = {};
  
  for (const [section, analysis] of Object.entries(sectionAnalyses)) {
    if (section === 'experience_role') {
      experienceRoles.push(analysis);
    } else {
      otherSections[section] = analysis;
    }
  }
  
  // Analyze career trajectory if we have experience data
  let careerInsights = '';
  if (experienceRoles.length > 0) {
    careerInsights = analyzeCareerTrajectory(experienceRoles);
  }
  
  // Collect all recommendations and improvements
  const allRecommendations = [];
  const insights = {
    strengths: [],
    improvements: [],
    careerTrajectory: careerInsights
  };
  
  // Process all sections
  for (const [section, analysis] of Object.entries(sectionAnalyses)) {
    // Handle experience_roles array
    if (section === 'experience_roles' && Array.isArray(analysis)) {
      analysis.forEach((roleAnalysis, index) => {
        // Use actionItems if available
        if (roleAnalysis.actionItems?.length > 0) {
          roleAnalysis.actionItems.forEach(item => {
            const priority = item.priority || (roleAnalysis.score < 5 ? 'critical' : roleAnalysis.score < 7 ? 'high' : 'medium');
            
            allRecommendations.push({
              section: `experience_role_${index + 1}`,
              priority: priority,
              action: {
                what: item.what || 'Improve experience description',
                why: item.why || item.how || 'Review and update this role description',
                how: item.how || 'Add specific achievements and impact'
              }
            });
          });
        }
        // Fallback to recommendations
        else if (roleAnalysis.recommendations?.length > 0) {
          roleAnalysis.recommendations.forEach(rec => {
            const basePriority = roleAnalysis.score < 5 ? 'critical' : roleAnalysis.score < 7 ? 'high' : 'medium';
            
            allRecommendations.push({
              section: `experience_role_${index + 1}`,
              priority: basePriority,
              action: {
                what: typeof rec === 'string' ? rec : (rec.text || rec.action?.what || 'Improve experience description'),
                why: rec.why || rec.action?.why || rec.how || 'Add specific achievements and impact',
                how: rec.how || rec.action?.how || rec.example || 'Add specific achievements and impact'
              }
            });
          });
        }
      });
      continue;
    }
    
    if (!analysis.exists) {
      allRecommendations.push({
        section,
        priority: 'critical',
        action: {
          what: `Add ${section} section to your profile`,
          why: `Missing ${section} significantly impacts profile completeness`,
          how: `Navigate to your LinkedIn profile and add content to the ${section} section`
        }
      });
    } else {
      // Add strengths
      if (analysis.strengths?.length > 0) {
        insights.strengths.push(...analysis.strengths.map(s => `${section}: ${s}`));
      } else if (analysis.insights?.strengths?.length > 0) {
        insights.strengths.push(...analysis.insights.strengths.map(s => `${section}: ${s}`));
      }
      
      // Add improvements as recommendations
      const improvements = analysis.improvements || analysis.insights?.improvements || [];
      if (improvements.length > 0) {
        improvements.forEach(improvement => {
          // For experience roles, prioritize recent ones
          const isRecentRole = section === 'experience_role' && analysis.recencyScore > 0.8;
          const basePriority = analysis.score < 5 ? 'critical' : analysis.score < 7 ? 'high' : 'medium';
          const priority = isRecentRole && basePriority === 'medium' ? 'high' : basePriority;
          
          allRecommendations.push({
            section,
            priority,
            action: {
              what: improvement,
              why: `Important for ${section} section${isRecentRole ? ' (Current/Recent Role - Higher Impact)' : ''}`,
              how: analysis.recommendations?.[0] || 'Review and update this section'
            }
          });
        });
      }
      
      // Add action items if they exist
      if (analysis.actionItems?.length > 0) {
        analysis.actionItems.forEach((item) => {
          const isRecentRole = section === 'experience_role' && analysis.recencyScore > 0.8;
          // Use priority from action item if available, otherwise calculate
          const priority = item.priority || (analysis.score < 5 ? 'critical' : analysis.score < 7 ? 'high' : 'medium');
          
          allRecommendations.push({
            section,
            priority,
            action: {
              what: item.what || item.text || `Improve ${section}`,
              why: item.why || item.how || 'Review and update this section',
              how: item.how || item.example || 'Review and update this section'
            }
          });
        });
      }
      
      // Fallback to old recommendations format
      else if (analysis.recommendations?.length > 0) {
        analysis.recommendations.forEach((rec) => {
          const isRecentRole = section === 'experience_role' && analysis.recencyScore > 0.8;
          const basePriority = analysis.score < 5 ? 'critical' : analysis.score < 7 ? 'high' : 'medium';
          const priority = isRecentRole && basePriority === 'medium' ? 'high' : basePriority;
          
          allRecommendations.push({
            section,
            priority,
            action: {
              what: typeof rec === 'string' ? rec : (rec.text || rec.action?.what || `${section} improvement`),
              why: rec.why || rec.action?.why || `Improves ${section} quality score from ${analysis.score}/10`,
              how: rec.how || rec.action?.how || rec.example || 'Review and update this section'
            }
          });
        });
      }
    }
  }
  
  // Sort and categorize recommendations
  const categorized = {
    critical: allRecommendations.filter(r => r.priority === 'critical').slice(0, 3),
    important: allRecommendations.filter(r => r.priority === 'high').slice(0, 3),
    niceToHave: allRecommendations.filter(r => r.priority === 'medium').slice(0, 3)
  };
  
  const result = {
    recommendations: categorized,
    insights: {
      strengths: insights.strengths.slice(0, 3).join('. '),
      improvements: insights.improvements.slice(0, 3).join('. '),
      careerTrajectory: insights.careerTrajectory
    },
    summary: `Analysis complete. Found ${allRecommendations.length} recommendations across ${Object.keys(sectionAnalyses).length} sections.`
  };
  
  console.log('[synthesizeFinalAnalysis] Returning:', {
    hasRecommendations: !!result.recommendations,
    recommendationStructure: result.recommendations,
    insightsType: typeof result.insights,
    summary: result.summary
  });
  
  return result;
}

// Analyze career trajectory from experience roles
function analyzeCareerTrajectory(experienceRoles) {
  if (experienceRoles.length === 0) return 'No experience data available for trajectory analysis.';
  
  // Sort by recency (assuming they come in order)
  const sortedRoles = [...experienceRoles].sort((a, b) => (b.recencyScore || 0) - (a.recencyScore || 0));
  
  // Calculate average scores
  const avgScore = sortedRoles.reduce((sum, role) => sum + (role.score || 0), 0) / sortedRoles.length;
  const recentScore = sortedRoles[0]?.score || 0;
  const scoreTrajectory = recentScore > avgScore ? 'improving' : recentScore < avgScore ? 'declining' : 'stable';
  
  // Analyze progression patterns
  const hasUpwardProgression = sortedRoles.some((role, i) => {
    if (i === sortedRoles.length - 1) return false;
    const current = role.title?.toLowerCase() || '';
    const previous = sortedRoles[i + 1]?.title?.toLowerCase() || '';
    return current.includes('senior') && !previous.includes('senior') ||
           current.includes('lead') && !previous.includes('lead') ||
           current.includes('director') && !previous.includes('director');
  });
  
  // Build insights
  let insights = `Career Analysis: ${sortedRoles.length} roles analyzed. `;
  
  if (scoreTrajectory === 'improving') {
    insights += 'Profile quality is improving over time - recent roles are better documented. ';
  } else if (scoreTrajectory === 'declining') {
    insights += 'Recent roles need more detail - earlier positions are better documented. ';
  }
  
  if (hasUpwardProgression) {
    insights += 'Clear career progression visible through role titles. ';
  }
  
  if (sortedRoles[0]?.hasQuantifiedAchievements) {
    insights += 'Current role includes quantified achievements (excellent). ';
  } else {
    insights += 'Current role lacks quantified achievements (high priority improvement). ';
  }
  
  return insights;
}

// Call AI provider
async function callAIProvider(provider, apiKey, prompt, model = null) {
  console.log(`[AI Provider] Calling ${provider} with model:`, model);
  
  // Clean and validate API key
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key');
  }
  
  // Remove any non-printable characters and trim whitespace
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Check if key was significantly altered (might indicate encoding issues)
  if (cleanApiKey.length < apiKey.length - 2) {
    console.warn('[AI Provider] API key contained non-ASCII characters that were removed');
  }
  
  if (!cleanApiKey) {
    throw new Error('API key is empty after cleaning');
  }
  
  // Get model from storage if not provided
  if (!model && provider === 'openai') {
    const settings = await chrome.storage.local.get('aiModel');
    model = settings.aiModel || 'gpt-4o-mini';
  }
  
  const config = {
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${cleanApiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: model === 'gpt-4o' ? 4000 : 3200,  // gpt-4o supports more tokens
        temperature: 0.1
      }
    },
    anthropic: {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': cleanApiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3200,  // 80% of context window
        temperature: 0.1
      }
    }
  };
  
  const providerConfig = config[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  const response = await fetch(providerConfig.url, {
    method: 'POST',
    headers: providerConfig.headers,
    body: JSON.stringify(providerConfig.body)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    console.error(`[AI Provider] Error response:`, errorData);
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Log token usage for OpenAI
  if (provider === 'openai' && data.usage) {
    console.log('[AI Provider] Token usage:', {
      prompt_tokens: data.usage.prompt_tokens,
      completion_tokens: data.usage.completion_tokens,
      total_tokens: data.usage.total_tokens,
      model: model || 'gpt-4o-mini',
      estimated_cost: model === 'gpt-4o' ? 
        `$${((data.usage.prompt_tokens / 1000) * 0.01 + (data.usage.completion_tokens / 1000) * 0.03).toFixed(4)}` :
        `$${((data.usage.prompt_tokens / 1000) * 0.00015 + (data.usage.completion_tokens / 1000) * 0.0006).toFixed(4)}`
    });
  }
  
  // Extract content based on provider
  if (provider === 'openai') {
    return data.choices?.[0]?.message?.content || '';
  } else if (provider === 'anthropic') {
    return data.content?.[0]?.text || '';
  }
  
  return '';
}

// Message handler
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request;
  
  console.log('Service worker received message:', action);
  
  // Handle test API key
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
  
  // Handle API key encryption with better error handling
  if (action === 'encryptApiKey') {
    console.log('[Service Worker] Encrypting API key...');
    cryptoUtils.encryptApiKey(request.apiKey).then(encryptedKey => {
      console.log('[Service Worker] Encryption successful');
      sendResponse({ success: true, encryptedApiKey: encryptedKey });
    }).catch(error => {
      console.error('[Service Worker] Encryption failed:', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Failed to encrypt API key',
        details: {
          errorName: error.name,
          errorStack: error.stack
        }
      });
    });
    return true;
  }
  
  // Handle individual section analysis
  if (action === 'analyzeSection') {
    handleSectionAnalysis(request, sendResponse);
    return true;
  }
  
  // Handle synthesis of section scores
  if (action === 'synthesizeAnalysis') {
    handleSynthesisAnalysis(request, sendResponse);
    return true;
  }
  
  // Handle API key validation
  if (action === 'validateApiKey') {
    console.log('[Service Worker] Validating API key...');
    (async () => {
      try {
        // Get provider and API key from storage
        const { aiProvider } = await chrome.storage.local.get('aiProvider');
        const apiKey = await getDecryptedApiKey();
        
        if (!aiProvider || !apiKey) {
          sendResponse({ 
            success: false, 
            error: 'API key or provider not configured' 
          });
          return;
        }
        
        // Use the existing testApiKey function
        const result = await testApiKey(aiProvider, apiKey, null);
        sendResponse(result);
      } catch (error) {
        console.error('[Service Worker] API key validation error:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Validation failed' 
        });
      }
    })();
    return true;
  }
  
  // Handle popup open request
  if (action === 'openPopup') {
    chrome.action.openPopup();
    sendResponse({ success: true });
    return true;
  }
  
  // Default response for unknown actions
  console.log('[Service Worker] Unknown action:', action);
  sendResponse({ success: false, error: 'Unknown action' });
  return true;
});

// Test API Key function
async function testApiKey(provider, apiKey, model) {
  try {
    console.log(`Testing ${provider} API key...`);
    
    // Clean and validate API key
    if (!apiKey || typeof apiKey !== 'string') {
      return { success: false, error: 'Invalid API key format' };
    }
    
    // Remove any non-printable characters and trim whitespace
    const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
    
    // Check if key was significantly altered (might indicate encoding issues)
    if (cleanApiKey.length < apiKey.length - 2) {
      console.warn('[Test API] API key contained non-ASCII characters that were removed');
    }
    
    if (!cleanApiKey) {
      return { success: false, error: 'API key is empty or contains only invalid characters' };
    }
    
    const testPrompt = 'Say "API key validated successfully" in exactly 5 words.';
    
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 20,
          temperature: 0.1
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI test failed:', errorData);
        
        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' };
        } else if (response.status === 429) {
          return { success: false, error: 'Rate limit exceeded' };
        } else if (response.status === 404 && errorData.error?.code === 'model_not_found') {
          return { success: false, error: `Model "${model}" not available for your account` };
        } else {
          return { success: false, error: errorData.error?.message || 'API request failed' };
        }
      }
      
      const data = await response.json();
      return { success: true, message: 'OpenAI API key is valid' };
      
    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': cleanApiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 20,
          temperature: 0.1
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Anthropic test failed:', errorData);
        
        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' };
        } else if (response.status === 429) {
          return { success: false, error: 'Rate limit exceeded' };
        } else {
          return { success: false, error: errorData.error?.message || 'API request failed' };
        }
      }
      
      const data = await response.json();
      return { success: true, message: 'Anthropic API key is valid' };
    }
    
    return { success: false, error: 'Unknown provider' };
    
  } catch (error) {
    console.error('Test API key error:', error);
    return { success: false, error: error.message || 'Connection failed' };
  }
}

// Handle individual section analysis request
async function handleSectionAnalysis(request, sendResponse) {
  const sectionStartTime = Date.now();
  const { section, data, context, settings } = request;
  
  try {
    console.log(`[Section Analysis] Analyzing ${section}`, {
      timestamp: new Date().toISOString(),
      dataSize: JSON.stringify(data).length,
      hasContext: !!context,
      hasSettings: !!settings
    });
    
    // Log specific details for experience roles
    if (section === 'experience_role') {
      console.log('[Section Analysis] Experience role details:', {
        title: data?.title,
        company: data?.company,
        hasDescription: !!data?.description,
        bulletCount: data?.bullets?.length || 0,
        achievementCount: data?.achievements?.length || 0,
        responsibilityCount: data?.responsibilities?.length || 0,
        position: context?.position,
        totalRoles: context?.totalRoles
      });
    }
    
    // Get provider and API key
    const { aiProvider } = await chrome.storage.local.get('aiProvider');
    const apiKey = await getDecryptedApiKey();
    
    if (!aiProvider || !apiKey) {
      sendResponse({ 
        success: false, 
        error: 'API key or provider not configured' 
      });
      return;
    }
    
    // Check rate limit
    const rateCheck = await rateLimiter.checkLimit(aiProvider);
    if (!rateCheck.allowed) {
      sendResponse({
        success: false,
        error: `Rate limit exceeded. Please wait ${rateCheck.waitTime} seconds.`,
        errorType: 'RATE_LIMIT',
        retryAfter: rateCheck.waitTime
      });
      return;
    }
    
    // Create section-specific prompt
    const config = {
      provider: aiProvider,
      apiKey: apiKey,
      targetRole: settings?.targetRole || 'general professional',
      seniorityLevel: settings?.seniorityLevel || 'any level',
      customInstructions: settings?.customInstructions || ''
    };
    
    console.log(`[Section Analysis] Creating prompt for ${section}`);
    const prompt = createSectionPrompt(section, data, config);
    const model = settings?.aiModel || null;
    
    console.log(`[Section Analysis] Calling AI provider for ${section}`);
    const response = await callAIProvider(aiProvider, apiKey, prompt, model);
    
    // Log raw response to debug format
    console.log(`[Section Analysis] Raw AI response for ${section}:`, {
      responseLength: response.length,
      responsePreview: response.substring(0, 500),
      hasJSON: response.includes('{')
    });
    
    // Parse the response
    const analysis = parseSectionAnalysis(response, section);
    
    // Log parsed analysis to see what fields we got
    console.log(`[Section Analysis] Parsed analysis for ${section}:`, {
      hasInsight: !!analysis.insight,
      hasActionItems: !!analysis.actionItems,
      hasRecommendations: !!analysis.recommendations,
      hasSpecificFeedback: !!analysis.specificFeedback,
      fields: Object.keys(analysis)
    });
    
    const sectionElapsed = Date.now() - sectionStartTime;
    console.log(`[Section Analysis] Completed ${section}`, {
      score: analysis.score,
      elapsedMs: sectionElapsed,
      recommendationCount: analysis.recommendations?.length || 0
    });
    
    sendResponse({
      success: true,
      section: section,
      score: analysis.score,
      insight: analysis.positiveInsight || analysis.insight,  // Prefer positiveInsight
      positiveInsight: analysis.positiveInsight,  // Include the actual field
      gapAnalysis: analysis.gapAnalysis,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      actionItems: analysis.actionItems,
      specificFeedback: analysis.specificFeedback,
      // Backwards compatibility
      analysis: analysis.insight,
      recommendations: analysis.recommendations,
      insights: {
        strengths: analysis.strengths,
        improvements: analysis.improvements
      }
    });
    
  } catch (error) {
    const sectionElapsed = Date.now() - sectionStartTime;
    console.error(`[Section Analysis] Error analyzing ${section}:`, {
      error: error.message,
      elapsedMs: sectionElapsed,
      stack: error.stack
    });
    sendResponse({
      success: false,
      error: error.message || 'Section analysis failed'
    });
  }
}

// Handle synthesis analysis request
async function handleSynthesisAnalysis(request, sendResponse) {
  const { sectionScores, sectionRecommendations, targetRole, seniorityLevel, customInstructions } = request;
  
  try {
    console.log('[Synthesis] Creating final recommendations from section analyses');
    console.log('[Synthesis] Section scores received:', sectionScores);
    
    // Calculate weighted average score from section results
    let totalScore = 0;
    let totalWeight = 0;
    const weights = {
      profile_intro: 0.30,      // 30% - Profile intro (headline + about)
      experience_role: 0.35,    // 35% - All experience roles combined
      skills: 0.20,             // 20% - Skills
      recommendations: 0.15     // 15% - Recommendations
    };
    
    // Track experience scores separately to average them
    const experienceScores = [];
    
    console.log('[Synthesis] Processing section scores:', {
      sectionCount: Object.keys(sectionScores || {}).length,
      sections: Object.keys(sectionScores || {})
    });
    
    Object.entries(sectionScores || {}).forEach(([sectionType, result]) => {
      console.log(`[Synthesis] Processing ${sectionType}:`, {
        hasScore: result && result.score !== undefined,
        isArray: Array.isArray(result),
        score: result?.score
      });
      
      if (sectionType === 'experience_roles' && Array.isArray(result)) {
        // Handle array of experience roles
        result.forEach(role => {
          if (role && role.score !== undefined && role.score !== null) {
            experienceScores.push(role.score);
          }
        });
      } else if (result && result.score !== undefined && result.score !== null) {
        // Process other sections normally
        const weight = weights[sectionType] || 0.1;
        totalScore += result.score * weight;
        totalWeight += weight;
      }
    });
    
    // Add averaged experience score
    if (experienceScores.length > 0) {
      const avgExperienceScore = experienceScores.reduce((a, b) => a + b, 0) / experienceScores.length;
      totalScore += avgExperienceScore * weights.experience_role;
      totalWeight += weights.experience_role;
    }
    
    // Calculate final score
    const finalScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : 5;
    
    console.log('[Synthesis] Score calculation:', {
      experienceScores,
      avgExperienceScore: experienceScores.length > 0 ? experienceScores.reduce((a, b) => a + b, 0) / experienceScores.length : 0,
      totalScore,
      totalWeight,
      finalScore
    });
    
    // Use the existing synthesizeFinalAnalysis function for recommendations
    const config = {
      targetRole: targetRole || 'general professional',
      seniorityLevel: seniorityLevel || 'any level',
      customInstructions: customInstructions || ''
    };
    
    const synthesis = await synthesizeFinalAnalysis(sectionScores || {}, config);
    
    console.log('[Synthesis] Sending response back to content script:', {
      finalScore: finalScore,
      hasSynthesis: !!synthesis,
      hasRecommendations: !!synthesis.recommendations,
      recommendationType: typeof synthesis.recommendations,
      insightsType: typeof synthesis.insights
    });
    
    // Return the response with calculated score
    const responseData = {
      success: true,
      finalScore: finalScore,
      synthesis: synthesis.summary,
      overallRecommendations: synthesis.recommendations,
      careerNarrative: synthesis.insights,
      sectionScores: sectionScores
    };
    
    console.log('[Synthesis] Response data structure:', responseData);
    sendResponse(responseData);
  } catch (error) {
    console.error('[Synthesis] Error:', error);
    sendResponse({
      success: false,
      error: error.message || 'Failed to synthesize analysis'
    });
  }
}

// Note: openPopup is handled in the main message listener above
} else {
  console.warn('[Service Worker] chrome.runtime.onMessage not available');
}

// Cleanup old cache periodically
if (chrome && chrome.alarms) {
  chrome.alarms.create('cleanupCache', { periodInMinutes: 60 * 24 }); // Daily
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'cleanupCache') {
      cleanupOldCache();
    }
  });
} else {
  console.warn('[Service Worker] chrome.alarms API not available - cache cleanup will not be scheduled');
}