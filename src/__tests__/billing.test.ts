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
