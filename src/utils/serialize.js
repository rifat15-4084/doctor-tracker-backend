/**
 * Serialisation helpers that give every endpoint the exact same document
 * shape.
 *
 * Why this exists: a Mongoose document serialised through `res.json()` gets
 * the `id` virtual, but a **lean** document does not - it only has `_id`.
 * Mixing the two produced responses where `id` was sometimes present and
 * sometimes `undefined`, which broke the UI (row keys, detail links, cache
 * invalidation).
 *
 * Every list/detail endpoint therefore goes through these helpers:
 *   - `_id`            -> `id` (always a plain string)
 *   - `doctor`        -> `doctorId` (string) + `doctorName` (string | null)
 *   - `__v`           -> removed
 */

/** Convert an ObjectId (or anything stringifiable) into a plain string. */
export const toIdString = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') return value.toString();
  return null;
};

/**
 * Turn any Mongoose document / lean object into a plain object.
 * @param {object} doc
 * @returns {object}
 */
const toPlain = (doc) => {
  if (!doc) return {};
  if (typeof doc.toObject === 'function') return doc.toObject();
  return { ...doc };
};

/**
 * Public shape of a doctor.
 * @param {object} doctor Mongoose document or lean object
 * @param {{patientsCount?: number}} [extra] additional computed fields
 */
export const serializeDoctor = (doctor, extra = {}) => {
  const doc = toPlain(doctor);
  const { _id, id, __v, ...rest } = doc;

  return {
    id: toIdString(_id ?? id),
    ...rest,
    ...extra,
  };
};

/**
 * Public shape of a patient.
 *
 * @param {object} patient Mongoose document or lean object
 * @param {{doctorName?: string|null}} [extra] the resolved doctor name
 */
export const serializePatient = (patient, extra = {}) => {
  const doc = toPlain(patient);
  const { _id, id, __v, doctor, ...rest } = doc;

  return {
    id: toIdString(_id ?? id),
    ...rest,
    doctorId: toIdString(doctor),
    ...extra,
  };
};

/**
 * Build a `Map<doctorId, doctorName>` for a set of doctor documents.
 * @param {Array<{_id: unknown, name: string}>} doctors
 */
export const buildDoctorNameMap = (doctors = []) =>
  new Map(doctors.map((doctor) => [toIdString(doctor._id), doctor.name]));

export default { toIdString, serializeDoctor, serializePatient, buildDoctorNameMap };
