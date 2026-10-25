import Dexie, { Table } from 'dexie';
import {
  CatalogueItem,
  Customer,
  InventoryBundle,
  InventoryMovement,
  InventoryVariant,
  Invoice,
  ItemPhotoRecord,
  PaymentRecord,
  ShopSettings
} from '../types/billing';
import {
  DEFAULT_CATALOGUE_ITEMS,
  DEFAULT_INVENTORY_BUNDLES,
  DEFAULT_INVENTORY_MOVEMENTS,
  DEFAULT_INVENTORY_VARIANTS,
  DEFAULT_SHOP_SETTINGS
} from './seed';

const GENERIC_NON_STOCK_CATALOGUE_IDS = new Set([
  'prd-fabric',
  'prd-lace',
  'prd-latkan',
  'prd-dori',
  'cst-custom-item', 'itm-custom'
]);

const SEED_VARIANT_TO_CATALOGUE_ID: Record<string, string> = {
  'var-fandy-silk-allover-green': 'prd-fandy-silk-green',
  'var-fandy-silk-allover-maroon': 'prd-fandy-silk-maroon',
  'var-fandy-silk-butti-gold': 'prd-fandy-silk-gold',
  'var-cotton-astar-plain-ivory': 'prd-cotton-astar-ivory',
  'var-cotton-astar-plain-black': 'prd-cotton-astar-black',
  'var-organza-scallop-rose': 'prd-organza-scallop-rose',
  'var-lace-gota-gold': 'prd-lace-gota-gold',
  'var-latkan-bridal-ruby': 'prd-latkan-bridal-ruby'
};

export class ALIFBillingDatabase extends Dexie {
  settings!: Table<ShopSettings, string>;
  customers!: Table<Customer, string>;
  catalogue!: Table<CatalogueItem, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<PaymentRecord, string>;
  itemPhotos!: Table<ItemPhotoRecord, string>;
  inventoryVariants!: Table<InventoryVariant, string>;
  inventoryBundles!: Table<InventoryBundle, string>;
  inventoryMovements!: Table<InventoryMovement, string>;

  private seededPromise: Promise<void> | null = null;
  private isRecoveringStore = false;

  constructor(dbName = 'ALIFBillingDB') {
    super(dbName);

    // Schema v1: Initial core stores
    this.version(1).stores({
      settings: 'id',
      customers: 'id, name, phone, updatedAt',
      catalogue: 'id, name, category, isActive',
      invoices: 'id, &invoiceNumber, customerId, customerName, customerPhone, invoiceDate, status, createdAt',
      payments: 'id, invoiceId, invoiceNumber, customerId, date, method, type, createdAt'
    });

    // Schema v2: Add idempotencyKey index on invoices to prevent duplicate submission
    this.version(2).stores({
      settings: 'id',
      customers: 'id, name, phone, updatedAt',
      catalogue: 'id, name, category, isActive',
      invoices:
        'id, &invoiceNumber, customerId, customerName, customerPhone, invoiceDate, status, idempotencyKey, createdAt',
      payments: 'id, invoiceId, invoiceNumber, customerId, date, method, type, createdAt'
    });

    // Schema v3: Add itemPhotos store for compressed line-item images (offline Blob + DataURL)
    this.version(3).stores({
      settings: 'id',
      customers: 'id, name, phone, updatedAt',
      catalogue: 'id, name, category, isActive',
      invoices:
        'id, &invoiceNumber, customerId, customerName, customerPhone, invoiceDate, status, idempotencyKey, createdAt',
      payments: 'id, invoiceId, invoiceNumber, customerId, date, method, type, createdAt',
      itemPhotos: 'id, invoiceId, lineItemId, createdAt'
    });

    // Schema v4: Add physical inventory variants, individual FIFO bundles/rolls, and stock movement history
    this.version(4).stores({
      settings: 'id',
      customers: 'id, name, phone, updatedAt',
      catalogue: 'id, name, category, isActive, inventoryVariantId',
      invoices:
        'id, &invoiceNumber, customerId, customerName, customerPhone, invoiceDate, status, idempotencyKey, createdAt',
      payments: 'id, invoiceId, invoiceNumber, customerId, date, method, type, createdAt',
      itemPhotos: 'id, invoiceId, lineItemId, createdAt',
      inventoryVariants:
        'id, sku, name, category, productType, workDesign, color, isActive, updatedAt',
      inventoryBundles: 'id, variantId, bundleCode, receivedDate, remainingQuantity, createdAt',
      inventoryMovements: 'id, variantId, bundleId, type, invoiceId, date, createdAt'
    });

    // If another tab or SW upgrades the DB version, close cleanly to avoid stale-connection NotFoundError
    this.on('versionchange', () => {
      this.close();
    });
  }

  /**
   * Checks whether a given objectStore physically exists in the underlying IndexedDB connection.
   * Prevents `NotFoundError: Failed to execute 'objectStore' on 'IDBTransaction'` on stale connections.
   */
  hasObjectStore(storeName: string): boolean {
    try {
      const backend = (this as any).backendDB?.() as IDBDatabase | undefined;
      if (backend && backend.objectStoreNames && typeof backend.objectStoreNames.contains === 'function') {
        return backend.objectStoreNames.contains(storeName);
      }
      const table = (this as any)[storeName];
      return Boolean(table);
    } catch (_err) {
      return false;
    }
  }

  async ensureSeeded(): Promise<void> {
    if (!this.isOpen()) {
      await this.open();
    }
    // Re-open if a stale connection from v1/v2/v3 is missing v4 stores
    if (
      (!this.hasObjectStore('itemPhotos') || !this.hasObjectStore('inventoryVariants')) &&
      !this.isRecoveringStore
    ) {
      this.isRecoveringStore = true;
      try {
        this.close();
        await this.open();
      } catch (_err) {
        // Continue with safe store guards in service layer if browser blocks reopen
      } finally {
        this.isRecoveringStore = false;
      }
    }
    if (!this.seededPromise) {
      this.seededPromise = this.performSeed().catch((err) => {
        this.seededPromise = null;
        throw err;
      });
    }
    return this.seededPromise;
  }

  private async performSeed(): Promise<void> {
    const existingSettings = await this.settings.get('default');
    if (!existingSettings) {
      await this.settings.put({ ...DEFAULT_SHOP_SETTINGS });
    } else if (existingSettings.shopName === 'ALiF Ladies Tailor') {
      await this.settings.put({
        ...existingSettings,
        shopName: 'alif.',
        receiptFooter: existingSettings.receiptFooter.replace('ALiF Ladies Tailor', 'alif.')
      });
    }

    const catCount = await this.catalogue.count();
    if (catCount === 0) {
      await this.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((item) => ({ ...item })));
    } else {
      // Ensure all default seeded catalogue items exist and generic items never silently point to a specific variant
      const existingCat = await this.catalogue.toArray();
      const existingIds = new Set(existingCat.map((c) => c.id));
      const toPut: CatalogueItem[] = [];

      for (const seedItem of DEFAULT_CATALOGUE_ITEMS) {
        if (!existingIds.has(seedItem.id)) {
          toPut.push({ ...seedItem });
        }
      }

      // Unlink generic non-stock items ('prd-fabric', 'prd-lace', 'prd-latkan', 'prd-dori') if an older seed linked them
      for (const item of existingCat) {
        if (GENERIC_NON_STOCK_CATALOGUE_IDS.has(item.id) && item.inventoryVariantId) {
          toPut.push({
            ...item,
            inventoryVariantId: null
          });
        }
      }

      if (toPut.length > 0) {
        await this.catalogue.bulkPut(toPut);
      }
    }

    if (
      this.hasObjectStore('inventoryVariants') &&
      this.hasObjectStore('inventoryBundles') &&
      this.hasObjectStore('inventoryMovements')
    ) {
      const varCount = await this.inventoryVariants.count();
      if (varCount === 0) {
        await this.inventoryVariants.bulkPut(
          DEFAULT_INVENTORY_VARIANTS.map((v) => ({ ...v }))
        );
        await this.inventoryBundles.bulkPut(
          DEFAULT_INVENTORY_BUNDLES.map((b) => ({ ...b }))
        );
        await this.inventoryMovements.bulkPut(
          DEFAULT_INVENTORY_MOVEMENTS.map((m) => ({ ...m }))
        );
      }

      // Guarantee every InventoryVariant has a corresponding 1:1 linked CatalogueItem
      const [allVariants, allCatalogue] = await Promise.all([
        this.inventoryVariants.toArray(),
        this.catalogue.toArray()
      ]);

      const linkedByVariantId = new Map<string, CatalogueItem>();
      for (const c of allCatalogue) {
        if (c.inventoryVariantId && !GENERIC_NON_STOCK_CATALOGUE_IDS.has(c.id)) {
          linkedByVariantId.set(c.inventoryVariantId, c);
        }
      }

      const missingCatItems: CatalogueItem[] = [];
      for (const v of allVariants) {
        if (!linkedByVariantId.has(v.id)) {
          const deterministicId =
            SEED_VARIANT_TO_CATALOGUE_ID[v.id] || `cat-sync-${v.id}`;
          missingCatItems.push({
            id: deterministicId,
            name: v.name,
            category: 'product',
            defaultPricePaise: v.defaultSellingPricePaise,
            costPricePaise: v.purchaseCostPaise,
            unit: v.unit,
            description: `${v.category} → ${v.productType} → ${v.workDesign} → ${v.color}`,
            isActive: v.isActive,
            inventoryVariantId: v.id,
            productType: v.productType,
            workDesign: v.workDesign,
            color: v.color,
            isPinned: Boolean(v.isPinned),
            photoId: v.photoId,
            photoDataUrl: v.photoDataUrl,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
          });
        }
      }

      if (missingCatItems.length > 0) {
        await this.catalogue.bulkPut(missingCatItems);
      }
    }
  }
}

export const db = new ALIFBillingDatabase();
