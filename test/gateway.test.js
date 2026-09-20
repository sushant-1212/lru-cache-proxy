const { test, describe } = require('node:test');
const assert = require('node:assert');
const Singleflight = require('../src/gateway/Singleflight');
const HttpCachePolicy = require('../src/gateway/HttpCachePolicy');

describe('Singleflight Request Coalescing', () => {
  test('should coalesce 10 concurrent requests into 1 single upstream invocation', async () => {
    const singleflight = new Singleflight();
    let upstreamCallCount = 0;

    const mockFetcher = async () => {
      upstreamCallCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return { status: 200, data: 'computed-result' };
    };

    // Fire 10 simultaneous calls for the same key
    const calls = Array.from({ length: 10 }, () =>
      singleflight.do('expensive-resource', mockFetcher)
    );

    const results = await Promise.all(calls);

    assert.strictEqual(upstreamCallCount, 1, 'Upstream should only be invoked once');
    results.forEach(res => {
      assert.strictEqual(res.data.data, 'computed-result');
    });

    const coalescedCount = results.filter(r => r.wasCoalesced).length;
    assert.strictEqual(coalescedCount, 9, '9 calls should have been coalesced');
  });
});

describe('HttpCachePolicy RFC 7234 Compliance', () => {
  test('should parse Cache-Control directives accurately', () => {
    const header = 'public, max-age=60, stale-while-revalidate=120, no-transform';
    const parsed = HttpCachePolicy.parseCacheControl(header);

    assert.strictEqual(parsed['public'], true);
    assert.strictEqual(parsed['max-age'], 60);
    assert.strictEqual(parsed['stale-while-revalidate'], 120);
    assert.strictEqual(parsed['no-transform'], true);
  });

  test('should generate consistent SHA-1 ETags', () => {
    const tag1 = HttpCachePolicy.generateETag({ id: 1, name: 'Product' });
    const tag2 = HttpCachePolicy.generateETag({ id: 1, name: 'Product' });
    const tag3 = HttpCachePolicy.generateETag({ id: 2, name: 'Other' });

    assert.strictEqual(tag1, tag2);
    assert.notStrictEqual(tag1, tag3);
    assert.ok(tag1.startsWith('"'));
    assert.ok(tag1.endsWith('"'));
  });

  test('should detect 304 Not Modified when client If-None-Match matches ETag', () => {
    const mockReq = { headers: { 'if-none-match': '"abcdef123456"' } };
    const cachedEntry = { etag: '"abcdef123456"' };

    assert.strictEqual(HttpCachePolicy.isNotModified(mockReq, cachedEntry), true);

    const mismatchReq = { headers: { 'if-none-match': '"different-etag"' } };
    assert.strictEqual(HttpCachePolicy.isNotModified(mismatchReq, cachedEntry), false);
  });
});
