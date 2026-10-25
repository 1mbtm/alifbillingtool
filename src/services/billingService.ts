import { ALIFBillingDatabase, db as defaultDb } from '../db/database';
import {
  DEFAULT_CATALOGUE_ITEMS,
  DEFAULT_INVENTORY_BUNDLES,
  DEFAULT_INVENTORY_VARIANTS,
  DEFAULT_SHOP_SETTINGS
} from '../db/seed';
import {
  BackupPayload,
  CatalogueCategory,
  CatalogueItem,
  Customer,
  DashboardMetrics,
  DiscountType,
  InventoryBundle,
  InventoryMovement,
  InventoryVariant,
  Invoice,
  InvoiceLineItem,
  ItemPhotoRecord,
  NewStockVariantSpec,
  PaymentMethod,
  PaymentRecord,
  PaymentRecordType,
  PaymentStatus,
  PeriodReport,
  ShopSettings,
  StockAllocation,
  StockStatus
} from '../types/billing';
import {
  calculateInvoiceTotals,
  calculateLineTotalPaise,
  computePaymentLedger,
  formatInvoiceNumber
} from '../utils/currency';
import {
  findDuplicateInventoryVariant,
  formatStockQuantity,
  getVariantStockStatus,
  searchInventoryVariants
} from '../utils/search';

const activeSubmissionLocks = new Set<string>();
const memoryPhotoFallback = new Map<string, ItemPhotoRecord>();

const GENERIC_NON_STOCK_CATALOGUE_IDS = new Set([
  'prd-fabric',
  'prd-lace',
  'prd-latkan',
  'prd-dori',
  'cst-custom-item', 'itm-custom'
]);

/**
 * Fractional quantity helpers using integer thousandths (milli-units)
 * so 1.2m + 2.5m + 3.25m never suffers IEEE-754 floating-point drift.
 */
export function toQtyUnits(qty: number): number {
  const num = Number(qty);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 1000);
}

export function fromQtyUnits(units: number): number {
  return Math.round(units) / 1000;
}

export function roundStockQty(qty: number): number {
  return fromQtyUnits(toQtyUnits(qty));
}

function canUseItemPhotosStore(database: ALIFBillingDatabase): boolean {
  try {
    if (!database || !database.itemPhotos) return false;
    if (typeof database.hasObjectStore === 'function') {
      return database.hasObjectStore('itemPhotos');
    }
    const backend = (database as any).backendDB?.();
    if (backend && backend.objectStoreNames && typeof backend.objectStoreNames.contains === 'function') {
      return backend.objectStoreNames.contains('itemPhotos');
    }
    return true;
  } catch (_err) {
    return false;
  }
}

function canUseInventoryStores(database: ALIFBillingDatabase): boolean {
  try {
    if (
      !database ||
      !database.inventoryVariants ||
      !database.inventoryBundles ||
      !database.inventoryMovements
    ) {
      return false;
    }
    if (typeof database.hasObjectStore === 'function') {
      return (
        database.hasObjectStore('inventoryVariants') &&
        database.hasObjectStore('inventoryBundles') &&
        database.hasObjectStore('inventoryMovements')
      );
    }
    return true;
  } catch (_err) {
    return false;
  }
}

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

/**
 * Synchronizes the 1:1 linked CatalogueItem for an InventoryVariant inside an active transaction.
 * Ensures product name, colour, work/design, productType, unit, reference price, purchase cost,
 * photo, active status, and pin status are always kept in lockstep.
 */
async function syncCatalogueItemForVariantInTx(
  variant: InventoryVariant,
  database: ALIFBillingDatabase,
  createIfMissing = true
): Promise<CatalogueItem | undefined> {
  const allCat = await database.catalogue.toArray();
  const linkedItems = allCat.filter(
    (c) => c.inventoryVariantId === variant.id && !GENERIC_NON_STOCK_CATALOGUE_IDS.has(c.id)
  );

  const now = variant.updatedAt || new Date().toISOString();
  const description = `${variant.category} → ${variant.productType} → ${variant.workDesign} → ${variant.color}`;

  if (linkedItems.length > 0) {
    let primaryUpdated: CatalogueItem | undefined;
    for (const existing of linkedItems) {
      const updatedCat: CatalogueItem = {
        ...existing,
        name: variant.name,
        category: 'product',
        defaultPricePaise: variant.defaultSellingPricePaise,
        costPricePaise: variant.purchaseCostPaise,
        unit: variant.unit,
        description,
        isActive: variant.isActive,
        inventoryVariantId: variant.id,
        productType: variant.productType,
        workDesign: variant.workDesign,
        color: variant.color,
        isPinned: Boolean(variant.isPinned),
        photoId: variant.photoId,
        photoDataUrl: variant.photoDataUrl,
        updatedAt: now
      };
      await database.catalogue.put(updatedCat);
      if (!primaryUpdated) primaryUpdated = updatedCat;
    }
    return primaryUpdated;
  }

  if (!createIfMissing) return undefined;

  const createdCat: CatalogueItem = {
    id: generateId('cat-prd'),
    name: variant.name,
    category: 'product',
    defaultPricePaise: variant.defaultSellingPricePaise,
    costPricePaise: variant.purchaseCostPaise,
    unit: variant.unit,
    description,
    isActive: variant.isActive,
    inventoryVariantId: variant.id,
    productType: variant.productType,
    workDesign: variant.workDesign,
    color: variant.color,
    isPinned: Boolean(variant.isPinned),
    photoId: variant.photoId,
    photoDataUrl: variant.photoDataUrl,
    createdAt: variant.createdAt || now,
    updatedAt: now
  };
  await database.catalogue.put(createdCat);
  return createdCat;
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
// 3. CATALOGUE & FREQUENTLY USED PRODUCTS
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
  inventoryVariantId?: string | null;
  productType?: string;
  workDesign?: string;
  color?: string;
  isPinned?: boolean;
  photoId?: string;
  photoDataUrl?: string;
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
        (i.productType && i.productType.toLowerCase().includes(q)) ||
        (i.workDesign && i.workDesign.toLowerCase().includes(q)) ||
        (i.color && i.color.toLowerCase().includes(q)) ||
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

  // Tailoring services and generic material placeholders never link to physical stock
  const isGenericId = Boolean(input.id && GENERIC_NON_STOCK_CATALOGUE_IDS.has(input.id));
  const inventoryVariantId =
    input.category === 'service' || isGenericId
      ? null
      : input.inventoryVariantId ?? undefined;

  const now = new Date().toISOString();
  let savedItem: CatalogueItem;

  if (input.id) {
    const existing = await database.catalogue.get(input.id);
    savedItem = {
      id: input.id,
      name,
      category: input.category,
      defaultPricePaise,
      minPricePaise,
      maxPricePaise,
      costPricePaise,
      unit,
      description: input.description !== undefined ? input.description.trim() : existing?.description || '',
      isActive: input.isActive !== undefined ? input.isActive : existing ? existing.isActive : true,
      inventoryVariantId:
        inventoryVariantId !== undefined
          ? inventoryVariantId
          : isGenericId
          ? null
          : existing?.inventoryVariantId ?? null,
      productType: input.productType !== undefined ? input.productType.trim() : existing?.productType,
      workDesign: input.workDesign !== undefined ? input.workDesign.trim() : existing?.workDesign,
      color: input.color !== undefined ? input.color.trim() : existing?.color,
      isPinned: input.isPinned !== undefined ? input.isPinned : existing?.isPinned,
      photoId: input.photoId !== undefined ? input.photoId : existing?.photoId,
      photoDataUrl: input.photoDataUrl !== undefined ? input.photoDataUrl : existing?.photoDataUrl,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    await database.catalogue.put(savedItem);
  } else {
    savedItem = {
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
      inventoryVariantId: inventoryVariantId ?? null,
      productType: input.productType?.trim() || undefined,
      workDesign: input.workDesign?.trim() || undefined,
      color: input.color?.trim() || undefined,
      isPinned: Boolean(input.isPinned),
      photoId: input.photoId,
      photoDataUrl: input.photoDataUrl,
      createdAt: now,
      updatedAt: now
    };
    await database.catalogue.put(savedItem);
  }

  // Keep linked InventoryVariant synchronized when edited from CatalogueView
  if (
    savedItem.inventoryVariantId &&
    !GENERIC_NON_STOCK_CATALOGUE_IDS.has(savedItem.id) &&
    canUseInventoryStores(database)
  ) {
    const linkedVar = await database.inventoryVariants.get(savedItem.inventoryVariantId);
    if (linkedVar) {
      await database.inventoryVariants.put({
        ...linkedVar,
        name: savedItem.name,
        unit: savedItem.unit,
        defaultSellingPricePaise: savedItem.defaultPricePaise,
        purchaseCostPaise:
          savedItem.costPricePaise !== undefined
            ? savedItem.costPricePaise
            : linkedVar.purchaseCostPaise,
        productType: savedItem.productType || linkedVar.productType,
        workDesign: savedItem.workDesign || linkedVar.workDesign,
        color: savedItem.color || linkedVar.color,
        isActive: savedItem.isActive,
        isPinned: Boolean(savedItem.isPinned),
        photoId: savedItem.photoId !== undefined ? savedItem.photoId : linkedVar.photoId,
        photoDataUrl:
          savedItem.photoDataUrl !== undefined ? savedItem.photoDataUrl : linkedVar.photoDataUrl,
        updatedAt: now
      });
    }
  }

  return savedItem;
}

export async function toggleCatalogueItemPin(
  catalogueItemId: string,
  isPinned?: boolean,
  database: ALIFBillingDatabase = defaultDb
): Promise<CatalogueItem> {
  await database.ensureSeeded();
  const existing = await database.catalogue.get(catalogueItemId);
  if (!existing) {
    throw new Error('Catalogue item not found');
  }
  const nextPinned = isPinned !== undefined ? isPinned : !existing.isPinned;
  const now = new Date().toISOString();
  const updated: CatalogueItem = {
    ...existing,
    isPinned: nextPinned,
    updatedAt: now
  };
  await database.catalogue.put(updated);

  if (
    updated.inventoryVariantId &&
    !GENERIC_NON_STOCK_CATALOGUE_IDS.has(updated.id) &&
    canUseInventoryStores(database)
  ) {
    const linkedVar = await database.inventoryVariants.get(updated.inventoryVariantId);
    if (linkedVar) {
      await database.inventoryVariants.put({
        ...linkedVar,
        isPinned: nextPinned,
        updatedAt: now
      });
    }
  }

  return updated;
}

export async function resetDefaultCatalogue(database: ALIFBillingDatabase = defaultDb): Promise<void> {
  await database.ensureSeeded();
  await database.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((item) => ({ ...item })));
}

export interface FrequentlyUsedEntry {
  item: CatalogueItem;
  variant?: InventoryVariant;
  invoiceUsageCount: number;
  totalQuantityBilled: number;
  isPinned: boolean;
}

/**
 * Computes Frequently Used Products & Services for New Bill:
 * Combines manually pinned/favourite items with automatic ranking from actual saved non-cancelled invoices.
 * Never fabricates usage counts when invoice history is empty.
 */
export async function getFrequentlyUsedItems(
  limit = 8,
  database: ALIFBillingDatabase = defaultDb
): Promise<FrequentlyUsedEntry[]> {
  await database.ensureSeeded();
  const [catalogue, invoices, variants] = await Promise.all([
    database.catalogue.toArray(),
    database.invoices.toArray(),
    canUseInventoryStores(database) ? database.inventoryVariants.toArray() : Promise.resolve([])
  ]);

  const variantMap = new Map<string, InventoryVariant>();
  for (const v of variants) {
    variantMap.set(v.id, v);
  }

  const usageByCatalogueId = new Map<string, { count: number; qty: number }>();
  const usageByVariantId = new Map<string, { count: number; qty: number }>();

  for (const inv of invoices) {
    if (inv.status === 'Cancelled') continue;
    for (const line of inv.items) {
      if (line.catalogueItemId) {
        const cur = usageByCatalogueId.get(line.catalogueItemId) || { count: 0, qty: 0 };
        cur.count += 1;
        cur.qty = roundStockQty(cur.qty + Number(line.quantity || 0));
        usageByCatalogueId.set(line.catalogueItemId, cur);
      }
      if (line.inventoryVariantId) {
        const curV = usageByVariantId.get(line.inventoryVariantId) || { count: 0, qty: 0 };
        curV.count += 1;
        curV.qty = roundStockQty(curV.qty + Number(line.quantity || 0));
        usageByVariantId.set(line.inventoryVariantId, curV);
      }
    }
  }

  const entries: FrequentlyUsedEntry[] = [];
  for (const item of catalogue) {
    if (!item.isActive) continue;
    const linkedVariant = item.inventoryVariantId
      ? variantMap.get(item.inventoryVariantId)
      : undefined;
    if (linkedVariant && !linkedVariant.isActive) continue;

    const catUsage = usageByCatalogueId.get(item.id) || { count: 0, qty: 0 };
    const varUsage =
      item.inventoryVariantId && usageByVariantId.get(item.inventoryVariantId)
        ? usageByVariantId.get(item.inventoryVariantId)!
        : { count: 0, qty: 0 };

    const invoiceUsageCount = Math.max(catUsage.count, varUsage.count);
    const totalQuantityBilled = Math.max(catUsage.qty, varUsage.qty);
    const isPinned = Boolean(item.isPinned || linkedVariant?.isPinned);

    if (isPinned || invoiceUsageCount > 0) {
      entries.push({
        item,
        variant: linkedVariant,
        invoiceUsageCount,
        totalQuantityBilled,
        isPinned
      });
    }
  }

  entries.sort((a, b) => {
    if (b.invoiceUsageCount !== a.invoiceUsageCount) {
      return b.invoiceUsageCount - a.invoiceUsageCount;
    }
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return a.item.name.localeCompare(b.item.name);
  });

  return entries.slice(0, limit);
}

// ============================================================================
// 4. INVENTORY MANAGEMENT (VARIANTS, BUNDLES/ROLLS, FIFO & MOVEMENTS)
// ============================================================================

export interface SaveInventoryVariantInput {
  id?: string;
  sku?: string;
  name?: string;
  category: string;
  productType: string;
  workDesign: string;
  color: string;
  unit: string;
  purchaseCostPaise: number;
  defaultSellingPricePaise: number;
  lowStockThreshold?: number;
  photoId?: string;
  photoDataUrl?: string;
  notes?: string;
  isActive?: boolean;
  isPinned?: boolean;
  initialBundleQuantity?: number;
  initialBundleDate?: string;
  initialBundleSupplier?: string;
  initialBundleCode?: string;
  initialBundlePhotoId?: string;
  initialBundlePhotoDataUrl?: string;
  createLinkedCatalogueItem?: boolean;
  receiveIntoExistingOnDuplicate?: boolean;
}

function buildSkuFromHierarchy(
  category: string,
  productType: string,
  workDesign: string,
  color: string
): string {
  const clean = (s: string, len = 3) =>
    String(s || 'X')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, len) || 'ITM';
  return `${clean(category, 3)}-${clean(productType, 4)}-${clean(workDesign, 3)}-${clean(color, 3)}`;
}

async function recalculateVariantTotalInTx(
  variantId: string,
  database: ALIFBillingDatabase
): Promise<number> {
  const bundles = await database.inventoryBundles.where('variantId').equals(variantId).toArray();
  let totalMilli = 0;
  for (const b of bundles) {
    if (b.remainingQuantity > 0) {
      totalMilli += toQtyUnits(b.remainingQuantity);
    }
  }
  const totalQuantity = fromQtyUnits(Math.max(0, totalMilli));
  const variant = await database.inventoryVariants.get(variantId);
  if (variant) {
    await database.inventoryVariants.put({
      ...variant,
      totalQuantity,
      updatedAt: new Date().toISOString()
    });
  }
  return totalQuantity;
}

export async function saveInventoryVariant(
  input: SaveInventoryVariantInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<{
  variant: InventoryVariant;
  initialBundle?: InventoryBundle;
  receivedIntoExisting?: boolean;
}> {
  await database.ensureSeeded();
  const category = String(input.category || '').trim();
  const productType = String(input.productType || '').trim();
  const workDesign = String(input.workDesign || '').trim() || 'Standard';
  const color = String(input.color || '').trim();
  const unit = String(input.unit || 'm').trim() || 'm';

  if (!category) throw new Error('Inventory category is required (e.g. Fabric)');
  if (!productType) throw new Error('Product type is required (e.g. Fandy Silk)');
  if (!color) throw new Error('Colour is required to keep variants distinct');

  const autoName = `${color} ${productType} — ${workDesign}`;
  const name = String(input.name || '').trim() || autoName;
  const purchaseCostPaise = Math.max(0, Math.round(Number(input.purchaseCostPaise || 0)));
  const defaultSellingPricePaise = Math.max(
    0,
    Math.round(Number(input.defaultSellingPricePaise || 0))
  );
  const lowStockThreshold = Math.max(0, roundStockQty(Number(input.lowStockThreshold ?? 3)));
  const now = new Date().toISOString();

  return await database.transaction(
    'rw',
    database.inventoryVariants,
    database.inventoryBundles,
    database.inventoryMovements,
    database.catalogue,
    async () => {
      const allVariants = await database.inventoryVariants.toArray();
      const duplicate = findDuplicateInventoryVariant(allVariants, {
        category,
        productType,
        workDesign,
        color,
        excludeId: input.id
      });

      if (duplicate) {
        if (!input.id && input.receiveIntoExistingOnDuplicate) {
          const initQty = roundStockQty(Number(input.initialBundleQuantity || 0));
          let receivedBundle: InventoryBundle | undefined;
          let updatedDuplicate: InventoryVariant = {
            ...duplicate,
            purchaseCostPaise:
              purchaseCostPaise > 0 ? purchaseCostPaise : duplicate.purchaseCostPaise,
            defaultSellingPricePaise:
              defaultSellingPricePaise > 0
                ? defaultSellingPricePaise
                : duplicate.defaultSellingPricePaise,
            photoId:
              duplicate.photoId ||
              input.photoId ||
              input.initialBundlePhotoId,
            photoDataUrl:
              duplicate.photoDataUrl ||
              input.photoDataUrl ||
              input.initialBundlePhotoDataUrl,
            isActive: true,
            isPinned: input.isPinned !== undefined ? Boolean(input.isPinned) : duplicate.isPinned,
            updatedAt: now
          };

          if (initQty > 0) {
            const existingBundles = await database.inventoryBundles
              .where('variantId')
              .equals(duplicate.id)
              .toArray();
            const nextNum = String(existingBundles.length + 1).padStart(2, '0');
            const bundleCode =
              input.initialBundleCode?.trim() ||
              `BND-${duplicate.color.slice(0, 3).toUpperCase()}-${nextNum}`;
            const receivedDate = input.initialBundleDate || getTodayIsoDate();

            receivedBundle = {
              id: generateId('bnd'),
              variantId: duplicate.id,
              bundleCode,
              initialQuantity: initQty,
              remainingQuantity: initQty,
              unit: duplicate.unit,
              purchaseCostPaise: updatedDuplicate.purchaseCostPaise,
              receivedDate,
              supplier: input.initialBundleSupplier?.trim() || undefined,
              photoId: input.initialBundlePhotoId || input.photoId,
              photoDataUrl: input.initialBundlePhotoDataUrl || input.photoDataUrl,
              notes: input.notes?.trim() || 'Received into existing variant',
              createdAt: now,
              updatedAt: now
            };
            await database.inventoryBundles.put(receivedBundle);

            const newTotal = await recalculateVariantTotalInTx(duplicate.id, database);
            updatedDuplicate = {
              ...updatedDuplicate,
              totalQuantity: newTotal
            };

            const movement: InventoryMovement = {
              id: generateId('mov'),
              variantId: duplicate.id,
              bundleId: receivedBundle.id,
              bundleCode: receivedBundle.bundleCode,
              type: 'receive',
              quantityDelta: initQty,
              balanceAfter: newTotal,
              unit: duplicate.unit,
              reason: `Received stock into existing variant (${bundleCode})`,
              date: receivedDate,
              createdAt: now
            };
            await database.inventoryMovements.put(movement);
          }

          await database.inventoryVariants.put(updatedDuplicate);
          await syncCatalogueItemForVariantInTx(updatedDuplicate, database, true);
          return {
            variant: updatedDuplicate,
            initialBundle: receivedBundle,
            receivedIntoExisting: true
          };
        }

        const dupErr = new Error(
          `Duplicate variant already exists: "${duplicate.name}" (${duplicate.sku}). Receive new stock into the existing variant instead.`
        );
        (dupErr as any).duplicateVariant = duplicate;
        throw dupErr;
      }

      let variant: InventoryVariant;
      let initialBundle: InventoryBundle | undefined;

      if (input.id) {
        const existing = await database.inventoryVariants.get(input.id);
        if (!existing) {
          throw new Error('Inventory variant not found');
        }
        const resolvedPhotoDataUrl =
          input.photoDataUrl !== undefined
            ? input.photoDataUrl || undefined
            : existing.photoDataUrl || input.initialBundlePhotoDataUrl || undefined;
        const resolvedPhotoId =
          input.photoId !== undefined
            ? input.photoId || undefined
            : existing.photoId || input.initialBundlePhotoId || undefined;

        variant = {
          ...existing,
          sku: input.sku?.trim() || existing.sku,
          name,
          category,
          productType,
          workDesign,
          color,
          unit,
          purchaseCostPaise,
          defaultSellingPricePaise,
          lowStockThreshold,
          photoId: resolvedPhotoId,
          photoDataUrl: resolvedPhotoDataUrl,
          notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
          isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
          isPinned: input.isPinned !== undefined ? input.isPinned : existing.isPinned,
          updatedAt: now
        };
        await database.inventoryVariants.put(variant);
        const syncedTotal = await recalculateVariantTotalInTx(variant.id, database);
        variant.totalQuantity = syncedTotal;
        await syncCatalogueItemForVariantInTx(
          variant,
          database,
          input.createLinkedCatalogueItem !== false
        );
      } else {
        const variantId = generateId('var');
        const sku =
          input.sku?.trim() ||
          `${buildSkuFromHierarchy(category, productType, workDesign, color)}-${Math.floor(
            100 + Math.random() * 900
          )}`;
        const initQty = roundStockQty(Number(input.initialBundleQuantity || 0));
        if (initQty < 0) {
          throw new Error('Initial stock quantity cannot be negative');
        }

        // Inherit roll photo if variant has no main photo yet
        const inheritedPhotoDataUrl =
          input.photoDataUrl || input.initialBundlePhotoDataUrl || undefined;
        const inheritedPhotoId =
          input.photoId || input.initialBundlePhotoId || undefined;

        variant = {
          id: variantId,
          sku,
          name,
          category,
          productType,
          workDesign,
          color,
          unit,
          purchaseCostPaise,
          defaultSellingPricePaise,
          lowStockThreshold,
          totalQuantity: initQty,
          photoId: inheritedPhotoId,
          photoDataUrl: inheritedPhotoDataUrl,
          notes: input.notes?.trim() || '',
          isActive: input.isActive !== undefined ? input.isActive : true,
          isPinned: Boolean(input.isPinned),
          createdAt: now,
          updatedAt: now
        };
        await database.inventoryVariants.put(variant);

        if (initQty > 0) {
          const receivedDate = input.initialBundleDate || getTodayIsoDate();
          const bundleCode =
            input.initialBundleCode?.trim() ||
            `BND-${sku.split('-').slice(0, 2).join('')}-01`;
          initialBundle = {
            id: generateId('bnd'),
            variantId: variant.id,
            bundleCode,
            initialQuantity: initQty,
            remainingQuantity: initQty,
            unit,
            purchaseCostPaise,
            receivedDate,
            supplier: input.initialBundleSupplier?.trim() || undefined,
            photoId: input.initialBundlePhotoId || input.photoId,
            photoDataUrl: input.initialBundlePhotoDataUrl || input.photoDataUrl,
            notes: 'Initial opening bundle',
            createdAt: now,
            updatedAt: now
          };
          await database.inventoryBundles.put(initialBundle);

          const movement: InventoryMovement = {
            id: generateId('mov'),
            variantId: variant.id,
            bundleId: initialBundle.id,
            bundleCode: initialBundle.bundleCode,
            type: 'receive',
            quantityDelta: initQty,
            balanceAfter: initQty,
            unit,
            reason: `Opening stock received (${bundleCode})`,
            date: receivedDate,
            createdAt: now
          };
          await database.inventoryMovements.put(movement);
        }

        // Automatically create or sync a 1:1 CatalogueItem so it appears in New Bill & Catalogue
        if (input.createLinkedCatalogueItem !== false) {
          await syncCatalogueItemForVariantInTx(variant, database, true);
        }
      }

      return { variant, initialBundle, receivedIntoExisting: false };
    }
  );
}

export interface ReceiveInventoryBundleInput {
  variantId: string;
  quantity: number;
  receivedDate?: string;
  purchaseCostPaise?: number;
  bundleCode?: string;
  supplier?: string;
  photoId?: string;
  photoDataUrl?: string;
  notes?: string;
}

export async function receiveInventoryBundle(
  input: ReceiveInventoryBundleInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<{ variant: InventoryVariant; bundle: InventoryBundle; movement: InventoryMovement }> {
  await database.ensureSeeded();
  const qty = roundStockQty(Number(input.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Received bundle quantity must be greater than zero');
  }

  return await database.transaction(
    'rw',
    database.inventoryVariants,
    database.inventoryBundles,
    database.inventoryMovements,
    database.catalogue,
    async () => {
      const variant = await database.inventoryVariants.get(input.variantId);
      if (!variant) {
        throw new Error('Inventory variant not found');
      }

      const existingBundles = await database.inventoryBundles
        .where('variantId')
        .equals(variant.id)
        .toArray();
      const nextNum = String(existingBundles.length + 1).padStart(2, '0');
      const bundleCode =
        input.bundleCode?.trim() ||
        `BND-${variant.color.slice(0, 3).toUpperCase()}-${nextNum}`;
      const receivedDate = input.receivedDate || getTodayIsoDate();
      const purchaseCostPaise =
        input.purchaseCostPaise !== undefined
          ? Math.max(0, Math.round(Number(input.purchaseCostPaise)))
          : variant.purchaseCostPaise;
      const now = new Date().toISOString();

      const bundle: InventoryBundle = {
        id: generateId('bnd'),
        variantId: variant.id,
        bundleCode,
        initialQuantity: qty,
        remainingQuantity: qty,
        unit: variant.unit,
        purchaseCostPaise,
        receivedDate,
        supplier: input.supplier?.trim() || undefined,
        photoId: input.photoId,
        photoDataUrl: input.photoDataUrl,
        notes: input.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now
      };
      await database.inventoryBundles.put(bundle);

      const newTotal = await recalculateVariantTotalInTx(variant.id, database);
      // Automatically inherit roll photo as the variant's main photo if variant has none yet
      const inheritedPhotoDataUrl = variant.photoDataUrl || input.photoDataUrl || undefined;
      const inheritedPhotoId = variant.photoId || input.photoId || undefined;

      const updatedVariant: InventoryVariant = {
        ...variant,
        totalQuantity: newTotal,
        purchaseCostPaise,
        photoId: inheritedPhotoId,
        photoDataUrl: inheritedPhotoDataUrl,
        updatedAt: now
      };
      await database.inventoryVariants.put(updatedVariant);
      await syncCatalogueItemForVariantInTx(updatedVariant, database, true);

      const movement: InventoryMovement = {
        id: generateId('mov'),
        variantId: variant.id,
        bundleId: bundle.id,
        bundleCode: bundle.bundleCode,
        type: 'receive',
        quantityDelta: qty,
        balanceAfter: newTotal,
        unit: variant.unit,
        reason: input.notes?.trim()
          ? `Received ${bundleCode}: ${input.notes.trim()}`
          : `Received bundle ${bundleCode}`,
        date: receivedDate,
        createdAt: now
      };
      await database.inventoryMovements.put(movement);

      return { variant: updatedVariant, bundle, movement };
    }
  );
}

export interface UpdateInventoryBundleInput {
  bundleId: string;
  bundleCode?: string;
  initialQuantity?: number;
  purchaseCostPaise?: number;
  receivedDate?: string;
  supplier?: string;
  notes?: string;
  photoId?: string | null;
  photoDataUrl?: string | null;
  adjustmentReason?: string;
}

/**
 * Safely updates an individual roll/bundle's metadata and initial quantity.
 * Prevents reducing `initialQuantity` below the quantity already sold/deducted from this roll,
 * preserves FIFO integrity, and logs an audit movement if quantity changed.
 */
export async function updateInventoryBundle(
  input: UpdateInventoryBundleInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<{
  variant: InventoryVariant;
  bundle: InventoryBundle;
  movement?: InventoryMovement;
}> {
  await database.ensureSeeded();
  if (!input.bundleId) {
    throw new Error('Bundle ID is required');
  }

  return await database.transaction(
    'rw',
    database.inventoryVariants,
    database.inventoryBundles,
    database.inventoryMovements,
    database.catalogue,
    async () => {
      const existing = await database.inventoryBundles.get(input.bundleId);
      if (!existing) {
        throw new Error('Roll / bundle not found');
      }
      const variant = await database.inventoryVariants.get(existing.variantId);
      if (!variant) {
        throw new Error('Parent inventory variant not found');
      }

      const alreadyDeductedMilli = Math.max(
        0,
        toQtyUnits(existing.initialQuantity) - toQtyUnits(existing.remainingQuantity)
      );
      const alreadyDeducted = fromQtyUnits(alreadyDeductedMilli);

      let newInitial = existing.initialQuantity;
      let newRemaining = existing.remainingQuantity;
      let deltaQty = 0;

      if (input.initialQuantity !== undefined) {
        const candidateInit = roundStockQty(Number(input.initialQuantity));
        if (!Number.isFinite(candidateInit) || candidateInit <= 0) {
          throw new Error('Roll initial quantity must be greater than zero');
        }
        if (toQtyUnits(candidateInit) < alreadyDeductedMilli) {
          throw new Error(
            `Cannot set roll initial quantity to ${formatStockQuantity(
              candidateInit,
              existing.unit
            )} because ${formatStockQuantity(
              alreadyDeducted,
              existing.unit
            )} has already been sold/deducted from ${existing.bundleCode}.`
          );
        }
        const diffMilli = toQtyUnits(candidateInit) - toQtyUnits(existing.initialQuantity);
        deltaQty = fromQtyUnits(diffMilli);
        newInitial = candidateInit;
        newRemaining = fromQtyUnits(Math.max(0, toQtyUnits(existing.remainingQuantity) + diffMilli));
      }

      const now = new Date().toISOString();
      const nextPhotoDataUrl =
        input.photoDataUrl === null
          ? undefined
          : input.photoDataUrl !== undefined
          ? input.photoDataUrl
          : existing.photoDataUrl;
      const nextPhotoId =
        input.photoId === null
          ? undefined
          : input.photoId !== undefined
          ? input.photoId
          : existing.photoId;

      const updatedBundle: InventoryBundle = {
        ...existing,
        bundleCode: input.bundleCode?.trim() || existing.bundleCode,
        initialQuantity: newInitial,
        remainingQuantity: newRemaining,
        purchaseCostPaise:
          input.purchaseCostPaise !== undefined
            ? Math.max(0, Math.round(Number(input.purchaseCostPaise)))
            : existing.purchaseCostPaise,
        receivedDate: input.receivedDate?.trim() || existing.receivedDate,
        supplier:
          input.supplier !== undefined
            ? input.supplier.trim() || undefined
            : existing.supplier,
        notes:
          input.notes !== undefined
            ? input.notes.trim() || undefined
            : existing.notes,
        photoId: nextPhotoId,
        photoDataUrl: nextPhotoDataUrl,
        updatedAt: now
      };
      await database.inventoryBundles.put(updatedBundle);

      const newTotal = await recalculateVariantTotalInTx(variant.id, database);
      let updatedVariant = (await database.inventoryVariants.get(variant.id))!;

      // Inherit roll photo onto variant if variant still has no photo
      if (nextPhotoDataUrl && !updatedVariant.photoDataUrl) {
        updatedVariant = {
          ...updatedVariant,
          photoId: nextPhotoId || updatedVariant.photoId,
          photoDataUrl: nextPhotoDataUrl,
          updatedAt: now
        };
        await database.inventoryVariants.put(updatedVariant);
        await syncCatalogueItemForVariantInTx(updatedVariant, database, true);
      }

      let movement: InventoryMovement | undefined;
      if (deltaQty !== 0) {
        movement = {
          id: generateId('mov'),
          variantId: variant.id,
          bundleId: updatedBundle.id,
          bundleCode: updatedBundle.bundleCode,
          type: 'adjustment',
          quantityDelta: deltaQty,
          balanceAfter: newTotal,
          unit: variant.unit,
          reason:
            input.adjustmentReason?.trim() ||
            `Data Entry Correction: updated initial roll qty for ${updatedBundle.bundleCode}`,
          date: getTodayIsoDate(),
          createdAt: now
        };
        await database.inventoryMovements.put(movement);
      }

      return { variant: updatedVariant, bundle: updatedBundle, movement };
    }
  );
}

/**
 * Safely deletes a mistakenly created roll/bundle ONLY when zero stock has been deducted/sold from it.
 * If any invoice or deduction has already used this roll, blocks deletion and guides the user to Adjust Stock.
 */
export async function deleteInventoryBundle(
  bundleId: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<{ variant: InventoryVariant; deletedBundleId: string }> {
  await database.ensureSeeded();
  if (!bundleId) {
    throw new Error('Bundle ID is required');
  }

  return await database.transaction(
    'rw',
    database.inventoryVariants,
    database.inventoryBundles,
    database.inventoryMovements,
    async () => {
      const bundle = await database.inventoryBundles.get(bundleId);
      if (!bundle) {
        throw new Error('Roll / bundle not found');
      }

      const variant = await database.inventoryVariants.get(bundle.variantId);
      if (!variant) {
        throw new Error('Parent inventory variant not found');
      }

      const bundleMovements = await database.inventoryMovements
        .where('bundleId')
        .equals(bundleId)
        .toArray();
      const hasSaleOrInvoiceAllocations = bundleMovements.some(
        (m) => m.type === 'sale' || m.type === 'edit_reconcile' || Boolean(m.invoiceId)
      );
      const hasBeenUsed =
        toQtyUnits(bundle.remainingQuantity) !== toQtyUnits(bundle.initialQuantity) ||
        hasSaleOrInvoiceAllocations;

      if (hasBeenUsed) {
        throw new Error(
          `Cannot delete roll ${bundle.bundleCode} because stock from this roll has already been sold or adjusted. Use Adjust Stock to set remaining quantity to 0 instead.`
        );
      }

      await database.inventoryBundles.delete(bundleId);
      const newTotal = await recalculateVariantTotalInTx(variant.id, database);
      const updatedVariant = (await database.inventoryVariants.get(variant.id))!;

      const now = new Date().toISOString();
      const reversalMovement: InventoryMovement = {
        id: generateId('mov'),
        variantId: variant.id,
        bundleId: bundle.id,
        bundleCode: bundle.bundleCode,
        type: 'adjustment',
        quantityDelta: -bundle.initialQuantity,
        balanceAfter: newTotal,
        unit: variant.unit,
        reason: `Removed unused roll ${bundle.bundleCode} (Data Entry Correction)`,
        date: getTodayIsoDate(),
        createdAt: now
      };
      await database.inventoryMovements.put(reversalMovement);

      return { variant: updatedVariant, deletedBundleId: bundleId };
    }
  );
}

export interface AdjustInventoryStockInput {
  variantId: string;
  bundleId?: string;
  quantityDelta?: number; // Positive to add, negative to deduct
  actualRemainingQuantity?: number; // Alternative: enter exact remaining quantity (including 0) and auto-compute delta
  reason: string;
  date?: string;
}

export async function adjustInventoryStock(
  input: AdjustInventoryStockInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<{ variant: InventoryVariant; movement: InventoryMovement; computedDelta: number }> {
  await database.ensureSeeded();
  const cleanReason = String(input.reason || '').trim();
  if (!cleanReason) {
    throw new Error('A reason is required for manual stock adjustments');
  }

  return await database.transaction(
    'rw',
    database.inventoryVariants,
    database.inventoryBundles,
    database.inventoryMovements,
    async () => {
      const variant = await database.inventoryVariants.get(input.variantId);
      if (!variant) {
        throw new Error('Inventory variant not found');
      }

      const bundles = await listInventoryBundlesInTx(variant.id, database);
      const now = new Date().toISOString();
      const date = input.date || getTodayIsoDate();

      let delta: number;
      let reasonWithDetail = cleanReason;

      if (input.actualRemainingQuantity !== undefined && input.actualRemainingQuantity !== null) {
        const targetActual = roundStockQty(Number(input.actualRemainingQuantity));
        if (!Number.isFinite(targetActual) || targetActual < 0) {
          throw new Error('Actual remaining quantity must be zero or greater');
        }
        let currentBasis = variant.totalQuantity;
        if (input.bundleId) {
          const targetBundle = bundles.find((b) => b.id === input.bundleId);
          if (!targetBundle) {
            throw new Error('Selected bundle/roll not found');
          }
          currentBasis = targetBundle.remainingQuantity;
        }
        delta = fromQtyUnits(toQtyUnits(targetActual) - toQtyUnits(currentBasis));
        if (delta === 0) {
          throw new Error(
            `Actual remaining quantity is already ${formatStockQuantity(targetActual, variant.unit)}`
          );
        }
        reasonWithDetail = `${cleanReason} (Set remaining: ${formatStockQuantity(
          currentBasis,
          variant.unit
        )} → ${formatStockQuantity(targetActual, variant.unit)})`;
      } else {
        delta = roundStockQty(Number(input.quantityDelta));
        if (!Number.isFinite(delta) || delta === 0) {
          throw new Error('Adjustment quantity must be a non-zero number');
        }
      }

      let affectedBundleCode: string | undefined;
      let affectedBundleId: string | undefined;

      if (delta < 0) {
        const neededMilli = Math.abs(toQtyUnits(delta));
        const currentTotalMilli = toQtyUnits(variant.totalQuantity);
        if (neededMilli > currentTotalMilli) {
          throw new Error(
            `Cannot reduce stock by ${formatStockQuantity(
              Math.abs(delta),
              variant.unit
            )}: only ${formatStockQuantity(variant.totalQuantity, variant.unit)} available.`
          );
        }

        if (input.bundleId) {
          const targetBundle = bundles.find((b) => b.id === input.bundleId);
          if (!targetBundle) {
            throw new Error('Selected bundle/roll not found');
          }
          const remMilli = toQtyUnits(targetBundle.remainingQuantity);
          if (neededMilli > remMilli) {
            throw new Error(
              `Bundle ${targetBundle.bundleCode} only has ${formatStockQuantity(
                targetBundle.remainingQuantity,
                variant.unit
              )} remaining.`
            );
          }
          await database.inventoryBundles.put({
            ...targetBundle,
            remainingQuantity: fromQtyUnits(remMilli - neededMilli),
            updatedAt: now
          });
          affectedBundleId = targetBundle.id;
          affectedBundleCode = targetBundle.bundleCode;
        } else {
          // Deduct in FIFO order across bundles
          let remainingToDeduct = neededMilli;
          for (const b of bundles) {
            if (remainingToDeduct <= 0) break;
            const avail = toQtyUnits(b.remainingQuantity);
            if (avail <= 0) continue;
            const take = Math.min(avail, remainingToDeduct);
            await database.inventoryBundles.put({
              ...b,
              remainingQuantity: fromQtyUnits(avail - take),
              updatedAt: now
            });
            remainingToDeduct -= take;
            if (!affectedBundleCode) {
              affectedBundleId = b.id;
              affectedBundleCode = b.bundleCode;
            }
          }
        }
      } else {
        // Positive adjustment
        if (input.bundleId) {
          const targetBundle = bundles.find((b) => b.id === input.bundleId);
          if (!targetBundle) {
            throw new Error('Selected bundle/roll not found');
          }
          const newRem = fromQtyUnits(toQtyUnits(targetBundle.remainingQuantity) + toQtyUnits(delta));
          const newInit = Math.max(targetBundle.initialQuantity, newRem);
          await database.inventoryBundles.put({
            ...targetBundle,
            initialQuantity: newInit,
            remainingQuantity: newRem,
            updatedAt: now
          });
          affectedBundleId = targetBundle.id;
          affectedBundleCode = targetBundle.bundleCode;
        } else if (bundles.length > 0) {
          // Add to newest bundle
          const newest = bundles[bundles.length - 1];
          const newRem = fromQtyUnits(toQtyUnits(newest.remainingQuantity) + toQtyUnits(delta));
          const newInit = Math.max(newest.initialQuantity, newRem);
          await database.inventoryBundles.put({
            ...newest,
            initialQuantity: newInit,
            remainingQuantity: newRem,
            updatedAt: now
          });
          affectedBundleId = newest.id;
          affectedBundleCode = newest.bundleCode;
        } else {
          const adjBundle: InventoryBundle = {
            id: generateId('bnd'),
            variantId: variant.id,
            bundleCode: `BND-ADJ-01`,
            initialQuantity: delta,
            remainingQuantity: delta,
            unit: variant.unit,
            purchaseCostPaise: variant.purchaseCostPaise,
            receivedDate: date,
            notes: reasonWithDetail,
            createdAt: now,
            updatedAt: now
          };
          await database.inventoryBundles.put(adjBundle);
          affectedBundleId = adjBundle.id;
          affectedBundleCode = adjBundle.bundleCode;
        }
      }

      const newTotal = await recalculateVariantTotalInTx(variant.id, database);
      const updatedVariant = (await database.inventoryVariants.get(variant.id))!;

      const movement: InventoryMovement = {
        id: generateId('mov'),
        variantId: variant.id,
        bundleId: affectedBundleId,
        bundleCode: affectedBundleCode,
        type: 'adjustment',
        quantityDelta: delta,
        balanceAfter: newTotal,
        unit: variant.unit,
        reason: reasonWithDetail,
        date,
        createdAt: now
      };
      await database.inventoryMovements.put(movement);

      return { variant: updatedVariant, movement, computedDelta: delta };
    }
  );
}

async function listInventoryBundlesInTx(
  variantId: string,
  database: ALIFBillingDatabase
): Promise<InventoryBundle[]> {
  const bundles = await database.inventoryBundles.where('variantId').equals(variantId).toArray();
  // FIFO order: oldest receivedDate first, then oldest createdAt first
  return bundles.sort((a, b) => {
    if (a.receivedDate !== b.receivedDate) {
      return a.receivedDate.localeCompare(b.receivedDate);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function listInventoryBundles(
  variantId?: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<InventoryBundle[]> {
  await database.ensureSeeded();
  if (!canUseInventoryStores(database)) return [];
  const bundles = variantId
    ? await database.inventoryBundles.where('variantId').equals(variantId).toArray()
    : await database.inventoryBundles.toArray();
  return bundles.sort((a, b) => {
    if (a.receivedDate !== b.receivedDate) {
      return a.receivedDate.localeCompare(b.receivedDate);
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function listInventoryMovements(
  variantId?: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<InventoryMovement[]> {
  await database.ensureSeeded();
  if (!canUseInventoryStores(database)) return [];
  const movements = variantId
    ? await database.inventoryMovements.where('variantId').equals(variantId).toArray()
    : await database.inventoryMovements.toArray();
  return movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface InventoryFilterOptions {
  category?: string;
  productType?: string;
  workDesign?: string;
  color?: string;
  stockStatus?: StockStatus | 'All';
  search?: string;
  activeOnly?: boolean;
}

export async function listInventoryVariants(
  filters: InventoryFilterOptions = {},
  database: ALIFBillingDatabase = defaultDb
): Promise<InventoryVariant[]> {
  await database.ensureSeeded();
  if (!canUseInventoryStores(database)) return [];
  let variants = await database.inventoryVariants.toArray();

  if (filters.activeOnly) {
    variants = variants.filter((v) => v.isActive);
  }
  if (filters.category && filters.category !== 'All') {
    variants = variants.filter((v) => v.category === filters.category);
  }
  if (filters.productType && filters.productType !== 'All') {
    variants = variants.filter((v) => v.productType === filters.productType);
  }
  if (filters.workDesign && filters.workDesign !== 'All') {
    variants = variants.filter((v) => v.workDesign === filters.workDesign);
  }
  if (filters.color && filters.color !== 'All') {
    variants = variants.filter((v) => v.color === filters.color);
  }
  if (filters.stockStatus && filters.stockStatus !== 'All') {
    variants = variants.filter((v) => getVariantStockStatus(v) === filters.stockStatus);
  }

  if (filters.search && filters.search.trim()) {
    const ranked = searchInventoryVariants(variants, filters.search);
    return ranked.map((r) => r.item);
  }

  return variants.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.productType !== b.productType) return a.productType.localeCompare(b.productType);
    if (a.workDesign !== b.workDesign) return a.workDesign.localeCompare(b.workDesign);
    return a.color.localeCompare(b.color);
  });
}

/**
 * Internal FIFO deduction helper used inside atomic invoice transactions.
 * Deducts from oldest eligible bundle first, tracks exact allocations per bundle,
 * and throws a descriptive error if stock is insufficient.
 */
async function deductLineItemsFIFOInTx(
  items: InvoiceLineItem[],
  invoiceId: string,
  invoiceNumber: string,
  invoiceDate: string,
  movementType: 'sale' | 'edit_reconcile',
  database: ALIFBillingDatabase
): Promise<InvoiceLineItem[]> {
  if (!canUseInventoryStores(database)) {
    return items;
  }

  const now = new Date().toISOString();
  const processed: InvoiceLineItem[] = [];

  for (const item of items) {
    // Services and explicit non-stock items NEVER reduce inventory
    if (item.category === 'service' || item.isNonStock) {
      processed.push({
        ...item,
        inventoryVariantId: null,
        stockAllocations: undefined
      });
      continue;
    }

    let resolvedVariantId = item.inventoryVariantId ?? null;
    if (
      !resolvedVariantId &&
      item.catalogueItemId &&
      !GENERIC_NON_STOCK_CATALOGUE_IDS.has(item.catalogueItemId)
    ) {
      const catItem = await database.catalogue.get(item.catalogueItemId);
      if (catItem?.inventoryVariantId) {
        resolvedVariantId = catItem.inventoryVariantId;
      }
    }

    if (!resolvedVariantId) {
      processed.push({
        ...item,
        inventoryVariantId: null,
        stockAllocations: undefined
      });
      continue;
    }

    const variant = await database.inventoryVariants.get(resolvedVariantId);
    if (!variant) {
      throw new Error(`Linked inventory variant for "${item.name}" was not found.`);
    }

    const requiredMilli = toQtyUnits(item.quantity);
    if (requiredMilli <= 0) {
      throw new Error(`Item "${item.name}" must have a quantity greater than zero.`);
    }

    const bundles = await listInventoryBundlesInTx(variant.id, database);
    let availableMilli = 0;
    for (const b of bundles) {
      if (b.remainingQuantity > 0) {
        availableMilli += toQtyUnits(b.remainingQuantity);
      }
    }

    if (requiredMilli > availableMilli) {
      throw new Error(
        `Insufficient stock for "${variant.name}": required ${formatStockQuantity(
          fromQtyUnits(requiredMilli),
          variant.unit
        )}, available ${formatStockQuantity(fromQtyUnits(availableMilli), variant.unit)}.`
      );
    }

    let remainingNeededMilli = requiredMilli;
    const allocations: StockAllocation[] = [];

    for (const bundle of bundles) {
      if (remainingNeededMilli <= 0) break;
      const bundleAvailMilli = toQtyUnits(bundle.remainingQuantity);
      if (bundleAvailMilli <= 0) continue;

      const deductMilli = Math.min(bundleAvailMilli, remainingNeededMilli);
      const newBundleRem = fromQtyUnits(bundleAvailMilli - deductMilli);
      const deductedQty = fromQtyUnits(deductMilli);

      await database.inventoryBundles.put({
        ...bundle,
        remainingQuantity: newBundleRem,
        updatedAt: now
      });

      allocations.push({
        bundleId: bundle.id,
        bundleCode: bundle.bundleCode,
        quantityDeducted: deductedQty,
        purchaseCostPaise: bundle.purchaseCostPaise
      });

      remainingNeededMilli -= deductMilli;
    }

    const newVariantTotal = await recalculateVariantTotalInTx(variant.id, database);

    for (const alloc of allocations) {
      const mov: InventoryMovement = {
        id: generateId('mov'),
        variantId: variant.id,
        bundleId: alloc.bundleId,
        bundleCode: alloc.bundleCode,
        type: movementType,
        quantityDelta: -alloc.quantityDeducted,
        balanceAfter: newVariantTotal,
        unit: variant.unit,
        reason:
          movementType === 'sale'
            ? `Sold on Bill ${invoiceNumber} (${alloc.bundleCode})`
            : `Allocated on edited Bill ${invoiceNumber} (${alloc.bundleCode})`,
        invoiceId,
        invoiceNumber,
        lineItemId: item.id,
        date: invoiceDate,
        createdAt: now
      };
      await database.inventoryMovements.put(mov);
    }

    processed.push({
      ...item,
      inventoryVariantId: variant.id,
      stockAllocations: allocations
    });
  }

  return processed;
}

/**
 * Restores previously allocated bundle quantities back to their respective bundles.
 */
async function restoreLineItemsStockInTx(
  items: InvoiceLineItem[],
  invoiceId: string,
  invoiceNumber: string,
  movementType: 'cancel_restore' | 'edit_reconcile',
  reasonPrefix: string,
  database: ALIFBillingDatabase
): Promise<void> {
  if (!canUseInventoryStores(database)) return;
  const now = new Date().toISOString();
  const today = getTodayIsoDate();

  for (const item of items) {
    if (!item.inventoryVariantId || !item.stockAllocations || item.stockAllocations.length === 0) {
      continue;
    }

    const variant = await database.inventoryVariants.get(item.inventoryVariantId);
    for (const alloc of item.stockAllocations) {
      const restoreMilli = toQtyUnits(alloc.quantityDeducted);
      if (restoreMilli <= 0) continue;

      const bundle = await database.inventoryBundles.get(alloc.bundleId);
      if (bundle) {
        const newRem = fromQtyUnits(toQtyUnits(bundle.remainingQuantity) + restoreMilli);
        await database.inventoryBundles.put({
          ...bundle,
          remainingQuantity: newRem,
          updatedAt: now
        });
      } else if (variant) {
        // Recreate bundle if it was somehow missing
        await database.inventoryBundles.put({
          id: alloc.bundleId,
          variantId: variant.id,
          bundleCode: alloc.bundleCode || 'BND-RESTORED',
          initialQuantity: fromQtyUnits(restoreMilli),
          remainingQuantity: fromQtyUnits(restoreMilli),
          unit: variant.unit,
          purchaseCostPaise: alloc.purchaseCostPaise ?? variant.purchaseCostPaise,
          receivedDate: today,
          notes: `Restored from ${invoiceNumber}`,
          createdAt: now,
          updatedAt: now
        });
      }

      const newTotal = await recalculateVariantTotalInTx(item.inventoryVariantId, database);

      if (variant) {
        const mov: InventoryMovement = {
          id: generateId('mov'),
          variantId: variant.id,
          bundleId: alloc.bundleId,
          bundleCode: alloc.bundleCode,
          type: movementType,
          quantityDelta: fromQtyUnits(restoreMilli),
          balanceAfter: newTotal,
          unit: variant.unit,
          reason: `${reasonPrefix} (${alloc.bundleCode})`,
          invoiceId,
          invoiceNumber,
          lineItemId: item.id,
          date: today,
          createdAt: now
        };
        await database.inventoryMovements.put(mov);
      }
    }
  }
}

// ============================================================================
// 5. INVOICE CREATION, NUMBERING & DUPLICATE PREVENTION
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
  inventoryVariantId?: string | null;
  isNonStock?: boolean;
  name: string;
  category: CatalogueCategory;
  quantity: number;
  unit: string;
  unitPricePaise: number;
  costPricePaise?: number;
  notes?: string;
  photoId?: string;
  newStockVariantSpec?: NewStockVariantSpec;
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
    // Check idempotency key in DB to prevent duplicate invoice creation & duplicate stock deduction
    if (input.idempotencyKey) {
      const existingByKey = await database.invoices
        .where('idempotencyKey')
        .equals(input.idempotencyKey)
        .first();
      if (existingByKey) {
        throw new Error(
          `Duplicate submission prevented: Invoice ${existingByKey.invoiceNumber} already saved.`
        );
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

    const rawSpecsByLineId = new Map<string, NewStockVariantSpec>();

    const normalizedItems: InvoiceLineItem[] = input.items.map((raw, idx) => {
      const lineId = raw.id || generateId(`line-${idx + 1}`);
      const spec = raw.newStockVariantSpec;
      const fallbackName = spec
        ? `${String(spec.color || '').trim()} ${String(spec.productType || '').trim()} — ${
            String(spec.workDesign || '').trim() || 'Standard'
          }`.trim()
        : '';
      const itemName = String(raw.name || fallbackName || '').trim();
      if (!itemName) {
        throw new Error(`Line item #${idx + 1} requires a name`);
      }
      const qty = roundStockQty(Number(raw.quantity));
      const unitPaise = Math.round(Number(raw.unitPricePaise));
      const lineTotalPaise = calculateLineTotalPaise(qty, unitPaise);
      if (spec) {
        rawSpecsByLineId.set(lineId, spec);
      }
      return {
        id: lineId,
        catalogueItemId: raw.catalogueItemId ?? null,
        inventoryVariantId:
          raw.category === 'service' || raw.isNonStock ? null : raw.inventoryVariantId ?? undefined,
        isNonStock: spec ? false : Boolean(raw.isNonStock),
        name: itemName,
        category: spec ? 'product' : raw.category || 'service',
        quantity: qty,
        unit: String(spec?.unit || raw.unit || 'pc').trim() || 'pc',
        unitPricePaise: unitPaise,
        costPricePaise:
          raw.costPricePaise !== undefined
            ? Math.round(raw.costPricePaise)
            : spec?.purchaseCostPaise !== undefined
            ? Math.round(spec.purchaseCostPaise)
            : undefined,
        lineTotalPaise,
        notes: raw.notes ? String(raw.notes).trim() : undefined,
        photoId: raw.photoId || spec?.photoId || undefined
      };
    });

    const invoiceDate = input.invoiceDate || getTodayIsoDate();
    const discountType: DiscountType = input.discountType || 'flat';
    const discountValue = Number(input.discountValue || 0);
    if (discountValue < 0) {
      throw new Error('Discount cannot be negative');
    }

    const settings = await getShopSettings(database);

    const txTables: any[] = [
      database.settings,
      database.customers,
      database.catalogue,
      database.invoices,
      database.payments
    ];
    if (canUseItemPhotosStore(database)) {
      txTables.push(database.itemPhotos);
    }
    if (canUseInventoryStores(database)) {
      txTables.push(
        database.inventoryVariants,
        database.inventoryBundles,
        database.inventoryMovements
      );
    }

    return await database.transaction(
      'rw',
      ...(txTables as [any, ...any[]]),
      async () => {
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

        const invoiceId = generateId('inv');

        // Step A: If any line item carries an inline `newStockVariantSpec`, atomically create
        // its InventoryVariant, opening InventoryBundle, receive movement, and synced CatalogueItem
        // BEFORE running FIFO deduction. If any validation or stock check fails, the entire transaction rolls back!
        if (rawSpecsByLineId.size > 0 && canUseInventoryStores(database)) {
          const currentVariants = await database.inventoryVariants.toArray();
          for (const lineItem of normalizedItems) {
            const spec = rawSpecsByLineId.get(lineItem.id);
            if (!spec) continue;

            const vCategory = String(spec.category || 'Fabric').trim() || 'Fabric';
            const vProductType = String(spec.productType || '').trim();
            const vWorkDesign = String(spec.workDesign || 'Standard').trim() || 'Standard';
            const vColor = String(spec.color || '').trim();
            const vUnit = String(spec.unit || lineItem.unit || 'm').trim() || 'm';
            const openingQty = roundStockQty(Number(spec.openingStockQuantity || 0));

            if (!vProductType) {
              throw new Error(`New stock item "${lineItem.name}" requires a Product Type.`);
            }
            if (!vColor) {
              throw new Error(`New stock item "${lineItem.name}" requires a Colour.`);
            }
            if (!Number.isFinite(openingQty) || openingQty <= 0) {
              throw new Error(
                `New stock item "${lineItem.name}" requires an opening roll stock quantity greater than 0.`
              );
            }
            if (toQtyUnits(openingQty) < toQtyUnits(lineItem.quantity)) {
              throw new Error(
                `Insufficient opening stock for "${lineItem.name}": opening stock is ${formatStockQuantity(
                  openingQty,
                  vUnit
                )}, but bill requires ${formatStockQuantity(lineItem.quantity, vUnit)}.`
              );
            }

            const existingDup = findDuplicateInventoryVariant(currentVariants, {
              category: vCategory,
              productType: vProductType,
              workDesign: vWorkDesign,
              color: vColor
            });
            if (existingDup) {
              throw new Error(
                `Duplicate variant already exists: "${existingDup.name}". Please select the existing variant instead of creating a duplicate.`
              );
            }

            const variantId = generateId('var');
            const sku = `${buildSkuFromHierarchy(
              vCategory,
              vProductType,
              vWorkDesign,
              vColor
            )}-${Math.floor(100 + Math.random() * 900)}`;
            const variantName = `${vColor} ${vProductType} — ${vWorkDesign}`;
            const purchaseCostPaise = Math.max(
              0,
              Math.round(Number(spec.purchaseCostPaise ?? lineItem.costPricePaise ?? 0))
            );
            const defaultSellingPricePaise = Math.max(
              0,
              Math.round(Number(spec.defaultSellingPricePaise ?? lineItem.unitPricePaise ?? 0))
            );
            const lowStockThreshold = Math.max(
              0,
              roundStockQty(Number(spec.lowStockThreshold ?? 3))
            );
            const recDate = spec.receivedDate || invoiceDate;
            const bundleCode =
              spec.bundleCode?.trim() ||
              `BND-${sku.split('-').slice(0, 2).join('')}-01`;

            const newVariant: InventoryVariant = {
              id: variantId,
              sku,
              name: variantName,
              category: vCategory,
              productType: vProductType,
              workDesign: vWorkDesign,
              color: vColor,
              unit: vUnit,
              purchaseCostPaise,
              defaultSellingPricePaise,
              lowStockThreshold,
              totalQuantity: openingQty,
              photoId: spec.photoId || lineItem.photoId,
              photoDataUrl: spec.photoDataUrl,
              notes: spec.notes?.trim() || `Created inline on Bill ${invoiceNumber}`,
              isActive: true,
              isPinned: false,
              createdAt: now,
              updatedAt: now
            };
            await database.inventoryVariants.put(newVariant);
            currentVariants.push(newVariant);

            const openingBundle: InventoryBundle = {
              id: generateId('bnd'),
              variantId: newVariant.id,
              bundleCode,
              initialQuantity: openingQty,
              remainingQuantity: openingQty,
              unit: vUnit,
              purchaseCostPaise,
              receivedDate: recDate,
              supplier: spec.supplier?.trim() || undefined,
              photoId: spec.photoId || lineItem.photoId,
              photoDataUrl: spec.photoDataUrl,
              notes: `Opening stock received on Bill ${invoiceNumber}`,
              createdAt: now,
              updatedAt: now
            };
            await database.inventoryBundles.put(openingBundle);

            const receiveMov: InventoryMovement = {
              id: generateId('mov'),
              variantId: newVariant.id,
              bundleId: openingBundle.id,
              bundleCode: openingBundle.bundleCode,
              type: 'receive',
              quantityDelta: openingQty,
              balanceAfter: openingQty,
              unit: vUnit,
              reason: `Opening stock received inline on Bill ${invoiceNumber} (${bundleCode})`,
              invoiceId,
              invoiceNumber,
              lineItemId: lineItem.id,
              date: recDate,
              createdAt: now
            };
            await database.inventoryMovements.put(receiveMov);

            const syncedCat = await syncCatalogueItemForVariantInTx(newVariant, database, true);

            lineItem.inventoryVariantId = newVariant.id;
            lineItem.catalogueItemId = syncedCat ? syncedCat.id : null;
            lineItem.isNonStock = false;
            lineItem.name = newVariant.name;
            lineItem.unit = vUnit;
            lineItem.costPricePaise = purchaseCostPaise;
          }
        }

        // Step B: Perform FIFO stock deduction ONLY inside this atomic save transaction.
        // If any stock-linked item has insufficient stock, this throws and rolls back the entire transaction!
        const itemsWithAllocations = await deductLineItemsFIFOInTx(
          normalizedItems,
          invoiceId,
          invoiceNumber,
          invoiceDate,
          'sale',
          database
        );

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

        // Update sequence counter
        await database.settings.put({
          ...settings,
          nextInvoiceSequence: seq + 1,
          updatedAt: now
        });

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
          items: itemsWithAllocations,
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
          stockRestoredOnCancel: false,
          idempotencyKey: input.idempotencyKey,
          createdAt: now,
          updatedAt: now
        };

        await database.invoices.put(invoice);
        if (canUseItemPhotosStore(database)) {
          try {
            for (const item of itemsWithAllocations) {
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
          } catch (_photoErr) {
            // Safeguard against missing objectStore in legacy connections
          }
        } else {
          for (const item of itemsWithAllocations) {
            if (item.photoId && memoryPhotoFallback.has(item.photoId)) {
              const existingPhoto = memoryPhotoFallback.get(item.photoId)!;
              memoryPhotoFallback.set(item.photoId, {
                ...existingPhoto,
                invoiceId,
                lineItemId: item.id
              });
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
// 6. PAYMENTS, REFUNDS, CORRECTIONS, CANCELLATIONS & REOPENING
// ============================================================================

export interface RecordPaymentInput {
  invoiceId: string;
  amountPaise: number;
  method: PaymentMethod;
  type?: PaymentRecordType; // default 'payment'
  date?: string;
  note?: string;
}

/**
 * Records an advance, balance payment, refund, or correction.
 * Strictly financial ledger operation — never deducts or alters physical stock.
 */
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

/**
 * Cancels an invoice and restores any deducted physical stock back to its original bundles
 * EXACTLY ONCE. Calling cancelInvoice again on an already-cancelled invoice never double-restores stock.
 */
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

  const cancelTables: any[] = [database.invoices, database.payments];
  if (canUseInventoryStores(database)) {
    cancelTables.push(
      database.inventoryVariants,
      database.inventoryBundles,
      database.inventoryMovements
    );
  }

  return await database.transaction('rw', ...(cancelTables as [any, ...any[]]), async () => {
    const invoice: Invoice | undefined = await database.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Restore stock ONLY if not already cancelled & restored
    const shouldRestoreStock =
      invoice.status !== 'Cancelled' && !invoice.stockRestoredOnCancel;

    if (shouldRestoreStock) {
      await restoreLineItemsStockInTx(
        invoice.items,
        invoice.id,
        invoice.invoiceNumber,
        'cancel_restore',
        `Restored on cancellation of Bill ${invoice.invoiceNumber}: ${cleanReason}`,
        database
      );
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
      stockRestoredOnCancel: true,
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

/**
 * Reopens a cancelled invoice or updates an existing invoice's line items,
 * reconciling physical stock atomically (restoring previous allocations if still held,
 * then deducting new FIFO allocations for the updated items).
 */
export async function reopenAndUpdateInvoice(
  input: ReopenOrEditInvoiceInput,
  database: ALIFBillingDatabase = defaultDb
): Promise<Invoice> {
  await database.ensureSeeded();
  const reopenTables: any[] = [
    database.invoices,
    database.payments,
    database.catalogue
  ];
  if (canUseItemPhotosStore(database)) {
    reopenTables.push(database.itemPhotos);
  }
  if (canUseInventoryStores(database)) {
    reopenTables.push(
      database.inventoryVariants,
      database.inventoryBundles,
      database.inventoryMovements
    );
  }

  return await database.transaction('rw', ...(reopenTables as [any, ...any[]]), async () => {
    const invoice: Invoice | undefined = await database.invoices.get(input.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const rawTargetItems: InvoiceLineItem[] = input.items
      ? input.items.map((raw, idx) => {
          const prevMatch = invoice.items.find((p) => p.id === raw.id);
          const qty = roundStockQty(Number(raw.quantity));
          const unitPricePaise = Math.round(Number(raw.unitPricePaise));
          const lineTotalPaise = calculateLineTotalPaise(qty, unitPricePaise);
          return {
            id: raw.id || generateId(`line-${idx + 1}`),
            catalogueItemId: raw.catalogueItemId ?? null,
            inventoryVariantId:
              raw.category === 'service' || raw.isNonStock
                ? null
                : raw.inventoryVariantId !== undefined
                ? raw.inventoryVariantId
                : prevMatch?.inventoryVariantId ?? undefined,
            isNonStock:
              raw.isNonStock !== undefined ? raw.isNonStock : prevMatch?.isNonStock,
            name: String(raw.name || '').trim(),
            category: raw.category || 'service',
            quantity: qty,
            unit: String(raw.unit || 'pc').trim() || 'pc',
            unitPricePaise,
            costPricePaise:
              raw.costPricePaise !== undefined ? Math.round(raw.costPricePaise) : undefined,
            lineTotalPaise,
            notes: raw.notes ? String(raw.notes).trim() : undefined,
            photoId: raw.photoId || undefined
          };
        })
      : invoice.items.map((it) => ({ ...it }));

    if (rawTargetItems.length === 0) {
      throw new Error('Invoice must contain at least one item');
    }

    // Step 1: If the invoice had active stock deductions (was not cancelled or not yet restored),
    // return those allocations to their bundles first before re-allocating.
    if (invoice.status !== 'Cancelled' && !invoice.stockRestoredOnCancel) {
      await restoreLineItemsStockInTx(
        invoice.items,
        invoice.id,
        invoice.invoiceNumber,
        'edit_reconcile',
        `Reconciled previous allocation for edited Bill ${invoice.invoiceNumber}`,
        database
      );
    }

    // Step 2: Deduct updated line items in FIFO order
    const reconciledItems = await deductLineItemsFIFOInTx(
      rawTargetItems,
      invoice.id,
      invoice.invoiceNumber,
      invoice.invoiceDate,
      'edit_reconcile',
      database
    );

    const discountType = input.discountType ?? invoice.discountType;
    const discountValue = input.discountValue ?? invoice.discountValue;

    const totals = calculateInvoiceTotals({
      items: reconciledItems,
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
      items: reconciledItems,
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
      collectionDate:
        input.collectionDate !== undefined
          ? input.collectionDate || undefined
          : invoice.collectionDate,
      notes: input.notes !== undefined ? input.notes.trim() : invoice.notes,
      cancelReason: undefined,
      cancelledAt: undefined,
      stockRestoredOnCancel: false,
      updatedAt: now
    };

    await database.invoices.put(updated);
    if (canUseItemPhotosStore(database)) {
      const keptPhotoIds = new Set(
        reconciledItems.map((it) => it.photoId).filter((id): id is string => Boolean(id))
      );
      for (const prevItem of invoice.items) {
        if (prevItem.photoId && !keptPhotoIds.has(prevItem.photoId)) {
          await database.itemPhotos.delete(prevItem.photoId);
        }
      }
      for (const item of reconciledItems) {
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
// 7. DASHBOARD & REPORTS
// ============================================================================

export async function getDashboardMetrics(
  todayDate = getTodayIsoDate(),
  database: ALIFBillingDatabase = defaultDb
): Promise<DashboardMetrics> {
  await database.ensureSeeded();
  const [allInvoices, allPayments, allVariants] = await Promise.all([
    database.invoices.toArray(),
    database.payments.toArray(),
    canUseInventoryStores(database) ? database.inventoryVariants.toArray() : Promise.resolve([])
  ]);

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

  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const v of allVariants) {
    if (!v.isActive) continue;
    const st = getVariantStockStatus(v);
    if (st === 'Low Stock') lowStockCount++;
    else if (st === 'Out of Stock') outOfStockCount++;
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
    recentInvoices,
    lowStockCount,
    outOfStockCount
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
      catMap[cat].quantity = roundStockQty(catMap[cat].quantity + item.quantity);
      catMap[cat].revenuePaise += item.lineTotalPaise;
      if (item.costPricePaise) {
        catMap[cat].estimatedCostPaise += Math.round(item.costPricePaise * item.quantity);
      }

      const key = `${item.category}:${item.name}`;
      const existingItem = itemMap.get(key);
      if (existingItem) {
        existingItem.quantity = roundStockQty(existingItem.quantity + item.quantity);
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
// 8. BACKUP & RESTORE (VALIDATED, ATOMIC & INVENTORY-AWARE)
// ============================================================================

export async function exportBackupPayload(
  database: ALIFBillingDatabase = defaultDb
): Promise<BackupPayload> {
  await database.ensureSeeded();
  const [
    settings,
    customers,
    catalogue,
    invoices,
    payments,
    inventoryVariants,
    inventoryBundles,
    inventoryMovements,
    rawPhotos
  ] = await Promise.all([
    database.settings.toArray(),
    database.customers.toArray(),
    database.catalogue.toArray(),
    database.invoices.toArray(),
    database.payments.toArray(),
    canUseInventoryStores(database) ? database.inventoryVariants.toArray() : Promise.resolve([]),
    canUseInventoryStores(database) ? database.inventoryBundles.toArray() : Promise.resolve([]),
    canUseInventoryStores(database) ? database.inventoryMovements.toArray() : Promise.resolve([]),
    canUseItemPhotosStore(database) ? database.itemPhotos.toArray() : Promise.resolve([])
  ]);

  const serializedPhotos = rawPhotos.map((p) => ({
    id: p.id,
    invoiceId: p.invoiceId,
    lineItemId: p.lineItemId,
    dataUrl: p.dataUrl,
    mimeType: p.mimeType,
    width: p.width,
    height: p.height,
    sizeBytes: p.sizeBytes,
    createdAt: p.createdAt
  }));

  return {
    schemaVersion: 4,
    app: 'ALIF_BILLING_PWA',
    exportedAt: new Date().toISOString(),
    settings,
    customers,
    catalogue,
    invoices,
    payments,
    inventoryVariants,
    inventoryBundles,
    inventoryMovements,
    itemPhotos: serializedPhotos
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

  // Validate optional V4 inventory arrays if present
  if (obj.inventoryVariants !== undefined) {
    if (!Array.isArray(obj.inventoryVariants)) {
      errors.push('inventoryVariants must be an array when provided');
    } else {
      for (let i = 0; i < obj.inventoryVariants.length; i++) {
        const v = obj.inventoryVariants[i] as InventoryVariant;
        if (!v || typeof v.id !== 'string' || !v.name || typeof v.totalQuantity !== 'number') {
          errors.push(`Inventory variant at index ${i} is malformed`);
        }
      }
    }
  }

  if (obj.inventoryBundles !== undefined && !Array.isArray(obj.inventoryBundles)) {
    errors.push('inventoryBundles must be an array when provided');
  }
  if (obj.inventoryMovements !== undefined && !Array.isArray(obj.inventoryMovements)) {
    errors.push('inventoryMovements must be an array when provided');
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
): Promise<{
  customers: number;
  catalogue: number;
  invoices: number;
  payments: number;
  inventoryVariants: number;
}> {
  const validation = validateBackupPayload(raw);
  if (!validation.valid || !validation.payload) {
    throw new Error(`Backup validation failed: ${validation.errors.join('; ')}`);
  }

  const payload = validation.payload;
  const restoreTables: any[] = [
    database.settings,
    database.customers,
    database.catalogue,
    database.invoices,
    database.payments
  ];
  if (canUseInventoryStores(database)) {
    restoreTables.push(
      database.inventoryVariants,
      database.inventoryBundles,
      database.inventoryMovements
    );
  }
  if (canUseItemPhotosStore(database)) {
    restoreTables.push(database.itemPhotos);
  }

  return await database.transaction('rw', ...(restoreTables as [any, ...any[]]), async () => {
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

    let restoredVariantsCount = 0;
    if (canUseInventoryStores(database)) {
      await database.inventoryVariants.clear();
      await database.inventoryBundles.clear();
      await database.inventoryMovements.clear();

      if (payload.inventoryVariants && payload.inventoryVariants.length > 0) {
        await database.inventoryVariants.bulkPut(payload.inventoryVariants);
        restoredVariantsCount = payload.inventoryVariants.length;
      } else {
        await database.inventoryVariants.bulkPut(DEFAULT_INVENTORY_VARIANTS.map((v) => ({ ...v })));
        restoredVariantsCount = DEFAULT_INVENTORY_VARIANTS.length;
      }

      if (payload.inventoryBundles && payload.inventoryBundles.length > 0) {
        await database.inventoryBundles.bulkPut(payload.inventoryBundles);
      } else if (!payload.inventoryVariants || payload.inventoryVariants.length === 0) {
        await database.inventoryBundles.bulkPut(DEFAULT_INVENTORY_BUNDLES.map((b) => ({ ...b })));
      }

      if (payload.inventoryMovements && payload.inventoryMovements.length > 0) {
        await database.inventoryMovements.bulkPut(payload.inventoryMovements);
      }
    }

    if (canUseItemPhotosStore(database)) {
      await database.itemPhotos.clear();
      if (payload.itemPhotos && payload.itemPhotos.length > 0) {
        const hydratedPhotos: ItemPhotoRecord[] = payload.itemPhotos.map((p) => ({
          ...p,
          blob: p.dataUrl ? dataUrlToBlob(p.dataUrl) : undefined
        }));
        await database.itemPhotos.bulkPut(hydratedPhotos);
      }
    }

    return {
      customers: payload.customers.length,
      catalogue: payload.catalogue.length,
      invoices: payload.invoices.length,
      payments: payload.payments.length,
      inventoryVariants: restoredVariantsCount
    };
  });
}

// ============================================================================
// 9. ITEM PHOTO PROCESSING & INDEXEDDB BLOB STORAGE (WITH DEDUPLICATION)
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
  memoryPhotoFallback.set(record.id, record);
  if (canUseItemPhotosStore(database)) {
    try {
      await database.itemPhotos.put(record);
    } catch (_err) {
      // Fallback to memoryPhotoFallback if objectStore is unavailable
    }
  }
  return record;
}

export async function getItemPhoto(
  photoId: string,
  database: ALIFBillingDatabase = defaultDb
): Promise<ItemPhotoRecord | undefined> {
  await database.ensureSeeded();
  let rec: ItemPhotoRecord | undefined;
  if (canUseItemPhotosStore(database)) {
    try {
      rec = await database.itemPhotos.get(photoId);
    } catch (_err) {
      rec = undefined;
    }
  }
  if (!rec) {
    rec = memoryPhotoFallback.get(photoId);
  }
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
  memoryPhotoFallback.delete(photoId);
  if (canUseItemPhotosStore(database)) {
    try {
      await database.itemPhotos.delete(photoId);
    } catch (_err) {
      // Ignore if objectStore is missing
    }
  }
}
