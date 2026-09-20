/**
 * Node in a Doubly Linked List for caching algorithms.
 */
class Node {
  constructor(key, value, sizeBytes = 0, ttlMs = 0) {
    this.key = key;
    this.value = value;
    this.sizeBytes = sizeBytes;
    this.freq = 1;
    this.createdAt = Date.now();
    this.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.prev = null;
    this.next = null;
  }

  isExpired() {
    return this.expiresAt !== null && Date.now() > this.expiresAt;
  }
}

/**
 * Doubly Linked List with Sentinel Head & Tail nodes.
 * Provides guaranteed O(1) insertions, deletions, and moves.
 */
class DoublyLinkedList {
  constructor() {
    // Sentinel nodes to eliminate null checks and edge-case branching
    this.head = new Node('__HEAD__', null);
    this.tail = new Node('__TAIL__', null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.length = 0;
  }

  /**
   * Insert node at the most recently used (MRU) position right after head.
   * O(1) time complexity.
   */
  insertHead(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
    this.length++;
  }

  /**
   * Unlink a node from anywhere in the list.
   * O(1) time complexity.
   */
  removeNode(node) {
    if (!node.prev || !node.next) return;
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
    this.length--;
  }

  /**
   * Move an existing node to the MRU position (head).
   * O(1) time complexity.
   */
  moveToHead(node) {
    this.removeNode(node);
    this.insertHead(node);
  }

  /**
   * Remove and return the least recently used (LRU) node before the tail sentinel.
   * O(1) time complexity.
   */
  popTail() {
    if (this.length === 0) return null;
    const lruNode = this.tail.prev;
    this.removeNode(lruNode);
    return lruNode;
  }

  /**
   * Iterate nodes from MRU (head) to LRU (tail).
   */
  toArray() {
    const nodes = [];
    let curr = this.head.next;
    while (curr && curr !== this.tail) {
      nodes.push({
        key: curr.key,
        value: curr.value,
        sizeBytes: curr.sizeBytes,
        freq: curr.freq,
        createdAt: curr.createdAt,
        expiresAt: curr.expiresAt,
        ttlRemainingMs: curr.expiresAt ? Math.max(0, curr.expiresAt - Date.now()) : null
      });
      curr = curr.next;
    }
    return nodes;
  }
}

module.exports = { Node, DoublyLinkedList };
