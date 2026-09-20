// Chart.js Setup
let latencyChart;
const maxChartPoints = 30;

function initChart() {
  const ctx = document.getElementById('latencyChart').getContext('2d');
  latencyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Latency (ms)',
        data: [],
        borderColor: '#06b6d4',
        borderWidth: 2,
        backgroundColor: 'rgba(6, 182, 212, 0.08)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: [],
        pointBorderColor: [],
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: {
          beginAtZero: true,
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8', font: { family: 'monospace' } }
        }
      },
      plugins: {
        legend: { display: false }
      },
      animation: { duration: 150 }
    }
  });
}

function addChartPoint(latencyMs, status) {
  let color = '#10b981'; // green for HIT
  if (status === 'MISS') color = '#f43f5e'; // red
  if (status === 'STALE') color = '#a855f7'; // purple
  if (status === 'BYPASS') color = '#f59e0b'; // amber

  latencyChart.data.labels.push('');
  latencyChart.data.datasets[0].data.push(latencyMs);
  latencyChart.data.datasets[0].pointBackgroundColor.push(color);
  latencyChart.data.datasets[0].pointBorderColor.push(color);

  if (latencyChart.data.labels.length > maxChartPoints) {
    latencyChart.data.labels.shift();
    latencyChart.data.datasets[0].data.shift();
    latencyChart.data.datasets[0].pointBackgroundColor.shift();
    latencyChart.data.datasets[0].pointBorderColor.shift();
  }
  latencyChart.update();
}

function setTargetUrl(url) {
  document.getElementById('targetUrlInput').value = url;
}

// Request execution
async function sendRequest() {
  const input = document.getElementById('targetUrlInput');
  const targetUrl = input.value.trim();
  if (!targetUrl) return;

  const btn = document.getElementById('btnExecute');
  const statusBox = document.getElementById('statusAlert');
  btn.disabled = true;

  statusBox.className = 'status-box';
  statusBox.innerText = `Dispatching request to ${targetUrl}...`;

  const startTime = performance.now();

  try {
    const proxyUrl = `/proxy?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl);
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    const cacheState = res.headers.get('X-Cache') || 'UNKNOWN';
    const responseTimeHeader = res.headers.get('X-Response-Time-Ms') || duration;
    const etag = res.headers.get('ETag') || 'none';
    const age = res.headers.get('Age') || '0';
    const coalesced = res.headers.get('X-Singleflight-Coalesced') === 'true';

    let jsonBody = {};
    try {
      jsonBody = await res.json();
    } catch {
      jsonBody = { message: 'Response body is not JSON' };
    }

    // Update Status Box
    if (cacheState === 'HIT') {
      statusBox.className = 'status-box hit';
      statusBox.innerHTML = `<strong>CACHE HIT:</strong> Served in <strong>${duration}ms</strong> from memory (Age: ${age}s, ETag: ${etag})`;
    } else if (cacheState === 'STALE') {
      statusBox.className = 'status-box stale';
      statusBox.innerHTML = `<strong>STALE-WHILE-REVALIDATE:</strong> Stale data served in <strong>${duration}ms</strong>; background fetch initiated!`;
    } else if (cacheState === 'BYPASS') {
      statusBox.className = 'status-box';
      statusBox.innerHTML = `<strong>CACHE BYPASS:</strong> Fetched from origin in <strong>${duration}ms</strong> (No-Store)`;
    } else {
      statusBox.className = 'status-box miss';
      statusBox.innerHTML = `<strong>CACHE MISS:</strong> Fetched from origin in <strong>${duration}ms</strong> (Stored in Cache)`;
    }

    // Inspector
    document.getElementById('lastStatusCode').innerText = `${res.status} ${res.statusText}`;
    const headerLines = [
      `HTTP/1.1 ${res.status} ${res.statusText}`,
      `X-Cache: ${cacheState}`,
      `X-Response-Time-Ms: ${responseTimeHeader}ms`,
      `X-Singleflight-Coalesced: ${coalesced}`,
      `Age: ${age}s`,
      `ETag: ${etag}`,
      `Content-Type: ${res.headers.get('content-type') || 'application/json'}`
    ];
    document.getElementById('responseHeadersBox').innerText = headerLines.join('\n');
    document.getElementById('responsePayloadBox').innerText = JSON.stringify(jsonBody, null, 2);

    addChartPoint(duration, cacheState);

  } catch (err) {
    statusBox.className = 'status-box miss';
    statusBox.innerText = `Network or Gateway Error: ${err.message}`;
  } finally {
    btn.disabled = false;
    await refreshVisualizer();
    await refreshTelemetry();
  }
}

// Simulate Cache Stampede (50 concurrent requests)
async function simulateCacheStampede() {
  const input = document.getElementById('targetUrlInput');
  const targetUrl = input.value.trim();
  const btn = document.getElementById('btnBurst');
  const statusBox = document.getElementById('statusAlert');

  btn.disabled = true;
  statusBox.className = 'status-box burst';
  statusBox.innerText = `Firing 50 concurrent requests to test Singleflight Request Coalescing...`;

  const startTime = performance.now();
  const count = 50;
  const promises = [];

  for (let i = 0; i < count; i++) {
    promises.push(
      fetch(`/proxy?url=${encodeURIComponent(targetUrl)}`)
        .then(async (r) => ({
          status: r.status,
          cache: r.headers.get('X-Cache'),
          coalesced: r.headers.get('X-Singleflight-Coalesced'),
          latency: Number(r.headers.get('X-Response-Time-Ms') || 0)
        }))
    );
  }

  const results = await Promise.all(promises);
  const totalDuration = Math.round(performance.now() - startTime);

  const hits = results.filter(r => r.cache === 'HIT').length;
  const misses = results.filter(r => r.cache === 'MISS').length;
  const coalesced = results.filter(r => r.coalesced === 'true').length;

  statusBox.className = 'status-box burst';
  statusBox.innerHTML = `<strong>⚡ BURST COMPLETE (50 REQUESTS IN ${totalDuration}ms):</strong><br>
    Origin Hits: <strong>${misses}</strong> | Coalesced/Cached Hits: <strong>${hits + coalesced}</strong> | Singleflight Mitigated: <strong>${coalesced}</strong> simultaneous calls!`;

  addChartPoint(totalDuration / count, misses > 0 ? 'MISS' : 'HIT');

  btn.disabled = false;
  await refreshVisualizer();
  await refreshTelemetry();
}

// Fetch and render cache state (Doubly Linked List)
async function refreshVisualizer() {
  try {
    const res = await fetch('/api/cache');
    const data = await res.json();

    document.getElementById('policyBadge').innerText = `POLICY: ${data.policy}`;
    document.getElementById('occupiedSlots').innerText = data.itemCount;
    document.getElementById('totalSlots').innerText = data.maxItems;
    document.getElementById('memoryFootprintVal').innerText = formatBytes(data.currentSizeBytes);
    document.getElementById('evictionOrderDesc').innerText = data.policy === 'LRU'
      ? 'MRU (Head) → LRU (Tail)'
      : 'Highest Freq (Head) → Lowest Freq (Tail)';

    const container = document.getElementById('dynamicNodes');
    container.innerHTML = '';

    if (!data.nodes || data.nodes.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted); font-style:italic; padding: 0 16px;">[Cache Empty]</div>';
    } else {
      data.nodes.forEach((node, index) => {
        const isMRU = index === 0;
        const isLRU = index === data.nodes.length - 1 && data.nodes.length >= data.maxItems;

        const nodeCard = document.createElement('div');
        nodeCard.className = `cache-node-card ${isMRU ? 'mru-highlight' : ''} ${isLRU ? 'lru-danger' : ''}`;

        const shortKey = node.key.replace(/^https?:\/\/[^/]+/, '');
        const sizeStr = formatBytes(node.sizeBytes);

        let posBadge = '<span class="card-pos-badge card-pos-mid">SLOT ' + (index + 1) + '</span>';
        if (isMRU) posBadge = '<span class="card-pos-badge card-pos-mru">HEAD (MRU)</span>';
        if (isLRU) posBadge = '<span class="card-pos-badge card-pos-lru">TAIL (LRU)</span>';

        let ttlHtml = '';
        if (node.ttlRemainingMs !== null) {
          const ttlSec = Math.max(0, Math.round(node.ttlRemainingMs / 1000));
          const pct = Math.min(100, Math.max(0, (node.ttlRemainingMs / 30000) * 100));
          ttlHtml = `
            <div class="card-metrics">
              <span>TTL</span>
              <span>${ttlSec}s left</span>
            </div>
            <div class="card-ttl-bar">
              <div class="card-ttl-fill" style="width: ${pct}%"></div>
            </div>
          `;
        }

        nodeCard.innerHTML = `
          <div class="card-top">
            ${posBadge}
            <button class="card-delete-btn" title="Purge this key" onclick="purgeKey('${encodeURIComponent(node.key)}')">&times;</button>
          </div>
          <div class="card-key" title="${node.key}">${shortKey || node.key}</div>
          <div class="card-metrics">
            <span>Size: ${sizeStr}</span>
            <span>Freq: ${node.freq}</span>
          </div>
          ${ttlHtml}
        `;

        container.appendChild(nodeCard);

        // Add arrow between nodes if not last
        if (index < data.nodes.length - 1) {
          const arrow = document.createElement('div');
          arrow.className = 'pointer-arrow';
          arrow.innerHTML = '&harr;';
          container.appendChild(arrow);
        }
      });
    }

    // Render Eviction Log
    const logList = document.getElementById('evictionLogList');
    if (!data.evictionLog || data.evictionLog.length === 0) {
      logList.innerHTML = '<div class="log-empty">No evictions yet. When cache reaches capacity, dropped items appear here.</div>';
    } else {
      logList.innerHTML = '';
      data.evictionLog.slice(0, 5).forEach(item => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString();
        const shortKey = item.key.replace(/^https?:\/\/[^/]+/, '');
        const logItem = document.createElement('div');
        logItem.className = 'eviction-log-item';
        logItem.innerHTML = `
          <span><strong>[${item.reason}]</strong> ${shortKey}</span>
          <span style="color:var(--text-muted);">${timeStr}</span>
        `;
        logList.appendChild(logItem);
      });
    }

  } catch (err) {
    console.error('Visualizer update error:', err);
  }
}

// Fetch and render metrics
async function refreshTelemetry() {
  try {
    const res = await fetch('/api/metrics');
    const m = await res.json();

    document.getElementById('hitRatioVal').innerText = `${m.hitRatePercent}%`;
    document.getElementById('hitCountSub').innerText = `${m.hits} Hits / ${m.misses} Misses`;
    document.getElementById('avgLatencyVal').innerText = `${m.latency.avg} ms`;
    document.getElementById('p99LatencySub').innerText = `P99: ${m.latency.p99} ms (P50: ${m.latency.p50}ms)`;
    document.getElementById('coalescedVal').innerText = m.coalescedRequests;
    document.getElementById('bandwidthSavedVal').innerText = formatBytes(m.bytesSaved);
    document.getElementById('qpsVal').innerText = m.qps;
    document.getElementById('totalReqSub').innerText = `Total: ${m.totalRequests} Req`;

  } catch (err) {
    console.error('Metrics update error:', err);
  }
}

async function changePolicy() {
  const policy = document.getElementById('policySelect').value;
  await fetch('/api/cache/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy })
  });
  await refreshVisualizer();
}

async function changeCapacity() {
  const capacity = document.getElementById('capacitySelect').value;
  await fetch('/api/cache/capacity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capacity })
  });
  await refreshVisualizer();
}

async function purgeCache() {
  await fetch('/api/cache/purge', { method: 'POST' });
  await refreshVisualizer();
  await refreshTelemetry();
}

async function purgeKey(encodedKey) {
  await fetch(`/api/cache/key?url=${encodedKey}`, { method: 'DELETE' });
  await refreshVisualizer();
}

async function resetMetrics() {
  await fetch('/api/metrics/reset', { method: 'POST' });
  latencyChart.data.labels = [];
  latencyChart.data.datasets[0].data = [];
  latencyChart.data.datasets[0].pointBackgroundColor = [];
  latencyChart.data.datasets[0].pointBorderColor = [];
  latencyChart.update();
  await refreshTelemetry();
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
  initChart();
  refreshVisualizer();
  refreshTelemetry();

  // Periodic visual tick for TTL countdown & telemetry
  setInterval(() => {
    refreshVisualizer();
    refreshTelemetry();
  }, 2000);
});
