import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';
import { sendOtpEmail } from '../utils/email.js';
import { generateOtpCode, hashOtp, verifyOtpHash, otpExpiresAt } from '../utils/otp.js';
import { getCountriesExcludingIsrael } from '../utils/countries.js';

const allowedCountryCodes = new Set(getCountriesExcludingIsrael().map((c) => c.code));

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mobileCountryCode: user.mobileCountryCode,
    mobileNumber: user.mobileNumber,
    countryOfLiving: user.countryOfLiving,
    nationality: user.nationality,
    membershipCode: user.membershipCode,
    membershipPaidAt: user.membershipPaidAt,
  };
}

export function authRoutes({
  jwtSecret,
  jwtExpiresIn,
  sendGrid,
  fromEmail,
  fromName,
}) {
  const r = Router();
  const isProduction = process.env.NODE_ENV === 'production';

  function getAuthToken(req) {
    const cookieToken = req.cookies?.token;
    if (cookieToken) return cookieToken;

    const authHeader = req.get('Authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
    return null;
  }

  function getCookieOptions() {
    return {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      maxAge: 15 * 24 * 60 * 60 * 1000,
      path: '/',
      ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    };
  }

  r.get('/me', async (req, res) => {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Not signed in' });
    }
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = await User.findById(payload.sub).lean();
      if (!user) {
        return res.status(401).json({ error: 'Not signed in' });
      }
      return res.json({ user: publicUser(user) });
    } catch {
      return res.status(401).json({ error: 'Not signed in' });
    }
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie('token', getCookieOptions());
    res.json({ ok: true });
  });

  r.post('/register', async (req, res) => {
    const {
      firstName,
      lastName,
      email,
      mobileCountryCode,
      mobileNumber,
      countryOfLiving,
      nationality,
    } = req.body || {};

    if (
      !firstName ||
      !lastName ||
      !email ||
      !mobileCountryCode ||
      !mobileNumber ||
      !countryOfLiving ||
      !nationality
    ) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (!allowedCountryCodes.has(countryOfLiving) || !allowedCountryCodes.has(nationality)) {
      return res.status(400).json({ error: 'Invalid country selection' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const code = generateOtpCode();
    const codeHash = hashOtp(code);
    const expiresAt = otpExpiresAt();

    const profile = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      mobileCountryCode: String(mobileCountryCode).trim(),
      mobileNumber: String(mobileNumber).replace(/\s/g, ''),
      countryOfLiving: String(countryOfLiving).trim(),
      nationality: String(nationality).trim(),
    };

    await Otp.findOneAndUpdate(
      { email: normalizedEmail, purpose: 'register' },
      { codeHash, expiresAt, profile, purpose: 'register', email: normalizedEmail },
      { upsert: true, new: true }
    );

    await sendOtpEmail({
      to: normalizedEmail,
      code,
      fromEmail: sendGrid.fromEmail,
      fromName: sendGrid.fromName,
      subject: 'Verify your IKS membership account',
    });

    return res.json({ message: 'Verification code sent to your email.' });
  });

  r.post('/login', async (req, res) => {
    const { email } = req.body || {};
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ error: 'No account found for this email.' });
    }

    const code = generateOtpCode();
    const codeHash = hashOtp(code);
    const expiresAt = otpExpiresAt();

    await Otp.findOneAndUpdate(
      { email: normalizedEmail, purpose: 'login' },
      { codeHash, expiresAt, profile: null, purpose: 'login', email: normalizedEmail },
      { upsert: true, new: true }
    );

    await sendOtpEmail({
      to: normalizedEmail,
      code,
      fromEmail: sendGrid.fromEmail,
      fromName: sendGrid.fromName,
      subject: 'Your IKS sign-in code',
    });

    return res.json({ message: 'Verification code sent to your email.' });
  });

  function setAuthCookie(res, userId) {
    const token = jwt.sign({ sub: userId.toString() }, jwtSecret, { expiresIn: jwtExpiresIn });
    res.cookie('token', token, getCookieOptions());
    return token;
  }

  r.post('/verify', async (req, res) => {
    const { email, code, purpose } = req.body || {};
    if (!email || !code || !purpose) {
      return res.status(400).json({ error: 'Email, code, and purpose are required' });
    }
    if (!['register', 'login'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid purpose' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const otpDoc = await Otp.findOne({ email: normalizedEmail, purpose });
    if (!otpDoc) {
      return res.status(400).json({ error: 'No verification pending. Please request a new code.' });
    }
    if (otpDoc.expiresAt < new Date()) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(400).json({ error: 'Code expired. Please request a new one.' });
    }
    if (!verifyOtpHash(String(code).trim(), otpDoc.codeHash)) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    if (purpose === 'register') {
      if (!otpDoc.profile) {
        return res.status(400).json({ error: 'Registration data missing. Please start again.' });
      }
      const p = otpDoc.profile;
      let user;
      try {
        user = await User.create({
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          mobileCountryCode: p.mobileCountryCode,
          mobileNumber: p.mobileNumber,
          countryOfLiving: p.countryOfLiving,
          nationality: p.nationality,
        });
      } catch (error) {
        if (error?.code === 11000) {
          return res
            .status(409)
            .json({ error: 'An account with this email already exists. Please sign in.' });
        }
        console.error('Register verify failed:', error);
        return res.status(500).json({ error: 'Could not create account. Please try again.' });
      }
      await Otp.deleteOne({ _id: otpDoc._id });
      const token = setAuthCookie(res, user._id);
      return res.json({ user: publicUser(user.toObject()), token });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(404).json({ error: 'Account not found.' });
    }
    await Otp.deleteOne({ _id: otpDoc._id });
    const token = setAuthCookie(res, user._id);
    return res.json({ user: publicUser(user.toObject()), token });
  });

  return r;
}
