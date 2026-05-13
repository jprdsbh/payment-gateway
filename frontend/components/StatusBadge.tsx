import type { TransactionStatus } from '@/lib/api';

const config: Record<TransactionStatus, { label: string; className: string }> = {
  PENDING:    { label: 'Pendente',     className: 'bg-yellow-100 text-yellow-800' },
  PROCESSING: { label: 'Processando', className: 'bg-blue-100 text-blue-800 animate-pulse' },
  APPROVED:   { label: 'Aprovado',    className: 'bg-green-100 text-green-800' },
  REJECTED:   { label: 'Rejeitado',   className: 'bg-red-100 text-red-800' },
  CANCELLED:  { label: 'Cancelado',   className: 'bg-gray-100 text-gray-600' },
};

export default function StatusBadge({ status }: { status: TransactionStatus }) {
  const { label, className } = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}
