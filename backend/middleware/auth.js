const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');

// Short cache so deleted/suspended accounts lose access quickly without a DB hit on every request.
const USER_CACHE_TTL_MS = 30 * 1000;
const userCache = new Map();

async function loadActiveUser(userId) {
  const cached = userCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.user;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, role, status')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;

  userCache.set(userId, { user, expires: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

function invalidateUser(userId) {
  userCache.delete(userId);
}

/** Verifies a JWT and returns the live user record, or null if the token/user is not valid. */
async function resolveToken(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
  if (decoded.purpose || !decoded.userId) return null; // e.g. password-reset tokens are not session tokens

  const user = await loadActiveUser(decoded.userId);
  if (!user || user.status === 'suspended') return null;
  return { id: user.id, userId: user.id, role: user.role, name: user.name };
}

function signSessionToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const user = await resolveToken(token);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  }
  next();
};

const requireAdmin = [authenticate, requireRole('admin')];

module.exports = { authenticate, requireRole, requireAdmin, resolveToken, signSessionToken, invalidateUser };
