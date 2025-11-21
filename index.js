const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Added for debugging
const LRUCache = require('./LruCache'); 

const app = express();
const PORT = 3000;
const proxyCache = new LRUCache(3); 

app.use(cors());
app.use(express.json());

// --- START DEBUGGING SECTION ---
const publicPath = path.join(__dirname, 'public');

console.log("------------------------------------------------");
console.log("📂 Server is looking for files here:", publicPath);

try {
    // This checks what files are actually inside that folder
    const files = fs.readdirSync(publicPath);
    console.log("📄 Files found in public folder:", files);
} catch (error) {
    console.log("❌ ERROR: The 'public' folder DOES NOT EXIST at this path!");
    console.log("   Make sure the folder is named exactly 'public' (lowercase)");
}
console.log("------------------------------------------------");

// 1. Force the path to be correct
app.use(express.static(publicPath));

// 2. Backup route: If they go to "/", force send the file
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send(`<h1>Error</h1><p>Could not find index.html at: ${indexPath}</p>`);
    }
});
// --- END DEBUGGING SECTION ---


// YOUR EXISTING ROUTES (Keep these!)
app.get('/cache-stats', (req, res) => {
    res.json({
        cache: proxyCache.toArray(),
        size: proxyCache.cache.size,
        capacity: proxyCache.capacity
    });
});

app.get('/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing url" });

    try {
        const cachedData = proxyCache.get(url);
        if (cachedData) {
            console.log(`⚡ HIT: ${url}`);
            res.setHeader('X-Cache', 'HIT');
            return res.json(cachedData);
        }

        console.log(`🌐 MISS: ${url} (Fetching...)`);
        await new Promise(resolve => setTimeout(resolve, 2000)); 

        const response = await axios.get(url);
        proxyCache.put(url, response.data);

        res.setHeader('X-Cache', 'MISS');
        return res.json(response.data);

    } catch (error) {
        return res.status(500).json({ error: "Error fetching data" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
});