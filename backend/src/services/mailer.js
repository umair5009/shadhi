const { Resend } = require('resend');
const env = require('../config/env');

// Transactional email (password reset). The provider is chosen by EMAIL_PROVIDER:
//   console → prints the email to the server log (development)
//   resend  → sends through Resend
//   none    → disabled
function createSender() {
  if (env.isTest || env.EMAIL_PROVIDER === 'none') return null;
  if (env.EMAIL_PROVIDER === 'resend') {
    const client = new Resend(env.RESEND_API_KEY);
    return async ({ to, subject, text }) => {
      const { error } = await client.emails.send({ from: env.EMAIL_FROM, to, subject, text });
      if (error) throw new Error(error.message ?? 'Email provider rejected the message');
    };
  }
  return async ({ to, subject, text }) => {
    console.log(`\n[email] → ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`);
  };
}

const sender = createSender();

/** @returns {boolean} false when no email provider is configured */
async function sendEmail({ to, subject, text }) {
  if (!sender) return false;
  await sender({ to, subject, text });
  return true;
}

module.exports = { sendEmail, isEmailEnabled: () => Boolean(sender) };
