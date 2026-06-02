const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'screenrec-dev-secret-change-in-prod';

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
