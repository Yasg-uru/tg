import 'server-only';

import { AuthOtp } from '@/lib/db/models';
import { dbConnect } from '@/lib/db/connection';
import { authConfig } from './config';
import { generateOtpCode, hashOtp, safeEqual } from './crypto';
import { normalizeEmail, isEmailAllowed } from './identity';
import { consumeRateLimit } from './rate-limit';
import { sendOtpEmail } from './mailer';
import { AppError } from '@/lib/utils/errors';

type CreateOtpParams = {
  email: string;
  name?: string | null;
  ip: string;
  userAgent: string;
};

type VerifyOtpParams = {
  otpId: string;
  email: string;
  code: string;
  ip: string;
  userAgent: string;
};

export async function createOtpChallenge({
  email,
  name,
  ip,
  userAgent,
}: CreateOtpParams) {
  const normalized = normalizeEmail(email);

  if (!isEmailAllowed(normalized)) {
    throw new AppError('Email is not allowed to register', 403);
  }

  await dbConnect();

  const emailLimit = await consumeRateLimit(
    `otp:request:email:${normalized}`,
    authConfig.otp.requestLimit,
    authConfig.otp.requestWindowSeconds
  );

  if (!emailLimit.allowed) {
    throw new AppError('Too many OTP requests', 429, {
      retryAfterSeconds: emailLimit.retryAfterSeconds,
    });
  }

  const ipLimit = await consumeRateLimit(
    `otp:request:ip:${ip}`,
    authConfig.otp.requestLimit,
    authConfig.otp.requestWindowSeconds
  );

  if (!ipLimit.allowed) {
    throw new AppError('Too many OTP requests', 429, {
      retryAfterSeconds: ipLimit.retryAfterSeconds,
    });
  }

  const now = new Date();
  await AuthOtp.updateMany(
    { email: normalized, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now, consumedReason: 'superseded' } }
  );

  const code = generateOtpCode();
  const codeHash = hashOtp(code, normalized);
  const expiresAt = new Date(
    now.getTime() + authConfig.otp.ttlMinutes * 60 * 1000
  );

  const record = await AuthOtp.create({
    email: normalized,
    codeHash,
    purpose: 'signup',
    attempts: 0,
    maxAttempts: authConfig.otp.maxAttempts,
    expiresAt,
    requestIp: ip,
    userAgent,
  });

  await sendOtpEmail({ to: normalized, code, expiresAt, name });

  return {
    otpId: record._id.toString(),
    expiresAt,
    resendAfterSeconds: authConfig.otp.resendSeconds,
  };
}

export async function verifyOtpChallenge({
  otpId,
  email,
  code,
  ip,
  userAgent,
}: VerifyOtpParams) {
  const normalized = normalizeEmail(email);

  if (!isEmailAllowed(normalized)) {
    throw new AppError('Email is not allowed to register', 403);
  }

  await dbConnect();

  const emailLimit = await consumeRateLimit(
    `otp:verify:email:${normalized}`,
    authConfig.otp.verifyLimit,
    authConfig.otp.verifyWindowSeconds
  );

  if (!emailLimit.allowed) {
    throw new AppError('Too many verification attempts', 429, {
      retryAfterSeconds: emailLimit.retryAfterSeconds,
    });
  }

  const ipLimit = await consumeRateLimit(
    `otp:verify:ip:${ip}`,
    authConfig.otp.verifyLimit,
    authConfig.otp.verifyWindowSeconds
  );

  if (!ipLimit.allowed) {
    throw new AppError('Too many verification attempts', 429, {
      retryAfterSeconds: ipLimit.retryAfterSeconds,
    });
  }

  const record = await AuthOtp.findOne({ _id: otpId, email: normalized });

  if (!record) {
    throw new AppError('Invalid or expired code', 400);
  }

  const now = new Date();

  if (record.expiresAt <= now || record.consumedAt) {
    throw new AppError('Invalid or expired code', 400);
  }

  if (record.attempts >= record.maxAttempts) {
    throw new AppError('Too many attempts', 429);
  }

  const expectedHash = hashOtp(code, normalized);

  if (!safeEqual(expectedHash, record.codeHash)) {
    record.attempts += 1;
    record.lastAttemptAt = now;
    await record.save();
    throw new AppError('Invalid or expired code', 400);
  }

  record.consumedAt = now;
  record.consumedByIp = ip;
  record.consumedUserAgent = userAgent;
  await record.save();

  return { email: normalized };
}
