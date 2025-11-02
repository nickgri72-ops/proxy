// api/proxy.js
// Secure, personal proxy for Vercel serverless.
// - Requires header: x-proxy-key: <PROXY_API_KEY>
// - Accepts query param: ?url=https://target.example/path
// - Whitelist enforced via WHITELIST_HOSTS env var (comma-separated)
// - Optional: ALLOW_ORIGIN env var to set CORS origin (your frontend)

// Basic hop-by-hop header filter
const HOP_BY_HOP = new Set([
  'connection','keep-alive','proxy-authenticate','proxy-authorization','te',
  'trailers','transfer-encoding','upgrade','host'
]);

const { URL } = require('url');

const getWhitelist = () => {
  const raw = process.env.WHITELIST_HOSTS || '';
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
};

const whitelist = getWhitelist();
const MAX_PER_MIN = Number(process.env.MAX_PER_MIN || 60);

// In-memory soft rate limiter (ephemeral in serverless)
const rateMap = new Map();

function checkRate(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  let entry = rateMap.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + windowMs };
    rateMap.set(ip, entry);
    return { ok: true, remaining: MAX_PER_MIN - 1, resetAt: entry.resetAt };
  }
  if (entry.count >= MAX_PER_MIN) return { ok: false, remaining: 0, resetAt: entry.resetAt };
  entry.count += 1;
  return { ok: true, remaining: MAX_PER_MIN - entry.count, resetAt: entry.resetAt };
}

module.exports = async (req, res) => {
  try {
    // Auth
    const key = (req.headers['x-proxy-key'] || '').trim();
    if (!key || key !== process.env.PROXY_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized - invalid proxy key' });
    }

    // url param
    const targetUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter. Use /api/proxy?url=https://example.com' });
    }

    let target;
    try {
      target = new URL(targetUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid url parameter' });
    }

    // Whitelist check
    if (!whitelist.has(target.hostname)) {
      return res.status(403).json({ error: 'Forbidden - host not whitelisted' });
    }

    // Rate limit (soft)
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const rl = checkRate(ip);
    res.setHeader('x-rate-limit-remaining', String(rl.remaining));
    res.setHeader('x-rate-limit-reset', String(Math.floor(rl.resetAt / 1000)));
    if (!rl.ok) return res.status(429).json({ error: 'Too Many Requests' });

    // Build forwarded headers (strip hop-by-hop and secret)
    const forwarded = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lk = k.toLowerCase();
      if (HOP_BY_HOP.has(lk)) continue;
      if (lk === 'x-proxy-key') continue;
      forwarded[k] = v;
    }

    // Fetch target
    const fetchOptions = {
      method: req.method,
      headers: forwarded,
      redirect: 'follow'
    };

    // Forward body for non-GET/HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = req;
    }

    const fetchRes = await fetch(target.toString(), fetchOptions);

    // Copy response headers, stripping or altering a few
    for (const [k, v] of fetchRes.headers) {
      const lk = k.toLowerCase();
      if (HOP_BY_HOP.has(lk)) continue;
      if (lk === 'content-security-policy') continue; // avoid CSP blocking frontend
      // do not leak Set-Cookie if you want; we pass them through here but consider removing
      res.setHeader(k, v);
    }

    // CORS: only allow origin set in env var (or none if not set)
    if (process.env.ALLOW_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN);
      res.setHeader('Vary', 'Origin');
    }

    res.statusCode = fetchRes.status;
    // Stream body (Vercel Node runtime supports piping)
    const arrayBuffer = await fetchRes.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
