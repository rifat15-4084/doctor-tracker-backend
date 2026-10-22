/**
 * Patient routes.
 */
import { Router } from 'express';
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
} from '../controllers/patient.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createPatientWithDoctorSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
  patientIdParamSchema,
} from '../validators/patient.schema.js';

const router = Router();

// Every patient route requires an authenticated session.
router.use(protect);

/** GET /api/patients - paginated + filterable list. */
router.get(
  '/',
  validate({ query: listPatientsQuerySchema }),
  listPatients,
);

/** POST /api/patients - create a patient. */
router.post(
  '/',
  validate({ body: createPatientWithDoctorSchema }),
  createPatient,
);

/** GET /api/patients/:id - single patient (+ doctor). */
router.get(
  '/:id',
  validate({ params: patientIdParamSchema }),
  getPatient,
);

/** PUT /api/patients/:id - partial update. */
router.put(
  '/:id',
  validate({ params: patientIdParamSchema, body: updatePatientSchema }),
  updatePatient,
);

/** PATCH /api/patients/:id - alias of PUT (identical partial-update semantics). */
router.patch(
  '/:id',
  validate({ params: patientIdParamSchema, body: updatePatientSchema }),
  updatePatient,
);

/** DELETE /api/patients/:id - remove a patient. */
router.delete(
  '/:id',
  validate({ params: patientIdParamSchema }),
  deletePatient,
);

export default router;
