import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requestOtpSchema } from '@/lib/validation/auth';
import { createOtpChallenge } from '@/lib/auth/otp';
import { getRequestMeta } from '@/lib/auth/request';
import { AppError } from '@/lib/utils/errors';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = requestOtpSchema.parse(payload);
    const { ip, userAgent } = getRequestMeta(request);

    const result = await createOtpChallenge({
      email: parsed.email,
      name: parsed.name,
      ip,
      userAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Verification code sent',
        data: {
          otpId: result.otpId,
          expiresAt: result.expiresAt,
          resendAfterSeconds: result.resendAfterSeconds,
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
        message: 'Failed to send OTP',
        errors: [message],
      },
      { status: 500 }
    );
  }
}
