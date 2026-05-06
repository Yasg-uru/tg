import { NextRequest, NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { clearSessionCookie, revokeSessionByToken } from '@/lib/auth/session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = request.cookies.get(authConfig.session.cookieName)?.value;

    if (token) {
      await revokeSessionByToken(token, 'logout');
    }

    await clearSessionCookie();

    return NextResponse.json(
      { success: true, message: 'Signed out' },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: 'Failed to sign out', errors: [message] },
      { status: 500 }
    );
  }
}
