const express = require('express');
const cors = require('cors');
const path = require('path');
const CacheEngine = require('./src/cache/CacheEngine');
const MetricsTracker = require('./src/telemetry/MetricsTracker');
const ProxyHandler = require('./src/gateway/ProxyHandler');
const { createMockUpstream } = require('./src/mock/upstreamServer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Core Subsystems
const cacheEngine = new CacheEngine({
  maxItems: 5,
  maxSizeBytes: 20 * 1024 * 1024, // 20MB
  defaultTtlMs: 30 * 1000,        // 30 seconds
  policy: 'LRU'
});

const metricsTracker = new MetricsTracker();

const proxyHandler = new ProxyHandler({
  cacheEngine,
  metricsTracker,
  defaultOriginUrl: `http://localhost:${PORT}/api/mock/products/1`
});

// 1. Mount Realistic Mock Upstream Service
app.use('/api/mock', createMockUpstream());

// 2. Gateway Proxy Endpoint
app.get('/proxy', (req, res) => {
  return proxyHandler.handle(req, res);
});

// 3. Cache Introspection & Visualizer API
app.get('/api/cache', (req, res) => {
  res.json(cacheEngine.getSnapshot());
});

app.post('/api/cache/purge', (req, res) => {
  cacheEngine.clear();
  res.json({ success: true, message: 'Cache purged successfully' });
});

app.delete('/api/cache/key', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  const deleted = cacheEngine.delete(url);
  res.json({ success: deleted, key: url });
});

app.post('/api/cache/policy', (req, res) => {
  const { policy } = req.body;
  try {
    cacheEngine.setPolicy(policy);
    res.json({ success: true, policy: cacheEngine.policy });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/cache/capacity', (req, res) => {
  const { capacity } = req.body;
  const cap = parseInt(capacity, 10);
  if (isNaN(cap) || cap < 1 || cap > 100) {
    return res.status(400).json({ error: 'Capacity must be between 1 and 100' });
  }
  cacheEngine.setCapacity(cap);
  res.json({ success: true, capacity: cap });
});

// 4. Telemetry & Metrics API
app.get('/api/metrics', (req, res) => {
  res.json(metricsTracker.getMetrics());
});

app.post('/api/metrics/reset', (req, res) => {
  metricsTracker.reset();
  res.json({ success: true });
});

// Fallback to UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server if not imported by test suite
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 NexusProxy High-Performance Caching Gateway`);
    console.log(`📡 Dashboard:  http://localhost:${PORT}`);
    console.log(`🎯 Proxy Route: http://localhost:${PORT}/proxy?url=...`);
    console.log(`⚡ Mock Origin: http://localhost:${PORT}/api/mock/products/1`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, cacheEngine, metricsTracker, proxyHandler };
