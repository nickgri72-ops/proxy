const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve the start page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy any user-entered URL
app.get('/proxy', (req, res, next) => {
    const url = req.query.url;
    if (!url) return res.send("No URL provided");

    createProxyMiddleware({
        target: url,
        changeOrigin: true,
        selfHandleResponse: true,
        onProxyRes: (proxyRes, req2, res2) => {
            let body = [];
            proxyRes.on('data', chunk => body.push(chunk));
            proxyRes.on('end', () => {
                body = Buffer.concat(body).toString();
                res2.send(body);
            });
        }
    })(req, res, next);
});

app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));
