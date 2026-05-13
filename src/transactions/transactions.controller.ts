import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { Transaction } from './entities/transaction.entity';

@ApiTags('Transactions')
@UseGuards(ThrottlerGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar nova transação de pagamento' })
  @ApiBody({ type: CreateTransactionDto })
  @ApiResponse({ status: 201, description: 'Transação criada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Transação duplicada (idempotência)' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  async create(@Body() dto: CreateTransactionDto): Promise<Transaction> {
    return this.transactionsService.create(dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obter estatísticas das transações (resultado cacheado por 60s)' })
  @ApiResponse({ status: 200, description: 'Estatísticas retornadas com sucesso' })
  async getStats(): Promise<Record<string, any>> {
    return this.transactionsService.getStats();
  }

  @Get()
  @ApiOperation({ summary: 'Listar transações com paginação e filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED'] })
  @ApiQuery({ name: 'paymentMethod', required: false, enum: ['PIX', 'CREDIT_CARD'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de transações' })
  async findAll(@Query() dto: ListTransactionsDto) {
    return this.transactionsService.findAll(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar transação por ID (resultado cacheado por 30s para status finais)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Transação encontrada' })
  @ApiResponse({ status: 404, description: 'Transação não encontrada' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Transaction> {
    return this.transactionsService.findOne(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar transação (apenas transações PENDING)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Transação cancelada com sucesso' })
  @ApiResponse({ status: 400, description: 'Transação não pode ser cancelada' })
  @ApiResponse({ status: 404, description: 'Transação não encontrada' })
  async cancel(@Param('id', ParseUUIDPipe) id: string): Promise<Transaction> {
    return this.transactionsService.cancel(id);
  }
}
