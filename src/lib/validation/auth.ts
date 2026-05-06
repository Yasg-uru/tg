import { z } from 'zod';

export const requestOtpSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
});

export const verifyOtpSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  otpId: z.string().min(1, 'OTP session is required'),
  name: z.string().trim().min(2).optional(),
});
