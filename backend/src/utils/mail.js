const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendEmail({ to, subject, html, skipContext }) {
  if (!resend) {
    console.warn('RESEND_API_KEY not configured — skipping', skipContext);
    return;
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject,
    html
  });
}

async function sendWelcomeEmail(user) {
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
  await sendEmail({
    to: user.email,
    subject: 'Your Oneness Yoga account is ready',
    html: `<p>Hi ${user.name},</p><p>An account has been created for you on the Oneness Yoga Trainers App.</p><p><a href="${loginUrl}">Click here to log in</a></p>`,
    skipContext: `welcome email to ${user.email}`
  });
}

async function sendGoogleLinkPendingEmail(admin, requestingUser) {
  const trainersUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/trainers`;
  await sendEmail({
    to: admin.email,
    subject: 'Google sign-in approval needed',
    html: `<p>Hi ${admin.name},</p><p>${requestingUser.name} (${requestingUser.email}) requested to sign in with Google.</p><p><a href="${trainersUrl}">Review in Trainers</a></p>`,
    skipContext: `Google-link pending email to ${admin.email}`
  });
}

async function sendGoogleLinkDecisionEmail(user, status) {
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
  const html = status === 'approved'
    ? `<p>Hi ${user.name},</p><p>Your request to sign in with Google has been approved. You can now use "Sign in with Google" going forward.</p><p><a href="${loginUrl}">Go to login</a></p>`
    : `<p>Hi ${user.name},</p><p>Your request to sign in with Google was not approved. Please contact an admin, or continue using your email and password to log in.</p><p><a href="${loginUrl}">Go to login</a></p>`;

  await sendEmail({
    to: user.email,
    subject: status === 'approved' ? 'Google sign-in approved' : 'Google sign-in request update',
    html,
    skipContext: `Google-link decision email to ${user.email}`
  });
}

async function sendBackupAssignedEmail(recipient, session, { role, otherTrainerName }) {
  const sessionsUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/sessions`;
  const subject = role === 'backup'
    ? 'You have been assigned as a backup trainer'
    : 'A backup trainer has been assigned to your session';
  const html = role === 'backup'
    ? `<p>Hi ${recipient.name},</p><p>You've been assigned as the backup trainer for "${session.title}" on ${session.scheduled_date} at ${session.scheduled_time}, in case ${otherTrainerName || 'the assigned trainer'} is unable to make it.</p><p><a href="${sessionsUrl}">View in Sessions</a></p>`
    : `<p>Hi ${recipient.name},</p><p>${otherTrainerName} has been assigned as a backup trainer for your session "${session.title}" on ${session.scheduled_date} at ${session.scheduled_time}, in case you're unable to make it.</p><p><a href="${sessionsUrl}">View in Sessions</a></p>`;

  await sendEmail({
    to: recipient.email,
    subject,
    html,
    skipContext: `backup-assignment email to ${recipient.email}`
  });
}

async function sendPasswordResetEmail(user, resetUrl) {
  await sendEmail({
    to: user.email,
    subject: 'Reset your Oneness Yoga password',
    html: `<p>Hi ${user.name},</p><p>We received a request to reset your password. This link expires in 1 hour and can only be used once.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
    skipContext: `password reset email to ${user.email}`
  });
}

module.exports = { sendWelcomeEmail, sendGoogleLinkPendingEmail, sendGoogleLinkDecisionEmail, sendBackupAssignedEmail, sendPasswordResetEmail };
