/**
 * Patient model.
 *
 * Every patient belongs to exactly one doctor, which is what makes the
 * "patients per doctor" dashboard aggregation possible.
 */
import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
      minlength: [2, 'Patient name must be at least 2 characters'],
      maxlength: [100, 'Patient name must be at most 100 characters'],
    },
    age: {
      type: Number,
      required: [true, 'Age is required'],
      min: [0, 'Age cannot be negative'],
      max: [130, 'Age must be a realistic value'],
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: {
        values: ['male', 'female', 'other'],
        message: '{VALUE} is not a supported gender',
      },
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      maxlength: [30, 'Phone must be at most 30 characters'],
    },
    condition: {
      type: String,
      required: [true, 'Condition is required'],
      trim: true,
      minlength: [2, 'Condition must be at least 2 characters'],
      maxlength: [120, 'Condition must be at most 120 characters'],
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Patient must be assigned to a doctor'],
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
 * Index on `doctor`.
 * Why: the two hottest access paths are "patients of doctor X" and "delete
 * every patient of doctor X". A dedicated index on the foreign key keeps
 * those lookups O(log n) instead of a full collection scan.
 */
patientSchema.index({ doctor: 1 }, { name: 'patient_doctor_idx' });

/**
 * Index on `condition`.
 * Why: the patients list is filtered by condition and the dashboard groups
 * patients per condition (`$group`). Both operations read many documents with
 * the same condition value, which this index serves directly.
 */
patientSchema.index({ condition: 1 }, { name: 'patient_condition_idx' });

/**
 * Index on `createdAt` DESC.
 * Why: the default listing order is "newest first" and the dashboard builds a
 * "patients added per day" chart for the last 30 days. A descending index
 * removes the in-memory SORT stage from both queries.
 */
patientSchema.index({ createdAt: -1 }, { name: 'patient_createdAt_desc_idx' });

/**
 * COMPOUND index on `{ doctor: 1, createdAt: -1 }`.
 * Why: this is the single most frequent compound access pattern - "show the
 * most recent patients of a specific doctor, paginated". A compound index can
 * satisfy the filter *and* the sort in one pass, while the single field
 * indexes above would force MongoDB to sort the filtered rows in memory once
 * the result set grows.
 */
patientSchema.index({ doctor: 1, createdAt: -1 }, { name: 'patient_doctor_createdAt_compound_idx' });

/**
 * COMPOUND index on `{ doctor: 1, name: 1 }`.
 * Why: the "patients of one doctor" screen can be sorted by name, and the
 * search box matches on the name as well. This index keeps that query
 * index-only instead of sorting the doctor's patients in memory.
 */
patientSchema.index({ doctor: 1, name: 1 }, { name: 'patient_doctor_name_compound_idx' });

/**
 * COMPOUND index on `{ condition: 1, createdAt: -1 }`.
 * Why: the patients list combines the condition filter with the default
 * "newest first" sort - one index scan satisfies both.
 */
patientSchema.index(
  { condition: 1, createdAt: -1 },
  { name: 'patient_condition_createdAt_compound_idx' },
);

/**
 * TEXT index over `name` and `phone`.
 * Why: enables ranked full-text lookup of a patient by name (or by a phone
 * number fragment). The text index stores an inverted index of tokens, so
 * lookups avoid scanning every document in the collection.
 */
patientSchema.index(
  { name: 'text', phone: 'text' },
  { name: 'patient_text_search_idx', weights: { name: 10, phone: 5 } },
);

export const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
export default Patient;
