const jwt = require('jsonwebtoken');

// JWT_SECRET MUST be set on any deployed host. A weak/known secret lets anyone
// forge a Bearer token for any userId (full account + admin impersonation), so
// we fail fast at boot rather than silently signing with a committed default.
const IS_DEPLOYED = process.env.NODE_ENV === 'production'
  || !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RENDER);
const SECRET = process.env.JWT_SECRET || (
  IS_DEPLOYED
    ? (() => { throw new Error('JWT_SECRET is required on deployed hosts — refusing to start with an insecure default.'); })()
    : 'screenrec-dev-secret-change-in-prod'
);

function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Express middleware — attaches req.userId or returns 401
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const { userId } = verifyToken(header.slice(7));
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signToken, verifyToken, requireAuth };
