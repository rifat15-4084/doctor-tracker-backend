/**
 * Shared Zod building blocks reused across the different schemas.
 */
import { z } from 'zod';

/** MongoDB ObjectId as a 24 character hex string. */
export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid identifier: expected a 24 character hex ObjectId');

/**
 * A required, coerced number with friendly error messages
 * (e.g. `Age is required` instead of `Expected number, received nan`).
 *
 * NOTE: checks must be applied to the *coerced* schema. Passing a prepared
 * `z.number().min(1)` into `z.coerce.number(...)` silently discards its
 * checks (Zod rebuilds the number type), which would let `page=0` through.
 *
 * @param {{required?:string, int?:boolean, min?:number, max?:number, minMessage?:string, maxMessage?:string}} options
 */
export const numberField = ({
  required = 'This field is required',
  int = true,
  min,
  max,
  minMessage,
  maxMessage,
} = {}) => {
  let schema = z.coerce.number({
    required_error: required,
    invalid_type_error: int ? 'Expected a whole number' : 'Expected a number',
  });

  if (int) schema = schema.int('Expected a whole number');
  if (min !== undefined) schema = schema.min(min, minMessage);
  if (max !== undefined) schema = schema.max(max, maxMessage);

  return z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    schema,
  );
};

/**
 * Coerced number for pagination style query params. Kept as a named helper
 * for readability; delegates to `numberField`.
 * @param {{min?:number, max?:number, minMessage?:string, maxMessage?:string}} options
 */
export const coerceNumber = (options = {}) =>
  numberField({ required: 'Expected a number', int: true, ...options });

/**
 * Same idea as `coerceNumber` but for dates used in range filters.
 * An empty value is treated as "filter not provided".
 */
export const coerceDate = () =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.date({ invalid_type_error: 'Invalid date. Use an ISO-8601 date (YYYY-MM-DD).' }),
  );

/** Trimmed, non-empty optional string. */
export const optionalTrimmedString = (max = 200) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().max(max).optional(),
  );

export { z };
