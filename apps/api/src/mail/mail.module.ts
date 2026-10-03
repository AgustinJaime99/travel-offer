import { Global, Module } from '@nestjs/common';
import { SmtpVerificationSender, VerificationSender } from './verification-sender.js';

@Global()
@Module({
  providers: [{ provide: VerificationSender, useClass: SmtpVerificationSender }],
  exports: [VerificationSender],
})
export class MailModule {}
