'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

type AuthStep = 'request' | 'verify';

type ApiResponse = {
  success: boolean;
  message?: string;
  data?: {
    otpId?: string;
    resendAfterSeconds?: number;
    user?: {
      id: string;
      email: string;
      role: string;
    };
  };
  retryAfterSeconds?: number;
};

export function AuthCard() {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>('request');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);

  useEffect(() => {
    if (resendAfter <= 0) return;
    const timer = setInterval(() => {
      setResendAfter((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAfter]);

  const requestOtp = async () => {
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
        credentials: 'include',
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        const retryAfter = data.retryAfterSeconds
          ? ` Try again in ${data.retryAfterSeconds}s.`
          : '';
        setError(data.message || `Unable to send OTP.${retryAfter}`);
        return;
      }

      setOtpId(data.data?.otpId || '');
      setResendAfter(Number(data.data?.resendAfterSeconds) || 0);
      setStep('verify');
      setCode('');
      toast.success('Verification code sent');
    } catch {
      setError('Unable to send verification code. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const handleRequestOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await requestOtp();
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, code, otpId }),
        credentials: 'include',
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        const retryAfter = data.retryAfterSeconds
          ? ` Try again in ${data.retryAfterSeconds}s.`
          : '';
        setError(data.message || `Verification failed.${retryAfter}`);
        return;
      }

      toast.success('Signed in successfully');
      router.push('/');
      router.refresh();
    } catch {
      setError('Unable to verify code. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const handleResend = async () => {
    if (pending || resendAfter > 0) return;
    setResendAfter(0);
    await requestOtp();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogIn className="h-4 w-4" />
          Secure Access
        </CardTitle>
        <CardDescription>
          {step === 'request'
            ? 'Enter your email to receive a one-time verification code.'
            : 'Enter the code sent to your email to continue.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {step === 'request' ? (
          <form className="space-y-4" onSubmit={handleRequestOtp}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="auth-email">
                Work email
              </label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@institution.edu"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="auth-name">
                Full name (optional)
              </label>
              <Input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name used for account creation"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleVerifyOtp}>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              Sent to <span className="font-medium">{email}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="auth-code">
                Verification code
              </label>
              <Input
                id="auth-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(value);
                }}
                placeholder="6-digit code"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Verify and continue'
              )}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('request')}
                disabled={pending}
              >
                Change email
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={pending || resendAfter > 0}
              >
                {resendAfter > 0 ? `Resend in ${resendAfter}s` : 'Resend code'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        OTPs expire after a few minutes. Keep this tab open while verifying.
      </CardFooter>
    </Card>
  );
}
