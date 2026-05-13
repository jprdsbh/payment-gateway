'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Transaction } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';

const POLLING_STATUSES = ['PENDING', 'PROCESSING'];

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [cancelError, setCancelError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.getTransaction(id);
      setTx(data);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while PENDING or PROCESSING
  useEffect(() => {
    if (!tx || !POLLING_STATUSES.includes(tx.status)) return;
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [tx, load]);

  const handleCancel = async () => {
    if (!confirm('Cancelar esta transação?')) return;
    setCancelling(true);
    setCancelError('');
    try {
      const updated = await api.cancelTransaction(id);
      setTx(updated);
    } catch (e: any) {
      setCancelError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Carregando...</div>;

  if (error) return (
    <div className="text-center py-20">
      <p className="text-red-500 mb-4">{error}</p>
      <Link href="/transactions" className="text-indigo-600 hover:underline">← Voltar</Link>
    </div>
  );

  if (!tx) return null;

  const isPolling = POLLING_STATUSES.includes(tx.status);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/transactions" className="text-gray-400 hover:text-gray-600 text-sm">← Transações</Link>
        <span className="text-gray-300">/</span>
        <span className="font-mono text-sm text-gray-600">{tx.id.slice(0, 8)}…</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">
                {tx.paymentMethod === 'PIX' ? '🏦 PIX' : '💳 Cartão de Crédito'}
              </h1>
              <StatusBadge status={tx.status} />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          {isPolling && (
            <div className="text-right">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse mx-auto mb-1" />
              <p className="text-xs text-gray-400">Atualizando…</p>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="px-6 py-5 space-y-3">
          <Row label="ID" value={<span className="font-mono text-sm">{tx.id}</span>} />
          <Row label="Método" value={tx.paymentMethod === 'PIX' ? 'PIX' : 'Cartão de Crédito'} />
          <Row label="Valor" value={`R$ ${Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
          <Row label="Moeda" value={tx.currency} />
          <Row label="Status" value={<StatusBadge status={tx.status} />} />

          {tx.paymentMethod === 'PIX' && tx.pixKey && (
            <>
              <Row label="Chave PIX" value={tx.pixKey} />
              <Row label="Tipo de Chave" value={tx.pixKeyType || '—'} />
            </>
          )}

          {tx.paymentMethod === 'CREDIT_CARD' && tx.cardLastFour && (
            <>
              <Row label="Cartão" value={`${tx.cardBrand} **** **** **** ${tx.cardLastFour}`} />
              <Row label="Titular" value={tx.cardHolder || '—'} />
              <Row label="Parcelas" value={`${tx.installments}x`} />
            </>
          )}

          {tx.description && <Row label="Descrição" value={tx.description} />}
          {tx.errorMessage && (
            <Row
              label="Motivo da Rejeição"
              value={<span className="text-red-600 font-medium">{tx.errorMessage}</span>}
            />
          )}
          {tx.processedAt && (
            <Row
              label="Processado em"
              value={new Date(tx.processedAt).toLocaleString('pt-BR')}
            />
          )}
          <Row label="Criado em" value={new Date(tx.createdAt).toLocaleString('pt-BR')} />
          <Row label="Atualizado em" value={new Date(tx.updatedAt).toLocaleString('pt-BR')} />
        </div>

        {/* Actions */}
        {tx.status === 'PENDING' && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
            {cancelError && (
              <p className="text-red-600 text-sm mb-2">{cancelError}</p>
            )}
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {cancelling ? 'Cancelando...' : 'Cancelar Transação'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}
