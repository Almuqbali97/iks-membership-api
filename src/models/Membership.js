import mongoose from 'mongoose';

const membershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', unique: true, index: true },
    membershipCode: { type: String, required: true, unique: true, trim: true },
    amountBaisa: { type: Number, required: true },
    amountOmr: { type: Number, required: true },
    currency: { type: String, required: true, default: 'OMR' },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Success', 'Cancelled', 'Failed'],
      default: 'Pending',
      index: true,
    },
    paymentMethod: { type: String, trim: true, default: null },
    sessionId: { type: String, trim: true, default: null, index: true },
    clientReferenceId: { type: String, trim: true, default: null, index: true },
    paidAt: { type: Date, default: null },
    isActive: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Membership =
  mongoose.models.Membership || mongoose.model('Membership', membershipSchema);
