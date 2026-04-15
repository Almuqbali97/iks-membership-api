import crypto from 'crypto';
import axios from 'axios';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { PaymentAttempt } from '../models/PaymentAttempt.js';
import { Sequence } from '../models/Sequence.js';
import { sendMembershipConfirmationEmail } from '../utils/email.js';

const MEMBERSHIP_PRICE_OMR = 21;
const MEMBERSHIP_PRICE_BAISA = MEMBERSHIP_PRICE_OMR * 1000;
const MEMBERSHIP_KEY = 'iks_membership_code';
const MEMBERSHIP_PREFIX = 'IKS';
const MEMBERSHIP_PAD = 5;
const MEMBERSHIP_START = 2001;

function asSafeString(value) {
  return String(value ?? '')
    .replace(/[<>"']/g, '')
    .trim();
}

function mapGatewayToMembershipStatus(paymentStatus) {
  if (paymentStatus === 'paid') return 'Success';
  if (paymentStatus === 'cancelled') return 'Cancelled';
  return 'Failed';
}

async function getNextMembershipCode() {
  const incrementExisting = async () =>
    Sequence.findOneAndUpdate({ key: MEMBERSHIP_KEY }, { $inc: { value: 1 } }, { new: true });

  let sequence = await incrementExisting();
  if (!sequence) {
    try {
      await Sequence.create({ key: MEMBERSHIP_KEY, value: MEMBERSHIP_START - 1 });
    } catch (error) {
      // Another request may create it concurrently. Ignore duplicate key and continue.
      if (error?.code !== 11000) {
        throw error;
      }
    }
    sequence = await incrementExisting();
  }

  if (!sequence) {
    throw new Error('Could not generate membership sequence');
  }

  return `${MEMBERSHIP_PREFIX}${String(sequence.value).padStart(MEMBERSHIP_PAD, '0')}`;
}

export async function createMembershipCheckout(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const appUser = await User.findById(req.user._id);
    if (!appUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const existingMembership = await Membership.findOne({ userId: appUser._id });
    if (existingMembership?.paymentStatus === 'Success' && existingMembership?.isActive) {
      return res.status(409).json({
        success: false,
        error: 'Membership already active',
        membershipCode: existingMembership.membershipCode,
      });
    }

    const membershipCode = existingMembership?.membershipCode || (await getNextMembershipCode());
    const clientReferenceId = crypto.randomUUID();
    const thawaniPayload = {
      client_reference_id: clientReferenceId,
      mode: 'payment',
      products: [{ name: 'IKS Membership', quantity: 1, unit_amount: MEMBERSHIP_PRICE_BAISA }],
      success_url: `${process.env.CLIENT_BASE_URL}/membership/payment/response?client_reference_id=${clientReferenceId}`,
      cancel_url: `${process.env.CLIENT_BASE_URL}/membership/payment/response?client_reference_id=${clientReferenceId}&cancelled=true`,
      metadata: {
        payment_type: 'membership_registration',
        membership_code: membershipCode,
        user_id: appUser._id.toString(),
        customer_name: `${asSafeString(appUser.firstName)} ${asSafeString(appUser.lastName)}`.trim(),
        customer_email: asSafeString(appUser.email).toLowerCase(),
      },
    };

    const thawaniResponse = await axios.post(
      `${process.env.THAWANI_API_BASE_URL}/checkout/session`,
      thawaniPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'thawani-api-key': process.env.THAWANI_API_KEY,
        },
        timeout: 15000,
      }
    );

    const sessionId =
      thawaniResponse.data?.data?.session_id || thawaniResponse.data?.session_id || null;
    if (!sessionId) {
      return res
        .status(502)
        .json({ success: false, error: 'Invalid response from payment gateway' });
    }

    const sessionUrl = `${process.env.THAWANI_API_PAY_URL}/${sessionId}?key=${process.env.PUBLISHABLE_KEY}`;

    const membership = await Membership.findOneAndUpdate(
      { userId: appUser._id },
      {
        userId: appUser._id,
        membershipCode,
        amountBaisa: MEMBERSHIP_PRICE_BAISA,
        amountOmr: MEMBERSHIP_PRICE_OMR,
        currency: 'OMR',
        paymentStatus: 'Pending',
        sessionId,
        clientReferenceId,
        isActive: false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await PaymentAttempt.create({
      sessionId,
      clientReferenceId,
      userId: appUser._id,
      membershipId: membership._id,
      products: thawaniPayload.products,
      totalAmount: MEMBERSHIP_PRICE_BAISA,
      currency: 'OMR',
      successUrl: thawaniPayload.success_url,
      cancelUrl: thawaniPayload.cancel_url,
      paymentStatus: 'unpaid',
      paymentType: 'membership_registration',
      metadata: thawaniPayload.metadata,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent') || null,
      expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return res.status(200).json({
      success: true,
      sessionUrl,
      clientReferenceId,
      membershipCode,
      totalAmountOmr: MEMBERSHIP_PRICE_OMR.toFixed(3),
      totalAmountUsdApprox: 50,
    });
  } catch (error) {
    console.error('Error creating membership checkout:', error);
    if (error.response?.data) {
      console.error('Thawani API Error:', JSON.stringify(error.response.data, null, 2));
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to create checkout session',
      message: error.response?.data?.message || error.message,
    });
  }
}

async function handleMembershipPaymentUpdate(paymentAttempt, paymentStatus, paymentMethod) {
  const membership = await Membership.findOne({
    $or: [{ _id: paymentAttempt.membershipId }, { clientReferenceId: paymentAttempt.clientReferenceId }],
  });
  if (!membership) {
    throw new Error('Membership record not found for payment attempt');
  }

  membership.paymentStatus = mapGatewayToMembershipStatus(paymentStatus);
  membership.paymentMethod = asSafeString(paymentMethod || 'Online Payment');
  membership.sessionId = paymentAttempt.sessionId;
  membership.clientReferenceId = paymentAttempt.clientReferenceId;

  if (paymentStatus === 'paid') {
    membership.isActive = true;
    membership.paidAt = new Date();
  } else {
    membership.isActive = false;
  }
  await membership.save();

  const user = await User.findById(membership.userId);
  if (user) {
    if (paymentStatus === 'paid') {
      user.membershipCode = membership.membershipCode;
      user.membershipPaidAt = membership.paidAt || new Date();
    } else {
      user.membershipPaidAt = null;
    }
    await user.save();
  }

  if (paymentStatus === 'paid' && user?.email) {
    await sendMembershipConfirmationEmail({
      to: user.email,
      fromEmail: process.env.FROM_EMAIL,
      fromName: process.env.EMAIL_FROM_NAME,
      logoUrl: process.env.ORG_LOGO_URL || `${process.env.CLIENT_BASE_URL}/src/assets/logo.avif`,
      member: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        membershipCode: membership.membershipCode,
        amountOmr: membership.amountOmr,
        amountUsdApprox: 50,
        paymentDate: membership.paidAt || new Date(),
        paymentMethod: membership.paymentMethod || 'Online Payment',
      },
    });
  }

  return membership;
}

export async function verifyMembershipPaymentStatus(req, res) {
  try {
    const clientReferenceId = asSafeString(req.query?.client_reference_id);
    if (!clientReferenceId) {
      return res
        .status(400)
        .json({ success: false, error: 'Client reference ID is required' });
    }

    const paymentAttempt = await PaymentAttempt.findOne({ clientReferenceId });
    if (!paymentAttempt) {
      return res.status(404).json({ success: false, error: 'Payment attempt not found' });
    }

    if (paymentAttempt.paymentStatus !== 'paid') {
      const thawaniResponse = await axios.get(
        `${process.env.THAWANI_API_BASE_URL}/checkout/session/${paymentAttempt.sessionId}`,
        {
          headers: {
            'thawani-api-key': process.env.THAWANI_API_KEY,
          },
          timeout: 15000,
        }
      );

      const sessionData = thawaniResponse.data?.data || thawaniResponse.data || {};
      const paymentStatus = asSafeString(sessionData.payment_status || 'unpaid').toLowerCase();
      const paymentMethod = asSafeString(sessionData.payment_method || 'Online Payment');

      paymentAttempt.paymentStatus = ['paid', 'cancelled', 'failed', 'unpaid'].includes(paymentStatus)
        ? paymentStatus
        : 'unpaid';
      paymentAttempt.paymentMethod = paymentMethod;
      if (sessionData.invoice) paymentAttempt.invoice = sessionData.invoice;
      await paymentAttempt.save();

      if (['paid', 'cancelled', 'failed'].includes(paymentAttempt.paymentStatus)) {
        await handleMembershipPaymentUpdate(
          paymentAttempt,
          paymentAttempt.paymentStatus,
          paymentAttempt.paymentMethod
        );
      }
    }

    const membership = await Membership.findOne({
      $or: [{ _id: paymentAttempt.membershipId }, { clientReferenceId: paymentAttempt.clientReferenceId }],
    }).lean();

    return res.status(200).json({
      success: true,
      data: {
        payment_status: paymentAttempt.paymentStatus,
        session_id: paymentAttempt.sessionId,
        client_reference_id: paymentAttempt.clientReferenceId,
        total_amount: paymentAttempt.totalAmount,
        currency: paymentAttempt.currency,
        metadata: paymentAttempt.metadata,
        membership: membership
          ? {
              membership_code: membership.membershipCode,
              payment_status: membership.paymentStatus,
              is_active: membership.isActive,
              paid_at: membership.paidAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Error verifying membership payment:', error);
    if (error.response?.data) {
      console.error('Thawani API Error:', JSON.stringify(error.response.data, null, 2));
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to verify payment',
      message: error.response?.data?.message || error.message,
    });
  }
}
