import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindManyOptions, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { v4 as uuidv4 } from 'uuid';
import {
  PaymentMethod,
  Transaction,
  TransactionStatus,
} from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { QueueProducer } from '../queue/queue.producer';
import { CreditCardProcessor } from '../payments/processors/credit-card.processor';

const CACHE_TRANSACTION_TTL = 30_000; // 30 seconds
const CACHE_STATS_TTL = 60_000; // 60 seconds
const IDEMPOTENCY_TTL = 86_400_000; // 24 hours

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly queueProducer: QueueProducer,
    private readonly creditCardProcessor: CreditCardProcessor,
  ) {}

  async create(dto: CreateTransactionDto): Promise<Transaction> {
    const idempotencyKey = dto.idempotencyKey || uuidv4();

    // Idempotency check via Redis
    const idempotencyRedisKey = `idempotency:${idempotencyKey}`;
    const existingId = await this.cacheManager.get<string>(idempotencyRedisKey);
    if (existingId) {
      const existing = await this.transactionRepo.findOne({ where: { id: existingId } });
      if (existing) {
        this.logger.warn(`Duplicate request detected for idempotencyKey: ${idempotencyKey}`);
        return existing;
      }
    }

    // Check idempotency key in DB as fallback
    const existingByKey = await this.transactionRepo.findOne({ where: { idempotencyKey } });
    if (existingByKey) {
      this.logger.warn(`Transaction already exists for idempotencyKey: ${idempotencyKey}`);
      return existingByKey;
    }

    const transaction = this.transactionRepo.create({
      idempotencyKey,
      amount: dto.amount,
      currency: dto.currency || 'BRL',
      paymentMethod: dto.paymentMethod,
      status: TransactionStatus.PENDING,
      description: dto.description,
      metadata: dto.metadata,
      installments: dto.installments || 1,
    });

    if (dto.paymentMethod === PaymentMethod.PIX) {
      if (!dto.pixKey || !dto.pixKeyType) {
        throw new BadRequestException('pixKey and pixKeyType are required for PIX payments');
      }
      transaction.pixKey = dto.pixKey;
      transaction.pixKeyType = dto.pixKeyType;
    }

    if (dto.paymentMethod === PaymentMethod.CREDIT_CARD) {
      if (!dto.cardNumber || !dto.cardHolder) {
        throw new BadRequestException('cardNumber and cardHolder are required for credit card payments');
      }
      const cleaned = dto.cardNumber.replace(/\D/g, '');
      transaction.cardLastFour = cleaned.slice(-4);
      transaction.cardHolder = dto.cardHolder;
      transaction.cardBrand = this.creditCardProcessor.detectCardBrand(dto.cardNumber);
      transaction.installments = dto.installments || 1;
    }

    const saved = await this.transactionRepo.save(transaction);

    // Store in Redis idempotency cache
    await this.cacheManager.set(idempotencyRedisKey, saved.id, IDEMPOTENCY_TTL);

    // Publish to RabbitMQ for async processing
    const published = await this.queueProducer.publishPayment({
      transactionId: saved.id,
      paymentMethod: saved.paymentMethod,
      amount: saved.amount,
    });

    if (!published) {
      this.logger.error(`Failed to publish transaction ${saved.id} to queue`);
    }

    // Invalidate stats cache so dashboard reflects new transaction immediately
    await this.cacheManager.del('transactions:stats');

    this.logger.log(`Transaction created: ${saved.id} | method: ${saved.paymentMethod} | amount: ${saved.amount}`);
    return saved;
  }

  async findAll(dto: ListTransactionsDto): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 10, status, paymentMethod, startDate, endDate } = dto;

    const where: any = {};
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (startDate && endDate) {
      where.createdAt = Between(new Date(startDate), new Date(endDate));
    }

    const [data, total] = await this.transactionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Transaction> {
    const cacheKey = `transaction:${id}`;

    const cached = await this.cacheManager.get<Transaction>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for transaction: ${id}`);
      return cached;
    }

    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    // Don't cache non-final statuses (they may change)
    const finalStatuses = [TransactionStatus.APPROVED, TransactionStatus.REJECTED, TransactionStatus.CANCELLED];
    if (finalStatuses.includes(transaction.status)) {
      await this.cacheManager.set(cacheKey, transaction, CACHE_TRANSACTION_TTL);
    }

    return transaction;
  }

  async cancel(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel transaction with status: ${transaction.status}. Only PENDING transactions can be cancelled.`,
      );
    }

    await this.transactionRepo.update(id, { status: TransactionStatus.CANCELLED });

    // Invalidate caches
    await this.cacheManager.del(`transaction:${id}`);
    await this.cacheManager.del('transactions:stats');

    const updated = await this.transactionRepo.findOne({ where: { id } });
    this.logger.log(`Transaction cancelled: ${id}`);
    return updated;
  }

  async getStats(): Promise<Record<string, any>> {
    const cacheKey = 'transactions:stats';

    const cached = await this.cacheManager.get<Record<string, any>>(cacheKey);
    if (cached) {
      this.logger.debug('Cache hit for transaction stats');
      return cached;
    }

    const [
      total,
      pending,
      processing,
      approved,
      rejected,
      cancelled,
    ] = await Promise.all([
      this.transactionRepo.count(),
      this.transactionRepo.count({ where: { status: TransactionStatus.PENDING } }),
      this.transactionRepo.count({ where: { status: TransactionStatus.PROCESSING } }),
      this.transactionRepo.count({ where: { status: TransactionStatus.APPROVED } }),
      this.transactionRepo.count({ where: { status: TransactionStatus.REJECTED } }),
      this.transactionRepo.count({ where: { status: TransactionStatus.CANCELLED } }),
    ]);

    const approvedTransactions = await this.transactionRepo
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'total')
      .addSelect('t.paymentMethod', 'method')
      .where('t.status = :status', { status: TransactionStatus.APPROVED })
      .groupBy('t.paymentMethod')
      .getRawMany();

    const volumeByMethod: Record<string, number> = {};
    let totalVolume = 0;
    for (const row of approvedTransactions) {
      volumeByMethod[row.method] = parseFloat(row.total || '0');
      totalVolume += volumeByMethod[row.method];
    }

    const stats = {
      counts: { total, pending, processing, approved, rejected, cancelled },
      approvalRate: total > 0 ? ((approved / total) * 100).toFixed(2) + '%' : '0%',
      volume: { total: totalVolume.toFixed(2), byMethod: volumeByMethod },
      generatedAt: new Date().toISOString(),
    };

    await this.cacheManager.set(cacheKey, stats, CACHE_STATS_TTL);
    return stats;
  }
}
