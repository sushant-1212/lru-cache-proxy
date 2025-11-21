# 🚀 LRU Proxy Node: High-Performance Caching Engine

> A low-latency proxy server implementing a Least Recently Used (LRU) eviction policy with real-time memory telemetry and performance visualization.
![Dashboard Preview](./dashboard-preview.png.jpeg)
*(Place your screenshot in the folder and name it dashboard-preview.png)*

## 📋 Project Overview
This project demonstrates the implementation of custom data structures to optimize network performance. It acts as a middleware proxy that intercepts API requests, caches responses in memory using an **LRU algorithm**, and serves repeated requests instantly.

**Key Engineering Metrics:**
* **Latency Reduction:** ~99.6% (Decreased from ~2000ms API fetch to <8ms memory retrieval).
* **Time Complexity:** O(1) for both `GET` and `PUT` operations using a Hash Map + Doubly Linked List logic.
* **Memory Management:** Fixed-capacity buffer with auto-eviction of the least recently accessed data.

## 🛠 Tech Stack
* **Runtime:** Node.js (v20+)
* **Server:** Express.js
* **Visualization:** Chart.js (Real-time telemetry)
* **Architecture:** REST Proxy pattern

## ⚡ How It Works (The Logic)
The engine uses a custom `LRUCache` class rather than relying on external libraries like Redis, demonstrating fundamental computer science concepts.

1.  **Client Request:** The user requests a URL via the dashboard.
2.  **Cache Check:** The server checks its internal `Map`.
    * **HIT:** Returns data immediately (Latency: <10ms). The item is moved to the "Most Recently Used" (MRU) position.
    * **MISS:** Fetches data from the external API (Latency: ~2s), caches the result, and returns it.
3.  **Eviction:** If the cache exceeds capacity (Limit: 3), the item at the "Least Recently Used" (LRU) tail is dropped to free memory.

## 📂 Project Structure
```bash
├── public/             # Frontend Dashboard (System Monitor UI)
│   └── index.html      # Real-time graph & memory visualization
├── LruCache.js         # Core Logic (The Data Structure)
├── index.js            # Express Proxy Server & API Routes
└── README.md           # Documentation