/**
 * [CRITICAL_PATH:API_KEY_ENCRYPTION] - P0: API key security
 * Centralized module for all API key encryption/decryption operations
 * Used by service worker and popup for consistent crypto operations
 */

// Simple logging wrapper that works in both environments
const log = (level, message, data) => {
  if (typeof SmartLogger !== 'undefined') {
    SmartLogger[level]('CRYPTO', message, data);
  } else {
    console[level](`[CRYPTO] ${message}`, data || '');
  }
};

const CryptoManager = {
  // Configuration
  algorithm: 'AES-GCM',
  keyLength: 256,
  ivLength: 12,
  saltLength: 16,
  iterations: 100000,

  /**
   * Generate encryption key from passphrase and salt
   */
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
  },

  /**
   * Get or create installation-specific passphrase
   */
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
  },

  /**
   * Encrypt API key
   * @param {string} apiKey - The API key to encrypt
   * @returns {Promise<string>} Base64 encoded encrypted data
   */
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
      
      log('log', 'API key encrypted successfully', { 
        length: base64Result.length,
        expiresAt: new Date(expirationTime).toISOString()
      });
      
      // Verify we can decrypt it immediately
      const testDecrypt = await this.decryptApiKey(base64Result);
      if (testDecrypt !== apiKey) {
        throw new Error('Encryption verification failed');
      }
      
      return base64Result;
    } catch (error) {
      // Provide more specific error messages
      if (error.message.includes('Web Crypto API')) {
        throw new Error('Your browser does not support secure encryption. Please try a different browser.');
      } else if (error.message.includes('passphrase')) {
        throw new Error('Failed to generate encryption key. Please try again.');
      } else {
        throw new Error('Failed to encrypt API key: ' + error.message);
      }
    }
  },

  /**
   * Decrypt API key
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @returns {Promise<string>} Decrypted API key
   */
  async decryptApiKey(encryptedData) {
    try {
      // Validate input
      if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Encrypted data is missing or invalid');
      }

      // Check expiration from separate storage FIRST
      const { apiKeyExpiration } = await chrome.storage.local.get('apiKeyExpiration');
      if (apiKeyExpiration && Date.now() > apiKeyExpiration) {
        const expiredDate = new Date(apiKeyExpiration).toLocaleDateString();
        throw new Error(`API key expired on ${expiredDate}. Please enter a new key.`);
      }

      const passphrase = await this.getOrCreatePassphrase();
      
      // Safely decode base64
      let combined;
      try {
        combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      } catch (e) {
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
            }
            
            isV2 = true;
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
          throw new Error('Encrypted data is corrupted or too short');
        }
        
        salt = combined.slice(0, this.saltLength);
        iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
        encrypted = combined.slice(this.saltLength + this.ivLength);
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
        try {
          const newEncrypted = await this.encryptApiKey(apiKey);
          await chrome.storage.local.set({ encryptedApiKey: newEncrypted });
        } catch (reEncryptError) {
          // Continue - at least we decrypted it
        }
      }
      
      return apiKey;
    } catch (error) {
      // Check if it's a decryption error (wrong key or corrupted data)
      if (error.name === 'OperationError' || error.message.includes('decrypt')) {
        throw new Error('API key decryption failed - key may be corrupted. Please re-enter your key.');
      }
      throw error;
    }
  },

  /**
   * Migrate existing plain text keys to encrypted format
   */
  async migrateExistingKeys() {
    try {
      const { apiKey, encryptedApiKey } = await chrome.storage.local.get(['apiKey', 'encryptedApiKey']);
      
      if (!apiKey || encryptedApiKey) {
        return false;
      }

      const encrypted = await this.encryptApiKey(apiKey);
      await chrome.storage.local.set({ encryptedApiKey: encrypted });
      await chrome.storage.local.remove('apiKey');
      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      return false;
    }
  },

  /**
   * Clear API key and expiration
   */
  async clearApiKey() {
    await chrome.storage.local.remove(['encryptedApiKey', 'apiKeyExpiration']);
  },

  /**
   * Check if API key is expired
   * @returns {Promise<{expired: boolean, daysRemaining: number}>}
   */
  async checkExpiration() {
    const { apiKeyExpiration } = await chrome.storage.local.get('apiKeyExpiration');
    
    if (!apiKeyExpiration) {
      return { expired: false, daysRemaining: 7 }; // Default if no expiration set
    }
    
    const now = Date.now();
    const daysRemaining = Math.ceil((apiKeyExpiration - now) / (24 * 60 * 60 * 1000));
    
    return {
      expired: now > apiKeyExpiration,
      daysRemaining: Math.max(0, daysRemaining)
    };
  }
};

// Export for use in both environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoManager;
}