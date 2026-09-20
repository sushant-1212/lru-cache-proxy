const crypto = require('crypto');

/**
 * RFC 7234 HTTP Caching & Conditional Request Evaluator
 */
class HttpCachePolicy {
  /**
   * Generates a strong ETag hash from a payload.
   */
  static generateETag(data) {
    const serialized = typeof data === 'string' || Buffer.isBuffer(data)
      ? data
      : JSON.stringify(data);
    const hash = crypto.createHash('sha1').update(serialized).digest('hex').substring(0, 16);
    return `"${hash}"`;
  }

  /**
   * Parses standard Cache-Control directives into key-value map.
   * e.g. "public, max-age=3600, stale-while-revalidate=60"
   */
  static parseCacheControl(headerValue = '') {
    const directives = {};
    if (!headerValue) return directives;

    const parts = headerValue.split(',').map(p => p.trim().toLowerCase());
    for (const part of parts) {
      if (part.includes('=')) {
        const [k, v] = part.split('=');
        directives[k.trim()] = parseInt(v.trim(), 10) || v.trim();
      } else {
        directives[part] = true;
      }
    }
    return directives;
  }

  /**
   * Determines if a request should bypass cache entirely.
   */
  static shouldBypassCache(req) {
    const cc = this.parseCacheControl(req.headers['cache-control'] || '');
    if (cc['no-store'] || cc['no-cache']) return true;
    if (req.headers['pragma'] === 'no-cache') return true;
    return false;
  }

  /**
   * Determines if upstream response is cacheable per RFC 7234.
   */
  static isResponseCacheable(statusCode, headers = {}) {
    // Only cache successful idempotent responses by default
    if (statusCode !== 200 && statusCode !== 203 && statusCode !== 300 && statusCode !== 301) {
      return false;
    }

    const cc = this.parseCacheControl(headers['cache-control'] || '');
    if (cc['no-store'] || cc['private']) {
      return false;
    }

    return true;
  }

  /**
   * Determines TTL (in ms) and Stale-While-Revalidate window from upstream headers.
   */
  static getTtlAndSwrMs(headers = {}, defaultTtlMs = 60000) {
    const cc = this.parseCacheControl(headers['cache-control'] || '');

    // s-maxage takes precedence for proxies
    let maxAgeSeconds = cc['s-maxage'] ?? cc['max-age'];
    let ttlMs = maxAgeSeconds !== undefined ? maxAgeSeconds * 1000 : defaultTtlMs;

    let swrSeconds = cc['stale-while-revalidate'] ?? 0;
    let swrMs = swrSeconds * 1000;

    return { ttlMs, swrMs };
  }

  /**
   * Checks if cached item is within the Stale-While-Revalidate window.
   */
  static isStaleWhileRevalidate(cachedEntry) {
    if (!cachedEntry || !cachedEntry.swrExpiresAt) return false;
    const now = Date.now();
    return now > cachedEntry.expiresAt && now <= cachedEntry.swrExpiresAt;
  }

  /**
   * Checks if client conditional header matches cached ETag (304 Not Modified).
   */
  static isNotModified(req, cachedEntry) {
    if (!cachedEntry || !cachedEntry.etag) return false;
    const ifNoneMatch = req.headers['if-none-match'];
    if (!ifNoneMatch) return false;

    // Handle multiple ETags or wildcard *
    if (ifNoneMatch === '*') return true;
    const clientTags = ifNoneMatch.split(',').map(t => t.trim());
    return clientTags.includes(cachedEntry.etag);
  }
}

module.exports = HttpCachePolicy;
