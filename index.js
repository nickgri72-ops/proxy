const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();

// Use Render's dynamic port
const PORT = process.env.PORT || 3000;

// Serve the start page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy route
app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.send("No URL provided");

    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' } // pretend to be a browser
        });
        let html = response.data;

        // Rewrite links so they go through the proxy
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('#')) {
                $(el).attr('href', `/proxy?url=${new URL(href, url).href}`);
            }
        });

        $('img, script, link').each((i, el) => {
            const attr = $(el).attr('src') ? 'src' : 'href';
            const val = $(el).attr(attr);
            if (val && !val.startsWith('#')) {
                $(el).attr(attr, `/proxy?url=${new URL(val, url).href}`);
            }
        });

        res.send($.html());
    } catch (err) {
        res.send("Error fet
