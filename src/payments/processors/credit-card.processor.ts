import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreditCardPaymentData {
  transactionId: string;
  amount: number;
  cardLastFour: string;
  cardHolder: string;
  cardBrand: string;
  installments: number;
}

export interface PaymentResult {
  approved: boolean;
  errorMessage?: string;
  processedAt: Date;
  authorizationCode?: string;
}

@Injectable()
export class CreditCardProcessor {
  private readonly logger = new Logger(CreditCardProcessor.name);
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

  async process(data: CreditCardPaymentData): Promise<PaymentResult> {
    this.logger.log(
      `Processing credit card payment | transactionId: ${data.transactionId} | card: ****${data.cardLastFour}`,
    );

    // Simulate card network processing delay
    await this.delay(this.processingDelay + Math.random() * 500);

    const approved = Math.random() < this.approvalRate;

    if (approved) {
      const authorizationCode = this.generateAuthorizationCode();
      this.logger.log(
        `Credit card APPROVED | transactionId: ${data.transactionId} | auth: ${authorizationCode}`,
      );
      return { approved: true, authorizationCode, processedAt: new Date() };
    }

    const reasons = [
      'Saldo insuficiente',
      'Cartão bloqueado',
      'Transação suspeita — entre em contato com seu banco',
      'Limite de crédito excedido',
      'Cartão expirado',
      'Erro na autenticação do cartão',
    ];
    const errorMessage = reasons[Math.floor(Math.random() * reasons.length)];

    this.logger.warn(
      `Credit card REJECTED | transactionId: ${data.transactionId} | reason: ${errorMessage}`,
    );
    return { approved: false, errorMessage, processedAt: new Date() };
  }

  detectCardBrand(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\D/g, '');
    if (/^4/.test(cleaned)) return 'VISA';
    if (/^5[1-5]/.test(cleaned)) return 'MASTERCARD';
    if (/^3[47]/.test(cleaned)) return 'AMEX';
    if (/^6(?:011|5)/.test(cleaned)) return 'DISCOVER';
    if (/^(?:2131|1800|35)/.test(cleaned)) return 'JCB';
    if (/^3(?:0[0-5]|[68])/.test(cleaned)) return 'DINERS';
    if (/^(?:606282|3841)/.test(cleaned)) return 'HIPERCARD';
    if (/^(?:384100|384140|384160|606282|637095|637568|60(.*)9)/.test(cleaned)) return 'ELO';
    return 'UNKNOWN';
  }

  private generateAuthorizationCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
