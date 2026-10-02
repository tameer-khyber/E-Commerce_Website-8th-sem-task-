const jwt = require('jsonwebtoken');

/**
 * requireAdmin middleware
 * Checks for a valid Bearer JWT and verifies the payload role is 'admin'.
 *   - No token or malformed header → 401 Authentication required
 *   - Valid token but role !== 'admin'  → 403 Administrator access required
 *   - Invalid or expired token          → 401 Invalid or expired token
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAdmin };
