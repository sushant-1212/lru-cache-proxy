const { test, describe } = require('node:test');
const assert = require('node:assert');
const LRUCache = require('../src/cache/LRUCache');
const LFUCache = require('../src/cache/LFUCache');

describe('LRUCache Core Data Structure', () => {
  test('should put and get items with O(1) lookups', () => {
    const cache = new LRUCache({ maxItems: 3 });
    cache.put('a', 1);
    cache.put('b', 2);
    cache.put('c', 3);

    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('b'), 2);
    assert.strictEqual(cache.get('c'), 3);
  });

  test('should evict the least recently used item when capacity is exceeded', () => {
    const cache = new LRUCache({ maxItems: 3 });
    cache.put('k1', 'v1');
    cache.put('k2', 'v2');
    cache.put('k3', 'v3');

    // Access k1, making k2 the oldest (LRU)
    cache.get('k1');

    // Insert k4, should evict k2
    cache.put('k4', 'v4');

    assert.strictEqual(cache.has('k2'), false);
    assert.strictEqual(cache.get('k1'), 'v1');
    assert.strictEqual(cache.get('k3'), 'v3');
    assert.strictEqual(cache.get('k4'), 'v4');
  });

  test('should update existing item without increasing count', () => {
    const cache = new LRUCache({ maxItems: 2 });
    cache.put('x', 10);
    cache.put('y', 20);
    cache.put('x', 99); // update

    assert.strictEqual(cache.map.size, 2);
    assert.strictEqual(cache.get('x'), 99);
  });

  test('should expire items when TTL elapses', async () => {
    const cache = new LRUCache({ maxItems: 5 });
    cache.put('temp', 'secret', 50); // 50ms TTL

    assert.strictEqual(cache.get('temp'), 'secret');

    await new Promise(resolve => setTimeout(resolve, 70));
    assert.strictEqual(cache.get('temp'), null);
  });

  test('should enforce max byte size memory bounding', () => {
    // 500 bytes max
    const cache = new LRUCache({ maxItems: 10, maxSizeBytes: 500 });
    const largePayload = 'A'.repeat(200);

    cache.put('item1', largePayload);
    cache.put('item2', largePayload);
    // Adding 3rd large item should force eviction to keep size under 500 bytes
    cache.put('item3', largePayload);

    assert.ok(cache.currentSizeBytes <= 500);
    assert.ok(cache.map.size < 3);
  });
});

describe('LFUCache Frequency-Based Eviction', () => {
  test('should evict least frequently used item regardless of insertion time', () => {
    const cache = new LFUCache({ maxItems: 3 });
    cache.put('a', 'apple');
    cache.put('b', 'banana');
    cache.put('c', 'cherry');

    // Access 'a' 3 times, 'c' 2 times, 'b' 0 times
    cache.get('a');
    cache.get('a');
    cache.get('a');
    cache.get('c');
    cache.get('c');

    // Insert 'd', should evict 'b' (freq 1)
    cache.put('d', 'date');

    assert.strictEqual(cache.has('b'), false);
    assert.strictEqual(cache.has('a'), true);
    assert.strictEqual(cache.has('c'), true);
    assert.strictEqual(cache.has('d'), true);
  });
});
