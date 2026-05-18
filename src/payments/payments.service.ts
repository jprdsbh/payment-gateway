import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PaymentMethod, Transaction, TransactionStatus } from '../transactions/entities/transaction.entity';
import { PixProcessor } from './processors/pix.processor';
import { CreditCardProcessor } from './processors/credit-card.processor';
import { QueueConsumer, PaymentProcessor } from '../queue/queue.consumer';
import { PaymentMessage } from '../queue/queue.producer';

@Injectable()
export class PaymentsService implements OnModuleInit, PaymentProcessor {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly pixProcessor: PixProcessor,
    private readonly creditCardProcessor: CreditCardProcessor,
    private readonly queueConsumer: QueueConsumer,
  ) {}

  onModuleInit() {
    this.queueConsumer.setProcessor(this);
  }

  async processPayment(
    message: PaymentMessage,
  ): Promise<{ approved: boolean; errorMessage?: string }> {
    const { transactionId, paymentMethod } = message;

    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      this.logger.error(`Transaction not found: ${transactionId}`);
      return { approved: false, errorMessage: 'Transaction not found' };
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      this.logger.warn(
        `Transaction ${transactionId} already processed with status: ${transaction.status}`,
      );
      return { approved: transaction.status === TransactionStatus.APPROVED };
    }

    // Mark as PROCESSING
    await this.transactionRepo.update(transactionId, { status: TransactionStatus.PROCESSING });

    let result: { approved: boolean; errorMessage?: string; processedAt?: Date };

    try {
      if (paymentMethod === PaymentMethod.PIX) {
        result = await this.pixProcessor.process({
          transactionId,
          amount: message.amount,
          pixKey: transaction.pixKey,
          pixKeyType: transaction.pixKeyType,
        });
      } else if (paymentMethod === PaymentMethod.CREDIT_CARD) {
        result = await this.creditCardProcessor.process({
          transactionId,
          amount: message.amount,
          cardLastFour: transaction.cardLastFour,
          cardHolder: transaction.cardHolder,
          cardBrand: transaction.cardBrand,
          installments: transaction.installments,
        });
      } else {
        result = { approved: false, errorMessage: `Unsupported payment method: ${paymentMethod}` };
      }
    } catch (err) {
      this.logger.error(`Payment processing error for ${transactionId}`, err.message);
      result = { approved: false, errorMessage: 'Internal processing error' };
    }

    const newStatus = result.approved ? TransactionStatus.APPROVED : TransactionStatus.REJECTED;

    await this.transactionRepo.update(transactionId, {
      status: newStatus,
      errorMessage: result.errorMessage || null,
      processedAt: result.processedAt || new Date(),
    });

    // Invalidate stats cache and transaction cache so dashboard updates immediately
    await this.cacheManager.del('transactions:stats');
    await this.cacheManager.del(`transaction:${transactionId}`);

    this.logger.log(
      `Transaction ${transactionId} finalized with status: ${newStatus}`,
    );

    return { approved: result.approved, errorMessage: result.errorMessage };
  }
}
