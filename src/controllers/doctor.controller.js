/**
 * Doctor controller.
 *
 * All list endpoints are paginated in the database (skip/limit) and executed
 * with `.lean()` + field projection, so the API never ships more data than
 * the UI needs and never hydrates full Mongoose documents.
 *
 * Every response goes through `src/utils/serialize.js` so the client always
 * receives `id` (never a bare `_id`) and a stable, documented shape.
 */
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildPaginationMeta, buildSort, getPagination } from '../utils/pagination.js';
import { buildExactRegex, buildSearchRegex } from '../utils/search.js';
import { sendCreated, sendSuccess } from '../utils/response.js';
import { serializeDoctor, serializePatient, toIdString } from '../utils/serialize.js';
import { withOptionalTransaction } from '../utils/transaction.js';

/** Fields returned by the doctor list / detail endpoints. */
const DOCTOR_FIELDS = 'name specialization hospital phone email createdAt updatedAt';

/** Sortable doctor fields (whitelist - the user input is never passed raw). */
const DOCTOR_SORT_FIELDS = {
  createdAt: 1,
  name: 1,
  specialization: 1,
  hospital: 1,
};

/**
 * Build the Mongo filter for `GET /api/doctors`.
 *
 * Search terms are escaped before they are used in a `$regex` so a malicious
 * input such as `.*` can never turn into a "match everything" query.
 */
const buildDoctorFilter = ({ search, specialization, hospital, from, to }) => {
  const filter = {};

  if (search) {
    const term = buildSearchRegex(search);
    filter.$or = [
      { name: term },
      { specialization: term },
      { hospital: term },
      { email: term },
    ];
  }

  if (specialization) filter.specialization = buildExactRegex(specialization);
  if (hospital) filter.hospital = buildExactRegex(hospital);

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return filter;
};

/**
 * Count the patients of every doctor on the current page.
 *
 * One grouped aggregation instead of N `countDocuments` calls: the
 * `patient_doctor_idx` index serves the `$match`, the `$group` happens in the
 * database and only one small result set comes back to Node.
 *
 * @param {Array<{_id: unknown}>} doctors
 * @returns {Promise<Map<string, number>>} doctorId -> patient count
 */
const countPatientsPerDoctor = async (doctors) => {
  const doctorIds = doctors.map((doctor) => doctor._id);
  if (!doctorIds.length) return new Map();

  const rows = await Patient.aggregate([
    { $match: { doctor: { $in: doctorIds } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [toIdString(row._id), row.count]));
};

/**
 * GET /api/doctors
 * Query: search, specialization, hospital, from, to, page, limit, sort
 */
export const listDoctors = asyncHandler(async (req, res) => {
  const query = req.query;
  const { page, limit, skip } = getPagination(query);
  const filter = buildDoctorFilter(query);
  const sort = buildSort(query.sort, DOCTOR_SORT_FIELDS, { createdAt: -1 });

  // `countDocuments` + `find` run in parallel on the same connection pool.
  const [total, doctors] = await Promise.all([
    Doctor.countDocuments(filter),
    Doctor.find(filter)
      .select(DOCTOR_FIELDS)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const counts = await countPatientsPerDoctor(doctors);

  return sendSuccess(res, {
    data: doctors.map((doctor) =>
      serializeDoctor(doctor, { patientsCount: counts.get(toIdString(doctor._id)) ?? 0 }),
    ),
    pagination: buildPaginationMeta({ page, limit }, total),
  });
});

/**
 * GET /api/doctors/:id
 * Returns the doctor plus the number of patients assigned to them.
 */
export const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id).select(DOCTOR_FIELDS).lean();

  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const patientsCount = await Patient.countDocuments({ doctor: doctor._id });

  return sendSuccess(res, {
    data: serializeDoctor(doctor, { patientsCount }),
  });
});

/**
 * POST /api/doctors
 */
export const createDoctor = asyncHandler(async (req, res) => {
  const payload = {
    name: req.body.name,
    specialization: req.body.specialization,
    hospital: req.body.hospital,
    phone: req.body.phone ?? '',
    email: req.body.email,
  };

  const duplicate = await Doctor.exists({ email: payload.email });
  if (duplicate) {
    throw ApiError.conflict('A doctor with this email already exists.', [
      { field: 'email', message: 'Must be unique' },
    ]);
  }

  const doctor = await Doctor.create(payload);

  return sendCreated(res, serializeDoctor(doctor), 'Doctor created successfully');
});

/**
 * PUT /api/doctors/:id
 * Partial update of a doctor record.
 */
export const updateDoctor = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const fields = ['name', 'specialization', 'hospital', 'phone', 'email'];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) doctor[field] = req.body[field];
  });

  await doctor.save();

  const patientsCount = await Patient.countDocuments({ doctor: doctor._id });

  return sendSuccess(res, {
    data: serializeDoctor(doctor, { patientsCount }),
    message: 'Doctor updated successfully',
  });
});

/**
 * GET /api/doctors/:id/patients
 * Paginated list of the patients treated by one doctor.
 */
export const listDoctorPatients = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit, skip } = getPagination(req.query);
  const sort = buildSort(req.query.sort, { createdAt: 1, name: 1, age: 1 }, { createdAt: -1 });

  const doctor = await Doctor.findById(id).select('_id name specialization').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const filter = { doctor: doctor._id };

  if (req.query.search) {
    const term = buildSearchRegex(req.query.search);
    filter.$or = [{ name: term }, { phone: term }, { condition: term }];
  }

  const [total, patients] = await Promise.all([
    Patient.countDocuments(filter),
    Patient.find(filter)
      .select('name age gender phone condition doctor createdAt')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return sendSuccess(res, {
    data: patients.map((patient) => serializePatient(patient)),
    pagination: buildPaginationMeta({ page, limit }, total),
    doctor: {
      id: toIdString(doctor._id),
      name: doctor.name,
      specialization: doctor.specialization,
    },
  });
});

/**
 * POST /api/doctors/:id/patients
 * Creates a patient and assigns them to the doctor from the URL.
 */
export const createDoctorPatient = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doctor = await Doctor.findById(id).select('_id').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const patient = await Patient.create({
    name: req.body.name,
    age: req.body.age,
    gender: req.body.gender,
    phone: req.body.phone,
    condition: req.body.condition,
    doctor: doctor._id, // the doctor always comes from the URL
  });

  return sendCreated(res, serializePatient(patient), 'Patient created successfully');
});

/**
 * DELETE /api/doctors/:id/patients/:patientId
 * Removes a patient - but only if the patient really belongs to that doctor.
 */
export const deleteDoctorPatient = asyncHandler(async (req, res) => {
  const { id, patientId } = req.params;

  const doctor = await Doctor.findById(id).select('_id').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const patient = await Patient.findOne({ _id: patientId, doctor: doctor._id }).select('_id').lean();
  if (!patient) {
    throw ApiError.notFound('Patient not found for this doctor.');
  }

  await Patient.deleteOne({ _id: patient._id });

  return sendSuccess(res, {
    message: 'Patient deleted successfully',
    data: { id: toIdString(patient._id) },
  });
});

/**
 * DELETE /api/doctors/:id
 *
 * Deleting a doctor must not orphan their patients, so the endpoint is
 * "safe by default":
 *   - if the doctor still has patients the request is rejected with `409`
 *     and the caller must explicitly opt into the cascade with `?cascade=true`
 *   - with `?cascade=true` the doctor and all of their patients are removed
 *     inside a transaction when the server supports one (MongoDB Atlas does),
 *     so a failure can never leave dangling patient documents behind.
 */
export const deleteDoctor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cascade = req.query.cascade === 'true';

  const doctor = await Doctor.findById(id).select('_id name').lean();
  if (!doctor) throw ApiError.notFound('Doctor not found.');

  const patientsCount = await Patient.countDocuments({ doctor: doctor._id });

  if (patientsCount > 0 && !cascade) {
    throw new ApiError(
      `This doctor still has ${patientsCount} patient(s). Re-run with ?cascade=true to delete them together.`,
      409,
      [{ field: 'cascade', message: 'Set ?cascade=true to delete the doctor and their patients' }],
    );
  }

  const deletedPatients = await withOptionalTransaction(async (session) => {
    const options = session ? { session } : {};

    await Patient.deleteMany({ doctor: doctor._id }, options);
    await Doctor.deleteOne({ _id: doctor._id }, options);

    return patientsCount;
  });

  return sendSuccess(res, {
    message: 'Doctor deleted successfully',
    data: {
      id: toIdString(doctor._id),
      deletedPatients,
    },
  });
});

export default {
  listDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  listDoctorPatients,
  createDoctorPatient,
  deleteDoctorPatient,
  deleteDoctor,
};
