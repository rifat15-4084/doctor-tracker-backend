/**
 * Transaction helper.
 *
 * MongoDB only supports multi-document transactions on replica sets
 * (Atlas does, a standalone local mongod does not). `withOptionalTransaction`
 * therefore tries a real transaction and transparently falls back to running
 * the callback without one when the server cannot provide it.
 */
import mongoose from 'mongoose';

/** MongoDB error codes that mean "transactions are not supported here". */
const NO_TRANSACTION_CODES = new Set([
  20, // IllegalOperation: Transaction numbers are only allowed on a replica set member
  251, // NoSuchTransaction
  263, // OperationNotSupportedInTransaction
]);

/**
 * @template T
 * @param {(session: import('mongoose').ClientSession|null) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export const withOptionalTransaction = async (fn) => {
  // Transactions require a replica set; `startSession` alone is not enough.
  const supportsTransactions = mongoose.connection.readyState === 1 && !!mongoose.connection.db;

  if (!supportsTransactions) return fn(null);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (error) {
    if (NO_TRANSACTION_CODES.has(error.code) || /transaction numbers are only allowed/i.test(error.message || '')) {
      // Standalone server -> run without a session.
      return fn(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export default withOptionalTransaction;
