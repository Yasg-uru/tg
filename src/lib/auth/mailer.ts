import 'server-only';

import nodemailer from 'nodemailer';
import { authConfig, getSmtpConfig } from './config';
import { logger } from '@/lib/utils/logger';

type SendOtpParams = {
  to: string;
  code: string;
  expiresAt: Date;
  name?: string | null;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const smtp = getSmtpConfig();
  cachedTransporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  return cachedTransporter;
}

export async function sendOtpEmail({ to, code, expiresAt, name }: SendOtpParams) {
  if (authConfig.otp.delivery === 'console') {
    logger.info('OTP delivery set to console', {
      to,
      code,
      expiresAt: expiresAt.toISOString(),
    });
    return;
  }

  const smtp = getSmtpConfig();
  const transporter = getTransporter();
  const ttlMinutes = Math.max(
    1,
    Math.round((expiresAt.getTime() - Date.now()) / 60000)
  );

  const greeting = name ? `Hello ${name},` : 'Hello,';
  const subject = 'Your Time-Gen verification code';
  const text = `${greeting}\n\nYour verification code is ${code}.\nIt expires in ${ttlMinutes} minutes.\n\nIf you did not request this, you can ignore this email.`;

  const html = `<p>${greeting}</p><p>Your verification code is <strong>${code}</strong>.</p><p>It expires in ${ttlMinutes} minutes.</p><p>If you did not request this, you can ignore this email.</p>`;

  await transporter.sendMail({
    from: smtp.from,
    to,
    subject,
    text,
    html,
  });
}
