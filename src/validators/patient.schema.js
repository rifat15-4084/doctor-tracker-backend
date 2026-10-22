/**
 * Zod schemas for the patient routes.
 */
import { z } from 'zod';
import { coerceDate, coerceNumber, numberField, objectIdSchema, optionalTrimmedString } from './common.schema.js';

export const genderEnum = z.enum(['male', 'female', 'other'], {
  errorMap: () => ({ message: 'Gender must be one of: male, female, other' }),
});

/** Fields accepted when creating a patient (directly or under a doctor). */
export const createPatientSchema = z.object({
  name: z.string().trim().min(2, 'Patient name must be at least 2 characters').max(100),
  age: numberField({
    required: 'Age is required',
    int: true,
    min: 0,
    minMessage: 'Age cannot be negative',
    max: 130,
    maxMessage: 'Age must be a realistic value',
  }),
  gender: genderEnum,
  phone: z.string().trim().min(6, 'Phone must be at least 6 characters').max(30),
  condition: z.string().trim().min(2, 'Condition must be at least 2 characters').max(120),
  // Optional here because `POST /doctors/:id/patients` takes the doctor from
  // the URL. It is required for `POST /api/patients` (enforced below).
  doctor: objectIdSchema.optional(),
});

/** `POST /api/patients` - the doctor must be part of the payload. */
export const createPatientWithDoctorSchema = createPatientSchema.refine(
  (data) => Boolean(data.doctor),
  { message: 'doctor is required', path: ['doctor'] },
);

export const updatePatientSchema = createPatientSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for an update',
  });

/** Query parameters for `GET /api/patients`. */
export const listPatientsQuerySchema = z.object({
  search: optionalTrimmedString(100),
  condition: optionalTrimmedString(120),
  doctor: objectIdSchema.optional(),
  from: coerceDate().optional(),
  to: coerceDate().optional(),
  page: coerceNumber({ min: 1, minMessage: 'Must be 1 or greater' }).optional().default(1),
  limit: coerceNumber({ min: 1, max: 100, minMessage: 'Must be 1 or greater', maxMessage: 'Must be 100 or less' }).optional().default(10),
  sort: z
    .enum(['createdAt', '-createdAt', 'name', '-name', 'age', '-age', 'condition', '-condition'], {
      errorMap: () => ({
        message: 'Sort must be one of: createdAt, name, age, condition (prefix with "-" for descending)',
      }),
    })
    .optional()
    .default('-createdAt'),
});

export const patientIdParamSchema = z.object({ id: objectIdSchema });

export default {
  createPatientSchema,
  createPatientWithDoctorSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
  patientIdParamSchema,
};
