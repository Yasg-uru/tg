import 'server-only';

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseList = (value: string | undefined) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];

const isProd = process.env.NODE_ENV === 'production';

export const authConfig = {
  secret: process.env.AUTH_SECRET || '',
  otp: {
    ttlMinutes: parseNumber(process.env.AUTH_OTP_TTL_MINUTES, 10),
    length: 6,
    resendSeconds: parseNumber(process.env.AUTH_OTP_RESEND_SECONDS, 60),
    maxAttempts: parseNumber(process.env.AUTH_OTP_MAX_ATTEMPTS, 5),
    requestLimit: parseNumber(process.env.AUTH_OTP_REQUEST_LIMIT, 5),
    requestWindowSeconds: parseNumber(process.env.AUTH_OTP_REQUEST_WINDOW_SECONDS, 900),
    verifyLimit: parseNumber(process.env.AUTH_OTP_VERIFY_LIMIT, 10),
    verifyWindowSeconds: parseNumber(process.env.AUTH_OTP_VERIFY_WINDOW_SECONDS, 900),
    delivery: (process.env.AUTH_OTP_DELIVERY || 'smtp') as 'smtp' | 'console',
  },
  session: {
    ttlDays: parseNumber(process.env.AUTH_SESSION_TTL_DAYS, 30),
    cookieName:
      process.env.AUTH_COOKIE_NAME ||
      (isProd ? '__Host-timegen-session' : 'timegen_session'),
    cookieSecure: isProd,
    cookieSameSite: 'lax' as const,
  },
  allowlist: {
    domains: parseList(process.env.AUTH_ALLOWED_EMAIL_DOMAINS),
    emails: parseList(process.env.AUTH_ALLOWED_EMAILS),
  },
  smtp: {
    host: process.env.AUTH_SMTP_HOST || '',
    port: parseNumber(process.env.AUTH_SMTP_PORT, 587),
    user: process.env.AUTH_SMTP_USER || '',
    pass: process.env.AUTH_SMTP_PASS || '',
    from: process.env.AUTH_SMTP_FROM || '',
  },
};

export function getAuthSecret() {
  if (!authConfig.secret) {
    throw new Error('AUTH_SECRET is required for authentication');
  }
  return authConfig.secret;
}

export function getSmtpConfig() {
  const { host, port, user, pass, from } = authConfig.smtp;
  if (!host || !user || !pass || !from) {
    throw new Error('SMTP settings are required to send OTP emails');
  }
  return { host, port, user, pass, from };
}
