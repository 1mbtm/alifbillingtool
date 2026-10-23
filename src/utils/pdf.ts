import { Invoice, PaymentRecord, ShopSettings } from '../types/billing';
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
  drawText(settings.shopName || 'alif.', margin + 18, 62, {
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
    settings.receiptFooter || 'Thank you for choosing alif., Sahibganj.',
    margin,
    footerY + 16,
    { size: 8.5, color: [0.35, 0.37, 0.40] }
  );
  drawText('Authorised Signatory — alif.', pageWidth - margin, footerY + 32, {
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
