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

export const GENERIC_NON_STOCK_CATALOGUE_IDS = new Set([
  'prd-fabric',
  'prd-lace',
  'prd-latkan',
  'prd-dori',
  'cst-custom-item',
  'itm-custom'
]);

export const SEED_VARIANT_TO_CATALOGUE_ID: Record<string, string> = {
  'var-fandy-silk-allover-green': 'prd-fandy-silk-green',
  'var-fandy-silk-allover-maroon': 'prd-fandy-silk-maroon',
  'var-fandy-silk-butti-gold': 'prd-fandy-silk-gold',
  'var-cotton-astar-plain-ivory': 'prd-cotton-astar-ivory',
  'var-cotton-astar-plain-black': 'prd-cotton-astar-black',
  'var-organza-scallop-rose': 'prd-organza-scallop-rose',
  'var-lace-gota-gold': 'prd-lace-gota-gold',
  'var-latkan-bridal-ruby': 'prd-latkan-bridal-ruby'
};

const ALL_STORE_NAMES = [
  'settings',
  'customers',
  'catalogue',
  'invoices',
  'payments',
  'itemPhotos',
  'inventoryVariants',
  'inventoryBundles',
  'inventoryMovements'
] as const;

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
      invoices:
        'id, &invoiceNumber, customerId, customerName, customerPhone, invoiceDate, status, createdAt',
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
        'id, &invoiceNumber, customerId, customerId, customerName, customerPhone, invoiceDate, status, idempotencyKey, createdAt',
      payments: 'id, invoiceId, invoiceNumber, customerId, date, method, type, createdAt',
      itemPhotos: 'id, invoiceId, lineItemId, createdAt',
      inventoryVariants:
        'id, sku, name, category, productType, workDesign, color, isActive, updatedAt',
      inventoryBundles: 'id, variantId, bundleCode, receivedDate, remainingQuantity, createdAt',
      inventoryMovements: 'id, variantId, bundleId, type, invoiceId, date, createdAt'
    });

    // Schema v5: Non-destructive upgrade preserving all existing records and normalizing legacy fields
    this.version(5)
      .stores({
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
      })
      .upgrade(async (tx) => {
        try {
          const catTable = tx.table('catalogue');
          const cats = await catTable.toArray();
          for (const c of cats) {
            if (c && c.isActive === undefined) {
              await catTable.put({ ...c, isActive: true });
            }
          }
          const varTable = tx.table('inventoryVariants');
          const vars = await varTable.toArray();
          for (const v of vars) {
            if (v && v.isActive === undefined) {
              await varTable.put({ ...v, isActive: true });
            }
          }
        } catch (_e) {
          // Never fail schema upgrade on optional field normalization
        }
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
      if (
        backend &&
        backend.objectStoreNames &&
        typeof backend.objectStoreNames.contains === 'function'
      ) {
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
    // Re-open if a stale connection from v1/v2/v3 is missing v4/v5 stores
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

  /**
   * Non-destructively rescues any records that were stored in localStorage (`__alif_idb_*`)
   * or in a legacy IndexedDB database name (`alif_ladies_tailor_db`) so app updates never lose user data.
   */
  private async migrateLegacyStorageIfPresent(): Promise<void> {
    if (typeof window === 'undefined' || this.name !== 'ALIFBillingDB') return;

    // 1. Rescue from localStorage keys (`__alif_idb_ALIFBillingDB_<store>` or `__alif_idb_alif_ladies_tailor_db_<store>`)
    try {
      if (window.localStorage) {
        const prefixes = ['__alif_idb_ALIFBillingDB_', '__alif_idb_alif_ladies_tailor_db_'];
        for (const prefix of prefixes) {
          for (const storeName of ALL_STORE_NAMES) {
            if (!this.hasObjectStore(storeName)) continue;
            const raw = window.localStorage.getItem(prefix + storeName);
            if (!raw) continue;
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch (_e) {
              continue;
            }
            if (!Array.isArray(parsed) || parsed.length === 0) continue;

            const table = (this as any)[storeName] as Table<any, string>;
            const existingRecords = await table.toArray();
            const existingMap = new Map<string, any>();
            for (const rec of existingRecords) {
              if (rec && rec.id) existingMap.set(rec.id, rec);
            }

            const toMerge: any[] = [];
            for (const entry of parsed) {
              const candidate = Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
              if (!candidate || typeof candidate !== 'object' || !candidate.id) continue;
              const current = existingMap.get(candidate.id);
              if (!current) {
                toMerge.push(candidate);
              } else {
                const candTime = String(candidate.updatedAt || candidate.createdAt || '');
                const currTime = String(current.updatedAt || current.createdAt || '');
                if (candTime && currTime && candTime > currTime) {
                  toMerge.push(candidate);
                }
              }
            }

            if (toMerge.length > 0) {
              await table.bulkPut(toMerge);
            }
          }
        }
      }
    } catch (_err) {
      // Never block startup if localStorage is restricted
    }
  }

  private async performSeed(): Promise<void> {
    await this.migrateLegacyStorageIfPresent();

    // 1. Shop Settings: NEVER overwrite existing user settings
    const existingSettings = await this.settings.get('default');
    if (!existingSettings) {
      await this.settings.put({ ...DEFAULT_SHOP_SETTINGS });
    }

    // 2. Catalogue Seeding & Non-Destructive Normalization
    const existingCat = await this.catalogue.toArray();
    if (existingCat.length === 0) {
      await this.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((item) => ({ ...item })));
    } else {
      const existingIds = new Set(existingCat.map((c) => c.id));
      const toPut: CatalogueItem[] = [];

      // Add any newly introduced default seed items without touching existing items
      for (const seedItem of DEFAULT_CATALOGUE_ITEMS) {
        if (!existingIds.has(seedItem.id)) {
          toPut.push({ ...seedItem });
        }
      }

      // Unlink generic non-stock items ('prd-fabric', 'prd-lace', 'prd-latkan', 'prd-dori') if an older seed linked them,
      // and ensure legacy items with undefined isActive default to true
      for (const item of existingCat) {
        const needsUnlink =
          GENERIC_NON_STOCK_CATALOGUE_IDS.has(item.id) && Boolean(item.inventoryVariantId);
        const needsActiveNormalize = item.isActive === undefined;
        if (needsUnlink || needsActiveNormalize) {
          toPut.push({
            ...item,
            inventoryVariantId: needsUnlink ? null : item.inventoryVariantId,
            isActive: item.isActive !== false
          });
        }
      }

      if (toPut.length > 0) {
        await this.catalogue.bulkPut(toPut);
      }
    }

    // 3. Inventory Variants, Bundles & Movements Seeding & Non-Destructive Sync
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
        const bundleCount = await this.inventoryBundles.count();
        if (bundleCount === 0) {
          await this.inventoryBundles.bulkPut(
            DEFAULT_INVENTORY_BUNDLES.map((b) => ({ ...b }))
          );
        }
        const movCount = await this.inventoryMovements.count();
        if (movCount === 0) {
          await this.inventoryMovements.bulkPut(
            DEFAULT_INVENTORY_MOVEMENTS.map((m) => ({ ...m }))
          );
        }
      }

      // Guarantee every InventoryVariant has a corresponding 1:1 linked CatalogueItem
      // WITHOUT overwriting user edits on either the InventoryVariant or the CatalogueItem!
      const [allVariants, allCatalogue] = await Promise.all([
        this.inventoryVariants.toArray(),
        this.catalogue.toArray()
      ]);

      const catById = new Map<string, CatalogueItem>();
      const linkedByVariantId = new Map<string, CatalogueItem>();
      for (const c of allCatalogue) {
        catById.set(c.id, c);
        if (c.inventoryVariantId && !GENERIC_NON_STOCK_CATALOGUE_IDS.has(c.id)) {
          linkedByVariantId.set(c.inventoryVariantId, c);
        }
      }

      const catToPut: CatalogueItem[] = [];
      const varToPut: InventoryVariant[] = [];

      for (const rawVar of allVariants) {
        let v = rawVar;
        if (v.isActive === undefined) {
          v = { ...v, isActive: true };
          varToPut.push(v);
        }

        const existingLinked = linkedByVariantId.get(v.id);
        if (existingLinked) {
          continue;
        }

        const deterministicId = SEED_VARIANT_TO_CATALOGUE_ID[v.id] || `cat-sync-${v.id}`;
        const existingByDeterministicId = catById.get(deterministicId);

        if (
          existingByDeterministicId &&
          !GENERIC_NON_STOCK_CATALOGUE_IDS.has(existingByDeterministicId.id)
        ) {
          // Preserve existing user-modified CatalogueItem fields; only link inventoryVariantId and missing hierarchy metadata
          const mergedCat: CatalogueItem = {
            ...existingByDeterministicId,
            inventoryVariantId: v.id,
            productType: existingByDeterministicId.productType || v.productType,
            workDesign: existingByDeterministicId.workDesign || v.workDesign,
            color: existingByDeterministicId.color || v.color,
            isActive: existingByDeterministicId.isActive !== false
          };
          catToPut.push(mergedCat);
          linkedByVariantId.set(v.id, mergedCat);
        } else {
          const createdCat: CatalogueItem = {
            id: deterministicId,
            name: v.name,
            category: 'product',
            defaultPricePaise: v.defaultSellingPricePaise,
            costPricePaise: v.purchaseCostPaise,
            unit: v.unit,
            description: `${v.category} → ${v.productType} → ${v.workDesign} → ${v.color}`,
            isActive: v.isActive !== false,
            inventoryVariantId: v.id,
            productType: v.productType,
            workDesign: v.workDesign,
            color: v.color,
            isPinned: Boolean(v.isPinned),
            photoId: v.photoId,
            photoDataUrl: v.photoDataUrl,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
          };
          catToPut.push(createdCat);
          linkedByVariantId.set(v.id, createdCat);
        }
      }

      if (varToPut.length > 0) {
        await this.inventoryVariants.bulkPut(varToPut);
      }
      if (catToPut.length > 0) {
        await this.catalogue.bulkPut(catToPut);
      }
    }
  }
}

export const db = new ALIFBillingDatabase();
