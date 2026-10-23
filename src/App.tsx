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

const NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'create-bill', label: '+ New Bill' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'customers', label: 'Clients' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' }
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
  }, []);

  return (
    <div className="min-h-screen bg-alif-bg text-alif-charcoal flex flex-col pb-8 md:pb-10">
      {/* Sticky Top Header & Navigation */}
      <div className="sticky top-0 z-30 bg-alif-bg border-b border-black no-print">
        <header
          data-testid="app-header"
          className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center"
        >
          <span
            onClick={() => setActiveTab('dashboard')}
            data-testid="brand-wordmark"
            className="font-ubuntu text-xl tracking-tight text-alif-black font-medium lowercase cursor-pointer"
          >
            alif.
          </span>
        </header>

        {/* Top Navigation Bar (Preserved Separately) */}
        <nav
          aria-label="Primary Navigation"
          className="max-w-5xl mx-auto px-4 sm:px-6 border-t border-alif-border overflow-x-auto bg-white"
        >
          <div className="flex items-center gap-1 sm:gap-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'create-bill') {
                    setPreselectedCustomer(null);
                  }
                  setActiveTab(item.id);
                }}
                data-testid={`nav-${item.id}`}
                className={`px-3.5 py-2.5 text-sm whitespace-nowrap border-b-2 transition min-h-[44px] ${
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
      </div>

      {/* Restrained Monochrome Status Toast (Non-obscuring top banner) */}
      {toast && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 pt-3 no-print">
          <div
            role="status"
            data-testid="toast-banner"
            className={`px-4 py-2.5 border text-sm font-medium flex items-center justify-between gap-3 ${
              toast.isError
                ? 'bg-alif-charcoal text-white border-black'
                : 'bg-alif-black text-white border-black'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-zinc-300 hover:text-white font-semibold px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Database Error Notice */}
      {dbError && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 mt-4">
          <div className="bg-white border border-black text-alif-black p-4 text-sm">
            Database Error: {dbError}
          </div>
        </div>
      )}

      {/* Main Content Area (18px horizontal padding on mobile, 24px on desktop) */}
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
