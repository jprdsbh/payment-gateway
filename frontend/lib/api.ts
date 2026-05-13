const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export type PaymentMethod = 'PIX' | 'CREDIT_CARD';
export type TransactionStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface Transaction {
  id: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  pixKey?: string;
  pixKeyType?: string;
  cardLastFour?: string;
  cardHolder?: string;
  cardBrand?: string;
  installments?: number;
  description?: string;
  errorMessage?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTransactions {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export interface Stats {
  counts: { total: number; pending: number; processing: number; approved: number; rejected: number; cancelled: number };
  approvalRate: string;
  volume: { total: string; byMethod: Record<string, number> };
  generatedAt: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getStats: () => request<Stats>('/transactions/stats'),

  listTransactions: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== '' && v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<PaginatedTransactions>(`/transactions${qs ? '?' + qs : ''}`);
  },

  getTransaction: (id: string) => request<Transaction>(`/transactions/${id}`),

  createTransaction: (body: object) =>
    request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(body) }),

  cancelTransaction: (id: string) =>
    request<Transaction>(`/transactions/${id}/cancel`, { method: 'PATCH' }),
};
