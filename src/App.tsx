import React, { useEffect, useState } from 'react';
import {
  CatalogueItem,
  Customer,
  DashboardMetrics,
  InventoryBundle,
  InventoryMovement,
  InventoryVariant,
  Invoice,
  PaymentRecord,
  PaymentStatus,
  ShopSettings
} from './types/billing';
import { DEFAULT_SHOP_SETTINGS } from './db/seed';
import { db } from './db/database';
import {
  getDashboardMetrics,
  getShopSettings,
  getTodayIsoDate,
  listCatalogue,
  listCustomers,
  listInventoryBundles,
  listInventoryMovements,
  listInventoryVariants,
  listInvoices
} from './services/billingService';
import { DashboardView, NavTab } from './components/DashboardView';
import { CreateBillView } from './components/CreateBillView';
import { InvoicesHistoryView } from './components/InvoicesHistoryView';
import { InventoryView } from './components/InventoryView';
import { CustomersView } from './components/CustomersView';
import { CatalogueView } from './components/CatalogueView';
import { ReportsView } from './components/ReportsView';
import { SettingsBackupView } from './components/SettingsBackupView';
import { InvoiceDetailModal } from './components/InvoiceDetailModal';
import { AlifBrandMark } from './components/StatusBadge';

const NAV_ITEMS: { id: NavTab; label: string; isPrimary?: boolean }[] = [
  { id: 'create-bill', label: '+ New Bill', isPrimary: true },
  { id: 'dashboard', label: 'Overview' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customers', label: 'Clients' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [invoiceStatusPreset, setInvoiceStatusPreset] = useState<PaymentStatus | 'All'>('All');
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [inventoryVariants, setInventoryVariants] = useState<InventoryVariant[]>([]);
  const [inventoryBundles, setInventoryBundles] = useState<InventoryBundle[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    todayDate: getTodayIsoDate(),
    todayInvoiceValuePaise: 0,
    todayPaymentsReceivedPaise: 0,
    todayInvoiceCount: 0,
    totalOutstandingPaise: 0,
    outstandingInvoiceCount: 0,
    recentInvoices: []
  });

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [openModalInShareMode, setOpenModalInShareMode] = useState<boolean>(false);
  const [preselectedCustomer, setPreselectedCustomer] = useState<Customer | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  function showNotification(message: string, isError = false) {
    setToast({ message, isError });
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function refreshAllData() {
    try {
      await db.ensureSeeded();
      const [s, custs, cats, invVars, invBnds, invMovs, invs, pays, dash] =
        await Promise.all([
          getShopSettings(),
          listCustomers(),
          listCatalogue(),
          listInventoryVariants(),
          listInventoryBundles(),
          listInventoryMovements(),
          listInvoices(),
          db.payments.toArray(),
          getDashboardMetrics()
        ]);
      setSettings(s);
      setCustomers(custs);
      setCatalogue(cats);
      setInventoryVariants(invVars);
      setInventoryBundles(invBnds);
      setInventoryMovements(invMovs);
      setInvoices(invs);
      setPayments(pays);
      setMetrics(dash);
      setDbError(null);
    } catch (err: any) {
      setDbError(err?.message || 'Database initialization error');
    } finally {
      setIsInitializing(false);
    }
  }

  useEffect(() => {
    refreshAllData();
  }, []);

  return (
    <div className="min-h-screen bg-alif-bg text-alif-charcoal flex flex-col pb-8 md:pb-10">
      {/* Sticky Top Header & Navigation (Preserved Top Navigation; No Bottom Nav) */}
      <div className="sticky top-0 z-30 bg-alif-bg border-b border-black alif-sticky-header no-print">
        <header
          data-testid="app-header"
          className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2.5"
        >
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer select-none"
          >
            <AlifBrandMark size="md" testId="brand-logo-mark" />
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                data-testid="brand-wordmark"
                className="font-ubuntu text-xl tracking-tight text-alif-black font-medium lowercase leading-none"
              >
                alif.
              </span>
              <span className="text-xs text-alif-grey truncate">
                {settings.city || 'Sahibganj'} • Offline POS
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0 min-h-[32px]">
            {!isInitializing && metrics.outstandingInvoiceCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setInvoiceStatusPreset('Unpaid');
                  setActiveTab('invoices');
                }}
                data-testid="header-due-badge"
                className="btn-inline px-2 py-1 border border-alif-border bg-white hover:border-black text-xs font-mono font-semibold text-alif-black transition"
                title="View unpaid bills"
              >
                {metrics.outstandingInvoiceCount} due
              </button>
            ) : (
              <span
                data-testid="header-offline-pill"
                className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 border border-alif-border bg-white text-alif-grey"
              >
                Ready
              </span>
            )}
          </div>
        </header>

        {/* Top Navigation Bar — All 8 destinations accessible on 360px screens, + New Bill primary */}
        <nav
          aria-label="Primary Navigation"
          className="max-w-5xl mx-auto px-2.5 sm:px-6 py-1.5 border-t border-alif-border bg-white"
        >
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              if (item.isPrimary) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setPreselectedCustomer(null);
                      setActiveTab('create-bill');
                    }}
                    data-testid={`nav-${item.id}`}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap border transition min-h-[40px] ${
                      isActive
                        ? 'bg-alif-black text-white border-black'
                        : 'bg-alif-charcoal text-white border-black hover:bg-black'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'invoices') {
                      setInvoiceStatusPreset('All');
                    }
                    setActiveTab(item.id);
                  }}
                  data-testid={`nav-${item.id}`}
                  className={`px-2 py-1.5 text-xs sm:text-sm whitespace-nowrap border-b-2 transition min-h-[40px] ${
                    isActive
                      ? 'border-black text-alif-black font-semibold bg-stone-50'
                      : 'border-transparent text-alif-charcoal hover:text-alif-black hover:bg-stone-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Restrained Monochrome Status Toast (Non-obscuring top banner) */}
      {toast && (
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 pt-2.5 no-print">
          <div
            role="status"
            data-testid="toast-banner"
            className={`px-3.5 py-2.5 border text-sm font-medium flex items-center justify-between gap-3 alif-toast-enter ${
              toast.isError
                ? 'bg-alif-charcoal text-white border-black'
                : 'bg-alif-black text-white border-black'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="btn-inline text-zinc-300 hover:text-white font-semibold px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Database Error Notice */}
      {dbError && (
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 mt-3">
          <div className="bg-white border-2 border-black text-alif-black p-3.5 text-sm">
            Database Error: {dbError}
          </div>
        </div>
      )}

      {/* Main Content Area (12px horizontal padding on 360px mobile, 24px on desktop) */}
      <main className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 flex-1">
        {isInitializing ? (
          <div
            data-testid="app-splash-screen"
            className="bg-white border border-alif-border p-10 sm:p-12 text-center flex flex-col items-center justify-center space-y-4 my-4 alif-card-elevated"
          >
            <AlifBrandMark size="xl" testId="splash-logo-mark" />
            <div className="space-y-1">
              <div className="font-ubuntu text-2xl font-medium text-alif-black lowercase tracking-tight">
                alif.
              </div>
              <div className="text-xs font-medium text-alif-charcoal uppercase tracking-wider">
                Ladies Tailoring &amp; Boutique Finishing
              </div>
              <p className="text-xs text-alif-grey">
                Daal Kuan College Road, Sahibganj • Offline Ledger Ready
              </p>
            </div>
            <div className="alif-splash-progress" aria-hidden="true" />
          </div>
        ) : (
          <div key={activeTab} className="alif-view-enter">
            {activeTab === 'dashboard' && (
              <DashboardView
                metrics={metrics}
                onNavigate={(tab, statusFilter) => {
                  if (tab === 'invoices' && statusFilter) {
                    setInvoiceStatusPreset(statusFilter);
                  } else if (tab === 'invoices') {
                    setInvoiceStatusPreset('All');
                  }
                  if (tab === 'create-bill') {
                    setPreselectedCustomer(null);
                  }
                  setActiveTab(tab);
                }}
                onSelectInvoice={(inv) => {
                  setOpenModalInShareMode(false);
                  setSelectedInvoiceId(inv.id);
                }}
              />
            )}

            {activeTab === 'create-bill' && (
              <CreateBillView
                customers={customers}
                catalogue={catalogue}
                inventoryVariants={inventoryVariants}
                invoices={invoices}
                settings={settings}
                preselectedCustomer={preselectedCustomer}
                onNotify={showNotification}
                onBillCreated={async (created) => {
                  await refreshAllData();
                  setOpenModalInShareMode(false);
                  setSelectedInvoiceId(created.id);
                }}
              />
            )}

            {activeTab === 'invoices' && (
              <InvoicesHistoryView
                invoices={invoices}
                settings={settings}
                initialStatusFilter={invoiceStatusPreset}
                onSelectInvoice={(inv, openShare = false) => {
                  setOpenModalInShareMode(openShare);
                  setSelectedInvoiceId(inv.id);
                }}
                onNotify={showNotification}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryView
                variants={inventoryVariants}
                bundles={inventoryBundles}
                movements={inventoryMovements}
                onRefresh={refreshAllData}
                onNotify={showNotification}
              />
            )}

            {activeTab === 'customers' && (
              <CustomersView
                customers={customers}
                invoices={invoices}
                onRefresh={refreshAllData}
                onSelectInvoice={(inv) => {
                  setOpenModalInShareMode(false);
                  setSelectedInvoiceId(inv.id);
                }}
                onStartBillForCustomer={(cust) => {
                  setPreselectedCustomer(cust);
                  setActiveTab('create-bill');
                }}
                onNotify={showNotification}
              />
            )}

            {activeTab === 'catalogue' && (
              <CatalogueView
                catalogue={catalogue}
                inventoryVariants={inventoryVariants}
                onRefresh={refreshAllData}
                onNotify={showNotification}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                invoices={invoices}
                payments={payments}
                onNotify={showNotification}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsBackupView
                settings={settings}
                customers={customers}
                catalogue={catalogue}
                invoices={invoices}
                payments={payments}
                onRefreshAll={refreshAllData}
                onNotify={showNotification}
              />
            )}
          </div>
        )}
      </main>

      {/* Invoice Detail, Receipt & Payment Modal */}
      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          settings={settings}
          initialOpenSharePanel={openModalInShareMode}
          onClose={() => {
            setSelectedInvoiceId(null);
            setOpenModalInShareMode(false);
          }}
          onUpdated={refreshAllData}
          onNotify={showNotification}
        />
      )}
    </div>
  );
}
