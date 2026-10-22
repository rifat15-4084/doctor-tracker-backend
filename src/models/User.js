/**
 * User model - represents an administrator of the Doctor Tracker dashboard.
 *
 * Only `admin` and `staff` roles exist today; the `role` field is kept so
 * the authorisation layer can grow without a schema migration.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const EMAIL_MATCH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [EMAIL_MATCH, 'Please provide a valid email address'],
    },
    // `select: false` keeps the hash out of every query result by default.
    // The login flow explicitly opts in with `.select('+password')`.
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
      minlength: [8, 'Password must be at least 8 characters'],
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'staff'],
        message: '{VALUE} is not a supported role',
      },
      default: 'admin',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

/**
 * Unique index on `email` - the login identifier. A unique index (not just a
 * validator) is required so the database itself guarantees no duplicate
 * accounts can ever exist, even under concurrent writes.
 */
userSchema.index({ email: 1 }, { unique: true, name: 'user_email_unique' });

/** Hash the password with bcrypt whenever it is set or modified. */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

/**
 * Compare a plain-text candidate against the stored bcrypt hash.
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Public (safe) representation of the user. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
