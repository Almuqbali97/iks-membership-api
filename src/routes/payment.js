import { Router } from 'express';
import { createMembershipCheckout, verifyMembershipPaymentStatus } from '../controllers/payment.js';
import { requireAuth } from '../middleware/auth.js';

export function paymentRoutes() {
  const r = Router();

  r.post('/create-membership-checkout', requireAuth, createMembershipCheckout);
  r.get('/membership/verify', verifyMembershipPaymentStatus);

  return r;
}
