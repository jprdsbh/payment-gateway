import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PixPaymentData {
  transactionId: string;
  amount: number;
  pixKey: string;
  pixKeyType: string;
}

export interface PaymentResult {
  approved: boolean;
  errorMessage?: string;
  processedAt: Date;
}

@Injectable()
export class PixProcessor {
  private readonly logger = new Logger(PixProcessor.name);
  private readonly approvalRate: number;
  private readonly processingDelay: number;

  constructor(private readonly configService: ConfigService) {
    this.approvalRate = parseFloat(
      this.configService.get<string>('PAYMENT_APPROVAL_RATE', '0.85'),
    );
    this.processingDelay = parseInt(
      this.configService.get<string>('PAYMENT_PROCESSING_DELAY_MS', '2000'),
    );
  }

  async process(data: PixPaymentData): Promise<PaymentResult> {
    this.logger.log(
      `Processing PIX payment | transactionId: ${data.transactionId} | pixKey: ${data.pixKey}`,
    );

    // Simulate async processing delay (bank network call)
    await this.delay(this.processingDelay);

    // PIX has higher approval rate since it's instant and doesn't go through card networks
    const pixApprovalRate = Math.min(this.approvalRate + 0.05, 0.99);
    const approved = Math.random() < pixApprovalRate;

    if (approved) {
      this.logger.log(`PIX payment APPROVED | transactionId: ${data.transactionId}`);
      return { approved: true, processedAt: new Date() };
    }

    const reasons = [
      'Chave PIX não encontrada',
      'Limite diário excedido',
      'Conta destinatária inativa',
      'Erro na validação da chave PIX',
    ];
    const errorMessage = reasons[Math.floor(Math.random() * reasons.length)];

    this.logger.warn(
      `PIX payment REJECTED | transactionId: ${data.transactionId} | reason: ${errorMessage}`,
    );
    return { approved: false, errorMessage, processedAt: new Date() };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
