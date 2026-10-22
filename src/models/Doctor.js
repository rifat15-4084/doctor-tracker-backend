/**
 * Doctor model.
 *
 * A doctor is the "parent" record of the app: patients always reference one
 * doctor, and every dashboard metric is derived from doctors + patients.
 */
import mongoose from 'mongoose';

const EMAIL_MATCH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true,
      minlength: [2, 'Doctor name must be at least 2 characters'],
      maxlength: [100, 'Doctor name must be at most 100 characters'],
    },
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
      minlength: [2, 'Specialization must be at least 2 characters'],
      maxlength: [100, 'Specialization must be at most 100 characters'],
    },
    hospital: {
      type: String,
      required: [true, 'Hospital is required'],
      trim: true,
      minlength: [2, 'Hospital must be at least 2 characters'],
      maxlength: [140, 'Hospital must be at most 140 characters'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone must be at most 30 characters'],
      default: '',
    },
    email: {
      type: String,
      required: [true, 'Doctor email is required'],
      lowercase: true,
      trim: true,
      match: [EMAIL_MATCH, 'Please provide a valid email address'],
    },
  },
  {
    timestamps: true, // provides createdAt / updatedAt
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

/**
 * UNIQUE index on `email`.
 * Why: the doctor email is the natural business key (it is also the login
 * identifier for the portal), so duplicates must be impossible. The database
 * index - not just a Mongoose validator - is what actually enforces this,
 * because validators can be bypassed by direct writes.
 */
doctorSchema.index({ email: 1 }, { unique: true, name: 'doctor_email_unique' });

/**
 * Index on `specialization`.
 * Why: the doctors list is filtered by specialisation from a dropdown and the
 * dashboard groups doctors by it. A single-field B-tree index keeps those
 * filters index-only (no document fetch / no collection scan).
 */
doctorSchema.index({ specialization: 1 }, { name: 'doctor_specialization_idx' });

/**
 * Index on `hospital`.
 * Why: the list screen filters by hospital as well. Same reasoning as
 * `specialization`: equality filters stay fast as the collection grows.
 */
doctorSchema.index({ hospital: 1 }, { name: 'doctor_hospital_idx' });

/**
 * Index on `createdAt` DESC.
 * Why: the default listing order is "newest first" and the dashboard charts
 * group doctors by month. A descending index lets MongoDB satisfy the sort
 * with a single index scan (no in-memory sort stage).
 */
doctorSchema.index({ createdAt: -1 }, { name: 'doctor_createdAt_desc_idx' });

/**
 * COMPOUND indexes on `{ <filter field>: 1, createdAt: -1 }`.
 * Why: the list screen combines an equality filter (specialisation or
 * hospital) with the default "newest first" sort. A compound index answers
 * both with a single index scan, whereas two separate indexes would force
 * MongoDB to sort the filtered rows in memory once the result set grows.
 */
doctorSchema.index(
  { specialization: 1, createdAt: -1 },
  { name: 'doctor_specialization_createdAt_idx' },
);

doctorSchema.index({ hospital: 1, createdAt: -1 }, { name: 'doctor_hospital_createdAt_idx' });

/**
 * TEXT index over `name`, `specialization` and `hospital`.
 * Why: enables MongoDB full-text search (`$text` / `$meta` relevance scoring)
 * across the three human readable fields of a doctor, which a regular
 * expression cannot rank. The REST API currently uses escaped regexes for
 * partial ("contains") matching, but this index is what makes ranked
 * full-text search available without a collection scan.
 */
doctorSchema.index(
  { name: 'text', specialization: 'text', hospital: 'text' },
  { name: 'doctor_text_search_idx', weights: { name: 10, specialization: 5, hospital: 2 } },
);

export const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema);
export default Doctor;
