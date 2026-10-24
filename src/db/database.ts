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
  DEFAULT_INVENTORY_VARIANTS,
  DEFAULT_SHOP_SETTINGS
} from './seed';

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

  private seedPromise: Promise<void> | null = null;

  constructor(dbName = 'alif_ladies_tailor_db') {
    super(dbName);

    // Version 1 initial schema
    this.version(1).stores({
      settings: 'id',
      customers: 'id, name, phone, updatedAt',
      catalogue: 'id, name, category, isActive',
      invoices: 'id, &invoiceNumber, customerId, invoiceDate, status, createdAt',
      payments: 'id, invoiceId, customerId, date, type, method, createdAt'
    });

    // Version 2 safe migration adding idempotencyKey index support
    this.version(2)
      .stores({
        settings: 'id',
        customers: 'id, name, phone, updatedAt',
        catalogue: 'id, name, category, isActive',
        invoices: 'id, &invoiceNumber, customerId, invoiceDate, status, idempotencyKey, createdAt',
        payments: 'id, invoiceId, customerId, date, type, method, createdAt'
      })
      .upgrade(async (tx: any) => {
        const invoices = await tx.table('invoices').toArray();
        for (const inv of invoices) {
          if (inv.taxEnabled === undefined) {
            inv.taxEnabled = false;
            inv.taxRatePercent = 0;
            inv.taxPaise = 0;
            await tx.table('invoices').put(inv);
          }
        }
      });

    // Version 3 safe migration adding itemPhotos table for optional line-item photo blobs
    this.version(3)
      .stores({
        settings: 'id',
        customers: 'id, name, phone, updatedAt',
        catalogue: 'id, name, category, isActive',
        invoices: 'id, &invoiceNumber, customerId, invoiceDate, status, idempotencyKey, createdAt',
        payments: 'id, invoiceId, customerId, date, type, method, createdAt',
        itemPhotos: 'id, invoiceId, lineItemId, createdAt'
      })
      .upgrade(async () => {
        // Existing tables and records are preserved untouched during V3 upgrade
      });

    // Version 4 safe migration adding inventoryVariants, inventoryBundles, and inventoryMovements
    // Strictly preserves all existing settings, customers, catalogue, invoices, payments, and itemPhotos.
    this.version(4)
      .stores({
        settings: 'id',
        customers: 'id, name, phone, updatedAt',
        catalogue: 'id, name, category, isActive, inventoryVariantId',
        invoices: 'id, &invoiceNumber, customerId, invoiceDate, status, idempotencyKey, createdAt',
        payments: 'id, invoiceId, customerId, date, type, method, createdAt',
        itemPhotos: 'id, invoiceId, lineItemId, createdAt',
        inventoryVariants: 'id, sku, name, category, productType, workDesign, color, isActive, updatedAt',
        inventoryBundles: 'id, variantId, bundleCode, receivedDate, createdAt',
        inventoryMovements: 'id, variantId, bundleId, invoiceId, type, date, createdAt'
      })
      .upgrade(async () => {
        // Non-destructive V4 schema expansion
      });

    // Release older connection locks cleanly if another tab triggers a schema version upgrade
    this.on('versionchange', () => {
      try {
        this.close();
      } catch (_err) {
        // Ignore close errors during versionchange
      }
    });
  }

  /**
   * Checks whether the underlying IDBDatabase actually contains the specified objectStore.
   * Prevents NotFoundError on IDBTransaction when operating on legacy connections.
   */
  hasObjectStore(storeName: string): boolean {
    try {
      const table = (this as any)[storeName];
      if (!table) return false;
      const backend = (this as any).backendDB?.();
      if (backend && backend.objectStoreNames && typeof backend.objectStoreNames.contains === 'function') {
        return backend.objectStoreNames.contains(storeName);
      }
      return true;
    } catch (_err) {
      return false;
    }
  }

  /**
   * Ensures default shop settings, initial tailoring catalogue, and physical inventory variants exist.
   * Serializes concurrent calls and never overwrites existing user modifications.
   */
  async ensureSeeded(): Promise<void> {
    if (this.seedPromise) {
      return await this.seedPromise;
    }
    this.seedPromise = this.performSeed();
    try {
      await this.seedPromise;
    } finally {
      this.seedPromise = null;
    }
  }

  private async performSeed(): Promise<void> {
    if (!this.isOpen()) {
      await this.open();
    }
    const existingSettings: ShopSettings | undefined = await this.settings.get('default');
    if (!existingSettings) {
      await this.settings.put({ ...DEFAULT_SHOP_SETTINGS });
    } else if (
      existingSettings.shopName === 'ALiF Ladies Tailor' ||
      existingSettings.phone === '+91 94311 00000' ||
      existingSettings.address === 'Station Road, Near Chowk Bazar'
    ) {
      // Auto-migrate legacy placeholder values to official brand details
      await this.settings.put({
        ...existingSettings,
        shopName: existingSettings.shopName === 'ALiF Ladies Tailor' ? 'alif.' : existingSettings.shopName,
        address:
          existingSettings.address === 'Station Road, Near Chowk Bazar'
            ? 'Daal Kuan College Road'
            : existingSettings.address,
        phone: existingSettings.phone === '+91 94311 00000' ? '7250470009' : existingSettings.phone,
        whatsappNumber:
          existingSettings.whatsappNumber === '919431100000'
            ? '917250470009'
            : existingSettings.whatsappNumber,
        receiptFooter: existingSettings.receiptFooter?.includes('ALiF Ladies Tailor')
          ? existingSettings.receiptFooter.replace('ALiF Ladies Tailor', 'alif.')
          : existingSettings.receiptFooter
      });
    }

    const catalogueCount: number = await this.catalogue.count();
    if (catalogueCount === 0) {
      await this.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((item) => ({ ...item })));
    } else {
      // Ensure new default stock-linked material items (like Green Fandy Silk) are present without overwriting user items
      for (const seedItem of DEFAULT_CATALOGUE_ITEMS) {
        const existing = await this.catalogue.get(seedItem.id);
        if (!existing) {
          await this.catalogue.put({ ...seedItem });
        } else if (seedItem.inventoryVariantId && existing.inventoryVariantId === undefined) {
          await this.catalogue.put({
            ...existing,
            inventoryVariantId: seedItem.inventoryVariantId,
            productType: existing.productType ?? seedItem.productType,
            workDesign: existing.workDesign ?? seedItem.workDesign,
            color: existing.color ?? seedItem.color,
            isPinned: existing.isPinned ?? seedItem.isPinned
          });
        }
      }
    }

    if (this.hasObjectStore('inventoryVariants') && this.hasObjectStore('inventoryBundles')) {
      try {
        const variantCount = await this.inventoryVariants.count();
        if (variantCount === 0) {
          await this.inventoryVariants.bulkPut(DEFAULT_INVENTORY_VARIANTS.map((v) => ({ ...v })));
          await this.inventoryBundles.bulkPut(DEFAULT_INVENTORY_BUNDLES.map((b) => ({ ...b })));
        }
      } catch (_err) {
        // Safeguard if legacy DB connection does not yet expose V4 stores
      }
    }
  }
}

export const db = new ALIFBillingDatabase();
export type {
  CatalogueItem,
  Customer,
  InventoryBundle,
  InventoryMovement,
  InventoryVariant,
  Invoice,
  ItemPhotoRecord,
  PaymentRecord,
  ShopSettings
};
