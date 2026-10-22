/**
 * Authentication controller.
 *
 * The session token is delivered twice on purpose:
 *   1. as an httpOnly cookie  -> used by the browser SPA (unreadable by JS)
 *   2. in the JSON response   -> used by non browser clients that then send
 *                                `Authorization: Bearer <token>`
 */
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { signToken } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';

/**
 * Build the cookie options for the session token.
 * Production: `sameSite=none` + `secure=true` (works across domains).
 * Development: `sameSite=lax` + `secure=false` (works over plain http).
 *
 * @param {string} [token] when provided, the cookie lifetime mirrors the JWT
 */
export const cookieOptions = (token) => {
  // Keep the cookie and the JWT in sync instead of assuming a fixed lifetime.
  let maxAge = 7 * 24 * 60 * 60 * 1000;
  if (token) {
    const decoded = jwt.decode(token);
    if (decoded?.exp) maxAge = Math.max(0, decoded.exp * 1000 - Date.now());
  }

  return {
    httpOnly: env.cookie.httpOnly,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    domain: env.cookie.domain,
    path: env.cookie.path,
    maxAge,
  };
};

/**
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // `password` has `select: false`, so it must be requested explicitly.
  const user = await User.findOne({ email }).select('+password');

  // Identical response for "unknown user" and "wrong password" so the
  // endpoint cannot be used to enumerate registered accounts.
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  const token = signToken(user);

  res.cookie(env.cookie.name, token, cookieOptions(token));

  return sendSuccess(res, {
    message: 'Signed in successfully',
    data: {
      user: user.toPublicJSON(),
      token,
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });
});

/**
 * POST /api/auth/logout
 * Clears the session cookie. Always answers 200 (idempotent logout).
 */
export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(env.cookie.name, {
    httpOnly: env.cookie.httpOnly,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    domain: env.cookie.domain,
    path: env.cookie.path,
  });

  return sendSuccess(res, { message: 'Signed out successfully', data: null });
});

/**
 * GET /api/auth/me
 * Returns the profile of the currently authenticated user.
 */
export const getMe = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: {
      id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      createdAt: req.user.createdAt,
    },
  }),
);

/**
 * POST /api/auth/register
 * Admin only account creation (used to bootstrap additional staff accounts).
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.exists({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists.', [
      { field: 'email', message: 'Must be unique' },
    ]);
  }

  const user = await User.create({ name, email, password, role: 'admin' });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Account created successfully',
    data: { user: user.toPublicJSON() },
  });
});

export default { login, logout, getMe, register, cookieOptions };
