import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { PaymentMessage } from './queue.producer';

export interface PaymentProcessor {
  processPayment(message: PaymentMessage): Promise<{ approved: boolean; errorMessage?: string }>;
}

@Injectable()
export class QueueConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueConsumer.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly queueName: string;
  private readonly rabbitmqUrl: string;
  private processor: PaymentProcessor;
  private connected = false;

  constructor(private readonly configService: ConfigService) {
    this.queueName = this.configService.get<string>('RABBITMQ_QUEUE', 'payment_queue');
    this.rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672');
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch {}
  }

  setProcessor(processor: PaymentProcessor) {
    this.processor = processor;
  }

  private async connect() {
    try {
      this.connection = await amqp.connect(this.rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      const durable = this.configService.get<string>('RABBITMQ_QUEUE_DURABLE', 'true') === 'true';
      await this.channel.assertQueue(this.queueName, { durable });
      this.channel.prefetch(1);
      this.connected = true;
      this.logger.log(`Consumer connected to RabbitMQ — queue: ${this.queueName}`);

      this.connection.on('error', (err) => {
        this.logger.error('Consumer RabbitMQ connection error', err.message);
        this.connected = false;
      });

      this.connection.on('close', () => {
        this.logger.warn('Consumer RabbitMQ connection closed, reconnecting in 5s...');
        this.connected = false;
        setTimeout(() => this.connect(), 5000);
      });

      await this.startConsuming();
    } catch (err) {
      this.logger.error('Failed to connect consumer to RabbitMQ, retrying in 5s...', err.message);
      this.connected = false;
      setTimeout(() => this.connect(), 5000);
    }
  }

  private async startConsuming() {
    if (!this.channel) return;

    this.channel.consume(this.queueName, async (msg) => {
      if (!msg) return;

      let message: PaymentMessage;
      try {
        message = JSON.parse(msg.content.toString()) as PaymentMessage;
        this.logger.log(`Processing payment | transactionId: ${message.transactionId}`);
      } catch (err) {
        this.logger.error('Failed to parse message', err.message);
        this.channel.nack(msg, false, false);
        return;
      }

      try {
        if (!this.processor) {
          this.logger.warn('No processor registered, requeueing message');
          this.channel.nack(msg, false, true);
          return;
        }

        const result = await this.processor.processPayment(message);
        this.logger.log(
          `Payment processed | transactionId: ${message.transactionId} | approved: ${result.approved}`,
        );
        this.channel.ack(msg);
      } catch (err) {
        this.logger.error(
          `Failed to process payment | transactionId: ${message?.transactionId}`,
          err.message,
        );
        this.channel.nack(msg, false, false);
      }
    });

    this.logger.log('Consumer is listening for payment messages...');
  }
}
