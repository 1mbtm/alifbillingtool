import React, { useEffect, useState } from 'react';
import {
  DiscountType,
  Invoice,
  PaymentMethod,
  PaymentRecord,
  PaymentRecordType,
  ShopSettings
} from '../types/billing';
import {
  formatINR,
  paiseToRupeesString,
  PAYMENT_METHOD_LABELS,
  rupeesToPaise
} from '../utils/currency';
import {
  buildSmsShareUrl,
  buildWhatsAppShareUrl,
  downloadInvoicePdf,
  printInvoiceReceipt,
  shareInvoicePdf
} from '../utils/pdf';
import {
  cancelInvoice,
  getInvoiceDetails,
  getTodayIsoDate,
  recordInvoicePayment,
  reopenAndUpdateInvoice
} from '../services/billingService';
import { ConfirmDialog, StatusBadge } from './StatusBadge';

interface InvoiceDetailModalProps {
  invoiceId: string;
  settings: ShopSettings;
  onClose: () => void;
  onUpdated: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function InvoiceDetailModal({
  invoiceId,
  settings,
  onClose,
  onUpdated,
  onNotify
}: InvoiceDetailModalProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [payType, setPayType] = useState<PaymentRecordType>('payment');
  const [payAmountRupees, setPayAmountRupees] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>(
    settings.defaultPaymentMethod || 'cash'
  );
  const [payDate, setPayDate] = useState(getTodayIsoDate());
  const [payNote, setPayNote] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const [isEditingBill, setIsEditingBill] = useState(false);
  const [editLines, setEditLines] = useState<
    {
      id: string;
      catalogueItemId: string | null;
      name: string;
      category: any;
      quantity: string;
      unit: string;
      unitPriceRupees: string;
      costPricePaise?: number;
      notes: string;
    }[]
  >([]);
  const [editDiscountType, setEditDiscountType] = useState<DiscountType>('flat');
  const [editDiscountValue, setEditDiscountValue] = useState('0');
  const [editCollectionDate, setEditCollectionDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmReopenOpen, setConfirmReopenOpen] = useState(false);

  async function loadDetails() {
    setLoading(true);
    try {
      const data = await getInvoiceDetails(invoiceId);
      setInvoice(data.invoice);
      setPayments(data.payments);
      if (data.invoice.balancePaise > 0) {
        setPayAmountRupees(paiseToRupeesString(data.invoice.balancePaise));
      } else {
        setPayAmountRupees('');
      }
      setEditLines(
        data.invoice.items.map((it) => ({
          id: it.id,
          catalogueItemId: it.catalogueItemId,
          name: it.name,
          category: it.category,
          quantity: String(it.quantity),
          unit: it.unit,
          unitPriceRupees: paiseToRupeesString(it.unitPricePaise),
          costPricePaise: it.costPricePaise,
          notes: it.notes || ''
        }))
      );
      setEditDiscountType(data.invoice.discountType);
      setEditDiscountValue(
        data.invoice.discountType === 'flat'
          ? paiseToRupeesString(data.invoice.discountValue)
          : String(data.invoice.discountValue)
      );
      setEditCollectionDate(data.invoice.collectionDate || '');
      setEditNotes(data.invoice.notes || '');
    } catch (err: any) {
      onNotify(err?.message || 'Could not load invoice details', true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
  }, [invoiceId]);

  if (loading || !invoice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white border border-black p-6 text-xs uppercase tracking-widest font-semibold">
          Loading invoice receipt...
        </div>
      </div>
    );
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || submittingPay) return;
    let amountPaise = 0;
    try {
      amountPaise = rupeesToPaise(payAmountRupees);
    } catch (_err) {
      onNotify('Enter a valid amount in Rupees', true);
      return;
    }

    if (amountPaise === 0) {
      onNotify('Payment amount cannot be zero', true);
      return;
    }

    setSubmittingPay(true);
    try {
      const res = await recordInvoicePayment({
        invoiceId: invoice.id,
        amountPaise,
        method: payMethod,
        type: payType,
        date: payDate,
        note: payNote
      });
      setInvoice(res.invoice);
      setPayments(res.allPayments);
      setPayNote('');
      setPayAmountRupees(
        res.invoice.balancePaise > 0 ? paiseToRupeesString(res.invoice.balancePaise) : ''
      );
      onUpdated();
      onNotify(`Recorded ${payType} of ${formatINR(Math.abs(amountPaise))}`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to record transaction', true);
    } finally {
      setSubmittingPay(false);
    }
  }

  async function handleCancelInvoice() {
    if (!invoice) return;
    if (!cancelReason.trim()) {
      onNotify('Please enter a reason for cancelling this bill', true);
      return;
    }
    try {
      const updated = await cancelInvoice(invoice.id, cancelReason.trim());
      setInvoice(updated);
      setShowCancelPrompt(false);
      setCancelReason('');
      onUpdated();
      onNotify(`Cancelled invoice ${updated.invoiceNumber}`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to cancel invoice', true);
    }
  }

  async function handleSaveEditedInvoice() {
    if (!invoice) return;
    try {
      const parsedItems = editLines.map((l) => ({
        id: l.id,
        catalogueItemId: l.catalogueItemId,
        name: l.name.trim(),
        category: l.category,
        quantity: Number(l.quantity) || 1,
        unit: l.unit.trim() || 'pc',
        unitPricePaise: rupeesToPaise(l.unitPriceRupees || '0'),
        costPricePaise: l.costPricePaise,
        notes: l.notes.trim() || undefined
      }));
      const discVal =
        editDiscountType === 'flat'
          ? rupeesToPaise(editDiscountValue || '0')
          : Number(editDiscountValue) || 0;

      const updated = await reopenAndUpdateInvoice({
        invoiceId: invoice.id,
        items: parsedItems,
        discountType: editDiscountType,
        discountValue: discVal,
        collectionDate: editCollectionDate,
        notes: editNotes
      });
      setInvoice(updated);
      setIsEditingBill(false);
      setConfirmReopenOpen(false);
      onUpdated();
      onNotify(`Updated & recalculated invoice ${updated.invoiceNumber}`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to update invoice', true);
    }
  }

  async function handleNativeShare() {
    if (!invoice) return;
    const res = await shareInvoicePdf(invoice, payments, settings);
    onNotify(res.message);
  }

  function handleDownloadPdf() {
    if (!invoice) return;
    const filename = downloadInvoicePdf(invoice, payments, settings);
    onNotify(`Downloaded ${filename}`);
  }

  const whatsappUrl = buildWhatsAppShareUrl(invoice, settings);
  const smsUrl = buildSmsShareUrl(invoice, settings);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-black max-w-3xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Print-Like Boutique Receipt Masthead */}
        <div className="flex items-start justify-between gap-3 border-b border-black pb-4">
          <div className="space-y-1">
            <div className="editorial-label">
              {settings.shopName} • {settings.city}, {settings.state}
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-base sm:text-lg font-semibold tracking-wider text-alif-black">
                {invoice.invoiceNumber}
              </span>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-[11px] font-mono text-alif-grey">
              Issued: {invoice.invoiceDate}
              {invoice.collectionDate ? `  |  Collection: ${invoice.collectionDate}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-close-invoice-modal"
            className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] border border-alif-border text-alif-black hover:border-black"
          >
            Close ✕
          </button>
        </div>

        {/* Cancelled Notice */}
        {invoice.status === 'Cancelled' && (
          <div className="bg-alif-muted border border-black p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs text-alif-black">
              <span className="font-semibold uppercase tracking-wider">Cancelled Bill:</span>{' '}
              {invoice.cancelReason || 'Cancelled'}
              {invoice.cancelledAt && (
                <span className="text-alif-grey font-mono ml-1.5">
                  ({invoice.cancelledAt.slice(0, 10)})
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmReopenOpen(true)}
              data-testid="btn-reopen-invoice"
              className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-white text-alif-black border border-black hover:bg-stone-50 shrink-0"
            >
              Reopen Invoice
            </button>
          </div>
        )}

        {/* Understated PDF, Print & Messaging Action Bar */}
        <div className="border-t border-b border-alif-border py-3.5 space-y-2.5">
          <div className="editorial-label">Receipt Export &amp; Client Dispatch</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              data-testid="btn-download-pdf"
              className="px-3.5 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.15em] hover:bg-zinc-800"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => printInvoiceReceipt(invoice, payments, settings)}
              className="px-3.5 py-2 bg-white text-alif-black border border-alif-border text-[10px] font-semibold uppercase tracking-[0.15em] hover:border-black"
            >
              Print Receipt
            </button>
            <button
              type="button"
              onClick={handleNativeShare}
              className="px-3.5 py-2 bg-white text-alif-black border border-alif-border text-[10px] font-semibold uppercase tracking-[0.15em] hover:border-black"
            >
              Share PDF
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-whatsapp-share"
              className="px-3.5 py-2 bg-alif-charcoal text-white text-[10px] font-semibold uppercase tracking-[0.15em] hover:bg-black inline-flex items-center"
            >
              WhatsApp Summary
            </a>
            <a
              href={smsUrl}
              data-testid="link-sms-share"
              className="px-3.5 py-2 bg-white text-alif-black border border-alif-border text-[10px] font-semibold uppercase tracking-[0.15em] hover:border-black inline-flex items-center"
            >
              SMS Summary
            </a>
          </div>
          <p className="text-[10px] text-alif-grey">
            WhatsApp and SMS actions prefill the client&apos;s number and invoice summary in your messaging app for manual review before sending.
          </p>
        </div>

        {/* Receipt Body: Client & Itemised Garment Table */}
        <div className="border border-alif-border">
          <div className="bg-stone-50 px-4 py-2.5 border-b border-alif-border flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs">
              <span className="editorial-label mr-2">Client</span>
              <span className="font-semibold text-alif-black">{invoice.customerName}</span>
              <span className="font-mono text-alif-grey ml-2">{invoice.customerPhone}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingBill(!isEditingBill)}
              className="text-[10px] font-semibold uppercase tracking-[0.14em] text-alif-black underline"
            >
              {isEditingBill ? 'Cancel Editing' : 'Edit / Reopen Bill Items'}
            </button>
          </div>

          {!isEditingBill ? (
            <div className="p-4 space-y-4">
              <div className="divide-y">
                {invoice.items.map((item, idx) => (
                  <div key={item.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="font-medium text-alif-black">
                        {idx + 1}. {item.name}{' '}
                        <span className="text-[9px] uppercase tracking-widest text-alif-grey ml-1.5">
                          [{item.category}]
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-alif-grey mt-0.5">
                        {item.quantity} {item.unit} × {formatINR(item.unitPricePaise)}
                        {item.notes ? ` — ${item.notes}` : ''}
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-alif-black shrink-0">
                      {formatINR(item.lineTotalPaise)}
                    </div>
                  </div>
                ))}
              </div>

              {invoice.notes && (
                <div className="text-xs bg-stone-50 p-3 border-t border-b border-alif-border text-alif-charcoal">
                  <span className="editorial-label mr-2">Notes:</span> {invoice.notes}
                </div>
              )}

              {/* Financial Hierarchy Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border text-xs">
                <div className="p-3 border-r border-b border-alif-border">
                  <div className="editorial-label">Subtotal</div>
                  <div className="font-mono font-medium mt-1">{formatINR(invoice.subtotalPaise)}</div>
                </div>
                <div className="p-3 border-r border-b border-alif-border">
                  <div className="editorial-label">Discount</div>
                  <div className="font-mono font-medium mt-1">- {formatINR(invoice.discountPaise)}</div>
                </div>
                <div className="p-3 border-r border-b border-alif-border bg-stone-50">
                  <div className="editorial-label">Final Total</div>
                  <div
                    className="font-mono font-semibold text-sm text-alif-black mt-1"
                    data-testid="detail-total"
                  >
                    {formatINR(invoice.totalPaise)}
                  </div>
                </div>
                <div className="p-3 border-r border-b border-alif-border bg-alif-muted">
                  <div className="editorial-label">Balance Due</div>
                  <div
                    className="font-mono font-semibold text-sm text-alif-black mt-1"
                    data-testid="detail-balance"
                  >
                    {formatINR(invoice.balancePaise)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3 bg-stone-50">
              <div className="editorial-subhead">
                Edit Line Items &amp; Recalculate (Payment history preserved)
              </div>
              {editLines.map((line, idx) => (
                <div
                  key={line.id}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-white p-2.5 border border-alif-border"
                >
                  <input
                    type="text"
                    value={line.name}
                    onChange={(e) => {
                      const copy = [...editLines];
                      copy[idx] = { ...copy[idx], name: e.target.value };
                      setEditLines(copy);
                    }}
                    className="px-2 py-1.5 text-xs border border-alif-border"
                    placeholder="Item name"
                  />
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => {
                      const copy = [...editLines];
                      copy[idx] = { ...copy[idx], quantity: e.target.value };
                      setEditLines(copy);
                    }}
                    className="px-2 py-1.5 text-xs font-mono border border-alif-border"
                    placeholder="Qty"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.unitPriceRupees}
                    onChange={(e) => {
                      const copy = [...editLines];
                      copy[idx] = { ...copy[idx], unitPriceRupees: e.target.value };
                      setEditLines(copy);
                    }}
                    className="px-2 py-1.5 text-xs font-mono border border-alif-border"
                    placeholder="Price (₹)"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={line.notes}
                      onChange={(e) => {
                        const copy = [...editLines];
                        copy[idx] = { ...copy[idx], notes: e.target.value };
                        setEditLines(copy);
                      }}
                      className="flex-1 px-2 py-1.5 text-xs border border-alif-border"
                      placeholder="Note"
                    />
                    {editLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEditLines(editLines.filter((_, i) => i !== idx))}
                        className="px-2 py-1 text-xs text-alif-charcoal border border-alif-border"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block editorial-label mb-1">
                    Discount ({editDiscountType})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editDiscountValue}
                    onChange={(e) => setEditDiscountValue(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Collection Date</label>
                  <input
                    type="date"
                    value={editCollectionDate}
                    onChange={(e) => setEditCollectionDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Bill Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-alif-border bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingBill(false)}
                  className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest border border-alif-border bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedInvoice}
                  className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest bg-alif-black text-white"
                >
                  Save Updated Bill
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Record Payment, Refund or Correction */}
        <form
          onSubmit={handleRecordPayment}
          className="border border-alif-border p-4 space-y-3.5 bg-stone-50"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-alif-border pb-2.5">
            <h4 className="editorial-subhead">Record Payment, Refund or Correction</h4>
            <div className="flex gap-1">
              {(['payment', 'refund', 'correction'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPayType(t)}
                  className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] border font-semibold ${
                    payType === t
                      ? 'bg-alif-black text-white border-black'
                      : 'bg-white text-alif-charcoal border-alif-border'
                  }`}
                >
                  {t === 'payment' ? 'Receive Payment' : t === 'refund' ? 'Issue Refund' : 'Correction'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block editorial-label mb-1">Amount (₹) *</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  step="any"
                  value={payAmountRupees}
                  onChange={(e) => setPayAmountRupees(e.target.value)}
                  placeholder="0"
                  data-testid="input-record-payment-amount"
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
                />
                {payType === 'payment' && invoice.balancePaise > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayAmountRupees(paiseToRupeesString(invoice.balancePaise))}
                    className="px-2 py-1 text-[9px] uppercase tracking-wider font-semibold border border-alif-border bg-white hover:border-black shrink-0"
                  >
                    Full
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block editorial-label mb-1">Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                data-testid="select-record-payment-method"
                className="w-full px-2.5 py-1.5 text-xs border border-alif-border bg-white"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block editorial-label mb-1">Date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">
                Note {payType !== 'payment' ? '*' : ''}
              </label>
              <input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder={
                  payType === 'payment'
                    ? 'Paid on collection'
                    : 'Mandatory audit note'
                }
                data-testid="input-record-payment-note"
                className="w-full px-2.5 py-1.5 text-xs border border-alif-border bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingPay}
              data-testid="btn-submit-payment"
              className="px-4 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
            >
              {submittingPay
                ? 'Saving...'
                : payType === 'payment'
                ? '+ Record Payment'
                : payType === 'refund'
                ? 'Record Refund'
                : 'Record Correction'}
            </button>
          </div>
        </form>

        {/* Chronological Payment Ledger */}
        <div className="border border-alif-border">
          <div className="bg-stone-50 px-4 py-2.5 border-b border-alif-border flex items-center justify-between">
            <h4 className="editorial-subhead">
              Payment History ({payments.length})
            </h4>
            <span
              className="text-xs font-mono font-semibold text-alif-black"
              data-testid="detail-net-paid"
            >
              Net Paid: {formatINR(invoice.paidPaise)}
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="p-4 text-xs text-alif-grey text-center uppercase tracking-wider">
              No payments recorded yet
            </div>
          ) : (
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-alif-black">
                        {p.type}
                      </span>
                      <span className="px-1.5 py-0.5 border border-alif-border text-[9px] uppercase tracking-wider text-alif-grey">
                        {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      </span>
                      <span className="font-mono text-alif-grey">{p.date}</span>
                    </div>
                    {p.note && <div className="text-alif-grey mt-0.5">{p.note}</div>}
                  </div>
                  <div className="font-mono font-semibold text-alif-black">
                    {p.type === 'refund' ? '- ' : '+ '}
                    {formatINR(Math.abs(p.amountPaise))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cancel Invoice Control */}
        {invoice.status !== 'Cancelled' && (
          <div className="border-t border-alif-border pt-3 flex items-center justify-between">
            {!showCancelPrompt ? (
              <button
                type="button"
                onClick={() => setShowCancelPrompt(true)}
                data-testid="btn-open-cancel-invoice"
                className="text-[10px] font-semibold uppercase tracking-[0.15em] text-alif-grey hover:text-alif-black underline"
              >
                Cancel This Invoice...
              </button>
            ) : (
              <div className="w-full bg-stone-50 border border-black p-3.5 space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-alif-black">
                  Cancel Invoice {invoice.invoiceNumber} (Preserves historical ledger)
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter mandatory cancellation reason..."
                    data-testid="input-cancel-reason"
                    className="flex-1 px-3 py-1.5 text-xs border border-alif-border bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelPrompt(false)}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-widest border border-alif-border bg-white"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelInvoice}
                      data-testid="btn-confirm-cancel-invoice"
                      className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest bg-alif-black text-white"
                    >
                      Confirm Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmReopenOpen}
          title={`Reopen Invoice ${invoice.invoiceNumber}?`}
          message="Reopening this bill restores its active status and recalculates the outstanding balance based on its preserved payment history."
          confirmLabel="Reopen Bill"
          onConfirm={handleSaveEditedInvoice}
          onCancel={() => setConfirmReopenOpen(false)}
        />
      </div>
    </div>
  );
}
