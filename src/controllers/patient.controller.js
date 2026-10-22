/**
 * Patient controller.
 *
 * Every response goes through `src/utils/serialize.js`, so the client always
 * receives `id` (never a bare `_id`) plus the resolved `doctorName`.
 */
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildPaginationMeta, buildSort, getPagination } from '../utils/pagination.js';
import { buildExactRegex, buildSearchRegex } from '../utils/search.js';
import { sendCreated, sendSuccess } from '../utils/response.js';
import { buildDoctorNameMap, serializePatient, toIdString } from '../utils/serialize.js';

/** Fields returned by the patient list / detail endpoints. */
const PATIENT_FIELDS = 'name age gender phone condition doctor createdAt updatedAt';

/** Sortable patient fields (whitelist - the user input is never passed raw). */
const PATIENT_SORT_FIELDS = {
  createdAt: 1,
  name: 1,
  age: 1,
  condition: 1,
};

/**
 * Build the Mongo filter for `GET /api/patients`.
 * Search terms are escaped before they reach a `$regex`.
 */
const buildPatientFilter = ({ search, condition, doctor, from, to }) => {
  const filter = {};

  if (search) {
    const term = buildSearchRegex(search);
    filter.$or = [{ name: term }, { phone: term }, { condition: term }];
  }

  if (condition) filter.condition = buildExactRegex(condition);
  if (doctor) filter.doctor = doctor;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return filter;
};

/**
 * Resolve the names of the doctors referenced by a page of patients.
 * One query for the whole page - never one query per patient.
 *
 * @param {Array<{doctor: unknown}>} patients
 * @returns {Promise<Map<string, string>>} doctorId -> doctor name
 */
const resolveDoctorNames = async (patients) => {
  const doctorIds = [...new Set(patients.map((patient) => toIdString(patient.doctor)).filter(Boolean))];
  if (!doctorIds.length) return new Map();

  const doctors = await Doctor.find({ _id: { $in: doctorIds } }).select('name').lean();
  return buildDoctorNameMap(doctors);
};

/**
 * GET /api/patients
 * Query: search, condition, doctor, from, to, page, limit, sort
 */
export const listPatients = asyncHandler(async (req, res) => {
  const query = req.query;
  const { page, limit, skip } = getPagination(query);
  const filter = buildPatientFilter(query);
  const sort = buildSort(query.sort, PATIENT_SORT_FIELDS, { createdAt: -1 });

  const [total, patients] = await Promise.all([
    Patient.countDocuments(filter),
    Patient.find(filter)
      .select(PATIENT_FIELDS)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const doctorNames = await resolveDoctorNames(patients);

  return sendSuccess(res, {
    data: patients.map((patient) =>
      serializePatient(patient, {
        doctorName: doctorNames.get(toIdString(patient.doctor)) ?? null,
      }),
    ),
    pagination: buildPaginationMeta({ page, limit }, total),
  });
});

/**
 * GET /api/patients/:id
 */
export const getPatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id).select(PATIENT_FIELDS).lean();

  if (!patient) throw ApiError.notFound('Patient not found.');

  // Populate the doctor reference for a single document (cheap for one row).
  const doctor = await Doctor.findById(patient.doctor)
    .select('name specialization hospital email phone')
    .lean();

  return sendSuccess(res, {
    data: serializePatient(patient, {
      doctorName: doctor?.name ?? null,
      doctor: doctor
        ? {
            id: toIdString(doctor._id),
            name: doctor.name,
            specialization: doctor.specialization,
            hospital: doctor.hospital,
            email: doctor.email,
            phone: doctor.phone,
          }
        : null,
    }),
  });
});

/**
 * POST /api/patients
 */
export const createPatient = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.body.doctor).select('_id name').lean();
  if (!doctor) {
    throw ApiError.badRequest('The referenced doctor does not exist.', [
      { field: 'doctor', message: 'Unknown doctor' },
    ]);
  }

  const patient = await Patient.create({
    name: req.body.name,
    age: req.body.age,
    gender: req.body.gender,
    phone: req.body.phone,
    condition: req.body.condition,
    doctor: doctor._id,
  });

  return sendCreated(
    res,
    serializePatient(patient, { doctorName: doctor.name }),
    'Patient created successfully',
  );
});

/**
 * PUT /api/patients/:id
 * Partial update. The doctor can be re-assigned, but the new doctor must exist.
 */
export const updatePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw ApiError.notFound('Patient not found.');

  if (req.body.doctor) {
    const doctor = await Doctor.findById(req.body.doctor).select('_id name').lean();
    if (!doctor) {
      throw ApiError.badRequest('The referenced doctor does not exist.', [
        { field: 'doctor', message: 'Unknown doctor' },
      ]);
    }
    patient.doctor = doctor._id;
  }

  ['name', 'age', 'gender', 'phone', 'condition'].forEach((field) => {
    if (req.body[field] !== undefined) patient[field] = req.body[field];
  });

  await patient.save();

  const doctor = await Doctor.findById(patient.doctor).select('name').lean();

  return sendSuccess(res, {
    data: serializePatient(patient, { doctorName: doctor?.name ?? null }),
    message: 'Patient updated successfully',
  });
});

/**
 * DELETE /api/patients/:id
 */
export const deletePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id).select('_id').lean();
  if (!patient) throw ApiError.notFound('Patient not found.');

  await Patient.deleteOne({ _id: patient._id });

  return sendSuccess(res, {
    message: 'Patient deleted successfully',
    data: { id: toIdString(patient._id) },
  });
});

export default { listPatients, getPatient, createPatient, updatePatient, deletePatient };
