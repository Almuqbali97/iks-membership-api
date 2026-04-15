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
