/**
 * Dashboard controller.
 *
 * Every metric is computed with MongoDB aggregation pipelines so the database
 * does the maths instead of pulling thousands of documents into Node.
 *
 * Two `$facet` pipelines are executed in parallel (`Promise.all`):
 *   1. over the `patients` collection -> patient metrics
 *   2. over the `doctors` collection  -> doctor metrics
 * A `$facet` runs all of its sub-pipelines against a single scan of the
 * collection and returns their results side by side, which is far cheaper
 * than issuing four separate queries.
 */
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { toIdString } from '../utils/serialize.js';

/** Number of days shown in the "patients added per day" chart. */
const TREND_DAYS = 30;
/** Number of months shown in the "doctors added per month" chart. */
const TREND_MONTHS = 12;
/** Maximum number of doctors in the "top doctors by patient count" list. */
const TOP_DOCTORS = 10;
/** Number of patients listed in the "recent registrations" table. */
const RECENT_PATIENTS = 5;

/** `YYYY-MM-DD` for a given date (UTC). */
const dayKey = (date) => date.toISOString().slice(0, 10);
/** `YYYY-MM` for a given date (UTC). */
const monthKey = (date) => date.toISOString().slice(0, 7);

/**
 * Build a continuous list of the last `TREND_DAYS` days so the chart always
 * contains a point for every day - even days without new patients.
 */
const buildDaySeries = (buckets, startDate) => {
  const byDay = new Map(buckets.map((bucket) => [bucket.date, bucket.count]));
  const series = [];

  for (let i = 0; i < TREND_DAYS; i += 1) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const key = dayKey(date);
    series.push({ date: key, count: byDay.get(key) || 0 });
  }

  return series;
};

export const getDashboardStats = asyncHandler(async (_req, res) => {
  const now = new Date();
  const startDate = new Date(now.getTime() - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000);
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  // 12 full months back, aligned to the first day of the month.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1), 1));

  const doctorsCollection = Doctor.collection.name;

  // --- Pipeline 1: everything that can be derived from the patients -------
  const patientPipeline = [
    {
      $facet: {
        // Total number of patients.
        totalPatients: [{ $count: 'count' }],

        // Patients created in the last 30 days (headline "new patients" card).
        newPatientsLast30Days: [
          { $match: { createdAt: { $gte: startDate } } },
          { $count: 'count' },
        ],

        // Patients created in the last 7 days ("new this week" card).
        newPatientsLast7Days: [
          { $match: { createdAt: { $gte: weekStart } } },
          { $count: 'count' },
        ],

        // Top 10 doctors by number of patients, enriched with the doctor's
        // details through a `$lookup` against the doctors collection.
        patientsPerDoctor: [
          { $group: { _id: '$doctor', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: TOP_DOCTORS },
          {
            $lookup: {
              from: doctorsCollection,
              localField: '_id',
              foreignField: '_id',
              as: 'doctor',
            },
          },
          { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              doctorId: '$_id',
              doctorName: { $ifNull: ['$doctor.name', 'Unknown doctor'] },
              specialization: { $ifNull: ['$doctor.specialization', null] },
              hospital: { $ifNull: ['$doctor.hospital', null] },
              count: 1,
            },
          },
        ],

        // Patient distribution per condition.
        patientsPerCondition: [
          { $group: { _id: '$condition', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, condition: '$_id', count: 1 } },
        ],

        // Patient distribution per specialisation (via the assigned doctor).
        // This is what powers the "top specialization" headline card.
        patientsPerSpecialization: [
          {
            $lookup: {
              from: doctorsCollection,
              localField: 'doctor',
              foreignField: '_id',
              as: 'doctor',
            },
          },
          { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
          { $group: { _id: '$doctor.specialization', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, specialization: '$_id', count: 1 } },
        ],

        // Patients added per day over the last 30 days.
        patientsAddedPerDay: [
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: '$_id', count: 1 } },
        ],

        // The most recently registered patients (dashboard "recent" table).
        recentPatients: [
          { $sort: { createdAt: -1 } },
          { $limit: RECENT_PATIENTS },
          {
            $lookup: {
              from: doctorsCollection,
              localField: 'doctor',
              foreignField: '_id',
              as: 'doctor',
            },
          },
          { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              name: 1,
              condition: 1,
              createdAt: 1,
              doctorId: '$doctor._id',
              doctorName: { $ifNull: ['$doctor.name', null] },
            },
          },
        ],
      },
    },
  ];

  // --- Pipeline 2: everything that can be derived from the doctors --------
  const doctorPipeline = [
    {
      $facet: {
        // Total number of doctors.
        totalDoctors: [{ $count: 'count' }],

        // Doctors created in the last 30 days.
        newDoctorsLast30Days: [
          { $match: { createdAt: { $gte: startDate } } },
          { $count: 'count' },
        ],

        // Doctors added per month over the last 12 months.
        doctorsAddedPerMonth: [
          { $match: { createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, month: '$_id', count: 1 } },
        ],

        // Doctor distribution per specialization.
        doctorsPerSpecialization: [
          { $group: { _id: '$specialization', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, specialization: '$_id', count: 1 } },
        ],
      },
    },
  ];

  // Both aggregations run in parallel and are merged into one response.
  const [patientStats, doctorStats] = await Promise.all([
    Patient.aggregate(patientPipeline),
    Doctor.aggregate(doctorPipeline),
  ]);

  const p = patientStats[0] || {};
  const d = doctorStats[0] || {};

  const totalDoctors = d.totalDoctors?.[0]?.count || 0;
  const totalPatients = p.totalPatients?.[0]?.count || 0;

  // Fill the gaps so the chart x-axis is continuous.
  const patientsAddedPerDay = buildDaySeries(p.patientsAddedPerDay || [], startDate);
  const monthsSeen = new Set((d.doctorsAddedPerMonth || []).map((row) => row.month));
  const doctorsAddedPerMonth = [];
  for (let i = 0; i < TREND_MONTHS; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1 - i), 1));
    const key = monthKey(date);
    const found = (d.doctorsAddedPerMonth || []).find((row) => row.month === key);
    doctorsAddedPerMonth.push({ month: key, count: monthsSeen.has(key) ? found.count : 0 });
  }

  // The specialisation that treats the most patients.
  const topSpecializationRow = (p.patientsPerSpecialization || [])[0] || null;

  return sendSuccess(res, {
    data: {
      // Headline counters
      totalDoctors,
      totalPatients,
      newDoctorsLast30Days: d.newDoctorsLast30Days?.[0]?.count || 0,
      newPatientsLast30Days: p.newPatientsLast30Days?.[0]?.count || 0,
      newPatientsLast7Days: p.newPatientsLast7Days?.[0]?.count || 0,
      averagePatientsPerDoctor:
        totalDoctors > 0 ? Number((totalPatients / totalDoctors).toFixed(2)) : 0,
      topSpecialization: topSpecializationRow?.specialization ?? null,
      topSpecializationCount: topSpecializationRow?.count ?? 0,

      // Breakdowns
      patientsPerDoctor: (p.patientsPerDoctor || []).map((row) => ({
        ...row,
        doctorId: toIdString(row.doctorId),
      })),
      patientsPerCondition: p.patientsPerCondition || [],
      patientsPerSpecialization: p.patientsPerSpecialization || [],
      doctorsPerSpecialization: d.doctorsPerSpecialization || [],

      // Time series
      patientsAddedPerDay,
      doctorsAddedPerMonth,

      // Latest registrations
      recentPatients: (p.recentPatients || []).map((row) => ({
        id: toIdString(row._id),
        name: row.name,
        condition: row.condition,
        doctorId: toIdString(row.doctorId),
        doctorName: row.doctorName ?? null,
        createdAt: row.createdAt,
      })),
    },
  });
});

export default { getDashboardStats };
