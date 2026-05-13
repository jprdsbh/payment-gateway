import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PixKeyType } from '../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiPropertyOptional({
    description: 'Chave de idempotência para evitar duplicidade',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;

  @ApiProperty({
    description: 'Valor da transação em reais',
    example: 150.5,
    minimum: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(0.01)
  @Max(999999.99)
  amount: number;

  @ApiPropertyOptional({
    description: 'Moeda da transação',
    example: 'BRL',
    default: 'BRL',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    description: 'Método de pagamento',
    enum: PaymentMethod,
    example: PaymentMethod.PIX,
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  // PIX fields
  @ApiPropertyOptional({
    description: 'Chave PIX do destinatário (obrigatório para PIX)',
    example: 'joao@email.com',
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.PIX)
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  pixKey?: string;

  @ApiPropertyOptional({
    description: 'Tipo da chave PIX',
    enum: PixKeyType,
    example: PixKeyType.EMAIL,
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.PIX)
  @IsEnum(PixKeyType)
  pixKeyType?: PixKeyType;

  // Credit card fields
  @ApiPropertyOptional({
    description: 'Número do cartão (obrigatório para cartão de crédito)',
    example: '4111111111111111',
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  @MinLength(13)
  @MaxLength(19)
  cardNumber?: string;

  @ApiPropertyOptional({
    description: 'Nome do titular do cartão',
    example: 'JOAO R SILVA',
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  @MaxLength(100)
  cardHolder?: string;

  @ApiPropertyOptional({
    description: 'Data de expiração do cartão (MM/YY)',
    example: '12/26',
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  cardExpiry?: string;

  @ApiPropertyOptional({
    description: 'CVV do cartão',
    example: '123',
  })
  @ValidateIf((o) => o.paymentMethod === PaymentMethod.CREDIT_CARD)
  @IsString()
  @MinLength(3)
  @MaxLength(4)
  cardCvv?: string;

  @ApiPropertyOptional({
    description: 'Número de parcelas (1-12)',
    example: 1,
    minimum: 1,
    maximum: 12,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  installments?: number;

  @ApiPropertyOptional({
    description: 'Descrição da transação',
    example: 'Pagamento pedido #12345',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Metadados adicionais da transação',
    example: { orderId: '12345', customerId: 'cust_abc' },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}
