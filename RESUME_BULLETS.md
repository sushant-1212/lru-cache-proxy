# 📄 Resume Ready Bullet Points & Interview Talking Points

Use these high-impact bullet points directly on your resume, tailored for **Software Engineer (SWE)**, **Backend Engineer**, and **Systems/Infrastructure** roles.

---

## 🎯 Option 1: Backend & Distributed Systems Focus (Recommended)

> **High-Performance Caching Reverse Proxy & Gateway Engine** | *Node.js, Express, Distributed Systems*
> * Architected an RFC 7234-compliant reverse caching proxy leveraging a custom **$O(1)$ Doubly-Linked List + Hash Map** data structure with pluggable eviction policies (**LRU** and **LFU**) and dynamic byte-size memory limits.
> * Implemented **Singleflight (Request Coalescing)** to mitigate cache stampedes (thundering herd), collapsing 100 concurrent cache misses into a single origin invocation and slashing burst origin load by **99%**.
> * Engineered HTTP caching mechanisms including **ETag generation**, conditional validation (**`304 Not Modified`**), and **Stale-While-Revalidate (SWR)** background revalidation for zero-latency stale reads.
> * Reduced network latency by **~97.7%** (from ~66ms origin fetch to **<1.5ms** in-memory retrieval), validated through an automated telemetry pipeline tracking P50/P90/P99 latencies and real-time QPS.

---

## 🎯 Option 2: Core Data Structures & Systems Engineering Focus

> **Intelligent In-Memory Caching Engine & Telemetry Visualizer** | *JavaScript, Algorithms, Systems*
> * Designed and benchmarked custom **LRU** and **LFU** caching engines from scratch using sentinel-node Doubly Linked Lists and frequency buckets, guaranteeing strictly **$O(1)$ lookups, insertions, and evictions**.
> * Integrated active & passive TTL expiration sweeps and byte-level memory tracking to prevent memory leaks and bound heap allocation within strict memory budgets.
> * Built an interactive real-time visualizer dashboard with Chart.js displaying live linked-list node pointer shifts (`MRU <-> LRU`), telemetry percentiles, and 1-click burst load generation.
> * Authored comprehensive automated test suites and benchmarking scripts measuring throughput, percentile latencies, and cache hit distributions.

---

## 🎯 Option 3: Concise 2-Bullet Version (For space-constrained resumes)

> **NexusProxy — Caching Reverse Proxy & Telemetry Engine** | *Node.js, Express, Docker*
> * Built a high-throughput RFC 7234 caching proxy using an $O(1)$ Doubly Linked List + Map architecture with Singleflight request coalescing, eliminating cache stampedes and reducing latency by **97.7%** (P50: 1.4ms).
> * Implemented ETag conditional revalidation (`304 Not Modified`), Stale-While-Revalidate background updates, dynamic byte-size budgeting, and an interactive real-time memory visualizer.

---

## 💡 How to Ace Your Technical Interviews with this Project

When interviewers ask *"Tell me about a project where you solved a performance or architectural challenge"*, use this framework:

### 1. The Core Architecture ($O(1)$ Time Complexity)
* **Question**: *"Why didn't you just use an array or a standard JavaScript Map?"*
* **Answer**: *"While JS Maps preserve insertion order, relying on that obscures low-level memory layout and pointer manipulation. I implemented a classic Doubly Linked List with dummy Head and Tail sentinel nodes coupled with a Hash Map. The Hash Map provides $O(1)$ key lookup to locate the node pointer, while the Doubly Linked List allows $O(1)$ removal and unlinking from any position without $O(N)$ array shifting. Head represents the Most Recently Used (MRU) node, and Tail represents the Least Recently Used (LRU) node."*

### 2. The Thundering Herd / Cache Stampede Problem
* **Question**: *"What happens if a million users request the same expired resource simultaneously?"*
* **Answer**: *"Without protection, every request results in a cache miss that hits the origin database at the same millisecond — causing cascade failures. I solved this by implementing the Singleflight (Request Coalescing) pattern. When a miss occurs, an in-flight Promise is registered for that URI. All subsequent concurrent requests await that same in-flight Promise rather than dispatching redundant upstream requests. In benchmark tests with 100 concurrent requests, this collapsed 99% of origin hits while serving all clients within milliseconds."*

### 3. RFC 7234 HTTP Caching & Conditional Requests
* **Question**: *"How did you handle cache invalidation and freshness?"*
* **Answer**: *"I implemented standard RFC 7234 directives. The proxy parses `Cache-Control` headers (`max-age`, `no-store`, `s-maxage`, `stale-while-revalidate`). I also implemented SHA-1 ETags for conditional validation: if the client passes `If-None-Match`, the proxy immediately returns an empty `304 Not Modified` response, avoiding unnecessary network payload transmission. For slightly stale entries, `stale-while-revalidate` delivers instantaneous stale responses to the client while revalidating from the origin asynchronously in the background."*

### 4. Pluggable Eviction Policies (LRU vs LFU)
* **Question**: *"When would LRU perform poorly compared to LFU?"*
* **Answer**: *"LRU suffers under sequential scanning or one-off bursts because newly accessed items immediately evict frequently accessed items. LFU solves this by tracking access frequencies. I implemented an $O(1)$ LFU cache using frequency buckets (a map of frequencies to doubly linked lists) and a `minFreq` pointer, allowing runtime comparisons between temporal locality (LRU) and frequency locality (LFU)."*
