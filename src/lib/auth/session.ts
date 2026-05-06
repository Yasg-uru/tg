import 'server-only';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { Types } from 'mongoose';
import { AuthSession, AuthUser } from '@/lib/db/models';
import { dbConnect } from '@/lib/db/connection';
import { authConfig } from './config';
import { generateSessionId, generateSessionToken, hashToken } from './crypto';

type SessionLookup = {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  expiresAt: Date;
};

export type AuthSessionSummary = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: 'owner' | 'admin' | 'staff' | 'viewer';
  };
};

export async function createSessionForUser({
  userId,
  ip,
  userAgent,
}: {
  userId: string;
  ip: string;
  userAgent: string;
}) {
  await dbConnect();

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + authConfig.session.ttlDays * 24 * 60 * 60 * 1000
  );

  await AuthSession.create({
    sessionId,
    userId,
    tokenHash,
    expiresAt,
    lastSeenAt: now,
    ip,
    userAgent,
  });

  await setSessionCookie(token, expiresAt);

  return { token, sessionId, expiresAt };
}

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(authConfig.session.cookieName)?.value;
  if (!token) {
    return null;
  }

  return getSessionByToken(token);
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(authConfig.session.cookieName)?.value;
  if (!token) {
    return null;
  }

  return getSessionByToken(token);
}

export async function getSessionSummary(): Promise<AuthSessionSummary | null> {
  const store = await cookies();
  const token = store.get(authConfig.session.cookieName)?.value;
  if (!token) {
    return null;
  }

  const session = await getSessionByToken(token);
  if (!session) {
    return null;
  }

  const user = await AuthUser.findById(session.userId)
    .select('email name role')
    .lean<{
      _id: Types.ObjectId;
      email: string;
      name?: string | null;
      role: 'owner' | 'admin' | 'staff' | 'viewer';
    } | null>();

  if (!user) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name || null,
      role: user.role,
    },
  };
}

export async function revokeSessionByToken(token: string, reason = 'logout') {
  await dbConnect();
  const tokenHash = hashToken(token);
  await AuthSession.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(authConfig.session.cookieName);
}

async function getSessionByToken(token: string): Promise<SessionLookup | null> {
  await dbConnect();

  const tokenHash = hashToken(token);
  const now = new Date();

  const session = await AuthSession.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).lean<SessionLookup | null>();

  if (!session) {
    return null;
  }

  await AuthSession.updateOne(
    { _id: session._id },
    { $set: { lastSeenAt: now } }
  );

  return session;
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(authConfig.session.cookieName, token, {
    httpOnly: true,
    secure: authConfig.session.cookieSecure,
    sameSite: authConfig.session.cookieSameSite,
    path: '/',
    expires: expiresAt,
  });
}
