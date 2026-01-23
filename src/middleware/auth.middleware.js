import logger from '#config/logger.js';
import { jwttoken } from '#utils/jwt.js';
import { cookies } from '#utils/cookies.js';

const authMiddleware = (req, res, next) => {
  try {
    const cookieToken = cookies.get(req, 'token');
    const authHeader = req.get('Authorization') || req.headers.authorization;

    let token = cookieToken;

    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = jwttoken.verify(token);

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (e) {
    logger.error('Authentication middleware error', e);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export default authMiddleware;
