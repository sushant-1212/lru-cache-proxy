/**
 * High-performance Telemetry Tracker for Proxy Latency & Throughput.
 */
class MetricsTracker {
  constructor() {
    this.totalRequests = 0;
    this.hits = 0;
    this.misses = 0;
    this.staleHits = 0;
    this.bypasses = 0;
    this.coalescedRequests = 0;
    this.bytesSaved = 0;

    // Latency sliding window for percentile calculation (last 500 requests)
    this.latencies = [];
    this.maxLatencySamples = 500;

    // Rolling request timestamps for QPS calculation
    this.requestTimestamps = [];
    this.qpsWindowSeconds = 10;
  }

  recordRequest({ status, latencyMs, bytes = 0, wasCoalesced = false }) {
    this.totalRequests++;
    const now = Date.now();
    this.requestTimestamps.push(now);

    if (status === 'HIT') this.hits++;
    else if (status === 'MISS') this.misses++;
    else if (status === 'STALE') this.staleHits++;
    else if (status === 'BYPASS') this.bypasses++;

    if (status === 'HIT' || status === 'STALE') {
      this.bytesSaved += bytes;
    }

    if (wasCoalesced) {
      this.coalescedRequests++;
    }

    // Record latency
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxLatencySamples) {
      this.latencies.shift();
    }

    // Prune QPS timestamps older than window
    const cutoff = now - (this.qpsWindowSeconds * 1000);
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
  }

  getMetrics() {
    // Calculate QPS
    const now = Date.now();
    const cutoff = now - (this.qpsWindowSeconds * 1000);
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
    const qps = (this.requestTimestamps.length / this.qpsWindowSeconds).toFixed(1);

    // Calculate Percentiles
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = this._percentile(sorted, 0.50);
    const p90 = this._percentile(sorted, 0.90);
    const p99 = this._percentile(sorted, 0.99);
    const avg = sorted.length > 0
      ? (sorted.reduce((acc, v) => acc + v, 0) / sorted.length).toFixed(1)
      : 0;

    const hitRate = this.totalRequests > 0
      ? (((this.hits + this.staleHits) / this.totalRequests) * 100).toFixed(1)
      : 0;

    return {
      totalRequests: this.totalRequests,
      hits: this.hits,
      misses: this.misses,
      staleHits: this.staleHits,
      bypasses: this.bypasses,
      coalescedRequests: this.coalescedRequests,
      bytesSaved: this.bytesSaved,
      hitRatePercent: Number(hitRate),
      qps: Number(qps),
      latency: {
        avg: Number(avg),
        p50,
        p90,
        p99,
        sampleCount: sorted.length
      }
    };
  }

  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[index];
  }

  reset() {
    this.totalRequests = 0;
    this.hits = 0;
    this.misses = 0;
    this.staleHits = 0;
    this.bypasses = 0;
    this.coalescedRequests = 0;
    this.bytesSaved = 0;
    this.latencies = [];
    this.requestTimestamps = [];
  }
}

module.exports = MetricsTracker;
