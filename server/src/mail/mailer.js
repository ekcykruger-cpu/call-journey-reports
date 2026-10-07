// Sends email. Gmail API sending is added in a later step (see docs/gmail-setup.md once written).
// Until then, emails are written to the server log so invite/reset links can still be used.
// Returns { sent: boolean } so callers can show the link to an admin when nothing was emailed.

export function isMailConfigured() {
  return false;
}

export async function sendMail({ to, subject, text }) {
  if (!isMailConfigured()) {
    console.warn(
      `[mail] Email sending not configured - message NOT sent.\n` +
        `  To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}`,
    );
    return { sent: false };
  }
  return { sent: false };
}

export function inviteEmail(link) {
  return {
    subject: 'You have been invited to Call Journey Reports',
    text:
      `You have been given access to Call Journey Reports.\n\n` +
      `Set your password here (link valid for 72 hours):\n${link}\n\n` +
      `If you weren't expecting this, you can ignore this email.`,
  };
}

export function resetEmail(link) {
  return {
    subject: 'Reset your Call Journey Reports password',
    text:
      `Someone (hopefully you) asked to reset your password.\n\n` +
      `Choose a new password here (link valid for 30 minutes, single use):\n${link}\n\n` +
      `If you didn't ask for this, ignore this email - your password won't change.`,
  };
}
