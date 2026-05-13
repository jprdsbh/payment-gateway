import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { PaymentsService } from './payments.service';
import { PixProcessor } from './processors/pix.processor';
import { CreditCardProcessor } from './processors/credit-card.processor';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), QueueModule],
  providers: [PaymentsService, PixProcessor, CreditCardProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
