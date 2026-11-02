import React, { useState } from 'react';
import {
  CatalogueItem,
  Customer,
  Invoice,
  PaymentMethod,
  PaymentRecord,
  ShopSettings
} from '../types/billing';
import { PAYMENT_METHOD_LABELS } from '../utils/currency';
import {
  generateCatalogueCsv,
  generateCustomersCsv,
  generateInvoicesCsv,
  generatePaymentsCsv,
  triggerTextFileDownload
} from '../utils/csv';
import {
  exportBackupPayload,
  restoreBackupPayload,
  updateShopSettings,
  validateBackupPayload
} from '../services/billingService';
import { ConfirmDialog } from './StatusBadge';

interface SettingsBackupViewProps {
  settings: ShopSettings;
  customers: Customer[];
  catalogue: CatalogueItem[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  onRefreshAll: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function SettingsBackupView({
  settings,
  customers,
  catalogue,
  invoices,
  payments,
  onRefreshAll,
  onNotify
}: SettingsBackupViewProps) {
  const [shopName, setShopName] = useState(settings.shopName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [address, setAddress] = useState(settings.address);
  const [city, setCity] = useState(settings.city);
  const [state, setState] = useState(settings.state);
  const [pinCode, setPinCode] = useState(settings.pinCode);
  const [phone, setPhone] = useState(settings.phone);
  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsappNumber);
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix);
  const [nextInvoiceSequence, setNextInvoiceSequence] = useState(
    String(settings.nextInvoiceSequence)
  );
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<PaymentMethod>(
    settings.defaultPaymentMethod
  );
  const [taxEnabled, setTaxEnabled] = useState(settings.taxEnabled);
  const [taxLabel, setTaxLabel] = useState(settings.taxLabel || 'Tax');
  const [taxRatePercent, setTaxRatePercent] = useState(String(settings.taxRatePercent || 0));
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter);

  const [jsonImportText, setJsonImportText] = useState('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    summary?: string;
    parsed?: unknown;
  } | null>(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateShopSettings({
        shopName: shopName.trim() || 'alif.',
        tagline: tagline.trim(),
        address: address.trim() || 'Daal Kuan College Road',
        city: city.trim() || 'Sahibganj',
        state: state.trim() || 'Jharkhand',
        pinCode: pinCode.trim() || '816109',
        phone: phone.trim() || '7250470009',
        whatsappNumber: whatsappNumber.trim() || '917250470009',
        invoicePrefix: invoicePrefix.trim().toUpperCase() || 'ALIF',
        nextInvoiceSequence: Math.max(1, parseInt(nextInvoiceSequence, 10) || 1),
        defaultPaymentMethod,
        taxEnabled,
        taxLabel: taxLabel.trim() || 'Tax',
        taxRatePercent: taxEnabled ? Number(taxRatePercent) || 0 : 0,
        receiptFooter: receiptFooter.trim()
      });
      onRefreshAll();
      onNotify('Shop & billing settings saved');
    } catch (err: any) {
      onNotify(err?.message || 'Failed to save settings', true);
    }
  }

  async function handleExportJsonBackup() {
    try {
      const payload = await exportBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const datePart = payload.exportedAt.slice(0, 10);
      const filename = `ALiF-Billing-Backup-${datePart}.json`;
      triggerTextFileDownload(filename, jsonStr, 'application/json;charset=utf-8');
      onNotify(`Exported backup ${filename}`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to export JSON backup', true);
    }
  }

  function handleValidateImportText(rawText: string) {
    setJsonImportText(rawText);
    if (!rawText.trim()) {
      setValidationResult(null);
      return;
    }
    try {
      const parsed = JSON.parse(rawText);
      const check = validateBackupPayload(parsed);
      if (check.valid && check.payload) {
        setValidationResult({
          valid: true,
          errors: [],
          parsed,
          summary: `Valid backup (${check.payload.customers.length} customers, ${check.payload.catalogue.length} catalogue items, ${check.payload.invoices.length} invoices, ${check.payload.payments.length} payment records)`
        });
      } else {
        setValidationResult({
          valid: false,
          errors: check.errors
        });
      }
    } catch (err: any) {
      setValidationResult({
        valid: false,
        errors: [`Invalid JSON syntax: ${err?.message || 'Parse error'}`]
      });
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      handleValidateImportText(content);
    };
    reader.readAsText(file);
  }

  async function handleConfirmRestore() {
    if (!validationResult?.valid || !validationResult.parsed) return;
    try {
      const counts = await restoreBackupPayload(validationResult.parsed);
      setConfirmRestoreOpen(false);
      setJsonImportText('');
      setValidationResult(null);
      onRefreshAll();
      onNotify(
        `Restored ${counts.invoices} invoices, ${counts.customers} customers, and ${counts.payments} payments.`
      );
    } catch (err: any) {
      setConfirmRestoreOpen(false);
      onNotify(err?.message || 'Restore failed; existing data was protected.', true);
    }
  }

  return (
    <div className="space-y-6">
      {/* Editorial Header */}
      <div className="border-b border-black pb-3.5">
        <div className="editorial-label">Atelier Configuration &amp; Archive</div>
        <h2 className="editorial-heading mt-0.5">
          Backup &amp; Shop Settings
        </h2>
      </div>

      {/* Local-Only Storage Notice */}
      <section className="bg-stone-50 border border-alif-border p-4 space-y-1.5">
        <div className="editorial-subhead">
          Offline Local Storage &amp; Data Protection Notice
        </div>
        <p className="text-xs text-alif-charcoal leading-relaxed">
          All client records, tailoring bills, catalogue rates and payment ledgers are stored
          exclusively on this device in browser IndexedDB (<code>alif_ladies_tailor_db</code>).
          Zero customer data is transmitted to external servers. Export a validated JSON backup regularly.
        </p>
      </section>

      {/* JSON Backup & Validated Restore */}
      <section className="bg-white border border-alif-border p-4 sm:p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-alif-border pb-4">
          <div>
            <h3 className="editorial-subhead">01 / Validated JSON Backup &amp; CSV Export</h3>
            <p className="text-xs font-mono text-alif-grey mt-1">
              {customers.length} clients • {catalogue.length} catalogue items • {invoices.length} invoices • {payments.length} payments
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportJsonBackup}
            data-testid="btn-export-json-backup"
            className="px-4 py-2.5 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800 shrink-0"
          >
            Download Full JSON Backup
          </button>
        </div>

        <div className="space-y-2">
          <div className="editorial-label">Individual CSV Table Exports</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                triggerTextFileDownload('ALiF-Invoices.csv', generateInvoicesCsv(invoices));
                onNotify('Exported ALiF-Invoices.csv');
              }}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
            >
              Export Invoices CSV
            </button>
            <button
              type="button"
              onClick={() => {
                triggerTextFileDownload('ALiF-Payments.csv', generatePaymentsCsv(payments));
                onNotify('Exported ALiF-Payments.csv');
              }}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
            >
              Export Payments CSV
            </button>
            <button
              type="button"
              onClick={() => {
                triggerTextFileDownload('ALiF-Customers.csv', generateCustomersCsv(customers));
                onNotify('Exported ALiF-Customers.csv');
              }}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
            >
              Export Customers CSV
            </button>
            <button
              type="button"
              onClick={() => {
                triggerTextFileDownload('ALiF-Catalogue.csv', generateCatalogueCsv(catalogue));
                onNotify('Exported ALiF-Catalogue.csv');
              }}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
            >
              Export Catalogue CSV
            </button>
          </div>
        </div>

        <div className="border-t border-alif-border pt-4 space-y-3">
          <div className="editorial-subhead">Restore from Validated JSON Backup</div>
          <p className="text-xs text-alif-grey">
            Select a <code>.json</code> backup file or paste JSON below. All records are validated
            before restoring so existing data is protected from corrupted imports.
          </p>

          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="block w-full text-sm text-alif-charcoal p-2 border border-alif-border bg-stone-50"
          />

          <textarea
            rows={3}
            value={jsonImportText}
            onChange={(e) => handleValidateImportText(e.target.value)}
            placeholder="Or paste raw backup JSON here..."
            aria-label="Backup JSON"
            data-testid="textarea-restore-json"
            className="w-full px-3 py-2 text-base font-mono bg-white"
          />

          {validationResult && (
            <div
              data-testid="backup-validation-status"
              className="p-3.5 border border-black bg-stone-50 text-xs text-alif-black"
            >
              {validationResult.valid ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-medium">✓ {validationResult.summary}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreOpen(true)}
                    data-testid="btn-trigger-restore"
                    className="px-4 py-2 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800 shrink-0"
                  >
                    Restore Validated Backup
                  </button>
                </div>
              ) : (
                <div>
                  <div className="font-semibold uppercase tracking-wider">
                    ✕ Backup Validation Failed (Existing data protected):
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-alif-charcoal">
                    {validationResult.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Shop & Billing Configuration Form */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white border border-alif-border p-4 sm:p-5 space-y-5"
      >
        <div className="border-b border-alif-border pb-3">
          <h3 className="editorial-subhead">
            02 / Shop Details, Invoice Prefix &amp; Payment Preferences
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block editorial-label mb-1">Shop Name</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              data-testid="settings-shop-name"
              className="w-full px-3 py-2 text-base bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Tagline / Specialisation</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-3 py-2 text-base bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Street Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-base bg-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block editorial-label mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-2.5 py-2 text-base bg-white"
              />
            </div>
            <div>
              <label className="block editorial-label mb-1">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-2.5 py-2 text-base bg-white"
              />
            </div>
            <div>
              <label className="block editorial-label mb-1">PIN</label>
              <input
                type="text"
                inputMode="numeric"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                className="w-full px-2.5 py-2 text-base font-mono bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block editorial-label mb-1">Shop Phone</label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-base font-mono bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Shop WhatsApp Number</label>
            <input
              type="tel"
              inputMode="tel"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              className="w-full px-3 py-2 text-base font-mono bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-3 border-t border-alif-border">
          <div>
            <label className="block editorial-label mb-1">Invoice Prefix</label>
            <input
              type="text"
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value)}
              data-testid="settings-invoice-prefix"
              className="w-full px-3 py-2 text-base font-mono bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Next Sequence Number</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={nextInvoiceSequence}
              onChange={(e) => setNextInvoiceSequence(e.target.value)}
              className="w-full px-3 py-2 text-base font-mono bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Default Payment Method</label>
            <select
              value={defaultPaymentMethod}
              onChange={(e) => setDefaultPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 text-base bg-white"
            >
              {(['cash', 'upi', 'bank_transfer', 'other'] as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tax Toggle (Disabled by default; never assume GST registration) */}
        <div className="bg-stone-50 border border-alif-border p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                Optional Tax Line (Disabled by Default)
              </div>
              <div className="text-xs text-alif-grey">
                GST registration is never assumed. Leave disabled for standard non-tax tailoring bills.
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={taxEnabled}
                onChange={(e) => setTaxEnabled(e.target.checked)}
              />
              Enable Tax
            </label>
          </div>

          {taxEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block editorial-label mb-1">Tax Label</label>
                <input
                  type="text"
                  value={taxLabel}
                  onChange={(e) => setTaxLabel(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-base bg-white"
                />
              </div>
              <div>
                <label className="block editorial-label mb-1">Tax Percentage (%)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="50"
                  step="any"
                  value={taxRatePercent}
                  onChange={(e) => setTaxRatePercent(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-base font-mono bg-white"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block editorial-label mb-1">Receipt Footer Message</label>
          <input
            type="text"
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            className="w-full px-3 py-2 text-base bg-white"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            data-testid="btn-save-settings"
            className="px-6 py-2.5 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800"
          >
            Save Shop Settings
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmRestoreOpen}
        title="Restore Validated Backup?"
        message="Restoring this backup will replace current local records with the validated backup data. Make sure you have downloaded a backup of current records if needed."
        confirmLabel="Confirm Restore"
        onConfirm={handleConfirmRestore}
        onCancel={() => setConfirmRestoreOpen(false)}
      />
    </div>
  );
}
