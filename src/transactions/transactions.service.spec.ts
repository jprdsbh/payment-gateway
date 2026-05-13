import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Transaction, PaymentMethod, TransactionStatus, PixKeyType } from './entities/transaction.entity';
import { QueueProducer } from '../queue/queue.producer';
import { CreditCardProcessor } from '../payments/processors/credit-card.processor';

const mockRepository = () => ({
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockCacheManager = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

const mockQueueProducer = () => ({
  publishPayment: jest.fn(),
});

const mockCreditCardProcessor = () => ({
  detectCardBrand: jest.fn().mockReturnValue('VISA'),
});

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: ReturnType<typeof mockRepository>;
  let cacheManager: ReturnType<typeof mockCacheManager>;
  let queueProducer: ReturnType<typeof mockQueueProducer>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useFactory: mockRepository },
        { provide: CACHE_MANAGER, useFactory: mockCacheManager },
        { provide: QueueProducer, useFactory: mockQueueProducer },
        { provide: CreditCardProcessor, useFactory: mockCreditCardProcessor },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    repository = module.get(getRepositoryToken(Transaction));
    cacheManager = module.get(CACHE_MANAGER);
    queueProducer = module.get(QueueProducer);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('should create a PIX transaction', async () => {
      const dto = {
        amount: 100,
        paymentMethod: PaymentMethod.PIX,
        pixKey: 'test@email.com',
        pixKeyType: PixKeyType.EMAIL,
      };

      const savedTransaction = {
        id: 'uuid-123',
        ...dto,
        status: TransactionStatus.PENDING,
        idempotencyKey: 'some-key',
        currency: 'BRL',
      };

      cacheManager.get.mockResolvedValue(null);
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(savedTransaction);
      repository.save.mockResolvedValue(savedTransaction);
      cacheManager.set.mockResolvedValue(undefined);
      queueProducer.publishPayment.mockResolvedValue(true);

      const result = await service.create(dto as any);

      expect(result).toEqual(savedTransaction);
      expect(repository.save).toHaveBeenCalled();
      expect(queueProducer.publishPayment).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: savedTransaction.id }),
      );
    });

    it('should create a CREDIT_CARD transaction', async () => {
      const dto = {
        amount: 250.5,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        cardNumber: '4111111111111111',
        cardHolder: 'JOAO SILVA',
        cardExpiry: '12/26',
        cardCvv: '123',
        installments: 3,
      };

      const savedTransaction = {
        id: 'uuid-456',
        amount: dto.amount,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        status: TransactionStatus.PENDING,
        idempotencyKey: 'some-key-2',
        cardLastFour: '1111',
        cardHolder: dto.cardHolder,
        cardBrand: 'VISA',
        installments: 3,
        currency: 'BRL',
      };

      cacheManager.get.mockResolvedValue(null);
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(savedTransaction);
      repository.save.mockResolvedValue(savedTransaction);
      cacheManager.set.mockResolvedValue(undefined);
      queueProducer.publishPayment.mockResolvedValue(true);

      const result = await service.create(dto as any);

      expect(result).toEqual(savedTransaction);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should return existing transaction on duplicate idempotency key (Redis hit)', async () => {
      const dto = {
        idempotencyKey: 'existing-key',
        amount: 100,
        paymentMethod: PaymentMethod.PIX,
        pixKey: 'test@email.com',
        pixKeyType: PixKeyType.EMAIL,
      };

      const existingTransaction = {
        id: 'existing-uuid',
        status: TransactionStatus.APPROVED,
      };

      cacheManager.get.mockResolvedValue('existing-uuid');
      repository.findOne.mockResolvedValue(existingTransaction);

      const result = await service.create(dto as any);

      expect(result).toEqual(existingTransaction);
      expect(repository.save).not.toHaveBeenCalled();
      expect(queueProducer.publishPayment).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if PIX key is missing', async () => {
      const dto = {
        amount: 100,
        paymentMethod: PaymentMethod.PIX,
      };

      cacheManager.get.mockResolvedValue(null);
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({ ...dto });

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if cardNumber is missing for CREDIT_CARD', async () => {
      const dto = {
        amount: 100,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        cardHolder: 'JOAO',
      };

      cacheManager.get.mockResolvedValue(null);
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({ ...dto });

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne()', () => {
    it('should return cached transaction if available', async () => {
      const cached = { id: 'uuid-1', status: TransactionStatus.APPROVED };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.findOne('uuid-1');

      expect(result).toEqual(cached);
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache approved transaction', async () => {
      cacheManager.get.mockResolvedValue(null);
      const transaction = { id: 'uuid-2', status: TransactionStatus.APPROVED };
      repository.findOne.mockResolvedValue(transaction);
      cacheManager.set.mockResolvedValue(undefined);

      const result = await service.findOne('uuid-2');

      expect(result).toEqual(transaction);
      expect(cacheManager.set).toHaveBeenCalledWith(
        'transaction:uuid-2',
        transaction,
        expect.any(Number),
      );
    });

    it('should NOT cache pending transactions', async () => {
      cacheManager.get.mockResolvedValue(null);
      const transaction = { id: 'uuid-3', status: TransactionStatus.PENDING };
      repository.findOne.mockResolvedValue(transaction);

      await service.findOne('uuid-3');

      expect(cacheManager.set).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if transaction not found', async () => {
      cacheManager.get.mockResolvedValue(null);
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel()', () => {
    it('should cancel a PENDING transaction', async () => {
      const transaction = { id: 'uuid-4', status: TransactionStatus.PENDING };
      const updated = { ...transaction, status: TransactionStatus.CANCELLED };

      repository.findOne
        .mockResolvedValueOnce(transaction)
        .mockResolvedValueOnce(updated);
      repository.update.mockResolvedValue(undefined);
      cacheManager.del.mockResolvedValue(undefined);

      const result = await service.cancel('uuid-4');

      expect(result.status).toBe(TransactionStatus.CANCELLED);
      expect(cacheManager.del).toHaveBeenCalledWith('transaction:uuid-4');
    });

    it('should throw BadRequestException if transaction is not PENDING', async () => {
      repository.findOne.mockResolvedValue({ id: 'uuid-5', status: TransactionStatus.APPROVED });

      await expect(service.cancel('uuid-5')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if transaction not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.cancel('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll()', () => {
    it('should return paginated transactions', async () => {
      const transactions = [
        { id: 'uuid-1', status: TransactionStatus.APPROVED },
        { id: 'uuid-2', status: TransactionStatus.PENDING },
      ];
      repository.findAndCount.mockResolvedValue([transactions, 2]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(transactions);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });
});
