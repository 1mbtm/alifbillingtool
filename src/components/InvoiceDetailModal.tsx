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
  buildSmsShareUrl,
  buildWhatsAppShareUrl,
  buildWhatsAppUrlWithCustomText,
  downloadBillImage,
  downloadInvoicePdf,
  GeneratedBillImage,
  generateInvoiceBillImage,
  printInvoiceReceipt,
  shareBillImageAndText,
  ShareBillOutcome,
  shareInvoicePdf
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
import { ConfirmDialog, StatusBadge } from './StatusBadge';

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

  // Professional Bill Image + WhatsApp Sharing state
  const [sharePanelOpen, setSharePanelOpen] = useState<boolean>(initialOpenSharePanel);
  const [includePhotosInBillImage, setIncludePhotosInBillImage] = useState<boolean>(true);
  const [generatedBillImage, setGeneratedBillImage] = useState<GeneratedBillImage | null>(null);
  const [generatingImage, setGeneratingImage] = useState<boolean>(false);
  const [shareMessageText, setShareMessageText] = useState<string>('');
  const [shareOutcome, setShareOutcome] = useState<ShareBillOutcome | null>(null);
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
      setSharePanelOpen(true);
    }
  }, [initialOpenSharePanel]);

  // Regenerate the high-resolution bill image whenever share panel is open and invoice/payment/photo state changes
  useEffect(() => {
    let active = true;
    if (!sharePanelOpen || !invoice) return;

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
  }, [sharePanelOpen, invoice, payments, settings, photosMap, includePhotosInBillImage]);

  if (loading || !invoice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white border border-black p-6 text-base font-semibold">
          Loading invoice receipt...
        </div>
      </div>
    );
  }

  async function handleOpenOrToggleShareBill() {
    if (!invoice) return;
    const nextState = !sharePanelOpen;
    setSharePanelOpen(nextState);
    if (nextState) {
      setShareOutcome(null);
      if (!shareMessageText.trim()) {
        setShareMessageText(buildShareBillText(invoice, settings));
      }
    }
  }

  async function handleExecuteShareBill() {
    if (!invoice || sharingInProgress) return;
    setSharingInProgress(true);
    try {
      const billImg =
        generatedBillImage ||
        (await generateInvoiceBillImage(invoice, payments, settings, {
          photosMap,
          includePhotos: includePhotosInBillImage,
          format: 'image/png'
        }));
      setGeneratedBillImage(billImg);

      const outcome = await shareBillImageAndText({
        invoice,
        settings,
        billImage: billImg,
        customText: shareMessageText
      });
      setShareOutcome(outcome);
      onNotify(outcome.statusMessage);
    } catch (err: any) {
      onNotify(err?.message || 'Could not initiate bill share', true);
    } finally {
      setSharingInProgress(false);
    }
  }

  async function handleDownloadBillImageOnly() {
    if (!invoice) return;
    try {
      const billImg =
        generatedBillImage ||
        (await generateInvoiceBillImage(invoice, payments, settings, {
          photosMap,
          includePhotos: includePhotosInBillImage,
          format: 'image/png'
        }));
      setGeneratedBillImage(billImg);
      const filename = downloadBillImage(billImg);
      onNotify(`Downloaded bill image ${filename}`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not download bill image', true);
    }
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
      setShareMessageText(buildShareBillText(updated, settings));
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
  const customWhatsappUrl = buildWhatsAppUrlWithCustomText(
    invoice.customerPhone,
    shareMessageText || buildShareBillText(invoice, settings)
  );
  const smsUrl = buildSmsShareUrl(invoice, settings);
  const attachedPhotoCount = Object.keys(photosMap).length;

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
              <span className="font-mono text-lg sm:text-xl font-semibold text-alif-black">
                {invoice.invoiceNumber}
              </span>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-sm font-mono text-alif-grey">
              Issued: {invoice.invoiceDate}
              {invoice.collectionDate ? `  |  Collection: ${invoice.collectionDate}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-close-invoice-modal"
            className="px-3.5 py-2 text-sm font-semibold border border-alif-border text-alif-black hover:border-black"
          >
            Close ✕
          </button>
        </div>

        {/* Cancelled Notice */}
        {invoice.status === 'Cancelled' && (
          <div className="bg-alif-muted border border-black p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              className="px-4 py-2 text-sm font-semibold bg-white text-alif-black border border-black hover:bg-stone-50 shrink-0"
            >
              Reopen Invoice
            </button>
          </div>
        )}

        {/* Receipt Export & Client Dispatch Action Bar */}
        <div className="border-t border-b border-alif-border py-4 space-y-3">
          <div className="editorial-label">Receipt Export &amp; Client Dispatch</div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleOpenOrToggleShareBill}
              data-testid="btn-share-bill"
              className={`px-4 py-2.5 text-sm font-semibold border transition ${
                sharePanelOpen
                  ? 'bg-alif-charcoal text-white border-black'
                  : 'bg-alif-black text-white border-black hover:bg-zinc-800'
              }`}
            >
              {sharePanelOpen ? 'Hide Share Bill' : 'Share Bill'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              data-testid="btn-download-pdf"
              className="px-4 py-2.5 bg-white text-alif-black border border-alif-border text-sm font-semibold hover:border-black"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => printInvoiceReceipt(invoice, payments, settings)}
              className="px-4 py-2.5 bg-white text-alif-black border border-alif-border text-sm font-semibold hover:border-black"
            >
              Print Receipt
            </button>
            <button
              type="button"
              onClick={handleNativeShare}
              className="px-4 py-2.5 bg-white text-alif-black border border-alif-border text-sm font-semibold hover:border-black"
            >
              Share PDF
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-whatsapp-share"
              className="px-4 py-2.5 bg-white text-alif-black border border-alif-border text-sm font-semibold hover:border-black inline-flex items-center min-h-[44px]"
            >
              WhatsApp Summary
            </a>
            <a
              href={smsUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-sms-share"
              className="px-4 py-2.5 bg-white text-alif-black border border-alif-border text-sm font-semibold hover:border-black inline-flex items-center min-h-[44px]"
            >
              SMS Summary
            </a>
          </div>
          <p className="text-sm text-alif-grey">
            Tap <strong className="text-alif-black">Share Bill</strong> to generate a branded{' '}
            <span className="font-ubuntu font-medium text-alif-black">alif.</span> bill image and share it with an editable message on WhatsApp.
          </p>
        </div>

        {/* Professional Bill Image + WhatsApp Sharing Studio */}
        {sharePanelOpen && (
          <section
            data-testid="share-bill-panel"
            className="border border-black bg-stone-50 p-4 sm:p-5 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-alif-border pb-3">
              <div>
                <h3 className="editorial-subhead">
                  Share Bill — Image &amp; WhatsApp Message
                </h3>
                <p className="text-sm text-alif-grey mt-0.5">
                  High-resolution <span className="font-ubuntu font-medium text-alif-black">alif.</span> receipt image generated locally from saved invoice {invoice.invoiceNumber}.
                </p>
              </div>
              {attachedPhotoCount > 0 && (
                <label className="inline-flex items-center gap-2 text-sm font-medium text-alif-black cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includePhotosInBillImage}
                    onChange={(e) => setIncludePhotosInBillImage(e.target.checked)}
                    data-testid="toggle-share-photos"
                    className="w-4 h-4 accent-black"
                  />
                  <span>Include item photos ({attachedPhotoCount})</span>
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {/* Left Column: Generated Bill Image Preview */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="editorial-label">Generated Bill Image Preview</span>
                  {generatedBillImage && (
                    <span
                      data-testid="share-bill-dimensions"
                      className="text-sm font-mono text-alif-grey"
                    >
                      {generatedBillImage.width}×{generatedBillImage.height}px
                    </span>
                  )}
                </div>

                <div className="bg-white border border-alif-border p-2 max-h-96 overflow-y-auto flex items-center justify-center">
                  {generatingImage || !generatedBillImage ? (
                    <div className="py-12 text-sm text-alif-grey">
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

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadBillImageOnly}
                    data-testid="btn-download-bill-image"
                    className="px-4 py-2 text-sm font-semibold border border-alif-border bg-white text-alif-black hover:border-black"
                  >
                    Download Image ({invoice.invoiceNumber}.png)
                  </button>
                </div>
              </div>

              {/* Right Column: Editable WhatsApp Message & Share Actions */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="share-whatsapp-message"
                      className="editorial-label"
                    >
                      Editable WhatsApp Message
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setShareMessageText(buildShareBillText(invoice, settings))
                      }
                      data-testid="btn-reset-share-message"
                      className="text-sm font-medium text-alif-grey hover:text-alif-black underline"
                    >
                      Reset Text
                    </button>
                  </div>
                  <textarea
                    id="share-whatsapp-message"
                    rows={7}
                    value={shareMessageText}
                    onChange={(e) => setShareMessageText(e.target.value)}
                    data-testid="textarea-share-message"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-alif-border bg-white text-alif-black leading-relaxed"
                  />
                  <p className="text-sm text-alif-grey mt-1">
                    Includes customer name, invoice number, total, amount paid, and remaining balance. Edit freely before sharing.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={sharingInProgress || generatingImage}
                    onClick={handleExecuteShareBill}
                    data-testid="btn-execute-share-bill"
                    className="flex-1 px-4 py-3 bg-alif-black text-white text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {sharingInProgress
                      ? 'Preparing Share...'
                      : 'Share Image + Text on WhatsApp'}
                  </button>
                  <a
                    href={customWhatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-whatsapp-custom-text"
                    className="px-4 py-3 bg-white text-alif-black border border-alif-border text-sm font-semibold hover:border-black inline-flex items-center justify-center min-h-[44px]"
                  >
                    Open WhatsApp Text Only
                  </a>
                </div>

                {/* Clear Instructions Banner when Fallback or Share Sheet is Triggered */}
                {shareOutcome && (
                  <div
                    data-testid="share-fallback-instructions"
                    className="bg-white border border-black p-3.5 space-y-1.5 text-sm text-alif-black"
                  >
                    <div className="font-semibold">
                      {shareOutcome.manualAttachRequired
                        ? 'Manual Image Attachment Required in WhatsApp'
                        : 'Complete Sending in Your Messaging App'}
                    </div>
                    <p className="text-alif-charcoal leading-relaxed">
                      {shareOutcome.instructions}
                    </p>
                    <p className="text-alif-grey text-sm">
                      Note: The bill is only sent after you review and tap Send inside WhatsApp.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Receipt Body: Client & Itemised Garment Table */}
        <div className="border border-alif-border">
          <div className="bg-stone-50 px-4 py-3 border-b border-alif-border flex flex-wrap items-center justify-between gap-2">
            <div className="text-base">
              <span className="editorial-label mr-2">Client</span>
              <span className="font-semibold text-alif-black">{invoice.customerName}</span>
              <span className="font-mono text-alif-grey ml-2">{invoice.customerPhone}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingBill(!isEditingBill)}
              data-testid="btn-toggle-edit-bill"
              className="text-sm font-semibold text-alif-black underline px-2 py-1"
            >
              {isEditingBill ? 'Cancel Editing' : 'Edit / Reopen Bill Items'}
            </button>
          </div>

          {!isEditingBill ? (
            <div className="p-4 space-y-4">
              <div className="divide-y">
                {invoice.items.map((item, idx) => {
                  const photoRec = item.photoId ? photosMap[item.photoId] : undefined;
                  return (
                    <div
                      key={item.id}
                      className="py-3 flex items-start justify-between gap-3 text-base"
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
                            className="p-0.5 border border-black bg-white shrink-0"
                            title="View attached item photo"
                          >
                            <img
                              src={photoRec.dataUrl}
                              alt={item.name}
                              data-testid={`detail-item-thumb-${idx}`}
                              className="w-12 h-12 object-cover block"
                            />
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-alif-black">
                            {idx + 1}. {item.name}{' '}
                            <span className="text-sm text-alif-grey ml-1.5">
                              [{item.category}]
                            </span>
                          </div>
                          <div className="font-mono text-sm text-alif-grey mt-0.5">
                            {item.quantity} {item.unit} × {formatINR(item.unitPricePaise)}
                            {item.notes ? ` — ${item.notes}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono font-semibold text-alif-black shrink-0">
                        {formatINR(item.lineTotalPaise)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {invoice.notes && (
                <div className="text-sm bg-stone-50 p-3.5 border-t border-b border-alif-border text-alif-charcoal">
                  <span className="editorial-label mr-2">Notes:</span> {invoice.notes}
                </div>
              )}

              {/* Financial Hierarchy Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border text-sm">
                <div className="p-3.5 border-r border-b border-alif-border">
                  <div className="editorial-label">Subtotal</div>
                  <div className="font-mono font-medium text-base mt-1">
                    {formatINR(invoice.subtotalPaise)}
                  </div>
                </div>
                <div className="p-3.5 border-r border-b border-alif-border">
                  <div className="editorial-label">Discount</div>
                  <div className="font-mono font-medium text-base mt-1">
                    - {formatINR(invoice.discountPaise)}
                  </div>
                </div>
                <div className="p-3.5 border-r border-b border-alif-border bg-stone-50">
                  <div className="editorial-label">Final Total</div>
                  <div
                    className="font-mono font-semibold text-base text-alif-black mt-1"
                    data-testid="detail-total"
                  >
                    {formatINR(invoice.totalPaise)}
                  </div>
                </div>
                <div className="p-3.5 border-r border-b border-alif-border bg-alif-muted">
                  <div className="editorial-label">Balance Due</div>
                  <div
                    className="font-mono font-semibold text-base text-alif-black mt-1"
                    data-testid="detail-balance"
                  >
                    {formatINR(invoice.balancePaise)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4 bg-stone-50">
              <div className="editorial-subhead">
                Edit Line Items &amp; Recalculate (Payment history preserved)
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
                            className="w-11 h-11 object-cover border border-black"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(
                                `edit-photo-file-${line.id}`
                              ) as HTMLInputElement | null;
                              el?.click();
                            }}
                            className="px-3 py-1.5 text-sm border border-alif-border bg-white"
                          >
                            Replace Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditLinePhoto(idx)}
                            className="px-3 py-1.5 text-sm border border-alif-border bg-white text-alif-grey"
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
                          className="px-3 py-1.5 text-sm border border-alif-border bg-stone-50"
                        >
                          + Attach Photo
                        </button>
                      )}
                    </div>
                    {editLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEditLines(editLines.filter((_, i) => i !== idx))}
                        className="px-3 py-1.5 text-sm text-alif-charcoal border border-alif-border"
                      >
                        Remove Item ✕
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={line.name}
                      onChange={(e) => {
                        const copy = [...editLines];
                        copy[idx] = { ...copy[idx], name: e.target.value };
                        setEditLines(copy);
                      }}
                      className="px-3 py-2 text-base border border-alif-border"
                      aria-label="Item name"
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
                      className="px-3 py-2 text-base font-mono border border-alif-border"
                      aria-label="Quantity"
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
                      className="px-3 py-2 text-base font-mono border border-alif-border"
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
                      className="px-3 py-2 text-base border border-alif-border"
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
                    min="0"
                    step="any"
                    value={editDiscountValue}
                    onChange={(e) => setEditDiscountValue(e.target.value)}
                    className="w-full px-3 py-2 text-base font-mono border border-alif-border bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Collection Date</label>
                  <input
                    type="date"
                    value={editCollectionDate}
                    onChange={(e) => setEditCollectionDate(e.target.value)}
                    className="w-full px-3 py-2 text-base font-mono border border-alif-border bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Bill Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-3 py-2 text-base border border-alif-border bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingBill(false)}
                  className="px-4 py-2 text-sm font-semibold border border-alif-border bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedInvoice}
                  data-testid="btn-save-edited-invoice"
                  className="px-5 py-2 text-sm font-semibold bg-alif-black text-white"
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
          className="border border-alif-border p-4 space-y-4 bg-stone-50"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-alif-border pb-3">
            <h4 className="editorial-subhead">Record Payment, Refund or Correction</h4>
            <div className="flex flex-wrap gap-1.5">
              {(['payment', 'refund', 'correction'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPayType(t)}
                  className={`px-3 py-2 text-sm border font-semibold ${
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
                  step="any"
                  value={payAmountRupees}
                  onChange={(e) => setPayAmountRupees(e.target.value)}
                  data-testid="input-record-payment-amount"
                  className="w-full px-3 py-2 text-base font-mono border border-alif-border bg-white"
                />
                {payType === 'payment' && invoice.balancePaise > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayAmountRupees(paiseToRupeesString(invoice.balancePaise))}
                    className="px-3 py-2 text-sm font-semibold border border-alif-border bg-white hover:border-black shrink-0"
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
                className="w-full px-3 py-2 text-base border border-alif-border bg-white"
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
                className="w-full px-3 py-2 text-base font-mono border border-alif-border bg-white"
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
                data-testid="input-record-payment-note"
                className="w-full px-3 py-2 text-base border border-alif-border bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingPay}
              data-testid="btn-submit-payment"
              className="px-5 py-2.5 bg-alif-black text-white text-sm font-semibold hover:bg-zinc-800"
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
          <div className="bg-stone-50 px-4 py-3 border-b border-alif-border flex items-center justify-between">
            <h4 className="editorial-subhead">
              Payment History ({payments.length})
            </h4>
            <span
              className="text-base font-mono font-semibold text-alif-black"
              data-testid="detail-net-paid"
            >
              Net Paid: {formatINR(invoice.paidPaise)}
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="p-4 text-sm text-alif-grey text-center">
              No payments recorded yet
            </div>
          ) : (
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-alif-black">
                        {p.type}
                      </span>
                      <span className="px-2 py-0.5 border border-alif-border text-sm text-alif-grey">
                        {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      </span>
                      <span className="font-mono text-alif-grey">{p.date}</span>
                    </div>
                    {p.note && <div className="text-alif-grey mt-0.5">{p.note}</div>}
                  </div>
                  <div className="font-mono font-semibold text-base text-alif-black">
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
                className="text-sm font-semibold text-alif-grey hover:text-alif-black underline"
              >
                Cancel This Invoice...
              </button>
            ) : (
              <div className="w-full bg-stone-50 border border-black p-4 space-y-3">
                <div className="text-sm font-semibold text-alif-black">
                  Cancel Invoice {invoice.invoiceNumber} (Preserves historical ledger)
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    aria-label="Cancellation reason"
                    data-testid="input-cancel-reason"
                    className="flex-1 px-3 py-2 text-base border border-alif-border bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelPrompt(false)}
                      className="px-4 py-2 text-sm border border-alif-border bg-white"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelInvoice}
                      data-testid="btn-confirm-cancel-invoice"
                      className="px-4 py-2 text-sm font-semibold bg-alif-black text-white"
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

        {/* Photo Preview Dialog */}
        {previewPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            data-testid="detail-modal-photo-preview"
          >
            <div className="bg-white border border-black max-w-md w-full p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-alif-border pb-3">
                <h4 className="text-base font-semibold text-alif-black truncate">
                  {previewPhoto.itemName}
                </h4>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  data-testid="btn-close-detail-photo-preview"
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
    </div>
  );
}
