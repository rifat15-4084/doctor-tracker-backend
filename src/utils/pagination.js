/**
 * Server side pagination helpers.
 *
 * The API always paginates in the database (skip/limit) - never in memory -
 * so response times stay flat as the collection grows.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

/**
 * Normalise the `page` / `limit` values coming from the request.
 * @param {{page?: number|string, limit?: number|string}} query
 */
export const getPagination = ({ page, limit } = {}) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || DEFAULT_PAGE);
  const parsedLimit = Number.parseInt(limit, 10) || DEFAULT_LIMIT;
  const safeLimit = Math.min(Math.max(1, parsedLimit), MAX_LIMIT);

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

/**
 * Build the `pagination` block returned with every list response.
 * @param {{page:number, limit:number}} page
 * @param {number} total total number of matching documents
 */
export const buildPaginationMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});

/**
 * Convert a sortable field string (`"-createdAt"`) into a Mongo sort object.
 * Only whitelisted fields are accepted - the value never reaches Mongo raw.
 * @param {string|undefined} sort
 * @param {Record<string, 1|-1>} allowed
 * @param {Record<string, 1|-1>} fallback
 */
export const buildSort = (sort, allowed, fallback = { createdAt: -1 }) => {
  if (!sort) return fallback;
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  if (!Object.prototype.hasOwnProperty.call(allowed, field)) return fallback;
  return { [field]: descending ? -1 : 1 };
};

export default { getPagination, buildPaginationMeta, buildSort, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT };
