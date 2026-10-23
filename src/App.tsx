import React, { useEffect, useState } from 'react';
import {
  CatalogueItem,
  Customer,
  DashboardMetrics,
  Invoice,
  PaymentRecord,
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
  listInvoices
} from './services/billingService';
import { DashboardView, NavTab } from './components/DashboardView';
import { CreateBillView } from './components/CreateBillView';
import { InvoicesHistoryView } from './components/InvoicesHistoryView';
import { CustomersView } from './components/CustomersView';
import { CatalogueView } from './components/CatalogueView';
import { ReportsView } from './components/ReportsView';
import { SettingsBackupView } from './components/SettingsBackupView';
import { InvoiceDetailModal } from './components/InvoiceDetailModal';

const NAV_ITEMS: { id: NavTab; label: string; shortLabel: string }[] = [
  { id: 'dashboard', label: 'Overview', shortLabel: 'Home' },
  { id: 'create-bill', label: '+ New Bill', shortLabel: '+ Bill' },
  { id: 'invoices', label: 'Invoices', shortLabel: 'Bills' },
  { id: 'customers', label: 'Clients', shortLabel: 'Clients' },
  { id: 'catalogue', label: 'Catalogue', shortLabel: 'Items' },
  { id: 'reports', label: 'Reports', shortLabel: 'Reports' },
  { id: 'settings', label: 'Settings', shortLabel: 'Shop' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
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
  const [preselectedCustomer, setPreselectedCustomer] = useState<Customer | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
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
      const [s, custs, cats, invs, pays, dash] = await Promise.all([
        getShopSettings(),
        listCustomers(),
        listCatalogue(),
        listInvoices(),
        db.payments.toArray(),
        getDashboardMetrics()
      ]);
      setSettings(s);
      setCustomers(custs);
      setCatalogue(cats);
      setInvoices(invs);
      setPayments(pays);
      setMetrics(dash);
      setDbError(null);
    } catch (err: any) {
      setDbError(err?.message || 'Database initialization error');
    }
  }

  useEffect(() => {
    refreshAllData();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-alif-bg text-alif-charcoal flex flex-col pb-20 md:pb-10">
      {/* Editorial Minimalist Masthead */}
      <header className="sticky top-0 z-30 bg-alif-bg border-b border-black no-print">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-baseline gap-3 cursor-pointer min-w-0"
          >
            <span className="font-serif text-lg sm:text-xl tracking-[0.25em] uppercase text-alif-black font-normal shrink-0">
              ALiF
            </span>
            <div className="min-w-0">
              <h1 className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-alif-charcoal font-medium truncate">
                {settings.shopName}
              </h1>
              <p className="text-[9px] uppercase tracking-[0.15em] text-alif-grey truncate">
                {settings.city}, {settings.state} • INR (₹)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span
              data-testid="status-offline-badge"
              className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] border border-alif-border text-alif-grey bg-white"
            >
              {isOnline ? 'Offline-Ready' : 'Offline Mode'}
            </span>
            <button
              type="button"
              onClick={() => {
                setPreselectedCustomer(null);
                setActiveTab('create-bill');
              }}
              data-testid="header-new-bill-btn"
              className="px-3.5 py-2 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800 transition"
            >
              + New Bill
            </button>
          </div>
        </div>

        {/* Minimalist Hairline Navigation Bar */}
        <nav
          aria-label="Primary Navigation"
          className="max-w-5xl mx-auto px-4 sm:px-6 border-t border-alif-border overflow-x-auto bg-white"
        >
          <div className="flex items-center gap-1 sm:gap-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                data-testid={`nav-${item.id}`}
                className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.16em] whitespace-nowrap border-b-2 transition ${
                  activeTab === item.id
                    ? 'border-black text-alif-black font-semibold'
                    : 'border-transparent text-alif-grey hover:text-alif-black'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Restrained Monochrome Status Toast */}
      {toast && (
        <div className="fixed bottom-14 md:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 no-print">
          <div
            role="status"
            data-testid="toast-banner"
            className={`px-4 py-3 border text-[11px] uppercase tracking-[0.12em] font-medium flex items-center justify-between gap-3 ${
              toast.isError
                ? 'bg-alif-charcoal text-white border-black'
                : 'bg-alif-black text-white border-black'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-zinc-300 hover:text-white font-semibold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Database Error Notice */}
      {dbError && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 mt-4">
          <div className="bg-white border border-black text-alif-black p-3 text-xs uppercase tracking-wider">
            Database Error: {dbError}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex-1">
        {activeTab === 'dashboard' && (
          <DashboardView
            metrics={metrics}
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectInvoice={(inv) => setSelectedInvoiceId(inv.id)}
          />
        )}

        {activeTab === 'create-bill' && (
          <CreateBillView
            customers={customers}
            catalogue={catalogue}
            settings={settings}
            preselectedCustomer={preselectedCustomer}
            onNotify={showNotification}
            onBillCreated={async (created) => {
              await refreshAllData();
              setSelectedInvoiceId(created.id);
            }}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesHistoryView
            invoices={invoices}
            settings={settings}
            onSelectInvoice={(inv) => setSelectedInvoiceId(inv.id)}
            onNotify={showNotification}
          />
        )}

        {activeTab === 'customers' && (
          <CustomersView
            customers={customers}
            invoices={invoices}
            onRefresh={refreshAllData}
            onSelectInvoice={(inv) => setSelectedInvoiceId(inv.id)}
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

      {/* Mobile Bottom Navigation Bar (360px–430px One-Handed Reach) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-black no-print"
      >
        <div className="grid grid-cols-7 h-12 divide-x">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center text-[9px] uppercase tracking-[0.08em] font-semibold px-0.5 transition ${
                activeTab === item.id
                  ? 'bg-alif-black text-white'
                  : 'text-alif-charcoal hover:bg-alif-muted'
              }`}
            >
              <span className="truncate w-full text-center">{item.shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Invoice Detail, Receipt & Payment Modal */}
      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          settings={settings}
          onClose={() => setSelectedInvoiceId(null)}
          onUpdated={refreshAllData}
          onNotify={showNotification}
        />
      )}
    </div>
  );
}
