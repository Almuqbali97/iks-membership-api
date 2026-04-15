import mongoose from 'mongoose';

const paymentAttemptSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, trim: true, index: true },
    clientReferenceId: { type: String, required: true, unique: true, trim: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
    products: [
      {
        name: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true },
        unit_amount: { type: Number, required: true },
      },
    ],
    totalAmount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'OMR' },
    successUrl: { type: String, required: true },
    cancelUrl: { type: String, required: true },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'cancelled', 'failed'],
      default: 'unpaid',
      index: true,
    },
    paymentType: { type: String, required: true, default: 'membership_registration' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    paymentMethod: { type: String, default: null },
    invoice: { type: mongoose.Schema.Types.Mixed, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    expireAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const PaymentAttempt =
  mongoose.models.PaymentAttempt || mongoose.model('PaymentAttempt', paymentAttemptSchema);
