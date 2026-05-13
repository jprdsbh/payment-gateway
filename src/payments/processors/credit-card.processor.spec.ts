import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CreditCardProcessor } from './credit-card.processor';

describe('CreditCardProcessor', () => {
  let processor: CreditCardProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditCardProcessor,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultVal: any) => {
              const config = {
                PAYMENT_APPROVAL_RATE: '1.0',
                PAYMENT_PROCESSING_DELAY_MS: '0',
              };
              return config[key] ?? defaultVal;
            },
          },
        },
      ],
    }).compile();

    processor = module.get<CreditCardProcessor>(CreditCardProcessor);
  });

  describe('detectCardBrand()', () => {
    it('should detect VISA', () => {
      expect(processor.detectCardBrand('4111111111111111')).toBe('VISA');
    });

    it('should detect MASTERCARD', () => {
      expect(processor.detectCardBrand('5500005555555559')).toBe('MASTERCARD');
    });

    it('should detect AMEX', () => {
      expect(processor.detectCardBrand('371449635398431')).toBe('AMEX');
    });

    it('should return UNKNOWN for unrecognized brand', () => {
      expect(processor.detectCardBrand('1234567890123456')).toBe('UNKNOWN');
    });
  });

  describe('process()', () => {
    it('should approve credit card payment when rate is 100%', async () => {
      const result = await processor.process({
        transactionId: 'uuid-card-1',
        amount: 299.99,
        cardLastFour: '1111',
        cardHolder: 'JOAO SILVA',
        cardBrand: 'VISA',
        installments: 1,
      });

      expect(result.approved).toBe(true);
      expect(result.authorizationCode).toBeTruthy();
      expect(result.processedAt).toBeInstanceOf(Date);
    });
  });
});
