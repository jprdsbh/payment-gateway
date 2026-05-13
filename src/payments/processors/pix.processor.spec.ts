import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PixProcessor } from './pix.processor';

describe('PixProcessor', () => {
  let processor: PixProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PixProcessor,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultVal: any) => {
              const config = {
                PAYMENT_APPROVAL_RATE: '1.0', // always approve in tests
                PAYMENT_PROCESSING_DELAY_MS: '0',
              };
              return config[key] ?? defaultVal;
            },
          },
        },
      ],
    }).compile();

    processor = module.get<PixProcessor>(PixProcessor);
  });

  it('should approve PIX payment when approval rate is 100%', async () => {
    const result = await processor.process({
      transactionId: 'uuid-1',
      amount: 100,
      pixKey: 'test@email.com',
      pixKeyType: 'EMAIL',
    });

    expect(result.approved).toBe(true);
    expect(result.processedAt).toBeInstanceOf(Date);
  });

  it('should reject PIX payment when approval rate is 0%', async () => {
    // Override to reject
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PixProcessor,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultVal: any) => {
              const config = {
                PAYMENT_APPROVAL_RATE: '0.0',
                PAYMENT_PROCESSING_DELAY_MS: '0',
              };
              return config[key] ?? defaultVal;
            },
          },
        },
      ],
    }).compile();

    const rejectingProcessor = module.get<PixProcessor>(PixProcessor);
    const result = await rejectingProcessor.process({
      transactionId: 'uuid-2',
      amount: 50,
      pixKey: '99999999999',
      pixKeyType: 'CPF',
    });

    expect(result.approved).toBe(false);
    expect(result.errorMessage).toBeTruthy();
  });
});
