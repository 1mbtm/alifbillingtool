import React from 'react';
import { DashboardMetrics, Invoice, PaymentStatus } from '../types/billing';
import { formatINR } from '../utils/currency';
import { StatusBadge } from './StatusBadge';

export type NavTab =
  | 'dashboard'
  | 'create-bill'
  | 'invoices'
  | 'inventory'
  | 'customers'
  | 'catalogue'
  | 'reports'
  | 'settings';

interface DashboardViewProps {
  metrics: DashboardMetrics;
  onNavigate: (tab: NavTab, statusFilter?: PaymentStatus | 'All') => void;
  onSelectInvoice: (invoice: Invoice) => void;
}

export function DashboardView({
  metrics,
  onNavigate,
  onSelectInvoice
}: DashboardViewProps) {
  return (
    <div className="space-y-6">
      {/* Compact Editorial Header & Primary Billing Actions */}
      <section className="border-b border-black pb-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-0.5">
            <div className="editorial-label">
              Daal Kuan College Road, Sahibganj — {metrics.todayDate}
            </div>
            <h2 className="editorial-heading">
              Atelier Billing &amp; Ledger
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('create-bill')}
              data-testid="quick-new-bill"
              className="px-4 py-3 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800 transition min-h-[48px]"
            >
              + Create New Bill
            </button>
            <button
              type="button"
              onClick={() => onNavigate('invoices')}
              className="px-4 py-3 bg-white text-alif-black border border-black text-xs font-semibold uppercase tracking-wider hover:bg-stone-50 transition min-h-[48px]"
            >
              Receive Payment
            </button>
          </div>
        </div>
      </section>

      {/* Promoted Above-the-Fold 2x2 Financial Summary Strip */}
      <section aria-label="Financial Summary" className="space-y-2">
        <div className="editorial-label">Daily Financial Summary</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-l border-alif-border bg-white">
          <div className="p-3.5 sm:p-4 border-r border-b border-alif-border">
            <div className="editorial-label">Today&apos;s Invoice Value</div>
            <div
              className="text-xl sm:text-2xl font-bold text-alif-black mt-1.5 font-mono"
              data-testid="metric-today-invoice-value"
            >
              {formatINR(metrics.todayInvoiceValuePaise)}
            </div>
            <div className="text-xs text-alif-grey mt-1">
              Excludes cancelled
            </div>
          </div>

          <div className="p-3.5 sm:p-4 border-r border-b border-alif-border">
            <div className="editorial-label">Payments Received</div>
            <div
              className="text-xl sm:text-2xl font-bold text-alif-black mt-1.5 font-mono"
              data-testid="metric-today-payments"
            >
              {formatINR(metrics.todayPaymentsReceivedPaise)}
            </div>
            <div className="text-xs text-alif-grey mt-1">
              Advances + balance
            </div>
          </div>

          <div className="p-3.5 sm:p-4 border-r border-b border-alif-border bg-stone-50">
            <div className="editorial-label text-alif-charcoal">Outstanding Balance</div>
            <div
              className="text-xl sm:text-2xl font-bold text-alif-black mt-1.5 font-mono"
              data-testid="metric-outstanding-balance"
            >
              {formatINR(metrics.totalOutstandingPaise)}
            </div>
            <div className="text-xs font-medium text-alif-charcoal mt-1">
              {metrics.outstandingInvoiceCount} pending bill(s)
            </div>
          </div>

          <div className="p-3.5 sm:p-4 border-r border-b border-alif-border">
            <div className="editorial-label">Today&apos;s Bills</div>
            <div
              className="text-xl sm:text-2xl font-bold text-alif-black mt-1.5 font-mono"
              data-testid="metric-today-count"
            >
              {metrics.todayInvoiceCount}
            </div>
            <div className="text-xs text-alif-grey mt-1">
              Active bills today
            </div>
          </div>
        </div>
      </section>

      {/* Editorial Recent Invoices Ledger */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between border-b border-black pb-2">
          <div>
            <h3 className="editorial-subhead">Recent Invoices</h3>
            <p className="text-xs text-alif-grey mt-0.5">
              Tap any bill to record payment, share on WhatsApp/SMS, or download PDF
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('invoices')}
            className="btn-inline text-xs font-semibold uppercase tracking-wider text-alif-black underline hover:text-alif-grey"
          >
            View All →
          </button>
        </div>

        {metrics.recentInvoices.length === 0 ? (
          <div className="py-10 px-4 text-center border border-alif-border bg-white space-y-3">
            <p className="text-xs uppercase tracking-wider text-alif-grey">
              No tailoring bills recorded yet
            </p>
            <button
              type="button"
              onClick={() => onNavigate('create-bill')}
              className="px-5 py-2.5 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800"
            >
              + Create First Bill
            </button>
          </div>
        ) : (
          <div className="bg-white border border-alif-border divide-y">
            {metrics.recentInvoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onSelectInvoice(inv)}
                className="p-3.5 sm:p-4 hover:bg-stone-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-alif-black">
                      {inv.invoiceNumber}
                    </span>
                    <StatusBadge status={inv.status} />
                    <span className="text-xs font-mono text-alif-grey">
                      {inv.invoiceDate}
                    </span>
                    {inv.collectionDate && (
                      <span className="text-[11px] uppercase tracking-wider text-alif-charcoal bg-stone-50 border border-alif-border px-1.5 py-0.5">
                        Due {inv.collectionDate}
                      </span>
                    )}
                  </div>

                  <div className="text-base font-medium text-alif-black truncate">
                    {inv.customerName}{' '}
                    <span className="text-xs font-mono text-alif-grey ml-1">
                      {inv.customerPhone}
                    </span>
                  </div>

                  <div className="text-xs text-alif-grey truncate">
                    {inv.items.map((i) => `${i.name} ×${i.quantity}`).join(' / ')}
                  </div>
                </div>

                <div className="flex sm:flex-col items-baseline sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-alif-border shrink-0">
                  <div className="font-mono text-base font-bold text-alif-black">
                    {formatINR(inv.totalPaise)}
                  </div>
                  <div className="text-xs font-mono text-alif-grey mt-0.5">
                    Paid {formatINR(inv.paidPaise)}
                    {inv.balancePaise > 0 && inv.status !== 'Cancelled' && (
                      <span className="text-alif-black font-bold ml-1.5">
                        • Bal {formatINR(inv.balancePaise)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Secondary Atelier Directory Links */}
      <section className="space-y-2 pt-2">
        <div className="editorial-label">Atelier Directory &amp; Stock</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border bg-white">
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="text-left p-3.5 border-r border-b border-alif-border hover:bg-stone-50 transition flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                Inventory
              </div>
              <div className="text-xs text-alif-grey mt-0.5">
                Fabric rolls &amp; stock
              </div>
            </div>
            <span className="text-xs text-alif-grey">→</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('customers')}
            className="text-left p-3.5 border-r border-b border-alif-border hover:bg-stone-50 transition flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                Customers
              </div>
              <div className="text-xs text-alif-grey mt-0.5">Client directory</div>
            </div>
            <span className="text-xs text-alif-grey">→</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('catalogue')}
            className="text-left p-3.5 border-r border-b border-alif-border hover:bg-stone-50 transition flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                Catalogue
              </div>
              <div className="text-xs text-alif-grey mt-0.5">Services &amp; fabric</div>
            </div>
            <span className="text-xs text-alif-grey">→</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="text-left p-3.5 border-r border-b border-alif-border hover:bg-stone-50 transition flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                Sales Reports
              </div>
              <div className="text-xs text-alif-grey mt-0.5">Period &amp; CSV</div>
            </div>
            <span className="text-xs text-alif-grey">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
