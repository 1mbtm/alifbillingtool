import Dexie, { Table } from 'dexie';
import {
  CatalogueItem,
  Customer,
  Invoice,
  ItemPhotoRecord,
  PaymentRecord,
  ShopSettings
} from '../types/billing';
import { DEFAULT_CATALOGUE_ITEMS, DEFAULT_SHOP_SETTINGS } from './seed';

export class ALIFBillingDatabase extends Dexie {
  settings!: Table<ShopSettings, string>;
  customers!: Table<Customer, string>;
  catalogue!: Table<CatalogueItem, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<PaymentRecord, string>;
  itemPhotos!: Table<ItemPhotoRecord, string>;

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
    // Preserves all existing settings, customers, catalogue, invoices, and payments records.
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
  }

  /**
   * Ensures default shop settings and initial tailoring catalogue exist.
   * Never overwrites existing user modifications.
   */
  async ensureSeeded(): Promise<void> {
    await this.open();
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
        address: existingSettings.address === 'Station Road, Near Chowk Bazar' ? 'Daal Kuan College Road' : existingSettings.address,
        phone: existingSettings.phone === '+91 94311 00000' ? '7250470009' : existingSettings.phone,
        whatsappNumber: existingSettings.whatsappNumber === '919431100000' ? '917250470009' : existingSettings.whatsappNumber,
        receiptFooter: existingSettings.receiptFooter?.includes('ALiF Ladies Tailor')
          ? existingSettings.receiptFooter.replace('ALiF Ladies Tailor', 'alif.')
          : existingSettings.receiptFooter
      });
    }

    const catalogueCount: number = await this.catalogue.count();
    if (catalogueCount === 0) {
      await this.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((item) => ({ ...item })));
    }
  }
}

export const db = new ALIFBillingDatabase();
export type { CatalogueItem, Customer, Invoice, ItemPhotoRecord, PaymentRecord, ShopSettings };
