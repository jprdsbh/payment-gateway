import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueProducer } from './queue.producer';
import { QueueConsumer } from './queue.consumer';

@Module({
  imports: [ConfigModule],
  providers: [QueueProducer, QueueConsumer],
  exports: [QueueProducer, QueueConsumer],
})
export class QueueModule {}
