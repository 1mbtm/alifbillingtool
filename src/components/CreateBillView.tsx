import React, { useEffect, useMemo, useState } from 'react';
import {
  CatalogueCategory,
  CatalogueItem,
  Customer,
  DiscountType,
  Invoice,
  PaymentMethod,
  ShopSettings
} from '../types/billing';
import {
  calculateInvoiceTotals,
  calculateLineTotalPaise,
  formatINR,
  paiseToRupeesString,
  PAYMENT_METHOD_LABELS,
  rupeesToPaise
} from '../utils/currency';
import {
  createInvoice,
  generateId,
  getTodayIsoDate,
  previewNextInvoiceNumber
} from '../services/billingService';

interface DraftLineItem {
  id: string;
  catalogueItemId: string | null;
  name: string;
  category: CatalogueCategory;
  quantity: string;
  unit: string;
  unitPriceRupees: string;
  costPricePaise?: number;
  rangeHint?: string;
  notes: string;
}

interface CreateBillViewProps {
  customers: Customer[];
  catalogue: CatalogueItem[];
  settings: ShopSettings;
  preselectedCustomer?: Customer | null;
  onBillCreated: (invoice: Invoice) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function CreateBillView({
  customers,
  catalogue,
  settings,
  preselectedCustomer,
  onBillCreated,
  onNotify
}: CreateBillViewProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    preselectedCustomer?.id || ''
  );
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerName, setCustomerName] = useState(preselectedCustomer?.name || '');
  const [customerPhone, setCustomerPhone] = useState(preselectedCustomer?.phone || '');
  const [customerNotes, setCustomerNotes] = useState(preselectedCustomer?.notes || '');

  const [invoiceDate, setInvoiceDate] = useState(getTodayIsoDate());
  const [collectionDate, setCollectionDate] = useState('');
  const [previewNumber, setPreviewNumber] = useState('ALIF-2026-0001');

  const [catFilter, setCatFilter] = useState<CatalogueCategory | 'all'>('all');
  const [catSearch, setCatSearch] = useState('');

  const [lines, setLines] = useState<DraftLineItem[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>('flat');
  const [discountInput, setDiscountInput] = useState('0');
  const [advanceInput, setAdvanceInput] = useState('0');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>(
    settings.defaultPaymentMethod || 'cash'
  );
  const [billNotes, setBillNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateId('idem'));
  const [isSaving, setIsSaving] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    if (preselectedCustomer) {
      setSelectedCustomerId(preselectedCustomer.id);
      setCustomerName(preselectedCustomer.name);
      setCustomerPhone(preselectedCustomer.phone);
      setCustomerNotes(preselectedCustomer.notes || '');
    }
  }, [preselectedCustomer]);

  useEffect(() => {
    previewNextInvoiceNumber(invoiceDate).then(setPreviewNumber).catch(() => {});
  }, [invoiceDate]);

  useEffect(() => {
    if (lines.length === 0 && catalogue.length > 0) {
      const astar = catalogue.find((c) => c.id === 'srv-astar-blouse') || catalogue[0];
      if (astar) {
        addCatalogueItemToBill(astar);
      }
    }
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [customers, customerSearch]);

  const filteredCatalogue = useMemo(() => {
    return catalogue.filter((item) => {
      if (!item.isActive) return false;
      if (catFilter !== 'all' && item.category !== catFilter) return false;
      if (catSearch.trim()) {
        const q = catSearch.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.unit.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalogue, catFilter, catSearch]);

  function handleSelectExistingCustomer(cust: Customer) {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    setCustomerNotes(cust.notes || '');
    setCustomerSearch('');
  }

  function addCatalogueItemToBill(item: CatalogueItem) {
    const rangeHint =
      item.minPricePaise !== undefined && item.maxPricePaise !== undefined
        ? `${formatINR(item.minPricePaise)}–${formatINR(item.maxPricePaise)}/${item.unit}`
        : undefined;

    setLines((prev) => [
      ...prev,
      {
        id: generateId('row'),
        catalogueItemId: item.id,
        name: item.name,
        category: item.category,
        quantity: '1',
        unit: item.unit,
        unitPriceRupees: paiseToRupeesString(item.defaultPricePaise),
        costPricePaise: item.costPricePaise,
        rangeHint,
        notes: ''
      }
    ]);
  }

  function addBlankCustomItem() {
    setLines((prev) => [
      ...prev,
      {
        id: generateId('row'),
        catalogueItemId: null,
        name: 'Custom Tailoring / Material',
        category: 'custom',
        quantity: '1',
        unit: 'item',
        unitPriceRupees: '200',
        notes: ''
      }
    ]);
  }

  function updateLine(id: string, patch: Partial<DraftLineItem>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((line) => line.id !== id));
  }

  const calculated = useMemo(() => {
    const parsedLines = lines.map((l) => {
      const qty = Math.max(0, Number(l.quantity) || 0);
      let unitPaise = 0;
      try {
        unitPaise = Math.max(0, rupeesToPaise(l.unitPriceRupees || '0'));
      } catch (_e) {
        unitPaise = 0;
      }
      const lineTotalPaise = qty > 0 ? calculateLineTotalPaise(qty, unitPaise) : 0;
      return {
        ...l,
        qty,
        unitPaise,
        lineTotalPaise
      };
    });

    let discountVal = 0;
    try {
      discountVal =
        discountType === 'flat'
          ? Math.max(0, rupeesToPaise(discountInput || '0'))
          : Math.max(0, Math.min(100, Number(discountInput) || 0));
    } catch (_e) {
      discountVal = 0;
    }

    const totals = calculateInvoiceTotals({
      items: parsedLines
        .filter((l) => l.qty > 0)
        .map((l) => ({ quantity: l.qty, unitPricePaise: l.unitPaise })),
      discountType,
      discountValue: discountVal,
      taxEnabled: settings.taxEnabled,
      taxRatePercent: settings.taxRatePercent
    });

    let advancePaise = 0;
    try {
      advancePaise = Math.max(0, rupeesToPaise(advanceInput || '0'));
    } catch (_e) {
      advancePaise = 0;
    }

    const balancePaise = Math.max(0, totals.totalPaise - advancePaise);
    const status =
      totals.totalPaise === 0 || advancePaise >= totals.totalPaise
        ? 'Paid'
        : advancePaise > 0
        ? 'Partially Paid'
        : 'Unpaid';

    return {
      parsedLines,
      discountVal,
      totals,
      advancePaise,
      balancePaise,
      status
    };
  }, [lines, discountType, discountInput, advanceInput, settings]);

  function validateForm(): string | null {
    if (!customerName.trim()) return 'Please enter the customer name.';
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 6) {
      return 'Please enter a valid customer phone number (at least 6 digits).';
    }
    if (calculated.parsedLines.length === 0) {
      return 'Please add at least one tailoring service or product item.';
    }
    for (let i = 0; i < calculated.parsedLines.length; i++) {
      const l = calculated.parsedLines[i];
      if (!l.name.trim()) return `Line item #${i + 1} needs a name.`;
      if (l.qty <= 0) return `Line item "${l.name}" must have a quantity greater than 0.`;
      if (l.unitPaise < 0) return `Line item "${l.name}" cannot have a negative price.`;
    }
    if (calculated.advancePaise > calculated.totals.totalPaise) {
      return 'Advance received cannot exceed the final bill total.';
    }
    return null;
  }

  async function handleSaveBill() {
    if (isSaving) return;
    const errorMsg = validateForm();
    if (errorMsg) {
      onNotify(errorMsg, true);
      return;
    }

    setIsSaving(true);
    try {
      const result = await createInvoice({
        customerId: selectedCustomerId || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerNotes: customerNotes.trim(),
        invoiceDate,
        collectionDate: collectionDate || undefined,
        items: calculated.parsedLines.map((l) => ({
          catalogueItemId: l.catalogueItemId,
          name: l.name.trim(),
          category: l.category,
          quantity: l.qty,
          unit: l.unit.trim() || 'pc',
          unitPricePaise: l.unitPaise,
          costPricePaise: l.costPricePaise,
          notes: l.notes.trim() || undefined
        })),
        discountType,
        discountValue: calculated.discountVal,
        advancePaise: calculated.advancePaise,
        advanceMethod,
        notes: billNotes.trim(),
        idempotencyKey
      });

      setShowPreviewModal(false);
      setIdempotencyKey(generateId('idem'));
      onNotify(`Saved bill ${result.invoice.invoiceNumber} (${formatINR(result.invoice.totalPaise)})`);
      onBillCreated(result.invoice);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to save bill', true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Editorial Section Masthead */}
      <div className="border-b border-black pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <div className="editorial-label">New Order &amp; Invoice</div>
          <h2 className="font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5">
            Create Tailoring Bill
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="editorial-label">Invoice No</span>
          <span
            className="font-mono text-xs font-semibold px-2.5 py-1 border border-black bg-white text-alif-black"
            data-testid="next-invoice-number"
          >
            {previewNumber}
          </span>
        </div>
      </div>

      {/* 01 / Customer & Schedule */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-alif-border pb-2">
          <h3 className="editorial-subhead">01 / Client &amp; Schedule</h3>
          {customers.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search saved client..."
                className="px-2.5 py-1 text-xs border border-alif-border bg-white"
              />
              {selectedCustomerId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId('');
                    setCustomerName('');
                    setCustomerPhone('');
                    setCustomerNotes('');
                  }}
                  className="text-[10px] uppercase tracking-wider text-alif-grey underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {filteredCustomers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectExistingCustomer(c)}
                className={`px-2.5 py-1 text-[11px] border transition ${
                  selectedCustomerId === c.id
                    ? 'bg-alif-black text-white border-black font-semibold'
                    : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                }`}
              >
                {c.name} ({c.phone})
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block editorial-label mb-1">
              Customer Name *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Ayesha Khatoon"
              data-testid="input-customer-name"
              className="w-full px-3 py-2 text-sm border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">
              Phone / WhatsApp *
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              data-testid="input-customer-phone"
              className="w-full px-3 py-2 text-sm border border-alif-border bg-white font-mono"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">
              Bill Date
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-alif-border bg-white font-mono"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">
              Collection Date (Optional)
            </label>
            <input
              type="date"
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
              data-testid="input-collection-date"
              className="w-full px-3 py-2 text-sm border border-alif-border bg-white font-mono"
            />
          </div>
        </div>
      </section>

      {/* 02 / Catalogue Selection */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-alif-border pb-2">
          <div>
            <h3 className="editorial-subhead">02 / Catalogue Selection</h3>
            <p className="text-[11px] text-alif-grey mt-0.5">
              Tap any garment service or material to add to the invoice
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'service', 'product', 'custom'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(cat)}
                className={`px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] border font-semibold ${
                  catFilter === cat
                    ? 'bg-alif-black text-white border-black'
                    : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                }`}
              >
                {cat === 'all' ? 'All' : cat === 'service' ? 'Services' : cat === 'product' ? 'Materials' : 'Custom'}
              </button>
            ))}
            <input
              type="text"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="Filter catalogue..."
              className="px-2.5 py-1 text-xs border border-alif-border bg-white w-32"
            />
            <button
              type="button"
              onClick={addBlankCustomItem}
              data-testid="btn-add-custom-line"
              className="px-3 py-1 text-[10px] uppercase tracking-[0.14em] font-semibold bg-alif-charcoal text-white hover:bg-black"
            >
              + Custom Item
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 border-t border-l border-alif-border max-h-56 overflow-y-auto bg-white">
          {filteredCatalogue.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addCatalogueItemToBill(item)}
              data-testid={`pick-${item.id}`}
              className="text-left p-3 border-r border-b border-alif-border bg-white hover:bg-alif-muted transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-xs font-medium text-alif-black truncate">
                    {item.name}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-alif-grey shrink-0">
                    {item.category === 'service' ? 'SRV' : item.category === 'product' ? 'MAT' : 'CST'}
                  </span>
                </div>
                {item.minPricePaise !== undefined && item.maxPricePaise !== undefined && (
                  <div className="text-[10px] font-mono text-alif-grey mt-0.5">
                    {formatINR(item.minPricePaise)}–{formatINR(item.maxPricePaise)}
                  </div>
                )}
              </div>
              <div className="text-xs font-mono font-semibold text-alif-black mt-2">
                {formatINR(item.defaultPricePaise)} / {item.unit}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 03 / Garment & Material Line Items */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between border-b border-black pb-2">
          <h3 className="editorial-subhead">
            03 / Invoice Line Items ({lines.length})
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-alif-grey">
            Rates configurable per garment
          </span>
        </div>

        {lines.length === 0 ? (
          <div className="p-8 text-center border border-alif-border bg-white text-xs uppercase tracking-wider text-alif-grey">
            No items selected. Choose a service or material above.
          </div>
        ) : (
          <div className="bg-white border border-alif-border divide-y">
            {calculated.parsedLines.map((line, idx) => (
              <div
                key={line.id}
                className="p-3.5 space-y-2.5"
                data-testid={`bill-line-${idx}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
                  <div className="sm:col-span-2">
                    <label className="block editorial-label mb-1">
                      Item / Service #{idx + 1}
                    </label>
                    <input
                      type="text"
                      value={line.name}
                      onChange={(e) => updateLine(line.id, { name: e.target.value })}
                      data-testid={`line-name-${idx}`}
                      className="w-full px-2.5 py-1.5 text-xs font-medium border border-alif-border bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block editorial-label mb-1">
                        Qty ({line.unit})
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                        data-testid={`line-qty-${idx}`}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
                      />
                    </div>

                    <div>
                      <label className="block editorial-label mb-1">
                        Unit Price (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.unitPriceRupees}
                        onChange={(e) => updateLine(line.id, { unitPriceRupees: e.target.value })}
                        data-testid={`line-price-${idx}`}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-alif-border bg-white"
                      />
                      {line.rangeHint && (
                        <span className="block text-[9px] font-mono text-alif-grey mt-0.5">
                          Default: {line.rangeHint}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-5">
                    <div className="text-right">
                      <div className="editorial-label">Line Total</div>
                      <div
                        className="text-sm font-mono font-semibold text-alif-black"
                        data-testid={`line-total-${idx}`}
                      >
                        {formatINR(line.lineTotalPaise)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-alif-grey hover:text-alif-black border border-alif-border"
                      title="Remove item"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={line.notes}
                    onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                    placeholder="Measurement / styling note (e.g. deep back neck with dori, 14 in length)..."
                    className="w-full px-2.5 py-1.5 text-xs border border-alif-border bg-stone-50 text-alif-charcoal"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 04 / Adjustments, Advance & Checkout Summary */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        <div className="space-y-4">
          <div className="border-b border-alif-border pb-2">
            <h3 className="editorial-subhead">04 / Discount, Advance &amp; Notes</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block editorial-label mb-1">
                Discount Type
              </label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                data-testid="select-discount-type"
                className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
              >
                <option value="flat">Flat Amount (₹)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </div>

            <div>
              <label className="block editorial-label mb-1">
                Discount ({discountType === 'flat' ? '₹' : '%'})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                data-testid="input-discount-value"
                className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block editorial-label mb-1">
                Advance Received (₹)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={advanceInput}
                onChange={(e) => setAdvanceInput(e.target.value)}
                data-testid="input-advance-amount"
                className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">
                Payment Method
              </label>
              <select
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
                data-testid="select-advance-method"
                className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
              >
                {(settings.enabledPaymentMethods || ['cash', 'upi', 'bank_transfer', 'other']).map(
                  (m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block editorial-label mb-1">
              Order / Fitting Notes
            </label>
            <textarea
              rows={2}
              value={billNotes}
              onChange={(e) => setBillNotes(e.target.value)}
              placeholder="Delivery instructions, trial schedule, or fabric notes..."
              className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
            />
          </div>
        </div>

        {/* Editorial Monochrome Totals Block */}
        <div className="bg-white border border-black p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-alif-border pb-2.5">
              <span className="editorial-label">Order Summary</span>
              <span className="font-mono text-xs font-semibold text-alif-black">
                {previewNumber}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="uppercase tracking-wider text-alif-grey">Subtotal</span>
              <span className="font-mono text-alif-black" data-testid="summary-subtotal">
                {formatINR(calculated.totals.subtotalPaise)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="uppercase tracking-wider text-alif-grey">Discount</span>
              <span className="font-mono text-alif-charcoal" data-testid="summary-discount">
                - {formatINR(calculated.totals.discountPaise)}
              </span>
            </div>

            {settings.taxEnabled && calculated.totals.taxPaise > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase tracking-wider text-alif-grey">
                  {settings.taxLabel || 'Tax'} ({settings.taxRatePercent}%)
                </span>
                <span className="font-mono text-alif-charcoal">
                  + {formatINR(calculated.totals.taxPaise)}
                </span>
              </div>
            )}

            <div className="border-t border-black pt-3 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-alif-black">
                Final Total
              </span>
              <span
                className="text-xl font-mono font-semibold text-alif-black"
                data-testid="summary-final-total"
              >
                {formatINR(calculated.totals.totalPaise)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="uppercase tracking-wider text-alif-grey">
                Advance ({PAYMENT_METHOD_LABELS[advanceMethod]})
              </span>
              <span className="font-mono font-medium text-alif-black">
                {formatINR(calculated.advancePaise)}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-2 border-t border-alif-border">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-alif-charcoal">
                Balance Due
              </span>
              <span
                className="font-mono text-base font-semibold text-alif-black"
                data-testid="summary-balance-due"
              >
                {formatINR(calculated.balancePaise)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] pt-1 text-alif-grey">
              <span>Status</span>
              <span className="font-semibold text-alif-black">{calculated.status}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-alif-border">
            <button
              type="button"
              onClick={() => {
                const err = validateForm();
                if (err) {
                  onNotify(err, true);
                } else {
                  setShowPreviewModal(true);
                }
              }}
              className="flex-1 py-3 px-3 border border-black bg-white text-alif-black text-[11px] font-semibold uppercase tracking-[0.15em] hover:bg-alif-muted"
            >
              Preview Bill
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveBill}
              data-testid="btn-save-bill"
              className="flex-1 py-3 px-4 bg-alif-black text-white text-[11px] font-semibold uppercase tracking-[0.15em] hover:bg-zinc-800"
            >
              {isSaving ? 'Saving...' : 'Save & Generate Receipt'}
            </button>
          </div>
        </div>
      </section>

      {/* Print-Like Editorial Bill Preview Dialog */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-black max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-black pb-4">
              <div>
                <div className="editorial-label">Receipt Preview</div>
                <h3 className="font-serif text-lg uppercase tracking-[0.18em] text-alif-black mt-1">
                  {settings.shopName}
                </h3>
                <p className="text-xs font-mono text-alif-grey mt-0.5">
                  {previewNumber} • {customerName} ({customerPhone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 border border-alif-border hover:border-black"
              >
                Close
              </button>
            </div>

            <div className="divide-y border-b border-alif-border text-xs">
              {calculated.parsedLines.map((l, i) => (
                <div key={l.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-medium text-alif-black">
                      {i + 1}. {l.name}
                    </span>{' '}
                    <span className="text-alif-grey font-mono">
                      ({l.qty} {l.unit} × {formatINR(l.unitPaise)})
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-alif-black">
                    {formatINR(l.lineTotalPaise)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="uppercase tracking-wider text-alif-grey">Subtotal</span>
                <span className="font-mono">{formatINR(calculated.totals.subtotalPaise)}</span>
              </div>
              {calculated.totals.discountPaise > 0 && (
                <div className="flex justify-between">
                  <span className="uppercase tracking-wider text-alif-grey">Discount</span>
                  <span className="font-mono">- {formatINR(calculated.totals.discountPaise)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-sm pt-2 border-t border-black">
                <span className="uppercase tracking-[0.14em]">Final Total</span>
                <span className="font-mono">{formatINR(calculated.totals.totalPaise)}</span>
              </div>
              <div className="flex justify-between">
                <span className="uppercase tracking-wider text-alif-grey">Advance Paid</span>
                <span className="font-mono">{formatINR(calculated.advancePaise)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t border-alif-border">
                <span className="uppercase tracking-[0.14em]">Balance Due</span>
                <span className="font-mono">{formatINR(calculated.balancePaise)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-alif-border">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border hover:border-black"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveBill}
                className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-alif-black text-white hover:bg-zinc-800"
              >
                {isSaving ? 'Saving...' : 'Confirm & Save Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
