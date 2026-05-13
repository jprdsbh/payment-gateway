# Payment Gateway API

API de gateway de pagamentos desenvolvida com **NestJS**, suportando pagamentos via **PIX** e **Cartão de Crédito**, com processamento assíncrono via **RabbitMQ** e cache via **Redis**.

---

## Sumário

- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Decisões Técnicas](#decisões-técnicas)
- [Execução com Docker](#execução-com-docker)
- [Execução Local](#execução-local)
- [Testes](#testes)
- [Endpoints da API](#endpoints-da-api)

---

## Tecnologias

| Tecnologia       | Finalidade                                      |
|------------------|-------------------------------------------------|
| **NestJS**       | Framework backend principal                     |
| **TypeScript**   | Tipagem estática                                |
| **PostgreSQL**   | Persistência relacional das transações          |
| **TypeORM**      | ORM para mapeamento entidade-tabela             |
| **RabbitMQ**     | Fila de mensagens para processamento assíncrono |
| **Redis**        | Cache, idempotência e rate limiting             |
| **Jest**         | Testes unitários                                |
| **Docker**       | Containerização                                 |
| **Swagger**      | Documentação interativa da API                  |

---

## Arquitetura

```
┌──────────────┐     POST /transactions      ┌─────────────────────┐
│    Client    │ ─────────────────────────▶ │  TransactionsCtrl   │
└──────────────┘                             └──────────┬──────────┘
                                                        │
                                             ┌──────────▼──────────┐
                                             │  TransactionsService │
                                             │  - Valida request    │
                                             │  - Idempotência Redis│
                                             │  - Salva no Postgres │
                                             └──────────┬──────────┘
                                                        │ publishPayment()
                                             ┌──────────▼──────────┐
                                             │   QueueProducer      │
                                             │   (RabbitMQ)         │
                                             └──────────┬──────────┘
                                                        │ AMQP message
                                             ┌──────────▼──────────┐
                                             │   QueueConsumer      │
                                             │   (RabbitMQ)         │
                                             └──────────┬──────────┘
                                                        │ processPayment()
                                             ┌──────────▼──────────┐
                                             │   PaymentsService    │
                                             │  - PENDING→PROCESSING│
                                             │  - Chama processor   │
                                             │  - APPROVED/REJECTED │
                                             └──────────┬──────────┘
                                              ┌─────────┴─────────┐
                                              │                   │
                                     ┌────────▼───────┐  ┌───────▼────────┐
                                     │  PixProcessor  │  │ CreditCard     │
                                     │  (simula banco)│  │ Processor      │
                                     └────────────────┘  └────────────────┘
```

### Fluxo de Status

```
PENDING → PROCESSING → APPROVED
                     → REJECTED
PENDING → CANCELLED (via endpoint)
```

### Uso do Redis

| Finalidade         | Chave Redis                    | TTL        |
|--------------------|-------------------------------|------------|
| **Idempotência**   | `idempotency:{key}`           | 24 horas   |
| **Cache GET /:id** | `transaction:{id}`            | 30 segundos|
| **Cache stats**    | `transactions:stats`          | 60 segundos|
| **Rate limiting**  | Gerenciado pelo ThrottlerGuard | 60 segundos|

---

## Decisões Técnicas

### Idempotência
Toda requisição `POST /transactions` aceita um campo `idempotencyKey` opcional. Se não informado, um UUID é gerado automaticamente. A chave é armazenada no Redis por 24h, garantindo que requisições duplicadas retornem a transação original sem processamento duplo.

### Processamento Assíncrono com RabbitMQ
A transação é salva no banco com status `PENDING` e publicada imediatamente na fila RabbitMQ. O consumer (rodando no mesmo processo) consome a mensagem, atualiza o status para `PROCESSING`, executa o processador correspondente (PIX ou Cartão) e finaliza com `APPROVED` ou `REJECTED`. Isso desacopla a criação da transação do processamento, permitindo escalar o processamento independentemente.

### Cache Redis para Consultas
Transações com status final (`APPROVED`, `REJECTED`, `CANCELLED`) são cacheadas por 30s no Redis. O endpoint de estatísticas é cacheado por 60s. Transações com status transitório (`PENDING`, `PROCESSING`) não são cacheadas, pois podem mudar a qualquer momento.

### Segurança do Cartão de Crédito
Apenas os últimos 4 dígitos do cartão (`cardLastFour`), o nome do titular e a bandeira são persistidos. O número completo, CVV e data de validade nunca são armazenados no banco.

### Rate Limiting
Implementado via `@nestjs/throttler` — 100 requisições por 60 segundos por IP.

### Simulação de Pagamentos
Os processors (`PixProcessor`, `CreditCardProcessor`) simulam chamadas a redes bancárias com delay configurável (`PAYMENT_PROCESSING_DELAY_MS`) e taxa de aprovação configurável (`PAYMENT_APPROVAL_RATE`).

---

## Execução com Docker

### Pré-requisitos
- [Docker](https://www.docker.com/) instalado
- [Docker Compose](https://docs.docker.com/compose/) instalado

### Subir toda a infraestrutura

```bash
git clone <url-do-repositorio>
cd payment-gateway

docker-compose up --build
```

Isso sobe:
- API NestJS na porta `3000`
- PostgreSQL na porta `5432`
- Redis na porta `6379`
- RabbitMQ na porta `5672` (management UI: `15672`)

### Acessar

- **API**: http://localhost:3000/api
- **Swagger**: http://localhost:3000/api/docs
- **RabbitMQ UI**: http://localhost:15672 (guest/guest)

### Parar

```bash
docker-compose down
# Para remover volumes também:
docker-compose down -v
```

---

## Execução Local

### Pré-requisitos
- Node.js 20+
- PostgreSQL rodando localmente
- Redis rodando localmente
- RabbitMQ rodando localmente

### Configuração

```bash
cp .env.example .env
# Edite .env com suas credenciais locais
```

### Instalação e execução

```bash
npm install
npm run start:dev
```

### Apenas infraestrutura via Docker + API local

```bash
# Sobe só postgres, redis e rabbitmq
docker-compose up postgres redis rabbitmq -d

# Roda a API localmente
npm run start:dev
```

---

## Testes

### Executar todos os testes

```bash
npm test
```

### Executar com cobertura

```bash
npm run test:cov
```

### Executar em modo watch

```bash
npm run test:watch
```

### O que é testado

- `TransactionsService` — criação, idempotência, cache, cancelamento, paginação
- `TransactionsController` — todos os endpoints
- `PaymentsService` — processamento PIX e cartão, status transitions
- `PixProcessor` — aprovação e rejeição
- `CreditCardProcessor` — detecção de bandeira, aprovação

---

## Endpoints da API

Base URL: `http://localhost:3000/api`

| Método   | Endpoint                        | Descrição                                      |
|----------|---------------------------------|------------------------------------------------|
| `POST`   | `/transactions`                 | Criar nova transação                           |
| `GET`    | `/transactions`                 | Listar transações (paginação + filtros)        |
| `GET`    | `/transactions/stats`           | Estatísticas agregadas (cacheado 60s)          |
| `GET`    | `/transactions/:id`             | Buscar transação por ID (cacheado 30s)         |
| `PATCH`  | `/transactions/:id/cancel`      | Cancelar transação (apenas PENDING)            |

### Exemplo: Criar transação PIX

```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 150.00,
    "paymentMethod": "PIX",
    "pixKey": "joao@email.com",
    "pixKeyType": "EMAIL",
    "description": "Pagamento pedido #12345"
  }'
```

### Exemplo: Criar transação Cartão de Crédito

```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 299.99,
    "paymentMethod": "CREDIT_CARD",
    "cardNumber": "4111111111111111",
    "cardHolder": "JOAO R SILVA",
    "cardExpiry": "12/26",
    "cardCvv": "123",
    "installments": 3,
    "description": "Compra parcelada"
  }'
```

### Exemplo: Com idempotência

```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "pedido-12345-unico",
    "amount": 150.00,
    "paymentMethod": "PIX",
    "pixKey": "joao@email.com",
    "pixKeyType": "EMAIL"
  }'
```

---

## Variáveis de Ambiente

| Variável                    | Descrição                             | Padrão                               |
|-----------------------------|---------------------------------------|--------------------------------------|
| `PORT`                      | Porta da aplicação                    | `3000`                               |
| `DB_HOST`                   | Host do PostgreSQL                    | `localhost`                          |
| `DB_PORT`                   | Porta do PostgreSQL                   | `5432`                               |
| `DB_USERNAME`               | Usuário do PostgreSQL                 | `postgres`                           |
| `DB_PASSWORD`               | Senha do PostgreSQL                   | `postgres`                           |
| `DB_DATABASE`               | Nome do banco                         | `payment_gateway`                    |
| `REDIS_HOST`                | Host do Redis                         | `localhost`                          |
| `REDIS_PORT`                | Porta do Redis                        | `6379`                               |
| `RABBITMQ_URL`              | URL de conexão RabbitMQ               | `amqp://guest:guest@localhost:5672`  |
| `RABBITMQ_QUEUE`            | Nome da fila                          | `payment_queue`                      |
| `THROTTLE_TTL`              | Janela do rate limit (segundos)       | `60`                                 |
| `THROTTLE_LIMIT`            | Máximo de requisições na janela       | `100`                                |
| `PAYMENT_PROCESSING_DELAY_MS` | Delay da simulação (ms)             | `2000`                               |
| `PAYMENT_APPROVAL_RATE`     | Taxa de aprovação (0.0 a 1.0)         | `0.85`                               |
