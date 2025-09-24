/**
 * DOM Query Cache
 * Optimizes DOM queries by caching elements with TTL
 * Significantly reduces querySelector calls in extraction loops
 */

class DOMCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 5000; // Default 5 second TTL
    this.maxSize = options.maxSize || 100; // Max cached items
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get element from cache or query DOM
   * @param {string} selector - CSS selector
   * @returns {Element|null} Cached or newly queried element
   */
  query(selector) {
    const cached = this.cache.get(selector);
    const now = Date.now();
    
    // Check if cache hit and not expired
    if (cached && (now - cached.timestamp < this.ttl)) {
      this.hits++;
      return cached.element;
    }
    
    // Cache miss or expired
    this.misses++;
    const element = document.querySelector(selector);
    
    // Store in cache
    this.cache.set(selector, {
      element,
      timestamp: now
    });
    
    // Evict oldest if over max size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    return element;
  }

  /**
   * Query all elements with caching
   * @param {string} selector - CSS selector
   * @returns {NodeList} Cached or newly queried elements
   */
  queryAll(selector) {
    const cacheKey = `all:${selector}`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp < this.ttl)) {
      this.hits++;
      return cached.elements;
    }
    
    this.misses++;
    const elements = document.querySelectorAll(selector);
    
    this.cache.set(cacheKey, {
      elements,
      timestamp: now
    });
    
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    return elements;
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Invalidate specific selector
   * @param {string} selector - Selector to remove from cache
   */
  invalidate(selector) {
    this.cache.delete(selector);
    this.cache.delete(`all:${selector}`);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache performance metrics
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Clean expired entries
   */
  cleanExpired() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance for global use
let domCacheInstance = null;

/**
 * Get or create singleton DOM cache instance
 * @param {Object} options - Cache configuration
 * @returns {DOMCache} Cache instance
 */
function getDOMCache(options) {
  if (!domCacheInstance) {
    domCacheInstance = new DOMCache(options);
  }
  return domCacheInstance;
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DOMCache, getDOMCache };
}