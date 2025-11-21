class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;

        // Refresh: delete and re-insert to mark as most recently used
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    put(key, value) {
        // If exists, delete first to update position
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // If full, delete the oldest (first item in Map)
        if (this.cache.size >= this.capacity) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, value);
    }

    // Helper to see what's inside (for the dashboard)
    toArray() {
        return Array.from(this.cache, ([key, value]) => ({ key, value }));
    }
}

// --- THIS LINE FIXES YOUR ERROR ---
module.exports = LRUCache;