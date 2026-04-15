import sgMail from '@sendgrid/mail';

export function initSendgrid(apiKey) {
  sgMail.setApiKey(apiKey);
}

export async function sendOtpEmail({ to, code, fromEmail, fromName, subject }) {
  const msg = {
    to,
    from: { email: fromEmail, name: fromName },
    subject: subject || 'Your verification code',
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
  };
  await sgMail.send(msg);
}

function formatReadableDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export async function sendMembershipConfirmationEmail({
  to,
  fromEmail,
  fromName,
  logoUrl,
  member,
}) {
  const paymentDate = formatReadableDate(member.paymentDate);
  const fullName = `${member.firstName} ${member.lastName}`.trim();
  const amountOmr = Number(member.amountOmr || 0).toFixed(3);
  const amountUsdApprox = Number(member.amountUsdApprox || 50).toFixed(0);

  const msg = {
    to,
    from: { email: fromEmail, name: fromName },
    subject: 'IKS Membership Confirmation',
    text: [
      `Dear ${fullName},`,
      '',
      'Your IKS membership payment has been received successfully.',
      `Membership Code: ${member.membershipCode}`,
      `Amount Paid: ${amountOmr} OMR (~${amountUsdApprox} USD)`,
      `Payment Date: ${paymentDate}`,
      `Payment Method: ${member.paymentMethod}`,
      '',
      'Thank you for joining the International Keratoconus Society.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#4b1f62;max-width:640px;margin:0 auto;padding:24px;background:#fcf8ff;border:1px solid #eadcf2;border-radius:14px;">
        ${
          logoUrl
            ? `<div style="text-align:center;margin-bottom:10px;"><img src="${logoUrl}" alt="IKS Logo" style="max-width:90px;height:auto;" /></div>`
            : ''
        }
        <h2 style="margin:0 0 4px;color:#8225a4;">International Keratoconus Society</h2>
        <p style="margin:0 0 16px;color:#9f5dba;font-size:13px;">Membership Confirmation</p>
        <p style="margin:0 0 12px;">Dear ${fullName},</p>
        <p style="margin:0 0 16px;">
          Your membership payment has been received successfully. We are pleased to confirm your membership details.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #eadcf2;background:#ffffff;margin:0 0 18px;border-radius:10px;overflow:hidden;">
          <tbody>
            <tr><td style="padding:10px;border-bottom:1px solid #f0e6f5;background:#f8f1fc;"><strong>Membership Code</strong></td><td style="padding:10px;border-bottom:1px solid #f0e6f5;">${member.membershipCode}</td></tr>
            <tr><td style="padding:10px;border-bottom:1px solid #f0e6f5;background:#f8f1fc;"><strong>Email</strong></td><td style="padding:10px;border-bottom:1px solid #f0e6f5;">${member.email}</td></tr>
            <tr><td style="padding:10px;border-bottom:1px solid #f0e6f5;background:#f8f1fc;"><strong>Amount Paid</strong></td><td style="padding:10px;border-bottom:1px solid #f0e6f5;">${amountOmr} OMR (~${amountUsdApprox} USD)</td></tr>
            <tr><td style="padding:10px;border-bottom:1px solid #f0e6f5;background:#f8f1fc;"><strong>Payment Date</strong></td><td style="padding:10px;border-bottom:1px solid #f0e6f5;">${paymentDate}</td></tr>
            <tr><td style="padding:10px;"><strong>Payment Method</strong></td><td style="padding:10px;">${member.paymentMethod}</td></tr>
          </tbody>
        </table>
        <p style="margin:0 0 10px;">Thank you for supporting IKS.</p>
        <p style="margin:0;">Kind regards,<br />IKS Membership Team</p>
      </div>
    `,
  };

  await sgMail.send(msg);
}
