export default async function handler(req, res) {
  try {
    const target = req.query.url;
    if (!target) return res.status(400).json({ error: "Missing ?url=" });

    const response = await fetch(target, {
      method: req.method,
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
      },
      body: req.method !== "GET" ? req.body : undefined,
    });

    const data = await response.text();
    res.status(response.status).send(data);

  } catch (err) {
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
}