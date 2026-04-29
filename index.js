const express = require('express');
const axios = require('axios');
const cors = require('cors');
const LRUCache = require('./LruCache');

const app = express();
const PORT = 3000;
const proxyCache = new LRUCache(3);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

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
            res.setHeader('X-Cache', 'HIT');
            return res.json(cachedData);
        }
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
