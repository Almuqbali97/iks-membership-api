import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

function getAuthToken(req) {
  const cookieToken = req.cookies?.token;
  if (cookieToken) return cookieToken;

  const authHeader = req.get('Authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

// Factory version — used by auth routes (passes jwtSecret explicitly)
export function authMiddleware({ jwtSecret }) {
  return async function (req, res, next) {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = await User.findById(payload.sub).lean();
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

// Plain middleware — reads JWT_SECRET from process.env at call time (like MIOC)
export async function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).lean();
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}
