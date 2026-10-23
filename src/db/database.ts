import Dexie from 'dexie';
import {
  CatalogueItem,
  Customer,
  Invoice,
  PaymentRecord,
  ShopSettings
} from '../types/billing';
import { DEFAULT_CATALOGUE_ITEMS, DEFAULT_SHOP_SETTINGS } from './seed';

export class ALIFBillingDatabase extends Dexie {
  settings!: any;
  customers!: any;
  catalogue!: any;
  invoices!: any;
  payments!: any;

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
    }

    const catalogueCount: number = await this.catalogue.count();
    if (catalogueCount === 0) {
      await this.catalogue.bulkPut(DEFAULT_CATALOGUE_ITEMS.map((item) => ({ ...item })));
    }
  }
}

export const db = new ALIFBillingDatabase();
