/**
 * Authentication routes.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, getMe, register } from '../controllers/auth.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.schema.js';

/**
 * Rate limiter #1 - per IP.
 * Protects the login endpoint against brute force attacks coming from a
 * single host. Successful logins are not counted, so a legitimate user who
 * signs in repeatedly is never locked out.
 */
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many login attempts from this device. Please try again in 15 minutes.',
    errors: [],
  },
});

/**
 * Rate limiter #2 - per email address.
 * Stops a distributed attack (many IPs, one account) from guessing a
 * password.
 */
const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => String(req.body?.email || 'unknown').toLowerCase(),
  message: {
    success: false,
    message: 'Too many login attempts for this account. Please try again in 15 minutes.',
    errors: [],
  },
});

const router = Router();

/** POST /api/auth/login - the only public write endpoint. */
router.post(
  '/login',
  loginIpLimiter,
  loginEmailLimiter,
  validate({ body: loginSchema }),
  login,
);

/**
 * POST /api/auth/logout - clears the session cookie.
 * Intentionally public: a user with an expired/invalid token must still be
 * able to clear the stale cookie instead of being stuck in a 401 loop.
 */
router.post('/logout', logout);

/** GET /api/auth/me - profile of the signed in user. */
router.get('/me', protect, getMe);

/** POST /api/auth/register - create an additional admin account (admin only). */
router.post(
  '/register',
  protect,
  authorize('admin'),
  validate({ body: registerSchema }),
  register,
);

export default router;
