/**
 * Doctor routes.
 */
import { Router } from 'express';
import {
  listDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  listDoctorPatients,
  createDoctorPatient,
  deleteDoctorPatient,
  deleteDoctor,
} from '../controllers/doctor.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createDoctorSchema,
  updateDoctorSchema,
  listDoctorsQuerySchema,
  listDoctorPatientsQuerySchema,
  doctorIdParamSchema,
  doctorPatientParamSchema,
  deleteDoctorQuerySchema,
} from '../validators/doctor.schema.js';
import { createPatientSchema } from '../validators/patient.schema.js';

const router = Router();

// Every doctor route requires an authenticated session.
router.use(protect);

/** GET /api/doctors - paginated + filterable list. */
router.get(
  '/',
  validate({ query: listDoctorsQuerySchema }),
  listDoctors,
);

/** POST /api/doctors - create a doctor. */
router.post(
  '/',
  validate({ body: createDoctorSchema }),
  createDoctor,
);

/** GET /api/doctors/:id - single doctor + patient count. */
router.get(
  '/:id',
  validate({ params: doctorIdParamSchema }),
  getDoctor,
);

/** PUT /api/doctors/:id - partial update. */
router.put(
  '/:id',
  validate({ params: doctorIdParamSchema, body: updateDoctorSchema }),
  updateDoctor,
);

/** PATCH /api/doctors/:id - alias of PUT (identical partial-update semantics). */
router.patch(
  '/:id',
  validate({ params: doctorIdParamSchema, body: updateDoctorSchema }),
  updateDoctor,
);

/** DELETE /api/doctors/:id - safe delete (`?cascade=true` also removes patients). */
router.delete(
  '/:id',
  validate({ params: doctorIdParamSchema, query: deleteDoctorQuerySchema }),
  deleteDoctor,
);

/** GET /api/doctors/:id/patients - the patients of one doctor. */
router.get(
  '/:id/patients',
  validate({ params: doctorIdParamSchema, query: listDoctorPatientsQuerySchema }),
  listDoctorPatients,
);

/** POST /api/doctors/:id/patients - add a patient to a doctor. */
router.post(
  '/:id/patients',
  validate({ params: doctorIdParamSchema, body: createPatientSchema }),
  createDoctorPatient,
);

/** DELETE /api/doctors/:id/patients/:patientId - remove a patient of a doctor. */
router.delete(
  '/:id/patients/:patientId',
  validate({ params: doctorPatientParamSchema }),
  deleteDoctorPatient,
);

export default router;
