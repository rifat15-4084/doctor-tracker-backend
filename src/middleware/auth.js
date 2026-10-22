/**
 * Authentication & authorisation middleware.
 *
 * The JWT is transported in an httpOnly cookie (`dt_token`) so that
 * JavaScript running in the browser can never read it (mitigating XSS token
 * theft). For non-browser clients (mobile apps, curl, CI) the very same
 * token is accepted through an `Authorization: Bearer <token>` header.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Pull the raw JWT out of the request (cookie first, Bearer header second).
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export const extractToken = (req) => {
  const fromCookie = req.cookies?.[env.cookie.name];
  if (fromCookie) return fromCookie;

  const header = req.headers?.authorization || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return null;
};

/**
 * Sign a JWT for the given user.
 * @param {{_id: any, email: string, role: string}} user
 * @returns {string}
 */
export const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), email: user.email, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

/**
 * Protect a route: requires a valid, non-expired token for an existing user.
 */
export const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);

  if (!token) {
    throw ApiError.unauthorized('Authentication required. Please sign in.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }
    throw ApiError.unauthorized('Invalid authentication token.');
  }

  // Re-read the user so that deleted accounts or changed roles take effect
  // immediately instead of at token expiry.
  const user = await User.findById(payload.sub).select('name email role createdAt').lean();
  if (!user) {
    throw ApiError.unauthorized('The account linked to this token no longer exists.');
  }

  req.user = user;
  next();
});

/**
 * Restrict a route to the given roles.
 * @param {...('admin'|'staff')} roles
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action.'));
    }
    return next();
  };

export default { protect, authorize, signToken, extractToken };
