import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    mobileCountryCode: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    countryOfLiving: { type: String, required: true, trim: true },
    nationality: { type: String, required: true, trim: true },
    membershipCode: { type: String, default: undefined, trim: true },
    membershipPaidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index(
  { membershipCode: 1 },
  {
    unique: true,
    partialFilterExpression: { membershipCode: { $type: 'string' } },
  }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
