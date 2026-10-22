/**
 * Small helpers that keep every controller response shape identical.
 *
 * Success: { success: true, data, ... }
 * Failure: { success: false, message, errors }   (see middleware/errorHandler.js)
 */

export const sendSuccess = (
  res,
  { statusCode = 200, data = null, message, pagination, meta, doctor } = {},
) => {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  if (pagination) body.pagination = pagination;
  if (meta) body.meta = meta;
  if (doctor) body.doctor = doctor;
  return res.status(statusCode).json(body);
};

export const sendCreated = (res, data, message) =>
  sendSuccess(res, { statusCode: 201, data, message });

export default { sendSuccess, sendCreated };
