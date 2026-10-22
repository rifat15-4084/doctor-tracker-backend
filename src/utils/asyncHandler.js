/**
 * Wraps an async route handler so rejected promises are forwarded to the
 * central error middleware instead of crashing the process or hanging the
 * request.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} fn
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
