'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Stats } from '@/lib/api';

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api.getStats();
      setStats(data);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Estatísticas em tempo real (cache 60s)</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="text-sm text-indigo-600 hover:underline">
            Atualizar
          </button>
          <Link
            href="/transactions/new"
            className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            + Nova Transação
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          Erro ao carregar estatísticas: {error}. Verifique se a API está rodando em{' '}
          <code className="font-mono">{process.env.NEXT_PUBLIC_API_URL}</code>
        </div>
      )}

      {loading && !stats ? (
        <div className="text-center py-20 text-gray-400">Carregando...</div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatCard label="Total" value={stats.counts.total} />
            <StatCard label="Aprovadas" value={stats.counts.approved} color="text-green-600" />
            <StatCard label="Rejeitadas" value={stats.counts.rejected} color="text-red-500" />
            <StatCard label="Pendentes" value={stats.counts.pending} color="text-yellow-600" />
            <StatCard label="Processando" value={stats.counts.processing} color="text-blue-600" />
            <StatCard label="Canceladas" value={stats.counts.cancelled} color="text-gray-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Taxa de Aprovação</p>
              <p className="text-4xl font-bold text-indigo-600 mt-1">{stats.approvalRate}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Volume Aprovado</p>
              <p className="text-3xl font-bold text-gray-900">
                R$ {parseFloat(stats.volume.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <div className="mt-2 flex gap-4 text-sm text-gray-600">
                {Object.entries(stats.volume.byMethod).map(([method, val]) => (
                  <span key={method}>
                    <span className="font-medium">{method}:</span> R${' '}
                    {Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4 text-right">
            Atualizado em {new Date(stats.generatedAt).toLocaleTimeString('pt-BR')}
          </p>
        </>
      ) : null}
    </div>
  );
}
