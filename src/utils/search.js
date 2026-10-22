/**
 * Regex helpers.
 *
 * Every user supplied search term MUST be escaped before it reaches a MongoDB
 * `$regex` filter. Without escaping, a term such as `.*` would match every
 * document and `(a|b)+` could trigger catastrophic backtracking (ReDoS).
 * Escaping turns the input into a literal string so the query stays safe and
 * the intent ("contains this text") is preserved.
 */

/** Characters that carry special meaning inside a regular expression. */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Escape all regex meta characters in a user supplied string.
 * @param {string} value
 * @returns {string}
 */
export const escapeRegex = (value = '') => String(value).replace(REGEX_SPECIAL_CHARS, '\\$&');

/**
 * Build a safe "contains" RegExp from raw user input.
 * @param {string} value raw search term
 * @param {string} [flags] regex flags, defaults to case-insensitive
 * @returns {RegExp}
 */
export const buildSearchRegex = (value, flags = 'i') => new RegExp(escapeRegex(String(value).trim()), flags);

/**
 * Build a safe "exactly equals" RegExp (case-insensitive) - used for filter
 * dropdowns such as `specialization` or `hospital`.
 * @param {string} value
 * @returns {RegExp}
 */
export const buildExactRegex = (value) => new RegExp(`^${escapeRegex(String(value).trim())}$`, 'i');

export default { escapeRegex, buildSearchRegex, buildExactRegex };
