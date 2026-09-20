const LRUCache = require('./LRUCache');
const LFUCache = require('./LFUCache');
const { EventEmitter } = require('events');

/**
 * CacheEngine coordinates caching strategies, event streams, and housekeeping.
 */
class CacheEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxItems: options.maxItems ?? 8,
      maxSizeBytes: options.maxSizeBytes ?? (10 * 1024 * 1024), // 10MB default
      defaultTtlMs: options.defaultTtlMs ?? (60 * 1000), // 60s default TTL
      policy: options.policy ?? 'LRU',
    };

    this.policy = this.options.policy;
    this.evictionLog = []; // ring buffer of recent evictions for the UI
    this.maxEvictionLog = 20;

    this._initCache();

    // Start background TTL cleaner every 5 seconds
    this.pruneInterval = setInterval(() => {
      this.cache.pruneExpired();
    }, 5000);
  }

  _initCache() {
    const handleEvict = (key, value, reason) => {
      const entry = {
        timestamp: new Date().toISOString(),
        key,
        reason,
        policy: this.policy
      };
      this.evictionLog.unshift(entry);
      if (this.evictionLog.length > this.maxEvictionLog) {
        this.evictionLog.pop();
      }
      this.emit('evict', entry);
    };

    const cacheOptions = {
      maxItems: this.options.maxItems,
      maxSizeBytes: this.options.maxSizeBytes,
      defaultTtlMs: this.options.defaultTtlMs,
      onEvict: handleEvict
    };

    if (this.policy === 'LFU') {
      this.cache = new LFUCache(cacheOptions);
    } else {
      this.cache = new LRUCache(cacheOptions);
    }
  }

  setPolicy(newPolicy) {
    if (newPolicy !== 'LRU' && newPolicy !== 'LFU') {
      throw new Error(`Invalid policy: ${newPolicy}`);
    }
    if (this.policy === newPolicy) return;

    // Migrate items from old cache to new cache
    const visual = this.cache.getVisualData();
    this.policy = newPolicy;
    this._initCache();

    // Replay items into the new policy engine
    for (const item of visual.nodes.reverse()) {
      const remainingTtl = item.expiresAt ? Math.max(1000, item.expiresAt - Date.now()) : 0;
      this.cache.put(item.key, item.value, remainingTtl);
    }

    this.emit('policyChange', this.policy);
  }

  setCapacity(maxItems) {
    this.options.maxItems = maxItems;
    this.cache.maxItems = maxItems;
    this.cache._enforceLimits();
  }

  get(key) {
    return this.cache.get(key);
  }

  has(key) {
    return this.cache.has(key);
  }

  put(key, value, ttlMs) {
    return this.cache.put(key, value, ttlMs);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.evictionLog = [];
    this.emit('clear');
  }

  getSnapshot() {
    return {
      ...this.cache.getVisualData(),
      policy: this.policy,
      evictionLog: this.evictionLog
    };
  }

  destroy() {
    clearInterval(this.pruneInterval);
  }
}

module.exports = CacheEngine;
