export type CatalogueCategory = 'service' | 'product' | 'custom';

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Cancelled';

export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export type PaymentRecordType = 'advance' | 'payment' | 'refund' | 'correction';

export type DiscountType = 'flat' | 'percent';

export interface ShopSettings {
  id: string;
  shopName: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  phone: string;
  whatsappNumber: string;
  currencyCode: 'INR';
  currencySymbol: '₹';
  invoicePrefix: string;
  nextInvoiceSequence: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRatePercent: number;
  defaultPaymentMethod: PaymentMethod;
  enabledPaymentMethods: PaymentMethod[];
  receiptFooter: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogueItem {
  id: string;
  name: string;
  category: CatalogueCategory;
  defaultPricePaise: number;
  minPricePaise?: number;
  maxPricePaise?: number;
  costPricePaise?: number;
  unit: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemPhotoRecord {
  id: string;
  invoiceId?: string;
  lineItemId: string;
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: string;
}

export interface InvoiceLineItem {
  id: string;
  catalogueItemId: string | null;
  name: string;
  category: CatalogueCategory;
  quantity: number;
  unit: string;
  unitPricePaise: number;
  costPricePaise?: number;
  lineTotalPaise: number;
  notes?: string;
  photoId?: string;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amountPaise: number;
  method: PaymentMethod;
  type: PaymentRecordType;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp
  note: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  invoiceDate: string; // YYYY-MM-DD
  collectionDate?: string; // YYYY-MM-DD optional
  items: InvoiceLineItem[];
  subtotalPaise: number;
  discountType: DiscountType;
  discountValue: number; // In paise if flat, or basis points / percentage (e.g. 10 for 10%) if percent
  discountPaise: number;
  taxEnabled: boolean;
  taxLabel?: string;
  taxRatePercent: number;
  taxPaise: number;
  totalPaise: number;
  advancePaise: number;
  paidPaise: number;
  balancePaise: number;
  status: PaymentStatus;
  notes: string;
  cancelReason?: string;
  cancelledAt?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPayload {
  schemaVersion: number;
  app: 'ALIF_BILLING_PWA';
  exportedAt: string;
  settings: ShopSettings[];
  customers: Customer[];
  catalogue: CatalogueItem[];
  invoices: Invoice[];
  payments: PaymentRecord[];
}

export interface DashboardMetrics {
  todayDate: string;
  todayInvoiceValuePaise: number;
  todayPaymentsReceivedPaise: number;
  todayInvoiceCount: number;
  totalOutstandingPaise: number;
  outstandingInvoiceCount: number;
  recentInvoices: Invoice[];
}

export interface PeriodReport {
  startDate: string;
  endDate: string;
  activeInvoiceCount: number;
  cancelledInvoiceCount: number;
  invoicedSalesPaise: number;
  discountsGivenPaise: number;
  paymentsReceivedPaise: number;
  refundsIssuedPaise: number;
  netCashCollectedPaise: number;
  outstandingBalancePaise: number;
  paymentsByMethod: Record<PaymentMethod, number>;
  categoryBreakdown: {
    category: CatalogueCategory;
    label: string;
    quantity: number;
    revenuePaise: number;
    estimatedCostPaise: number;
  }[];
  itemBreakdown: {
    name: string;
    category: CatalogueCategory;
    quantity: number;
    revenuePaise: number;
  }[];
}
