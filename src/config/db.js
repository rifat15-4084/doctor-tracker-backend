/**
 * MongoDB (Mongoose) connection management.
 *
 * Connection failures are surfaced with an actionable message so a broken
 * deployment is obvious in the Render logs (wrong URI, IP not allow-listed,
 * database user without permissions, ...).
 */
import mongoose from 'mongoose';
import { env } from './env.js';

// Make query filtering strict so unknown query fields are never silently
// dropped, and strip Mongoose internals from serialised documents.
mongoose.set('strictQuery', true);
mongoose.set('toJSON', { virtuals: true, versionKey: false });

/**
 * Connect to MongoDB with sane pool/timeout settings.
 * @returns {Promise<import('mongoose').Connection>}
 */
export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(`[mongo] Connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[mongo] Disconnected');
  });

  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // fail fast if Atlas is unreachable
      maxPoolSize: 10, // plenty for the free tier
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      retryWrites: true,
    });

    // eslint-disable-next-line no-console
    console.log(`[mongo] Connected to ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    const hints = [];

    if (/ECONNREFUSED|ServerSelectionError/i.test(error.message)) {
      hints.push('Is the database host reachable? For Atlas, allow your IP in Network Access.');
    }
    if (/authentication failed|bad auth/i.test(error.message)) {
      hints.push('Check the database username and password in MONGO_URI.');
    }
    if (/ENOTFOUND|querySrv/i.test(error.message)) {
      hints.push('The hostname in MONGO_URI could not be resolved - check the cluster address.');
    }

    const message = [
      '[mongo] Could not connect to MongoDB.',
      `  Reason: ${error.message}`,
      ...hints.map((hint) => `  Hint:   ${hint}`),
    ].join('\n');

    // eslint-disable-next-line no-console
    console.error(message);
    throw error;
  }
};

/** Close the connection cleanly (used on graceful shutdown and in scripts). */
export const disconnectDB = async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  // eslint-disable-next-line no-console
  console.log('[mongo] Connection closed');
};

export default connectDB;
