import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PaymentMethod, TransactionStatus, PixKeyType } from './entities/transaction.entity';
import { ThrottlerGuard } from '@nestjs/throttler';

const mockTransactionsService = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  cancel: jest.fn(),
  getStats: jest.fn(),
});

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: ReturnType<typeof mockTransactionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [{ provide: TransactionsService, useFactory: mockTransactionsService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TransactionsController>(TransactionsController);
    service = module.get(TransactionsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('should create a transaction', async () => {
      const dto = {
        amount: 100,
        paymentMethod: PaymentMethod.PIX,
        pixKey: 'email@test.com',
        pixKeyType: PixKeyType.EMAIL,
      };
      const expected = { id: 'uuid-1', ...dto, status: TransactionStatus.PENDING };
      service.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll()', () => {
    it('should return paginated list', async () => {
      const pagination = { data: [], total: 0, page: 1, limit: 10 };
      service.findAll.mockResolvedValue(pagination);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(result).toEqual(pagination);
    });
  });

  describe('findOne()', () => {
    it('should return a transaction', async () => {
      const transaction = { id: 'uuid-1', status: TransactionStatus.APPROVED };
      service.findOne.mockResolvedValue(transaction);

      const result = await controller.findOne('uuid-1');

      expect(service.findOne).toHaveBeenCalledWith('uuid-1');
      expect(result).toEqual(transaction);
    });
  });

  describe('cancel()', () => {
    it('should cancel a transaction', async () => {
      const transaction = { id: 'uuid-2', status: TransactionStatus.CANCELLED };
      service.cancel.mockResolvedValue(transaction);

      const result = await controller.cancel('uuid-2');

      expect(service.cancel).toHaveBeenCalledWith('uuid-2');
      expect(result.status).toBe(TransactionStatus.CANCELLED);
    });
  });

  describe('getStats()', () => {
    it('should return stats', async () => {
      const stats = { counts: { total: 10, approved: 8 }, approvalRate: '80.00%' };
      service.getStats.mockResolvedValue(stats);

      const result = await controller.getStats();

      expect(result).toEqual(stats);
    });
  });
});
