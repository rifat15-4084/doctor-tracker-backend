/**
 * Zod powered request validation.
 *
 * Every route declares the schemas it expects; the middleware parses and
 * coerces `body`, `query` and `params` and replaces them with the validated
 * (and type-coerced) values, so controllers can trust their input.
 *
 * Validation failures are reported as `400` with a clean, field level list:
 *   { success: false, message: 'Validation failed', errors: [{ field, message }] }
 */
import { ApiError } from '../utils/ApiError.js';

/**
 * Convert a ZodError into a flat list of `{ field, message, code }`.
 * @param {ZodError} error
 * @returns {Array<{field:string,message:string,code?:string}>}
 */
const formatZodError = (error) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || issue.code,
    message: issue.message,
    code: issue.code,
  }));

/**
 * @param {{body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny}} schemas
 * @returns {import('express').RequestHandler}
 */
export const validate = (schemas = {}) => (req, _res, next) => {
  const errors = [];

  for (const source of ['body', 'query', 'params']) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source] ?? {});

    if (!result.success) {
      errors.push(...formatZodError(result.error));
      continue;
    }

    // `req.query` is an accessor on the Express request prototype, so a plain
    // assignment would throw in strict mode (ESM). Defining an own property
    // shadows the prototype getter safely.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  if (errors.length) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  return next();
};

export { formatZodError };
export default validate;
