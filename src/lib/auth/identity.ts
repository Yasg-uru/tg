import 'server-only';

import { authConfig } from './config';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(email: string) {
  const normalized = normalizeEmail(email);
  const { domains, emails } = authConfig.allowlist;

  if (domains.length === 0 && emails.length === 0) {
    return true;
  }

  if (emails.includes(normalized)) {
    return true;
  }

  const domain = normalized.split('@')[1] || '';
  return domain ? domains.includes(domain) : false;
}
