const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// TODO(remove after 2026-08-27): pre-migration JWTs (signed before multi-role
// support) carry a singular `role` string instead of a `roles` array. This
// fallback keeps those already-issued 7-day tokens working until they expire.
function getUserRoles(reqUser) {
  return reqUser.roles || (reqUser.role ? [reqUser.role] : []);
}

function requireRole(...allowed) {
  return (req, res, next) => {
    const userRoles = getUserRoles(req.user);
    if (!allowed.some(r => userRoles.includes(r))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, getUserRoles };
