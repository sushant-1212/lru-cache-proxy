const { Node, DoublyLinkedList } = require('./DoublyLinkedList');
const { estimateByteSize } = require('../utils/byteSize');

/**
 * Production-Grade Least Recently Used (LRU) Cache
 * Implements Hash Map + Doubly Linked List for guaranteed O(1) operations.
 * Supports:
 * - Count-based eviction limit
 * - Memory byte-size limit
 * - Time-To-Live (TTL) with passive and active expiration
 * - Telemetry & Eviction event callbacks
 */
class LRUCache {
  constructor(options = {}) {
    this.maxItems = options.maxItems ?? 10;
    this.maxSizeBytes = options.maxSizeBytes ?? (50 * 1024 * 1024); // default 50MB
    this.defaultTtlMs = options.defaultTtlMs ?? 0; // 0 = infinite
    this.onEvict = options.onEvict ?? null;

    this.map = new Map(); // key -> Node
    this.list = new DoublyLinkedList();
    this.currentSizeBytes = 0;

    // Telemetry
    this.stats = {
      hits: 0,
      misses: 0,
      puts: 0,
      evictions: 0,
      expirations: 0,
    };
  }

  /**
   * O(1) Get value by key.
   * If expired, removes node and returns null.
   * On hit, promotes node to MRU (head).
   */
  get(key) {
    const node = this.map.get(key);
    if (!node) {
      this.stats.misses++;
      return null;
    }

    if (node.isExpired()) {
      this._removeNode(node, 'EXPIRED');
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Cache hit: promote to MRU
    this.list.moveToHead(node);
    node.freq++;
    this.stats.hits++;
    return node.value;
  }

  /**
   * Check existence without mutating LRU order.
   */
  has(key) {
    const node = this.map.get(key);
    if (!node) return false;
    if (node.isExpired()) {
      this._removeNode(node, 'EXPIRED');
      return false;
    }
    return true;
  }

  /**
   * O(1) Put value into cache.
   * Evicts LRU nodes if item count or byte size exceeds limits.
   */
  put(key, value, ttlMs = this.defaultTtlMs) {
    this.stats.puts++;
    const nodeSize = estimateByteSize(key) + estimateByteSize(value) + 48; // 48 bytes node overhead

    // If key already exists, update and promote
    if (this.map.has(key)) {
      const existingNode = this.map.get(key);
      this.currentSizeBytes -= existingNode.sizeBytes;
      existingNode.value = value;
      existingNode.sizeBytes = nodeSize;
      existingNode.createdAt = Date.now();
      existingNode.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
      this.currentSizeBytes += nodeSize;

      this.list.moveToHead(existingNode);
      this._enforceLimits();
      return existingNode;
    }

    const newNode = new Node(key, value, nodeSize, ttlMs);

    // Evict if at capacity or over memory budget
    while (
      (this.map.size >= this.maxItems || (this.currentSizeBytes + nodeSize > this.maxSizeBytes)) &&
      this.map.size > 0
    ) {
      this._evictLRU();
    }

    this.list.insertHead(newNode);
    this.map.set(key, newNode);
    this.currentSizeBytes += nodeSize;

    return newNode;
  }

  /**
   * O(1) Delete node by key.
   */
  delete(key) {
    const node = this.map.get(key);
    if (!node) return false;
    this._removeNode(node, 'MANUAL_PURGE');
    return true;
  }

  /**
   * Clear all entries and reset size.
   */
  clear() {
    this.map.clear();
    this.list = new DoublyLinkedList();
    this.currentSizeBytes = 0;
  }

  /**
   * Evict the least recently used item (tail of list).
   */
  _evictLRU() {
    const lruNode = this.list.popTail();
    if (lruNode) {
      this.map.delete(lruNode.key);
      this.currentSizeBytes = Math.max(0, this.currentSizeBytes - lruNode.sizeBytes);
      this.stats.evictions++;

      if (this.onEvict) {
        this.onEvict(lruNode.key, lruNode.value, 'LRU_CAPACITY_EXCEEDED');
      }
    }
  }

  /**
   * Internal helper to unlink and delete node.
   */
  _removeNode(node, reason = 'UNKNOWN') {
    this.list.removeNode(node);
    this.map.delete(node.key);
    this.currentSizeBytes = Math.max(0, this.currentSizeBytes - node.sizeBytes);

    if (this.onEvict) {
      this.onEvict(node.key, node.value, reason);
    }
  }

  /**
   * Enforce memory bounds if payload update pushed size over limit.
   */
  _enforceLimits() {
    while (
      (this.map.size > this.maxItems || this.currentSizeBytes > this.maxSizeBytes) &&
      this.map.size > 0
    ) {
      this._evictLRU();
    }
  }

  /**
   * Active cleanup pass for expired keys.
   */
  pruneExpired() {
    let pruned = 0;
    for (const [key, node] of this.map.entries()) {
      if (node.isExpired()) {
        this._removeNode(node, 'EXPIRED');
        pruned++;
      }
    }
    this.stats.expirations += pruned;
    return pruned;
  }

  /**
   * Return ordered array for visualizer inspection (Head/MRU -> Tail/LRU).
   */
  getVisualData() {
    return {
      policy: 'LRU',
      itemCount: this.map.size,
      maxItems: this.maxItems,
      currentSizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      stats: {
        ...this.stats,
        hitRatio: (this.stats.hits + this.stats.misses) > 0
          ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
          : '0%'
      },
      nodes: this.list.toArray()
    };
  }
}

module.exports = LRUCache;
