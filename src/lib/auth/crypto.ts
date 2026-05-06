import 'server-only';

import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import { authConfig, getAuthSecret } from './config';

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashOtp(code: string, email: string) {
  const secret = getAuthSecret();
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

export function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

export function generateSessionId() {
  return randomBytes(16).toString('hex');
}

export function generateOtpCode() {
  const length = Math.max(4, authConfig.otp.length);
  const max = 10 ** length;
  const value = randomInt(0, max);
  return value.toString().padStart(length, '0');
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
