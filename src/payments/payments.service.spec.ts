import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { Transaction, PaymentMethod, TransactionStatus, PixKeyType } from '../transactions/entities/transaction.entity';
import { PixProcessor } from './processors/pix.processor';
import { CreditCardProcessor } from './processors/credit-card.processor';
import { QueueConsumer } from '../queue/queue.consumer';

const mockRepository = () => ({
  findOne: jest.fn(),
  update: jest.fn(),
});

const mockPixProcessor = () => ({
  process: jest.fn(),
});

const mockCreditCardProcessor = () => ({
  process: jest.fn(),
  detectCardBrand: jest.fn().mockReturnValue('VISA'),
});

const mockQueueConsumer = () => ({
  setProcessor: jest.fn(),
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let repository: ReturnType<typeof mockRepository>;
  let pixProcessor: ReturnType<typeof mockPixProcessor>;
  let creditCardProcessor: ReturnType<typeof mockCreditCardProcessor>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Transaction), useFactory: mockRepository },
        { provide: PixProcessor, useFactory: mockPixProcessor },
        { provide: CreditCardProcessor, useFactory: mockCreditCardProcessor },
        { provide: QueueConsumer, useFactory: mockQueueConsumer },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    repository = module.get(getRepositoryToken(Transaction));
    pixProcessor = module.get(PixProcessor);
    creditCardProcessor = module.get(CreditCardProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  describe('processPayment()', () => {
    const pixTransaction: Partial<Transaction> = {
      id: 'uuid-pix',
      status: TransactionStatus.PENDING,
      paymentMethod: PaymentMethod.PIX,
      amount: 100,
      pixKey: 'test@email.com',
      pixKeyType: PixKeyType.EMAIL,
    };

    const cardTransaction: Partial<Transaction> = {
      id: 'uuid-card',
      status: TransactionStatus.PENDING,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      amount: 200,
      cardLastFour: '1111',
      cardHolder: 'JOAO SILVA',
      cardBrand: 'VISA',
      installments: 1,
    };

    it('should process PIX payment and approve it', async () => {
      repository.findOne.mockResolvedValue(pixTransaction);
      repository.update.mockResolvedValue(undefined);
      pixProcessor.process.mockResolvedValue({ approved: true, processedAt: new Date() });

      const result = await service.processPayment({
        transactionId: 'uuid-pix',
        paymentMethod: PaymentMethod.PIX,
        amount: 100,
      });

      expect(result.approved).toBe(true);
      expect(repository.update).toHaveBeenCalledWith('uuid-pix', expect.objectContaining({ status: TransactionStatus.PROCESSING }));
      expect(repository.update).toHaveBeenCalledWith('uuid-pix', expect.objectContaining({ status: TransactionStatus.APPROVED }));
    });

    it('should process PIX payment and reject it', async () => {
      repository.findOne.mockResolvedValue(pixTransaction);
      repository.update.mockResolvedValue(undefined);
      pixProcessor.process.mockResolvedValue({
        approved: false,
        errorMessage: 'Chave PIX não encontrada',
        processedAt: new Date(),
      });

      const result = await service.processPayment({
        transactionId: 'uuid-pix',
        paymentMethod: PaymentMethod.PIX,
        amount: 100,
      });

      expect(result.approved).toBe(false);
      expect(result.errorMessage).toBe('Chave PIX não encontrada');
      expect(repository.update).toHaveBeenCalledWith('uuid-pix', expect.objectContaining({ status: TransactionStatus.REJECTED }));
    });

    it('should process credit card payment and approve it', async () => {
      repository.findOne.mockResolvedValue(cardTransaction);
      repository.update.mockResolvedValue(undefined);
      creditCardProcessor.process.mockResolvedValue({
        approved: true,
        authorizationCode: 'AUTH123',
        processedAt: new Date(),
      });

      const result = await service.processPayment({
        transactionId: 'uuid-card',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        amount: 200,
      });

      expect(result.approved).toBe(true);
      expect(repository.update).toHaveBeenCalledWith('uuid-card', expect.objectContaining({ status: TransactionStatus.APPROVED }));
    });

    it('should return not approved if transaction not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.processPayment({
        transactionId: 'non-existent',
        paymentMethod: PaymentMethod.PIX,
        amount: 100,
      });

      expect(result.approved).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should skip processing if transaction is already processed', async () => {
      repository.findOne.mockResolvedValue({
        ...pixTransaction,
        status: TransactionStatus.APPROVED,
      });

      const result = await service.processPayment({
        transactionId: 'uuid-pix',
        paymentMethod: PaymentMethod.PIX,
        amount: 100,
      });

      expect(result.approved).toBe(true);
      expect(pixProcessor.process).not.toHaveBeenCalled();
    });
  });
});
