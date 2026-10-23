import {
  CatalogueItem,
  Customer,
  Invoice,
  PaymentRecord,
  PeriodReport
} from '../types/billing';
import { paiseToRupeesString, PAYMENT_METHOD_LABELS } from './currency';

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...bodyLines].join('\r\n');
}

export function generateInvoicesCsv(invoices: Invoice[]): string {
  const headers = [
    'Invoice Number',
    'Invoice Date',
    'Collection Date',
    'Customer Name',
    'Customer Phone',
    'Status',
    'Items Summary',
    'Subtotal (INR)',
    'Discount (INR)',
    'Tax (INR)',
    'Final Total (INR)',
    'Advance (INR)',
    'Total Net Paid (INR)',
    'Balance Due (INR)',
    'Notes',
    'Cancel Reason'
  ];

  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    inv.invoiceDate,
    inv.collectionDate || '',
    inv.customerName,
    inv.customerPhone,
    inv.status,
    inv.items.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join('; '),
    paiseToRupeesString(inv.subtotalPaise),
    paiseToRupeesString(inv.discountPaise),
    paiseToRupeesString(inv.taxPaise),
    paiseToRupeesString(inv.totalPaise),
    paiseToRupeesString(inv.advancePaise),
    paiseToRupeesString(inv.paidPaise),
    paiseToRupeesString(inv.balancePaise),
    inv.notes || '',
    inv.cancelReason || ''
  ]);

  return rowsToCsv(headers, rows);
}

export function generatePaymentsCsv(payments: PaymentRecord[]): string {
  const headers = [
    'Payment ID',
    'Date',
    'Invoice Number',
    'Customer Name',
    'Type',
    'Method',
    'Amount (INR)',
    'Note',
    'Recorded At'
  ];

  const rows = payments.map((p) => [
    p.id,
    p.date,
    p.invoiceNumber,
    p.customerName,
    p.type,
    PAYMENT_METHOD_LABELS[p.method] || p.method,
    paiseToRupeesString(p.amountPaise),
    p.note || '',
    p.createdAt
  ]);

  return rowsToCsv(headers, rows);
}

export function generateCustomersCsv(customers: Customer[]): string {
  const headers = ['Customer ID', 'Name', 'Phone', 'Notes', 'Created At', 'Updated At'];
  const rows = customers.map((c) => [
    c.id,
    c.name,
    c.phone,
    c.notes || '',
    c.createdAt,
    c.updatedAt
  ]);
  return rowsToCsv(headers, rows);
}

export function generateCatalogueCsv(catalogue: CatalogueItem[]): string {
  const headers = [
    'Item ID',
    'Name',
    'Category',
    'Default Price (INR)',
    'Min Price Hint (INR)',
    'Max Price Hint (INR)',
    'Cost Price (INR)',
    'Unit',
    'Active',
    'Description'
  ];
  const rows = catalogue.map((item) => [
    item.id,
    item.name,
    item.category,
    paiseToRupeesString(item.defaultPricePaise),
    item.minPricePaise !== undefined ? paiseToRupeesString(item.minPricePaise) : '',
    item.maxPricePaise !== undefined ? paiseToRupeesString(item.maxPricePaise) : '',
    item.costPricePaise !== undefined ? paiseToRupeesString(item.costPricePaise) : '',
    item.unit,
    item.isActive ? 'Yes' : 'No',
    item.description || ''
  ]);
  return rowsToCsv(headers, rows);
}

export function generatePeriodReportCsv(report: PeriodReport): string {
  const summaryRows: unknown[][] = [
    ['Report Period', `${report.startDate} to ${report.endDate}`],
    ['Active Invoices (Excl. Cancelled)', report.activeInvoiceCount],
    ['Cancelled Invoices', report.cancelledInvoiceCount],
    ['Invoiced Sales Value (INR)', paiseToRupeesString(report.invoicedSalesPaise)],
    ['Discounts Given (INR)', paiseToRupeesString(report.discountsGivenPaise)],
    ['Gross Payments Received in Period (INR)', paiseToRupeesString(report.paymentsReceivedPaise)],
    ['Refunds Issued in Period (INR)', paiseToRupeesString(report.refundsIssuedPaise)],
    ['Net Cash/Payments Collected in Period (INR)', paiseToRupeesString(report.netCashCollectedPaise)],
    ['Outstanding Balance on Active Bills (INR)', paiseToRupeesString(report.outstandingBalancePaise)],
    ['', ''],
    ['Category Breakdown', 'Quantity', 'Revenue (INR)', 'Estimated Cost (INR)']
  ];

  for (const cat of report.categoryBreakdown) {
    summaryRows.push([
      cat.label,
      cat.quantity,
      paiseToRupeesString(cat.revenuePaise),
      paiseToRupeesString(cat.estimatedCostPaise)
    ]);
  }

  summaryRows.push(['', '', '', '']);
  summaryRows.push(['Item Breakdown', 'Category', 'Quantity', 'Revenue (INR)']);
  for (const item of report.itemBreakdown) {
    summaryRows.push([
      item.name,
      item.category,
      item.quantity,
      paiseToRupeesString(item.revenuePaise)
    ]);
  }

  return rowsToCsv(['Metric / Item', 'Value / Category', 'Extra 1', 'Extra 2'], summaryRows);
}

export function triggerTextFileDownload(filename: string, content: string, mimeType = 'text/csv;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
