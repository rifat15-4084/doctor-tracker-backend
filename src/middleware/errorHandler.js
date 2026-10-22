/**
 * Centralised error handler.
 *
 * Every error that reaches this middleware is converted into the same JSON
 * envelope so clients never have to guess the error shape:
 *
 *   { success: false, message: string, errors: [{ field, message }] }
 *
 * Stack traces and internal details are only exposed outside of production.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** Translate a Mongo/Mongoose error into a user friendly ApiError. */
const normalise = (error) => {
  if (error instanceof ApiError) return error;

  // Zod validation error (thrown outside of the validate middleware).
  if (error?.name === 'ZodError' && Array.isArray(error.issues)) {
    return ApiError.badRequest(
      'Validation failed',
      error.issues.map((issue) => ({
        field: issue.path.join('.') || issue.code,
        message: issue.message,
        code: issue.code,
      })),
    );
  }

  // Mongoose schema validation (e.g. required field missing on save).
  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.message,
      code: item.kind,
    }));
    return ApiError.badRequest('Validation failed', errors);
  }

  // Invalid ObjectId in a path parameter.
  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid ${error.path || 'identifier'} value.`);
  }

  // Unique index violation (duplicate email, ...).
  if (error?.code === 11000) {
    const fields = Object.keys(error.keyValue || {});
    return ApiError.conflict(
      fields.length
        ? `A record with this ${fields.join(', ')} already exists.`
        : 'A record with these values already exists.',
      fields.map((field) => ({ field, message: 'Must be unique' })),
    );
  }

  // Body parser errors (malformed JSON, payload too large, ...).
  if (error?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Malformed JSON payload.');
  }
  if (error?.type === 'entity.too.large') {
    return ApiError.badRequest('Request payload is too large.');
  }

  // JWT errors that were not handled by the auth middleware.
  if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Invalid or expired authentication token.');
  }

  // Everything else is an unexpected bug: log it, but never leak it.
  return new ApiError(
    env.isProd ? 'Internal server error' : error?.message || 'Internal server error',
    error?.statusCode || 500,
    [],
    false,
  );
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const apiError = normalise(err);

  if (!apiError.isOperational || apiError.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    success: false,
    message: apiError.message,
    errors: apiError.errors || [],
  };

  // NOTE: stack traces are logged server-side only - never sent to clients,
  // in any environment, so the error envelope is always identical.
  res.status(apiError.statusCode || 500).json(body);
};

export default errorHandler;
