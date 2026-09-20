const express = require('express');

/**
 * Creates an in-process realistic Mock Upstream Server.
 * Enables deterministic testing and benchmarking without depending on external network latency.
 */
function createMockUpstream() {
  const router = express.Router();

  // Middleware to inject simulated origin latency
  const delayMiddleware = (req, res, next) => {
    const delay = parseInt(req.query.delay ?? req.headers['x-mock-delay'] ?? 200, 10);
    setTimeout(next, delay);
  };

  // Endpoint 1: E-commerce Product with Cache-Control headers
  router.get('/products/:id', delayMiddleware, (req, res) => {
    const id = req.params.id;
    res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');
    res.json({
      id: Number(id),
      title: `High-Performance SSD Gen4 - Model ${id}`,
      sku: `NVME-${id.padStart(4, '0')}`,
      price: 129.99 + (Number(id) * 10),
      stock: 42,
      originComputedAt: new Date().toISOString(),
      originHost: 'upstream-origin-dc1'
    });
  });

  // Endpoint 2: Simulated Expensive Database Query
  router.get('/heavy-query', delayMiddleware, (req, res) => {
    const queryName = req.query.q || 'aggregate-sales-report';
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({
      query: queryName,
      recordsProcessed: 154290,
      executionPlan: 'IndexScan(sales_idx) -> HashAggregate',
      summary: { totalRevenue: 948210.50, activeUsers: 8421 },
      generatedAt: new Date().toISOString()
    });
  });

  // Endpoint 3: Uncacheable Realtime Data
  router.get('/realtime-ticker', delayMiddleware, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      symbol: req.query.symbol || 'CACHE',
      price: (100 + Math.random() * 20).toFixed(2),
      timestamp: Date.now()
    });
  });

  return router;
}

module.exports = { createMockUpstream };
