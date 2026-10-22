/**
 * Zod schemas for the authentication routes.
 */
import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required', invalid_type_error: 'Email must be a string' })
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),
  password: z
    .string({ required_error: 'Password is required', invalid_type_error: 'Password must be a string' })
    .min(1, 'Password is required')
    .max(128, 'Password is too long'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Please provide a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/\d/, 'Password must contain a number'),
});

export default { loginSchema, registerSchema };
