import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { QueueModule } from '../queue/queue.module';
import { CreditCardProcessor } from '../payments/processors/credit-card.processor';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), QueueModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, CreditCardProcessor],
  exports: [TransactionsService],
})
export class TransactionsModule {}
