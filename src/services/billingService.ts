import { ALIFBillingDatabase, db as defaultDb } from '../db/database';
import { DEFAULT_CATALOGUE_ITEMS, DEFAULT_SHOP_SETTINGS } from '../db/seed';
import {
  BackupPayload,
  CatalogueCategory,
  CatalogueItem,
  Customer,
  DashboardMetrics,
  DiscountType,
  Invoice,
  InvoiceLineItem,
  ItemPhotoRecord,
  PaymentMethod,
  PaymentRecord,
  PaymentRecordType,
  PaymentStatus,
  PeriodReport,
  ShopSettings
} from '../types/billing';
import {
  calculateInvoiceTotals,
  calculateLineTotalPaise,
  computePaymentLedger,
  formatInvoiceNumber
} from '../utils/currency';

const activeSubmissionLocks = new Set<string>();

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now()}-${rand}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// 1. SHOP SETTINGS
// ============================================================================

export async function getShopSettings(database: ALIFBillingDatabase = defaultDb): Promise<ShopSettings> {
  await database.ensureSeeded();
  const s = await database.settings.get('default');
  return s || { ...DEFAULT_SHOP_SETTINGS };
}

export async function updateShopSettings(
  patch: Partial<ShopSettings>,
  database: ALIFBillingDatabase = defaultDb
): Promise<ShopSettings> {
  await database.ensureSeeded();
  const current = await getShopSettings(database);
  const cleanPrefix =
    patch.invoicePrefix !== undefined
      ? patch.invoicePrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'ALIF'
      : current.invoicePrefix;

  const updated: ShopSettings = {
    ...current,
    ...patch,
    id: 'default',
    currencyCode: 'INR',
    currencySymbol: '₹',
    invoicePrefix: cleanPrefix,
    nextInvoiceSequence: Math.max(
      1,
      Math.floor(Number(patch.nextInvoiceSequence ?? current.nextInvoiceSequence) || 1)
    ),
    taxEnabled: Boolean(patch.taxEnabled ?? current.taxEnabled),
    taxRatePercent: Math.max(0, Math.min(50, Number(patch.taxRatePercent ?? current.taxRatePercent) || 0)),
    updatedAt: new Date().toISOString()
  };

  await database.settings.put(updated);
  return updated;
}

// ============================================================================
// 2. CUSTOMERS
// ============================================================================

export interface SaveCustomerInput {
  id?: string;
  name: string;
  phone: string;
  notes?: string;
}

export async function saveCustomer(
  input: SaveCustomerInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<Customer> {
  await database.ensureSeeded();
  const name = String(input.name || '').trim();
  const phone = String(input.phone || '').trim();
  const notes = String(input.notes || '').trim();

  if (!name) {
    throw new Error('Customer name is required');
  }
  if (!phone || phone.replace(/\D/g, '').length < 6) {
    throw new Error('Valid customer phone number is required');
  }

  const now = new Date().toISOString();
  if (input.id) {
    const existing = await database.customers.get(input.id);
    const updated: Customer = {
      id: input.id,
      name,
      phone,
      notes,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    await database.customers.put(updated);
    return updated;
  }

  const created: Customer = {
    id: generateId('cust'),
    name,
    phone,
    notes,
    createdAt: now,
    updatedAt: now
  };
  await database.customers.put(created);
  return created;
}

export async function listCustomers(
  searchQuery = '',
  database: ALIFBillingDatabase = defaultDb
): Promise<Customer[]> {
  await database.ensureSeeded();
  const all: Customer[] = await database.customers.toArray();
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.notes && c.notes.toLowerCase().includes(q))
      )
    : all;

  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCustomerHistory(
  customerId: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<{
  customer: Customer | undefined;
  invoices: Invoice[];
  payments: PaymentRecord[];
  totalBilledPaise: number;
  totalPaidPaise: number;
  totalOutstandingPaise: number;
}> {
  await database.ensureSeeded();
  const customer = await database.customers.get(customerId);
  const invoices: Invoice[] = await database.invoices.where('customerId').equals(customerId).toArray();
  invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const payments: PaymentRecord[] = await database.payments.where('customerId').equals(customerId).toArray();
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let totalBilledPaise = 0;
  let totalPaidPaise = 0;
  let totalOutstandingPaise = 0;

  for (const inv of invoices) {
    if (inv.status !== 'Cancelled') {
      totalBilledPaise += inv.totalPaise;
      totalOutstandingPaise += inv.balancePaise;
    }
    totalPaidPaise += inv.paidPaise;
  }

  return {
    customer,
    invoices,
    payments,
    totalBilledPaise,
    totalPaidPaise,
    totalOutstandingPaise
  };
}

// ============================================================================
// 3. CATALOGUE
// ============================================================================

export interface SaveCatalogueItemInput {
  id?: string;
  name: string;
  category: CatalogueCategory;
  defaultPricePaise: number;
  minPricePaise?: number;
  maxPricePaise?: number;
  costPricePaise?: number;
  unit: string;
  description?: string;
  isActive?: boolean;
}

export async function listCatalogue(
  options: { category?: CatalogueCategory | 'all'; search?: string; activeOnly?: boolean } = {},
  database: ALIFBillingDatabase = defaultDb
): Promise<CatalogueItem[]> {
  await database.ensureSeeded();
  let items: CatalogueItem[] = await database.catalogue.toArray();

  if (options.activeOnly) {
    items = items.filter((i) => i.isActive);
  }
  if (options.category && options.category !== 'all') {
    items = items.filter((i) => i.category === options.category);
  }
  if (options.search && options.search.trim()) {
    const q = options.search.trim().toLowerCase();
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.unit.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q))
    );
  }

  return items.sort((a, b) => {
    if (a.category !== b.category) {
      const order: Record<CatalogueCategory, number> = { service: 1, product: 2, custom: 3 };
      return order[a.category] - order[b.category];
    }
    return a.name.localeCompare(b.name);
  });
}

export async function saveCatalogueItem(
  input: SaveCatalogueItemInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<CatalogueItem> {
  await database.ensureSeeded();
  const name = String(input.name || '').trim();
  if (!name) {
    throw new Error('Catalogue item name is required');
  }
  const unit = String(input.unit || 'pc').trim() || 'pc';
  const defaultPricePaise = Math.round(Number(input.defaultPricePaise));
  if (!Number.isFinite(defaultPricePaise) || defaultPricePaise < 0) {
    throw new Error('Default price must be zero or greater');
  }
  const costPricePaise =
    input.costPricePaise !== undefined && input.costPricePaise !== null
      ? Math.max(0, Math.round(Number(input.costPricePaise)))
      : undefined;
  const minPricePaise =
    input.minPricePaise !== undefined && input.minPricePaise !== null
      ? Math.max(0, Math.round(Number(input.minPricePaise)))
      : undefined;
  const maxPricePaise =
    input.maxPricePaise !== undefined && input.maxPricePaise !== null
      ? Math.max(0, Math.round(Number(input.maxPricePaise)))
      : undefined;

  const now = new Date().toISOString();
  if (input.id) {
    const existing = await database.catalogue.get(input.id);
    const updated: CatalogueItem = {
      id: input.id,
      name,
      category: input.category,
      defaultPricePaise,
      minPricePaise,
      maxPricePaise,
      costPricePaise,
      unit,
      description: input.description?.trim() || '',
      isActive: input.isActive !== undefined ? input.isActive : existing ? existing.isActive : true,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    await database.catalogue.put(updated);
    return updated;
  }

  const created: CatalogueItem = {
    id: generateId('cat'),
    name,
    category: input.category,
    defaultPricePaise,
    minPricePaise,
    maxPricePaise,
    costPricePaise,
    unit,
    description: input.description?.trim() || '',
    isActive: input.isActive !== undefined ? input.isActive : true,
    createdAt: now,
    updatedAt: now
  };
  await database.catalogue.put(created);
  return created;
}

export async function resetDefaultCatalogue(database: ALIFBillingDatabase = defaultDb): Promise<void> {
  await database.ensureSeeded();
  await database.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((item) => ({ ...item })));
}

// ============================================================================
// 4. INVOICE CREATION, NUMBERING & DUPLICATE PREVENTION
// ============================================================================

export async function previewNextInvoiceNumber(
  invoiceDate = getTodayIsoDate(),
  database: ALIFBillingDatabase = defaultDb
): Promise<string> {
  const settings = await getShopSettings(database);
  const year = parseInt(invoiceDate.slice(0, 4), 10) || new Date().getFullYear();
  const allInvoices: Invoice[] = await database.invoices.toArray();
  const existingNumbers = new Set(allInvoices.map((inv) => inv.invoiceNumber));

  let seq = Math.max(1, settings.nextInvoiceSequence || 1);
  let candidate = formatInvoiceNumber(settings.invoicePrefix, year, seq);
  while (existingNumbers.has(candidate)) {
    seq++;
    candidate = formatInvoiceNumber(settings.invoicePrefix, year, seq);
  }
  return candidate;
}

export interface CreateInvoiceLineInput {
  id?: string;
  catalogueItemId?: string | null;
  name: string;
  category: CatalogueCategory;
  quantity: number;
  unit: string;
  unitPricePaise: number;
  costPricePaise?: number;
  notes?: string;
  photoId?: string;
}

export interface CreateInvoiceInput {
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerNotes?: string;
  invoiceDate?: string;
  collectionDate?: string;
  items: CreateInvoiceLineInput[];
  discountType?: DiscountType;
  discountValue?: number;
  advancePaise?: number;
  advanceMethod?: PaymentMethod;
  notes?: string;
  idempotencyKey?: string;
}

export async function createInvoice(
  input: CreateInvoiceInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<{ invoice: Invoice; payments: PaymentRecord[]; customer: Customer }> {
  await database.ensureSeeded();

  const lockKey = input.idempotencyKey || `${input.customerPhone}-${input.items.length}`;
  if (activeSubmissionLocks.has(lockKey)) {
    throw new Error('Duplicate bill submission in progress. Please wait.');
  }
  activeSubmissionLocks.add(lockKey);

  try {
    // Check idempotency key in DB to prevent duplicate invoice creation
    if (input.idempotencyKey) {
      const existingByKey = await database.invoices
        .where('idempotencyKey')
        .equals(input.idempotencyKey)
        .first();
      if (existingByKey) {
        throw new Error(`Duplicate submission prevented: Invoice ${existingByKey.invoiceNumber} already saved.`);
      }
    }

    const customerName = String(input.customerName || '').trim();
    const customerPhone = String(input.customerPhone || '').trim();
    if (!customerName) {
      throw new Error('Customer name is required on a bill');
    }
    if (!customerPhone || customerPhone.replace(/\D/g, '').length < 6) {
      throw new Error('Valid customer phone number is required on a bill');
    }

    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('At least one tailoring service or product item is required');
    }

    const normalizedItems: InvoiceLineItem[] = input.items.map((raw, idx) => {
      const itemName = String(raw.name || '').trim();
      if (!itemName) {
        throw new Error(`Line item #${idx + 1} requires a name`);
      }
      const qty = Number(raw.quantity);
      const unitPaise = Math.round(Number(raw.unitPricePaise));
      const lineTotalPaise = calculateLineTotalPaise(qty, unitPaise);
      return {
        id: raw.id || generateId(`line-${idx + 1}`),
        catalogueItemId: raw.catalogueItemId ?? null,
        name: itemName,
        category: raw.category || 'service',
        quantity: qty,
        unit: String(raw.unit || 'pc').trim() || 'pc',
        unitPricePaise: unitPaise,
        costPricePaise: raw.costPricePaise !== undefined ? Math.round(raw.costPricePaise) : undefined,
        lineTotalPaise,
        notes: raw.notes ? String(raw.notes).trim() : undefined,
        photoId: raw.photoId || undefined
      };
    });

    const invoiceDate = input.invoiceDate || getTodayIsoDate();
    const discountType: DiscountType = input.discountType || 'flat';
    const discountValue = Number(input.discountValue || 0);
    if (discountValue < 0) {
      throw new Error('Discount cannot be negative');
    }

    return await database.transaction(
      'rw',
      database.settings,
      database.customers,
      database.invoices,
      database.payments,
      async () => {
        const settings = await getShopSettings(database);
        const totals = calculateInvoiceTotals({
          items: normalizedItems,
          discountType,
          discountValue,
          taxEnabled: settings.taxEnabled,
          taxRatePercent: settings.taxRatePercent
        });

        const advancePaise = Math.max(0, Math.round(Number(input.advancePaise || 0)));
        if (advancePaise > totals.totalPaise) {
          throw new Error('Advance amount cannot exceed the final bill total');
        }

        const now = new Date().toISOString();

        // Resolve or create customer
        let customer: Customer | undefined;
        if (input.customerId) {
          customer = await database.customers.get(input.customerId);
        }
        if (!customer) {
          const allCustomers: Customer[] = await database.customers.toArray();
          customer = allCustomers.find(
            (c) =>
              c.phone.replace(/\D/g, '') === customerPhone.replace(/\D/g, '') &&
              c.name.toLowerCase() === customerName.toLowerCase()
          );
        }

        if (customer) {
          customer = {
            ...customer,
            name: customerName,
            phone: customerPhone,
            notes: input.customerNotes !== undefined ? input.customerNotes.trim() : customer.notes,
            updatedAt: now
          };
          await database.customers.put(customer);
        } else {
          customer = {
            id: generateId('cust'),
            name: customerName,
            phone: customerPhone,
            notes: input.customerNotes ? input.customerNotes.trim() : '',
            createdAt: now,
            updatedAt: now
          };
          await database.customers.put(customer);
        }

        // Generate guaranteed unique invoice number
        const year = parseInt(invoiceDate.slice(0, 4), 10) || new Date().getFullYear();
        const allInvoices: Invoice[] = await database.invoices.toArray();
        const existingNumbers = new Set(allInvoices.map((i) => i.invoiceNumber));
        let seq = Math.max(1, settings.nextInvoiceSequence || 1);
        let invoiceNumber = formatInvoiceNumber(settings.invoicePrefix, year, seq);
        while (existingNumbers.has(invoiceNumber)) {
          seq++;
          invoiceNumber = formatInvoiceNumber(settings.invoicePrefix, year, seq);
        }

        // Update sequence counter
        await database.settings.put({
          ...settings,
          nextInvoiceSequence: seq + 1,
          updatedAt: now
        });

        const invoiceId = generateId('inv');
        const createdPayments: PaymentRecord[] = [];

        if (advancePaise > 0) {
          const advancePayment: PaymentRecord = {
            id: generateId('pay'),
            invoiceId,
            invoiceNumber,
            customerId: customer.id,
            customerName: customer.name,
            amountPaise: advancePaise,
            method: input.advanceMethod || settings.defaultPaymentMethod || 'cash',
            type: 'advance',
            date: invoiceDate,
            createdAt: now,
            note: 'Initial advance received at billing'
          };
          await database.payments.put(advancePayment);
          createdPayments.push(advancePayment);
        }

        const ledger = computePaymentLedger(totals.totalPaise, false, createdPayments);

        const invoice: Invoice = {
          id: invoiceId,
          invoiceNumber,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          invoiceDate,
          collectionDate: input.collectionDate || undefined,
          items: normalizedItems,
          subtotalPaise: totals.subtotalPaise,
          discountType,
          discountValue,
          discountPaise: totals.discountPaise,
          taxEnabled: settings.taxEnabled,
          taxLabel: settings.taxLabel,
          taxRatePercent: settings.taxRatePercent,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          advancePaise: ledger.advancePaise,
          paidPaise: ledger.netPaidPaise,
          balancePaise: ledger.balancePaise,
          status: ledger.status,
          notes: String(input.notes || '').trim(),
          idempotencyKey: input.idempotencyKey,
          createdAt: now,
          updatedAt: now
        };

        await database.invoices.put(invoice);
        if (database.itemPhotos) {
          for (const item of normalizedItems) {
            if (item.photoId) {
              const existingPhoto = await database.itemPhotos.get(item.photoId);
              if (existingPhoto) {
                await database.itemPhotos.put({
                  ...existingPhoto,
                  invoiceId,
                  lineItemId: item.id
                });
              }
            }
          }
        }
        return { invoice, payments: createdPayments, customer };
      }
    );
  } finally {
    activeSubmissionLocks.delete(lockKey);
  }
}

// ============================================================================
// 5. PAYMENTS, REFUNDS, CORRECTIONS, CANCELLATIONS & REOPENING
// ============================================================================

export interface RecordPaymentInput {
  invoiceId: string;
  amountPaise: number;
  method: PaymentMethod;
  type?: PaymentRecordType; // default 'payment'
  date?: string;
  note?: string;
}

export async function recordInvoicePayment(
  input: RecordPaymentInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<{ invoice: Invoice; payment: PaymentRecord; allPayments: PaymentRecord[] }> {
  await database.ensureSeeded();
  const type: PaymentRecordType = input.type || 'payment';
  const amountPaise = Math.round(Number(input.amountPaise));

  if (!Number.isFinite(amountPaise) || amountPaise === 0) {
    throw new Error('Payment amount must be a non-zero number');
  }
  if ((type === 'payment' || type === 'advance' || type === 'refund') && amountPaise < 0) {
    throw new Error('Amount must be greater than zero');
  }
  if ((type === 'refund' || type === 'correction') && !String(input.note || '').trim()) {
    throw new Error(`A note explaining the ${type} is required for audit integrity`);
  }

  return await database.transaction('rw', database.invoices, database.payments, async () => {
    const invoice: Invoice | undefined = await database.invoices.get(input.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    if (invoice.status === 'Cancelled' && type !== 'refund' && type !== 'correction') {
      throw new Error('Cannot record new payments on a cancelled invoice. Reopen the invoice first.');
    }

    const existingPayments: PaymentRecord[] = await database.payments
      .where('invoiceId')
      .equals(invoice.id)
      .toArray();
    const currentLedger = computePaymentLedger(
      invoice.totalPaise,
      invoice.status === 'Cancelled',
      existingPayments
    );

    if (type === 'refund' && amountPaise > currentLedger.netPaidPaise) {
      throw new Error('Refund amount cannot exceed total net paid amount on this invoice');
    }

    const now = new Date().toISOString();
    const payment: PaymentRecord = {
      id: generateId('pay'),
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      amountPaise,
      method: input.method || 'cash',
      type,
      date: input.date || getTodayIsoDate(),
      createdAt: now,
      note:
        String(input.note || '').trim() ||
        (type === 'advance' ? 'Advance payment' : 'Balance payment received')
    };

    await database.payments.put(payment);
    const allPayments = [...existingPayments, payment].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );

    const updatedLedger = computePaymentLedger(
      invoice.totalPaise,
      invoice.status === 'Cancelled',
      allPayments
    );

    const updatedInvoice: Invoice = {
      ...invoice,
      advancePaise: updatedLedger.advancePaise,
      paidPaise: updatedLedger.netPaidPaise,
      balancePaise: updatedLedger.balancePaise,
      status: updatedLedger.status,
      updatedAt: now
    };

    await database.invoices.put(updatedInvoice);
    return { invoice: updatedInvoice, payment, allPayments };
  });
}

export async function cancelInvoice(
  invoiceId: string,
  reason: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<Invoice> {
  await database.ensureSeeded();
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw new Error('Cancellation reason is required');
  }

  return await database.transaction('rw', database.invoices, database.payments, async () => {
    const invoice: Invoice | undefined = await database.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const existingPayments: PaymentRecord[] = await database.payments
      .where('invoiceId')
      .equals(invoiceId)
      .toArray();
    const ledger = computePaymentLedger(invoice.totalPaise, true, existingPayments);
    const now = new Date().toISOString();

    const updated: Invoice = {
      ...invoice,
      advancePaise: ledger.advancePaise,
      paidPaise: ledger.netPaidPaise,
      balancePaise: 0,
      status: 'Cancelled',
      cancelReason: cleanReason,
      cancelledAt: now,
      updatedAt: now
    };
    await database.invoices.put(updated);
    return updated;
  });
}

export interface ReopenOrEditInvoiceInput {
  invoiceId: string;
  items?: CreateInvoiceLineInput[];
  discountType?: DiscountType;
  discountValue?: number;
  collectionDate?: string;
  notes?: string;
}

export async function reopenAndUpdateInvoice(
  input: ReopenOrEditInvoiceInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<Invoice> {
  await database.ensureSeeded();
  return await database.transaction('rw', database.invoices, database.payments, async () => {
    const invoice: Invoice | undefined = await database.invoices.get(input.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const updatedItems: InvoiceLineItem[] = input.items
      ? input.items.map((raw, idx) => {
          const lineTotalPaise = calculateLineTotalPaise(raw.quantity, raw.unitPricePaise);
          return {
            id: raw.id || generateId(`line-${idx + 1}`),
            catalogueItemId: raw.catalogueItemId ?? null,
            name: String(raw.name || '').trim(),
            category: raw.category || 'service',
            quantity: Number(raw.quantity),
            unit: String(raw.unit || 'pc').trim() || 'pc',
            unitPricePaise: Math.round(Number(raw.unitPricePaise)),
            costPricePaise: raw.costPricePaise !== undefined ? Math.round(raw.costPricePaise) : undefined,
            lineTotalPaise,
            notes: raw.notes ? String(raw.notes).trim() : undefined,
            photoId: raw.photoId || undefined
          };
        })
      : invoice.items;

    if (updatedItems.length === 0) {
      throw new Error('Invoice must contain at least one item');
    }

    const discountType = input.discountType ?? invoice.discountType;
    const discountValue = input.discountValue ?? invoice.discountValue;

    const totals = calculateInvoiceTotals({
      items: updatedItems,
      discountType,
      discountValue,
      taxEnabled: invoice.taxEnabled,
      taxRatePercent: invoice.taxRatePercent
    });

    const payments: PaymentRecord[] = await database.payments
      .where('invoiceId')
      .equals(invoice.id)
      .toArray();
    const ledger = computePaymentLedger(totals.totalPaise, false, payments);
    const now = new Date().toISOString();

    const updated: Invoice = {
      ...invoice,
      items: updatedItems,
      subtotalPaise: totals.subtotalPaise,
      discountType,
      discountValue,
      discountPaise: totals.discountPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      advancePaise: ledger.advancePaise,
      paidPaise: ledger.netPaidPaise,
      balancePaise: ledger.balancePaise,
      status: ledger.status,
      collectionDate: input.collectionDate !== undefined ? input.collectionDate || undefined : invoice.collectionDate,
      notes: input.notes !== undefined ? input.notes.trim() : invoice.notes,
      cancelReason: undefined,
      cancelledAt: undefined,
      updatedAt: now
    };

    await database.invoices.put(updated);
    if (database.itemPhotos) {
      const keptPhotoIds = new Set(
        updatedItems.map((it) => it.photoId).filter((id): id is string => Boolean(id))
      );
      for (const prevItem of invoice.items) {
        if (prevItem.photoId && !keptPhotoIds.has(prevItem.photoId)) {
          await database.itemPhotos.delete(prevItem.photoId);
        }
      }
      for (const item of updatedItems) {
        if (item.photoId) {
          const existingPhoto = await database.itemPhotos.get(item.photoId);
          if (existingPhoto) {
            await database.itemPhotos.put({
              ...existingPhoto,
              invoiceId: invoice.id,
              lineItemId: item.id
            });
          }
        }
      }
    }
    return updated;
  });
}

export interface InvoiceFilterOptions {
  search?: string;
  status?: PaymentStatus | 'All';
  startDate?: string;
  endDate?: string;
  customerId?: string;
}

export async function listInvoices(
  filters: InvoiceFilterOptions = {},
  database: ALIFBillingDatabase = defaultDb
): Promise<Invoice[]> {
  await database.ensureSeeded();
  let invoices: Invoice[] = await database.invoices.toArray();

  if (filters.customerId) {
    invoices = invoices.filter((inv) => inv.customerId === filters.customerId);
  }
  if (filters.status && filters.status !== 'All') {
    invoices = invoices.filter((inv) => inv.status === filters.status);
  }
  if (filters.startDate) {
    invoices = invoices.filter((inv) => inv.invoiceDate >= filters.startDate!);
  }
  if (filters.endDate) {
    invoices = invoices.filter((inv) => inv.invoiceDate <= filters.endDate!);
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    invoices = invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.customerPhone.toLowerCase().includes(q) ||
        inv.items.some((it) => it.name.toLowerCase().includes(q))
    );
  }

  return invoices.sort((a, b) => {
    if (a.invoiceDate !== b.invoiceDate) {
      return b.invoiceDate.localeCompare(a.invoiceDate);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function getInvoiceDetails(
  invoiceId: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<{ invoice: Invoice; payments: PaymentRecord[]; customer: Customer | undefined }> {
  await database.ensureSeeded();
  const invoice: Invoice | undefined = await database.invoices.get(invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  const payments: PaymentRecord[] = await database.payments
    .where('invoiceId')
    .equals(invoiceId)
    .toArray();
  payments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const customer = await database.customers.get(invoice.customerId);
  return { invoice, payments, customer };
}

// ============================================================================
// 6. DASHBOARD & REPORTS
// ============================================================================

export async function getDashboardMetrics(
  todayDate = getTodayIsoDate(),
  database: ALIFBillingDatabase = defaultDb
): Promise<DashboardMetrics> {
  await database.ensureSeeded();
  const allInvoices: Invoice[] = await database.invoices.toArray();
  const allPayments: PaymentRecord[] = await database.payments.toArray();

  let todayInvoiceValuePaise = 0;
  let todayInvoiceCount = 0;
  let totalOutstandingPaise = 0;
  let outstandingInvoiceCount = 0;

  for (const inv of allInvoices) {
    if (inv.status !== 'Cancelled') {
      if (inv.invoiceDate === todayDate) {
        todayInvoiceValuePaise += inv.totalPaise;
        todayInvoiceCount++;
      }
      if (inv.balancePaise > 0) {
        totalOutstandingPaise += inv.balancePaise;
        outstandingInvoiceCount++;
      }
    }
  }

  let todayPaymentsReceivedPaise = 0;
  for (const p of allPayments) {
    if (p.date === todayDate) {
      if (p.type === 'advance' || p.type === 'payment') {
        todayPaymentsReceivedPaise += p.amountPaise;
      } else if (p.type === 'refund') {
        todayPaymentsReceivedPaise -= Math.abs(p.amountPaise);
      } else if (p.type === 'correction') {
        todayPaymentsReceivedPaise += p.amountPaise;
      }
    }
  }

  const recentInvoices = [...allInvoices]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return {
    todayDate,
    todayInvoiceValuePaise,
    todayPaymentsReceivedPaise: Math.max(0, todayPaymentsReceivedPaise),
    todayInvoiceCount,
    totalOutstandingPaise,
    outstandingInvoiceCount,
    recentInvoices
  };
}

export async function getPeriodReport(
  startDate: string,
  endDate: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<PeriodReport> {
  await database.ensureSeeded();
  const allInvoices: Invoice[] = await database.invoices.toArray();
  const allPayments: PaymentRecord[] = await database.payments.toArray();

  const periodInvoices = allInvoices.filter(
    (inv) => inv.invoiceDate >= startDate && inv.invoiceDate <= endDate
  );

  let activeInvoiceCount = 0;
  let cancelledInvoiceCount = 0;
  let invoicedSalesPaise = 0;
  let discountsGivenPaise = 0;
  let outstandingBalancePaise = 0;

  const catMap: Record<
    CatalogueCategory,
    { label: string; quantity: number; revenuePaise: number; estimatedCostPaise: number }
  > = {
    service: { label: 'Tailoring Services', quantity: 0, revenuePaise: 0, estimatedCostPaise: 0 },
    product: { label: 'Products & Materials', quantity: 0, revenuePaise: 0, estimatedCostPaise: 0 },
    custom: { label: 'Custom Items', quantity: 0, revenuePaise: 0, estimatedCostPaise: 0 }
  };

  const itemMap = new Map<
    string,
    { name: string; category: CatalogueCategory; quantity: number; revenuePaise: number }
  >();

  for (const inv of periodInvoices) {
    if (inv.status === 'Cancelled') {
      cancelledInvoiceCount++;
      continue;
    }
    activeInvoiceCount++;
    invoicedSalesPaise += inv.totalPaise;
    discountsGivenPaise += inv.discountPaise;
    outstandingBalancePaise += inv.balancePaise;

    for (const item of inv.items) {
      const cat = catMap[item.category] ? item.category : 'service';
      catMap[cat].quantity += item.quantity;
      catMap[cat].revenuePaise += item.lineTotalPaise;
      if (item.costPricePaise) {
        catMap[cat].estimatedCostPaise += Math.round(item.costPricePaise * item.quantity);
      }

      const key = `${item.category}:${item.name}`;
      const existingItem = itemMap.get(key);
      if (existingItem) {
        existingItem.quantity += item.quantity;
        existingItem.revenuePaise += item.lineTotalPaise;
      } else {
        itemMap.set(key, {
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          revenuePaise: item.lineTotalPaise
        });
      }
    }
  }

  let paymentsReceivedPaise = 0;
  let refundsIssuedPaise = 0;
  const paymentsByMethod: Record<PaymentMethod, number> = {
    cash: 0,
    upi: 0,
    bank_transfer: 0,
    other: 0
  };

  const periodPayments = allPayments.filter((p) => p.date >= startDate && p.date <= endDate);
  for (const p of periodPayments) {
    const method: PaymentMethod = paymentsByMethod[p.method] !== undefined ? p.method : 'other';
    if (p.type === 'advance' || p.type === 'payment') {
      paymentsReceivedPaise += p.amountPaise;
      paymentsByMethod[method] += p.amountPaise;
    } else if (p.type === 'refund') {
      const amt = Math.abs(p.amountPaise);
      refundsIssuedPaise += amt;
      paymentsByMethod[method] = Math.max(0, paymentsByMethod[method] - amt);
    } else if (p.type === 'correction') {
      if (p.amountPaise >= 0) {
        paymentsReceivedPaise += p.amountPaise;
      } else {
        refundsIssuedPaise += Math.abs(p.amountPaise);
      }
      paymentsByMethod[method] = Math.max(0, paymentsByMethod[method] + p.amountPaise);
    }
  }

  const netCashCollectedPaise = Math.max(0, paymentsReceivedPaise - refundsIssuedPaise);

  return {
    startDate,
    endDate,
    activeInvoiceCount,
    cancelledInvoiceCount,
    invoicedSalesPaise,
    discountsGivenPaise,
    paymentsReceivedPaise,
    refundsIssuedPaise,
    netCashCollectedPaise,
    outstandingBalancePaise,
    paymentsByMethod,
    categoryBreakdown: (['service', 'product', 'custom'] as CatalogueCategory[]).map((c) => ({
      category: c,
      ...catMap[c]
    })),
    itemBreakdown: Array.from(itemMap.values()).sort((a, b) => b.revenuePaise - a.revenuePaise)
  };
}

// ============================================================================
// 7. BACKUP & RESTORE (VALIDATED & ATOMIC)
// ============================================================================

export async function exportBackupPayload(
  database: ALIFBillingDatabase = defaultDb
): Promise<BackupPayload> {
  await database.ensureSeeded();
  const [settings, customers, catalogue, invoices, payments] = await Promise.all([
    database.settings.toArray(),
    database.customers.toArray(),
    database.catalogue.toArray(),
    database.invoices.toArray(),
    database.payments.toArray()
  ]);

  return {
    schemaVersion: 2,
    app: 'ALIF_BILLING_PWA',
    exportedAt: new Date().toISOString(),
    settings,
    customers,
    catalogue,
    invoices,
    payments
  };
}

export function validateBackupPayload(raw: unknown): {
  valid: boolean;
  errors: string[];
  payload?: BackupPayload;
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Backup file must be a JSON object'] };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.app !== 'ALIF_BILLING_PWA') {
    errors.push('Invalid backup identifier: expected app="ALIF_BILLING_PWA"');
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion < 1) {
    errors.push('Invalid or missing schemaVersion');
  }

  const requiredArrays = ['settings', 'customers', 'catalogue', 'invoices', 'payments'] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      errors.push(`Missing or invalid "${key}" array in backup`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const customers = obj.customers as Customer[];
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    if (!c || typeof c.id !== 'string' || !c.name || !c.phone) {
      errors.push(`Customer at index ${i} is missing id, name, or phone`);
    }
  }

  const catalogue = obj.catalogue as CatalogueItem[];
  for (let i = 0; i < catalogue.length; i++) {
    const cat = catalogue[i];
    if (
      !cat ||
      typeof cat.id !== 'string' ||
      !cat.name ||
      typeof cat.defaultPricePaise !== 'number' ||
      !Number.isInteger(cat.defaultPricePaise) ||
      cat.defaultPricePaise < 0
    ) {
      errors.push(`Catalogue item at index ${i} has invalid id, name, or non-integer price`);
    }
  }

  const invoices = obj.invoices as Invoice[];
  const invoiceIds = new Set<string>();
  const invoiceNumbers = new Set<string>();
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    if (!inv || typeof inv.id !== 'string' || !inv.invoiceNumber || !Array.isArray(inv.items)) {
      errors.push(`Invoice at index ${i} is missing id, invoiceNumber, or items array`);
      continue;
    }
    if (invoiceIds.has(inv.id)) {
      errors.push(`Duplicate invoice id "${inv.id}" in backup`);
    }
    if (invoiceNumbers.has(inv.invoiceNumber)) {
      errors.push(`Duplicate invoiceNumber "${inv.invoiceNumber}" in backup`);
    }
    invoiceIds.add(inv.id);
    invoiceNumbers.add(inv.invoiceNumber);

    if (
      typeof inv.totalPaise !== 'number' ||
      !Number.isInteger(inv.totalPaise) ||
      inv.totalPaise < 0
    ) {
      errors.push(`Invoice ${inv.invoiceNumber} has invalid totalPaise`);
    }
  }

  const payments = obj.payments as PaymentRecord[];
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    if (
      !p ||
      typeof p.id !== 'string' ||
      typeof p.invoiceId !== 'string' ||
      typeof p.amountPaise !== 'number' ||
      !Number.isInteger(p.amountPaise)
    ) {
      errors.push(`Payment record at index ${i} is malformed`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    payload: obj as unknown as BackupPayload
  };
}

export async function restoreBackupPayload(
  raw: unknown,
  database: ALIFBillingDatabase = defaultDb
): Promise<{ customers: number; catalogue: number; invoices: number; payments: number }> {
  const validation = validateBackupPayload(raw);
  if (!validation.valid || !validation.payload) {
    throw new Error(`Backup validation failed: ${validation.errors.join('; ')}`);
  }

  const payload = validation.payload;

  return await database.transaction(
    'rw',
    database.settings,
    database.customers,
    database.catalogue,
    database.invoices,
    database.payments,
    async () => {
      await database.settings.clear();
      await database.customers.clear();
      await database.catalogue.clear();
      await database.invoices.clear();
      await database.payments.clear();

      if (payload.settings.length > 0) {
        await database.settings.bulkPut(payload.settings);
      } else {
        await database.settings.put({ ...DEFAULT_SHOP_SETTINGS });
      }

      if (payload.catalogue.length > 0) {
        await database.catalogue.bulkPut(payload.catalogue);
      } else {
        await database.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((i) => ({ ...i })));
      }

      if (payload.customers.length > 0) {
        await database.customers.bulkPut(payload.customers);
      }

      if (payload.invoices.length > 0) {
        await database.invoices.bulkPut(payload.invoices);
      }

      if (payload.payments.length > 0) {
        await database.payments.bulkPut(payload.payments);
      }

      return {
        customers: payload.customers.length,
        catalogue: payload.catalogue.length,
        invoices: payload.invoices.length,
        payments: payload.payments.length
      };
    }
  );
}


// ============================================================================
// 8. ITEM PHOTO PROCESSING & INDEXEDDB BLOB STORAGE
// ============================================================================

const MAX_RAW_FILE_BYTES = 15 * 1024 * 1024; // 15 MB raw upload ceiling
const MAX_DIMENSION_PX = 960; // Keep fabric details clear while compacting size
const JPEG_QUALITY = 0.78;

export interface ProcessedImageResult {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export function validateImageFile(file: File | Blob | null | undefined): void {
  if (!file) {
    throw new Error('No image file selected.');
  }
  if (file.size <= 0) {
    throw new Error('Selected image file is empty.');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Image file is too large (maximum 15 MB).');
  }
  const type = (file.type || '').toLowerCase();
  if (type && !type.startsWith('image/')) {
    throw new Error('Unsupported file format. Please select an image file (JPEG, PNG, WebP).');
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(blob);
    });
  }
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : '';
  return `data:${blob.type || 'image/jpeg'};base64,${base64}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) {
    throw new Error('Invalid image data URL.');
  }
  const mimeMatch = parts[0].match(/data:([^;]+);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binaryStr = typeof atob === 'function' ? atob(parts[1]) : '';
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function compressAndResizeImage(
  file: File | Blob,
  maxDimension = MAX_DIMENSION_PX,
  quality = JPEG_QUALITY
): Promise<ProcessedImageResult> {
  validateImageFile(file);
  const rawDataUrl = await blobToDataUrl(file);

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      blob: file instanceof Blob ? new Blob([file], { type: file.type || 'image/jpeg' }) : file,
      dataUrl: rawDataUrl,
      mimeType: file.type || 'image/jpeg',
      width: 480,
      height: 480,
      sizeBytes: file.size
    };
  }

  return await new Promise<ProcessedImageResult>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width || 480;
        const origH = img.naturalHeight || img.height || 480;
        let targetW = origW;
        let targetH = origH;

        if (origW > maxDimension || origH > maxDimension) {
          if (origW >= origH) {
            targetW = maxDimension;
            targetH = Math.max(1, Math.round((origH * maxDimension) / origW));
          } else {
            targetH = maxDimension;
            targetW = Math.max(1, Math.round((origW * maxDimension) / origH));
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            blob: new Blob([file], { type: file.type || 'image/jpeg' }),
            dataUrl: rawDataUrl,
            mimeType: file.type || 'image/jpeg',
            width: origW,
            height: origH,
            sizeBytes: file.size
          });
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        if (!compressedDataUrl || !compressedDataUrl.startsWith('data:image/')) {
          resolve({
            blob: new Blob([file], { type: file.type || 'image/jpeg' }),
            dataUrl: rawDataUrl,
            mimeType: file.type || 'image/jpeg',
            width: targetW,
            height: targetH,
            sizeBytes: file.size
          });
          return;
        }

        const compressedBlob = dataUrlToBlob(compressedDataUrl);
        resolve({
          blob: compressedBlob,
          dataUrl: compressedDataUrl,
          mimeType: 'image/jpeg',
          width: targetW,
          height: targetH,
          sizeBytes: compressedBlob.size
        });
      } catch (_err) {
        resolve({
          blob: new Blob([file], { type: file.type || 'image/jpeg' }),
          dataUrl: rawDataUrl,
          mimeType: file.type || 'image/jpeg',
          width: 480,
          height: 480,
          sizeBytes: file.size
        });
      }
    };

    img.onerror = () => {
      resolve({
        blob: new Blob([file], { type: file.type || 'image/jpeg' }),
        dataUrl: rawDataUrl,
        mimeType: file.type || 'image/jpeg',
        width: 480,
        height: 480,
        sizeBytes: file.size
      });
    };

    img.src = rawDataUrl;
  });
}

export async function saveItemPhotoFromFile(
  input: {
    file: File | Blob;
    lineItemId: string;
    invoiceId?: string;
    existingPhotoId?: string;
  },
  database: ALIFBillingDatabase = defaultDb
): Promise<ItemPhotoRecord> {
  await database.ensureSeeded();
  const processed = await compressAndResizeImage(input.file);
  const photoId = input.existingPhotoId || generateId('photo');
  const record: ItemPhotoRecord = {
    id: photoId,
    invoiceId: input.invoiceId,
    lineItemId: input.lineItemId,
    blob: processed.blob,
    dataUrl: processed.dataUrl,
    mimeType: processed.mimeType,
    width: processed.width,
    height: processed.height,
    sizeBytes: processed.sizeBytes,
    createdAt: new Date().toISOString()
  };
  await database.itemPhotos.put(record);
  return record;
}

export async function getItemPhoto(
  photoId: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<ItemPhotoRecord | undefined> {
  await database.ensureSeeded();
  const rec: ItemPhotoRecord | undefined = await database.itemPhotos.get(photoId);
  if (!rec) return undefined;
  if (!(rec.blob instanceof Blob) && rec.dataUrl) {
    rec.blob = dataUrlToBlob(rec.dataUrl);
  }
  return rec;
}

export async function getItemPhotosMap(
  photoIds: string[],
  database: ALIFBillingDatabase = defaultDb
): Promise<Record<string, ItemPhotoRecord>> {
  await database.ensureSeeded();
  const map: Record<string, ItemPhotoRecord> = {};
  const uniqueIds = Array.from(new Set(photoIds.filter(Boolean)));
  for (const id of uniqueIds) {
    const rec = await getItemPhoto(id, database);
    if (rec) {
      map[id] = rec;
    }
  }
  return map;
}

export async function deleteItemPhoto(
  photoId: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<void> {
  if (!photoId) return;
  await database.ensureSeeded();
  await database.itemPhotos.delete(photoId);
}
