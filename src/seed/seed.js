/**
 * Database seed script.
 *
 * Creates:
 *   - 1 admin account  (admin@doctortracker.com / Admin@12345)
 *   - 20 doctors       (realistic names, specialisations, hospitals)
 *   - 150 patients     (randomly assigned to the doctors)
 *
 * Usage:
 *   npm run seed            # wipe + insert
 *   npm run seed:destroy    # only wipe
 */
import { faker } from '@faker-js/faker';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';

const ADMIN = {
  name: 'System Administrator',
  email: 'admin@doctortracker.com',
  password: 'Admin@12345',
  role: 'admin',
};

const SPECIALIZATIONS = [
  'Cardiology',
  'Dermatology',
  'Neurology',
  'Orthopedics',
  'Pediatrics',
  'General Medicine',
  'Gynecology',
  'Ophthalmology',
  'Psychiatry',
  'Radiology',
  'Urology',
  'ENT',
];

const HOSPITAL_PREFIXES = [
  'St. Mary',
  'Sunrise',
  'Northside',
  'Lakeside',
  'Riverside',
  'Grand Central',
  'Green Valley',
  'Kings Cross',
  'Silver Pine',
  'Hope',
];

const CONDITIONS = [
  'Hypertension',
  'Type 2 Diabetes',
  'Asthma',
  'Migraine',
  'Arthritis',
  'Anaemia',
  'Hyperlipidemia',
  'Depression',
  'GERD',
  'Seasonal Allergies',
  'Lower Back Pain',
  'Thyroid Disorder',
  'Gastritis',
  'Sinusitis',
  'Eczema',
];

const GENDERS = ['male', 'female', 'other'];

/** Build a unique, deterministic email for a doctor. */
const doctorEmail = (doctor, index) =>
  `${doctor.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '.')}.${index}@clinic.com`;

/**
 * Remove every document from the three collections.
 */
const wipe = async () => {
  await Promise.all([
    User.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
  ]);
  // eslint-disable-next-line no-console
  console.log('[seed] Cleared users, doctors and patients.');
};

/**
 * Make sure every index declared in the schemas really exists.
 * `createIndexes()` is idempotent, so running the seed repeatedly is safe.
 */
const ensureIndexes = async () => {
  await Promise.all([User.createIndexes(), Doctor.createIndexes(), Patient.createIndexes()]);
  // eslint-disable-next-line no-console
  console.log('[seed] Indexes ensured (unique, compound and text).');
};

/**
 * Insert the demo data.
 */
const seed = async () => {
  // --- Admin -----------------------------------------------------------
  await User.create(ADMIN);
  // eslint-disable-next-line no-console
  console.log(`[seed] Admin created: ${ADMIN.email}`);

  // --- Doctors ---------------------------------------------------------
  const doctorDocs = Array.from({ length: 20 }, (_, index) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const name = `Dr. ${firstName} ${lastName}`;

    return {
      name,
      specialization: faker.helpers.arrayElement(SPECIALIZATIONS),
      hospital: `${faker.helpers.arrayElement(HOSPITAL_PREFIXES)} ${faker.helpers.arrayElement([
        'General Hospital',
        'Medical Center',
        'Clinic',
        'Specialist Hospital',
        'Health Institute',
      ])}`,
      phone: faker.phone.number({ style: 'international' }).slice(0, 20),
      email: doctorEmail({ name: `Dr. ${firstName} ${lastName}` }, index + 1),
      // Spread the doctors over the last 12 months so the monthly chart has data.
      createdAt: faker.date.recent({ days: 360, refDate: new Date() }),
      updatedAt: new Date(),
    };
  });

  // `timestamps: false` keeps the spread-out `createdAt` values below instead
  // of stamping every seeded document with "now" (the dashboard charts need
  // historical data to look realistic).
  const doctors = await Doctor.insertMany(doctorDocs, { timestamps: false });
  // eslint-disable-next-line no-console
  console.log(`[seed] ${doctors.length} doctors created.`);

  // --- Patients --------------------------------------------------------
  const patientDocs = Array.from({ length: 150 }, () => {
    const doctor = faker.helpers.arrayElement(doctors);

    return {
      name: `${faker.person.firstName()} ${faker.person.lastName()}`,
      age: faker.number.int({ min: 1, max: 88 }),
      gender: faker.helpers.arrayElement(GENDERS),
      phone: faker.phone.number({ style: 'international' }).slice(0, 20),
      condition: faker.helpers.arrayElement(CONDITIONS),
      doctor: doctor._id,
      // Spread the patients over the last 30 days so the daily chart has data.
      createdAt: faker.date.recent({ days: 29, refDate: new Date() }),
      updatedAt: new Date(),
    };
  });

  await Patient.insertMany(patientDocs, { timestamps: false });
  // eslint-disable-next-line no-console
  console.log(`[seed] ${patientDocs.length} patients created.`);

  // eslint-disable-next-line no-console
  console.log('\n[seed] Done. Sign in with:');
  // eslint-disable-next-line no-console
  console.log(`         email:    ${ADMIN.email}`);
  // eslint-disable-next-line no-console
  console.log(`         password: ${ADMIN.password}\n`);
};

/**
 * Entry point.
 */
const run = async () => {
  const destroyOnly = process.argv.includes('--destroy');

  await connectDB();
  await wipe();
  if (!destroyOnly) {
    await seed();
    // Index creation runs after the data so the unique email index is built
    // against a clean collection.
    await ensureIndexes();
  }
  await disconnectDB();
  process.exit(0);
};

run().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('[seed] Failed:', error);
  await disconnectDB();
  process.exit(1);
});
