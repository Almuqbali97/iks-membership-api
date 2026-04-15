import mongoose from 'mongoose';

const sequenceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export const Sequence = mongoose.models.Sequence || mongoose.model('Sequence', sequenceSchema);
