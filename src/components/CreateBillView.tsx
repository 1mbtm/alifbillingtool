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
  PAYMENT_METHOD_LABELS,
  rupeesToPaise
} from '../utils/currency';
import {
  createInvoice,
  generateId,
  getTodayIsoDate,
  previewNextInvoiceNumber
} from '../services/billingService';
import {
  deleteItemPhoto,
  saveItemPhotoFromFile
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
  notes: string;
  photoId?: string;
  photoDataUrl?: string;
}

interface CreateBillViewProps {
  customers: Customer[];
  catalogue: CatalogueItem[];
  settings: ShopSettings;
  preselectedCustomer?: Customer | null;
  onBillCreated: (invoice: Invoice) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

type BillStep = 1 | 2 | 3 | 4;

const STEP_LABELS: { step: BillStep; label: string }[] = [
  { step: 1, label: 'Items & Quantities' },
  { step: 2, label: 'Discount' },
  { step: 3, label: 'Customer Details' },
  { step: 4, label: 'Review & Save' }
];

export function CreateBillView({
  customers,
  catalogue,
  settings,
  preselectedCustomer,
  onBillCreated,
  onNotify
}: CreateBillViewProps) {
  const [currentStep, setCurrentStep] = useState<BillStep>(1);

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
  const [discountInput, setDiscountInput] = useState('');
  const [advanceInput, setAdvanceInput] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>(
    settings.defaultPaymentMethod || 'cash'
  );
  const [billNotes, setBillNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateId('idem'));
  const [isSaving, setIsSaving] = useState(false);

  const [previewPhoto, setPreviewPhoto] = useState<{
    itemName: string;
    dataUrl: string;
  } | null>(null);

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
        return item.name.toLowerCase().includes(q);
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
    setLines((prev) => [
      ...prev,
      {
        id: generateId('row'),
        catalogueItemId: item.id,
        name: item.name,
        category: item.category,
        quantity: '1',
        unit: item.unit,
        unitPriceRupees: '',
        costPricePaise: item.costPricePaise,
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
        name: '',
        category: 'custom',
        quantity: '1',
        unit: 'pc',
        unitPriceRupees: '',
        notes: ''
      }
    ]);
  }

  function updateLine(id: string, patch: Partial<DraftLineItem>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  async function removeLine(id: string) {
    const target = lines.find((l) => l.id === id);
    setLines((prev) => prev.filter((line) => line.id !== id));
    if (target?.photoId) {
      try {
        await deleteItemPhoto(target.photoId);
      } catch (_e) {
        // Ignore cleanup error
      }
    }
  }

  function moveLine(index: number, direction: -1 | 1) {
    setLines((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  }

  async function handlePhotoSelected(
    lineId: string,
    file: File | undefined,
    inputEl?: HTMLInputElement | null
  ) {
    if (!file) return;
    const currentLine = lines.find((l) => l.id === lineId);
    try {
      const savedPhoto = await saveItemPhotoFromFile({
        file,
        lineItemId: lineId,
        existingPhotoId: currentLine?.photoId
      });
      updateLine(lineId, {
        photoId: savedPhoto.id,
        photoDataUrl: savedPhoto.dataUrl
      });
      onNotify(`Attached photo to ${currentLine?.name || 'item'}`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not attach photo', true);
    } finally {
      if (inputEl) {
        inputEl.value = '';
      }
    }
  }

  async function handleRemovePhoto(lineId: string) {
    const currentLine = lines.find((l) => l.id === lineId);
    if (!currentLine?.photoId) return;
    const oldPhotoId = currentLine.photoId;
    updateLine(lineId, {
      photoId: undefined,
      photoDataUrl: undefined
    });
    try {
      await deleteItemPhoto(oldPhotoId);
      onNotify('Removed item photo');
    } catch (_err) {
      onNotify('Removed item photo');
    }
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

  function validateStep1(): string | null {
    if (calculated.parsedLines.length === 0) {
      return 'Please select at least one product or service.';
    }
    for (let i = 0; i < calculated.parsedLines.length; i++) {
      const l = calculated.parsedLines[i];
      if (!l.name.trim()) return `Item #${i + 1} requires a name.`;
      if (l.qty <= 0) return `Item "${l.name}" must have a quantity greater than 0.`;
      if (l.unitPriceRupees.trim() === '' || isNaN(Number(l.unitPriceRupees)) || l.unitPaise < 0) {
        return `Please enter a valid unit price for "${l.name}".`;
      }
    }
    return null;
  }

  function validateStep2(): string | null {
    if (discountInput.trim() !== '') {
      const num = Number(discountInput);
      if (isNaN(num) || num < 0) {
        return 'Discount cannot be negative.';
      }
      if (discountType === 'percent' && num > 100) {
        return 'Percentage discount cannot exceed 100%.';
      }
    }
    return null;
  }

  function validateStep3(): string | null {
    if (!customerName.trim()) return 'Please enter the customer name.';
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 6) {
      return 'Please enter a valid customer phone number (at least 6 digits).';
    }
    return null;
  }

  function validateForm(): string | null {
    const s1 = validateStep1();
    if (s1) return s1;
    const s2 = validateStep2();
    if (s2) return s2;
    const s3 = validateStep3();
    if (s3) return s3;
    if (calculated.advancePaise > calculated.totals.totalPaise) {
      return 'Advance received cannot exceed the final bill total.';
    }
    return null;
  }

  function handleContinue() {
    if (currentStep === 1) {
      const err = validateStep1();
      if (err) {
        onNotify(err, true);
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const err = validateStep2();
      if (err) {
        onNotify(err, true);
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      const err = validateStep3();
      if (err) {
        onNotify(err, true);
        return;
      }
      setCurrentStep(4);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as BillStep);
    }
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
          id: l.id,
          catalogueItemId: l.catalogueItemId,
          name: l.name.trim(),
          category: l.category,
          quantity: l.qty,
          unit: l.unit.trim() || 'pc',
          unitPricePaise: l.unitPaise,
          costPricePaise: l.costPricePaise,
          notes: l.notes.trim() || undefined,
          photoId: l.photoId
        })),
        discountType,
        discountValue: calculated.discountVal,
        advancePaise: calculated.advancePaise,
        advanceMethod,
        notes: billNotes.trim(),
        idempotencyKey
      });

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
      {/* Header & Step Progress Indicator */}
      <div className="border-b border-black pb-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-semibold text-alif-black">
            New Bill
          </h2>
          <div className="flex items-center gap-2">
            <span className="editorial-label">Invoice No</span>
            <span
              className="font-mono text-sm font-semibold px-3 py-1.5 border border-black bg-white text-alif-black"
              data-testid="next-invoice-number"
            >
              {previewNumber}
            </span>
          </div>
        </div>

        {/* Mobile-friendly 2x2 / Desktop 4-col Step Progress Indicator */}
        <div
          aria-label="Billing Steps"
          data-testid="step-progress-indicator"
          className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border bg-white"
        >
          {STEP_LABELS.map(({ step, label }) => {
            const isActive = currentStep === step;
            const isCompleted = currentStep > step;
            return (
              <div
                key={step}
                data-testid={`step-indicator-${step}`}
                className={`p-3 border-r border-b border-alif-border text-left transition ${
                  isActive
                    ? 'bg-alif-black text-white'
                    : isCompleted
                    ? 'bg-stone-50 text-alif-black'
                    : 'bg-white text-alif-grey'
                }`}
              >
                <div className="text-xs font-mono">
                  Step {step} of 4
                </div>
                <div className="text-sm font-semibold truncate mt-0.5">
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: Product/Service Selection + Quantity, Item Details & Optional Photo */}
      {currentStep === 1 && (
        <div className="space-y-8" data-testid="step-1-content">
          {/* 1. Product / Service Selection */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-alif-border pb-3">
              <h3 className="editorial-subhead">1. Select Product or Service</h3>

              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'service', 'product', 'custom'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    className={`px-3 py-2 text-sm border font-medium ${
                      catFilter === cat
                        ? 'bg-alif-black text-white border-black'
                        : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                    }`}
                  >
                    {cat === 'all'
                      ? 'All'
                      : cat === 'service'
                      ? 'Services'
                      : cat === 'product'
                      ? 'Materials'
                      : 'Custom'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="text"
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder="Filter"
                aria-label="Filter items"
                className="flex-1 px-3.5 py-2.5 text-base border border-alif-border bg-white"
              />
              <button
                type="button"
                onClick={addBlankCustomItem}
                data-testid="btn-add-custom-line"
                className="px-4 py-2.5 text-sm font-semibold bg-alif-charcoal text-white hover:bg-black"
              >
                + Custom Item
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 border-t border-l border-alif-border max-h-64 overflow-y-auto bg-white">
              {filteredCatalogue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addCatalogueItemToBill(item)}
                  data-testid={`pick-${item.id}`}
                  className="text-left px-3.5 py-3 border-r border-b border-alif-border bg-white hover:bg-alif-muted transition flex items-center justify-start min-h-[48px]"
                >
                  <span className="text-base font-medium text-alif-black truncate">
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Quantity, Item Details & Optional Item Photos */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black pb-3">
              <h3 className="editorial-subhead">
                2. Quantity &amp; Item Details ({lines.length})
              </h3>
              {lines.length > 0 && (
                <span className="font-mono text-base font-semibold text-alif-black">
                  Subtotal: {formatINR(calculated.totals.subtotalPaise)}
                </span>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="p-8 text-center border border-alif-border bg-white text-base text-alif-grey">
                Select a product or service above to begin.
              </div>
            ) : (
              <div className="bg-white border border-alif-border divide-y">
                {calculated.parsedLines.map((line, idx) => (
                  <div
                    key={line.id}
                    className="p-4 sm:p-5 space-y-4"
                    data-testid={`bill-line-${idx}`}
                  >
                    {/* Item Header with Photo Controls & Reorder/Remove */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold text-alif-black">
                          Item #{idx + 1}
                        </span>

                        {/* Hidden Camera & Gallery File Inputs */}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          id={`camera-file-${line.id}`}
                          data-testid={`input-camera-${idx}`}
                          onChange={(e) =>
                            handlePhotoSelected(line.id, e.target.files?.[0], e.target)
                          }
                          className="hidden"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          id={`gallery-file-${line.id}`}
                          data-testid={`input-photo-${idx}`}
                          onChange={(e) =>
                            handlePhotoSelected(line.id, e.target.files?.[0], e.target)
                          }
                          className="hidden"
                        />

                        {!line.photoDataUrl ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  `camera-file-${line.id}`
                                ) as HTMLInputElement | null;
                                el?.click();
                              }}
                              data-testid={`btn-camera-${idx}`}
                              className="px-3 py-2 text-sm font-medium border border-alif-border bg-stone-50 text-alif-black hover:border-black"
                              title="Capture or attach item photo"
                            >
                              <svg
                                className="w-4 h-4 shrink-0"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              >
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              <span>Photo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  `gallery-file-${line.id}`
                                ) as HTMLInputElement | null;
                                el?.click();
                              }}
                              data-testid={`btn-gallery-${idx}`}
                              className="px-3 py-2 text-sm border border-alif-border bg-white text-alif-charcoal hover:border-black"
                              title="Choose existing image from gallery"
                            >
                              Gallery
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  itemName: line.name || `Item #${idx + 1}`,
                                  dataUrl: line.photoDataUrl!
                                })
                              }
                              data-testid={`btn-preview-photo-${idx}`}
                              className="p-1 border border-black bg-white"
                              title="Preview attached photo"
                            >
                              <img
                                src={line.photoDataUrl}
                                alt={`${line.name || 'Item'} thumbnail`}
                                data-testid={`thumb-photo-${idx}`}
                                className="w-12 h-12 object-cover block"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  `gallery-file-${line.id}`
                                ) as HTMLInputElement | null;
                                el?.click();
                              }}
                              data-testid={`btn-replace-photo-${idx}`}
                              className="px-3 py-2 text-sm border border-alif-border bg-white text-alif-black hover:border-black"
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(line.id)}
                              data-testid={`btn-remove-photo-${idx}`}
                              className="px-3 py-2 text-sm border border-alif-border bg-white text-alif-grey hover:text-alif-black"
                            >
                              Remove Photo
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {lines.length > 1 && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveLine(idx, -1)}
                              data-testid={`btn-move-up-${idx}`}
                              className="px-3 py-2 text-sm border border-alif-border bg-white text-alif-charcoal hover:border-black"
                              title="Move item up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === lines.length - 1}
                              onClick={() => moveLine(idx, 1)}
                              data-testid={`btn-move-down-${idx}`}
                              className="px-3 py-2 text-sm border border-alif-border bg-white text-alif-charcoal hover:border-black"
                              title="Move item down"
                            >
                              ↓
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          data-testid={`btn-remove-line-${idx}`}
                          className="px-3 py-2 text-sm text-alif-grey hover:text-alif-black border border-alif-border"
                          title="Remove item"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Item Form Fields (16–20px gap) */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start">
                      <div className="sm:col-span-2">
                        <label className="block editorial-label mb-1.5">
                          Product / Service Name *
                        </label>
                        <input
                          type="text"
                          value={line.name}
                          onChange={(e) => updateLine(line.id, { name: e.target.value })}
                          data-testid={`line-name-${idx}`}
                          className="w-full px-3.5 py-2.5 text-base font-medium border border-alif-border bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block editorial-label mb-1.5">
                            Qty ({line.unit}) *
                          </label>
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                            data-testid={`line-qty-${idx}`}
                            className="w-full px-3 py-2.5 text-base font-mono border border-alif-border bg-white"
                          />
                        </div>

                        <div>
                          <label className="block editorial-label mb-1.5">
                            Unit Price (₹) *
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.unitPriceRupees}
                            onChange={(e) => updateLine(line.id, { unitPriceRupees: e.target.value })}
                            data-testid={`line-price-${idx}`}
                            className="w-full px-3 py-2.5 text-base font-mono border border-alif-border bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-6">
                        <div className="text-left sm:text-right">
                          <div className="editorial-label">Line Total</div>
                          <div
                            className="text-base font-mono font-semibold text-alif-black mt-0.5"
                            data-testid={`line-total-${idx}`}
                          >
                            {formatINR(line.lineTotalPaise)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block editorial-label mb-1.5">
                        Item Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={line.notes}
                        onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-stone-50 text-alif-charcoal"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex justify-end pt-3 border-t border-alif-border">
            <button
              type="button"
              onClick={handleContinue}
              data-testid="btn-step-continue"
              className="w-full sm:w-auto px-6 py-3 bg-alif-black text-white text-base font-semibold hover:bg-zinc-800"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Discount */}
      {currentStep === 2 && (
        <div className="space-y-8" data-testid="step-2-content">
          <section className="space-y-5">
            <div className="border-b border-alif-border pb-3">
              <h3 className="editorial-subhead">3. Apply Discount</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="block editorial-label mb-1.5">
                  Discount Type
                </label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                  data-testid="select-discount-type"
                  className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-white"
                >
                  <option value="flat">Flat Amount (₹)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
              </div>

              <div>
                <label className="block editorial-label mb-1.5">
                  Discount ({discountType === 'flat' ? '₹' : '%'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  data-testid="input-discount-value"
                  className="w-full px-3.5 py-2.5 text-base font-mono border border-alif-border bg-white"
                />
              </div>
            </div>

            <div className="border border-alif-border bg-white p-4 max-w-xl space-y-2.5 text-base">
              <div className="flex justify-between">
                <span className="text-alif-grey">Subtotal</span>
                <span className="font-mono text-alif-black" data-testid="summary-subtotal">
                  {formatINR(calculated.totals.subtotalPaise)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-alif-grey">Discount</span>
                <span className="font-mono text-alif-charcoal" data-testid="summary-discount">
                  - {formatINR(calculated.totals.discountPaise)}
                </span>
              </div>
              <div className="flex justify-between pt-2.5 border-t border-alif-border font-semibold text-alif-black">
                <span>Total After Discount</span>
                <span className="font-mono">{formatINR(calculated.totals.totalPaise)}</span>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-alif-border">
            <button
              type="button"
              onClick={handleBack}
              data-testid="btn-step-back"
              className="px-5 py-3 border border-black bg-white text-alif-black text-base font-semibold hover:bg-alif-muted"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              data-testid="btn-step-continue"
              className="px-6 py-3 bg-alif-black text-white text-base font-semibold hover:bg-zinc-800"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Customer Name and Contact Information */}
      {currentStep === 3 && (
        <div className="space-y-8" data-testid="step-3-content">
          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-alif-border pb-3">
              <h3 className="editorial-subhead">4. Customer Details</h3>
              {customers.length > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search saved customer"
                    aria-label="Search saved customer"
                    className="px-3.5 py-2 text-base border border-alif-border bg-white"
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
                      className="text-sm text-alif-grey underline px-2 py-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {filteredCustomers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectExistingCustomer(c)}
                    className={`px-3.5 py-2 text-sm border transition ${
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block editorial-label mb-1.5">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  data-testid="input-customer-name"
                  className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-white"
                />
              </div>

              <div>
                <label className="block editorial-label mb-1.5">
                  Phone / WhatsApp *
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  data-testid="input-customer-phone"
                  className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-white font-mono"
                />
              </div>

              <div>
                <label className="block editorial-label mb-1.5">
                  Bill Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-white font-mono"
                />
              </div>

              <div>
                <label className="block editorial-label mb-1.5">
                  Collection Date (Optional)
                </label>
                <input
                  type="date"
                  value={collectionDate}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  data-testid="input-collection-date"
                  className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block editorial-label mb-1.5">
                Order Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={billNotes}
                onChange={(e) => setBillNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-white"
              />
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-alif-border">
            <button
              type="button"
              onClick={handleBack}
              data-testid="btn-step-back"
              className="px-5 py-3 border border-black bg-white text-alif-black text-base font-semibold hover:bg-alif-muted"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              data-testid="btn-step-continue"
              className="px-6 py-3 bg-alif-black text-white text-base font-semibold hover:bg-zinc-800"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Review the Bill Total and Final Save Action */}
      {currentStep === 4 && (
        <div className="space-y-8" data-testid="step-4-content">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Review Items, Customer & Advance Input */}
            <div className="space-y-4">
              <div className="border-b border-alif-border pb-3">
                <h3 className="editorial-subhead">5. Review Details &amp; Payment</h3>
              </div>

              <div className="border border-alif-border bg-white p-4 space-y-2 text-base">
                <div className="flex justify-between gap-2">
                  <span className="editorial-label">Customer</span>
                  <span className="font-medium text-alif-black text-right">
                    {customerName} ({customerPhone})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="editorial-label">Bill Date</span>
                  <span className="font-mono text-alif-charcoal">{invoiceDate}</span>
                </div>
                {collectionDate && (
                  <div className="flex justify-between gap-2">
                    <span className="editorial-label">Collection Date</span>
                    <span className="font-mono text-alif-charcoal">{collectionDate}</span>
                  </div>
                )}
              </div>

              <div className="border border-alif-border bg-white divide-y text-base">
                {calculated.parsedLines.map((l, i) => (
                  <div key={l.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {l.photoDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewPhoto({
                              itemName: l.name,
                              dataUrl: l.photoDataUrl!
                            })
                          }
                          className="p-0.5 border border-alif-border bg-white shrink-0"
                        >
                          <img
                            src={l.photoDataUrl}
                            alt={l.name}
                            className="w-11 h-11 object-cover block"
                          />
                        </button>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-alif-black truncate">
                          {i + 1}. {l.name}
                        </div>
                        <div className="text-sm text-alif-grey font-mono">
                          {l.qty} {l.unit} × {formatINR(l.unitPaise)}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-alif-black shrink-0">
                      {formatINR(l.lineTotalPaise)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block editorial-label mb-1.5">
                    Advance Received (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={advanceInput}
                    onChange={(e) => setAdvanceInput(e.target.value)}
                    data-testid="input-advance-amount"
                    className="w-full px-3.5 py-2.5 text-base font-mono border border-alif-border bg-white"
                  />
                </div>

                <div>
                  <label className="block editorial-label mb-1.5">
                    Payment Method
                  </label>
                  <select
                    value={advanceMethod}
                    onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
                    data-testid="select-advance-method"
                    className="w-full px-3.5 py-2.5 text-base border border-alif-border bg-white"
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
            </div>

            {/* Final Bill Total & Save Action */}
            <div className="bg-white border border-black p-5 flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-alif-border pb-3">
                  <span className="editorial-label">Bill Summary</span>
                  <span className="font-mono text-sm font-semibold text-alif-black">
                    {previewNumber}
                  </span>
                </div>

                <div className="flex items-center justify-between text-base">
                  <span className="text-alif-grey">Subtotal</span>
                  <span className="font-mono text-alif-black" data-testid="summary-subtotal">
                    {formatINR(calculated.totals.subtotalPaise)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-base">
                  <span className="text-alif-grey">Discount</span>
                  <span className="font-mono text-alif-charcoal" data-testid="summary-discount">
                    - {formatINR(calculated.totals.discountPaise)}
                  </span>
                </div>

                {settings.taxEnabled && calculated.totals.taxPaise > 0 && (
                  <div className="flex items-center justify-between text-base">
                    <span className="text-alif-grey">
                      {settings.taxLabel || 'Tax'} ({settings.taxRatePercent}%)
                    </span>
                    <span className="font-mono text-alif-charcoal">
                      + {formatINR(calculated.totals.taxPaise)}
                    </span>
                  </div>
                )}

                <div className="border-t border-black pt-3 flex items-baseline justify-between">
                  <span className="text-base font-semibold text-alif-black">
                    Final Total
                  </span>
                  <span
                    className="text-xl font-mono font-semibold text-alif-black"
                    data-testid="summary-final-total"
                  >
                    {formatINR(calculated.totals.totalPaise)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-base pt-1">
                  <span className="text-alif-grey">
                    Advance ({PAYMENT_METHOD_LABELS[advanceMethod]})
                  </span>
                  <span className="font-mono font-medium text-alif-black">
                    {formatINR(calculated.advancePaise)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-2.5 border-t border-alif-border">
                  <span className="text-base font-semibold text-alif-charcoal">
                    Balance Due
                  </span>
                  <span
                    className="font-mono text-lg font-semibold text-alif-black"
                    data-testid="summary-balance-due"
                  >
                    {formatINR(calculated.balancePaise)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm pt-1 text-alif-grey">
                  <span>Status</span>
                  <span className="font-semibold text-alif-black">{calculated.status}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-4 border-t border-alif-border">
                <button
                  type="button"
                  onClick={handleBack}
                  data-testid="btn-step-back"
                  className="px-5 py-3 border border-black bg-white text-alif-black text-base font-semibold hover:bg-alif-muted"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveBill}
                  data-testid="btn-save-bill"
                  className="flex-1 py-3 px-5 bg-alif-black text-white text-base font-semibold hover:bg-zinc-800"
                >
                  {isSaving ? 'Saving...' : 'Save Bill'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="modal-photo-preview"
        >
          <div className="bg-white border border-black max-w-md w-full p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-alif-border pb-3">
              <h4 className="text-base font-semibold text-alif-black truncate">
                {previewPhoto.itemName}
              </h4>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                data-testid="btn-close-photo-preview"
                className="px-3 py-1.5 text-sm border border-alif-border text-alif-black hover:border-black"
              >
                Close ✕
              </button>
            </div>
            <div className="bg-stone-50 border border-alif-border p-2 flex items-center justify-center">
              <img
                src={previewPhoto.dataUrl}
                alt={previewPhoto.itemName}
                className="max-h-80 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
