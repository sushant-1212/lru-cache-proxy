const axios = require('axios');
const HttpCachePolicy = require('./HttpCachePolicy');
const Singleflight = require('./Singleflight');

/**
 * Intelligent Caching Reverse Proxy Handler
 */
class ProxyHandler {
  constructor({ cacheEngine, metricsTracker, defaultOriginUrl }) {
    this.cache = cacheEngine;
    this.metrics = metricsTracker;
    this.singleflight = new Singleflight();
    this.defaultOriginUrl = defaultOriginUrl || 'http://localhost:3000/api/mock/products/1';
  }

  async handle(req, res) {
    const startTime = Date.now();
    let targetUrl = req.query.url || this.defaultOriginUrl;

    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing target URL parameter (?url=...)' });
    }

    // Resolve relative path to full URL using current request host for deployment readiness
    if (targetUrl.startsWith('/')) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
      targetUrl = `${protocol}://${host}${targetUrl}`;
    }

    // 1. Check if client specifies cache bypass
    if (HttpCachePolicy.shouldBypassCache(req)) {
      try {
        const upstream = await this._fetchUpstream(targetUrl, req);
        const latency = Date.now() - startTime;
        this.metrics.recordRequest({ status: 'BYPASS', latencyMs: latency, bytes: upstream.dataLength });

        res.setHeader('X-Cache', 'BYPASS');
        res.setHeader('X-Response-Time-Ms', latency);
        return res.status(upstream.status).json(upstream.data);
      } catch (err) {
        return this._handleError(res, err);
      }
    }

    // 2. Check Cache
    const cachedEntry = this.cache.get(targetUrl);

    if (cachedEntry) {
      // 2a. Conditional validation: check ETag / If-None-Match
      if (HttpCachePolicy.isNotModified(req, cachedEntry)) {
        const latency = Date.now() - startTime;
        this.metrics.recordRequest({ status: 'HIT', latencyMs: latency, bytes: 0 });

        res.setHeader('X-Cache', 'HIT');
        res.setHeader('ETag', cachedEntry.etag);
        res.setHeader('Age', Math.floor((Date.now() - cachedEntry.cachedAt) / 1000));
        res.setHeader('X-Response-Time-Ms', latency);
        return res.status(304).end();
      }

      // 2b. Stale-While-Revalidate Check
      if (HttpCachePolicy.isStaleWhileRevalidate(cachedEntry)) {
        const latency = Date.now() - startTime;
        this.metrics.recordRequest({ status: 'STALE', latencyMs: latency, bytes: cachedEntry.byteLength });

        // Trigger background revalidation (Singleflight protected)
        this._revalidateInBackground(targetUrl, req);

        res.setHeader('X-Cache', 'STALE');
        res.setHeader('ETag', cachedEntry.etag);
        res.setHeader('Age', Math.floor((Date.now() - cachedEntry.cachedAt) / 1000));
        res.setHeader('X-Response-Time-Ms', latency);
        res.setHeader('X-SWR-Revalidating', 'true');
        return res.json(cachedEntry.data);
      }

      // 2c. Fresh Cache Hit
      const latency = Date.now() - startTime;
      this.metrics.recordRequest({ status: 'HIT', latencyMs: latency, bytes: cachedEntry.byteLength });

      res.setHeader('X-Cache', 'HIT');
      res.setHeader('ETag', cachedEntry.etag);
      res.setHeader('Age', Math.floor((Date.now() - cachedEntry.cachedAt) / 1000));
      res.setHeader('X-Response-Time-Ms', latency);
      return res.json(cachedEntry.data);
    }

    // 3. Cache Miss: Execute Upstream with Singleflight Request Coalescing
    try {
      const { data: upstream, wasCoalesced, coalescedCount } = await this.singleflight.do(
        targetUrl,
        () => this._fetchUpstream(targetUrl, req)
      );

      const latency = Date.now() - startTime;
      this.metrics.recordRequest({
        status: 'MISS',
        latencyMs: latency,
        bytes: upstream.dataLength,
        wasCoalesced
      });

      // 4. Store in Cache if cacheable per RFC 7234
      if (HttpCachePolicy.isResponseCacheable(upstream.status, upstream.headers)) {
        const { ttlMs, swrMs } = HttpCachePolicy.getTtlAndSwrMs(upstream.headers, this.cache.options.defaultTtlMs);
        const etag = upstream.headers['etag'] || HttpCachePolicy.generateETag(upstream.data);

        const cacheRecord = {
          data: upstream.data,
          status: upstream.status,
          headers: upstream.headers,
          etag,
          cachedAt: Date.now(),
          expiresAt: Date.now() + ttlMs,
          swrExpiresAt: swrMs > 0 ? Date.now() + ttlMs + swrMs : null,
          byteLength: upstream.dataLength
        };

        // Cache for total duration (fresh TTL + SWR window)
        this.cache.put(targetUrl, cacheRecord, ttlMs + swrMs);
        res.setHeader('ETag', etag);
      }

      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Singleflight-Coalesced', wasCoalesced ? 'true' : 'false');
      if (coalescedCount > 0) {
        res.setHeader('X-Coalesced-Count', coalescedCount);
      }
      res.setHeader('Age', '0');
      res.setHeader('X-Response-Time-Ms', latency);

      return res.status(upstream.status).json(upstream.data);

    } catch (err) {
      return this._handleError(res, err);
    }
  }

  async _fetchUpstream(url, clientReq) {
    const headers = {};
    if (clientReq.headers['authorization']) {
      headers['authorization'] = clientReq.headers['authorization'];
    }

    const response = await axios.get(url, {
      headers,
      timeout: 10000,
      validateStatus: () => true // handle all status codes cleanly
    });

    const dataLength = Buffer.byteLength(JSON.stringify(response.data), 'utf8');

    return {
      status: response.status,
      headers: response.headers,
      data: response.data,
      dataLength
    };
  }

  _revalidateInBackground(targetUrl, clientReq) {
    this.singleflight.do(`swr:${targetUrl}`, async () => {
      try {
        const upstream = await this._fetchUpstream(targetUrl, clientReq);
        if (HttpCachePolicy.isResponseCacheable(upstream.status, upstream.headers)) {
          const { ttlMs, swrMs } = HttpCachePolicy.getTtlAndSwrMs(upstream.headers, this.cache.options.defaultTtlMs);
          const etag = upstream.headers['etag'] || HttpCachePolicy.generateETag(upstream.data);

          const cacheRecord = {
            data: upstream.data,
            status: upstream.status,
            headers: upstream.headers,
            etag,
            cachedAt: Date.now(),
            expiresAt: Date.now() + ttlMs,
            swrExpiresAt: swrMs > 0 ? Date.now() + ttlMs + swrMs : null,
            byteLength: upstream.dataLength
          };
          this.cache.put(targetUrl, cacheRecord, ttlMs + swrMs);
        }
      } catch (err) {
        // Background revalidation failure is non-fatal
        console.warn(`[SWR Revalidation Failed for ${targetUrl}]:`, err.message);
      }
    });
  }

  _handleError(res, err) {
    console.error('[Proxy Error]:', err.message);
    return res.status(502).json({
      error: 'Bad Gateway / Upstream Fetch Failed',
      message: err.message,
      code: err.code
    });
  }
}

module.exports = ProxyHandler;
