import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { ALIFBillingDatabase } from '../db/database';
import {
  calculateInvoiceTotals,
  calculateLineTotalPaise,
  computePaymentLedger,
  formatINR,
  formatInvoiceNumber,
  paiseToRupeesString,
  rupeesToPaise
} from '../utils/currency';
import {
  cancelInvoice,
  createInvoice,
  exportBackupPayload,
  getCustomerHistory,
  getDashboardMetrics,
  getPeriodReport,
  getShopSettings,
  listCatalogue,
  listCustomers,
  listInvoices,
  recordInvoicePayment,
  reopenAndUpdateInvoice,
  restoreBackupPayload,
  saveCatalogueItem,
  saveCustomer,
  updateShopSettings,
  validateBackupPayload
} from '../services/billingService';
import {
  buildSmsShareUrl,
  buildWhatsAppShareUrl,
  generateInvoicePdfBytes
} from '../utils/pdf';
import { generateInvoicesCsv, generatePeriodReportCsv } from '../utils/csv';

describe('1. Integer-based Currency & Invoice Arithmetic', () => {
  it('converts rupees to exact integer paise without floating-point drift', () => {
    expect(rupeesToPaise('450')).toBe(45000);
    expect(rupeesToPaise('19.99')).toBe(1999);
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise('1,250.50')).toBe(125050);
    expect(paiseToRupeesString(45000)).toBe('450');
    expect(paiseToRupeesString(125050)).toBe('1250.50');
    expect(formatINR(12500000)).toBe('₹1,25,000');
    expect(formatINR(45050)).toBe('₹450.50');
  });

  it('calculates fractional fabric/lace quantities and discounts using integer math', () => {
    // 2.5 mtr of fabric at ₹120/mtr = ₹300 (30000 paise)
    expect(calculateLineTotalPaise(2.5, 12000)).toBe(30000);

    const totalsFlat = calculateInvoiceTotals({
      items: [
        { quantity: 1, unitPricePaise: 45000 }, // Astar blouse ₹450
        { quantity: 2.5, unitPricePaise: 6000 } // Lace ₹150
      ],
      discountType: 'flat',
      discountValue: 5000, // ₹50 discount
      taxEnabled: false
    });
    expect(totalsFlat.subtotalPaise).toBe(60000);
    expect(totalsFlat.discountPaise).toBe(5000);
    expect(totalsFlat.taxPaise).toBe(0);
    expect(totalsFlat.totalPaise).toBe(55000);

    const totalsPercent = calculateInvoiceTotals({
      items: [{ quantity: 2, unitPricePaise: 100000 }], // ₹2,000
      discountType: 'percent',
      discountValue: 10, // 10% = ₹200
      taxEnabled: false
    });
    expect(totalsPercent.subtotalPaise).toBe(200000);
    expect(totalsPercent.discountPaise).toBe(20000);
    expect(totalsPercent.totalPaise).toBe(180000);
  });

  it('never double-counts advance alongside subsequent payments in ledger computation', () => {
    const ledger = computePaymentLedger(100000, false, [
      { amountPaise: 30000, type: 'advance' },
      { amountPaise: 40000, type: 'payment' }
    ]);
    expect(ledger.advancePaise).toBe(30000);
    expect(ledger.subsequentPaidPaise).toBe(40000);
    expect(ledger.netPaidPaise).toBe(70000);
    expect(ledger.balancePaise).toBe(30000);
    expect(ledger.status).toBe('Partially Paid');
  });
});

describe('2. Catalogue Seeding, Persistence & Configurable Defaults', () => {
  const testDbName = 'test_alif_db_catalogue';

  beforeEach(async () => {
    await Dexie.delete(testDbName);
  });

  it('seeds all required ALiF tailoring services and products and persists edits across restarts', async () => {
    const db1 = new ALIFBillingDatabase(testDbName);
    await db1.ensureSeeded();

    const items = await listCatalogue({}, db1);
    const names = items.map((i) => i.name.toLowerCase());

    const requiredItems = [
      'astar blouse',
      'plain blouse',
      'fall & pico',
      'suit',
      'kurti',
      'alter',
      'patiala',
      'palazzo',
      'gharara',
      'sharara',
      'frock',
      'lehenga',
      'fabric',
      'lace',
      'latkan',
      'dori',
      'custom item'
    ];
    for (const reqName of requiredItems) {
      expect(names).toContain(reqName);
    }

    // Update Astar Blouse default price to ₹500 and close DB
    const astar = items.find((i) => i.id === 'srv-astar-blouse')!;
    await saveCatalogueItem(
      {
        ...astar,
        defaultPricePaise: 50000,
        costPricePaise: 15000
      },
      db1
    );
    db1.close();

    // Reopen fresh instance of the same database to verify persistence
    const db2 = new ALIFBillingDatabase(testDbName);
    const reloadedItems = await listCatalogue({}, db2);
    const reloadedAstar = reloadedItems.find((i) => i.id === 'srv-astar-blouse')!;
    expect(reloadedAstar.defaultPricePaise).toBe(50000);
    expect(reloadedAstar.costPricePaise).toBe(15000);
    db2.close();
  });
});

describe('3. Invoice Lifecycle, Payment History, Cancellation & Reports', () => {
  const testDbName = 'test_alif_db_lifecycle';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('creates invoices with sequential numbers, prevents duplicates, and tracks payments/refunds/corrections', async () => {
    const settings = await getShopSettings(db);
    expect(settings.taxEnabled).toBe(false);
    expect(settings.city).toBe('Sahibganj');

    // Create Invoice 1 with per-invoice price override and ₹300 advance
    const created1 = await createInvoice(
      {
        customerName: 'Nusrat Jahan',
        customerPhone: '9876543210',
        invoiceDate: '2026-10-18',
        collectionDate: '2026-10-25',
        items: [
          {
            catalogueItemId: 'srv-lehenga',
            name: 'Lehenga',
            category: 'service',
            quantity: 1,
            unit: 'set',
            unitPricePaise: 250000 // Overridden from ₹2,200 default to ₹2,500
          },
          {
            catalogueItemId: 'prd-latkan',
            name: 'Latkan',
            category: 'product',
            quantity: 2,
            unit: 'pair',
            unitPricePaise: 15000,
            costPricePaise: 9000
          }
        ],
        discountType: 'flat',
        discountValue: 10000, // ₹100 discount
        advancePaise: 50000, // ₹500 advance
        advanceMethod: 'upi',
        idempotencyKey: 'idem-unique-1'
      },
      db
    );

    expect(created1.invoice.invoiceNumber).toBe('ALIF-2026-0001');
    expect(created1.invoice.subtotalPaise).toBe(280000); // ₹2,800
    expect(created1.invoice.discountPaise).toBe(10000); // ₹100
    expect(created1.invoice.totalPaise).toBe(270000); // ₹2,700
    expect(created1.invoice.advancePaise).toBe(50000); // ₹500
    expect(created1.invoice.paidPaise).toBe(50000); // ₹500 (never double counted!)
    expect(created1.invoice.balancePaise).toBe(220000); // ₹2,200
    expect(created1.invoice.status).toBe('Partially Paid');

    // Attempting duplicate submission with same idempotencyKey must throw
    await expect(
      createInvoice(
        {
          customerName: 'Nusrat Jahan',
          customerPhone: '9876543210',
          items: [
            {
              name: 'Lehenga',
              category: 'service',
              quantity: 1,
              unit: 'set',
              unitPricePaise: 250000
            }
          ],
          idempotencyKey: 'idem-unique-1'
        },
        db
      )
    ).rejects.toThrow(/Duplicate submission prevented/);

    // Record subsequent payment of ₹2,200 by Cash -> status becomes Paid
    const afterPay = await recordInvoicePayment(
      {
        invoiceId: created1.invoice.id,
        amountPaise: 220000,
        method: 'cash',
        type: 'payment',
        date: '2026-10-18',
        note: 'Paid balance on collection'
      },
      db
    );
    expect(afterPay.invoice.paidPaise).toBe(270000);
    expect(afterPay.invoice.balancePaise).toBe(0);
    expect(afterPay.invoice.status).toBe('Paid');
    expect(afterPay.allPayments).toHaveLength(2);

    // Issue partial refund of ₹200 -> status becomes Partially Paid, history preserved (3 records)
    const afterRefund = await recordInvoicePayment(
      {
        invoiceId: created1.invoice.id,
        amountPaise: 20000,
        method: 'cash',
        type: 'refund',
        date: '2026-10-18',
        note: 'Refunded latkan adjustment'
      },
      db
    );
    expect(afterRefund.invoice.paidPaise).toBe(250000);
    expect(afterRefund.invoice.balancePaise).toBe(20000);
    expect(afterRefund.invoice.status).toBe('Partially Paid');
    expect(afterRefund.allPayments).toHaveLength(3);
  });

  it('excludes cancelled invoices from sales totals and supports reopening', async () => {
    const inv1 = await createInvoice(
      {
        customerName: 'Saira Bano',
        customerPhone: '9123456780',
        invoiceDate: '2026-10-18',
        items: [{ name: 'Suit', category: 'service', quantity: 1, unit: 'set', unitPricePaise: 65000 }],
        advancePaise: 20000,
        advanceMethod: 'cash'
      },
      db
    );

    const inv2 = await createInvoice(
      {
        customerName: 'Rukhsar Parween',
        customerPhone: '9123456789',
        invoiceDate: '2026-10-18',
        items: [{ name: 'Kurti', category: 'service', quantity: 1, unit: 'pc', unitPricePaise: 40000 }],
        advancePaise: 0
      },
      db
    );

    expect(inv2.invoice.invoiceNumber).toBe('ALIF-2026-0002');
    expect(inv2.invoice.status).toBe('Unpaid');

    // Cancel Invoice 2 with a reason
    const cancelled = await cancelInvoice(inv2.invoice.id, 'Customer changed fabric design', db);
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.balancePaise).toBe(0);
    expect(cancelled.cancelReason).toBe('Customer changed fabric design');

    // Verify Period Report excludes cancelled invoice from invoicedSalesPaise
    const report = await getPeriodReport('2026-10-01', '2026-10-31', db);
    expect(report.activeInvoiceCount).toBe(1);
    expect(report.cancelledInvoiceCount).toBe(1);
    expect(report.invoicedSalesPaise).toBe(65000); // Only inv1's ₹650
    expect(report.netCashCollectedPaise).toBe(20000); // ₹200 advance collected
    expect(report.outstandingBalancePaise).toBe(45000); // ₹450 remaining on inv1

    // Reopen Cancelled Invoice 2
    const reopened = await reopenAndUpdateInvoice({ invoiceId: inv2.invoice.id }, db);
    expect(reopened.status).toBe('Unpaid');
    expect(reopened.balancePaise).toBe(40000);
  });
});

describe('4. Backup Validation, Atomic Restore Protection & PDF/Sharing', () => {
  const testDbName = 'test_alif_db_backup';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('exports valid JSON backup, rejects invalid backups without losing data, and restores valid backups', async () => {
    await createInvoice(
      {
        customerName: 'Zeenat Parveen',
        customerPhone: '9988776655',
        invoiceDate: '2026-10-18',
        items: [{ name: 'Gharara', category: 'service', quantity: 1, unit: 'set', unitPricePaise: 140000 }],
        advancePaise: 40000,
        advanceMethod: 'upi'
      },
      db
    );

    const backup = await exportBackupPayload(db);
    expect(backup.app).toBe('ALIF_BILLING_PWA');
    expect(backup.invoices).toHaveLength(1);
    expect(backup.payments).toHaveLength(1);

    // Attempt to restore corrupted backup -> must reject and preserve existing data
    await expect(
      restoreBackupPayload({ app: 'WRONG_APP', schemaVersion: 2 }, db)
    ).rejects.toThrow(/Backup validation failed/);

    const stillExisting = await listInvoices({}, db);
    expect(stillExisting).toHaveLength(1);
    expect(stillExisting[0].customerName).toBe('Zeenat Parveen');

    // Restore valid backup into a fresh database
    const targetDbName = 'test_alif_db_restore_target';
    await Dexie.delete(targetDbName);
    const targetDb = new ALIFBillingDatabase(targetDbName);
    const counts = await restoreBackupPayload(backup, targetDb);
    expect(counts.invoices).toBe(1);
    expect(counts.payments).toBe(1);
  });

  it('generates a real readable PDF 1.4 binary and valid WhatsApp/SMS prefill links', async () => {
    const settings = await getShopSettings(db);
    const { invoice, payments } = await createInvoice(
      {
        customerName: 'Amina Khatoon',
        customerPhone: '9431155667',
        invoiceDate: '2026-10-18',
        collectionDate: '2026-10-22',
        items: [{ name: 'Astar Blouse', category: 'service', quantity: 2, unit: 'pc', unitPricePaise: 45000 }],
        advancePaise: 30000,
        advanceMethod: 'cash'
      },
      db
    );

    const pdfBytes = generateInvoicePdfBytes(invoice, payments, settings);
    expect(pdfBytes.byteLength).toBeGreaterThan(800);
    const pdfText = Buffer.from(pdfBytes).toString('latin1');
    expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfText).toContain('ALiF Ladies Tailor');
    expect(pdfText).toContain('ALIF-2026-0001');
    expect(pdfText).toContain('Amina Khatoon');
    expect(pdfText).toContain('Astar Blouse');
    expect(pdfText.trim().endsWith('%%EOF')).toBe(true);

    const waUrl = buildWhatsAppShareUrl(invoice, settings);
    expect(waUrl).toContain('https://wa.me/919431155667?text=');
    expect(decodeURIComponent(waUrl)).toContain('ALIF-2026-0001');

    const smsUrl = buildSmsShareUrl(invoice, settings);
    expect(smsUrl).toContain('sms:+919431155667?body=');

    const csv = generateInvoicesCsv([invoice]);
    expect(csv).toContain('ALIF-2026-0001');
    expect(csv).toContain('Amina Khatoon');
  });
});

import {
  deleteItemPhoto,
  getItemPhoto,
  getItemPhotosMap,
  saveItemPhotoFromFile,
  validateImageFile
} from '../services/billingService';

describe('5. Item Photos Persistence & Versioned Migration', () => {
  const testDbName = 'test_alif_db_photos';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('validates image files, stores compressed photo Blobs in IndexedDB, and preserves photo associations across invoice save and reopen', async () => {
    // Reject empty or non-image files gracefully
    expect(() => validateImageFile(null)).toThrow(/No image file selected/);
    expect(() => validateImageFile(new Blob([], { type: 'image/jpeg' }))).toThrow(/empty/);
    expect(() => validateImageFile(new Blob(['hello'], { type: 'text/plain' }))).toThrow(/Unsupported file format/);

    // Save a valid image Blob for a line item
    const samplePngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222
    ]);
    const imageBlob = new Blob([samplePngBytes], { type: 'image/png' });

    const photoRec = await saveItemPhotoFromFile(
      {
        file: imageBlob,
        lineItemId: 'line-blouse-1'
      },
      db
    );
    expect(photoRec.id).toMatch(/^photo-/);
    expect(photoRec.blob instanceof Blob).toBe(true);
    expect(photoRec.dataUrl.startsWith('data:image/')).toBe(true);

    // Create an invoice with the attached photoId on item #1 and no photo on item #2
    const created = await createInvoice(
      {
        customerName: 'Farah Khan',
        customerPhone: '9876501234',
        invoiceDate: '2026-10-23',
        items: [
          {
            id: 'line-blouse-1',
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 45000,
            photoId: photoRec.id
          },
          {
            id: 'line-pico-2',
            catalogueItemId: 'srv-fall-pico',
            name: 'Fall & Pico',
            category: 'service',
            quantity: 1,
            unit: 'saree',
            unitPricePaise: 12000
          }
        ]
      },
      db
    );

    expect(created.invoice.items[0].photoId).toBe(photoRec.id);
    expect(created.invoice.items[1].photoId).toBeUndefined();

    // Verify photo record in IndexedDB is linked to the created invoiceId
    const storedPhoto = await getItemPhoto(photoRec.id, db);
    expect(storedPhoto).toBeDefined();
    expect(storedPhoto!.invoiceId).toBe(created.invoice.id);
    expect(storedPhoto!.lineItemId).toBe('line-blouse-1');
    expect(storedPhoto!.blob instanceof Blob).toBe(true);

    // Reopen and reorder items (move Fall & Pico first, Astar Blouse second) -> photo stays with Astar Blouse
    const reopened = await reopenAndUpdateInvoice(
      {
        invoiceId: created.invoice.id,
        items: [
          {
            id: 'line-pico-2',
            catalogueItemId: 'srv-fall-pico',
            name: 'Fall & Pico',
            category: 'service',
            quantity: 1,
            unit: 'saree',
            unitPricePaise: 12000
          },
          {
            id: 'line-blouse-1',
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 48000,
            photoId: photoRec.id
          }
        ]
      },
      db
    );

    expect(reopened.items[0].name).toBe('Fall & Pico');
    expect(reopened.items[0].photoId).toBeUndefined();
    expect(reopened.items[1].name).toBe('Astar Blouse');
    expect(reopened.items[1].photoId).toBe(photoRec.id);

    const mapAfterReopen = await getItemPhotosMap([photoRec.id], db);
    expect(mapAfterReopen[photoRec.id]).toBeDefined();

    // Delete photo explicitly
    await deleteItemPhoto(photoRec.id, db);
    expect(await getItemPhoto(photoRec.id, db)).toBeUndefined();
  });
});

describe('6. Professional Bill Image Generation & WhatsApp Image+Text Sharing', () => {
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    const dbName = `alif-share-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    db = new ALIFBillingDatabase(dbName);
    await db.ensureSeeded();
  });

  it('generates professional bill image & editable share text for single/multiple items, discounts, and partial/full payments', async () => {
    const {
      buildShareBillText,
      generateInvoiceBillImage,
      sanitizeBillText,
      wrapTextLines
    } = await import('../utils/pdf');
    const settings = await getShopSettings(db);

    // 1. Single item with advance payment (Partially Paid) and flat discount
    const singleCreated = await createInvoice(
      {
        customerName: 'Zainab Begum',
        customerPhone: '9876543210',
        invoiceDate: '2026-10-23',
        collectionDate: '2026-10-28',
        items: [
          {
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 2,
            unit: 'pc',
            unitPricePaise: 50000 // ₹500 x 2 = ₹1,000
          }
        ],
        discountType: 'flat',
        discountValue: 10000, // ₹100 discount -> Total ₹900
        advancePaise: 40000, // ₹400 advance -> Balance ₹500
        advanceMethod: 'upi'
      },
      db
    );

    const imgSingle = await generateInvoiceBillImage(
      singleCreated.invoice,
      singleCreated.payments,
      settings
    );

    expect(imgSingle.filename).toBe(`${singleCreated.invoice.invoiceNumber}.png`);
    expect(imgSingle.mimeType).toBe('image/png');
    expect(imgSingle.blob instanceof Blob).toBe(true);
    expect(imgSingle.blob.size).toBeGreaterThan(20);
    expect(imgSingle.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(imgSingle.width).toBe(1600);
    expect(imgSingle.includedPhotoCount).toBe(0);

    const joinedSingle = imgSingle.renderedLines.join('\n');
    expect(joinedSingle).toContain('alif.');
    expect(joinedSingle).toContain(singleCreated.invoice.invoiceNumber);
    expect(joinedSingle).toContain('Zainab Begum');
    expect(joinedSingle).toContain('9876543210');
    expect(joinedSingle).toContain('Status: Partially Paid');
    expect(joinedSingle).toContain('1. Astar Blouse');
    expect(joinedSingle).toContain('Discount: -₹100');
    expect(joinedSingle).toContain('Final Total: ₹900');
    expect(joinedSingle).toContain('Payments Received: ₹400');
    expect(joinedSingle).toContain('Outstanding Balance: ₹500');

    const shareText = buildShareBillText(singleCreated.invoice, settings);
    expect(shareText).toContain('alif.');
    expect(shareText).toContain('Zainab Begum');
    expect(shareText).toContain(singleCreated.invoice.invoiceNumber);
    expect(shareText).toContain('₹900');
    expect(shareText).toContain('₹400');
    expect(shareText).toContain('₹500 (Partially Paid)');

    // Record remaining payment -> status becomes Paid
    const afterFullPay = await recordInvoicePayment(
      {
        invoiceId: singleCreated.invoice.id,
        amountPaise: 50000,
        method: 'cash',
        type: 'payment',
        date: '2026-10-24'
      },
      db
    );
    const imgPaid = await generateInvoiceBillImage(
      afterFullPay.invoice,
      afterFullPay.allPayments,
      settings
    );
    expect(imgPaid.renderedLines.join('\n')).toContain('Status: Paid');
    expect(imgPaid.renderedLines.join('\n')).toContain('Outstanding Balance: ₹0');

    // Verify text sanitization & multi-line wrapping for long names
    expect(sanitizeBillText('   Ayesha\x00\x07  Siddiqui \n ')).toBe('Ayesha Siddiqui');
    const wrapped = wrapTextLines(
      'Bridal Heavy Zardosi Work Lehenga With Custom Velvet Dupatta And Tassels',
      26
    );
    expect(wrapped.length).toBeGreaterThanOrEqual(3);
    for (const line of wrapped) {
      expect(line.length).toBeLessThanOrEqual(26);
    }
  });

  it('handles included vs. missing item photos and dynamically expands height for many items and long names', async () => {
    const { saveItemPhotoFromFile, getItemPhotosMap } = await import(
      '../services/billingService'
    );
    const { generateInvoiceBillImage } = await import('../utils/pdf');
    const settings = await getShopSettings(db);

    const samplePngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222
    ]);
    const photoRec = await saveItemPhotoFromFile(
      {
        file: new Blob([samplePngBytes], { type: 'image/png' }),
        lineItemId: 'line-photo-1'
      },
      db
    );

    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      id: i === 0 ? 'line-photo-1' : `line-item-${i + 1}`,
      catalogueItemId: null,
      name:
        i === 0
          ? 'Custom Embroidered Silk Gharara Set With Heavy Golden Border And Latkan Finishing'
          : `Tailoring Service Item #${i + 1} With Detailed Fitting Instructions`,
      category: 'service' as const,
      quantity: 1,
      unit: 'set',
      unitPricePaise: 85000,
      notes: 'Extra margin inside seams and deep back neck hook',
      photoId: i === 0 ? photoRec.id : undefined
    }));

    const multiCreated = await createInvoice(
      {
        customerName:
          'Begum Rukhsana Khatoon Wife Of Mohammad Tariq Anwar Sahibganj Ward No 14',
        customerPhone: '9123456789',
        invoiceDate: '2026-10-23',
        items: manyItems,
        discountType: 'percent',
        discountValue: 10,
        advancePaise: 0
      },
      db
    );

    const photosMap = await getItemPhotosMap([photoRec.id], db);

    const imgWithPhotos = await generateInvoiceBillImage(
      multiCreated.invoice,
      multiCreated.payments,
      settings,
      { photosMap, includePhotos: true }
    );
    expect(imgWithPhotos.includedPhotoCount).toBe(1);
    expect(imgWithPhotos.logicalHeight).toBeGreaterThan(1200);
    expect(imgWithPhotos.renderedLines.join('\n')).toContain('Status: Unpaid');
    expect(imgWithPhotos.renderedLines.join('\n')).toContain('10. Tailoring Service Item #10');

    const imgWithoutPhotos = await generateInvoiceBillImage(
      multiCreated.invoice,
      multiCreated.payments,
      settings,
      { photosMap, includePhotos: false }
    );
    expect(imgWithoutPhotos.includedPhotoCount).toBe(0);
  });

  it('uses Web Share API with File + text when supported and falls back to download + WhatsApp URL with manual attachment instructions when unsupported', async () => {
    const {
      buildShareBillText,
      generateInvoiceBillImage,
      shareBillImageAndText
    } = await import('../utils/pdf');
    const settings = await getShopSettings(db);

    const created = await createInvoice(
      {
        customerName: 'Nadia Parveen',
        customerPhone: '9988776655',
        invoiceDate: '2026-10-23',
        items: [
          {
            catalogueItemId: 'srv-kurti',
            name: 'Kurti Stitching',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 35000
          }
        ],
        advancePaise: 15000
      },
      db
    );

    const billImage = await generateInvoiceBillImage(
      created.invoice,
      created.payments,
      settings
    );
    const customText = buildShareBillText(created.invoice, settings);

    // Case A: navigator.canShare({ files }) is unavailable -> fallback behavior
    const origNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true
    });

    const fallbackOutcome = await shareBillImageAndText({
      invoice: created.invoice,
      settings,
      billImage,
      customText,
      openWhatsAppWindow: false
    });

    expect(fallbackOutcome.sharedViaNativeFile).toBe(false);
    expect(fallbackOutcome.method).toBe('whatsapp-fallback');
    expect(fallbackOutcome.manualAttachRequired).toBe(true);
    expect(fallbackOutcome.downloadedFilename).toBe(`${created.invoice.invoiceNumber}.png`);
    expect(fallbackOutcome.whatsappUrl).toContain('https://wa.me/919988776655?text=');
    expect(fallbackOutcome.instructions).toContain('Attach');
    expect(fallbackOutcome.statusMessage.toLowerCase()).not.toContain('sent successfully');

    // Case B: navigator.canShare({ files }) and navigator.share are supported
    let sharedPayload: any = null;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        canShare: (data: any) => Boolean(data && Array.isArray(data.files) && data.files.length === 1),
        share: async (data: any) => {
          sharedPayload = data;
        }
      },
      configurable: true,
      writable: true
    });

    const nativeOutcome = await shareBillImageAndText({
      invoice: created.invoice,
      settings,
      billImage,
      customText
    });

    expect(nativeOutcome.sharedViaNativeFile).toBe(true);
    expect(nativeOutcome.method).toBe('native-file-share');
    expect(nativeOutcome.manualAttachRequired).toBe(false);
    expect(sharedPayload).toBeDefined();
    expect(sharedPayload.text).toBe(customText);
    expect(sharedPayload.files).toHaveLength(1);
    expect(sharedPayload.files[0].name).toBe(`${created.invoice.invoiceNumber}.png`);
    expect(sharedPayload.files[0].type).toBe('image/png');

    // Restore original navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: origNavigator,
      configurable: true,
      writable: true
    });
  });

  it("renders full 2D canvas receipt layout with center-cropped non-distorted item thumbnails", async () => {
    const { saveItemPhotoFromFile, getItemPhotosMap } = await import("../services/billingService");
    const { generateInvoiceBillImage } = await import("../utils/pdf");
    const settings = await getShopSettings(db);

    const samplePngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222
    ]);
    const photoRec = await saveItemPhotoFromFile(
      {
        file: new Blob([samplePngBytes], { type: "image/png" }),
        lineItemId: "line-canvas-1"
      },
      db
    );

    const created = await createInvoice(
      {
        customerName: "Sana Mirza",
        customerPhone: "9811223344",
        invoiceDate: "2026-10-23",
        items: [
          {
            id: "line-canvas-1",
            catalogueItemId: "srv-lehenga",
            name: "Bridal Lehenga",
            category: "service",
            quantity: 1,
            unit: "set",
            unitPricePaise: 250000,
            photoId: photoRec.id
          }
        ],
        discountType: "flat",
        discountValue: 20000,
        advancePaise: 100000
      },
      db
    );

    const photosMap = await getItemPhotosMap([photoRec.id], db);

    const drawnTexts: string[] = [];
    const drawImageCalls: number[][] = [];
    const origDocument = (globalThis as any).document;
    const origImage = (globalThis as any).Image;

    class MockImage {
      naturalWidth = 200;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    }

    (globalThis as any).Image = MockImage;
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: () => ({
              save: () => {},
              restore: () => {},
              scale: () => {},
              fillRect: () => {},
              strokeRect: () => {},
              beginPath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              stroke: () => {},
              fillText: (txt: string) => {
                drawnTexts.push(txt);
              },
              drawImage: (...args: any[]) => {
                drawImageCalls.push(args.slice(1));
              }
            }),
            toDataURL: () =>
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
          };
        }
        return {};
      }
    };

    const rendered = await generateInvoiceBillImage(
      created.invoice,
      created.payments,
      settings,
      { photosMap, includePhotos: true }
    );

    expect(rendered.includedPhotoCount).toBe(1);
    expect(drawnTexts).toContain("alif.");
    expect(drawnTexts).toContain("Sana Mirza");
    expect(drawnTexts).toContain("PARTIALLY PAID");
    expect(drawnTexts).toContain("FINAL TOTAL");
    expect(drawnTexts).toContain("OUTSTANDING BALANCE");

    // Verify 200x100 landscape photo was center-cropped to 100x100 square (sx=50, sy=0, sw=100, sh=100) into 56x56 box
    expect(drawImageCalls.length).toBe(1);
    const [sx, sy, sw, sh, _dx, _dy, dw, dh] = drawImageCalls[0];
    expect(sx).toBe(50);
    expect(sy).toBe(0);
    expect(sw).toBe(100);
    expect(sh).toBe(100);
    expect(dw).toBe(56);
    expect(dh).toBe(56);

    (globalThis as any).document = origDocument;
    (globalThis as any).Image = origImage;
  });
});


describe('7. IndexedDB ObjectStore NotFoundError Resilience & Concurrent Seeding', () => {
  const testDbName = 'test_alif_db_resilience';

  beforeEach(async () => {
    await Dexie.delete(testDbName);
  });

  it('serializes concurrent ensureSeeded() calls and never throws NotFoundError when itemPhotos store is unavailable', async () => {
    const db = new ALIFBillingDatabase(testDbName);

    // Fire 6 concurrent ensureSeeded() calls (simulating App.tsx + CreateBillView startup)
    await Promise.all([
      db.ensureSeeded(),
      db.ensureSeeded(),
      db.ensureSeeded(),
      getShopSettings(db),
      listCatalogue({}, db),
      listInvoices({}, db)
    ]);

    expect(db.hasObjectStore('invoices')).toBe(true);
    expect(db.hasObjectStore('itemPhotos')).toBe(true);

    // Simulate a legacy/broken IDB connection where itemPhotos objectStore is reported missing
    const origHasObjectStore = db.hasObjectStore.bind(db);
    db.hasObjectStore = (storeName: string) => {
      if (storeName === 'itemPhotos') return false;
      return origHasObjectStore(storeName);
    };

    const samplePngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222
    ]);
    const photoRec = await saveItemPhotoFromFile(
      {
        file: new Blob([samplePngBytes], { type: 'image/png' }),
        lineItemId: 'line-legacy-1'
      },
      db
    );
    expect(photoRec.id).toMatch(/^photo-/);

    // Creating an invoice must succeed without throwing NotFoundError on IDBTransaction
    const created = await createInvoice(
      {
        customerName: ' Salma Khatoon ',
        customerPhone: '9876543219',
        invoiceDate: '2026-10-23',
        items: [
          {
            id: 'line-legacy-1',
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 45000,
            photoId: photoRec.id
          }
        ],
        advancePaise: 15000,
        advanceMethod: 'cash'
      },
      db
    );

    expect(created.invoice.invoiceNumber).toBe('ALIF-2026-0001');
    expect(created.invoice.totalPaise).toBe(45000);
    expect(created.invoice.balancePaise).toBe(30000);

    // Reopening/updating invoice and reading photos must also succeed without NotFoundError
    const reopened = await reopenAndUpdateInvoice(
      {
        invoiceId: created.invoice.id,
        discountType: 'flat',
        discountValue: 5000
      },
      db
    );
    expect(reopened.totalPaise).toBe(40000);
    expect(reopened.balancePaise).toBe(25000);

    const photosMap = await getItemPhotosMap([photoRec.id], db);
    expect(photosMap[photoRec.id]).toBeDefined();

    await deleteItemPhoto(photoRec.id, db);
    db.close();
  });
});

describe('8. Inventory Management, Fractional Quantities, FIFO Bundle Deductions, Edit Reconciliation & Cancellation', () => {
  const testDbName = 'test_alif_inventory_fifo';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('tracks fractional quantities (1.2 m, 2.5 m, 3.25 m) without floating-point drift, keeps colours as separate variants, and separates purchase cost, default price, and selling price', async () => {
    const {
      saveInventoryVariant,
      receiveInventoryBundle,
      adjustInventoryStock,
      listInventoryBundles
    } = await import('../services/billingService');
    const { getVariantStockStatus } = await import('../utils/search');

    // Create a new variant with opening bundle of 1.2 m
    const created = await saveInventoryVariant(
      {
        category: 'Fabric',
        productType: 'Fandy Silk',
        workDesign: 'All-over Work',
        color: 'Royal Blue',
        unit: 'm',
        purchaseCostPaise: 30000, // ₹300/m cost
        defaultSellingPricePaise: 46000, // ₹460/m catalogue ref price
        lowStockThreshold: 4,
        initialBundleQuantity: 1.2,
        initialBundleDate: '2026-10-01',
        initialBundleCode: 'BND-RBL-01'
      },
      db
    );

    expect(created.variant.totalQuantity).toBe(1.2);
    expect(getVariantStockStatus(created.variant)).toBe('Low Stock');

    // Receive two more fractional bundles: 2.5 m and 3.25 m -> total should be 1.2 + 2.5 + 3.25 = 6.95 m
    await receiveInventoryBundle(
      {
        variantId: created.variant.id,
        quantity: 2.5,
        receivedDate: '2026-10-05',
        purchaseCostPaise: 31000,
        bundleCode: 'BND-RBL-02'
      },
      db
    );
    const afterThird = await receiveInventoryBundle(
      {
        variantId: created.variant.id,
        quantity: 3.25,
        receivedDate: '2026-10-10',
        purchaseCostPaise: 31500,
        bundleCode: 'BND-RBL-03'
      },
      db
    );

    expect(afterThird.variant.totalQuantity).toBe(6.95);
    expect(getVariantStockStatus(afterThird.variant)).toBe('In Stock');

    const bundles = await listInventoryBundles(created.variant.id, db);
    expect(bundles).toHaveLength(3);
    expect(bundles.map((b) => b.bundleCode)).toEqual([
      'BND-RBL-01',
      'BND-RBL-02',
      'BND-RBL-03'
    ]);

    // Manual stock adjustment requires a reason
    await expect(
      adjustInventoryStock(
        {
          variantId: created.variant.id,
          quantityDelta: -0.45,
          reason: '   '
        },
        db
      )
    ).rejects.toThrow(/reason is required/i);

    const adjusted = await adjustInventoryStock(
      {
        variantId: created.variant.id,
        bundleId: bundles[0].id,
        quantityDelta: -0.45,
        reason: 'Sample swatch cut for display'
      },
      db
    );
    // 6.95 - 0.45 = 6.5 m
    expect(adjusted.variant.totalQuantity).toBe(6.5);
  });

  it('deducts stock in strict FIFO order on bill save, ignores services/non-stock items, reconciles edits, and restores stock exactly once on cancellation', async () => {
    const {
      listInventoryBundles,
      listInventoryMovements,
      listInventoryVariants
    } = await import('../services/billingService');

    // Seed variant 'var-fandy-silk-allover-green' has two bundles:
    // BND-FSG-01 (received 2026-10-01): 4.5 m
    // BND-FSG-02 (received 2026-10-12): 8.0 m
    // Combined = 12.5 m
    let bundlesBefore = await listInventoryBundles('var-fandy-silk-allover-green', db);
    expect(bundlesBefore).toHaveLength(2);
    expect(bundlesBefore[0].remainingQuantity).toBe(4.5);
    expect(bundlesBefore[1].remainingQuantity).toBe(8.0);

    // 1. Insufficient stock (> 12.5 m) must be rejected atomically without creating an invoice or deducting stock
    await expect(
      createInvoice(
        {
          customerName: 'Zoya Khan',
          customerPhone: '9876543210',
          items: [
            {
              catalogueItemId: 'prd-fandy-silk-green',
              inventoryVariantId: 'var-fandy-silk-allover-green',
              name: 'Green Fandy Silk — All-over Work',
              category: 'product',
              quantity: 14.0,
              unit: 'm',
              unitPricePaise: 52000
            }
          ]
        },
        db
      )
    ).rejects.toThrow(/Insufficient stock/i);

    bundlesBefore = await listInventoryBundles('var-fandy-silk-allover-green', db);
    expect(bundlesBefore[0].remainingQuantity).toBe(4.5);
    expect(bundlesBefore[1].remainingQuantity).toBe(8.0);

    // 2. Save valid bill with:
    // - 5.75 m of Green Fandy Silk (selling at custom ₹550/m -> independent of ₹320 cost and ₹480 default)
    // - 1 pc of Astar Blouse (service -> must NOT deduct stock)
    // - 2 m of Custom Customer Fabric with isNonStock: true (must NOT deduct stock)
    const saved = await createInvoice(
      {
        customerName: 'Zoya Khan',
        customerPhone: '9876543210',
        invoiceDate: '2026-10-24',
        items: [
          {
            id: 'line-fandy-green',
            catalogueItemId: 'prd-fandy-silk-green',
            inventoryVariantId: 'var-fandy-silk-allover-green',
            name: 'Green Fandy Silk — All-over Work',
            category: 'product',
            quantity: 5.75,
            unit: 'm',
            unitPricePaise: 55000 // ₹550/m actual invoice selling price
          },
          {
            id: 'line-blouse-srv',
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 45000
          },
          {
            id: 'line-cust-nonstock',
            catalogueItemId: null,
            inventoryVariantId: 'var-fandy-silk-allover-green',
            isNonStock: true,
            name: 'Customer Own Border Trim',
            category: 'custom',
            quantity: 2,
            unit: 'm',
            unitPricePaise: 10000
          }
        ],
        advancePaise: 100000
      },
      db
    );

    // Verify FIFO allocation: 4.5 m from BND-FSG-01 (leaving 0) and 1.25 m from BND-FSG-02 (leaving 6.75 m)
    const greenLine = saved.invoice.items[0];
    expect(greenLine.stockAllocations).toEqual([
      {
        bundleId: 'bnd-fandy-green-01',
        bundleCode: 'BND-FSG-01',
        quantityDeducted: 4.5,
        purchaseCostPaise: 31000
      },
      {
        bundleId: 'bnd-fandy-green-02',
        bundleCode: 'BND-FSG-02',
        quantityDeducted: 1.25,
        purchaseCostPaise: 32500
      }
    ]);
    expect(saved.invoice.items[1].stockAllocations).toBeUndefined();
    expect(saved.invoice.items[2].stockAllocations).toBeUndefined();

    const bundlesAfterSale = await listInventoryBundles('var-fandy-silk-allover-green', db);
    expect(bundlesAfterSale[0].remainingQuantity).toBe(0);
    expect(bundlesAfterSale[1].remainingQuantity).toBe(6.75);

    const variantsAfterSale = await listInventoryVariants({}, db);
    const greenVarAfterSale = variantsAfterSale.find(
      (v) => v.id === 'var-fandy-silk-allover-green'
    )!;
    expect(greenVarAfterSale.totalQuantity).toBe(6.75);
    expect(greenVarAfterSale.purchaseCostPaise).toBe(32000);
    expect(greenVarAfterSale.defaultSellingPricePaise).toBe(48000);

    // 3. Recording a subsequent balance payment must NEVER deduct stock
    await recordInvoicePayment(
      {
        invoiceId: saved.invoice.id,
        amountPaise: 50000,
        method: 'upi',
        type: 'payment'
      },
      db
    );
    const bundlesAfterPayment = await listInventoryBundles('var-fandy-silk-allover-green', db);
    expect(bundlesAfterPayment[1].remainingQuantity).toBe(6.75);

    // 4. Editing the bill (reducing 5.75 m -> 3.25 m) must reconcile stock accurately (12.5 - 3.25 = 9.25 m remaining)
    const edited = await reopenAndUpdateInvoice(
      {
        invoiceId: saved.invoice.id,
        items: [
          {
            id: 'line-fandy-green',
            catalogueItemId: 'prd-fandy-silk-green',
            inventoryVariantId: 'var-fandy-silk-allover-green',
            name: 'Green Fandy Silk — All-over Work',
            category: 'product',
            quantity: 3.25,
            unit: 'm',
            unitPricePaise: 55000
          },
          {
            id: 'line-blouse-srv',
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 45000
          }
        ]
      },
      db
    );

    expect(edited.items[0].stockAllocations).toEqual([
      {
        bundleId: 'bnd-fandy-green-01',
        bundleCode: 'BND-FSG-01',
        quantityDeducted: 3.25,
        purchaseCostPaise: 31000
      }
    ]);
    const bundlesAfterEdit = await listInventoryBundles('var-fandy-silk-allover-green', db);
    expect(bundlesAfterEdit[0].remainingQuantity).toBe(1.25);
    expect(bundlesAfterEdit[1].remainingQuantity).toBe(8.0);

    // 5. Cancelling the bill restores the 3.25 m back to BND-FSG-01 (total = 12.5 m)
    const cancelledOnce = await cancelInvoice(saved.invoice.id, 'Client changed fabric choice', db);
    expect(cancelledOnce.status).toBe('Cancelled');
    expect(cancelledOnce.stockRestoredOnCancel).toBe(true);

    const bundlesAfterCancel1 = await listInventoryBundles('var-fandy-silk-allover-green', db);
    expect(bundlesAfterCancel1[0].remainingQuantity).toBe(4.5);
    expect(bundlesAfterCancel1[1].remainingQuantity).toBe(8.0);

    // Calling cancelInvoice a second time must NOT double-restore stock
    await cancelInvoice(saved.invoice.id, 'Duplicate cancel click', db);
    const bundlesAfterCancel2 = await listInventoryBundles('var-fandy-silk-allover-green', db);
    expect(bundlesAfterCancel2[0].remainingQuantity).toBe(4.5);
    expect(bundlesAfterCancel2[1].remainingQuantity).toBe(8.0);

    const movements = await listInventoryMovements('var-fandy-silk-allover-green', db);
    expect(movements.length).toBeGreaterThanOrEqual(4);
  });
});

describe('9. Intelligent Offline Search, Product Hierarchy & Frequently Used Ranking', () => {
  const testDbName = 'test_alif_search_and_freq';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('ranks "Green Fandy Silk — All-over Work" #1 when searching typo query "gandy grren work all over" and handles word order and hyphens', async () => {
    const { listInventoryVariants, getFrequentlyUsedItems } = await import(
      '../services/billingService'
    );
    const {
      extractInventoryHierarchy,
      searchInventoryVariants
    } = await import('../utils/search');

    const variants = await listInventoryVariants({}, db);

    // 1. Typo + word order + hyphen variation: "gandy grren work all over"
    const typoRanked = searchInventoryVariants(variants, 'gandy grren work all over');
    expect(typoRanked.length).toBeGreaterThan(0);
    expect(typoRanked[0].item.id).toBe('var-fandy-silk-allover-green');
    expect(typoRanked[0].item.name).toBe('Green Fandy Silk — All-over Work');
    expect(typoRanked[0].isApproximateMatch).toBe(true);

    // 2. Word order & hyphen variations: "allover silk green fandy"
    const orderRanked = searchInventoryVariants(variants, 'allover silk green fandy');
    expect(orderRanked[0].item.id).toBe('var-fandy-silk-allover-green');

    // 3. Hierarchy extraction: Fabric -> Fandy Silk -> All-over Work -> [Green, Maroon]
    const hier = extractInventoryHierarchy(
      variants,
      'Fabric',
      'Fandy Silk',
      'All-over Work'
    );
    expect(hier.categories).toContain('Fabric');
    expect(hier.productTypes).toContain('Fandy Silk');
    expect(hier.workDesigns).toContain('All-over Work');
    expect(hier.colors).toEqual(['Green', 'Maroon']);

    // 4. Frequently Used items: when no invoices exist yet, invoiceUsageCount is strictly 0 (never fabricated)
    const initialFreq = await getFrequentlyUsedItems(8, db);
    expect(initialFreq.length).toBeGreaterThan(0);
    for (const entry of initialFreq) {
      expect(entry.invoiceUsageCount).toBe(0);
      expect(entry.isPinned).toBe(true);
    }

    // Save two invoices referencing 'srv-lehenga' (which is not pinned by default)
    await createInvoice(
      {
        customerName: 'Client One',
        customerPhone: '9800000001',
        items: [
          {
            catalogueItemId: 'srv-lehenga',
            name: 'Lehenga',
            category: 'service',
            quantity: 1,
            unit: 'set',
            unitPricePaise: 220000
          }
        ]
      },
      db
    );
    await createInvoice(
      {
        customerName: 'Client Two',
        customerPhone: '9800000002',
        items: [
          {
            catalogueItemId: 'srv-lehenga',
            name: 'Lehenga',
            category: 'service',
            quantity: 2,
            unit: 'set',
            unitPricePaise: 220000
          }
        ]
      },
      db
    );

    const updatedFreq = await getFrequentlyUsedItems(8, db);
    expect(updatedFreq[0].item.id).toBe('srv-lehenga');
    expect(updatedFreq[0].invoiceUsageCount).toBe(2);
    expect(updatedFreq[0].totalQuantityBilled).toBe(3);
  });
});

describe('10. Simplified 3-Action Bill Sharing, Checkboxes & SMS Image Limitation Handling', () => {
  const testDbName = 'test_alif_simplified_sharing';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('enforces Bill Image / Bill Summary Text checkbox combinations and never silently drops Bill Image when SMS is selected', async () => {
    const {
      shareBillViaWhatsApp,
      shareBillViaSms,
      validateShareContentSelection
    } = await import('../utils/pdf');
    const settings = await getShopSettings(db);

    const created = await createInvoice(
      {
        customerName: 'Farah Naaz',
        customerPhone: '9765432109',
        invoiceDate: '2026-10-24',
        items: [
          {
            catalogueItemId: 'srv-suit',
            name: 'Suit Stitching',
            category: 'service',
            quantity: 1,
            unit: 'set',
            unitPricePaise: 65000
          }
        ],
        advancePaise: 25000
      },
      db
    );

    // 1. Both unchecked -> validation error
    expect(
      validateShareContentSelection({ includeImage: false, includeText: false })
    ).toContain('Please select at least one option');

    await expect(
      shareBillViaWhatsApp({
        invoice: created.invoice,
        payments: created.payments,
        settings,
        includeImage: false,
        includeText: false,
        openWindow: false
      })
    ).rejects.toThrow(/select at least one option/i);

    // 2. WhatsApp with Text Only (includeImage: false, includeText: true)
    const waTextOnly = await shareBillViaWhatsApp({
      invoice: created.invoice,
      payments: created.payments,
      settings,
      includeImage: false,
      includeText: true,
      openWindow: false
    });
    expect(waTextOnly.method).toBe('whatsapp-text-only');
    expect(waTextOnly.sentAutomatically).toBe(false);
    expect(waTextOnly.targetUrl).toContain('https://wa.me/919765432109?text=');

    // 3. SMS with Bill Image checked -> must NOT silently omit the image; returns sms-image-limitation-prompt
    const smsWithImagePrompt = await shareBillViaSms({
      invoice: created.invoice,
      payments: created.payments,
      settings,
      includeImage: true,
      includeText: true,
      resolution: 'prompt',
      openWindow: false
    });
    expect(smsWithImagePrompt.smsImageLimitation).toBe(true);
    expect(smsWithImagePrompt.method).toBe('sms-image-limitation-prompt');
    expect(smsWithImagePrompt.sentAutomatically).toBe(false);
    expect(smsWithImagePrompt.instructions).toContain('Standard SMS cannot attach bill images');

    // 4. SMS with Text Only -> opens native sms: composer and never claims automatic sending
    const smsTextOnly = await shareBillViaSms({
      invoice: created.invoice,
      payments: created.payments,
      settings,
      includeImage: false,
      includeText: true,
      openWindow: false
    });
    expect(smsTextOnly.method).toBe('sms-text-composer');
    expect(smsTextOnly.sentAutomatically).toBe(false);
    expect(smsTextOnly.targetUrl).toContain('sms:+919765432109?body=');
    expect(smsTextOnly.statusMessage.toLowerCase()).toContain('composer');
  });
});

describe('11. High-Priority Shop-Counter Usability: Category-Aware Focus, Conditional Scroll, Phone-First Customer Lookup & Rate Shortcuts', () => {
  const testDbName = 'test_alif_shop_usability';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('resolves category-aware focus targets, prevents page scroll when allowScroll is false, and progresses through blank fields in order', async () => {
    const {
      findNextBlankBillingField,
      focusAndScrollElementByTestId,
      resolveCategoryFocusTarget,
      normalizeCustomerPhoneDigits
    } = await import('../utils/search');

    // Verify blank-field progression across multiple items (including wrap-around and skipping optional fields)
    const sampleLines = [
      { id: 'l1', name: 'Green Fandy Silk', category: 'product', quantity: '1', unitPriceRupees: '' },
      { id: 'l2', name: 'Astar Blouse', category: 'service', quantity: '1', unitPriceRupees: '450' }
    ];
    // Starting from item #2 (idx 1) when item #1 (idx 0) still has a blank price -> wraps around to line-price-0
    expect(
      findNextBlankBillingField({
        lines: sampleLines,
        customerPhone: '',
        customerName: '',
        startAfterLineIdx: 1
      })
    ).toEqual({
      section: 'items',
      testId: 'line-price-0',
      lineIdx: 0,
      lineId: 'l1',
      field: 'price',
      selectText: false
    });

    // Once all items have prices -> advances to input-customer-phone
    const completedLines = [
      { id: 'l1', name: 'Green Fandy Silk', category: 'product', quantity: '2.5', unitPriceRupees: '500' },
      { id: 'l2', name: 'Astar Blouse', category: 'service', quantity: '1', unitPriceRupees: '450' }
    ];
    expect(
      findNextBlankBillingField({
        lines: completedLines,
        customerPhone: '',
        customerName: '',
        startAfterLineIdx: 1
      })
    ).toEqual({
      section: 'customer',
      testId: 'input-customer-phone',
      selectText: false
    });

    // When phone is filled -> advances to input-customer-name
    expect(
      findNextBlankBillingField({
        lines: completedLines,
        customerPhone: '9876543210',
        customerName: '',
        startAfterLineIdx: 1
      })
    ).toEqual({
      section: 'customer',
      testId: 'input-customer-name',
      selectText: false
    });

    // When both phone and name are filled -> advances to input-advance-amount
    expect(
      findNextBlankBillingField({
        lines: completedLines,
        customerPhone: '9876543210',
        customerName: 'Ayesha Siddiqui',
        startAfterLineIdx: 1
      })
    ).toEqual({
      section: 'save',
      testId: 'input-advance-amount',
      selectText: true
    });
  });

  it('resolves category-aware focus targets, normalizes Indian phone digits, and scrolls only when target element is outside the visible viewport and allowScroll is not false', async () => {
    const {
      focusAndScrollElementByTestId,
      resolveCategoryFocusTarget,
      normalizeCustomerPhoneDigits
    } = await import('../utils/search');

    expect(resolveCategoryFocusTarget('service', false)).toEqual({
      target: 'qty',
      selectText: false
    });
    expect(resolveCategoryFocusTarget('product', true)).toEqual({
      target: 'qty',
      selectText: false
    });
    expect(normalizeCustomerPhoneDigits('+91 98765-43210')).toBe('9876543210');
    expect(normalizeCustomerPhoneDigits('09876543210')).toBe('9876543210');

    const origDocument = (globalThis as any).document;
    const origWindow = (globalThis as any).window;

    let focusedPreventScroll = false;
    let selectedCalled = false;
    let scrollIntoViewCalls = 0;
    let mockRect = { top: 240, bottom: 284 }; // Inside [104, 648] safe viewport

    const mockInput: any = {
      focus: (opts?: { preventScroll?: boolean }) => {
        if (opts?.preventScroll) focusedPreventScroll = true;
      },
      select: () => {
        selectedCalled = true;
      },
      getBoundingClientRect: () => mockRect,
      scrollIntoView: () => {
        scrollIntoViewCalls += 1;
      }
    };

    (globalThis as any).window = {
      innerHeight: 740,
      visualViewport: { height: 740 }
    };
    (globalThis as any).document = {
      documentElement: { clientHeight: 740 },
      querySelector: (sel: string) =>
        sel === '[data-testid="line-qty-0"]' ? mockInput : null
    };

    // 1. Element already inside visible viewport -> focuses & selects text without scrolling
    const found1 = focusAndScrollElementByTestId('line-qty-0', { selectText: true });
    expect(found1).toBe(true);
    expect(focusedPreventScroll).toBe(true);
    expect(selectedCalled).toBe(true);
    expect(scrollIntoViewCalls).toBe(0);

    // 2. Element below viewport when allowScroll is false (product selection) -> NEVER scrolls!
    mockRect = { top: 680, bottom: 725 };
    focusAndScrollElementByTestId('line-qty-0', { selectText: true, allowScroll: false });
    expect(scrollIntoViewCalls).toBe(0);

    // 3. Element below mobile keyboard / sticky bar when allowScroll is true -> scrolls smoothly into view
    focusAndScrollElementByTestId('line-qty-0', { selectText: false, allowScroll: true });
    expect(scrollIntoViewCalls).toBe(1);

    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
  });

  it('tracks repeat customer unpaid balance and historical item selling prices for phone-first lookup and 1-tap rate shortcuts', async () => {
    // Create first bill for repeat customer Ayesha Siddiqui (9876543210) with Green Fandy Silk at ₹540/m and Astar Blouse at ₹480
    const firstBill = await createInvoice(
      {
        customerName: 'Ayesha Siddiqui',
        customerPhone: '9876543210',
        customerNotes: 'Prefers deep back hook',
        invoiceDate: '2026-10-20',
        items: [
          {
            catalogueItemId: 'prd-fandy-silk-green',
            inventoryVariantId: 'var-fandy-silk-allover-green',
            name: 'Green Fandy Silk — All-over Work',
            category: 'product',
            quantity: 2.25,
            unit: 'm',
            unitPricePaise: 54000 // ₹540/m
          },
          {
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 48000 // ₹480
          }
        ],
        advancePaise: 50000 // ₹500 advance on ₹1,695 total -> ₹1,195 unpaid balance
      },
      db
    );

    expect(firstBill.invoice.totalPaise).toBe(169500);
    expect(firstBill.invoice.balancePaise).toBe(119500);

    const customers = await listCustomers('9876543210', db);
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe('Ayesha Siddiqui');
    expect(customers[0].notes).toBe('Prefers deep back hook');

    const history = await getCustomerHistory(customers[0].id, db);
    expect(history.totalBilledPaise).toBe(169500);
    expect(history.totalOutstandingPaise).toBe(119500);
  });
});

describe('12. Service-Only Garment Collection Notice vs. Product-Only Bills', () => {
  const testDbName = 'test_alif_service_vs_product_footer';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('includes "Please bring this bill at the time of garment collection." ONLY when service items are selected and omits it for product-only bills', async () => {
    const {
      buildConciseInvoiceMessage,
      buildShareBillText,
      generateInvoiceBillImage,
      generateInvoicePdfBytes,
      resolveInvoiceFooterText
    } = await import('../utils/pdf');
    const settings = await getShopSettings(db);

    // 1. Bill with a tailoring service item -> MUST include garment collection notice
    const serviceBill = await createInvoice(
      {
        customerName: 'Shabnam Ara',
        customerPhone: '9876543211',
        invoiceDate: '2026-10-24',
        items: [
          {
            catalogueItemId: 'srv-astar-blouse',
            name: 'Astar Blouse',
            category: 'service',
            quantity: 1,
            unit: 'pc',
            unitPricePaise: 45000
          }
        ],
        advancePaise: 20000
      },
      db
    );

    const serviceFooter = resolveInvoiceFooterText(serviceBill.invoice, settings);
    expect(serviceFooter).toContain('Please bring this bill at the time of garment collection.');

    const serviceShareText = buildShareBillText(serviceBill.invoice, settings);
    expect(serviceShareText).toContain('Please bring this bill at the time of garment collection.');

    const serviceConciseMsg = buildConciseInvoiceMessage(serviceBill.invoice, settings);
    expect(serviceConciseMsg).toContain('Please bring this bill at the time of garment collection.');

    const serviceImg = await generateInvoiceBillImage(
      serviceBill.invoice,
      serviceBill.payments,
      settings
    );
    expect(serviceImg.renderedLines.join(' ')).toContain(
      'Please bring this bill at the time of garment collection.'
    );

    const servicePdfText = Buffer.from(
      generateInvoicePdfBytes(serviceBill.invoice, serviceBill.payments, settings)
    ).toString('latin1');
    expect(servicePdfText).toContain('Please bring this bill at the time of garment collection.');

    // 2. Bill with ONLY products/materials -> MUST NOT include garment collection notice
    const productOnlyBill = await createInvoice(
      {
        customerName: 'Kiran Devi',
        customerPhone: '9876543212',
        invoiceDate: '2026-10-24',
        items: [
          {
            catalogueItemId: 'prd-latkan',
            name: 'Latkan',
            category: 'product',
            isNonStock: true,
            quantity: 2,
            unit: 'pair',
            unitPricePaise: 15000
          }
        ],
        advancePaise: 30000
      },
      db
    );

    const productFooter = resolveInvoiceFooterText(productOnlyBill.invoice, settings);
    expect(productFooter).toContain('Thank you for choosing alif.');
    expect(productFooter).not.toContain('Please bring this bill at the time of garment collection.');

    const productShareText = buildShareBillText(productOnlyBill.invoice, settings);
    expect(productShareText).not.toContain('Please bring this bill at the time of garment collection.');

    const productConciseMsg = buildConciseInvoiceMessage(productOnlyBill.invoice, settings);
    expect(productConciseMsg).not.toContain('Please bring this bill at the time of garment collection.');

    const productImg = await generateInvoiceBillImage(
      productOnlyBill.invoice,
      productOnlyBill.payments,
      settings
    );
    expect(productImg.renderedLines.join(' ')).not.toContain(
      'Please bring this bill at the time of garment collection.'
    );

    const productPdfText = Buffer.from(
      generateInvoicePdfBytes(productOnlyBill.invoice, productOnlyBill.payments, settings)
    ).toString('latin1');
    expect(productPdfText).not.toContain('Please bring this bill at the time of garment collection.');
  });
});

describe('13. All 6 Shop-Owner Inventory & Billing Improvements', () => {
  const testDbName = 'test_alif_db_inv_6_improvements';
  let db: ALIFBillingDatabase;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new ALIFBillingDatabase(testDbName);
    await db.ensureSeeded();
  });

  it('Improvement 1: syncs all 8 seeded variants 1:1 with Catalogue, keeps generic items non-stock, syncs edits bidirectionally, and blocks/redirects duplicate variants', async () => {
    const { saveInventoryVariant, saveCatalogueItem, toggleCatalogueItemPin, listCatalogue, listInventoryVariants, createInvoice } = await import('../services/billingService');

    const [variants, catalogue] = await Promise.all([
      listInventoryVariants({}, db),
      listCatalogue({}, db)
    ]);

    expect(variants.length).toBe(8);

    // Every single active variant (including Champagne Gold, Jet Black Astar, Dusty Rose Organza) has a 1:1 linked CatalogueItem
    for (const v of variants) {
      const linked = catalogue.filter((c) => c.inventoryVariantId === v.id);
      expect(linked.length).toBe(1);
      expect(linked[0].name).toBe(v.name);
      expect(linked[0].color).toBe(v.color);
      expect(linked[0].workDesign).toBe(v.workDesign);
      expect(linked[0].unit).toBe(v.unit);
    }

    // Generic items ('prd-fabric', 'prd-lace', 'prd-latkan', 'prd-dori') are non-stock so they never silently deduct from a specific variant
    for (const genericId of ['prd-fabric', 'prd-lace', 'prd-latkan', 'prd-dori']) {
      const genItem = catalogue.find((c) => c.id === genericId)!;
      expect(genItem).toBeDefined();
      expect(genItem.inventoryVariantId).toBe(null);
    }

    const ivoryBefore = (await listInventoryVariants({}, db)).find(
      (v) => v.id === 'var-cotton-astar-plain-ivory'
    )!;
    expect(ivoryBefore.totalQuantity).toBe(24);

    // Billing generic 'prd-fabric' must NOT deduct from Ivory Cotton Astar
    await createInvoice(
      {
        customerName: 'Shabnam Ara',
        customerPhone: '9876501122',
        items: [
          {
            catalogueItemId: 'prd-fabric',
            name: 'Fabric',
            category: 'product',
            quantity: 4,
            unit: 'm',
            unitPricePaise: 15000
          }
        ]
      },
      db
    );
    const ivoryAfterGenericBill = (await listInventoryVariants({}, db)).find(
      (v) => v.id === 'var-cotton-astar-plain-ivory'
    )!;
    expect(ivoryAfterGenericBill.totalQuantity).toBe(24);

    // Editing an InventoryVariant automatically syncs name, color, workDesign, unit, ref price, photo, active, and pin status to its linked CatalogueItem
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    await saveInventoryVariant(
      {
        id: 'var-fandy-silk-butti-gold',
        category: 'Fabric',
        productType: 'Fandy Silk',
        workDesign: 'Zari Butti',
        color: 'Royal Gold',
        unit: 'm',
        purchaseCostPaise: 29000,
        defaultSellingPricePaise: 46000,
        photoDataUrl: sampleDataUrl,
        isPinned: true,
        isActive: true
      },
      db
    );

    const catAfterEdit = await listCatalogue({}, db);
    const syncedGoldCat = catAfterEdit.find(
      (c) => c.inventoryVariantId === 'var-fandy-silk-butti-gold'
    )!;
    expect(syncedGoldCat.name).toBe('Royal Gold Fandy Silk — Zari Butti');
    expect(syncedGoldCat.color).toBe('Royal Gold');
    expect(syncedGoldCat.workDesign).toBe('Zari Butti');
    expect(syncedGoldCat.defaultPricePaise).toBe(46000);
    expect(syncedGoldCat.costPricePaise).toBe(29000);
    expect(syncedGoldCat.photoDataUrl).toBe(sampleDataUrl);
    expect(syncedGoldCat.isPinned).toBe(true);

    // Toggling pin on the CatalogueItem syncs back to InventoryVariant
    await toggleCatalogueItemPin(syncedGoldCat.id, false, db);
    const goldVarAfterUnpin = (await listInventoryVariants({}, db)).find(
      (v) => v.id === 'var-fandy-silk-butti-gold'
    )!;
    expect(goldVarAfterUnpin.isPinned).toBe(false);

    // Duplicate variant protection: attempting to create a new variant with identical normalized attributes throws by default
    await expect(
      saveInventoryVariant(
        {
          category: 'fabric',
          productType: 'fandy silk',
          workDesign: 'all-over work',
          color: 'GREEN',
          unit: 'm',
          purchaseCostPaise: 32000,
          defaultSellingPricePaise: 48000,
          initialBundleQuantity: 5.5
        },
        db
      )
    ).rejects.toThrow(/Duplicate variant already exists/i);

    // Receiving into existing variant on duplicate adds a roll without creating a duplicate variant
    const dupRes = await saveInventoryVariant(
      {
        category: 'Fabric',
        productType: 'Fandy Silk',
        workDesign: 'All-over Work',
        color: 'Green',
        unit: 'm',
        purchaseCostPaise: 33000,
        defaultSellingPricePaise: 49000,
        initialBundleQuantity: 5.5,
        receiveIntoExistingOnDuplicate: true
      },
      db
    );
    expect(dupRes.receivedIntoExisting).toBe(true);
    expect(dupRes.variant.id).toBe('var-fandy-silk-allover-green');
    expect(dupRes.variant.totalQuantity).toBe(18); // 12.5 + 5.5
    const allVarsAfterDup = await listInventoryVariants({}, db);
    expect(allVarsAfterDup.length).toBe(8);
  });

  it('Improvement 3 & 6: supports exact actual-remaining stock adjustment, safe roll edit/delete protection, and automatic roll-to-variant photo inheritance', async () => {
    const {
      adjustInventoryStock,
      receiveInventoryBundle,
      updateInventoryBundle,
      deleteInventoryBundle,
      listInventoryBundles,
      listCatalogue,
      createInvoice
    } = await import('../services/billingService');

    const rollPhoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    // Receive a new roll with a photo onto Maroon Fandy Silk (which currently has no photo)
    const rec = await receiveInventoryBundle(
      {
        variantId: 'var-fandy-silk-allover-maroon',
        quantity: 7.5,
        bundleCode: 'BND-FSM-02',
        supplier: 'Surat Silk House',
        photoDataUrl: rollPhoto
      },
      db
    );

    // Variant and its linked CatalogueItem automatically inherit the roll photo!
    expect(rec.variant.photoDataUrl).toBe(rollPhoto);
    expect(rec.variant.totalQuantity).toBe(13.75); // 6.25 + 7.5
    const catItems = await listCatalogue({}, db);
    const maroonCat = catItems.find(
      (c) => c.inventoryVariantId === 'var-fandy-silk-allover-maroon'
    )!;
    expect(maroonCat.photoDataUrl).toBe(rollPhoto);

    // Edit the newly received unused roll's initialQuantity (7.5 -> 8.25) and supplier
    const updatedRoll = await updateInventoryBundle(
      {
        bundleId: rec.bundle.id,
        initialQuantity: 8.25,
        supplier: 'Surat Royal Weaves',
        notes: 'Recounted on arrival'
      },
      db
    );
    expect(updatedRoll.bundle.initialQuantity).toBe(8.25);
    expect(updatedRoll.bundle.remainingQuantity).toBe(8.25);
    expect(updatedRoll.variant.totalQuantity).toBe(14.5); // 6.25 + 8.25

    // Delete the unused roll BND-FSM-02 -> succeeds because zero stock was deducted from it
    const afterDelete = await deleteInventoryBundle(rec.bundle.id, db);
    expect(afterDelete.variant.totalQuantity).toBe(6.25);

    // Sell 2.25 m from BND-FSM-01 (leaving 4.0 m)
    await createInvoice(
      {
        customerName: 'Farah Khan',
        customerPhone: '9876509988',
        items: [
          {
            catalogueItemId: 'prd-fandy-silk-maroon',
            inventoryVariantId: 'var-fandy-silk-allover-maroon',
            name: 'Maroon Fandy Silk — All-over Work',
            category: 'product',
            quantity: 2.25,
            unit: 'm',
            unitPricePaise: 50000
          }
        ]
      },
      db
    );

    // Attempting to delete BND-FSM-01 after a sale must be blocked to protect FIFO & invoice history
    await expect(deleteInventoryBundle('bnd-fandy-maroon-01', db)).rejects.toThrow(
      /Cannot delete roll/i
    );

    // Attempting to edit BND-FSM-01 initialQuantity below the 2.25 m already sold must be blocked
    await expect(
      updateInventoryBundle(
        {
          bundleId: 'bnd-fandy-maroon-01',
          initialQuantity: 1.5
        },
        db
      )
    ).rejects.toThrow(/Cannot set roll initial quantity/i);

    // Adjust stock using exact `actualRemainingQuantity: 3.5` on BND-FSM-01 (currently 4.0 m -> auto computes delta = -0.5 m)
    const exactAdj = await adjustInventoryStock(
      {
        variantId: 'var-fandy-silk-allover-maroon',
        bundleId: 'bnd-fandy-maroon-01',
        actualRemainingQuantity: 3.5,
        reason: 'Roll End Shortage'
      },
      db
    );
    expect(exactAdj.computedDelta).toBe(-0.5);
    expect(exactAdj.variant.totalQuantity).toBe(3.5);

    // Mark roll finished (`actualRemainingQuantity: 0`) -> sets remaining to 0
    const finishAdj = await adjustInventoryStock(
      {
        variantId: 'var-fandy-silk-allover-maroon',
        bundleId: 'bnd-fandy-maroon-01',
        actualRemainingQuantity: 0,
        reason: 'Roll End Shortage'
      },
      db
    );
    expect(finishAdj.computedDelta).toBe(-3.5);
    expect(finishAdj.variant.totalQuantity).toBe(0);
    const maroonBundles = await listInventoryBundles('var-fandy-silk-allover-maroon', db);
    expect(maroonBundles[0].remainingQuantity).toBe(0);
  });

  it('Improvement 4 & 5: generates distinct colour swatch SVGs and atomically creates new stock variants inline on New Bill save (with full rollback on failure)', async () => {
    const { createInvoice, listInventoryVariants, listInventoryBundles, listCatalogue } =
      await import('../services/billingService');
    const { generateProductPlaceholderSvg } = await import('../utils/search');

    const greenSvg = generateProductPlaceholderSvg('Fandy Silk', 'All-over Work', 'Green');
    const maroonSvg = generateProductPlaceholderSvg('Fandy Silk', 'All-over Work', 'Maroon');
    expect(greenSvg === maroonSvg).toBe(false);
    expect(decodeURIComponent(greenSvg)).toContain('GREEN');
    expect(decodeURIComponent(maroonSvg)).toContain('MAROON');

    // 1. Failing inline new-stock bill (billed quantity 18m > opening roll 12m) must roll back completely
    await expect(
      createInvoice(
        {
          customerName: 'Amina Begum',
          customerPhone: '9876543299',
          items: [
            {
              name: 'Peacock Blue Organza Tissue — Zari Border',
              category: 'product',
              quantity: 18,
              unit: 'm',
              unitPricePaise: 62000,
              newStockVariantSpec: {
                category: 'Fabric',
                productType: 'Organza Tissue',
                workDesign: 'Zari Border',
                color: 'Peacock Blue',
                unit: 'm',
                openingStockQuantity: 12,
                purchaseCostPaise: 41000
              }
            }
          ]
        },
        db
      )
    ).rejects.toThrow(/Insufficient opening stock/i);

    const varsAfterFailedSave = await listInventoryVariants({}, db);
    expect(varsAfterFailedSave.length).toBe(8);

    // 2. Valid inline new-stock bill (opening roll 15m, billed 3.25m -> leaves 11.75m in stock and creates synced CatalogueItem)
    const savedInline = await createInvoice(
      {
        customerName: 'Amina Begum',
        customerPhone: '9876543299',
        items: [
          {
            name: 'Peacock Blue Organza Tissue — Zari Border',
            category: 'product',
            quantity: 3.25,
            unit: 'm',
            unitPricePaise: 62000,
            newStockVariantSpec: {
              category: 'Fabric',
              productType: 'Organza Tissue',
              workDesign: 'Zari Border',
              color: 'Peacock Blue',
              unit: 'm',
              openingStockQuantity: 15,
              purchaseCostPaise: 41000,
              supplier: 'Varanasi Tissue Looms'
            }
          }
        ],
        advancePaise: 100000
      },
      db
    );

    const line0 = savedInline.invoice.items[0];
    expect(Boolean(line0.inventoryVariantId)).toBe(true);
    expect(Boolean(line0.catalogueItemId)).toBe(true);
    expect(line0.stockAllocations).toHaveLength(1);
    expect(line0.stockAllocations![0].quantityDeducted).toBe(3.25);

    const varsAfterSuccess = await listInventoryVariants({}, db);
    expect(varsAfterSuccess.length).toBe(9);
    const createdVar = varsAfterSuccess.find((v) => v.id === line0.inventoryVariantId)!;
    expect(createdVar.name).toBe('Peacock Blue Organza Tissue — Zari Border');
    expect(createdVar.totalQuantity).toBe(11.75); // 15 - 3.25 deducted exactly once!

    const createdBundles = await listInventoryBundles(createdVar.id, db);
    expect(createdBundles).toHaveLength(1);
    expect(createdBundles[0].initialQuantity).toBe(15);
    expect(createdBundles[0].remainingQuantity).toBe(11.75);

    const catAfterSuccess = await listCatalogue({}, db);
    const createdCat = catAfterSuccess.find((c) => c.id === line0.catalogueItemId)!;
    expect(createdCat.inventoryVariantId).toBe(createdVar.id);
    expect(createdCat.name).toBe('Peacock Blue Organza Tissue — Zari Border');
  });
});
