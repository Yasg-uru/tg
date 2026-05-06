import 'server-only';

import { AuthUser } from '@/lib/db/models';
import { dbConnect } from '@/lib/db/connection';
import { AppError } from '@/lib/utils/errors';
import { normalizeEmail } from './identity';

export async function findOrCreateUser({
  email,
  name,
}: {
  email: string;
  name?: string | null;
}) {
  await dbConnect();
  const normalized = normalizeEmail(email);

  const existing = await AuthUser.findOne({ email: normalized });

  if (existing) {
    if (existing.status !== 'active') {
      throw new AppError('Account is disabled', 403);
    }
    return { user: existing, created: false };
  }

  const existingCount = await AuthUser.countDocuments();
  const role = existingCount === 0 ? 'owner' : 'staff';

  const user = await AuthUser.create({
    email: normalized,
    name: name?.trim() || undefined,
    role,
    status: 'active',
    lastLoginAt: new Date(),
  });

  return { user, created: true };
}

export async function markUserLogin(userId: string) {
  await dbConnect();
  await AuthUser.updateOne(
    { _id: userId },
    { $set: { lastLoginAt: new Date() } }
  );
}
