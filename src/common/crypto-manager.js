/**
 * [CRITICAL_PATH:API_KEY_ENCRYPTION] - P0: API key security
 * Centralized module for all API key encryption/decryption operations
 * Used by service worker and popup for consistent crypto operations
 */

const CryptoManager = {
  /**
   * Generate encryption key from passphrase and salt
   */
  async generateKey(passphrase, salt) {
    const passphraseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Get or create installation-specific passphrase
   */
  async getOrCreatePassphrase() {
    const { installationId } = await chrome.storage.local.get('installationId');
    if (installationId) return installationId;
    const newId = crypto.randomUUID() + '-' + Date.now();
    await chrome.storage.local.set({ installationId: newId });
    return newId;
  },

  /**
   * Encrypt API key
   * @param {string} apiKey - The API key to encrypt
   * @returns {Promise<string>} Base64 of salt (16 bytes) + iv (12 bytes) + AES-GCM ciphertext
   */
  async encryptApiKey(apiKey) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.generateKey(await this.getOrCreatePassphrase(), salt);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
    return btoa(String.fromCharCode(...salt, ...iv, ...new Uint8Array(encrypted)));
  },

  /**
   * Decrypt API key. Corrupt data or a changed installationId throws (atob or subtle.decrypt).
   * @param {string} encryptedData - Base64 encoded encrypted data
   * @returns {Promise<string>} Decrypted API key
   */
  async decryptApiKey(encryptedData) {
    const bytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const key = await this.generateKey(await this.getOrCreatePassphrase(), bytes.slice(0, 16));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28)));
  },

  /**
   * Clear API key
   */
  async clearApiKey() {
    await chrome.storage.local.remove('encryptedApiKey');
  }
};

// Export for use in both environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoManager;
}
