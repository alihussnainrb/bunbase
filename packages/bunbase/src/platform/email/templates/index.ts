/**
 * Default Email Templates
 * Built-in templates for common authentication flows
 */

/**
 * Email verification template
 * Variables: userName, verificationUrl, expiresIn
 */
export const AUTH_VERIFY_EMAIL = {
	key: 'auth-verify-email',
	name: 'Email Verification',
	description: 'Email verification for new user signups',
	subject: 'Verify your email address',
	htmlBody: `<h1>Verify Your Email</h1>
<p>Hi {{userName}},</p>
<p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
<p><a href="{{verificationUrl}}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{verificationUrl}}</p>
<p>This link will expire in {{expiresIn}}.</p>
<p>If you didn't create an account, you can safely ignore this email.</p>`,
	textBody: `Hi {{userName}},

Thank you for signing up! Please verify your email address by clicking the link below:

{{verificationUrl}}

This link will expire in {{expiresIn}}.

If you didn't create an account, you can safely ignore this email.`,
	variables: ['userName', 'verificationUrl', 'expiresIn'],
}

/**
 * Password reset template
 * Variables: userName, resetUrl, expiresIn
 */
export const AUTH_PASSWORD_RESET = {
	key: 'auth-password-reset',
	name: 'Password Reset',
	description: 'Password reset request email',
	subject: 'Reset your password',
	htmlBody: `<h1>Reset Your Password</h1>
<p>Hi {{userName}},</p>
<p>We received a request to reset your password. Click the link below to create a new password:</p>
<p><a href="{{resetUrl}}" style="background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{resetUrl}}</p>
<p>This link will expire in {{expiresIn}}.</p>
<p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>`,
	textBody: `Hi {{userName}},

We received a request to reset your password. Click the link below to create a new password:

{{resetUrl}}

This link will expire in {{expiresIn}}.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.`,
	variables: ['userName', 'resetUrl', 'expiresIn'],
}

/**
 * All default templates
 */
export const DEFAULT_TEMPLATES = [AUTH_VERIFY_EMAIL, AUTH_PASSWORD_RESET]
