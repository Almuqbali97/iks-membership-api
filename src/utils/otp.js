import crypto from 'crypto';

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtpCode() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(OTP_LENGTH, '0');
}

export function hashOtp(code) {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

export function verifyOtpHash(code, hash) {
  const h = hashOtp(code);
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export function otpExpiresAt() {
  return new Date(Date.now() + OTP_TTL_MS);
}
