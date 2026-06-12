// Tiny in-memory rate limiter (no dependencies). Fixed-window per key+route.
// State resets on redeploy — fine for basic brute-force / abuse protection on
// the public auth endpoints. For multi-instance scale, swap the Map for Redis.
const buckets = new Map();

function clientKey(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimit({ windowMs, max, name = 'rl', message } = {}) {
  return (req, res, next) => {
    const key = `${name}:${clientKey(req)}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.count++;
    if (b.count > max) {
      const retrySec = Math.max(1, Math.ceil((b.reset - now) / 1000));
      res.set('Retry-After', String(retrySec));
      return res.status(429).json({
        error: message || `Too many requests. Please try again in ${Math.ceil(retrySec / 60)} minute(s).`,
        retryAfter: retrySec,
      });
    }
    next();
  };
}

// Periodically drop expired buckets so the Map can't grow unbounded.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 10 * 60 * 1000);
if (sweep.unref) sweep.unref();

module.exports = { rateLimit };
