const { Node, DoublyLinkedList } = require('./DoublyLinkedList');
const { estimateByteSize } = require('../utils/byteSize');

/**
 * Production-Grade Least Frequently Used (LFU) Cache
 * Implements O(1) Hash Map + Frequency Buckets (Doubly Linked Lists).
 * Supports:
 * - Count-based eviction limit
 * - Memory byte-size limit
 * - Time-To-Live (TTL)
 * - Telemetry & Eviction event callbacks
 */
class LFUCache {
  constructor(options = {}) {
    this.maxItems = options.maxItems ?? 10;
    this.maxSizeBytes = options.maxSizeBytes ?? (50 * 1024 * 1024);
    this.defaultTtlMs = options.defaultTtlMs ?? 0;
    this.onEvict = options.onEvict ?? null;

    this.keyMap = new Map(); // key -> Node
    this.freqMap = new Map(); // freq (int) -> DoublyLinkedList
    this.minFreq = 0;
    this.currentSizeBytes = 0;

    this.stats = {
      hits: 0,
      misses: 0,
      puts: 0,
      evictions: 0,
      expirations: 0,
    };
  }

  get(key) {
    const node = this.keyMap.get(key);
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

    this._incrementFreq(node);
    this.stats.hits++;
    return node.value;
  }

  has(key) {
    const node = this.keyMap.get(key);
    if (!node) return false;
    if (node.isExpired()) {
      this._removeNode(node, 'EXPIRED');
      return false;
    }
    return true;
  }

  put(key, value, ttlMs = this.defaultTtlMs) {
    this.stats.puts++;
    const nodeSize = estimateByteSize(key) + estimateByteSize(value) + 48;

    if (this.keyMap.has(key)) {
      const node = this.keyMap.get(key);
      this.currentSizeBytes -= nodeSize;
      node.value = value;
      node.sizeBytes = nodeSize;
      node.createdAt = Date.now();
      node.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
      this.currentSizeBytes += nodeSize;

      this._incrementFreq(node);
      this._enforceLimits();
      return node;
    }

    // Evict if at capacity or over memory budget
    while (
      (this.keyMap.size >= this.maxItems || (this.currentSizeBytes + nodeSize > this.maxSizeBytes)) &&
      this.keyMap.size > 0
    ) {
      this._evictLFU();
    }

    const newNode = new Node(key, value, nodeSize, ttlMs);
    newNode.freq = 1;

    this.keyMap.set(key, newNode);
    this._getFreqList(1).insertHead(newNode);
    this.minFreq = 1;
    this.currentSizeBytes += nodeSize;

    return newNode;
  }

  delete(key) {
    const node = this.keyMap.get(key);
    if (!node) return false;
    this._removeNode(node, 'MANUAL_PURGE');
    return true;
  }

  clear() {
    this.keyMap.clear();
    this.freqMap.clear();
    this.minFreq = 0;
    this.currentSizeBytes = 0;
  }

  _incrementFreq(node) {
    const oldFreq = node.freq;
    const oldList = this.freqMap.get(oldFreq);
    oldList.removeNode(node);

    if (oldList.length === 0 && this.minFreq === oldFreq) {
      this.minFreq++;
    }

    node.freq++;
    this._getFreqList(node.freq).insertHead(node);
  }

  _getFreqList(freq) {
    if (!this.freqMap.has(freq)) {
      this.freqMap.set(freq, new DoublyLinkedList());
    }
    return this.freqMap.get(freq);
  }

  _evictLFU() {
    const minList = this.freqMap.get(this.minFreq);
    if (!minList || minList.length === 0) return;

    const victim = minList.popTail();
    if (victim) {
      this.keyMap.delete(victim.key);
      this.currentSizeBytes = Math.max(0, this.currentSizeBytes - victim.sizeBytes);
      this.stats.evictions++;

      if (this.onEvict) {
        this.onEvict(victim.key, victim.value, 'LFU_CAPACITY_EXCEEDED');
      }
    }
  }

  _removeNode(node, reason = 'UNKNOWN') {
    const list = this.freqMap.get(node.freq);
    if (list) {
      list.removeNode(node);
      if (list.length === 0 && this.minFreq === node.freq) {
        // find next minFreq or 0
        let nextMin = 0;
        for (const [f, l] of this.freqMap.entries()) {
          if (l.length > 0 && (nextMin === 0 || f < nextMin)) {
            nextMin = f;
          }
        }
        this.minFreq = nextMin;
      }
    }

    this.keyMap.delete(node.key);
    this.currentSizeBytes = Math.max(0, this.currentSizeBytes - node.sizeBytes);

    if (this.onEvict) {
      this.onEvict(node.key, node.value, reason);
    }
  }

  _enforceLimits() {
    while (
      (this.keyMap.size > this.maxItems || this.currentSizeBytes > this.maxSizeBytes) &&
      this.keyMap.size > 0
    ) {
      this._evictLFU();
    }
  }

  pruneExpired() {
    let pruned = 0;
    for (const [key, node] of this.keyMap.entries()) {
      if (node.isExpired()) {
        this._removeNode(node, 'EXPIRED');
        pruned++;
      }
    }
    this.stats.expirations += pruned;
    return pruned;
  }

  getVisualData() {
    const nodes = [];
    // Sort frequencies descending or group
    const sortedFreqs = Array.from(this.freqMap.keys()).sort((a, b) => b - a);
    for (const freq of sortedFreqs) {
      const list = this.freqMap.get(freq);
      nodes.push(...list.toArray());
    }

    return {
      policy: 'LFU',
      itemCount: this.keyMap.size,
      maxItems: this.maxItems,
      currentSizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      minFreq: this.minFreq,
      stats: {
        ...this.stats,
        hitRatio: (this.stats.hits + this.stats.misses) > 0
          ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
          : '0%'
      },
      nodes
    };
  }
}

module.exports = LFUCache;
