import React, { useEffect, useState } from 'react';
import { Invoice, PaymentMethod, PaymentRecord, PeriodReport } from '../types/billing';
import { formatINR, PAYMENT_METHOD_LABELS } from '../utils/currency';
import {
  generateInvoicesCsv,
  generatePaymentsCsv,
  generatePeriodReportCsv,
  triggerTextFileDownload
} from '../utils/csv';
import { getPeriodReport, getTodayIsoDate } from '../services/billingService';

interface ReportsViewProps {
  invoices: Invoice[];
  payments: PaymentRecord[];
  onNotify: (msg: string, isError?: boolean) => void;
}

export function ReportsView({
  invoices,
  payments,
  onNotify
}: ReportsViewProps) {
  const today = getTodayIsoDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState<PeriodReport | null>(null);

  useEffect(() => {
    getPeriodReport(startDate, endDate).then(setReport).catch(() => {});
  }, [startDate, endDate, invoices, payments]);

  function applyPreset(preset: 'today' | '7days' | 'month' | 'all') {
    const now = new Date();
    const todayStr = getTodayIsoDate();
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const y = past.getFullYear();
      const m = String(past.getMonth() + 1).padStart(2, '0');
      const d = String(past.getDate()).padStart(2, '0');
      setStartDate(`${y}-${m}-${d}`);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(todayStr);
    } else {
      setStartDate('2020-01-01');
      setEndDate('2099-12-31');
    }
  }

  function handleExportReportCsv() {
    if (!report) return;
    const csv = generatePeriodReportCsv(report);
    const filename = `ALiF-Report-${startDate}-to-${endDate}.csv`;
    triggerTextFileDownload(filename, csv);
    onNotify(`Exported ${filename}`);
  }

  function handleExportPeriodInvoicesCsv() {
    const periodInvoices = invoices.filter(
      (i) => i.invoiceDate >= startDate && i.invoiceDate <= endDate
    );
    const csv = generateInvoicesCsv(periodInvoices);
    const filename = `ALiF-Invoices-${startDate}-to-${endDate}.csv`;
    triggerTextFileDownload(filename, csv);
    onNotify(`Exported ${filename}`);
  }

  function handleExportPeriodPaymentsCsv() {
    const periodPayments = payments.filter(
      (p) => p.date >= startDate && p.date <= endDate
    );
    const csv = generatePaymentsCsv(periodPayments);
    const filename = `ALiF-Payments-${startDate}-to-${endDate}.csv`;
    triggerTextFileDownload(filename, csv);
    onNotify(`Exported ${filename}`);
  }

  return (
    <div className="space-y-8">
      {/* Period Selector & CSV Export Controls */}
      <section className="border-b border-black pb-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="editorial-label">Financial Analytics</div>
            <h2 className="font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5">
              Sales &amp; Collections Report
            </h2>
            <p className="text-[11px] text-alif-grey mt-0.5">
              Separates invoiced sales value from actual payments collected. Cancelled bills are excluded from sales totals.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset('7days')}
              className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('month')}
              className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              data-testid="btn-report-all-time"
              className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
            >
              All Time
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block editorial-label mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>
          <div>
            <label className="block editorial-label mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleExportReportCsv}
              data-testid="btn-export-report-csv"
              className="px-3.5 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-zinc-800"
            >
              Export Summary CSV
            </button>
            <button
              type="button"
              onClick={handleExportPeriodInvoicesCsv}
              className="px-2.5 py-2 border border-alif-border bg-white text-[10px] font-semibold uppercase tracking-[0.14em] hover:border-black"
            >
              Invoices CSV
            </button>
            <button
              type="button"
              onClick={handleExportPeriodPaymentsCsv}
              className="px-2.5 py-2 border border-alif-border bg-white text-[10px] font-semibold uppercase tracking-[0.14em] hover:border-black"
            >
              Payments CSV
            </button>
          </div>
        </div>
      </section>

      {report && (
        <>
          {/* 4-Column Hairline Financial Summary */}
          <section className="grid grid-cols-2 lg:grid-cols-4 border-t border-l border-alif-border bg-white">
            <div className="p-4 border-r border-b border-alif-border">
              <div className="editorial-label">Invoiced Sales Value</div>
              <div
                className="text-xl font-mono font-normal text-alif-black mt-2"
                data-testid="report-invoiced-sales"
              >
                {formatINR(report.invoicedSalesPaise)}
              </div>
              <div className="text-[10px] font-mono text-alif-grey mt-1.5">
                {report.activeInvoiceCount} active • Disc {formatINR(report.discountsGivenPaise)}
              </div>
            </div>

            <div className="p-4 border-r border-b border-alif-border">
              <div className="editorial-label">Net Payments Collected</div>
              <div
                className="text-xl font-mono font-normal text-alif-black mt-2"
                data-testid="report-net-payments"
              >
                {formatINR(report.netCashCollectedPaise)}
              </div>
              <div className="text-[10px] font-mono text-alif-grey mt-1.5">
                Gross {formatINR(report.paymentsReceivedPaise)} • Ref {formatINR(report.refundsIssuedPaise)}
              </div>
            </div>

            <div className="p-4 border-r border-b border-alif-border">
              <div className="editorial-label">Period Outstanding</div>
              <div
                className="text-xl font-mono font-normal text-alif-black mt-2"
                data-testid="report-outstanding"
              >
                {formatINR(report.outstandingBalancePaise)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-alif-grey mt-1.5">
                Uncollected balance
              </div>
            </div>

            <div className="p-4 border-r border-b border-alif-border">
              <div className="editorial-label">Active / Cancelled</div>
              <div className="text-xl font-mono font-normal text-alif-black mt-2">
                {report.activeInvoiceCount}{' '}
                <span className="text-xs text-alif-grey">
                  / {report.cancelledInvoiceCount} cancelled
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-alif-grey mt-1.5">
                Cancelled excluded
              </div>
            </div>
          </section>

          {/* Method & Category Breakdown */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-alif-border">
              <div className="px-4 py-3 border-b border-alif-border bg-stone-50">
                <h3 className="editorial-subhead">Collections by Payment Method</h3>
              </div>
              <div className="divide-y px-4">
                {(['cash', 'upi', 'bank_transfer', 'other'] as PaymentMethod[]).map((m) => (
                  <div key={m} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="uppercase tracking-wider text-alif-charcoal">
                      {PAYMENT_METHOD_LABELS[m]}
                    </span>
                    <span className="font-mono font-semibold text-alif-black">
                      {formatINR(report.paymentsByMethod[m] || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-alif-border">
              <div className="px-4 py-3 border-b border-alif-border bg-stone-50">
                <h3 className="editorial-subhead">Category Breakdown (Active Bills)</h3>
              </div>
              <div className="divide-y px-4">
                {report.categoryBreakdown.map((cat) => (
                  <div key={cat.category} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-alif-black">{cat.label}</div>
                      <div className="text-[11px] font-mono text-alif-grey">
                        Qty: {cat.quantity}
                        {cat.estimatedCostPaise > 0
                          ? ` • Est. Cost: ${formatINR(cat.estimatedCostPaise)}`
                          : ''}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-alif-black">
                      {formatINR(cat.revenuePaise)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Itemised Sales Breakdown */}
          <section className="bg-white border border-alif-border">
            <div className="px-4 py-3 border-b border-alif-border bg-stone-50">
              <h3 className="editorial-subhead">
                Itemised Service &amp; Material Breakdown ({report.itemBreakdown.length})
              </h3>
            </div>
            {report.itemBreakdown.length === 0 ? (
              <div className="p-8 text-center text-xs uppercase tracking-wider text-alif-grey">
                No active sales recorded in this period.
              </div>
            ) : (
              <div className="divide-y">
                {report.itemBreakdown.map((it) => (
                  <div
                    key={`${it.category}-${it.name}`}
                    className="px-4 py-2.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-medium text-alif-black">{it.name}</span>{' '}
                      <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-alif-border text-alif-grey ml-1.5">
                        {it.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-mono">
                      <span className="text-alif-grey">Qty: {it.quantity}</span>
                      <span className="font-semibold text-alif-black">
                        {formatINR(it.revenuePaise)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
