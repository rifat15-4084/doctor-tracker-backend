/**
 * Meta controller.
 *
 * Serves the option lists that populate the filter dropdowns of the doctors
 * and patients screens. The values are derived from the data itself, so the
 * dropdowns can never offer a filter that matches nothing.
 *
 * Everything is computed with aggregation/`distinct` in the database - the
 * server never loads full documents just to read one field.
 */
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { serializeDoctor } from '../utils/serialize.js';

/** Sort a list of strings alphabetically (case-insensitive). */
const sortLabels = (values = []) =>
  [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))].sort((a, b) =>
    a.localeCompare(b),
  );

/**
 * GET /api/meta/filters
 *
 * Returns the distinct specialisations, hospitals and conditions plus the
 * list of doctors that can be picked in the filter dropdowns.
 */
export const getFilterOptions = asyncHandler(async (_req, res) => {
  const [specializations, hospitals, conditions, doctors] = await Promise.all([
    Doctor.distinct('specialization'),
    Doctor.distinct('hospital'),
    Patient.distinct('condition'),
    Doctor.find().select('name specialization').sort({ name: 1 }).lean(),
  ]);

  return sendSuccess(res, {
    data: {
      specializations: sortLabels(specializations),
      hospitals: sortLabels(hospitals),
      conditions: sortLabels(conditions),
      doctors: doctors.map((doctor) =>
        serializeDoctor(doctor, { name: doctor.name, specialization: doctor.specialization }),
      ),
    },
  });
});

export default { getFilterOptions };
