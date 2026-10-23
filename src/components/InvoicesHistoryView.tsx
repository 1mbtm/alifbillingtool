import React, { useMemo, useState } from 'react';
import { Invoice, PaymentStatus, ShopSettings } from '../types/billing';
import { formatINR } from '../utils/currency';
import { buildWhatsAppShareUrl, downloadInvoicePdf } from '../utils/pdf';
import { getTodayIsoDate } from '../services/billingService';
import { StatusBadge } from './StatusBadge';

interface InvoicesHistoryViewProps {
  invoices: Invoice[];
  settings: ShopSettings;
  onSelectInvoice: (invoice: Invoice) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function InvoicesHistoryView({
  invoices,
  settings,
  onSelectInvoice,
  onNotify
}: InvoicesHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'All'>('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'All' && inv.status !== statusFilter) return false;
      if (startDate && inv.invoiceDate < startDate) return false;
      if (endDate && inv.invoiceDate > endDate) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q) ||
          inv.customerPhone.toLowerCase().includes(q) ||
          inv.items.some((i) => i.name.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [invoices, search, statusFilter, startDate, endDate]);

  const totals = useMemo(() => {
    let activeTotalPaise = 0;
    let paidPaise = 0;
    let balancePaise = 0;
    for (const inv of filtered) {
      if (inv.status !== 'Cancelled') {
        activeTotalPaise += inv.totalPaise;
        balancePaise += inv.balancePaise;
      }
      paidPaise += inv.paidPaise;
    }
    return { activeTotalPaise, paidPaise, balancePaise };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Editorial Header & Filter Controls */}
      <section className="space-y-4 border-b border-black pb-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="editorial-label">Archive &amp; Ledger</div>
            <h2 className="font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5">
              Invoice History
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const today = getTodayIsoDate();
                setStartDate(today);
                setEndDate(today);
              }}
              className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
            >
              Today Only
            </button>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('All');
                setStartDate('');
                setEndDate('');
              }}
              className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block editorial-label mb-1">
              Search Invoice / Client / Phone
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ALIF-2026-0001 or client..."
              data-testid="input-invoice-search"
              className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>
        </div>

        {/* Flat Rectangular Status Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(['All', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              data-testid={`filter-status-${st}`}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] border font-semibold transition ${
                statusFilter === st
                  ? 'bg-alif-black text-white border-black'
                  : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </section>

      {/* Hairline Filtered Totals Strip */}
      <div className="grid grid-cols-3 border-t border-l border-alif-border bg-white">
        <div className="p-3.5 border-r border-b border-alif-border">
          <span className="editorial-label block">Active Value ({filtered.length})</span>
          <span className="font-mono font-semibold text-sm text-alif-black mt-1 block">
            {formatINR(totals.activeTotalPaise)}
          </span>
        </div>
        <div className="p-3.5 border-r border-b border-alif-border">
          <span className="editorial-label block">Net Paid</span>
          <span className="font-mono font-semibold text-sm text-alif-black mt-1 block">
            {formatINR(totals.paidPaise)}
          </span>
        </div>
        <div className="p-3.5 border-r border-b border-alif-border">
          <span className="editorial-label block">Outstanding</span>
          <span className="font-mono font-semibold text-sm text-alif-black mt-1 block">
            {formatINR(totals.balancePaise)}
          </span>
        </div>
      </div>

      {/* Minimal Searchable Invoice List */}
      <section className="bg-white border border-alif-border">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs uppercase tracking-wider text-alif-grey">
            No invoices match the current filter criteria.
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((inv) => (
              <div
                key={inv.id}
                data-testid={`invoice-row-${inv.invoiceNumber}`}
                className="p-4 hover:bg-stone-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onSelectInvoice(inv)}
                      className="font-mono text-xs font-semibold tracking-wider text-alif-black hover:underline"
                    >
                      {inv.invoiceNumber}
                    </button>
                    <StatusBadge status={inv.status} />
                    <span className="text-[11px] font-mono text-alif-grey">
                      {inv.invoiceDate}
                    </span>
                    {inv.collectionDate && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-alif-border text-alif-charcoal">
                        Due {inv.collectionDate}
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-medium text-alif-black">
                    {inv.customerName}{' '}
                    <span className="text-xs font-mono text-alif-grey ml-1">
                      {inv.customerPhone}
                    </span>
                  </div>

                  <div className="text-xs text-alif-grey truncate">
                    {inv.items.map((it) => `${it.name} ×${it.quantity}`).join(' / ')}
                  </div>

                  {inv.status === 'Cancelled' && inv.cancelReason && (
                    <div className="text-[11px] text-alif-grey italic">
                      Reason: {inv.cancelReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:items-end justify-between gap-2 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-alif-border shrink-0">
                  <div className="flex sm:flex-col items-baseline sm:items-end justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-alif-black">
                      {formatINR(inv.totalPaise)}
                    </span>
                    <span className="text-[11px] font-mono text-alif-grey">
                      Paid {formatINR(inv.paidPaise)} •{' '}
                      <strong className="text-alif-black">
                        Bal {formatINR(inv.balancePaise)}
                      </strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectInvoice(inv)}
                      data-testid={`btn-open-${inv.invoiceNumber}`}
                      className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-alif-black text-white hover:bg-zinc-800"
                    >
                      Open / Pay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        downloadInvoicePdf(inv, [], settings);
                        onNotify(`Downloaded ${inv.invoiceNumber}.pdf`);
                      }}
                      className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
                    >
                      PDF
                    </button>
                    <a
                      href={buildWhatsAppShareUrl(inv, settings)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white text-alif-black hover:border-black"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
