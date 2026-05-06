import 'server-only';

import { redirect } from 'next/navigation';
import { getSession } from './session';

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirect('/auth');
  }
  return session;
}
