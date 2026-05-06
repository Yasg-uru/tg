import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { verifyOtpSchema } from '@/lib/validation/auth';
import { verifyOtpChallenge } from '@/lib/auth/otp';
import { getRequestMeta } from '@/lib/auth/request';
import { AppError } from '@/lib/utils/errors';
import { findOrCreateUser, markUserLogin } from '@/lib/auth/users';
import { createSessionForUser } from '@/lib/auth/session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = verifyOtpSchema.parse(payload);
    const { ip, userAgent } = getRequestMeta(request);

    await verifyOtpChallenge({
      otpId: parsed.otpId,
      email: parsed.email,
      code: parsed.code,
      ip,
      userAgent,
    });

    const { user, created } = await findOrCreateUser({
      email: parsed.email,
      name: parsed.name,
    });

    await createSessionForUser({
      userId: user._id.toString(),
      ip,
      userAgent,
    });

    await markUserLogin(user._id.toString());

    return NextResponse.json(
      {
        success: true,
        message: created ? 'Account created' : 'Signed in',
        data: {
          user: {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
          ...(error.details || {}),
        },
        { status: error.statusCode }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to verify OTP',
        errors: [message],
      },
      { status: 500 }
    );
  }
}
