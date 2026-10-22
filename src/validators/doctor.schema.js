/**
 * Zod schemas for the doctor routes.
 */
import { z } from 'zod';
import { coerceDate, coerceNumber, objectIdSchema, optionalTrimmedString } from './common.schema.js';

/** Fields accepted when creating a doctor. */
export const createDoctorSchema = z.object({
  name: z.string().trim().min(2, 'Doctor name must be at least 2 characters').max(100),
  specialization: z.string().trim().min(2, 'Specialization must be at least 2 characters').max(100),
  hospital: z.string().trim().min(2, 'Hospital must be at least 2 characters').max(140),
  phone: z.string().trim().max(30, 'Phone must be at most 30 characters').optional().default(''),
  email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
});

/** Every field optional - used for PATCH-like updates. */
export const updateDoctorSchema = createDoctorSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for an update' },
);

/** Query parameters for `GET /api/doctors`. */
export const listDoctorsQuerySchema = z.object({
  search: optionalTrimmedString(100),
  specialization: optionalTrimmedString(100),
  hospital: optionalTrimmedString(140),
  from: coerceDate().optional(),
  to: coerceDate().optional(),
  page: coerceNumber({ min: 1, minMessage: 'Page must be 1 or greater' }).optional().default(1),
  limit: coerceNumber({ min: 1, max: 100, minMessage: 'Limit must be 1 or greater', maxMessage: 'Limit must be 100 or less' })
    .optional()
    .default(10),
  sort: z
    .enum(
      ['createdAt', '-createdAt', 'name', '-name', 'specialization', '-specialization', 'hospital', '-hospital'],
      { errorMap: () => ({ message: 'Sort must be one of: createdAt, name, specialization, hospital (prefix with "-" for descending)' }) },
    )
    .optional()
    .default('-createdAt'),
});

/** Query parameters for `GET /api/doctors/:id/patients`. */
export const listDoctorPatientsQuerySchema = z.object({
  search: optionalTrimmedString(100),
  page: coerceNumber({ min: 1, minMessage: 'Must be 1 or greater' }).optional().default(1),
  limit: coerceNumber({ min: 1, max: 100, minMessage: 'Must be 1 or greater', maxMessage: 'Must be 100 or less' }).optional().default(10),
  sort: z
    .enum(['createdAt', '-createdAt', 'name', '-name', 'age', '-age'], {
      errorMap: () => ({ message: 'Sort must be one of: createdAt, name, age (prefix with "-" for descending)' }),
    })
    .optional()
    .default('-createdAt'),
});

export const doctorIdParamSchema = z.object({ id: objectIdSchema });

/** Query parameters for `DELETE /api/doctors/:id`. */
export const deleteDoctorQuerySchema = z.object({
  cascade: z
    .enum(['true', 'false'], { errorMap: () => ({ message: 'cascade must be "true" or "false"' }) })
    .optional()
    .default('false'),
});

export const doctorPatientParamSchema = z.object({
  id: objectIdSchema,
  patientId: objectIdSchema,
});

export default {
  createDoctorSchema,
  updateDoctorSchema,
  listDoctorsQuerySchema,
  listDoctorPatientsQuerySchema,
  doctorIdParamSchema,
  doctorPatientParamSchema,
  deleteDoctorQuerySchema,
};
