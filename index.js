const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

// Start page
app.get('/', (req, res) => {
    res.send(`
      <h1>Proxy Start Page</h1>
      <form action="/proxy" method="GET">
        <input name="url" placeholder="Enter site URL" required />
        <button type="submit">Go</button>
      </form>
    `);
});

// Proxy route
app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.send("No URL provided");

    try {
        const response = await axios.get(url);
        let html = response.data;

        // Use Cheerio to rewrite links
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
        res.send("Error fetching site: " + err.message);
    }
});

app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));
