/**
 * Singleflight / Request Coalescing
 * Prevents Cache Stampede (Thundering Herd) when multiple concurrent requests
 * miss the cache for the exact same key simultaneously.
 */
class Singleflight {
  constructor() {
    this.inFlight = new Map(); // key -> { promise, waitersCount }
    this.totalCoalescedRequests = 0;
  }

  /**
   * Execute an async fn only once per key across all concurrent callers.
   * If an execution is already in flight for 'key', subsequent callers await
   * the existing promise rather than invoking fn() again.
   *
   * @param {string} key - Unique resource identifier (e.g. URL)
   * @param {Function} fn - Upstream fetcher returning Promise<T>
   * @returns {Promise<{ data: any, wasCoalesced: boolean, coalescedCount: number }>}
   */
  async do(key, fn) {
    if (this.inFlight.has(key)) {
      const call = this.inFlight.get(key);
      call.waitersCount++;
      this.totalCoalescedRequests++;

      const result = await call.promise;
      return {
        data: result,
        wasCoalesced: true,
        coalescedCount: call.waitersCount
      };
    }

    const call = {
      waitersCount: 0,
      promise: null
    };

    call.promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, call);

    const result = await call.promise;
    return {
      data: result,
      wasCoalesced: false,
      coalescedCount: call.waitersCount
    };
  }

  getPendingCount() {
    return this.inFlight.size;
  }
}

module.exports = Singleflight;
