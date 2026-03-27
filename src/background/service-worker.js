/* Background Service Worker for ElevateLI */

// Debug configuration for service worker
const DEBUG_CONFIG = {
  ENABLED: true,
  AI: { PROMPTS: true, RESPONSES: true, PARSING: true, SCORING: true, QUOTES: true, COSTS: true },
  DATA: { EXTRACTION: true, TRANSFORMATION: true, VALIDATION: true, COMPLETENESS: true },
  UI: { STATES: true, RENDERING: true, INTERACTIONS: true, ERRORS: true },
  PERFORMANCE: { TIMING: true, MEMORY: false, CACHE: true, API_LATENCY: true },
  SECTIONS: { EXPERIENCE: true, RECOMMENDATIONS: true, SKILLS: true, PROFILE_INTRO: true }
};

// Simple logger for service worker (can't import modules)
class SmartLogger {
  static log(category, action, data = {}) {
    if (!DEBUG_CONFIG.ENABLED) return;
    const [mainCat, subCat] = category.split('.');
    if (!DEBUG_CONFIG[mainCat]?.[subCat]) return;
  }
  
  static error(category, action, error, context = {}) {
    if (!DEBUG_CONFIG.ENABLED) return;
    
    // Handle different types of error objects
    let errorInfo;
    if (error instanceof Error) {
      // Standard Error object
      errorInfo = { message: error.message, stack: error.stack };
    } else if (error && typeof error === 'object') {
      // Plain object - try to stringify it
      errorInfo = { 
        message: error.message || JSON.stringify(error), 
        type: 'object',
        details: error 
      };
    } else {
      // Primitive or null/undefined
      errorInfo = { message: String(error), type: typeof error };
    }
    
  }
  
  static async time(category, action, asyncFn) {
    if (!DEBUG_CONFIG.ENABLED || !DEBUG_CONFIG.PERFORMANCE?.TIMING) return asyncFn();
    const start = performance.now();
    try {
      const result = await asyncFn();
      const duration = Math.round((performance.now() - start) * 100) / 100;
      this.log('PERFORMANCE.TIMING', action, { category, duration });
      return result;
    } catch (error) {
      this.error('PERFORMANCE.TIMING', action, error, { duration: performance.now() - start });
      throw error;
    }
  }
}

// Check if Chrome APIs are available
if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
  SmartLogger.error('SYSTEM', 'Chrome APIs not available', new Error('Chrome runtime unavailable'));
}

// Import crypto manager module
importScripts('../common/crypto-manager.js');

// DEPRECATED: Moving to shared crypto-manager.js module
// Keeping temporarily for reference during migration
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
        return installationId;
      }

      const newId = crypto.randomUUID() + '-' + Date.now();
      await chrome.storage.local.set({ installationId: newId });
      return newId;
    } catch (error) {
      SmartLogger.error('SECURITY', 'Failed to get/create passphrase', error);
      // Fallback to a simpler ID generation if crypto.randomUUID fails
      const fallbackId = 'elevateli-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15);
      try {
        if (chrome && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ installationId: fallbackId });
        }
      } catch (e) {
        SmartLogger.error('SECURITY', 'Failed to save fallback ID', e);
      }
      return fallbackId;
    }
  }

  async encryptApiKey(apiKey) {
    try {
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

      // SIMPLE V1 FORMAT: Just concatenate salt + iv + encrypted
      const encryptedBytes = new Uint8Array(encrypted);
      const combined = new Uint8Array(salt.length + iv.length + encryptedBytes.length);
      
      // Write components
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(encryptedBytes, salt.length + iv.length);
      
      // Safe base64 encoding for binary data
      let binary = '';
      const chunkSize = 0x8000; // 32KB chunks to avoid stack overflow
      for (let i = 0; i < combined.length; i += chunkSize) {
        const chunk = combined.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
      }
      const base64Result = btoa(binary);
      
      // Store expiration separately
      const expirationTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
      await chrome.storage.local.set({
        apiKeyExpiration: expirationTime
      });
      
      SmartLogger.log('AI.PROMPTS', 'API key encrypted successfully (v1)', { 
        length: base64Result.length,
        expiresAt: new Date(expirationTime).toISOString(),
        format: 'v1'
      });
      
      // Verify we can decrypt it immediately
      try {
        const testDecrypt = await this.decryptApiKey(base64Result);
        if (testDecrypt !== apiKey) {
          throw new Error('Encryption verification failed');
        }
        SmartLogger.log('AI.PROMPTS', 'Encryption verified successfully');
      } catch (verifyError) {
        SmartLogger.error('AI.PROMPTS', 'Failed to verify encryption', verifyError);
        throw new Error('Encryption verification failed');
      }
      
      return base64Result;
    } catch (error) {
      SmartLogger.error('AI.PROMPTS', 'Encryption error', error, {
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
        SmartLogger.error('AI.PROMPTS', 'Invalid encrypted data', new Error('Invalid data'), { 
          dataType: typeof encryptedData,
          hasData: !!encryptedData 
        });
        throw new Error('Encrypted data is missing or invalid');
      }

      // Check expiration from separate storage FIRST
      const { apiKeyExpiration } = await chrome.storage.local.get('apiKeyExpiration');
      if (apiKeyExpiration && Date.now() > apiKeyExpiration) {
        const expiredDate = new Date(apiKeyExpiration).toLocaleDateString();
        SmartLogger.warn('AI.PROMPTS', 'API key has expired', {
          expiredOn: expiredDate,
          daysAgo: Math.floor((Date.now() - apiKeyExpiration) / (24 * 60 * 60 * 1000))
        });
        throw new Error(`API key expired on ${expiredDate}. Please enter a new key.`);
      }

      const passphrase = await this.getOrCreatePassphrase();
      
      // Safely decode base64
      let combined;
      try {
        combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      } catch (e) {
        SmartLogger.error('AI.PROMPTS', 'Failed to decode base64', e, {
          encryptedDataSample: encryptedData.substring(0, 50) + '...'
        });
        // This might be a corrupted v2 key with chunked encoding
        // Provide a clear error message
        throw new Error('API key format is corrupted. Please delete and re-enter your API key.');
      }
      
      let salt, iv, encrypted;
      let isV2 = false;
      
      // Check if this is v2 format (starts with metadata length) for migration
      if (combined.length >= 4) {
        const dataView = new DataView(combined.buffer);
        const possibleMetadataLength = dataView.getUint32(0, false);
        
        // Sanity check - metadata shouldn't be huge
        if (possibleMetadataLength > 0 && possibleMetadataLength < 1000 && 
            combined.length >= 4 + possibleMetadataLength + this.saltLength + this.ivLength + 1) {
          
          // This looks like v2 format - migrate it
          try {
            const metadataBytes = combined.slice(4, 4 + possibleMetadataLength);
            const metadataJson = new TextDecoder().decode(metadataBytes);
            const metadata = JSON.parse(metadataJson);
            
            // Extract crypto components after metadata
            const dataStart = 4 + possibleMetadataLength;
            salt = combined.slice(dataStart, dataStart + this.saltLength);
            iv = combined.slice(dataStart + this.saltLength, dataStart + this.saltLength + this.ivLength);
            encrypted = combined.slice(dataStart + this.saltLength + this.ivLength);
            
            // Migrate expiration to separate storage
            if (metadata.expiresAt && !apiKeyExpiration) {
              await chrome.storage.local.set({
                apiKeyExpiration: metadata.expiresAt
              });
              SmartLogger.log('AI.PROMPTS', 'Migrated v2 expiration to separate storage');
            }
            
            isV2 = true;
            SmartLogger.log('AI.PROMPTS', 'Detected and migrating v2 encrypted format');
          } catch (metadataError) {
            // Not v2, continue with v1
            isV2 = false;
          }
        }
      }
      
      // If not v2, use simple v1 format
      if (!isV2) {
        // Validate combined data length for v1 format
        const minLength = this.saltLength + this.ivLength + 1;
        if (combined.length < minLength) {
          SmartLogger.error('AI.PROMPTS', 'Encrypted data too short', new Error('Data too short'), {
            actualLength: combined.length,
            expectedMinLength: minLength
          });
          throw new Error('Encrypted data is corrupted or too short');
        }
        
        salt = combined.slice(0, this.saltLength);
        iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
        encrypted = combined.slice(this.saltLength + this.ivLength);
        
        SmartLogger.log('AI.PROMPTS', 'Using v1 encrypted format');
      }

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
      const apiKey = decoder.decode(decrypted);
      
      // If we successfully decrypted a v2 key, re-encrypt it as v1
      if (isV2) {
        SmartLogger.log('AI.PROMPTS', 'Re-encrypting v2 key as v1 for future use');
        try {
          const newEncrypted = await this.encryptApiKey(apiKey);
          await chrome.storage.local.set({ encryptedApiKey: newEncrypted });
        } catch (reEncryptError) {
          SmartLogger.error('AI.PROMPTS', 'Failed to re-encrypt as v1', reEncryptError);
          // Continue - at least we decrypted it
        }
      }
      
      return apiKey;
    } catch (error) {
      SmartLogger.error('AI.PROMPTS', 'Decryption error', error, {
        encryptedDataLength: encryptedData?.length,
        encryptedDataType: typeof encryptedData,
        errorMessage: error.message,
        errorName: error.name
      });
      
      // Check if it's a decryption error (wrong key or corrupted data)
      if (error.name === 'OperationError' || error.message.includes('decrypt')) {
        throw new Error('API key decryption failed - key may be corrupted. Please re-enter your key.');
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

      const encrypted = await this.encryptApiKey(apiKey);
      await chrome.storage.local.set({ encryptedApiKey: encrypted });
      await chrome.storage.local.remove('apiKey');
      SmartLogger.log('AI.PROMPTS', 'API key successfully migrated to encrypted storage');
      return true;
    } catch (error) {
      SmartLogger.error('AI.PROMPTS', 'Migration failed', error);
      return false;
    }
  }
}

// Use shared crypto manager instead of local class
const cryptoUtils = CryptoManager;

// [CRITICAL_PATH:API_KEY_RETRIEVAL] - P0: Decrypts API key for all AI operations
// Helper function to get decrypted API key
async function getDecryptedApiKey() {
  try {
    // Check if Chrome storage is available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      SmartLogger.error('PERFORMANCE.TIMING', 'Chrome storage not available', new Error('No Chrome storage'));
      return null;
    }
    
    const { encryptedApiKey, apiKey } = await chrome.storage.local.get(['encryptedApiKey', 'apiKey']);
  
  // If we have an encrypted key, decrypt it
  if (encryptedApiKey) {
    try {
      return await cryptoUtils.decryptApiKey(encryptedApiKey);
    } catch (error) {
      SmartLogger.error('AI.PROMPTS', 'Failed to decrypt API key', error);
      
      // DO NOT auto-delete the key on decryption failure
      // This was causing keys to disappear from settings
      /*
      if (error.message.includes('decrypt') || error.message.includes('corrupted')) {
        SmartLogger.log('AI.PROMPTS', 'Clearing corrupted encrypted API key');
        try {
          if (chrome && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.remove(['encryptedApiKey']);
          }
        } catch (e) {
          SmartLogger.error('AI.PROMPTS', 'Failed to remove corrupted key', e);
        }
      }
      */
      
      return null;
    }
  }
  
  // If we have a plain text key (legacy), migrate it
  if (apiKey) {
    SmartLogger.log('AI.PROMPTS', 'Found legacy plain text API key, migrating');
    await cryptoUtils.migrateExistingKeys();
    // Try again with the migrated key
    try {
      if (chrome && chrome.storage && chrome.storage.local) {
        const { encryptedApiKey: newEncrypted } = await chrome.storage.local.get('encryptedApiKey');
        if (newEncrypted) {
          try {
            return await cryptoUtils.decryptApiKey(newEncrypted);
          } catch (error) {
            SmartLogger.error('AI.PROMPTS', 'Failed to decrypt migrated key', error);
            return null;
          }
        }
      }
    } catch (e) {
      SmartLogger.error('AI.PROMPTS', 'Failed to get migrated key', e);
    }
  }
  
  return null;
  } catch (error) {
    SmartLogger.error('AI.PROMPTS', 'getDecryptedApiKey error', error);
    return null;
  }
}

// Initialize service worker properly
(async function initializeServiceWorker() {
  try {
    SmartLogger.log('SYSTEM', 'Service worker initializing');
    
    // Check if migration is needed on every startup
    const { cryptoMigrationComplete } = await chrome.storage.local.get('cryptoMigrationComplete');
    if (!cryptoMigrationComplete) {
      SmartLogger.log('SYSTEM', 'Running crypto migration');
      await cryptoUtils.migrateExistingKeys();
      await chrome.storage.local.set({ cryptoMigrationComplete: true });
    }
    
    SmartLogger.log('SYSTEM', 'Service worker initialized successfully');
  } catch (error) {
    SmartLogger.error('SYSTEM', 'Service worker initialization failed', error);
  }
})();

// Use onInstalled only for one-time setup
if (chrome && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      SmartLogger.log('SYSTEM', 'Extension installed for the first time');
      // Open updates page on fresh install
      chrome.tabs.create({ url: 'updates.html' });
    } else if (details.reason === 'update') {
      SmartLogger.log('SYSTEM', 'Extension updated', { 
        previousVersion: details.previousVersion 
      });
      
      // Parse version numbers
      const previousVersion = details.previousVersion || '0.0.0';
      const currentVersion = chrome.runtime.getManifest().version;
      
      // Check if this is a major or minor version update
      const [prevMajor, prevMinor] = previousVersion.split('.').map(Number);
      const [currMajor, currMinor] = currentVersion.split('.').map(Number);
      
      // Show updates page for major or minor version changes
      if (currMajor > prevMajor || (currMajor === prevMajor && currMinor > prevMinor)) {
        chrome.tabs.create({ url: 'updates.html' });
      }
    }
  });
}

// Rate limiting class defined later in file to avoid duplication

// Service worker keep-alive mechanism for long operations
let keepAliveInterval;

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    if (chrome.runtime?.id) {
      // Simple ping to keep service worker alive
      chrome.runtime.getPlatformInfo(() => {});
    }
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Wrapper for long-running operations
async function withKeepAlive(operation) {
  startKeepAlive();
  try {
    return await operation();
  } finally {
    stopKeepAlive();
  }
}

// Profile Score Calculator for weighted section scoring
class ProfileScoreCalculator {
  // Section weights (when present)
  static SECTION_WEIGHTS = {
    first_impression: 0.20,  // 20% - Unified headline/photo/banner
    about: 0.25,            // 25% - Standalone about section  
    experience: 0.30,       // 30%
    skills: 0.15,           // 15%
    education: 0.05,        // 5%
    recommendations: 0.05,  // 5%
    // Legacy weights for backward compatibility
    profile_intro: 0.30,    // 30% - Old combined headline+about
    headline: 0.10          // 10% - Old standalone headline
  };
  
  // Critical sections - missing these caps the score
  static CRITICAL_SECTIONS = {
    first_impression: { required: true, maxScoreWithout: 8 }, // Missing photo/headline severely limits impact
    about: { required: true, maxScoreWithout: 7 },
    experience: { required: true, maxScoreWithout: 6 },
    skills: { required: false, maxScoreWithout: 9 },
    recommendations: { required: false, maxScoreWithout: 8 },
    // Legacy sections for backward compatibility
    profile_intro: { required: true, maxScoreWithout: 7 }
  };
  
  static calculateOverallScore(sectionScores) {
    let totalWeight = 0;
    let weightedSum = 0;
    let maxPossibleScore = 10;
    
    // Add defensive check for sectionScores
    if (!sectionScores || typeof sectionScores !== 'object') {
      SmartLogger.log('AI.SCORING', 'Invalid sectionScores', { sectionScores });
      return {
        overallScore: null,
        baseScore: null,
        errorType: 'DATA_READ_ERROR',
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
    SmartLogger.log('PERFORMANCE.CACHE', 'Force refresh requested', { cacheKey });
    return null;
  }
  
  try {
    const result = await chrome.storage.local.get(cacheKey);
    if (result[cacheKey]) {
      const cached = result[cacheKey];
      const age = Date.now() - cached.timestamp;
      
      // Always return cache regardless of age - content-based invalidation only
      SmartLogger.log('PERFORMANCE.CACHE', 'Cache hit', { cacheKey, age: formatCacheAge(age) });
      
      // Check if cached analysis has recommendations, if not try to parse from summary
      let cachedAnalysis = cached.analysis;
      if (!cachedAnalysis.recommendations && cachedAnalysis.summary && cachedAnalysis.summary.includes('"recommendations"')) {
        SmartLogger.log('AI.PARSING', 'Re-parsing cached result', { 
          summaryPreview: cachedAnalysis.summary.substring(0, 200) 
        });
        try {
          // Extract JSON from summary if it exists
          const jsonMatch = cachedAnalysis.summary.match(/```json\n([\s\S]+?)\n```/);
          if (jsonMatch) {
            SmartLogger.log('AI.PARSING', 'Found JSON in summary');
            const jsonData = JSON.parse(jsonMatch[1]);
            if (jsonData.recommendations) {
              cachedAnalysis.recommendations = jsonData.recommendations;
              cachedAnalysis.insights = jsonData.insights;
              cachedAnalysis.fullAnalysis = jsonData;
              SmartLogger.log('AI.PARSING', 'Successfully extracted recommendations from cache', {
                critical: cachedAnalysis.recommendations.critical?.length || 0,
                important: cachedAnalysis.recommendations.important?.length || 0,
                niceToHave: cachedAnalysis.recommendations.niceToHave?.length || 0
              });
            }
          }
        } catch (parseError) {
          SmartLogger.error('AI.PARSING', 'Failed to re-parse cached summary', parseError);
        }
      }
      
      return cachedAnalysis;
    }
    
    SmartLogger.log('PERFORMANCE.CACHE', 'Cache miss', { cacheKey });
    return null;
  } catch (error) {
    SmartLogger.error('PERFORMANCE.CACHE', 'Cache check failed', error);
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
    
    SmartLogger.log('PERFORMANCE.CACHE', 'Stored in cache', {
      cacheKey,
      hasRecommendations: !!analysis.recommendations,
      contentScore: analysis.contentScore,
      sectionCount: Object.keys(analysis.sectionScores || {}).length
    });
  } catch (error) {
    SmartLogger.error('PERFORMANCE.CACHE', 'Cache storage failed', error, { cacheKey });
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
      SmartLogger.log('PERFORMANCE.CACHE', 'Cleaned old cache entries', { count: keysToRemove.length });
    }
  } catch (error) {
    SmartLogger.error('PERFORMANCE.CACHE', 'Cache cleanup failed', error);
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
  // Check rate limit for analysis
  const profileId = request.profileId || 'unknown';
  const rateCheck = rateLimiter.canMakeRequest('analysis', profileId);
  if (!rateCheck.allowed) {
    sendResponse({
      success: false,
      error: `Analysis rate limit exceeded. Please wait ${rateCheck.waitTime} seconds before analyzing again.`,
      rateLimited: true
    });
    return;
  }

  SmartLogger.log('AI.PROMPTS', 'AI analysis request received', {
    sections: Object.keys(request.sections || {}),
    forceRefresh: request.forceRefresh,
    hasSettings: !!request.settings
  });
  
  const { sections, settings = {}, forceRefresh = false } = request;
  
  try {
    // Check AI enabled
    const { enableAI } = await chrome.storage.local.get('enableAI');
    if (!enableAI) {
      SmartLogger.log('AI.PROMPTS', 'AI is disabled');
      sendResponse({ success: false, error: 'AI analysis is disabled' });
      return;
    }
    
    // Get provider info
    const { aiProvider } = await chrome.storage.local.get('aiProvider');
    if (!aiProvider) {
      SmartLogger.log('AI.PROMPTS', 'No AI provider configured');
      sendResponse({ 
        success: false, 
        error: 'No AI provider configured',
        type: 'CONFIG'
      });
      return;
    }
    
    // Check rate limit
    const rateCheck = rateLimiter.canMakeRequest('analysis', request.profileId || 'unknown');
    if (!rateCheck.allowed) {
      SmartLogger.log('AI.PROMPTS', 'Rate limit hit', rateCheck);
      sendResponse({
        success: false,
        error: `Rate limit exceeded. Please wait ${rateCheck.waitTime} seconds.`,
        type: 'RATE_LIMIT',
        retryAfter: rateCheck.waitTime
      });
      return;
    }
    
    // Get decrypted API key
    let apiKey = null;
    let decryptionError = null;
    
    try {
      apiKey = await getDecryptedApiKey();
    } catch (error) {
      decryptionError = error;
      SmartLogger.error('AI.PROMPTS', 'Failed to get decrypted key', error);
    }
    
    if (!apiKey) {
      SmartLogger.log('AI.PROMPTS', 'No API key found', { hasDecryptError: !!decryptionError });
      
      // Check if we have an encrypted key that failed to decrypt
      const { encryptedApiKey } = await chrome.storage.local.get('encryptedApiKey');
      
      if (encryptedApiKey && decryptionError) {
        // We have a key but it failed to decrypt
        sendResponse({ 
          success: false, 
          error: 'Failed to decrypt API key. Please re-enter your key in settings.',
          type: 'AUTH',
          decryptionFailed: true
        });
      } else {
        // No key at all
        sendResponse({ 
          success: false, 
          error: 'API key not configured',
          type: 'AUTH',
          message: 'Please configure your API key in the extension settings'
        });
      }
      return;
    }
    
    // Generate content hash for smart caching (infinite duration)
    const contentHash = await generateTextContentHash(sections);
    const profileId = sender?.tab?.url?.match(/linkedin\.com\/in\/([^\/]+)/)?.[1] || 'unknown';
    
    // Check smart cache unless forced refresh
    const cachedAnalysis = await checkSmartCache(profileId, contentHash, 'text', forceRefresh);
    if (cachedAnalysis) {
      SmartLogger.log('PERFORMANCE.CACHE', 'Returning cached text analysis', { 
        profileId,
        contentHash: contentHash.substring(0, 8) + '...',
        cachedAt: cachedAnalysis.cachedAt
      });
      sendResponse({ 
        success: true, 
        analysis: cachedAnalysis,
        fromCache: true 
      });
      return;
    }
    
    // Get fresh analysis
    SmartLogger.log('AI.PROMPTS', 'Performing fresh analysis', { provider: aiProvider, model: aiModel });
    const { aiModel } = await chrome.storage.local.get('aiModel');
    const analysis = await performDistributedAnalysis(sections, {
      apiKey,
      provider: aiProvider,
      model: aiModel,
      targetRole: settings.targetRole || 'general professional',
      seniorityLevel: settings.seniorityLevel || 'any level',
      customInstructions: settings.customInstructions || ''
    });
    
    // Store in smart cache (infinite duration)
    await storeInSmartCache(profileId, contentHash, analysis, 'text');
    
    sendResponse({ 
      success: true, 
      analysis,
      fromCache: false 
    });
    
  } catch (error) {
    SmartLogger.error('AI.PROMPTS', 'AI analysis failed', error);
    
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
      
      // rateLimiter.setCooldown(request.settings?.provider || 'openai', waitTime);
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
    } else if (error.message?.includes('expired')) {
      // Keep expiration messages - they're already user-friendly
      sendResponse({
        success: false,
        error: error.message,
        type: 'EXPIRED'
      });
    } else {
      // Generic sanitized message for all other errors
      sendResponse({
        success: false,
        error: 'Analysis failed',
        type: 'UNKNOWN'
      });
    }
  }
}

// Handle vision AI analysis for images
async function handleVisionAnalysis(request, sender, sendResponse) {
  SmartLogger.log('AI.PROMPTS', 'Vision analysis request received', {
    hasImageData: !!request.imageData,
    hasPrompt: !!request.prompt,
    hasContext: !!request.context
  });
  
  const { imageData, prompt, context = {} } = request;
  
  try {
    // Check AI enabled
    const { enableAI } = await chrome.storage.local.get('enableAI');
    if (!enableAI) {
      SmartLogger.log('AI.PROMPTS', 'AI is disabled');
      sendResponse({ success: false, error: 'AI analysis is disabled' });
      return;
    }
    
    // Get provider info and check vision support
    const { aiProvider, aiModel } = await chrome.storage.local.get(['aiProvider', 'aiModel']);
    const visionModels = ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3.1-pro-preview'];
    if (!aiProvider || !visionModels.includes(aiModel)) {
      SmartLogger.log('AI.PROMPTS', 'Vision analysis requires a vision-capable model');
      sendResponse({
        success: false,
        error: 'Vision analysis requires a vision-capable model (GPT-4.1 or Gemini)',
        type: 'VISION_UNSUPPORTED'
      });
      return;
    }
    
    // Validate image data
    if (!imageData || !imageData.startsWith('data:image/')) {
      sendResponse({
        success: false,
        error: 'Invalid image data provided'
      });
      return;
    }
    
    // Get decrypted API key
    const apiKey = await getDecryptedApiKey();
    if (!apiKey) {
      SmartLogger.log('AI.PROMPTS', 'No API key found');
      sendResponse({ 
        success: false, 
        error: 'API key not configured',
        type: 'AUTH'
      });
      return;
    }
    
    // Generate image content hash for caching
    const imageHash = await generateImageHash(imageData);
    const profileId = context.profileId || 'unknown';
    const analysisType = context.analysisType || 'image';
    
    // Check smart cache unless forced refresh
    const cachedResult = await checkSmartCache(profileId, imageHash, `vision_${analysisType}`, context.forceRefresh);
    if (cachedResult) {
      SmartLogger.log('PERFORMANCE.CACHE', 'Returning cached vision result', { 
        imageHash: imageHash.substring(0, 8) + '...',
        analysisType 
      });
      sendResponse({ 
        success: true, 
        result: cachedResult
      });
      return;
    }
    
    // Perform fresh vision analysis
    SmartLogger.log('AI.PROMPTS', 'Performing fresh vision analysis', { 
      provider: aiProvider, 
      model: aiModel,
      analysisType 
    });
    
    const visionResult = await callOpenAIVision(apiKey, imageData, prompt);
    
    // Store in smart cache (infinite duration)
    await storeInSmartCache(profileId, imageHash, visionResult, `vision_${analysisType}`);
    
    sendResponse({ 
      success: true, 
      result: visionResult
    });
    
  } catch (error) {
    SmartLogger.error('AI.PROMPTS', 'Vision analysis failed', error);
    
    // Handle specific error types
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      sendResponse({
        success: false,
        error: 'Invalid API key',
        type: 'AUTH'
      });
    } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      sendResponse({
        success: false,
        error: 'Rate limit exceeded',
        type: 'RATE_LIMIT'
      });
    } else {
      sendResponse({
        success: false,
        error: error.message || 'Vision analysis failed'
      });
    }
  }
}

// Generate image hash for caching
async function generateImageHash(imageDataUrl) {
  try {
    // Extract base64 data (remove data:image/...;base64, prefix)
    const base64Data = imageDataUrl.split(',')[1];
    if (!base64Data) {
      return 'invalid_image';
    }
    
    // Convert base64 to ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Generate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    SmartLogger.error('AI.PROMPTS', 'Error generating image hash', error);
    return `img_fallback_${Date.now()}`;
  }
}

// Smart cache functions for content-hash based infinite caching
async function checkSmartCache(profileId, contentHash, analysisType, forceRefresh = false) {
  if (forceRefresh) return null;
  
  try {
    const cacheKey = `ai_${analysisType}_${profileId}_${contentHash}`;
    const result = await chrome.storage.local.get(cacheKey);
    
    if (result[cacheKey]) {
      const cachedData = result[cacheKey];
      cachedData._cacheInfo = {
        cached: true,
        cacheKey,
        cachedAt: cachedData.cachedAt || 'unknown',
        contentHash,
        analysisType
      };
      return cachedData;
    }
    
    return null;
  } catch (error) {
    SmartLogger.error('PERFORMANCE.CACHE', 'Error checking smart cache', error);
    return null;
  }
}

async function storeInSmartCache(profileId, contentHash, analysisResult, analysisType) {
  try {
    const cacheKey = `ai_${analysisType}_${profileId}_${contentHash}`;
    const cacheData = {
      ...analysisResult,
      cachedAt: new Date().toISOString(),
      contentHash,
      analysisType,
      profileId
    };
    
    await chrome.storage.local.set({
      [cacheKey]: cacheData
    });
    
    SmartLogger.log('PERFORMANCE.CACHE', 'Stored in smart cache', {
      cacheKey,
      contentHash: contentHash.substring(0, 8) + '...',
      analysisType
    });
    
    return true;
  } catch (error) {
    SmartLogger.error('PERFORMANCE.CACHE', 'Error storing in smart cache', error);
    return false;
  }
}

// Generate text content hash for smart caching (compatible with SmartCacheManager)
async function generateTextContentHash(sections) {
  try {
    // Create consistent structure for hashing (compatible with SmartCacheManager)
    const textContent = {
      about: sections.about?.text || '',
      headline: sections.headline?.text || '',
      experience: JSON.stringify(sections.experience || []),
      skills: JSON.stringify(sections.skills || []),
      education: JSON.stringify(sections.education || []),
      recommendations: JSON.stringify(sections.recommendations || []),
      certifications: JSON.stringify(sections.certifications || []),
      projects: JSON.stringify(sections.projects || []),
      featured: JSON.stringify(sections.featured || [])
    };
    
    // Create deterministic string for hashing
    const contentString = JSON.stringify(textContent, Object.keys(textContent).sort());
    
    // Generate SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(contentString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    SmartLogger.error('PERFORMANCE.CACHE', 'Error generating text content hash', error);
    // Fallback to timestamp-based cache key if hashing fails
    return `fallback_${Date.now()}`;
  }
}

// Perform distributed AI analysis
async function performDistributedAnalysis(sections, config) {
  SmartLogger.log('AI.PROMPTS', 'Starting distributed analysis', {
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
      
      // Log prompt generation
      SmartLogger.log('AI.PROMPTS', 'Section prompt created', {
        section: sectionName,
        promptLength: sectionPrompt.length,
        targetRole: config.targetRole,
        seniorityLevel: config.seniorityLevel,
        hasCustomInstructions: !!config.customInstructions
      });
      
      const response = await SmartLogger.time('PERFORMANCE.API_LATENCY', `AI analysis - ${sectionName}`, 
        async () => await callAIProvider(config.provider, config.apiKey, sectionPrompt, config.model)
      );
      
      // Parse the response
      const analysis = parseSectionAnalysis(response, sectionName);
      sectionAnalyses[sectionName] = {
        exists: true,
        ...analysis
      };
      
      SmartLogger.log('AI.RESPONSES', 'Section analyzed', {
        section: sectionName,
        score: analysis.score,
        hasPositiveInsight: !!analysis.positiveInsight,
        hasActionItems: analysis.actionItems?.length > 0,
        hasQuotes: analysis.positiveInsight?.includes('"') || analysis.gapAnalysis?.includes('"')
      });
      
      // Small delay between requests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      SmartLogger.error('AI.RESPONSES', 'Section analysis failed', error, { section: sectionName });
      sectionAnalyses[sectionName] = {
        exists: true,
        score: null,
        errorType: 'ANALYSIS_FAILED',
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
function createSectionPrompt(sectionName, content, config, context = {}) {
  // Add current date to config for all prompts
  const enhancedConfig = {
    ...config,
    currentDate: new Date().toISOString().split('T')[0] // Format: "2025-01-19"
  };
  
  // Special handling for experience roles
  if (sectionName === 'experience_role' && typeof content === 'object') {
    return createExperienceRolePrompt(content, enhancedConfig, context);
  }
  
  // Special handling for overall experience analysis
  if (sectionName === 'experience_overall' && typeof content === 'object') {
    SmartLogger.log('AI.PROMPTS', 'Using overall experience prompt', { 
      contentKeys: Object.keys(content),
      totalRoles: content.totalRoles,
      hasExperiences: content.experiences?.length > 0 
    });
    return createExperienceOverallPrompt(content, enhancedConfig, context);
  }
  
  // Special handling for experience section (fallback)
  if (sectionName === 'experience' && typeof content === 'object') {
    SmartLogger.log('AI.PROMPTS', 'Using experience fallback prompt', { 
      contentKeys: Object.keys(content),
      hasExperiences: content.experiences?.length > 0 
    });
    return createExperienceSectionPrompt(content, config);
  }
  
  // Special handling for recommendations
  if (sectionName === 'recommendations' && typeof content === 'object') {
    return createRecommendationsPrompt(content, enhancedConfig, context);
  }
  
  // Special handling for first impression (headline + photo + banner)
  if (sectionName === 'first_impression' && typeof content === 'object') {
    return createFirstImpressionPrompt(content, enhancedConfig);
  }
  
  // Special handling for standalone about section
  if (sectionName === 'about' && typeof content === 'string') {
    return createAboutPrompt(content, enhancedConfig);
  }
  
  // Special handling for profile intro (headline + about) - DEPRECATED, keeping for backward compatibility
  if (sectionName === 'profile_intro' && typeof content === 'object') {
    return createProfileIntroPrompt(content, enhancedConfig);
  }
  
  // Special handling for skills
  if (sectionName === 'skills' && typeof content === 'object') {
    return createSkillsPrompt(content, enhancedConfig, context);
  }
  
  // Default prompt for other sections
  const basePrompt = `You are an extremely experienced career coach specializing in helping professionals transition to ${config.targetRole} at the ${config.seniorityLevel} level. You have 20+ years of experience optimizing LinkedIn profiles for maximum impact.

⚠️ CRITICAL ANALYSIS RULES:
1. ALWAYS quote specific text from the profile when giving feedback
2. NEVER give generic advice like "add skills X, Y, Z" without analyzing what's already there
3. Your feedback must reference ACTUAL CONTENT from their profile
4. If you can't find specific content to quote, say so explicitly

Analyze this ${sectionName} section with the following approach:
1. First acknowledge what's working (quote specific content that's effective)
2. Identify gaps by analyzing what's actually written (not what's missing)
3. Provide specific improvements to existing content (not generic additions)

Target role: ${config.targetRole}
Seniority level: ${config.seniorityLevel}
${config.customInstructions ? `Additional context: ${config.customInstructions}` : ''}

${sectionName.toUpperCase()} CONTENT:
${typeof content === 'object' ? JSON.stringify(content, null, 2) : content}

Provide your coaching analysis in EXACT JSON format:

{
  "score": 7,
  "positiveInsight": "Your headline effectively highlights your expertise in 'API and platform integration' which is crucial for a product manager role, and your experience with 'Oracle' adds credibility.",
  "gapAnalysis": "However, your About section currently says 'Passionate about technology' which is too generic. The phrase doesn't differentiate you from thousands of other candidates.",
  "specificFeedback": {
    "originalLine": "[Quote exact text from their profile here]",
    "suggestion": "[Your improved version of that specific text]",
    "why": "[Explain why this change makes it more compelling]"
  },
  "actionItems": [
    {
      "category": "Content Depth",
      "action": "Replace 'Passionate about technology' with metrics like '40% adoption increase via API strategies'",
      "impact": "Differentiates you from generic profiles",
      "priority": "high",
      "quotedContent": "Your current text says: '[actual quote]'"
    },
    {
      "category": "Quantitative Evidence", 
      "action": "Add specific metrics: users (50K→150K), revenue ($2M), or efficiency gains (40% faster)",
      "impact": "Shows measurable business value",
      "priority": "high",
      "quotedContent": "Currently reads: '[actual quote]'"
    }
  ]
}

IMPORTANT: 
- Score 0-10 where 10 is perfect for landing the target role
- MUST quote actual text in positiveInsight, gapAnalysis, and actionItems
- specificFeedback is REQUIRED and must quote real content
- Each actionItem MUST include "quotedContent" field with actual text
- ActionItems based on score:
  * Score 9-10: Provide 0-1 improvement ONLY if absolutely critical (most 9-10 scores need NO improvements)
  * Score 7-8: Provide 1-2 impactful improvements
  * Score 0-6: Provide EXACTLY 2 critical improvements
- CRITICAL actionItem structure (NEW FORMAT):
  * "category": Improvement area (30-50 chars) - WHAT aspect needs work
  * "action": Specific steps to take (100-150 chars) - HOW to improve it  
  * "impact": Why it matters (50-80 chars) - Business/career impact
  * Examples:
    - GOOD: category="Content Depth", action="Replace generic phrases with specific metrics", impact="Makes profile stand out"
    - BAD: category="Add metrics", action="This improves your profile", impact="Better visibility"
    - GOOD: category="Leadership Evidence", action="Request 2 recommendations from direct reports", impact="Shows 360° management skills"
    - BAD: category="Get recommendation from peer", action="Ask someone to recommend you", impact="More recommendations"
- Keep positiveInsight between 200-300 characters for complete, meaningful feedback
- Focus on improving what's there, not adding generic content`;

  return basePrompt;
}

// Create specialized prompt for experience roles using Anthropic best practices
function createExperienceRolePrompt(experience, config, context = {}) {
  const prompt = `You are an expert career coach analyzing individual LinkedIn experience entries for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE FULL DESCRIPTION FIRST - Identify what IS already present before suggesting additions
2. NEVER suggest adding metrics/achievements that already exist in the description
3. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with the most critical gap, then acknowledge strengths
   - Scores 7-10: START with specific strengths, END with 1-2 refinements to reach 10/10
4. Quote EXACT phrases from their description when giving feedback
5. If description mentions "$50M revenue" don't ask to "add revenue metrics" - suggest how to enhance it
6. Give SPECIFIC improvements: "Move your $50M ARR metric to the first line" not "Add metrics"
7. Consider role recency - weight recent roles (< 2 years) more heavily
8. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<position_details>
Title: ${experience.title}
Company: ${experience.company}${experience.companyDetails?.size ? ` (${experience.companyDetails.size} employees)` : ''}
Industry: ${experience.companyDetails?.industry || 'Not specified'}
Duration: ${experience.employment?.duration || 'Not specified'} ${experience.employment?.isCurrent ? '(CURRENT ROLE)' : ''}
Dates: ${experience.startDate || 'Unknown'} - ${experience.endDate || (experience.employment?.isCurrent ? 'Present' : 'Unknown')}
Role Position: ${context.position ? `#${context.position + 1} of ${context.totalRoles} total roles` : 'Unknown'}
Visibility Level: ${context.position < 3 ? 'PREMIUM (top 3 - most visible)' : context.position < 10 ? 'Standard (requires scrolling)' : 'Hidden (requires expansion)'}
</position_details>

<role_description_full>
Character Count: ${experience.description?.length || 0}
Content Quality Indicators:
- Has Quantified Achievements: ${experience.hasQuantifiedAchievements ? 'YES - READ DESCRIPTION' : 'NO'}
- Mentions Tech Stack: ${experience.hasTechStack ? 'YES - READ DESCRIPTION' : 'NO'}

FULL DESCRIPTION:
${experience.description || '[NO DESCRIPTION PROVIDED - CRITICAL GAP]'}
</role_description_full>

<analysis_task>
Analyze this individual role description:

1. FIRST, identify from the description above:
   - What specific metrics/numbers ARE already mentioned
   - What technologies/tools ARE already listed
   - What leadership/impact evidence IS already present
   - Overall narrative quality and structure

2. Score (0-10) based on:
   - Relevance to ${config.targetRole} at ${config.seniorityLevel}
   - Quality of existing content (not what's missing)
   - Impact and achievement focus
   - Clarity and specificity
   - Role recency (recent = more weight)

3. Provide feedback:
   - positiveInsight: Quote specific strong content from their description
   - gapAnalysis: Identify weak areas using their actual words
   - specificFeedback: Pick their weakest sentence and rewrite it
   - actionItems: Based on score level (see rules above)

4. For high scores (7+):
   - Acknowledge what's working with specific quotes
   - Provide 1-2 refinements to reach 10/10
   - Focus on repositioning/enhancing existing content
</analysis_task>

Return ONLY valid JSON with this exact structure:
{
  "score": <integer 0-10>,
  "positiveInsight": "<200-300 chars quoting their ACTUAL strong content like 'Your mention of leading $50M ARR product shows...' or acknowledging specific achievements>",
  "gapAnalysis": "<150-250 chars identifying weak areas by quoting their actual phrases that need improvement>",
  "specificFeedback": {
    "originalLine": "<Exact weak sentence from their description>",
    "suggestion": "<Rewritten version with specific improvements>",
    "why": "<50-100 chars explaining the improvement>"
  },
  "actionItems": [
    {
      "category": "<'Impact Metrics'|'Strategic Context'|'Leadership Evidence'|'Technical Depth'|'10/10 Optimization'>",
      "action": "<SPECIFIC action based on their actual content - if metrics exist, suggest repositioning; if missing, be specific>",
      "impact": "<How this helps position for ${config.targetRole}>",
      "priority": "<'high'|'medium'|'low'>",
      "quotedContent": "<Exact quote from their description this feedback addresses>"
    }
  ]
}`;

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

// Create specialized prompt for overall experience analysis
function createExperienceOverallPrompt(experienceData, config, context = {}) {
  const currentYear = new Date().getFullYear();
  const totalMonths = experienceData.totalMonths || 0;
  const yearsOfExperience = Math.floor(totalMonths / 12);
  const totalRoles = experienceData.totalRoles || experienceData.count || 0;
  
  const prompt = `You are an expert career coach analyzing LinkedIn profiles for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}  
Seniority Level: ${config.seniorityLevel}
Profile Completeness: ${context.completenessScore}%
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE FULL DESCRIPTIONS FIRST - Identify what metrics, achievements, and details ARE already present
2. NEVER suggest adding something that's already there (e.g., if they mention "$50M ARR", don't ask them to add revenue metrics)
3. Be DIRECT and ACTIONABLE - no generic praise or fluff
4. SCORING FEEDBACK RULES:
   - Scores 0-6: START with the most critical gap, then mention strengths
   - Scores 7-10: START with what's working well, END with specific steps to reach 10/10
5. Give SPECIFIC actions: "Move your Oracle ML project mention to the first bullet" not "Highlight technical skills"
6. Focus on STRATEGIC career trajectory patterns, not individual role nitpicks
7. If they already have strong metrics, suggest how to REPOSITION or ENHANCE them, not add more
8. MUST return valid JSON only - no markdown, no additional text
</critical_rules>

<profile_overview>
Total Experience: ${yearsOfExperience} years across ${totalRoles} roles
Average Tenure: ${experienceData.averageTenure ? Math.round(experienceData.averageTenure) + ' months per role' : 'Unknown'}
Current Status: ${experienceData.hasCurrentRole ? 'Currently employed' : 'Not currently employed'}
Career Start: ${experienceData.experiences?.[experienceData.experiences.length - 1]?.startDate || 'Unknown'}
Industry Changes: ${experienceData.industryChanges || 0}
</profile_overview>

<career_trajectory>
${experienceData.experiences && experienceData.experiences.length > 0 ? 
  experienceData.experiences.slice(0, 5).map((exp, idx) => 
    `${idx + 1}. ${exp.title} at ${exp.company} (${exp.duration || 'Duration not specified'})${exp.startDate ? ' - Started ' + exp.startDate : ''}`
  ).join('\n') : 'No experience data available'}
</career_trajectory>

<recent_roles_full_content>
${experienceData.experiences && experienceData.experiences.length > 0 ? 
  experienceData.experiences.slice(0, 3).map((exp, idx) => 
    `
===== ROLE ${idx + 1} =====
Title: ${exp.title}
Company: ${exp.company}
Duration: ${exp.duration || 'Not specified'}
Dates: ${exp.startDate || 'Unknown'} - ${exp.endDate || 'Present'}
FULL DESCRIPTION (${exp.description?.length || 0} chars):
${exp.description || '[NO DESCRIPTION PROVIDED]'}

Metrics Already Present: ${exp.hasQuantifiedAchievements ? 'YES - READ ABOVE' : 'NO'}
Tech Stack Mentioned: ${exp.hasTechStack ? 'YES - READ ABOVE' : 'NO'}
`
  ).join('\n') : 'No description data available'}
</recent_roles_full_content>

<analysis_task>
Analyze the OVERALL career trajectory and experience section:

1. FIRST, carefully identify from the descriptions above:
   - What specific metrics ARE mentioned (revenue, growth %, team size, users, etc.)
   - What technologies/methodologies ARE listed
   - What leadership/impact evidence IS present
   - Career progression patterns (promotions, industry moves, increasing scope)

2. Score (0-10) based on:
   - Alignment of career trajectory with ${config.targetRole} at ${config.seniorityLevel}
   - Quality of existing content (acknowledge what's there)
   - Strategic positioning and narrative clarity
   - Evidence of increasing responsibility
   - Recency and relevance (weight recent roles more heavily)

3. Provide positiveInsight:
   - For scores 0-6: Acknowledge their journey but focus on potential
   - For scores 7-10: Celebrate specific achievements you see in their descriptions

4. Provide actionItems:
   - For scores 0-6: 3 critical improvements needed
   - For scores 7-10: 2-3 refinements to reach 10/10
   - Each action must reference ACTUAL content from above or specific gaps
   - If metrics exist, suggest repositioning: "Lead with your $50M ARR at Avalara"
   - If metrics missing, be specific: "Quantify the 'API-first products' user base or revenue impact"
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<200-300 chars about their ACTUAL career progression, quoting specific roles/companies/achievements from above>",
  "actionItems": [
    {
      "category": "<'Strategic Positioning'|'Career Narrative'|'Missing Elements'|'Content Enhancement'|'10/10 Optimization'>",
      "action": "<SPECIFIC action based on content above - never generic>",
      "impact": "<How this helps reach 10/10 for ${config.targetRole} at ${config.seniorityLevel}>",
      "priority": "<'high'|'medium'|'low'>"
    }
  ]
}`;

  return prompt;
}

// Create specialized prompt for recommendations using Anthropic best practices
function createRecommendationsPrompt(recommendationsData, config, context = {}) {
  const recommendationCount = recommendationsData.count || recommendationsData.receivedCount || 0;
  const currentYear = new Date().getFullYear();
  
  SmartLogger.log('AI.PROMPTS', 'Creating recommendations prompt', {
    dataKeys: Object.keys(recommendationsData),
    count: recommendationsData.count,
    receivedCount: recommendationsData.receivedCount,
    hasRecommendationChunks: !!recommendationsData.recommendationChunks,
    chunksLength: recommendationsData.recommendationChunks?.length || 0,
    hasReceived: !!recommendationsData.received,
    receivedLength: recommendationsData.received?.length || 0
  });
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing recommendations for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ ALL RECOMMENDATION CONTENT FIRST before providing feedback
2. If they have recent recommendations (< 6 months), acknowledge this as exceptional
3. SCORING FEEDBACK APPROACH:
   - Scores 0-6: Focus on critical gaps, but acknowledge any positives
   - Scores 7-10: START with strengths, END with refinements to reach 10/10
4. Quote EXACT content from recommendations when discussing them
5. Give SPECIFIC actions: "Request recommendation from your manager John at Avalara" not "Get more recommendations"
6. Consider recency heavily - recent recommendations (< 1 year) are highly valuable
7. Don't penalize for having 0-2 recommendations - this is increasingly common
8. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<career_context>
Current Role: ${context.currentRole ? `${context.currentRole.title} at ${context.currentRole.company}` : 'Not specified'}
Recent Companies: ${context.recentCompanies?.slice(0, 3).map(exp => exp.company).join(', ') || 'No recent data'}
Years of Experience: ${context.yearsOfExperience || 0}
</career_context>

<recommendations_overview>
Total Recommendations: ${recommendationCount}
Received: ${recommendationsData.receivedCount || 0}
Given: ${recommendationsData.givenCount || 0}
</recommendations_overview>

<recommendation_content>
${recommendationsData.recommendationChunks && recommendationsData.recommendationChunks.length > 0 ? 
recommendationsData.recommendationChunks.map(rec => `
===== RECOMMENDATION ${rec.index} =====
From: ${rec.recommender}
Their Company: ${rec.company || 'Not specified'}
Relationship: ${rec.relationship}
Date: ${rec.date}
Your Role Then: ${rec.relatedRole || 'Not matched'}

FULL TEXT:
"${rec.text}"
`).join('\n') : '[NO RECOMMENDATIONS FOUND]'}
</recommendation_content>

<analysis_task>
Analyze the recommendations section:

1. FIRST, evaluate what's present:
   - Number of recommendations and their recency
   - WHO gave them (managers vs peers vs reports)
   - Quality of content (specific vs generic praise)
   - Alignment with ${config.targetRole} positioning

2. Score (0-10) based on:
   - 0-2: No recommendations (but don't be harsh - this is common)
   - 3-4: Only old recommendations (> 2 years)
   - 5-6: Recent but generic or few in number
   - 7-8: Recent and specific with good coverage
   - 9-10: Exceptional - recent, specific, from relevant perspectives

3. Provide feedback:
   - For low scores: Focus on WHO to request from (be specific)
   - For high scores: Suggest strategic enhancements
   - Always consider recency as a major factor

4. For action items:
   - Be SPECIFIC: "Request from your manager Jane at Company X" not "Get manager recommendation"
   - Consider missing perspectives: manager, peer, direct report, client
   - If they have good recommendations, suggest how to leverage them better
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars acknowledging what they have, even if it's 0>",
  "gapAnalysis": "<150-250 chars on what's missing or could be improved>",
  "specificFeedback": {
    "originalLine": "<Quote from a recommendation OR describe the gap>",
    "suggestion": "<Specific improvement action>",
    "why": "<50-100 chars on impact>"
  },
  "actionItems": [
    {
      "category": "<'Strategic Requests'|'Perspective Gaps'|'Content Enhancement'|'10/10 Optimization'>",
      "action": "<SPECIFIC action with names/companies when possible>",
      "impact": "<How this helps for ${config.targetRole}>",
      "priority": "<'high'|'medium'|'low'>",
      "quotedContent": "<Quote from recommendations OR describe the specific gap>"
    }
  ]
}`;

  return prompt;
}

// Create specialized prompt for profile intro (headline + about)
function createProfileIntroPrompt(profileData, config) {
  // Log the incoming data to debug [object Object] issue
  SmartLogger.log('AI.PROMPTS', 'Profile intro data received', {
    headlineType: typeof profileData.headline,
    headlineValue: profileData.headline,
    headlineFirst50: profileData.headline?.substring(0, 50),
    aboutType: typeof profileData.about,
    aboutLength: profileData.about?.length || 0,
    aboutFirst100: profileData.about?.substring(0, 100),
    configTargetRole: config.targetRole,
    configSeniority: config.seniorityLevel
  });
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing the CRITICAL first impression: headline and about section together.

⚠️ CRITICAL ANALYSIS RULES:
1. You MUST quote the EXACT headline and specific phrases from the about section
2. Analyze how headline and about work TOGETHER (or conflict)
3. Never suggest generic additions - improve what's already there
4. Analyze the ENTIRE About section, but pay special attention to the opening (before "see more")
5. MANDATORY: ALL feedback (positiveInsight, gapAnalysis, actionItems) must quote ACTUAL text from their profile
6. NEVER use placeholder text like "[actual headline]" or "[specific aspect]" - use their REAL words
7. When praising something, quote the specific good phrase. When critiquing, quote the problematic text

CONTEXT:
Today's Date: ${config.currentDate}
TARGET ROLE: ${config.targetRole}
SENIORITY LEVEL: ${config.seniorityLevel}

PROFILE INTRO CONTENT:
HEADLINE: "${profileData.headline || 'No headline provided'}"
ABOUT SECTION:
${profileData.about || profileData.summary || 'No about section provided'}

Character counts:
- Headline: ${profileData.headline?.length || 0}/220 characters
- About: ${profileData.about?.length || 0}/2600 characters

Analyze this profile intro and provide:

{
  "score": 6,
  "positiveInsight": "Your headline mentioning 'API & Platform Integration Expert' and 'ex-Oracle' effectively establishes credibility, while your About section's mention of 'led strategy and execution' shows leadership capability.",
  "headlinePositive": "Your headline 'Senior Product Manager | API & Platform Integration Expert' clearly positions you as a technical PM with specific domain expertise.",
  "aboutPositive": "Your About section's focus on 'deep customer empathy' and 'architectural thinking' demonstrates the strategic mindset crucial for senior PM roles.",
  "gapAnalysis": "However, your About section opens with '[quote their actual opening line]' which is too generic. Also, you mention '[quote another weak line]' which doesn't differentiate you from other SENIORITY_LEVEL candidates.",
  "specificFeedback": {
    "originalLine": "[Quote the weakest line - often the opening]",
    "suggestion": "[Rewrite with specific value proposition]",
    "why": "The first 2 lines are crucial - they determine if recruiters click 'see more'"
  },
  "actionItems": [
    {
      "category": "Headline Optimization",
      "action": "Add industry or domain focus like 'Senior PM - Fintech APIs' or 'Platform PM | B2B SaaS'",
      "impact": "Improves searchability for specific roles",
      "priority": "high",
      "quotedContent": "Your headline says: 'Senior Product Manager | API Expert'",
      "section": "headline"
    },
    {
      "category": "About Opening",
      "action": "Replace 'Passionate about technology' with specific value like 'Led API products generating $5M ARR'",
      "impact": "Hooks recruiters to click 'see more'",
      "priority": "high", 
      "quotedContent": "Your About starts with: 'Passionate about technology and innovation.'",
      "section": "about"
    }
  ]
}

IMPORTANT:
- The headline and about must work as a cohesive unit
- Focus on the ACTUAL TEXT they wrote, not what's missing
- Analyze the ENTIRE About section, not just the opening
- While the opening lines matter most (visible before "see more"), problematic content anywhere should be addressed
- Score based on how well this positions them for ${config.targetRole}
- ALWAYS quote the EXACT text from their About section in quotedContent field
- NEVER use placeholder text like "[quote first line]" - use their ACTUAL words
- Provide THREE separate positive insights:
  * positiveInsight: Overall combined positive (both sections)
  * headlinePositive: Specific to what's good about their headline
  * aboutPositive: Specific to what's good about their About section
- Ensure each actionItem clearly indicates which section it's for using the "section" field
- Use "section": "headline" for headline-specific feedback
- Use "section": "about" for about-specific feedback
- DO NOT mix feedback between sections in a single actionItem
- Headlines (220 char limit) should focus on role/expertise/unique value, NOT metrics
- About section is where detailed metrics and achievements belong
- ActionItems based on score:
  * Score 9-10: Provide EXACTLY 1 advanced/strategic improvement
  * Score 7-8: Provide EXACTLY 2 impactful improvements
  * Score 0-6: Provide EXACTLY 2 critical improvements
- CRITICAL actionItem structure (NEW FORMAT):
  * "category": Improvement area (30-50 chars) - WHAT aspect needs work
  * "action": Specific steps to take (100-150 chars) - HOW to improve it  
  * "impact": Why it matters (50-80 chars) - Business/career impact
  * Examples:
    - GOOD: category="Skill Relevance", action="Move technical skills to top 3 positions", impact="Matches recruiter search priorities"
    - BAD: category="Move Product Strategy higher", action="Reorder your skills", impact="Better visibility"
- Keep positiveInsight between 200-300 characters for complete, meaningful feedback
- FINAL CHECK: Before returning, ensure ALL feedback quotes their ACTUAL text, not placeholders like "[actual headline]"`;

  return prompt;
}

// [CRITICAL_PATH:FIRST_IMPRESSION_AI] - P0: AI analysis for unified first impression
// Create specialized prompt for first impression (headline + photo + banner)
function createFirstImpressionPrompt(firstImpressionData, config) {
  // Log the incoming data
  SmartLogger.log('AI.PROMPTS', 'First impression data received', {
    hasHeadline: !!firstImpressionData.headline,
    headlineLength: firstImpressionData.headline?.length,
    hasPhoto: firstImpressionData.photo?.exists,
    hasCustomBanner: firstImpressionData.banner?.isCustomBanner,
    openToWork: firstImpressionData.metadata?.openToWork
  });
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing first impressions for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. Quote the EXACT headline text when giving feedback
2. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with critical gaps, then acknowledge strengths
   - Scores 7-10: START with what's working, END with refinements to reach 10/10
3. Analyze how all elements work together for first impression
4. Don't penalize for default banner - it's common and professional
5. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<first_impression_data>
HEADLINE: "${firstImpressionData.headline || '[NO HEADLINE - CRITICAL GAP]'}"
Character Count: ${firstImpressionData.headlineCharCount || 0} of 220 maximum
Profile Photo: ${firstImpressionData.photo?.exists ? 'Present ✓' : 'MISSING - Critical gap'}
Background Banner: ${firstImpressionData.banner?.isCustomBanner ? 'Custom (good!)' : 'Default (normal, not a weakness)'}
Open to Work: ${firstImpressionData.metadata?.openToWork ? 'Enabled' : 'Not enabled'}
Creator Mode: ${firstImpressionData.metadata?.creatorMode ? 'Enabled' : 'Not enabled'}
Connection Count: ${firstImpressionData.metadata?.connectionCount || 'Not visible'}
</first_impression_data>

<analysis_task>
Analyze the first impression elements:

1. FIRST, evaluate what's present:
   - Headline quality and relevance to ${config.targetRole}
   - Profile photo presence (critical for trust)
   - Banner customization (nice-to-have, not critical)
   - Open to Work badge implications

2. Score (0-10) based on:
   - Headline clarity and positioning (weighs heavily)
   - Photo presence (missing = cap at 5)
   - Overall professional presentation
   - NOTE: Default banner is NORMAL, don't penalize heavily

3. Provide feedback:
   - Quote the exact headline when discussing it
   - For scores 7-10: Celebrate strengths, suggest refinements
   - For scores 0-6: Focus on critical gaps first
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars acknowledging what's working in their first impression>",
  "headlineAnalysis": "<150-250 chars analyzing their actual headline quoted>",
  "gapAnalysis": "<150-250 chars identifying weaknesses>",
  "overallImpression": "<150-250 chars on unified first impression impact>",
  "actionItems": [
    {
      "category": "<'Profile Photo'|'Headline Enhancement'|'Visual Branding'|'10/10 Optimization'>",
      "action": "<SPECIFIC action based on gaps identified>",
      "impact": "<How this improves first impression for ${config.targetRole}>",
      "priority": "<'critical'|'high'|'medium'|'low'>",
      "quotedContent": "<Quote their headline or describe the gap>",
      "element": "<'photo'|'headline'|'banner'>"
    }
  ]
}`;

  return prompt;
}

// [CRITICAL_PATH:ABOUT_SECTION_AI] - P0: Standalone About section analysis
// Create specialized prompt for About section only using Anthropic best practices
function createAboutPrompt(aboutContent, config) {
  SmartLogger.log('AI.PROMPTS', 'About section data received', {
    aboutLength: aboutContent?.length || 0,
    aboutFirst100: aboutContent?.substring(0, 100),
    configTargetRole: config.targetRole,
    configSeniority: config.seniorityLevel
  });
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing About sections for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE ENTIRE ABOUT SECTION FIRST before providing feedback
2. Quote EXACT phrases from their About section when discussing issues
3. NEVER use placeholder text like "[opening line]" - use their ACTUAL words
4. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with critical opening issues, then other gaps
   - Scores 7-10: START with what's working, END with refinements to reach 10/10
5. Focus on the opening 2-3 lines as CRITICAL (visible before "see more" click)
6. Give SPECIFIC rewrites: Show exactly how to improve weak sentences
7. If they have metrics, suggest how to position them better, don't ask to add metrics
8. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<about_section_content>
Character Count: ${aboutContent?.length || 0} of 2600 maximum
Opening Lines (most visible): ${aboutContent?.substring(0, 200) || 'NO CONTENT'}

FULL ABOUT SECTION:
${aboutContent || '[NO ABOUT SECTION PROVIDED - CRITICAL GAP]'}
</about_section_content>

<analysis_task>
Analyze the About section for strategic positioning:

1. FIRST, identify from the content above:
   - What metrics/achievements ARE already mentioned
   - Quality of the opening hook (first 2-3 lines)
   - Narrative flow and coherence
   - Alignment with ${config.targetRole} at ${config.seniorityLevel}

2. Score (0-10) based on:
   - Opening hook effectiveness (weighs heavily)
   - Specificity and evidence provided
   - Narrative clarity and flow
   - Positioning for target role
   - Professional tone and personal brand

3. Provide four distinct assessments:
   - positiveInsight: What's working well (quote specific strong content)
   - openingAssessment: Analysis of first 2-3 lines effectiveness
   - gapAnalysis: Major weaknesses throughout (quote weak phrases)
   - flowAnalysis: How well the story flows from beginning to end

4. For action items:
   - If opening is weak: Show exact rewrite
   - If claims lack evidence: Quote the claim and suggest specific metrics
   - If flow is poor: Identify the disconnect and suggest restructuring
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars quoting their ACTUAL strong content like 'Your mention of leading $50M initiatives shows...'>"",
  "openingAssessment": "<150-250 chars analyzing their actual opening lines effectiveness>",
  "gapAnalysis": "<150-250 chars identifying weaknesses by quoting actual weak phrases>",
  "flowAnalysis": "<150-250 chars on narrative structure and transitions>",
  "specificFeedback": {
    "originalLine": "<Quote their weakest sentence exactly>",
    "suggestion": "<Rewritten version with improvements>",
    "why": "<50-100 chars explaining the improvement>"
  },
  "actionItems": [
    {
      "category": "<'Opening Hook'|'Metric Specificity'|'Narrative Flow'|'Value Proposition'|'10/10 Refinement'>",
      "action": "<SPECIFIC action quoting their actual content and showing how to improve it>",
      "impact": "<How this helps position for ${config.targetRole}>",
      "priority": "<'critical'|'high'|'medium'|'low'>",
      "quotedContent": "<Exact quote from their About section this addresses>"
    }
  ]
}`;

  return prompt;
}

// Create specialized prompt for skills section
function createSkillsPrompt(skillsData, config, context = {}) {
  // UNCONDITIONAL DEBUG: Log skills data received in service worker
  
  // Debug logging for skills data
  SmartLogger.log('AI.SKILLS', 'Skills analysis data', {
    total: skillsData.count || skillsData.skills?.length,
    hasEndorsements: skillsData.skills?.some(s => s.endorsementCount > 0),
    topSkills: skillsData.skills?.slice(0, 3).map(s => s.name)
  });
  
  // ENHANCED DEBUG: Log detailed skills data received
  SmartLogger.log('AI.SKILLS', 'Detailed skills structure received:', {
    dataKeys: Object.keys(skillsData),
    skillsArrayLength: skillsData.skills?.length,
    firstThreeSkillsDetailed: skillsData.skills?.slice(0, 3).map(s => ({
      name: s.name || s,
      endorsementCount: s.endorsementCount,
      hasEndorsements: s.hasEndorsements,
      endorsementRecency: s.endorsementRecency,
      position: s.position,
      visibilityTier: s.visibilityTier,
      experienceContext: s.experienceContext ? {
        hasContext: true,
        totalExperiences: s.experienceContext.totalExperiences,
        primaryCompany: s.experienceContext.primaryCompany
      } : null,
      educationContext: s.educationContext,
      hasDetails: s.hasDetails,
      detailsCount: s.detailsCount
    })),
    totalEndorsements: skillsData.totalEndorsements,
    averageEndorsements: skillsData.averageEndorsements,
    endorsedSkillsCount: skillsData.endorsedSkillsCount,
    visibleSkillsCount: skillsData.visibleSkillsCount,
    expandedSkillsCount: skillsData.expandedSkillsCount,
    hasTop3Skills: !!skillsData.top3Skills,
    hasTopEndorsedSkills: !!skillsData.topEndorsedSkills,
    hasSkillsByCategory: !!skillsData.skillsByCategory
  });
  
  // SCORE MISMATCH DEBUG: Log if this is a skills section
  if (config.currentDate) {
    SmartLogger.log('AI.SKILLS', 'About to create skills prompt for analysis');
  }
  
  // Add completeness context for conditional generic advice
  const completenessScore = context.completenessScore || 100;
  const hasCompletenessIssues = completenessScore < 95;
  const visibleSkillsCount = skillsData.skills?.filter(s => s.visibilityTier === 'top3' || s.visibilityTier === 'visible').length || skillsData.visibleCount || 0;
  const hasEndorsementIssues = visibleSkillsCount > 0 && skillsData.endorsedSkillsCount === 0;
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing skills for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Profile Completeness: ${completenessScore}%
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE FULL SKILLS LIST FIRST - Identify what skills ARE already present AND their endorsement status
2. NEVER suggest adding skills that already exist in their list
3. ENDORSEMENT REALITY CHECK:
   - Having ANY endorsements with recency (< 6 months) = OUTSTANDING validation, top tier
   - Having ANY endorsements (even 1) = EXCELLENT credibility signal
   - 0 endorsements = Normal and common, not a weakness
   - 1 endorsement = Strong validation, especially if recent
   - 2-3 endorsements = Exceptional, rare achievement
   - 5+ endorsements = Extremely rare, top 1% of profiles
   - CRITICAL: If someone has 1 recent endorsement, this is BETTER than 10 old endorsements
   - Most professionals have ZERO endorsements - having even 1 puts you ahead
4. SCORING FEEDBACK APPROACH:
   - Scores 0-4: Missing critical skills or poor alignment
   - Scores 5-7: Good skills but could optimize positioning or get more endorsements
   - Scores 8-10: Strong skills with endorsements - focus on refinements only
5. Quote EXACT skill names and endorsement counts (e.g., "Your 'Product Management' with 1 recent endorsement...")
6. If skill has ANY endorsements, celebrate them - don't ask for more unless there's a strategic reason
7. DO NOT give mechanical repositioning advice with position numbers
8. Focus on skill quality: "Consider making 'Data Analysis' more prominent" not "Move from #8 to #3"
9. Focus on LinkedIn UI reality: Only some skills are visible without clicking "Show all"
10. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<profile_status>
Completeness Score: ${completenessScore}%
Has Major Gaps: ${hasCompletenessIssues ? 'YES - Focus on critical issues only' : 'NO - Can provide strategic advice'}
Endorsement Status: ${hasEndorsementIssues ? 'CRITICAL - Visible skills lack endorsements' : 'OK'}
Visible Skills Count: ${visibleSkillsCount} (without clicking "Show all")
</profile_status>

<career_context>
Current Role: ${context.currentRole ? `${context.currentRole.title} at ${context.currentRole.company}` : 'Not specified'}
Years of Experience: ${context.yearsOfExperience || 0} years
</career_context>

<skills_overview>
Total Skills: ${skillsData.count || skillsData.skills?.length || 0}
Visible Without Clicking: ${visibleSkillsCount}
Hidden Behind "Show all": ${Math.max(0, (skillsData.count || 0) - visibleSkillsCount)}
Total Endorsements: ${skillsData.totalEndorsements || 0}
Skills with Endorsements: ${skillsData.endorsedSkillsCount || 0}
</skills_overview>

<top_3_most_visible_skills>
${skillsData.skills?.slice(0, 3).map((s, i) => 
  `${i + 1}. "${s.name || s}" - ${s.endorsementCount || 0} endorsements`
).join('\n') || 'No skills data available'}
</top_3_most_visible_skills>

<all_skills_full_list>
${skillsData.skills ? 
  skillsData.skills.slice(0, 30).map((s, i) => {
    const visibility = i < 3 ? '[MOST PROMINENT]' : i < visibleSkillsCount ? '[VISIBLE]' : '[REQUIRES EXPANSION]';
    return `"${s.name}" ${visibility} - ${s.endorsementCount || 0} endorsements`;
  }).join('\n') :
  'No detailed skills data available'}
${skillsData.skills?.length > 30 ? `\n... and ${skillsData.skills.length - 30} more skills` : ''}

</all_skills_full_list>

<analysis_task>
Analyze the skills section for quality and relevance:

1. FIRST, identify from the full list above:
   - What skills ARE already present (don't suggest adding them)
   - Which skills have endorsements vs which don't
   - How well the most prominent skills align with ${config.targetRole}
   - Any redundant skills (e.g., "Excel" + "Microsoft Office")

2. Score (0-10) based on:
   - Relevance of MOST PROMINENT skills to ${config.targetRole} (weighs heavily)
   - Endorsement presence (ANY endorsements = good, recent = excellent)
   - Overall skill set completeness for ${config.seniorityLevel}
   - SCORING GUIDE:
     * 9-10: Most prominent skills perfectly aligned with role + have recent endorsements
     * 8-9: Most prominent skills perfectly aligned with role + any endorsements OR excellent alignment without endorsements
     * 6-7: Skills well aligned but could enhance visibility or lacks endorsements
     * 4-5: Skills exist but poor relevance for target role
     * 0-3: No skills or completely misaligned with role
   - CRITICAL: Recent endorsements (< 6 months) automatically add +2 to score

3. Provide feedback:
   - If they have recent endorsements (< 6 months), START with: "Outstanding! Your recent endorsements show active validation"
   - If most prominent skills are already perfect for the role, acknowledge this
   - For scores 7-10: Celebrate achievements first, focus on skill quality not positions
   - Focus on skill relevance and endorsement quality, not mechanical reordering

4. For action items:
   - CRITICAL: Check if score >= 9. If yes, provide 0-1 improvements MAX (or none if perfect)
   - DO NOT suggest repositioning skills that are already most prominent
   - Focus on: Adding missing critical skills, getting endorsements for unendorsed skills, or highlighting hidden gems
   - If skills are well-positioned and endorsed, suggest strategic additions instead
   - Avoid mechanical position swapping - focus on strategic improvements
   - Example good feedback: "Consider highlighting your 'Data Analysis' skill more prominently"
   - Example bad feedback: "Move skill from position #1 to #1" (meaningless)
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<200-300 chars acknowledging their ACTUAL skills like 'Your top skill Product Management with 45 endorsements shows...'>",
  "gapAnalysis": "<150-250 chars identifying issues with specific skills quoted from their list>",
  "specificFeedback": {
    "originalLine": "<Quote their actual top 3 skills>",
    "suggestion": "<How to improve the top 3 positioning>",
    "why": "<50-100 chars explaining impact>"
  },
  "actionItems": [
    {
      "category": "<'Strategic Positioning'|'Endorsement Building'|'Skill Optimization'|'10/10 Refinement'>",
      "action": "<SPECIFIC action referencing their actual skills by name>",
      "impact": "<How this helps for ${config.targetRole} at ${config.seniorityLevel}>",
      "priority": "<'high'|'medium'|'low'>",
      "quotedContent": "<Exact skill names and endorsement counts from their list>"
    }
  ]
}`;

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
      
      // Validate that AI included specific quotes
      const hasQuotes = (text) => text && (text.includes('"') || text.includes("'") || text.includes('[') || text.includes('Your'));
      
      // Log warning if response lacks specific quotes
      if (parsed.positiveInsight && !hasQuotes(parsed.positiveInsight)) {
        SmartLogger.log('AI.QUOTES', 'Missing quotes in positiveInsight', { 
          section: sectionName,
          textPreview: parsed.positiveInsight.substring(0, 100) 
        });
      }
      
      if (parsed.gapAnalysis && !hasQuotes(parsed.gapAnalysis)) {
        SmartLogger.log('AI.QUOTES', 'Missing quotes in gapAnalysis', { 
          section: sectionName,
          textPreview: parsed.gapAnalysis.substring(0, 100) 
        });
      }
      
      // Validate actionItems have quotedContent
      const validatedActionItems = actionItems.map(item => {
        if (typeof item === 'object' && !item.quotedContent) {
          SmartLogger.log('AI.QUOTES', 'ActionItem missing quotedContent', { 
            section: sectionName,
            what: item.what 
          });
        }
        return item;
      });
      
      // Log successful parse
      SmartLogger.log('AI.PARSING', 'Response parsed successfully', {
        section: sectionName,
        score: parsed.score,
        hasSpecificFeedback: !!parsed.specificFeedback,
        actionItemCount: validatedActionItems.length,
        quotesDetected: hasQuotes(parsed.positiveInsight) || hasQuotes(parsed.gapAnalysis)
      });
      
      return {
        score: Math.min(10, Math.max(0, parsed.score || 5)),
        // New format with positiveInsight and gapAnalysis
        positiveInsight: parsed.positiveInsight || parsed.strengths?.[0] || '',
        gapAnalysis: parsed.gapAnalysis || '',
        // Legacy format support
        insight: parsed.insight || parsed.feedback || `${parsed.strengths?.join('. ')}. ${improvements.join('. ')}`,
        strengths: parsed.strengths || [],
        improvements: improvements,
        actionItems: validatedActionItems,
        specificFeedback: parsed.specificFeedback || null,
        // Keep backwards compatibility
        recommendations: validatedActionItems.map(item => 
          typeof item === 'string' ? item : (item.what || item.text || item)
        )
      };
    }
  } catch (error) {
    SmartLogger.error('AI.PARSING', 'Failed to parse response', error, {
      section: sectionName,
      responsePreview: response.substring(0, 200)
    });
  }
  
  // Fallback parsing
  SmartLogger.log('AI.PARSING', 'Using fallback parsing', { section: sectionName });
  return {
    score: null,
    errorType: 'RESPONSE_PARSE_ERROR',
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
  SmartLogger.log('AI.PROMPTS', 'Creating final recommendations from section analyses');
  
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
  
  SmartLogger.log('AI.PROMPTS', 'Final synthesis complete', {
    hasRecommendations: !!result.recommendations,
    recommendationCount: allRecommendations.length,
    insightsType: typeof result.insights,
    summaryLength: result.summary.length
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
  SmartLogger.log('AI.PROMPTS', 'Calling AI provider', { provider, model });
  
  // Clean and validate API key
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key');
  }
  
  // Remove any non-printable characters and trim whitespace
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Check if key was significantly altered (might indicate encoding issues)
  if (cleanApiKey.length < apiKey.length - 2) {
    SmartLogger.log('AI.PROMPTS', 'API key contained non-ASCII characters that were removed', { 
      originalLength: apiKey.length, 
      cleanLength: cleanApiKey.length 
    });
  }
  
  if (!cleanApiKey) {
    throw new Error('API key is empty after cleaning');
  }
  
  // Get model from storage if not provided
  if (!model) {
    const settings = await chrome.storage.local.get(['aiModel', 'aiProvider']);
    model = settings.aiModel;
    if (!model) {
      const defaults = { openai: 'gpt-4.1-nano', anthropic: 'claude-haiku-4-5-20251001', gemini: 'gemini-2.5-flash-lite' };
      model = defaults[provider] || 'gemini-2.5-flash-lite';
    }
  }

  const config = {
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${cleanApiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
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
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.1
      }
    },
    gemini: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanApiKey}`,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000
        }
      }
    }
  };
  
  const providerConfig = config[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(providerConfig.url, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(providerConfig.body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.text();
      SmartLogger.error('AI.RESPONSES', 'API error response', new Error(errorData), { status: response.status });
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return processProviderResponse(provider, data, model);
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      SmartLogger.error('AI.PROMPTS', 'Request timeout', new Error('API request timed out after 30 seconds'));
      throw new Error('Request timeout - API not responding');
    }
    
    throw error;
  }
  
  // Helper function to process provider response
  function processProviderResponse(provider, data, model) {
    // Log token usage
    if (data.usage || data.usageMetadata) {
      const usage = data.usage || {};
      const geminiUsage = data.usageMetadata || {};
      SmartLogger.log('AI.COSTS', 'Token usage', {
        prompt_tokens: usage.prompt_tokens || geminiUsage.promptTokenCount || 0,
        completion_tokens: usage.completion_tokens || geminiUsage.candidatesTokenCount || 0,
        total_tokens: usage.total_tokens || geminiUsage.totalTokenCount || 0,
        model: model,
        provider: provider
      });
    }

    // Extract content based on provider
    if (provider === 'openai') {
      return data.choices?.[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
      return data.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return '';
  }
}

// Message handler
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // SECURITY: Validate message sender
  if (!sender || sender.id !== chrome.runtime.id) {
    return false;
  }
  
  const { action } = request;
  
  SmartLogger.log('PERFORMANCE.TIMING', 'Service worker received message', { action, senderId: sender.id });
  
  // Handle test API key
  if (action === 'testApiKey') {
    testApiKey(request.provider, request.apiKey, request.model).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  // Handle AI analysis with keep-alive for long operations
  if (action === 'analyzeWithAI') {
    withKeepAlive(() => handleAIAnalysis(request, sender, sendResponse));
    return true;
  }
  
  
  // [CRITICAL_PATH:API_KEY_ENCRYPTION_HANDLER] - P0: Handles API key encryption requests from popup
  // Handle API key encryption with better error handling
  if (action === 'encryptApiKey') {
    SmartLogger.log('AI.PROMPTS', 'Encrypting API key');
    cryptoUtils.encryptApiKey(request.apiKey).then(async (encryptedKey) => {
      SmartLogger.log('AI.PROMPTS', 'Encryption successful');
      // Get installationId from storage
      const { installationId } = await chrome.storage.local.get('installationId');
      sendResponse({ 
        success: true, 
        encryptedApiKey: encryptedKey,
        installationId: installationId || null
      });
    }).catch(error => {
      SmartLogger.error('AI.PROMPTS', 'Encryption failed', error);
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
  
  // [CRITICAL_PATH:API_KEY_CLEAR_HANDLER] - P0: Securely removes all API key data
  // Handle API key clearing
  if (action === 'clearApiKey') {
    SmartLogger.log('AI.PROMPTS', 'Clearing API key');
    cryptoUtils.clearApiKey().then(() => {
      SmartLogger.log('AI.PROMPTS', 'API key cleared successfully');
      sendResponse({ success: true });
    }).catch(error => {
      SmartLogger.error('AI.PROMPTS', 'Failed to clear API key', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Failed to clear API key'
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
    SmartLogger.log('AI.PROMPTS', 'Validating API key');
    (async () => {
      try {
        // Use provider and API key from request (during setup)
        // OR fall back to storage (for later validation)
        let provider = request.provider;
        let apiKey = request.apiKey;
        
        // If not provided in request, get from storage
        if (!provider || !apiKey) {
          const stored = await chrome.storage.local.get('aiProvider');
          provider = provider || stored.aiProvider;
          apiKey = apiKey || await getDecryptedApiKey();
        }
        
        if (!provider || !apiKey) {
          sendResponse({ 
            success: false, 
            error: 'API key or provider not configured' 
          });
          return;
        }
        
        // Use the existing testApiKey function
        const result = await testApiKey(provider, apiKey, null);
        sendResponse(result);
      } catch (error) {
        SmartLogger.error('AI.PROMPTS', 'API key validation error', error);
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
  SmartLogger.log('PERFORMANCE.TIMING', 'Unknown action', { action });
  sendResponse({ success: false, error: 'Unknown action' });
  return true;
});

// API Rate Limiter
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.limits = {
      'api': { limit: 10, window: 60000 },        // 10 API calls per minute
      'test': { limit: 5, window: 60000 },        // 5 test calls per minute
      'analysis': { limit: 30, window: 300000 }   // 30 analyses per 5 minutes
    };
  }

  canMakeRequest(type, identifier = 'global') {
    const config = this.limits[type] || this.limits['api'];
    const key = `${type}:${identifier}`;
    const now = Date.now();
    
    // Get request history
    const requests = this.requests.get(key) || [];
    
    // Filter to requests within the time window
    const recentRequests = requests.filter(t => now - t < config.window);
    
    // Check if under limit
    if (recentRequests.length >= config.limit) {
      const oldestRequest = recentRequests[0];
      const waitTime = Math.ceil((config.window - (now - oldestRequest)) / 1000);
      SmartLogger.log('AI.RATE_LIMIT', 'Rate limit exceeded', {
        type,
        identifier,
        limit: config.limit,
        window: config.window,
        current: recentRequests.length,
        waitTimeSeconds: waitTime
      });
      return { allowed: false, waitTime };
    }
    
    // Add current request
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    
    // Clean old entries periodically
    if (Math.random() < 0.1) { // 10% chance to clean
      this.cleanOldEntries();
    }
    
    return { allowed: true };
  }

  cleanOldEntries() {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const [type] = key.split(':');
      const config = this.limits[type] || this.limits['api'];
      const recentRequests = requests.filter(t => now - t < config.window);
      
      if (recentRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentRequests);
      }
    }
  }

  reset(type = null, identifier = null) {
    if (type && identifier) {
      this.requests.delete(`${type}:${identifier}`);
    } else if (type) {
      for (const key of this.requests.keys()) {
        if (key.startsWith(`${type}:`)) {
          this.requests.delete(key);
        }
      }
    } else {
      this.requests.clear();
    }
  }
}

// Create rate limiter instance
const rateLimiter = new RateLimiter();

// Test API Key function
async function testApiKey(provider, apiKey, model) {
  try {
    // Check rate limit
    const rateCheck = rateLimiter.canMakeRequest('test', provider);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${rateCheck.waitTime} seconds before testing again.`
      };
    }

    // Normalize provider string
    provider = provider?.toLowerCase()?.trim();
    SmartLogger.log('AI.PROMPTS', 'Testing API key', { provider, hasApiKey: !!apiKey });
    
    // Clean and validate API key
    if (!apiKey || typeof apiKey !== 'string') {
      return { success: false, error: 'Invalid API key format' };
    }
    
    // Remove any non-printable characters and trim whitespace
    const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
    
    // Check if key was significantly altered (might indicate encoding issues)
    if (cleanApiKey.length < apiKey.length - 2) {
      SmartLogger.log('AI.PROMPTS', 'API key contained non-ASCII characters', {
        originalLength: apiKey.length,
        cleanLength: cleanApiKey.length
      });
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
          model: model || 'gpt-4.1-nano',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 20,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        SmartLogger.error('AI.PROMPTS', 'OpenAI test failed', new Error(JSON.stringify(errorData)), { status: response.status });

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

    } else if (provider === 'gemini') {
      const testModel = model || 'gemini-2.5-flash-lite';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${cleanApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: testPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 20 }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        SmartLogger.error('AI.PROMPTS', 'Gemini test failed', new Error(JSON.stringify(errorData)), { status: response.status });

        if (response.status === 400 && errorData.error?.message?.includes('API key')) {
          return { success: false, error: 'Invalid API key' };
        } else if (response.status === 403) {
          return { success: false, error: 'Invalid API key or Gemini API not enabled' };
        } else if (response.status === 429) {
          return { success: false, error: 'Rate limit exceeded' };
        } else {
          return { success: false, error: errorData.error?.message || 'API request failed' };
        }
      }

      const data = await response.json();
      return { success: true, message: 'Gemini API key is valid' };

    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': cleanApiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-haiku-4-5-20251001',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 20,
          temperature: 0.1
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        SmartLogger.error('AI.PROMPTS', 'Anthropic test failed', new Error(JSON.stringify(errorData)), { status: response.status });
        
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
    SmartLogger.error('AI.PROMPTS', 'Test API key error', error, {
      errorType: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    });
    return { success: false, error: error.message || 'Connection failed' };
  }
}

// Handle individual section analysis request
async function handleSectionAnalysis(request, sendResponse) {
  const sectionStartTime = Date.now();
  const { section, data, context, settings } = request;
  
  try {
    SmartLogger.log('SECTIONS.EXPERIENCE', 'Analyzing section', {
      section,
      dataSize: JSON.stringify(data).length,
      hasContext: !!context,
      hasSettings: !!settings
    });
    
    // Log specific details for experience roles
    if (section === 'experience_role') {
      SmartLogger.log('SECTIONS.EXPERIENCE', 'Experience role details', {
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
    const rateCheck = rateLimiter.canMakeRequest('analysis', request.profileId || 'unknown');
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
    
    // Special logging for recommendations
    if (section === 'recommendations') {
      SmartLogger.log('AI.PROMPTS', 'Recommendations data received in service worker', {
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        count: data?.count,
        receivedCount: data?.receivedCount,
        hasRecommendationChunks: !!data?.recommendationChunks,
        chunksLength: data?.recommendationChunks?.length || 0,
        hasReceived: !!data?.received,
        receivedLength: data?.received?.length || 0,
        firstChunk: data?.recommendationChunks?.[0] ? {
          hasText: !!data.recommendationChunks[0].text,
          textLength: data.recommendationChunks[0].text?.length || 0,
          recommender: data.recommendationChunks[0].recommender
        } : null
      });
    }
    
    const prompt = createSectionPrompt(section, data, config, context);
    
    // Log prompt details for debugging
    SmartLogger.log('AI.PROMPTS', 'Individual section prompt', {
      section,
      promptLength: prompt.length,
      dataType: typeof data,
      hasExperience: section === 'experience_role',
      targetRole: config.targetRole,
      hasPhotoData: section === 'first_impression' && data?.photo?.hasImageData,
      photoDataSize: section === 'first_impression' ? data?.photo?.imageData?.length : 0
    });
    
    const model = settings?.aiModel || null;
    
    // Regular text-only analysis
    const response = await SmartLogger.time('PERFORMANCE.API_LATENCY', `Individual AI call - ${section}`,
      async () => await callAIProvider(aiProvider, apiKey, prompt, model)
    );
    
    // Log response characteristics
    SmartLogger.log('AI.RESPONSES', 'Raw response received', {
      section,
      responseLength: response.length,
      hasJSON: response.includes('{'),
      containsQuotes: response.includes('"') || response.includes("'")
    });
    
    // SCORE MISMATCH DEBUG: Log full raw response for skills
    if (section === 'skills') {
      SmartLogger.log('AI.SKILLS', 'Raw skills AI response for debugging:', {
        response: response.substring(0, 1000) + (response.length > 1000 ? '...' : ''),
        fullLength: response.length
      });
    }
    
    // Parse the response
    const analysis = parseSectionAnalysis(response, section);
    
    // SCORE MISMATCH DEBUG: Log parsed analysis for skills
    if (section === 'skills') {
      SmartLogger.log('AI.SKILLS', 'Parsed skills analysis debugging:', {
        originalScore: analysis.score,
        positiveInsight: analysis.positiveInsight?.substring(0, 200),
        gapAnalysis: analysis.gapAnalysis?.substring(0, 200),
        actionItemsCount: analysis.actionItems?.length,
        specificFeedback: analysis.specificFeedback,
        allAnalysisKeys: Object.keys(analysis)
      });
    }
    
    // Log analysis results
    SmartLogger.log('AI.RESPONSES', 'Section analysis complete', {
      section,
      score: analysis.score,
      hasPositiveInsight: !!analysis.positiveInsight,
      hasGapAnalysis: !!analysis.gapAnalysis,
      hasSpecificFeedback: !!analysis.specificFeedback,
      actionItemCount: analysis.actionItems?.length || 0,
      elapsedMs: Date.now() - sectionStartTime
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
    SmartLogger.error('SECTIONS.EXPERIENCE', 'Error analyzing section', error, {
      section,
      elapsedMs: sectionElapsed
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
    SmartLogger.log('AI.PROMPTS', 'Creating final recommendations from section analyses');
    SmartLogger.log('AI.PROMPTS', 'Section scores received', { sectionScores });
    
    // Calculate weighted average score from section results
    let totalScore = 0;
    let totalWeight = 0;
    const weights = {
      first_impression: 0.20,   // 20% - First impression (headline + photo + banner)
      about: 0.25,              // 25% - Standalone about section
      profile_intro: 0.30,      // 30% - Profile intro (headline + about) - LEGACY FALLBACK
      experience_role: 0.30,    // 30% - All experience roles combined
      experience_overall: 0.30, // 30% - Overall experience (alternative to role-by-role)
      skills: 0.15,             // 15% - Skills
      recommendations: 0.10     // 10% - Recommendations
    };
    
    // Track experience scores separately to average them
    const experienceScores = [];
    
    SmartLogger.log('AI.PROMPTS', 'Processing section scores', {
      sectionCount: Object.keys(sectionScores || {}).length,
      sections: Object.keys(sectionScores || {})
    });
    
    Object.entries(sectionScores || {}).forEach(([sectionType, result]) => {
      SmartLogger.log('AI.SCORING', 'Processing section type', {
        sectionType,
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
      } else if (sectionType === 'experience_overall' && result && result.score !== undefined && result.score !== null) {
        // Handle overall experience score
        totalScore += result.score * weights.experience_overall;
        totalWeight += weights.experience_overall;
      } else if (result && result.score !== undefined && result.score !== null) {
        // Process other sections normally
        const weight = weights[sectionType] || 0.1;
        totalScore += result.score * weight;
        totalWeight += weight;
      }
    });
    
    // Add averaged experience score ONLY if we didn't already use experience_overall
    const hasExperienceOverall = sectionScores?.experience_overall?.score !== undefined;
    if (experienceScores.length > 0 && !hasExperienceOverall) {
      const avgExperienceScore = experienceScores.reduce((a, b) => a + b, 0) / experienceScores.length;
      totalScore += avgExperienceScore * weights.experience_role;
      totalWeight += weights.experience_role;
    }
    
    // Calculate final score
    const finalScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : 5;
    
    SmartLogger.log('AI.SCORING', 'Score calculation complete', {
      experienceScoreCount: experienceScores.length,
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
    
    SmartLogger.log('AI.PROMPTS', 'Sending synthesis response', {
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
    
    SmartLogger.log('AI.PROMPTS', 'Response data structure', { 
      hasRecommendations: !!responseData.overallRecommendations,
      hasCareerNarrative: !!responseData.careerNarrative,
      sectionScoreKeys: Object.keys(sectionScores || {}),
      hasExperienceOverall: !!sectionScores?.experience_overall,
      experienceOverallScore: sectionScores?.experience_overall?.score,
      hasExperienceRoles: !!sectionScores?.experience_roles
    });
    sendResponse(responseData);
  } catch (error) {
    SmartLogger.error('AI.PROMPTS', 'Synthesis error', error);
    sendResponse({
      success: false,
      error: error.message || 'Failed to synthesize analysis'
    });
  }
}


} else {
  SmartLogger.log('PERFORMANCE.TIMING', 'chrome.runtime.onMessage not available');
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
  SmartLogger.log('PERFORMANCE.TIMING', 'chrome.alarms API not available - cache cleanup will not be scheduled');
}