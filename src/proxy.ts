import { NextRequest, NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { getSessionFromRequest } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/auth'];
const PUBLIC_API_PREFIXES = ['/api/auth'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(request);

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/auth', request.url);
  loginUrl.searchParams.set('from', pathname);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(authConfig.session.cookieName);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|auth|api/auth).*)',
  ],
};
