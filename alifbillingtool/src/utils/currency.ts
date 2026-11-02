import {
  DiscountType,
  InvoiceLineItem,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus
} from '../types/billing';

/**
 * Converts a rupee value (string or number, e.g. "450", "450.5", 450.25)
 * into exact integer paise without floating-point drift.
 */
export function rupeesToPaise(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error('Invalid currency amount');
    }
    return Math.round(input * 100);
  }
  const trimmed = String(input ?? '').trim().replace(/,/g, '').replace(/^₹\s*/, '');
  if (!trimmed) return 0;
  if (!/^-?\d+(\.\d{0,2})?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid currency format: "${input}"`);
    }
    return Math.round(parsed * 100);
  }
  const isNegative = trimmed.startsWith('-');
  const clean = isNegative ? trimmed.slice(1) : trimmed;
  const [wholePart = '0', fracPart = ''] = clean.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const paise = parseInt(wholePart, 10) * 100 + parseInt(paddedFrac, 10);
  return isNegative ? -paise : paise;
}

/**
 * Converts integer paise to a plain rupee string suitable for input fields.
 */
export function paiseToRupeesString(paise: number): string {
  if (!Number.isFinite(paise)) return '0';
  const rounded = Math.round(paise);
  const isNeg = rounded < 0;
  const abs = Math.abs(rounded);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const formatted = rem === 0 ? `${rupees}` : `${rupees}.${String(rem).padStart(2, '0')}`;
  return isNeg ? `-${formatted}` : formatted;
}

/**
 * Formats integer paise into Indian Rupee format (e.g., ₹1,250 or ₹1,25,000.50).
 */
export function formatINR(paise: number, alwaysShowPaise = false): string {
  if (!Number.isFinite(paise)) return '₹0';
  const rounded = Math.round(paise);
  const isNegative = rounded < 0;
  const absPaise = Math.abs(rounded);
  const wholeRupees = Math.floor(absPaise / 100);
  const remPaise = absPaise % 100;

  const rupeeStr = formatIndianInteger(wholeRupees);
  const fracStr = remPaise > 0 || alwaysShowPaise ? `.${String(remPaise).padStart(2, '0')}` : '';
  return `${isNegative ? '-₹' : '₹'}${rupeeStr}${fracStr}`;
}

function formatIndianInteger(num: number): string {
  const s = String(Math.floor(Math.abs(num)));
  if (s.length <= 3) return s;
  const lastThree = s.slice(-3);
  const otherNumbers = s.slice(0, -3);
  const grouped = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${grouped},${lastThree}`;
}

/**
 * Calculates exact integer paise for a single line item.
 * Quantity can be integer or decimal (e.g. 2.5 mtr of fabric/lace).
 */
export function calculateLineTotalPaise(quantity: number, unitPricePaise: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }
  if (!Number.isFinite(unitPricePaise) || unitPricePaise < 0) {
    throw new Error('Unit price cannot be negative');
  }
  const intUnitPaise = Math.round(unitPricePaise);
  // Multiply using integer thousandths of quantity to avoid float drift
  const qtyThousandths = Math.round(quantity * 1000);
  return Math.round((qtyThousandths * intUnitPaise) / 1000);
}

export interface InvoiceTotalsInput {
  items: Pick<InvoiceLineItem, 'quantity' | 'unitPricePaise'>[];
  discountType: DiscountType;
  discountValue: number; // If 'flat', integer paise; if 'percent', percentage (0..100)
  taxEnabled?: boolean;
  taxRatePercent?: number;
}

export interface InvoiceTotalsResult {
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
}

export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotalsResult {
  let subtotalPaise = 0;
  for (const item of input.items) {
    const lineTotal = calculateLineTotalPaise(item.quantity, item.unitPricePaise);
    subtotalPaise += lineTotal;
  }

  let rawDiscountPaise = 0;
  if (input.discountType === 'flat') {
    rawDiscountPaise = Math.max(0, Math.round(input.discountValue || 0));
  } else if (input.discountType === 'percent') {
    const pct = Math.max(0, Math.min(100, Number(input.discountValue || 0)));
    const basisPoints = Math.round(pct * 100);
    rawDiscountPaise = Math.round((subtotalPaise * basisPoints) / 10000);
  }

  const discountPaise = Math.min(subtotalPaise, rawDiscountPaise);
  const taxablePaise = Math.max(0, subtotalPaise - discountPaise);

  let taxPaise = 0;
  if (input.taxEnabled && input.taxRatePercent && input.taxRatePercent > 0) {
    const taxBasisPoints = Math.round(input.taxRatePercent * 100);
    taxPaise = Math.round((taxablePaise * taxBasisPoints) / 10000);
  }

  const totalPaise = taxablePaise + taxPaise;
  return {
    subtotalPaise,
    discountPaise,
    taxablePaise,
    taxPaise,
    totalPaise
  };
}

export interface PaymentLedgerSummary {
  advancePaise: number;
  subsequentPaidPaise: number;
  refundedPaise: number;
  correctionPaise: number;
  netPaidPaise: number;
  balancePaise: number;
  overpaidPaise: number;
  status: PaymentStatus;
}

/**
 * Computes the complete payment ledger and status from explicit PaymentRecords.
 * Advance payments are stored as explicit PaymentRecords with type === 'advance'
 * and are NEVER double-counted alongside subsequent payments.
 */
export function computePaymentLedger(
  totalPaise: number,
  isCancelled: boolean,
  payments: Pick<PaymentRecord, 'amountPaise' | 'type'>[]
): PaymentLedgerSummary {
  let advancePaise = 0;
  let subsequentPaidPaise = 0;
  let refundedPaise = 0;
  let correctionPaise = 0;

  for (const p of payments) {
    const amt = Math.round(p.amountPaise || 0);
    if (p.type === 'advance') {
      advancePaise += amt;
    } else if (p.type === 'payment') {
      subsequentPaidPaise += amt;
    } else if (p.type === 'refund') {
      refundedPaise += Math.abs(amt);
    } else if (p.type === 'correction') {
      correctionPaise += amt;
    }
  }

  const rawNetPaid = advancePaise + subsequentPaidPaise + correctionPaise - refundedPaise;
  const netPaidPaise = Math.max(0, rawNetPaid);
  const cleanTotal = Math.max(0, Math.round(totalPaise));

  if (isCancelled) {
    return {
      advancePaise,
      subsequentPaidPaise,
      refundedPaise,
      correctionPaise,
      netPaidPaise,
      balancePaise: 0,
      overpaidPaise: 0,
      status: 'Cancelled'
    };
  }

  const balancePaise = Math.max(0, cleanTotal - netPaidPaise);
  const overpaidPaise = Math.max(0, netPaidPaise - cleanTotal);

  let status: PaymentStatus;
  if (cleanTotal === 0) {
    status = 'Paid';
  } else if (netPaidPaise <= 0) {
    status = 'Unpaid';
  } else if (netPaidPaise < cleanTotal) {
    status = 'Partially Paid';
  } else {
    status = 'Paid';
  }

  return {
    advancePaise,
    subsequentPaidPaise,
    refundedPaise,
    correctionPaise,
    netPaidPaise,
    balancePaise,
    overpaidPaise,
    status
  };
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  other: 'Other'
};

export function formatInvoiceNumber(prefix: string, year: number, sequence: number): string {
  const cleanPrefix = (prefix || 'ALIF').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'ALIF';
  const paddedSeq = String(Math.max(1, Math.floor(sequence))).padStart(4, '0');
  return `${cleanPrefix}-${year}-${paddedSeq}`;
}
