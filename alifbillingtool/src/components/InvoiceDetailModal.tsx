import React, { useEffect, useState } from 'react';
import {
  DiscountType,
  Invoice,
  ItemPhotoRecord,
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
  buildShareBillText,
  downloadInvoicePdf,
  GeneratedBillImage,
  generateInvoiceBillImage,
  resolveInvoiceFooterText,
  shareBillViaSms,
  shareBillViaWhatsApp,
  UnifiedShareOutcome,
  validateShareContentSelection
} from '../utils/pdf';
import {
  cancelInvoice,
  getInvoiceDetails,
  getItemPhotosMap,
  getTodayIsoDate,
  recordInvoicePayment,
  reopenAndUpdateInvoice,
  saveItemPhotoFromFile
} from '../services/billingService';
import { AlifBrandMark, ConfirmDialog, StatusBadge } from './StatusBadge';

interface InvoiceDetailModalProps {
  invoiceId: string;
  settings: ShopSettings;
  initialOpenSharePanel?: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function InvoiceDetailModal({
  invoiceId,
  settings,
  initialOpenSharePanel = false,
  onClose,
  onUpdated,
  onNotify
}: InvoiceDetailModalProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [photosMap, setPhotosMap] = useState<Record<string, ItemPhotoRecord>>({});
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
      inventoryVariantId?: string | null;
      isNonStock?: boolean;
      name: string;
      category: any;
      quantity: string;
      unit: string;
      unitPriceRupees: string;
      costPricePaise?: number;
      notes: string;
      photoId?: string;
      photoDataUrl?: string;
    }[]
  >([]);
  const [editDiscountType, setEditDiscountType] = useState<DiscountType>('flat');
  const [editDiscountValue, setEditDiscountValue] = useState('0');
  const [editCollectionDate, setEditCollectionDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmReopenOpen, setConfirmReopenOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{
    itemName: string;
    dataUrl: string;
  } | null>(null);

  // Simplified 3-Action Bill Sharing state (Both checkboxes checked by default)
  const [includeBillImage, setIncludeBillImage] = useState<boolean>(true);
  const [includeBillText, setIncludeBillText] = useState<boolean>(true);
  const [includePhotosInBillImage, setIncludePhotosInBillImage] = useState<boolean>(true);
  const [showImagePreview, setShowImagePreview] = useState<boolean>(initialOpenSharePanel);
  const [generatedBillImage, setGeneratedBillImage] = useState<GeneratedBillImage | null>(null);
  const [generatingImage, setGeneratingImage] = useState<boolean>(false);
  const [shareMessageText, setShareMessageText] = useState<string>('');
  const [shareOutcome, setShareOutcome] = useState<UnifiedShareOutcome | null>(null);
  const [shareValidationError, setShareValidationError] = useState<string | null>(null);
  const [sharingInProgress, setSharingInProgress] = useState<boolean>(false);

  async function loadDetails() {
    setLoading(true);
    try {
      const data = await getInvoiceDetails(invoiceId);
      setInvoice(data.invoice);
      setPayments(data.payments);

      const photoIds = data.invoice.items
        .map((it) => it.photoId)
        .filter((id): id is string => Boolean(id));
      const loadedPhotos = await getItemPhotosMap(photoIds);
      setPhotosMap(loadedPhotos);

      setShareMessageText(buildShareBillText(data.invoice, settings));
      setShareOutcome(null);
      setShareValidationError(null);

      setPayAmountRupees('');
      setEditLines(
        data.invoice.items.map((it) => ({
          id: it.id,
          catalogueItemId: it.catalogueItemId,
          inventoryVariantId: it.inventoryVariantId,
          isNonStock: it.isNonStock,
          name: it.name,
          category: it.category,
          quantity: String(it.quantity),
          unit: it.unit,
          unitPriceRupees: paiseToRupeesString(it.unitPricePaise),
          costPricePaise: it.costPricePaise,
          notes: it.notes || '',
          photoId: it.photoId,
          photoDataUrl: it.photoId ? loadedPhotos[it.photoId]?.dataUrl : undefined
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

  useEffect(() => {
    if (initialOpenSharePanel) {
      setShowImagePreview(true);
    }
  }, [initialOpenSharePanel]);

  // Generate high-resolution bill image whenever Bill Image is selected
  useEffect(() => {
    let active = true;
    if (!invoice || !includeBillImage) return;

    setGeneratingImage(true);
    generateInvoiceBillImage(invoice, payments, settings, {
      photosMap,
      includePhotos: includePhotosInBillImage,
      format: 'image/png'
    })
      .then((img) => {
        if (active) {
          setGeneratedBillImage(img);
        }
      })
      .catch((err: any) => {
        if (active) {
          onNotify(err?.message || 'Failed to generate bill image', true);
        }
      })
      .finally(() => {
        if (active) {
          setGeneratingImage(false);
        }
      });

    return () => {
      active = false;
    };
  }, [invoice, payments, settings, photosMap, includePhotosInBillImage, includeBillImage]);

  if (loading || !invoice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 alif-modal-backdrop">
        <div className="bg-white border-2 border-black p-6 text-base font-semibold flex items-center gap-3 alif-modal-panel">
          <AlifBrandMark size="sm" testId="modal-loading-logo" />
          <span>Loading invoice receipt...</span>
        </div>
      </div>
    );
  }

  function handleToggleIncludeImage(checked: boolean) {
    setIncludeBillImage(checked);
    setShareOutcome(null);
    if (!checked && !includeBillText) {
      setShareValidationError(
        'Please select at least one option to share: Bill Image or Bill Summary Text.'
      );
    } else {
      setShareValidationError(null);
    }
  }

  function handleToggleIncludeText(checked: boolean) {
    setIncludeBillText(checked);
    setShareOutcome(null);
    if (!checked && !includeBillImage) {
      setShareValidationError(
        'Please select at least one option to share: Bill Image or Bill Summary Text.'
      );
    } else {
      setShareValidationError(null);
    }
  }

  async function handleShareWhatsApp() {
    if (!invoice || sharingInProgress) return;
    const err = validateShareContentSelection({
      includeImage: includeBillImage,
      includeText: includeBillText
    });
    if (err) {
      setShareValidationError(err);
      onNotify(err, true);
      return;
    }

    setShareValidationError(null);
    setSharingInProgress(true);
    try {
      const outcome = await shareBillViaWhatsApp({
        invoice,
        payments,
        settings,
        includeImage: includeBillImage,
        includeText: includeBillText,
        customText: shareMessageText,
        billImage: generatedBillImage,
        photosMap,
        includePhotos: includePhotosInBillImage
      });
      setShareOutcome(outcome);
      onNotify(outcome.statusMessage);
    } catch (e: any) {
      const msg = e?.message || 'Could not share via WhatsApp';
      setShareValidationError(msg);
      onNotify(msg, true);
    } finally {
      setSharingInProgress(false);
    }
  }

  async function handleShareSms(
    resolution: 'prompt' | 'text-only' | 'download-image-and-sms' = 'prompt'
  ) {
    if (!invoice || sharingInProgress) return;
    const err = validateShareContentSelection({
      includeImage: includeBillImage,
      includeText: includeBillText
    });
    if (err) {
      setShareValidationError(err);
      onNotify(err, true);
      return;
    }

    setShareValidationError(null);
    setSharingInProgress(true);
    try {
      const outcome = await shareBillViaSms({
        invoice,
        payments,
        settings,
        includeImage: includeBillImage,
        includeText: includeBillText,
        customText: shareMessageText,
        billImage: generatedBillImage,
        photosMap,
        includePhotos: includePhotosInBillImage,
        resolution
      });
      setShareOutcome(outcome);
      onNotify(outcome.statusMessage, Boolean(outcome.smsImageLimitation && resolution === 'prompt'));
    } catch (e: any) {
      const msg = e?.message || 'Could not open SMS composer';
      setShareValidationError(msg);
      onNotify(msg, true);
    } finally {
      setSharingInProgress(false);
    }
  }

  function handleDownloadPdf() {
    if (!invoice) return;
    const filename = downloadInvoicePdf(invoice, payments, settings);
    onNotify(`Downloaded ${filename}`);
  }

  async function handleEditLinePhoto(idx: number, file: File | undefined) {
    if (!file || !invoice) return;
    const target = editLines[idx];
    if (!target) return;
    try {
      const savedPhoto = await saveItemPhotoFromFile({
        file,
        lineItemId: target.id,
        invoiceId: invoice.id,
        existingPhotoId: target.photoId
      });
      const copy = [...editLines];
      copy[idx] = {
        ...copy[idx],
        photoId: savedPhoto.id,
        photoDataUrl: savedPhoto.dataUrl
      };
      setEditLines(copy);
      setPhotosMap((prev) => ({ ...prev, [savedPhoto.id]: savedPhoto }));
      onNotify(`Attached photo to ${target.name || 'item'}`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not attach photo', true);
    }
  }

  function handleRemoveEditLinePhoto(idx: number) {
    const copy = [...editLines];
    copy[idx] = {
      ...copy[idx],
      photoId: undefined,
      photoDataUrl: undefined
    };
    setEditLines(copy);
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
      setShareMessageText(buildShareBillText(res.invoice, settings));
      setPayNote('');
      setPayAmountRupees('');
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
      setShareMessageText(buildShareBillText(updated, settings));
      setShowCancelPrompt(false);
      setCancelReason('');
      onUpdated();
      onNotify(`Cancelled invoice ${updated.invoiceNumber} and restored eligible stock`);
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
        inventoryVariantId: l.inventoryVariantId,
        isNonStock: l.isNonStock,
        name: l.name.trim(),
        category: l.category,
        quantity: Number(l.quantity) || 1,
        unit: l.unit.trim() || 'pc',
        unitPricePaise: rupeesToPaise(l.unitPriceRupees || '0'),
        costPricePaise: l.costPricePaise,
        notes: l.notes.trim() || undefined,
        photoId: l.photoId
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
      setShareMessageText(buildShareBillText(updated, settings));
      const photoIds = updated.items
        .map((it) => it.photoId)
        .filter((id): id is string => Boolean(id));
      const refreshedPhotos = await getItemPhotosMap(photoIds);
      setPhotosMap(refreshedPhotos);
      setIsEditingBill(false);
      setConfirmReopenOpen(false);
      onUpdated();
      onNotify(`Updated & reconciled invoice ${updated.invoiceNumber}`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to update invoice', true);
    }
  }

  const attachedPhotoCount = Object.keys(photosMap).length;
  const bothUnchecked = !includeBillImage && !includeBillText;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4 alif-modal-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border-2 border-black max-w-3xl w-full max-h-[92vh] overflow-y-auto p-3.5 sm:p-6 space-y-5 alif-modal-panel">
        {/* Print-Like Boutique Receipt Masthead */}
        <div className="flex items-start justify-between gap-3 border-b border-black pb-3.5">
          <div className="flex items-start gap-3 min-w-0">
            <AlifBrandMark size="md" testId="modal-logo-mark" className="mt-0.5" />
            <div className="space-y-1 min-w-0">
              <div className="editorial-label">
                {settings.shopName} • {settings.city}, {settings.state}
              </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-lg sm:text-xl font-bold text-alif-black">
                {invoice.invoiceNumber}
              </span>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-xs font-mono text-alif-grey">
              Issued: {invoice.invoiceDate}
              {invoice.collectionDate ? `  |  Collection: ${invoice.collectionDate}` : ''}
            </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-close-invoice-modal"
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-black bg-white text-alif-black hover:bg-stone-50 min-h-[40px]"
          >
            Close ✕
          </button>
        </div>

        {/* Cancelled Notice */}
        {invoice.status === 'Cancelled' && (
          <div className="bg-stone-50 border border-black p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-alif-black">
              <span className="font-semibold">Cancelled Bill:</span>{' '}
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
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-white text-alif-black border border-black hover:bg-stone-100 shrink-0"
            >
              Reopen Invoice
            </button>
          </div>
        )}

        {/* Promoted Financial Hierarchy Grid (Visible at top without scrolling) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border text-sm bg-white">
          <div className="p-3 border-r border-b border-alif-border">
            <div className="editorial-label">Subtotal</div>
            <div className="font-mono font-semibold text-base mt-0.5">
              {formatINR(invoice.subtotalPaise)}
            </div>
          </div>
          <div className="p-3 border-r border-b border-alif-border">
            <div className="editorial-label">Discount</div>
            <div className="font-mono font-semibold text-base mt-0.5">
              - {formatINR(invoice.discountPaise)}
            </div>
          </div>
          <div className="p-3 border-r border-b border-alif-border bg-stone-50">
            <div className="editorial-label text-alif-charcoal">Final Total</div>
            <div
              className="font-mono font-bold text-lg text-alif-black mt-0.5"
              data-testid="detail-total"
            >
              {formatINR(invoice.totalPaise)}
            </div>
          </div>
          <div className="p-3 border-r border-b border-alif-border bg-stone-100">
            <div className="editorial-label text-alif-black">Balance Due</div>
            <div
              className="font-mono font-bold text-lg text-alif-black mt-0.5"
              data-testid="detail-balance"
            >
              {formatINR(invoice.balancePaise)}
            </div>
          </div>
        </div>

        {/* Simplified 3-Action Bill Sharing Section (ONLY WhatsApp, SMS, Download Bill PDF) */}
        <section
          data-testid="share-bill-section"
          className="border-2 border-black bg-stone-50 p-3.5 sm:p-4 space-y-3.5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-alif-border pb-2.5">
            <div>
              <div className="editorial-label">Share &amp; Export Bill</div>
              <h3 className="editorial-subhead mt-0.5">
                Choose Content &amp; Share Channel
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowImagePreview((prev) => !prev)}
              data-testid="btn-toggle-bill-preview"
              className="btn-inline text-xs font-semibold uppercase tracking-wider text-alif-charcoal underline self-start sm:self-auto"
            >
              {showImagePreview ? 'Hide Preview & Text ▲' : 'Preview Image & Edit Text ▼'}
            </button>
          </div>

          {/* Content Selection Checkboxes (Both checked by default) */}
          <div className="flex flex-wrap items-center gap-4 bg-white border border-alif-border px-3.5 py-2.5">
            <span className="editorial-label text-alif-black">Include when sharing:</span>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-alif-black cursor-pointer select-none min-h-[36px]">
              <input
                type="checkbox"
                checked={includeBillImage}
                onChange={(e) => handleToggleIncludeImage(e.target.checked)}
                data-testid="checkbox-share-bill-image"
                className="w-4 h-4 accent-black"
              />
              <span>Bill Image</span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm font-medium text-alif-black cursor-pointer select-none min-h-[36px]">
              <input
                type="checkbox"
                checked={includeBillText}
                onChange={(e) => handleToggleIncludeText(e.target.checked)}
                data-testid="checkbox-share-bill-text"
                className="w-4 h-4 accent-black"
              />
              <span>Bill Summary Text</span>
            </label>

            {includeBillImage && attachedPhotoCount > 0 && (
              <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-alif-charcoal cursor-pointer select-none ml-auto">
                <input
                  type="checkbox"
                  checked={includePhotosInBillImage}
                  onChange={(e) => setIncludePhotosInBillImage(e.target.checked)}
                  data-testid="toggle-share-photos"
                  className="w-4 h-4 accent-black"
                />
                <span>Include Item Photos ({attachedPhotoCount})</span>
              </label>
            )}
          </div>

          {/* Validation message if both checkboxes are unchecked */}
          {(bothUnchecked || shareValidationError) && (
            <div
              role="alert"
              data-testid="share-validation-error"
              className="p-2.5 bg-white border-l-4 border-black text-xs font-semibold text-alif-black"
            >
              {shareValidationError ||
                'Please select at least one option to share: Bill Image or Bill Summary Text.'}
            </div>
          )}

          {/* ONLY 3 Sharing Action Buttons: WhatsApp, SMS, Download Bill PDF */}
          <div
            data-testid="share-actions-bar"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
          >
            <button
              type="button"
              disabled={sharingInProgress}
              onClick={handleShareWhatsApp}
              data-testid="btn-share-whatsapp"
              className="px-4 py-3 bg-alif-black text-white border border-black text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800 transition min-h-[44px]"
            >
              WhatsApp
            </button>

            <button
              type="button"
              disabled={sharingInProgress}
              onClick={() => handleShareSms('prompt')}
              data-testid="btn-share-sms"
              className="px-4 py-3 bg-white text-alif-black border border-black text-xs font-semibold uppercase tracking-wider hover:bg-stone-100 transition min-h-[44px]"
            >
              SMS
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              data-testid="btn-download-pdf"
              className="px-4 py-3 bg-white text-alif-charcoal border border-alif-border text-xs font-semibold uppercase tracking-wider hover:border-black transition min-h-[44px]"
            >
              Download Bill PDF
            </button>
          </div>

          {/* SMS + Bill Image Limitation Prompt (Never silently drops Bill Image) */}
          {shareOutcome?.smsImageLimitation &&
            shareOutcome.method === 'sms-image-limitation-prompt' && (
              <div
                data-testid="sms-image-limitation-box"
                className="bg-white border-2 border-black p-3.5 space-y-2.5 text-xs text-alif-black"
              >
                <div className="font-semibold uppercase tracking-wider">
                  SMS Cannot Attach Bill Images Directly
                </div>
                <p className="text-alif-charcoal leading-relaxed">
                  Ordinary phone SMS (<code>sms:</code>) only supports plain text and cannot
                  automatically attach the{' '}
                  <span className="font-ubuntu font-medium lowercase">alif.</span> bill image
                  like WhatsApp does. Also note that mobile browsers open your SMS composer
                  rather than sending SMS silently in the background.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleShareSms('text-only')}
                    data-testid="btn-sms-confirm-text-only"
                    className="px-3 py-2 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800"
                  >
                    Open SMS with Summary Text Only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareSms('download-image-and-sms')}
                    data-testid="btn-sms-download-image-and-open"
                    className="px-3 py-2 bg-white text-alif-black border border-black text-xs font-semibold uppercase tracking-wider hover:bg-stone-50"
                  >
                    Save Image + Open SMS Text
                  </button>
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    data-testid="btn-sms-switch-to-whatsapp"
                    className="px-3 py-2 bg-stone-100 text-alif-charcoal border border-alif-border text-xs font-semibold uppercase tracking-wider hover:border-black"
                  >
                    Share Image on WhatsApp Instead
                  </button>
                </div>
              </div>
            )}

          {/* Share Status / Instructions Banner */}
          {shareOutcome &&
            shareOutcome.method !== 'sms-image-limitation-prompt' && (
              <div
                data-testid="share-fallback-instructions"
                className="bg-white border border-black p-3 space-y-1 text-xs text-alif-black"
              >
                <div className="font-semibold">
                  {shareOutcome.channel === 'sms'
                    ? 'SMS Composer Opened (Review & Tap Send in SMS App)'
                    : shareOutcome.manualAttachRequired
                    ? 'Manual Image Attachment Required in WhatsApp'
                    : 'Complete Sending in WhatsApp'}
                </div>
                <p className="text-alif-charcoal leading-relaxed">
                  {shareOutcome.instructions}
                </p>
              </div>
            )}

          {/* Collapsible Preview & Editable Summary Text */}
          {showImagePreview && (
            <div
              data-testid="share-bill-panel"
              className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pt-2 border-t border-alif-border"
            >
              {/* Left Column: Generated Bill Image Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="editorial-label">Generated Bill Image Preview</span>
                  {generatedBillImage && (
                    <span
                      data-testid="share-bill-dimensions"
                      className="text-xs font-mono text-alif-grey"
                    >
                      {generatedBillImage.width}×{generatedBillImage.height}px
                    </span>
                  )}
                </div>

                <div className="bg-white border border-alif-border p-2 max-h-80 overflow-y-auto flex items-center justify-center">
                  {!includeBillImage ? (
                    <div className="py-8 text-xs text-alif-grey text-center">
                      Bill Image is unchecked (sharing text summary only).
                    </div>
                  ) : generatingImage || !generatedBillImage ? (
                    <div className="py-8 text-xs text-alif-grey">
                      Rendering bill image...
                    </div>
                  ) : (
                    <img
                      src={generatedBillImage.dataUrl}
                      alt={`Bill ${invoice.invoiceNumber} for ${invoice.customerName}`}
                      data-testid="share-bill-preview-img"
                      className="w-full h-auto block border border-alif-border"
                    />
                  )}
                </div>
              </div>

              {/* Right Column: Editable Summary Text */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="share-whatsapp-message" className="editorial-label">
                    Editable Bill Summary Text
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setShareMessageText(buildShareBillText(invoice, settings))
                    }
                    data-testid="btn-reset-share-message"
                    className="btn-inline text-xs font-semibold text-alif-charcoal hover:text-alif-black underline"
                  >
                    Reset Text
                  </button>
                </div>
                <textarea
                  id="share-whatsapp-message"
                  rows={6}
                  value={shareMessageText}
                  onChange={(e) => setShareMessageText(e.target.value)}
                  data-testid="textarea-share-message"
                  className="w-full px-3 py-2 text-sm font-mono bg-white text-alif-black leading-relaxed"
                />
                <p className="text-xs text-alif-grey">
                  Used when <strong>Bill Summary Text</strong> is checked for WhatsApp or SMS.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Record Payment, Refund or Correction */}
        <form
          onSubmit={handleRecordPayment}
          className="border border-black p-3.5 sm:p-4 space-y-3.5 bg-stone-50"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-alif-border pb-2.5">
            <h4 className="editorial-subhead">Record Payment, Refund or Correction</h4>
            <div className="flex flex-wrap gap-1.5">
              {(['payment', 'refund', 'correction'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPayType(t)}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider border font-semibold min-h-[38px] ${
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

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block editorial-label mb-1">Amount (₹) *</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={payAmountRupees}
                  onChange={(e) => setPayAmountRupees(e.target.value)}
                  data-testid="input-record-payment-amount"
                  className="w-full px-3 py-2 text-base font-mono font-semibold bg-white"
                />
                {payType === 'payment' && invoice.balancePaise > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayAmountRupees(paiseToRupeesString(invoice.balancePaise))}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wider border border-black bg-white hover:bg-stone-100 shrink-0"
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
                className="w-full px-3 py-2 text-base bg-white"
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
                className="w-full px-3 py-2 text-base font-mono bg-white"
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
                placeholder={payType !== 'payment' ? 'Required reason' : 'Optional note'}
                data-testid="input-record-payment-note"
                className="w-full px-3 py-2 text-base bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingPay}
              data-testid="btn-submit-payment"
              className="px-5 py-2.5 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800"
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

        {/* Receipt Body: Client & Itemised Garment Table */}
        <div className="border border-alif-border">
          <div className="bg-stone-50 px-4 py-2.5 border-b border-alif-border flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm sm:text-base">
              <span className="editorial-label mr-2">Client</span>
              <span className="font-semibold text-alif-black">{invoice.customerName}</span>
              <span className="font-mono text-xs text-alif-grey ml-2">{invoice.customerPhone}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingBill(!isEditingBill)}
              data-testid="btn-toggle-edit-bill"
              className="btn-inline text-xs font-semibold uppercase tracking-wider text-alif-black underline"
            >
              {isEditingBill ? 'Cancel Editing' : 'Edit / Reopen Bill Items'}
            </button>
          </div>

          {!isEditingBill ? (
            <div className="p-3.5 sm:p-4 space-y-3">
              <div className="divide-y">
                {invoice.items.map((item, idx) => {
                  const photoRec = item.photoId ? photosMap[item.photoId] : undefined;
                  return (
                    <div
                      key={item.id}
                      className="py-2.5 flex items-start justify-between gap-3 text-sm sm:text-base"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {photoRec && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewPhoto({
                                itemName: item.name,
                                dataUrl: photoRec.dataUrl
                              })
                            }
                            data-testid={`detail-item-photo-btn-${idx}`}
                            className="p-0.5 border border-black bg-white shrink-0 min-h-0"
                            title="View attached item photo"
                          >
                            <img
                              src={photoRec.dataUrl}
                              alt={item.name}
                              data-testid={`detail-item-thumb-${idx}`}
                              className="w-11 h-11 object-cover block"
                            />
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-alif-black">
                            {idx + 1}. {item.name}{' '}
                            <span className="text-xs text-alif-grey ml-1">
                              [{item.category}]
                            </span>
                          </div>
                          <div className="font-mono text-xs text-alif-grey mt-0.5">
                            {item.quantity} {item.unit} × {formatINR(item.unitPricePaise)}
                            {item.notes ? ` — ${item.notes}` : ''}
                          </div>
                          {item.stockAllocations && item.stockAllocations.length > 0 && (
                            <div
                              data-testid={`detail-item-stock-alloc-${idx}`}
                              className="text-[11px] font-mono text-alif-charcoal mt-0.5"
                            >
                              FIFO Stock Deducted:{' '}
                              {item.stockAllocations
                                .map(
                                  (a) =>
                                    `${a.bundleCode} (-${a.quantityDeducted} ${item.unit})`
                                )
                                .join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-alif-black shrink-0">
                        {formatINR(item.lineTotalPaise)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {invoice.notes && (
                <div className="text-xs bg-stone-50 p-3 border-t border-b border-alif-border text-alif-charcoal">
                  <span className="editorial-label mr-2">Notes:</span> {invoice.notes}
                </div>
              )}

              <div
                data-testid="detail-receipt-footer"
                className="text-xs font-mono text-alif-charcoal pt-2 border-t border-alif-border"
              >
                {resolveInvoiceFooterText(invoice, settings)}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4 bg-stone-50">
              <div className="editorial-subhead">
                Edit Line Items &amp; Reconcile Stock (Payment history preserved)
              </div>
              {editLines.map((line, idx) => (
                <div
                  key={line.id}
                  className="bg-white p-3.5 border border-alif-border space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        id={`edit-photo-file-${line.id}`}
                        data-testid={`edit-input-photo-${idx}`}
                        onChange={(e) => handleEditLinePhoto(idx, e.target.files?.[0])}
                        className="hidden"
                      />
                      {line.photoDataUrl ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={line.photoDataUrl}
                            alt={line.name}
                            data-testid={`edit-thumb-photo-${idx}`}
                            className="w-10 h-10 object-cover border border-black"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(
                                `edit-photo-file-${line.id}`
                              ) as HTMLInputElement | null;
                              el?.click();
                            }}
                            className="px-2.5 py-1 text-xs border border-alif-border bg-white min-h-[36px]"
                          >
                            Replace Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditLinePhoto(idx)}
                            className="px-2.5 py-1 text-xs border border-alif-border bg-white text-alif-grey min-h-[36px]"
                          >
                            Remove Photo
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(
                              `edit-photo-file-${line.id}`
                            ) as HTMLInputElement | null;
                            el?.click();
                          }}
                          className="px-2.5 py-1 text-xs border border-alif-border bg-stone-50 min-h-[36px]"
                        >
                          + Attach Photo
                        </button>
                      )}
                    </div>
                    {editLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEditLines(editLines.filter((_, i) => i !== idx))}
                        className="px-2.5 py-1 text-xs text-alif-charcoal border border-alif-border min-h-[36px]"
                      >
                        Remove Item ✕
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <input
                      type="text"
                      value={line.name}
                      onChange={(e) => {
                        const copy = [...editLines];
                        copy[idx] = { ...copy[idx], name: e.target.value };
                        setEditLines(copy);
                      }}
                      className="px-3 py-2 text-base"
                      aria-label="Item name"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => {
                        const copy = [...editLines];
                        copy[idx] = { ...copy[idx], quantity: e.target.value };
                        setEditLines(copy);
                      }}
                      className="px-3 py-2 text-base font-mono"
                      aria-label="Quantity"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.unitPriceRupees}
                      onChange={(e) => {
                        const copy = [...editLines];
                        copy[idx] = { ...copy[idx], unitPriceRupees: e.target.value };
                        setEditLines(copy);
                      }}
                      className="px-3 py-2 text-base font-mono"
                      aria-label="Unit price"
                    />
                    <input
                      type="text"
                      value={line.notes}
                      onChange={(e) => {
                        const copy = [...editLines];
                        copy[idx] = { ...copy[idx], notes: e.target.value };
                        setEditLines(copy);
                      }}
                      className="px-3 py-2 text-base"
                      aria-label="Note"
                    />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block editorial-label mb-1">
                    Discount ({editDiscountType})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={editDiscountValue}
                    onChange={(e) => setEditDiscountValue(e.target.value)}
                    className="w-full px-3 py-2 text-base font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Collection Date</label>
                  <input
                    type="date"
                    value={editCollectionDate}
                    onChange={(e) => setEditCollectionDate(e.target.value)}
                    className="w-full px-3 py-2 text-base font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Bill Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-3 py-2 text-base bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingBill(false)}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedInvoice}
                  data-testid="btn-save-edited-invoice"
                  className="px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white"
                >
                  Save Updated Bill
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chronological Payment Ledger */}
        <div className="border border-alif-border">
          <div className="bg-stone-50 px-4 py-2.5 border-b border-alif-border flex items-center justify-between">
            <h4 className="editorial-subhead">
              Payment History ({payments.length})
            </h4>
            <span
              className="text-sm font-mono font-bold text-alif-black"
              data-testid="detail-net-paid"
            >
              Net Paid: {formatINR(invoice.paidPaise)}
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="p-4 text-xs text-alif-grey text-center">
              No payments recorded yet
            </div>
          ) : (
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-alif-black">
                        {p.type}
                      </span>
                      <span className="px-1.5 py-0.5 border border-alif-border bg-stone-50 text-xs text-alif-charcoal">
                        {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      </span>
                      <span className="font-mono text-alif-grey">{p.date}</span>
                    </div>
                    {p.note && <div className="text-alif-grey mt-0.5">{p.note}</div>}
                  </div>
                  <div className="font-mono font-bold text-sm sm:text-base text-alif-black">
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
                className="btn-inline text-xs font-semibold uppercase tracking-wider text-alif-grey hover:text-alif-black underline"
              >
                Cancel This Invoice...
              </button>
            ) : (
              <div className="w-full bg-stone-50 border border-black p-3.5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                  Cancel Invoice {invoice.invoiceNumber} (Restores deducted stock &amp; preserves ledger)
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter reason for cancelling..."
                    aria-label="Cancellation reason"
                    data-testid="input-cancel-reason"
                    className="flex-1 px-3 py-2 text-base bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelPrompt(false)}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelInvoice}
                      data-testid="btn-confirm-cancel-invoice"
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white"
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
          message="Reopening this bill restores its active status, re-allocates stock, and recalculates the outstanding balance based on its preserved payment history."
          confirmLabel="Reopen Bill"
          onConfirm={handleSaveEditedInvoice}
          onCancel={() => setConfirmReopenOpen(false)}
        />

        {/* Photo Preview Dialog */}
        {previewPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 alif-modal-backdrop"
            role="dialog"
            aria-modal="true"
            data-testid="detail-modal-photo-preview"
          >
            <div className="bg-white border-2 border-black max-w-md w-full p-4 space-y-4 alif-modal-panel">
              <div className="flex items-center justify-between border-b border-alif-border pb-3">
                <h4 className="text-base font-semibold text-alif-black truncate">
                  {previewPhoto.itemName}
                </h4>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  data-testid="btn-close-detail-photo-preview"
                  className="px-3 py-1.5 text-xs font-semibold border border-alif-border text-alif-black hover:border-black"
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
    </div>
  );
}
