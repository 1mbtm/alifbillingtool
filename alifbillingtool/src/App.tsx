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
import {
  DEFAULT_CATALOGUE_ITEMS,
  DEFAULT_INVENTORY_BUNDLES,
  DEFAULT_INVENTORY_MOVEMENTS,
  DEFAULT_INVENTORY_VARIANTS,
  DEFAULT_SHOP_SETTINGS
} from './db/seed';
import { db } from './db/database';
import {
  computeDashboardMetricsFromData,
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

const PRIMARY_NAV_ITEMS: { id: NavTab; label: string; isPrimary?: boolean }[] = [
  { id: 'create-bill', label: '+ New Bill', isPrimary: true },
  { id: 'invoices', label: 'Invoices' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customers', label: 'Clients' }
];

const SECONDARY_NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' }
];

function readSyncBootStore<T>(storeName: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    if (!window.localStorage) return fallback;
    const raw =
      window.localStorage.getItem(`__alif_idb_ALIFBillingDB_${storeName}`) ||
      window.localStorage.getItem(`__alif_idb_alif_ladies_tailor_db_${storeName}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
    const items: T[] = [];
    for (const entry of parsed) {
      const val = Array.isArray(entry) && entry.length === 2 ? entry[1] : entry;
      if (val && typeof val === 'object') items.push(val as T);
    }
    return items.length > 0 ? items : fallback;
  } catch (_e) {
    return fallback;
  }
}

export default function App() {
  // Billing-First: Open directly on New Bill ('create-bill') with instant synchronous initial state
  const [activeTab, setActiveTab] = useState<NavTab>('create-bill');
  const [isMoreNavOpen, setIsMoreNavOpen] = useState<boolean>(false);
  const [invoiceStatusPreset, setInvoiceStatusPreset] = useState<PaymentStatus | 'All'>('All');
  const [settings, setSettings] = useState<ShopSettings>(() => {
    const saved = readSyncBootStore<ShopSettings>('settings', []);
    return saved.find((s) => s.id === 'default') || DEFAULT_SHOP_SETTINGS;
  });
  const [customers, setCustomers] = useState<Customer[]>(() =>
    readSyncBootStore<Customer>('customers', [])
  );
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>(() =>
    readSyncBootStore<CatalogueItem>('catalogue', DEFAULT_CATALOGUE_ITEMS)
  );
  const [inventoryVariants, setInventoryVariants] = useState<InventoryVariant[]>(() =>
    readSyncBootStore<InventoryVariant>('inventoryVariants', DEFAULT_INVENTORY_VARIANTS)
  );
  const [inventoryBundles, setInventoryBundles] = useState<InventoryBundle[]>(() =>
    readSyncBootStore<InventoryBundle>('inventoryBundles', DEFAULT_INVENTORY_BUNDLES)
  );
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(() =>
    readSyncBootStore<InventoryMovement>('inventoryMovements', DEFAULT_INVENTORY_MOVEMENTS)
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    readSyncBootStore<Invoice>('invoices', [])
  );
  const [payments, setPayments] = useState<PaymentRecord[]>(() =>
    readSyncBootStore<PaymentRecord>('payments', [])
  );
  const [metrics, setMetrics] = useState<DashboardMetrics>(() =>
    computeDashboardMetricsFromData(
      readSyncBootStore<Invoice>('invoices', []),
      readSyncBootStore<PaymentRecord>('payments', []),
      readSyncBootStore<InventoryVariant>('inventoryVariants', DEFAULT_INVENTORY_VARIANTS),
      getTodayIsoDate()
    )
  );

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [openModalInShareMode, setOpenModalInShareMode] = useState<boolean>(false);
  const [preselectedCustomer, setPreselectedCustomer] = useState<Customer | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

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
      const [s, custs, cats, invVars, invBnds, invMovs, invs, pays] = await Promise.all([
        db.settings.get('default'),
        listCustomers('', db),
        listCatalogue({}, db),
        listInventoryVariants({}, db),
        listInventoryBundles(undefined, db),
        listInventoryMovements(undefined, db),
        listInvoices({}, db),
        db.payments.toArray()
      ]);
      const resolvedSettings = s || DEFAULT_SHOP_SETTINGS;
      setSettings(resolvedSettings);
      setCustomers(custs);
      setCatalogue(cats);
      setInventoryVariants(invVars);
      setInventoryBundles(invBnds);
      setInventoryMovements(invMovs);
      setInvoices(invs);
      setPayments(pays);
      setMetrics(computeDashboardMetricsFromData(invs, pays, invVars, getTodayIsoDate()));
      setDbError(null);
    } catch (err: any) {
      setDbError(err?.message || 'Database initialization error');
    }
  }

  useEffect(() => {
    refreshAllData();
  }, []);

  const activeSecondaryItem = SECONDARY_NAV_ITEMS.find((item) => item.id === activeTab);

  return (
    <div className="min-h-screen bg-alif-bg text-alif-charcoal flex flex-col pb-8 md:pb-10">
      {/* P1: Consolidated Sticky Top Header & Single-Row Primary Navigation (No Bottom Nav) */}
      <div className="sticky top-0 z-30 bg-alif-bg border-b border-alif-border alif-sticky-header no-print">
        <header
          data-testid="app-header"
          className="max-w-5xl mx-auto px-3 sm:px-6 h-12 flex items-center justify-between gap-2"
        >
          <div
            onClick={() => {
              setIsMoreNavOpen(false);
              setActiveTab('create-bill');
            }}
            className="flex items-center gap-2 min-w-0 cursor-pointer select-none"
          >
            <AlifBrandMark size="sm" testId="brand-logo-mark" />
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

          <div className="flex items-center justify-end gap-2 shrink-0 min-h-[28px]">
            {metrics.outstandingInvoiceCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setIsMoreNavOpen(false);
                  setInvoiceStatusPreset('Unpaid');
                  setActiveTab('invoices');
                }}
                data-testid="header-due-badge"
                className="btn-inline px-2 py-0.5 border text-xs font-mono font-semibold status-pill-danger"
                title="View unpaid bills"
              >
                {metrics.outstandingInvoiceCount} due
              </button>
            ) : (
              <span
                data-testid="header-offline-pill"
                className="text-[11px] font-mono px-2 py-0.5 border status-pill-success"
              >
                Offline Ready
              </span>
            )}
          </div>
        </header>

        {/* P1: 4 Primary Tabs (+ New Bill, Invoices, Inventory, Clients) + More Menu in a Single Row */}
        <nav
          aria-label="Primary Navigation"
          className="max-w-5xl mx-auto px-2 sm:px-6 py-1 border-t border-alif-border bg-white"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                if (item.isPrimary) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPreselectedCustomer(null);
                        setIsMoreNavOpen(false);
                        setActiveTab('create-bill');
                      }}
                      data-testid={`nav-${item.id}`}
                      className={`px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap border min-h-[38px] ${
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
                      setIsMoreNavOpen(false);
                      setActiveTab(item.id);
                    }}
                    data-testid={`nav-${item.id}`}
                    className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap border-b-2 min-h-[38px] ${
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

            {/* More Menu Toggle for Secondary Sections (Overview, Catalogue, Reports, Settings) */}
            <button
              type="button"
              onClick={() => setIsMoreNavOpen((prev) => !prev)}
              aria-expanded={isMoreNavOpen}
              data-testid="nav-more-toggle"
              className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap border min-h-[38px] shrink-0 ${
                activeSecondaryItem || isMoreNavOpen
                  ? 'border-black text-alif-black font-semibold bg-stone-50'
                  : 'border-alif-border text-alif-charcoal bg-white hover:border-black'
              }`}
            >
              {activeSecondaryItem ? `${activeSecondaryItem.label} ▾` : 'More ▾'}
            </button>
          </div>

          {/* Secondary Navigation Drawer (Mounted in DOM for instant switching & test accessibility) */}
          <div
            data-testid="nav-more-menu"
            className={
              isMoreNavOpen
                ? 'grid grid-cols-4 gap-1 pt-1.5 mt-1 border-t border-alif-border bg-stone-50 p-1'
                : 'hidden'
            }
          >
            {SECONDARY_NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setIsMoreNavOpen(false);
                    setActiveTab(item.id);
                  }}
                  data-testid={`nav-${item.id}`}
                  className={`px-2 py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap border min-h-[36px] ${
                    isActive
                      ? 'bg-alif-black text-white border-black font-semibold'
                      : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Status Toast Banner */}
      {toast && (
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 pt-2.5 no-print">
          <div
            role="status"
            data-testid="toast-banner"
            className={`px-3.5 py-2.5 border text-sm font-medium flex items-center justify-between gap-3 ${
              toast.isError
                ? 'status-pill-danger'
                : 'bg-alif-black text-white border-black'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="btn-inline opacity-80 hover:opacity-100 font-semibold px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Database Error Notice */}
      {dbError && (
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 mt-3">
          <div className="status-pill-danger border p-3.5 text-sm">
            Database Error: {dbError}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-3.5 sm:py-5 flex-1">
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
              setIsMoreNavOpen(false);
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
              setIsMoreNavOpen(false);
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
