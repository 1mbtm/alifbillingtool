import React, { useEffect, useMemo, useState } from 'react';
import { Invoice, PaymentStatus, ShopSettings } from '../types/billing';
import { formatINR } from '../utils/currency';
import { downloadInvoicePdf } from '../utils/pdf';
import { getTodayIsoDate } from '../services/billingService';
import { StatusBadge } from './StatusBadge';

interface InvoicesHistoryViewProps {
  invoices: Invoice[];
  settings: ShopSettings;
  initialStatusFilter?: PaymentStatus | 'All';
  onSelectInvoice: (invoice: Invoice, openShare?: boolean) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function InvoicesHistoryView({
  invoices,
  settings,
  initialStatusFilter = 'All',
  onSelectInvoice,
  onNotify
}: InvoicesHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'All'>(initialStatusFilter);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

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

  const hasActiveFilters =
    search.trim() !== '' || statusFilter !== 'All' || startDate !== '' || endDate !== '';

  return (
    <div className="space-y-5">
      {/* Compact Header & Search / Filter Controls */}
      <section className="space-y-3.5 border-b border-black pb-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="editorial-label">Archive &amp; Ledger</div>
            <h2 className="editorial-heading mt-0.5">
              Invoice History ({filtered.length})
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const today = getTodayIsoDate();
                setStartDate(today);
                setEndDate(today);
                setShowDateFilter(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[38px]"
            >
              Today Only
            </button>
            <button
              type="button"
              onClick={() => setShowDateFilter((prev) => !prev)}
              aria-expanded={showDateFilter}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-stone-50 hover:border-black min-h-[38px]"
            >
              {showDateFilter || startDate || endDate ? 'Dates ▲' : 'Filter Dates ▼'}
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('All');
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-black bg-white hover:bg-stone-50 min-h-[38px]"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Primary Search Bar */}
        <div>
          <label className="block editorial-label mb-1">
            Search Invoice No, Client Name, Phone or Garment
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type invoice number, client name, or mobile..."
            data-testid="input-invoice-search"
            className="w-full px-3.5 py-2 text-base bg-white"
          />
        </div>

        {/* Collapsible Date Range Inputs (Mounted in DOM so state & test queries remain intact) */}
        <div
          className={
            showDateFilter || startDate || endDate
              ? 'grid grid-cols-2 gap-3 pt-1'
              : 'hidden'
          }
        >
          <div>
            <label className="block editorial-label mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-2 text-base font-mono bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-2 text-base font-mono bg-white"
            />
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(['All', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              data-testid={`filter-status-${st}`}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider border font-semibold transition min-h-[40px] ${
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

      {/* Compact 3-Column Filtered Totals Strip (Single row even on 360px screens) */}
      <div className="grid grid-cols-3 border-t border-l border-alif-border bg-white">
        <div className="p-2.5 sm:p-4 border-r border-b border-alif-border">
          <span className="editorial-label block truncate">Active ({filtered.length})</span>
          <span className="font-mono font-bold text-sm sm:text-base text-alif-black mt-0.5 block">
            {formatINR(totals.activeTotalPaise)}
          </span>
        </div>
        <div className="p-2.5 sm:p-4 border-r border-b border-alif-border">
          <span className="editorial-label block truncate">Net Paid</span>
          <span className="font-mono font-bold text-sm sm:text-base text-alif-black mt-0.5 block">
            {formatINR(totals.paidPaise)}
          </span>
        </div>
        <div className="p-2.5 sm:p-4 border-r border-b border-alif-border bg-stone-50">
          <span className="editorial-label block truncate text-alif-charcoal">Outstanding</span>
          <span className="font-mono font-bold text-sm sm:text-base text-alif-black mt-0.5 block">
            {formatINR(totals.balancePaise)}
          </span>
        </div>
      </div>

      {/* Searchable Invoice List */}
      <section className="bg-white border border-alif-border">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-alif-grey">
            No invoices match the current filter criteria.
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((inv) => (
              <div
                key={inv.id}
                data-testid={`invoice-row-${inv.invoiceNumber}`}
                className="p-3.5 sm:p-4 hover:bg-stone-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onSelectInvoice(inv, false)}
                      className="btn-inline font-mono text-base font-bold text-alif-black hover:underline"
                    >
                      {inv.invoiceNumber}
                    </button>
                    <StatusBadge status={inv.status} />
                    <span className="text-xs font-mono text-alif-grey">
                      {inv.invoiceDate}
                    </span>
                    {inv.collectionDate && (
                      <span className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 border border-alif-border bg-stone-50 text-alif-charcoal">
                        Due {inv.collectionDate}
                      </span>
                    )}
                  </div>

                  <div className="text-base font-medium text-alif-black">
                    {inv.customerName}{' '}
                    <span className="text-xs font-mono text-alif-grey ml-1.5">
                      {inv.customerPhone}
                    </span>
                  </div>

                  <div className="text-xs text-alif-grey truncate">
                    {inv.items.map((it) => `${it.name} ×${it.quantity}`).join(' / ')}
                  </div>

                  {inv.status === 'Cancelled' && inv.cancelReason && (
                    <div className="text-xs text-alif-grey italic">
                      Reason: {inv.cancelReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:items-end justify-between gap-2.5 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-alif-border shrink-0">
                  <div className="flex sm:flex-col items-baseline sm:items-end justify-between gap-2">
                    <span className="font-mono text-base font-bold text-alif-black">
                      {formatINR(inv.totalPaise)}
                    </span>
                    <span className="text-xs font-mono text-alif-grey">
                      Paid {formatINR(inv.paidPaise)} •{' '}
                      <strong className="text-alif-black">
                        Bal {formatINR(inv.balancePaise)}
                      </strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectInvoice(inv, false)}
                      data-testid={`btn-open-${inv.invoiceNumber}`}
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white hover:bg-zinc-800 min-h-[40px]"
                    >
                      Open / Pay
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectInvoice(inv, true)}
                      data-testid={`btn-share-bill-${inv.invoiceNumber}`}
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-black bg-white text-alif-black hover:bg-stone-50 min-h-[40px]"
                    >
                      Share Bill
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        downloadInvoicePdf(inv, [], settings);
                        onNotify(`Downloaded ${inv.invoiceNumber}.pdf`);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
                    >
                      PDF
                    </button>
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
