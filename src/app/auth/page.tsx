import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { getSessionSummary } from '@/lib/auth/session';

export default async function AuthPage() {
  const session = await getSessionSummary();
  if (session) {
    redirect('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <AuthCard />
    </main>
  );
}
