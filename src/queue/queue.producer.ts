import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export interface PaymentMessage {
  transactionId: string;
  paymentMethod: string;
  amount: number;
  correlationId?: string;
}

@Injectable()
export class QueueProducer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueProducer.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private readonly queueName: string;
  private readonly rabbitmqUrl: string;
  private connected = false;

  constructor(private readonly configService: ConfigService) {
    this.queueName = this.configService.get<string>('RABBITMQ_QUEUE', 'payment_queue');
    this.rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672');
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      this.connection = await amqp.connect(this.rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      const durable = this.configService.get<string>('RABBITMQ_QUEUE_DURABLE', 'true') === 'true';
      await this.channel.assertQueue(this.queueName, { durable });
      this.connected = true;
      this.logger.log(`Connected to RabbitMQ — queue: ${this.queueName}`);

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err.message);
        this.connected = false;
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed, reconnecting in 5s...');
        this.connected = false;
        setTimeout(() => this.connect(), 5000);
      });
    } catch (err) {
      this.logger.error('Failed to connect to RabbitMQ, retrying in 5s...', err.message);
      this.connected = false;
      setTimeout(() => this.connect(), 5000);
    }
  }

  private async disconnect() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch (err) {
      this.logger.error('Error disconnecting from RabbitMQ', err.message);
    }
  }

  async publishPayment(message: PaymentMessage): Promise<boolean> {
    if (!this.connected || !this.channel) {
      this.logger.error('RabbitMQ not connected, cannot publish message');
      return false;
    }

    try {
      const content = Buffer.from(JSON.stringify(message));
      const sent = this.channel.sendToQueue(this.queueName, content, {
        persistent: true,
        messageId: message.transactionId,
        timestamp: Date.now(),
        contentType: 'application/json',
        headers: {
          correlationId: message.correlationId,
        },
      });

      this.logger.log(
        `Published payment message | transactionId: ${message.transactionId} | method: ${message.paymentMethod}`,
      );
      return sent;
    } catch (err) {
      this.logger.error(`Failed to publish message for transaction ${message.transactionId}`, err.message);
      return false;
    }
  }
}
