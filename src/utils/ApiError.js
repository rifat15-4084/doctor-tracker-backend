/**
 * Operational error type used across the whole API.
 *
 * Anything thrown that is *not* an ApiError is treated as an unexpected bug
 * by the error handler (500 + generic message, no details leaked).
 */
export class ApiError extends Error {
  /**
   * @param {string} message  Human readable message returned to the client.
   * @param {number} statusCode HTTP status code (defaults to 500).
   * @param {Array<{field?:string,message:string,code?:string}>} errors Field level details.
   * @param {boolean} isOperational Marks the error as "expected" (safe to show).
   */
  constructor(message, statusCode = 500, errors = [], isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = Array.isArray(errors) ? errors : [];
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors = []) {
    return new ApiError(message, 400, errors);
  }

  static unauthorized(message = 'Unauthorized', errors = []) {
    return new ApiError(message, 401, errors);
  }

  static forbidden(message = 'Forbidden', errors = []) {
    return new ApiError(message, 403, errors);
  }

  static notFound(message = 'Resource not found', errors = []) {
    return new ApiError(message, 404, errors);
  }

  static conflict(message = 'Resource already exists', errors = []) {
    return new ApiError(message, 409, errors);
  }

  static tooManyRequests(message = 'Too many requests', errors = []) {
    return new ApiError(message, 429, errors);
  }

  static internal(message = 'Internal server error', errors = []) {
    return new ApiError(message, 500, errors, false);
  }
}

export default ApiError;
