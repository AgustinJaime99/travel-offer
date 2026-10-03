import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env.js';

/** Delivers one-time verification codes (the only external notification approved for the MVP). */
export abstract class VerificationSender {
  abstract sendCode(to: string, code: string): Promise<void>;
}

@Injectable()
export class SmtpVerificationSender extends VerificationSender {
  private readonly logger = new Logger(SmtpVerificationSender.name);
  private readonly transporter: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASSWORD
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
        : {}),
    });
  }

  async sendCode(to: string, code: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.env.MAIL_FROM,
        to,
        subject: 'Tu código de verificación de Travel Rock',
        text: [
          `Tu código de verificación es ${code}.`,
          'Vence en 10 minutos. No lo compartas con nadie.',
          'Si no lo pediste, ignorá este mensaje.',
        ].join('\n\n'),
      });
    } catch (error) {
      // Never log the address or the code.
      this.logger.error(`Verification email failed (${(error as Error).name})`);
      throw error;
    }
  }
}
