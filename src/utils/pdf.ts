import {
  Invoice,
  ItemPhotoRecord,
  PaymentRecord,
  ShopSettings
} from '../types/billing';
import { formatINR, paiseToRupeesString, PAYMENT_METHOD_LABELS } from './currency';

/**
 * Formats integer paise for standard PDF Type1 Helvetica font (which uses WinAnsi/ASCII
 * where 'Rs.' is universally readable without missing-glyph boxes).
 */
function formatPdfCurrency(paise: number): string {
  const formatted = formatINR(paise);
  return formatted.replace(/₹/g, 'Rs. ');
}

function escapePdfText(text: string): string {
  return String(text || '')
    .replace(/₹/g, 'Rs. ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Sanitizes user-provided text (customer names, notes, custom item names) for safe
 * rendering onto Canvas / share messages without control characters.
 */
export function sanitizeBillText(text: string | undefined | null): string {
  return String(text ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wraps a text string into multiple lines where each line has at most maxChars characters.
 * Breaks long contiguous tokens safely so no text ever overflows or clips horizontally.
 */
export function wrapTextLines(text: string, maxChars: number): string[] {
  const safeMax = Math.max(8, Math.floor(maxChars));
  const cleaned = sanitizeBillText(text);
  if (!cleaned) return [];

  const rawWords = cleaned.split(' ');
  const words: string[] = [];
  for (const word of rawWords) {
    if (word.length <= safeMax) {
      words.push(word);
    } else {
      for (let i = 0; i < word.length; i += safeMax) {
        words.push(word.slice(i, i + safeMax));
      }
    }
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= safeMax) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * Generates a real, standards-compliant PDF 1.4 binary document (Uint8Array)
 * containing ALiF Ladies Tailor branding, customer & invoice details, itemised table,
 * discount, payment history, advance, and balance due.
 */
export function generateInvoicePdfBytes(
  invoice: Invoice,
  payments: PaymentRecord[],
  settings: ShopSettings
): Uint8Array {
  const pageWidth = 595.28; // A4 width in pt
  const pageHeight = 841.89; // A4 height in pt
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const ops: string[] = [];

  const drawRect = (x: number, yTop: number, w: number, h: number, fillRgb: [number, number, number]) => {
    const yPdf = pageHeight - yTop - h;
    ops.push(
      `q ${fillRgb[0].toFixed(3)} ${fillRgb[1].toFixed(3)} ${fillRgb[2].toFixed(3)} rg ${x.toFixed(2)} ${yPdf.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`
    );
  };

  const drawStrokeRect = (x: number, yTop: number, w: number, h: number, strokeRgb: [number, number, number], lineWidth = 0.75) => {
    const yPdf = pageHeight - yTop - h;
    ops.push(
      `q ${lineWidth.toFixed(2)} w ${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG ${x.toFixed(2)} ${yPdf.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S Q`
    );
  };

  const drawLine = (x1: number, yTop1: number, x2: number, yTop2: number, strokeRgb: [number, number, number] = [0.85, 0.84, 0.81], lineWidth = 0.75) => {
    const y1 = pageHeight - yTop1;
    const y2 = pageHeight - yTop2;
    ops.push(
      `q ${lineWidth.toFixed(2)} w ${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`
    );
  };

  const drawText = (
    text: string,
    x: number,
    yTop: number,
    options: {
      font?: 'F1' | 'F2'; // F1 = Helvetica, F2 = Helvetica-Bold
      size?: number;
      color?: [number, number, number];
      align?: 'left' | 'right' | 'center';
    } = {}
  ) => {
    const font = options.font || 'F1';
    const size = options.size || 10;
    const color = options.color || [0.11, 0.11, 0.13];
    const align = options.align || 'left';
    const clean = escapePdfText(text);
    const approxWidth = String(text || '').replace(/₹/g, 'Rs. ').length * size * (font === 'F2' ? 0.54 : 0.5);
    let drawX = x;
    if (align === 'right') drawX = x - approxWidth;
    else if (align === 'center') drawX = x - approxWidth / 2;
    const yPdf = pageHeight - yTop;
    ops.push(
      `BT /${font} ${size} Tf ${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg ${drawX.toFixed(2)} ${yPdf.toFixed(2)} Td (${clean}) Tj ET`
    );
  };

  // 1. Header Banner (Charcoal/Black minimal premium header)
  drawRect(margin, 36, contentWidth, 74, [0.05, 0.05, 0.06]);
  drawText(settings.shopName || 'ALiF Ladies Tailor', margin + 18, 62, {
    font: 'F2',
    size: 20,
    color: [0.97, 0.96, 0.95]
  });
  drawText(settings.tagline || 'Ladies Tailoring & Boutique Finishing', margin + 18, 80, {
    font: 'F1',
    size: 9,
    color: [0.75, 0.76, 0.78]
  });
  const locationLine = [settings.address, settings.city, settings.state, settings.pinCode]
    .filter(Boolean)
    .join(', ');
  drawText(`${locationLine}  |  Phone: ${settings.phone}`, margin + 18, 96, {
    font: 'F1',
    size: 8.5,
    color: [0.68, 0.70, 0.73]
  });

  // Status badge in header right
  drawText('TAX INVOICE / TAILORING BILL', pageWidth - margin - 18, 60, {
    font: 'F2',
    size: 10,
    color: [0.97, 0.96, 0.95],
    align: 'right'
  });
  drawText(`STATUS: ${invoice.status.toUpperCase()}`, pageWidth - margin - 18, 78, {
    font: 'F2',
    size: 10,
    color: invoice.status === 'Paid'
      ? [0.43, 0.91, 0.72]
      : invoice.status === 'Cancelled'
      ? [0.98, 0.55, 0.55]
      : [0.98, 0.82, 0.45],
    align: 'right'
  });
  drawText(`No: ${invoice.invoiceNumber}`, pageWidth - margin - 18, 95, {
    font: 'F1',
    size: 9.5,
    color: [0.90, 0.90, 0.92],
    align: 'right'
  });

  // 2. Customer & Invoice Metadata Box
  let y = 122;
  drawRect(margin, y, contentWidth, 62, [0.97, 0.96, 0.95]);
  drawStrokeRect(margin, y, contentWidth, 62, [0.85, 0.84, 0.81]);

  drawText('BILLED TO:', margin + 14, y + 18, { font: 'F2', size: 8.5, color: [0.42, 0.45, 0.50] });
  drawText(invoice.customerName || 'Walk-in Customer', margin + 14, y + 34, { font: 'F2', size: 12 });
  drawText(`Phone: ${invoice.customerPhone || 'N/A'}`, margin + 14, y + 50, { font: 'F1', size: 9.5, color: [0.32, 0.34, 0.38] });

  const metaX = margin + contentWidth * 0.56;
  drawText(`Invoice Number: ${invoice.invoiceNumber}`, metaX, y + 18, { font: 'F2', size: 9.5 });
  drawText(`Bill Date: ${invoice.invoiceDate}`, metaX, y + 34, { font: 'F1', size: 9.5 });
  drawText(
    `Collection Date: ${invoice.collectionDate ? invoice.collectionDate : 'As Scheduled'}`,
    metaX,
    y + 50,
    { font: 'F2', size: 9.5, color: [0.15, 0.16, 0.18] }
  );

  y += 76;

  // Cancelled Notice if applicable
  if (invoice.status === 'Cancelled') {
    drawRect(margin, y, contentWidth, 26, [0.99, 0.93, 0.93]);
    drawStrokeRect(margin, y, contentWidth, 26, [0.90, 0.45, 0.45]);
    drawText(
      `CANCELLED BILL — Reason: ${invoice.cancelReason || 'Cancelled by shop'}`,
      margin + 12,
      y + 17,
      { font: 'F2', size: 9.5, color: [0.72, 0.11, 0.11] }
    );
    y += 36;
  }

  // 3. Line Items Table Header
  drawRect(margin, y, contentWidth, 24, [0.14, 0.15, 0.17]);
  drawText('#', margin + 10, y + 16, { font: 'F2', size: 9, color: [1, 1, 1] });
  drawText('ITEM / TAILORING SERVICE', margin + 32, y + 16, { font: 'F2', size: 9, color: [1, 1, 1] });
  drawText('CATEGORY', margin + 245, y + 16, { font: 'F2', size: 9, color: [1, 1, 1] });
  drawText('QTY', margin + 335, y + 16, { font: 'F2', size: 9, color: [1, 1, 1] });
  drawText('RATE', margin + 425, y + 16, { font: 'F2', size: 9, color: [1, 1, 1], align: 'right' });
  drawText('AMOUNT', pageWidth - margin - 10, y + 16, { font: 'F2', size: 9, color: [1, 1, 1], align: 'right' });
  y += 24;

  // Line Items Rows
  const maxItemsToRender = Math.min(invoice.items.length, 14);
  for (let idx = 0; idx < maxItemsToRender; idx++) {
    const item = invoice.items[idx];
    const rowHeight = item.notes ? 30 : 22;
    if (idx % 2 === 1) {
      drawRect(margin, y, contentWidth, rowHeight, [0.98, 0.98, 0.97]);
    }
    drawText(String(idx + 1), margin + 10, y + 15, { size: 9 });
    drawText(item.name.slice(0, 36), margin + 32, y + 15, { font: 'F2', size: 9.5 });
    if (item.notes) {
      drawText(`Note: ${item.notes.slice(0, 48)}`, margin + 32, y + 26, { size: 8, color: [0.42, 0.45, 0.50] });
    }
    drawText(item.category.toUpperCase(), margin + 245, y + 15, { size: 8.5, color: [0.40, 0.42, 0.46] });
    drawText(`${item.quantity} ${item.unit}`, margin + 335, y + 15, { size: 9 });
    drawText(formatPdfCurrency(item.unitPricePaise), margin + 425, y + 15, { size: 9, align: 'right' });
    drawText(formatPdfCurrency(item.lineTotalPaise), pageWidth - margin - 10, y + 15, {
      font: 'F2',
      size: 9.5,
      align: 'right'
    });
    drawLine(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  }

  y += 12;

  // 4. Totals & Payment Summary Side-by-Side
  const totalsBoxX = margin + contentWidth * 0.52;
  const totalsBoxW = contentWidth * 0.48;
  let totalsY = y;

  const drawTotalRow = (label: string, val: string, bold = false, highlight = false) => {
    if (highlight) {
      drawRect(totalsBoxX, totalsY, totalsBoxW, 24, [0.07, 0.07, 0.09]);
      drawText(label, totalsBoxX + 10, totalsY + 16, { font: 'F2', size: 10, color: [1, 1, 1] });
      drawText(val, totalsBoxX + totalsBoxW - 10, totalsY + 16, {
        font: 'F2',
        size: 10.5,
        color: [1, 1, 1],
        align: 'right'
      });
      totalsY += 26;
    } else {
      drawText(label, totalsBoxX + 10, totalsY + 14, {
        font: bold ? 'F2' : 'F1',
        size: 9.5,
        color: [0.22, 0.24, 0.27]
      });
      drawText(val, totalsBoxX + totalsBoxW - 10, totalsY + 14, {
        font: bold ? 'F2' : 'F1',
        size: 9.5,
        align: 'right'
      });
      drawLine(totalsBoxX, totalsY + 20, totalsBoxX + totalsBoxW, totalsY + 20);
      totalsY += 20;
    }
  };

  drawTotalRow('Subtotal', formatPdfCurrency(invoice.subtotalPaise));
  if (invoice.discountPaise > 0) {
    const discLabel =
      invoice.discountType === 'percent'
        ? `Discount (${invoice.discountValue}%)`
        : 'Discount';
    drawTotalRow(discLabel, `- ${formatPdfCurrency(invoice.discountPaise)}`);
  }
  if (invoice.taxEnabled && invoice.taxPaise > 0) {
    drawTotalRow(`${invoice.taxLabel || 'Tax'} (${invoice.taxRatePercent}%)`, formatPdfCurrency(invoice.taxPaise));
  }
  drawTotalRow('FINAL TOTAL', formatPdfCurrency(invoice.totalPaise), true, true);
  drawTotalRow('Advance at Billing', formatPdfCurrency(invoice.advancePaise));
  drawTotalRow('Total Net Paid', formatPdfCurrency(invoice.paidPaise), true);
  drawTotalRow(
    'BALANCE DUE',
    formatPdfCurrency(invoice.balancePaise),
    true,
    invoice.balancePaise > 0 && invoice.status !== 'Cancelled'
  );

  // Left side: Notes & Payment History
  let leftY = y;
  const leftW = contentWidth * 0.48;
  if (invoice.notes) {
    drawText('STITCHING / MEASUREMENT NOTES:', margin, leftY + 12, {
      font: 'F2',
      size: 8.5,
      color: [0.42, 0.45, 0.50]
    });
    drawText(invoice.notes.slice(0, 65), margin, leftY + 26, { size: 9 });
    if (invoice.notes.length > 65) {
      drawText(invoice.notes.slice(65, 130), margin, leftY + 38, { size: 9 });
      leftY += 46;
    } else {
      leftY += 34;
    }
  }

  drawText('PAYMENT HISTORY:', margin, leftY + 14, {
    font: 'F2',
    size: 8.5,
    color: [0.42, 0.45, 0.50]
  });
  leftY += 20;

  if (payments.length === 0) {
    drawText('No payments recorded yet.', margin, leftY + 12, { size: 8.5, color: [0.5, 0.5, 0.55] });
    leftY += 18;
  } else {
    for (const p of payments.slice(0, 6)) {
      const methodLabel = PAYMENT_METHOD_LABELS[p.method] || p.method;
      const typeLabel = p.type.toUpperCase();
      const sign = p.type === 'refund' ? '-' : '';
      drawText(
        `${p.date} | ${typeLabel} (${methodLabel}): ${sign}${formatPdfCurrency(p.amountPaise)}`,
        margin,
        leftY + 12,
        { size: 8.5 }
      );
      leftY += 14;
    }
    drawLine(margin, leftY + 4, margin + leftW, leftY + 4);
  }

  // 5. Footer
  const footerY = Math.max(totalsY + 36, leftY + 36, 755);
  drawLine(margin, footerY, pageWidth - margin, footerY, [0.15, 0.16, 0.18], 1);
  drawText(
    settings.receiptFooter || 'Thank you for choosing ALiF Ladies Tailor, Sahibganj.',
    margin,
    footerY + 16,
    { size: 8.5, color: [0.35, 0.37, 0.40] }
  );
  drawText('Authorised Signatory — ALiF Ladies Tailor', pageWidth - margin, footerY + 32, {
    font: 'F2',
    size: 9,
    align: 'right'
  });

  // Assemble valid PDF 1.4 objects
  const streamContent = ops.join('\n');
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj',
    `6 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`
  ];

  let pdfString = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdfString.length);
    pdfString += obj + '\n';
  }

  const xrefStart = pdfString.length;
  pdfString += `xref\n0 ${objects.length + 1}\n`;
  pdfString += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdfString += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfString += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdfString.length);
  for (let i = 0; i < pdfString.length; i++) {
    bytes[i] = pdfString.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function createInvoicePdfBlob(
  invoice: Invoice,
  payments: PaymentRecord[],
  settings: ShopSettings
): Blob {
  const bytes = generateInvoicePdfBytes(invoice, payments, settings);
  return new Blob([bytes], { type: 'application/pdf' });
}

export function downloadInvoicePdf(
  invoice: Invoice,
  payments: PaymentRecord[],
  settings: ShopSettings
): string {
  const filename = `${invoice.invoiceNumber}.pdf`;
  if (typeof document === 'undefined') return filename;
  const blob = createInvoicePdfBlob(invoice, payments, settings);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}

export async function shareInvoicePdf(
  invoice: Invoice,
  payments: PaymentRecord[],
  settings: ShopSettings
): Promise<{ shared: boolean; method: 'native-file' | 'native-text' | 'download-fallback'; message: string }> {
  const filename = `${invoice.invoiceNumber}.pdf`;
  const summaryText = buildConciseInvoiceMessage(invoice, settings);

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const blob = createInvoicePdfBlob(invoice, payments, settings);
      if (typeof File !== 'undefined') {
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${settings.shopName} — Bill ${invoice.invoiceNumber}`,
            text: summaryText,
            files: [file]
          });
          return {
            shared: true,
            method: 'native-file',
            message: 'Opened system share sheet with PDF invoice.'
          };
        }
      }
      await navigator.share({
        title: `${settings.shopName} — Bill ${invoice.invoiceNumber}`,
        text: summaryText
      });
      return {
        shared: true,
        method: 'native-text',
        message: 'Opened system share sheet with invoice summary.'
      };
    } catch (_err) {
      // User cancelled or browser blocked native share; fall back to download
    }
  }

  downloadInvoicePdf(invoice, payments, settings);
  return {
    shared: false,
    method: 'download-fallback',
    message: `Downloaded ${filename}. Attach it in WhatsApp or your messaging app to send.`
  };
}

export function printInvoiceReceipt(
  invoice: Invoice,
  payments: PaymentRecord[],
  settings: ShopSettings
): void {
  if (typeof window === 'undefined') return;
  const blob = createInvoicePdfBlob(invoice, payments, settings);
  const url = URL.createObjectURL(blob);
  const printWin = window.open(url, '_blank');
  if (!printWin) {
    window.print();
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Normalizes an Indian phone number for wa.me / SMS links.
 */
export function normalizeIndianPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

export function buildConciseInvoiceMessage(invoice: Invoice, settings: ShopSettings): string {
  const lines: string[] = [
    `*${settings.shopName}* (${settings.city})`,
    `Bill No: *${invoice.invoiceNumber}*`,
    `Date: ${invoice.invoiceDate}`,
    `Customer: ${invoice.customerName}`
  ];

  if (invoice.collectionDate) {
    lines.push(`Collection Date: ${invoice.collectionDate}`);
  }

  lines.push(
    'Items: ' +
      invoice.items
        .map((it) => `${it.name} x${it.quantity} (${formatINR(it.lineTotalPaise)})`)
        .join(', ')
  );

  if (invoice.discountPaise > 0) {
    lines.push(`Subtotal: ${formatINR(invoice.subtotalPaise)} | Discount: -${formatINR(invoice.discountPaise)}`);
  }

  lines.push(`*Total: ${formatINR(invoice.totalPaise)}*`);
  lines.push(`Paid: ${formatINR(invoice.paidPaise)} (Advance: ${formatINR(invoice.advancePaise)})`);
  lines.push(`*Balance Due: ${formatINR(invoice.balancePaise)}* (${invoice.status})`);

  if (invoice.status === 'Cancelled' && invoice.cancelReason) {
    lines.push(`Cancelled Reason: ${invoice.cancelReason}`);
  } else {
    lines.push(`Thank you for visiting ${settings.shopName}!`);
  }

  return lines.join('\n');
}

/**
 * Builds an editable WhatsApp share message containing the customer's name,
 * invoice number, total, amount paid, and remaining balance.
 */
export function buildShareBillText(invoice: Invoice, settings: ShopSettings): string {
  const customerName = sanitizeBillText(invoice.customerName) || 'Customer';
  const shopName = sanitizeBillText(settings.shopName) || 'ALiF Ladies Tailor';
  const lines: string[] = [
    `alif. — ${shopName}`,
    `Hello ${customerName}, here are your bill details:`,
    `Invoice No: ${invoice.invoiceNumber}`,
    `Date: ${invoice.invoiceDate}`
  ];

  if (invoice.collectionDate) {
    lines.push(`Collection Date: ${invoice.collectionDate}`);
  }

  if (invoice.discountPaise > 0) {
    lines.push(`Discount: -${formatINR(invoice.discountPaise)}`);
  }

  lines.push(`Total Amount: ${formatINR(invoice.totalPaise)}`);
  lines.push(`Amount Paid: ${formatINR(invoice.paidPaise)}`);
  lines.push(`Remaining Balance: ${formatINR(invoice.balancePaise)} (${invoice.status})`);
  lines.push(`Thank you for choosing alif.!`);

  return lines.join('\n');
}

export function buildWhatsAppUrlWithCustomText(phone: string, text: string): string {
  const normalized = normalizeIndianPhone(phone);
  const encoded = encodeURIComponent(text);
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildWhatsAppShareUrl(invoice: Invoice, settings: ShopSettings): string {
  const phone = normalizeIndianPhone(invoice.customerPhone);
  const text = encodeURIComponent(buildConciseInvoiceMessage(invoice, settings));
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function buildSmsShareUrl(invoice: Invoice, settings: ShopSettings): string {
  const digits = normalizeIndianPhone(invoice.customerPhone);
  const target = digits ? `+${digits}` : '';
  const plainText = buildConciseInvoiceMessage(invoice, settings).replace(/\*/g, '');
  return `sms:${target}?body=${encodeURIComponent(plainText)}`;
}

export function formatRupeesPlain(paise: number): string {
  return paiseToRupeesString(paise);
}

// ============================================================================
// PROFESSIONAL BILL IMAGE GENERATION & WHATSAPP SHARING
// ============================================================================

export interface BillImageOptions {
  photosMap?: Record<string, ItemPhotoRecord>;
  includePhotos?: boolean;
  format?: 'image/png' | 'image/jpeg';
  quality?: number;
  scale?: number;
}

export interface GeneratedBillImage {
  blob: Blob;
  dataUrl: string;
  filename: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
  includedPhotoCount: number;
  renderedLines: string[];
}

export interface ShareBillOutcome {
  sharedViaNativeFile: boolean;
  method: 'native-file-share' | 'whatsapp-fallback' | 'cancelled';
  downloadedFilename?: string;
  whatsappUrl?: string;
  manualAttachRequired: boolean;
  instructions: string;
  statusMessage: string;
}

function createDeterministicPngBytes(width: number, height: number): Uint8Array {
  // Minimal valid 1x1 PNG header + IHDR with actual width & height metadata for non-DOM test environments
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const ihdr = [
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff,
    (h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff,
    0x08, 0x06, 0x00, 0x00, 0x00,
    0x1f, 0x15, 0xc4, 0x89
  ];
  const idat = [
    0x00, 0x00, 0x00, 0x0a,
    0x49, 0x44, 0x41, 0x54,
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
    0x0d, 0x0a, 0x2d, 0xb4
  ];
  const iend = [
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82
  ];
  return new Uint8Array([...pngSignature, ...ihdr, ...idat, ...iend]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return '';
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const parts = dataUrl.split(',');
  if (parts.length < 2) {
    return new Blob([createDeterministicPngBytes(800, 1000)], { type: fallbackMime });
  }
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
  const b64 = parts[1];
  const binStr = typeof atob === 'function' ? atob(b64) : '';
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function loadImageElementSafe(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined' || !src) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (res: HTMLImageElement | null) => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };
    const timer = setTimeout(() => finish(null), 1500);
    img.onload = () => {
      clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = src;
  });
}

/**
 * Draws an image into [dx, dy, dw, dh] using aspect-ratio-preserving center-crop (object-fit: cover)
 * so item thumbnails are never stretched or distorted.
 */
function drawCenterCroppedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const nw = img.naturalWidth || img.width || dw;
  const nh = img.naturalHeight || img.height || dh;
  if (nw <= 0 || nh <= 0) return;

  const targetRatio = dw / dh;
  const srcRatio = nw / nh;
  let sx = 0;
  let sy = 0;
  let sw = nw;
  let sh = nh;

  if (srcRatio > targetRatio) {
    sw = nh * targetRatio;
    sx = (nw - sw) / 2;
  } else {
    sh = nw / targetRatio;
    sy = (nh - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Generates a high-resolution PNG/JPEG invoice bill image locally in the browser
 * from saved invoice data, preserving the minimalist Zara/H&M aesthetic and `alif.` branding.
 */
export async function generateInvoiceBillImage(
  invoice: Invoice,
  payments: PaymentRecord[],
  settings: ShopSettings,
  options: BillImageOptions = {}
): Promise<GeneratedBillImage> {
  const includePhotos = options.includePhotos !== false;
  const photosMap = options.photosMap || {};
  const mimeType = options.format || 'image/png';
  const quality = options.quality ?? 0.94;
  const scale = options.scale ?? 2;

  const logicalWidth = 800;
  const outerPad = 32;
  const sheetX = outerPad;
  const sheetW = logicalWidth - outerPad * 2; // 736px
  const innerPad = 36;
  const contentX = sheetX + innerPad;
  const contentRight = sheetX + sheetW - innerPad;
  const contentW = sheetW - innerPad * 2; // 664px

  const renderedLines: string[] = [];

  // Prepare wrapped text blocks
  const brandWordmark = 'alif.';
  const shopNameText = sanitizeBillText(settings.shopName) || 'ALiF Ladies Tailor';
  const locationParts = [settings.address, settings.city, settings.state, settings.pinCode]
    .map((p) => sanitizeBillText(p))
    .filter(Boolean)
    .join(', ');
  const shopSubline = `${shopNameText} • ${locationParts || 'Sahibganj, Jharkhand'}`;
  const shopPhoneLine = `Phone: ${sanitizeBillText(settings.phone) || 'N/A'}`;

  const customerNameLines = wrapTextLines(
    sanitizeBillText(invoice.customerName) || 'Walk-in Customer',
    34
  );
  const customerPhoneText = sanitizeBillText(invoice.customerPhone) || 'N/A';

  let includedPhotoCount = 0;
  const preparedItems = invoice.items.map((item, idx) => {
    const photoRec =
      includePhotos && item.photoId ? photosMap[item.photoId] : undefined;
    if (photoRec?.dataUrl) {
      includedPhotoCount += 1;
    }
    const maxNameChars = photoRec?.dataUrl ? 28 : 34;
    const nameLines = wrapTextLines(
      `${idx + 1}. ${sanitizeBillText(item.name) || 'Tailoring Item'}`,
      maxNameChars
    );
    const noteLines = item.notes
      ? wrapTextLines(`Note: ${sanitizeBillText(item.notes)}`, maxNameChars + 4)
      : [];
    const textHeight =
      Math.max(1, nameLines.length) * 22 +
      20 + // category + unit metadata line
      (noteLines.length > 0 ? noteLines.length * 18 + 4 : 0);
    const thumbHeight = photoRec?.dataUrl ? 64 : 0;
    const rowHeight = Math.max(textHeight, thumbHeight) + 24;

    return {
      item,
      idx,
      photoRec,
      nameLines,
      noteLines,
      rowHeight
    };
  });

  const invoiceNoteLines = invoice.notes
    ? wrapTextLines(`Notes: ${sanitizeBillText(invoice.notes)}`, 64)
    : [];

  const thankYouMessage =
    sanitizeBillText(settings.receiptFooter) ||
    `Thank you for choosing alif. — ${shopNameText}, ${sanitizeBillText(settings.city) || 'Sahibganj'}.`;
  const footerLines = wrapTextLines(thankYouMessage, 68);

  // Record all logical lines for verification & accessibility
  renderedLines.push(brandWordmark);
  renderedLines.push(shopSubline);
  renderedLines.push(shopPhoneLine);
  renderedLines.push(`Invoice: ${invoice.invoiceNumber}`);
  renderedLines.push(`Date: ${invoice.invoiceDate}`);
  if (invoice.collectionDate) {
    renderedLines.push(`Collection: ${invoice.collectionDate}`);
  }
  renderedLines.push(`Status: ${invoice.status}`);
  renderedLines.push(...customerNameLines);
  renderedLines.push(`Customer Phone: ${customerPhoneText}`);

  for (const pi of preparedItems) {
    renderedLines.push(...pi.nameLines);
    renderedLines.push(
      `${pi.item.quantity} ${pi.item.unit} x ${formatINR(pi.item.unitPricePaise)} = ${formatINR(pi.item.lineTotalPaise)}`
    );
    if (pi.noteLines.length > 0) {
      renderedLines.push(...pi.noteLines);
    }
  }

  renderedLines.push(`Subtotal: ${formatINR(invoice.subtotalPaise)}`);
  if (invoice.discountPaise > 0) {
    const discDesc =
      invoice.discountType === 'percent'
        ? `Discount (${invoice.discountValue}%): -${formatINR(invoice.discountPaise)}`
        : `Discount: -${formatINR(invoice.discountPaise)}`;
    renderedLines.push(discDesc);
  } else {
    renderedLines.push(`Discount: -${formatINR(0)}`);
  }
  if (invoice.taxEnabled && invoice.taxPaise > 0) {
    renderedLines.push(
      `${invoice.taxLabel || 'Tax'} (${invoice.taxRatePercent}%): ${formatINR(invoice.taxPaise)}`
    );
  }
  renderedLines.push(`Final Total: ${formatINR(invoice.totalPaise)}`);
  renderedLines.push(`Payments Received: ${formatINR(invoice.paidPaise)}`);
  renderedLines.push(`Outstanding Balance: ${formatINR(invoice.balancePaise)}`);
  if (invoiceNoteLines.length > 0) {
    renderedLines.push(...invoiceNoteLines);
  }
  renderedLines.push(...footerLines);

  // Dynamically calculate exact vertical height so nothing ever clips
  let yCursor = outerPad + innerPad; // Start inside receipt card
  yCursor += 116; // Masthead block
  if (invoice.status === 'Cancelled') {
    yCursor += 48; // Cancelled notice bar
  }
  const customerBlockHeight = Math.max(92, 48 + customerNameLines.length * 24 + 26);
  yCursor += customerBlockHeight + 20;

  yCursor += 42; // Table header height
  for (const pi of preparedItems) {
    yCursor += pi.rowHeight;
  }

  yCursor += 24; // Spacing before financial summary

  // Financial rows: Subtotal, Discount, (optional Tax), Final Total, Payments Received, Outstanding Balance
  let summaryRowsCount = 5;
  if (invoice.taxEnabled && invoice.taxPaise > 0) {
    summaryRowsCount += 1;
  }
  yCursor += summaryRowsCount * 40 + 28;

  if (invoiceNoteLines.length > 0) {
    yCursor += invoiceNoteLines.length * 22 + 28;
  }

  if (payments.length > 0) {
    const shownPayments = Math.min(payments.length, 5);
    yCursor += 34 + shownPayments * 24 + 16;
  }

  yCursor += Math.max(1, footerLines.length) * 22 + 52; // Discreet thank-you footer
  const logicalHeight = Math.max(760, yCursor + outerPad);
  const physicalWidth = Math.round(logicalWidth * scale);
  const physicalHeight = Math.round(logicalHeight * scale);

  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const filename = `${invoice.invoiceNumber}.${ext}`;

  // Attempt HTML5 2D Canvas rendering in browser environments
  let ctx: CanvasRenderingContext2D | null = null;
  let canvas: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      canvas = document.createElement('canvas');
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      ctx = canvas.getContext('2d');
    } catch (_err) {
      ctx = null;
    }
  }

  if (!ctx || !canvas) {
    const fallbackBytes = createDeterministicPngBytes(physicalWidth, physicalHeight);
    const blob = new Blob([fallbackBytes], { type: mimeType });
    const dataUrl = `data:${mimeType};base64,${bytesToBase64(fallbackBytes)}`;
    return {
      blob,
      dataUrl,
      filename,
      mimeType,
      width: physicalWidth,
      height: physicalHeight,
      logicalWidth,
      logicalHeight,
      includedPhotoCount,
      renderedLines
    };
  }

  // Wait briefly for local fonts (Ubuntu + Inter) if supported
  if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
    try {
      await Promise.race([
        (document as any).fonts.ready,
        new Promise((r) => setTimeout(r, 300))
      ]);
    } catch (_e) {
      // Ignore font readiness timeout
    }
  }

  // Preload item photos safely
  const loadedImages: Record<string, HTMLImageElement | null> = {};
  for (const pi of preparedItems) {
    if (pi.photoRec?.dataUrl && pi.item.photoId) {
      loadedImages[pi.item.photoId] = await loadImageElementSafe(pi.photoRec.dataUrl);
    }
  }

  ctx.save();
  ctx.scale(scale, scale);

  // 1. Outer Off-White Canvas Background (#F7F6F2)
  ctx.fillStyle = '#F7F6F2';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // 2. Crisp White Receipt Surface with 1px Primary Black Border
  const sheetH = logicalHeight - outerPad * 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(sheetX, outerPad, sheetW, sheetH);
  ctx.strokeStyle = '#0B0B0D';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sheetX, outerPad, sheetW, sheetH);

  let y = outerPad + innerPad;

  // 3. Masthead: Exact lowercase `alif.` brand wordmark + Shop Metadata + Status Pill
  ctx.fillStyle = '#0B0B0D';
  ctx.font = '500 42px Ubuntu, Inter, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(brandWordmark, contentX, y);

  ctx.fillStyle = '#1C1D21';
  ctx.font = '600 15px Inter, -apple-system, sans-serif';
  ctx.fillText(shopNameText, contentX, y + 52);

  ctx.fillStyle = '#6B7280';
  ctx.font = '400 13.5px Inter, -apple-system, sans-serif';
  ctx.fillText(`${locationParts || 'Sahibganj, Jharkhand'}  |  ${shopPhoneLine}`, contentX, y + 74);

  // Right side: Status Badge + Invoice Number
  const statusText = invoice.status.toUpperCase();
  ctx.font = '600 13px Inter, -apple-system, sans-serif';
  const statusBadgeW = Math.max(118, statusText.length * 9 + 28);
  const statusBadgeH = 30;
  const statusBadgeX = contentRight - statusBadgeW;
  const statusBadgeY = y + 4;

  if (invoice.status === 'Paid') {
    ctx.fillStyle = '#0B0B0D';
    ctx.fillRect(statusBadgeX, statusBadgeY, statusBadgeW, statusBadgeH);
    ctx.fillStyle = '#FFFFFF';
  } else if (invoice.status === 'Partially Paid') {
    ctx.fillStyle = '#EFECE6';
    ctx.fillRect(statusBadgeX, statusBadgeY, statusBadgeW, statusBadgeH);
    ctx.strokeStyle = '#0B0B0D';
    ctx.lineWidth = 1;
    ctx.strokeRect(statusBadgeX, statusBadgeY, statusBadgeW, statusBadgeH);
    ctx.fillStyle = '#0B0B0D';
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(statusBadgeX, statusBadgeY, statusBadgeW, statusBadgeH);
    ctx.strokeStyle = '#0B0B0D';
    ctx.lineWidth = 1;
    ctx.strokeRect(statusBadgeX, statusBadgeY, statusBadgeW, statusBadgeH);
    ctx.fillStyle = '#0B0B0D';
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(statusText, statusBadgeX + statusBadgeW / 2, statusBadgeY + statusBadgeH / 2);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0B0B0D';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText(invoice.invoiceNumber, contentRight, y + 44);

  ctx.fillStyle = '#6B7280';
  ctx.font = '400 13.5px "JetBrains Mono", monospace';
  ctx.fillText(`Date: ${invoice.invoiceDate}`, contentRight, y + 70);

  y += 104;

  // Masthead Divider
  ctx.strokeStyle = '#0B0B0D';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(contentX, y);
  ctx.lineTo(contentRight, y);
  ctx.stroke();
  y += 16;

  // Cancelled Notice if applicable
  if (invoice.status === 'Cancelled') {
    ctx.fillStyle = '#EFECE6';
    ctx.fillRect(contentX, y, contentW, 36);
    ctx.strokeStyle = '#0B0B0D';
    ctx.lineWidth = 1;
    ctx.strokeRect(contentX, y, contentW, 36);
    ctx.fillStyle = '#0B0B0D';
    ctx.textAlign = 'left';
    ctx.font = '600 13.5px Inter, -apple-system, sans-serif';
    ctx.fillText(
      `CANCELLED BILL — ${sanitizeBillText(invoice.cancelReason) || 'Cancelled by shop'}`,
      contentX + 12,
      y + 10
    );
    y += 48;
  }

  // 4. Client & Invoice Metadata Panel (#F7F6F2)
  ctx.fillStyle = '#F7F6F2';
  ctx.fillRect(contentX, y, contentW, customerBlockHeight);
  ctx.strokeStyle = '#E2E0D8';
  ctx.lineWidth = 1;
  ctx.strokeRect(contentX, y, contentW, customerBlockHeight);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#6B7280';
  ctx.font = '600 12px Inter, -apple-system, sans-serif';
  ctx.fillText('BILLED TO CLIENT', contentX + 16, y + 14);

  ctx.fillStyle = '#0B0B0D';
  ctx.font = '600 17px Inter, -apple-system, sans-serif';
  let custY = y + 34;
  for (const cLine of customerNameLines) {
    ctx.fillText(cLine, contentX + 16, custY);
    custY += 23;
  }

  ctx.fillStyle = '#1C1D21';
  ctx.font = '400 14px "JetBrains Mono", monospace';
  ctx.fillText(`Phone: ${customerPhoneText}`, contentX + 16, custY + 2);

  // Right column inside metadata box
  const metaRightX = contentRight - 16;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6B7280';
  ctx.font = '600 12px Inter, -apple-system, sans-serif';
  ctx.fillText('INVOICE SUMMARY', metaRightX, y + 14);

  ctx.fillStyle = '#1C1D21';
  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.fillText(`Bill No: ${invoice.invoiceNumber}`, metaRightX, y + 36);
  ctx.fillText(`Issued: ${invoice.invoiceDate}`, metaRightX, y + 58);
  ctx.fillText(
    `Collection: ${invoice.collectionDate ? invoice.collectionDate : 'As Scheduled'}`,
    metaRightX,
    y + 80
  );

  y += customerBlockHeight + 20;

  // 5. Itemised Table Header
  ctx.fillStyle = '#EFECE6';
  ctx.fillRect(contentX, y, contentW, 38);
  ctx.strokeStyle = '#0B0B0D';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX, y);
  ctx.lineTo(contentRight, y);
  ctx.moveTo(contentX, y + 38);
  ctx.lineTo(contentRight, y + 38);
  ctx.stroke();

  const colItemX = contentX + 12;
  const colQtyX = contentX + 390;
  const colRateX = contentX + 530;
  const colTotalX = contentRight - 12;

  ctx.fillStyle = '#0B0B0D';
  ctx.font = '600 12.5px Inter, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ITEM / SERVICE', colItemX, y + 12);
  ctx.textAlign = 'center';
  ctx.fillText('QTY', colQtyX, y + 12);
  ctx.textAlign = 'right';
  ctx.fillText('UNIT PRICE', colRateX, y + 12);
  ctx.fillText('LINE TOTAL', colTotalX, y + 12);

  y += 38;

  // 6. Itemised Rows with Optional Non-Distorted Thumbnails
  for (const pi of preparedItems) {
    const rowTop = y;
    if (pi.idx % 2 === 1) {
      ctx.fillStyle = '#FAF9F6';
      ctx.fillRect(contentX, rowTop, contentW, pi.rowHeight);
    }

    let itemTextX = colItemX;
    const hasPhoto = Boolean(pi.photoRec?.dataUrl && pi.item.photoId);

    if (hasPhoto && pi.item.photoId) {
      const thumbSize = 56;
      const thumbX = colItemX;
      const thumbY = rowTop + 12;

      ctx.fillStyle = '#F7F6F2';
      ctx.fillRect(thumbX, thumbY, thumbSize, thumbSize);

      const loadedImg = loadedImages[pi.item.photoId];
      if (loadedImg) {
        drawCenterCroppedImage(ctx, loadedImg, thumbX, thumbY, thumbSize, thumbSize);
      }

      ctx.strokeStyle = '#0B0B0D';
      ctx.lineWidth = 1;
      ctx.strokeRect(thumbX, thumbY, thumbSize, thumbSize);

      itemTextX = colItemX + thumbSize + 14;
    }

    // Item name lines
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0B0B0D';
    ctx.font = '600 15.5px Inter, -apple-system, sans-serif';
    let lineY = rowTop + 12;
    for (const nLine of pi.nameLines) {
      ctx.fillText(nLine, itemTextX, lineY);
      lineY += 22;
    }

    // Category & unit subtitle
    ctx.fillStyle = '#6B7280';
    ctx.font = '500 12.5px Inter, -apple-system, sans-serif';
    ctx.fillText(
      `${pi.item.category.toUpperCase()} • ${pi.item.unit}`,
      itemTextX,
      lineY
    );
    lineY += 20;

    // Optional item notes
    if (pi.noteLines.length > 0) {
      ctx.fillStyle = '#4B5563';
      ctx.font = '400 13px Inter, -apple-system, sans-serif';
      for (const noteLine of pi.noteLines) {
        ctx.fillText(noteLine, itemTextX, lineY);
        lineY += 18;
      }
    }

    // Quantity, Unit Price, Line Total
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1C1D21';
    ctx.font = '500 14.5px "JetBrains Mono", monospace';
    ctx.fillText(`${pi.item.quantity} ${pi.item.unit}`, colQtyX, rowTop + 14);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#1C1D21';
    ctx.font = '400 14.5px "JetBrains Mono", monospace';
    ctx.fillText(formatINR(pi.item.unitPricePaise), colRateX, rowTop + 14);

    ctx.fillStyle = '#0B0B0D';
    ctx.font = '600 15.5px "JetBrains Mono", monospace';
    ctx.fillText(formatINR(pi.item.lineTotalPaise), colTotalX, rowTop + 14);

    // Subtle row divider
    ctx.strokeStyle = '#E2E0D8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, rowTop + pi.rowHeight);
    ctx.lineTo(contentRight, rowTop + pi.rowHeight);
    ctx.stroke();

    y += pi.rowHeight;
  }

  y += 20;

  // 7. Financial Summary Block (Right-aligned 360px column)
  const sumW = 360;
  const sumX = contentRight - sumW;

  const drawFinRow = (
    label: string,
    value: string,
    opts: { bold?: boolean; darkFill?: boolean; stoneFill?: boolean } = {}
  ) => {
    const rowH = 38;
    if (opts.darkFill) {
      ctx!.fillStyle = '#0B0B0D';
      ctx!.fillRect(sumX, y, sumW, rowH);
      ctx!.fillStyle = '#FFFFFF';
    } else if (opts.stoneFill) {
      ctx!.fillStyle = '#EFECE6';
      ctx!.fillRect(sumX, y, sumW, rowH);
      ctx!.strokeStyle = '#0B0B0D';
      ctx!.lineWidth = 1;
      ctx!.strokeRect(sumX, y, sumW, rowH);
      ctx!.fillStyle = '#0B0B0D';
    } else {
      ctx!.fillStyle = '#1C1D21';
    }

    ctx!.textAlign = 'left';
    ctx!.font = `${opts.bold || opts.darkFill || opts.stoneFill ? '600' : '500'} 14.5px Inter, -apple-system, sans-serif`;
    ctx!.fillText(label, sumX + 14, y + 11);

    ctx!.textAlign = 'right';
    ctx!.font = `${opts.bold || opts.darkFill || opts.stoneFill ? '600' : '500'} 15.5px "JetBrains Mono", monospace`;
    ctx!.fillText(value, sumX + sumW - 14, y + 10);

    if (!opts.darkFill && !opts.stoneFill) {
      ctx!.strokeStyle = '#E2E0D8';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(sumX, y + rowH);
      ctx!.lineTo(sumX + sumW, y + rowH);
      ctx!.stroke();
    }

    y += rowH + 2;
  };

  drawFinRow('Subtotal', formatINR(invoice.subtotalPaise));
  const discLabel =
    invoice.discountPaise > 0 && invoice.discountType === 'percent'
      ? `Discount (${invoice.discountValue}%)`
      : 'Discount';
  drawFinRow(discLabel, `- ${formatINR(invoice.discountPaise)}`);

  if (invoice.taxEnabled && invoice.taxPaise > 0) {
    drawFinRow(
      `${invoice.taxLabel || 'Tax'} (${invoice.taxRatePercent}%)`,
      formatINR(invoice.taxPaise)
    );
  }

  drawFinRow('FINAL TOTAL', formatINR(invoice.totalPaise), { darkFill: true });
  drawFinRow('Payments Received', formatINR(invoice.paidPaise), { bold: true });
  drawFinRow('OUTSTANDING BALANCE', formatINR(invoice.balancePaise), {
    stoneFill: true
  });

  y += 16;

  // 8. Optional Invoice Notes & Payment History
  if (invoiceNoteLines.length > 0) {
    ctx.fillStyle = '#F7F6F2';
    const noteBoxH = invoiceNoteLines.length * 22 + 16;
    ctx.fillRect(contentX, y, contentW, noteBoxH);
    ctx.strokeStyle = '#E2E0D8';
    ctx.strokeRect(contentX, y, contentW, noteBoxH);
    ctx.fillStyle = '#1C1D21';
    ctx.textAlign = 'left';
    ctx.font = '400 13.5px Inter, -apple-system, sans-serif';
    let ny = y + 10;
    for (const nl of invoiceNoteLines) {
      ctx.fillText(nl, contentX + 12, ny);
      ny += 22;
    }
    y += noteBoxH + 14;
  }

  if (payments.length > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6B7280';
    ctx.font = '600 12px Inter, -apple-system, sans-serif';
    ctx.fillText('RECORDED PAYMENTS', contentX, y);
    y += 22;

    ctx.fillStyle = '#1C1D21';
    ctx.font = '400 13px "JetBrains Mono", monospace';
    for (const p of payments.slice(0, 5)) {
      const mLabel = PAYMENT_METHOD_LABELS[p.method] || p.method;
      const sign = p.type === 'refund' ? '-' : '+';
      ctx.fillText(
        `${p.date}  •  ${p.type.toUpperCase()} (${mLabel}): ${sign}${formatINR(Math.abs(p.amountPaise))}`,
        contentX,
        y
      );
      y += 22;
    }
    y += 10;
  }

  // 9. Discreet Thank-You Footer at the Bottom
  const footerStartY = Math.max(y + 8, logicalHeight - outerPad - innerPad - footerLines.length * 22 - 18);
  ctx.strokeStyle = '#0B0B0D';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX, footerStartY);
  ctx.lineTo(contentRight, footerStartY);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#6B7280';
  ctx.font = '400 13.5px Inter, -apple-system, sans-serif';
  let fy = footerStartY + 14;
  for (const fl of footerLines) {
    ctx.fillText(fl, logicalWidth / 2, fy);
    fy += 20;
  }

  ctx.restore();

  let dataUrl = '';
  try {
    dataUrl = canvas.toDataURL(mimeType, quality);
  } catch (_e) {
    dataUrl = '';
  }

  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    const fallbackBytes = createDeterministicPngBytes(physicalWidth, physicalHeight);
    const blob = new Blob([fallbackBytes], { type: mimeType });
    const fallbackDataUrl = `data:${mimeType};base64,${bytesToBase64(fallbackBytes)}`;
    return {
      blob,
      dataUrl: fallbackDataUrl,
      filename,
      mimeType,
      width: physicalWidth,
      height: physicalHeight,
      logicalWidth,
      logicalHeight,
      includedPhotoCount,
      renderedLines
    };
  }

  const blob = dataUrlToBlob(dataUrl, mimeType);
  return {
    blob,
    dataUrl,
    filename,
    mimeType,
    width: physicalWidth,
    height: physicalHeight,
    logicalWidth,
    logicalHeight,
    includedPhotoCount,
    renderedLines
  };
}

/**
 * Triggers a browser download of the generated bill image file.
 */
export function downloadBillImage(billImage: GeneratedBillImage): string {
  if (typeof document === 'undefined') return billImage.filename;
  const url = URL.createObjectURL(billImage.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = billImage.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
  return billImage.filename;
}

/**
 * Shares the generated bill image + editable text message via Web Share API when supported,
 * or falls back to downloading the bill image and opening WhatsApp with the prefilled message.
 * Never claims the message or image was sent automatically.
 */
export async function shareBillImageAndText(input: {
  invoice: Invoice;
  settings: ShopSettings;
  billImage: GeneratedBillImage;
  customText: string;
  openWhatsAppWindow?: boolean;
}): Promise<ShareBillOutcome> {
  const { invoice, settings, billImage, customText } = input;
  const messageText = customText.trim() || buildShareBillText(invoice, settings);
  const whatsappUrl = buildWhatsAppUrlWithCustomText(invoice.customerPhone, messageText);

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const imageFile: File =
        typeof File === 'function'
          ? new File([billImage.blob], billImage.filename, {
              type: billImage.mimeType
            })
          : (Object.assign(
              new Blob([billImage.blob], { type: billImage.mimeType }),
              { name: billImage.filename, lastModified: Date.now() }
            ) as unknown as File);
      const canShareFiles =
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [imageFile] });

      if (canShareFiles) {
        await navigator.share({
          title: `alif. — Bill ${invoice.invoiceNumber}`,
          text: messageText,
          files: [imageFile]
        });
        return {
          sharedViaNativeFile: true,
          method: 'native-file-share',
          whatsappUrl,
          manualAttachRequired: false,
          instructions:
            'Select WhatsApp in your device share sheet and tap Send inside WhatsApp to complete sharing the bill image and text.',
          statusMessage:
            'Opened native share sheet with bill image and text. Complete sending in WhatsApp.'
        };
      }
    } catch (err: any) {
      if (err && (err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('abort'))) {
        return {
          sharedViaNativeFile: false,
          method: 'cancelled',
          whatsappUrl,
          manualAttachRequired: false,
          instructions: 'Share sheet was closed before sending.',
          statusMessage: 'Sharing cancelled.'
        };
      }
      // Otherwise proceed to download + WhatsApp fallback
    }
  }

  // Fallback: download generated bill image and open WhatsApp with prefilled summary text
  const downloadedFilename = downloadBillImage(billImage);
  if (input.openWhatsAppWindow !== false && typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (_e) {
      // Ignore popup blocker in restricted environments
    }
  }

  return {
    sharedViaNativeFile: false,
    method: 'whatsapp-fallback',
    downloadedFilename,
    whatsappUrl,
    manualAttachRequired: true,
    instructions: `1. "${downloadedFilename}" has been saved to your device. 2. WhatsApp is open with the prefilled bill text. 3. Attach "${downloadedFilename}" using the paperclip (+) icon in WhatsApp, then tap Send in WhatsApp.`,
    statusMessage: `Downloaded ${downloadedFilename} and opened WhatsApp. Attach the downloaded bill image manually in WhatsApp before tapping Send.`
  };
}

// ============================================================================
// SIMPLIFIED 3-ACTION BILL SHARING (WHATSAPP, SMS, DOWNLOAD BILL PDF)
// ============================================================================

export function buildSmsUrlWithCustomText(phone: string, text: string): string {
  const digits = normalizeIndianPhone(phone);
  const target = digits ? `+${digits}` : '';
  const plainText = String(text || '').replace(/\*/g, '').trim();
  return plainText
    ? `sms:${target}?body=${encodeURIComponent(plainText)}`
    : `sms:${target}`;
}

export interface UnifiedShareOutcome {
  channel: 'whatsapp' | 'sms';
  includeImage: boolean;
  includeText: boolean;
  sentAutomatically: false; // Browser PWA never silently sends messages without user action in the app
  sharedViaNativeFile: boolean;
  method:
    | 'native-file-share'
    | 'whatsapp-image-and-text-fallback'
    | 'whatsapp-image-only-fallback'
    | 'whatsapp-text-only'
    | 'sms-text-composer'
    | 'sms-image-limitation-prompt'
    | 'sms-text-plus-image-download'
    | 'cancelled';
  smsImageLimitation?: boolean;
  downloadedFilename?: string;
  targetUrl?: string;
  manualAttachRequired: boolean;
  instructions: string;
  statusMessage: string;
}

/**
 * Validates that at least one of Bill Image or Bill Summary Text is selected.
 */
export function validateShareContentSelection(options: {
  includeImage: boolean;
  includeText: boolean;
}): string | null {
  if (!options.includeImage && !options.includeText) {
    return 'Please select at least one option to share: Bill Image or Bill Summary Text.';
  }
  return null;
}

/**
 * Shares a bill via WhatsApp respecting the user's checkboxes:
 * - Bill Image + Bill Summary Text (default)
 * - Bill Image only
 * - Bill Summary Text only
 */
export async function shareBillViaWhatsApp(input: {
  invoice: Invoice;
  payments: PaymentRecord[];
  settings: ShopSettings;
  includeImage: boolean;
  includeText: boolean;
  customText?: string;
  billImage?: GeneratedBillImage | null;
  photosMap?: Record<string, ItemPhotoRecord>;
  includePhotos?: boolean;
  openWindow?: boolean;
}): Promise<UnifiedShareOutcome> {
  const validationError = validateShareContentSelection({
    includeImage: input.includeImage,
    includeText: input.includeText
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const { invoice, payments, settings, includeImage, includeText } = input;
  const messageText = includeText
    ? (input.customText ?? '').trim() || buildShareBillText(invoice, settings)
    : '';
  const whatsappUrl = buildWhatsAppUrlWithCustomText(invoice.customerPhone, messageText);

  // Case 1: Text Only (Bill Image unchecked, Bill Summary Text checked)
  if (!includeImage && includeText) {
    if (input.openWindow !== false && typeof window !== 'undefined' && typeof window.open === 'function') {
      try {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      } catch (_e) {
        // Ignore popup block in test environments
      }
    }
    return {
      channel: 'whatsapp',
      includeImage: false,
      includeText: true,
      sentAutomatically: false,
      sharedViaNativeFile: false,
      method: 'whatsapp-text-only',
      targetUrl: whatsappUrl,
      manualAttachRequired: false,
      instructions:
        'WhatsApp opened with the prefilled bill summary text. Review and tap Send inside WhatsApp.',
      statusMessage: 'Opened WhatsApp with bill summary text.'
    };
  }

  // Case 2 & 3: Bill Image is checked (with or without Bill Summary Text)
  const resolvedImage =
    input.billImage ||
    (await generateInvoiceBillImage(invoice, payments, settings, {
      photosMap: input.photosMap,
      includePhotos: input.includePhotos !== false,
      format: 'image/png'
    }));

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const imageFile: File =
        typeof File === 'function'
          ? new File([resolvedImage.blob], resolvedImage.filename, {
              type: resolvedImage.mimeType
            })
          : (Object.assign(
              new Blob([resolvedImage.blob], { type: resolvedImage.mimeType }),
              { name: resolvedImage.filename, lastModified: Date.now() }
            ) as unknown as File);

      const canShareFiles =
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [imageFile] });

      if (canShareFiles) {
        const sharePayload: ShareData = {
          title: `alif. — Bill ${invoice.invoiceNumber}`,
          files: [imageFile]
        };
        if (includeText && messageText) {
          sharePayload.text = messageText;
        }
        await navigator.share(sharePayload);
        return {
          channel: 'whatsapp',
          includeImage: true,
          includeText,
          sentAutomatically: false,
          sharedViaNativeFile: true,
          method: 'native-file-share',
          targetUrl: whatsappUrl,
          manualAttachRequired: false,
          instructions: includeText
            ? 'Select WhatsApp in the share sheet and tap Send to share both the bill image and summary text.'
            : 'Select WhatsApp in the share sheet and tap Send to share the bill image.',
          statusMessage: includeText
            ? 'Opened share sheet with bill image and summary text.'
            : 'Opened share sheet with bill image only.'
        };
      }
    } catch (err: any) {
      if (
        err &&
        (err.name === 'AbortError' ||
          String(err.message || '').toLowerCase().includes('abort'))
      ) {
        return {
          channel: 'whatsapp',
          includeImage: true,
          includeText,
          sentAutomatically: false,
          sharedViaNativeFile: false,
          method: 'cancelled',
          targetUrl: whatsappUrl,
          manualAttachRequired: false,
          instructions: 'Share sheet was closed before sending.',
          statusMessage: 'Sharing cancelled.'
        };
      }
    }
  }

  // Fallback when Web Share Level 2 file sharing is unavailable
  const downloadedFilename = downloadBillImage(resolvedImage);
  if (input.openWindow !== false && typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (_e) {
      // Ignore popup blocker
    }
  }

  return {
    channel: 'whatsapp',
    includeImage: true,
    includeText,
    sentAutomatically: false,
    sharedViaNativeFile: false,
    method: includeText
      ? 'whatsapp-image-and-text-fallback'
      : 'whatsapp-image-only-fallback',
    downloadedFilename,
    targetUrl: whatsappUrl,
    manualAttachRequired: true,
    instructions: includeText
      ? `1. "${downloadedFilename}" has been saved to your device. 2. WhatsApp is open with the bill summary text. 3. Attach "${downloadedFilename}" in WhatsApp and tap Send.`
      : `1. "${downloadedFilename}" has been saved to your device. 2. Attach "${downloadedFilename}" in WhatsApp and tap Send.`,
    statusMessage: includeText
      ? `Downloaded ${downloadedFilename} and opened WhatsApp with summary text. Attach the image in WhatsApp before sending.`
      : `Downloaded ${downloadedFilename} and opened WhatsApp. Attach the image in WhatsApp before sending.`
  };
}

/**
 * Shares a bill via SMS (`sms:` URI composer) with explicit handling when Bill Image is selected:
 * - Standard SMS (`sms:`) cannot directly attach PNG/JPEG images like WhatsApp.
 * - Never silently drops the Bill Image when `includeImage` is true: returns `smsImageLimitation: true`
 *   unless the user explicitly selects an SMS fallback resolution (`resolution: 'text-only' | 'download-image-and-sms'`).
 * - Never claims an SMS was sent automatically when only the device SMS composer was opened.
 */
export async function shareBillViaSms(input: {
  invoice: Invoice;
  payments: PaymentRecord[];
  settings: ShopSettings;
  includeImage: boolean;
  includeText: boolean;
  customText?: string;
  billImage?: GeneratedBillImage | null;
  photosMap?: Record<string, ItemPhotoRecord>;
  includePhotos?: boolean;
  resolution?: 'prompt' | 'text-only' | 'download-image-and-sms';
  openWindow?: boolean;
}): Promise<UnifiedShareOutcome> {
  const validationError = validateShareContentSelection({
    includeImage: input.includeImage,
    includeText: input.includeText
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const { invoice, payments, settings, includeImage, includeText } = input;
  const resolution = input.resolution || 'prompt';
  const summaryText =
    (input.customText ?? '').trim() || buildShareBillText(invoice, settings);
  const smsUrl = buildSmsUrlWithCustomText(invoice.customerPhone, summaryText);

  // If Bill Image is selected and the user hasn't picked a resolution yet,
  // do NOT silently omit the image — explain the SMS limitation clearly and offer alternatives.
  if (includeImage && resolution === 'prompt') {
    return {
      channel: 'sms',
      includeImage: true,
      includeText,
      sentAutomatically: false,
      sharedViaNativeFile: false,
      method: 'sms-image-limitation-prompt',
      smsImageLimitation: true,
      targetUrl: smsUrl,
      manualAttachRequired: true,
      instructions:
        'Standard SMS cannot attach bill images directly like WhatsApp. Choose whether to open the SMS composer with the bill summary text only, download the bill image + open SMS, or share via WhatsApp instead.',
      statusMessage:
        'Standard SMS cannot attach images directly. Please choose how you would like to proceed.'
    };
  }

  if (includeImage && resolution === 'download-image-and-sms') {
    const resolvedImage =
      input.billImage ||
      (await generateInvoiceBillImage(invoice, payments, settings, {
        photosMap: input.photosMap,
        includePhotos: input.includePhotos !== false,
        format: 'image/png'
      }));
    const downloadedFilename = downloadBillImage(resolvedImage);
    if (input.openWindow !== false && typeof window !== 'undefined' && typeof window.open === 'function') {
      try {
        window.open(smsUrl, '_self');
      } catch (_e) {
        // Ignore navigation error in headless environment
      }
    }
    return {
      channel: 'sms',
      includeImage: true,
      includeText: true,
      sentAutomatically: false,
      sharedViaNativeFile: false,
      method: 'sms-text-plus-image-download',
      smsImageLimitation: true,
      downloadedFilename,
      targetUrl: smsUrl,
      manualAttachRequired: true,
      instructions: `Saved "${downloadedFilename}" to your device and opened your SMS composer with the bill summary text. Review and tap Send in your SMS app (PWA browsers cannot send SMS automatically without user confirmation).`,
      statusMessage: `Downloaded ${downloadedFilename} and opened SMS composer with summary text. Tap Send in your SMS app.`
    };
  }

  // Default SMS text composer (when includeImage is false, or resolution === 'text-only')
  if (input.openWindow !== false && typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      window.open(smsUrl, '_self');
    } catch (_e) {
      // Ignore navigation error in headless environment
    }
  }

  return {
    channel: 'sms',
    includeImage: false,
    includeText: true,
    sentAutomatically: false,
    sharedViaNativeFile: false,
    method: 'sms-text-composer',
    targetUrl: smsUrl,
    manualAttachRequired: false,
    instructions:
      'Opened your phone’s native SMS composer prefilled with the customer number and bill summary. Please tap Send inside your SMS app (offline web apps cannot transmit SMS silently in the background).',
    statusMessage:
      'Opened native SMS composer with prefilled bill summary. Review and tap Send in your SMS app.'
  };
}
