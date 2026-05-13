import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Payment Gateway',
  description: 'Dashboard de transações',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 min-h-screen text-gray-900">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 shadow-sm">
          <Link href="/" className="font-bold text-indigo-600 text-lg tracking-tight">
            💳 Payment Gateway
          </Link>
          <Link href="/" className="text-sm text-gray-600 hover:text-indigo-600 transition-colors">
            Dashboard
          </Link>
          <Link href="/transactions" className="text-sm text-gray-600 hover:text-indigo-600 transition-colors">
            Transações
          </Link>
          <Link
            href="/transactions/new"
            className="ml-auto text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            + Nova Transação
          </Link>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
