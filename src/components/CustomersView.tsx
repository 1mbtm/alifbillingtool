import React, { useMemo, useState } from 'react';
import { Customer, Invoice } from '../types/billing';
import { formatINR } from '../utils/currency';
import { saveCustomer } from '../services/billingService';
import { StatusBadge } from './StatusBadge';

interface CustomersViewProps {
  customers: Customer[];
  invoices: Invoice[];
  onRefresh: () => void;
  onSelectInvoice: (invoice: Invoice) => void;
  onStartBillForCustomer: (customer: Customer) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function CustomersView({
  customers,
  invoices,
  onRefresh,
  onSelectInvoice,
  onStartBillForCustomer,
  onNotify
}: CustomersViewProps) {
  const [search, setSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedHistoryCustomerId, setSelectedHistoryCustomerId] = useState<string | null>(
    null
  );

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.notes && c.notes.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      { count: number; billedPaise: number; paidPaise: number; balancePaise: number }
    >();
    for (const inv of invoices) {
      const cur = map.get(inv.customerId) || {
        count: 0,
        billedPaise: 0,
        paidPaise: 0,
        balancePaise: 0
      };
      cur.count++;
      if (inv.status !== 'Cancelled') {
        cur.billedPaise += inv.totalPaise;
        cur.balancePaise += inv.balancePaise;
      }
      cur.paidPaise += inv.paidPaise;
      map.set(inv.customerId, cur);
    }
    return map;
  }, [invoices]);

  function startEdit(c: Customer) {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setNotes(c.notes || '');
  }

  function resetForm() {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setNotes('');
  }

  async function handleSaveCustomer(e: React.FormEvent) {
    e.preventDefault();
    try {
      const saved = await saveCustomer({
        id: editingCustomer?.id,
        name,
        phone,
        notes
      });
      resetForm();
      onRefresh();
      onNotify(`Saved customer ${saved.name}`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to save customer', true);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === selectedHistoryCustomerId);
  const selectedCustomerInvoices = useMemo(() => {
    if (!selectedHistoryCustomerId) return [];
    return invoices
      .filter((inv) => inv.customerId === selectedHistoryCustomerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices, selectedHistoryCustomerId]);

  return (
    <div className="space-y-8">
      {/* Add / Edit Client Form */}
      <form
        onSubmit={handleSaveCustomer}
        className="border-b border-black pb-6 space-y-4"
      >
        <div className="flex items-baseline justify-between">
          <div>
            <div className="editorial-label">Client Book</div>
            <h2 className="font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5">
              {editingCustomer ? `Edit Client: ${editingCustomer.name}` : 'Register Client'}
            </h2>
          </div>
          {editingCustomer && (
            <button
              type="button"
              onClick={resetForm}
              className="text-[10px] font-semibold uppercase tracking-widest text-alif-grey underline"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block editorial-label mb-1">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="cust-form-name"
              className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Phone Number *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="cust-form-phone"
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="cust-form-notes"
              className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            data-testid="btn-save-customer"
            className="px-5 py-2.5 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
          >
            {editingCustomer ? 'Update Customer' : '+ Save Customer'}
          </button>
        </div>
      </form>

      {/* Client Directory List */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-alif-border pb-3">
          <div>
            <h3 className="editorial-subhead">
              Client Directory ({filteredCustomers.length})
            </h3>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search customers"
            data-testid="input-search-customers"
            className="px-3 py-2 text-xs border border-alif-border bg-white w-full sm:w-64"
          />
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center border border-alif-border bg-white text-xs uppercase tracking-wider text-alif-grey">
            No clients found. Add a client above or create a new bill.
          </div>
        ) : (
          <div className="bg-white border border-alif-border divide-y">
            {filteredCustomers.map((c) => {
              const st = customerStats.get(c.id) || {
                count: 0,
                billedPaise: 0,
                paidPaise: 0,
                balancePaise: 0
              };
              const isSelected = selectedHistoryCustomerId === c.id;
              return (
                <div key={c.id} className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-alif-black">
                        {c.name}{' '}
                        <span className="font-mono text-xs text-alif-grey ml-1.5">
                          {c.phone}
                        </span>
                      </div>
                      {c.notes && (
                        <div className="text-xs text-alif-grey">{c.notes}</div>
                      )}
                      <div className="flex flex-wrap gap-4 text-[11px] font-mono text-alif-grey pt-0.5">
                        <span>Bills: {st.count}</span>
                        <span>Billed: {formatINR(st.billedPaise)}</span>
                        <span>Paid: {formatINR(st.paidPaise)}</span>
                        {st.balancePaise > 0 && (
                          <span className="font-semibold text-alif-black">
                            Due: {formatINR(st.balancePaise)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onStartBillForCustomer(c)}
                        className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] bg-alif-black text-white hover:bg-zinc-800"
                      >
                        + New Bill
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedHistoryCustomerId(isSelected ? null : c.id)
                        }
                        data-testid={`btn-history-${c.phone}`}
                        className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
                      >
                        {isSelected ? 'Hide History' : `History (${st.count})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {isSelected && selectedCustomer && (
                    <div className="bg-stone-50 border border-alif-border p-3 space-y-2">
                      <div className="editorial-label">
                        Invoice Ledger — {selectedCustomer.name}
                      </div>
                      {selectedCustomerInvoices.length === 0 ? (
                        <div className="text-xs text-alif-grey">
                          No bills recorded for this client yet.
                        </div>
                      ) : (
                        <div className="divide-y bg-white border border-alif-border">
                          {selectedCustomerInvoices.map((inv) => (
                            <div
                              key={inv.id}
                              onClick={() => onSelectInvoice(inv)}
                              className="p-2.5 flex items-center justify-between text-xs hover:bg-stone-50 cursor-pointer"
                            >
                              <div>
                                <span className="font-mono font-semibold text-alif-black">
                                  {inv.invoiceNumber}
                                </span>{' '}
                                <span className="font-mono text-alif-grey mx-1">
                                  {inv.invoiceDate}
                                </span>{' '}
                                <StatusBadge status={inv.status} />
                                <div className="text-alif-grey mt-0.5">
                                  {inv.items.map((i) => `${i.name} ×${i.quantity}`).join(' / ')}
                                </div>
                              </div>
                              <div className="text-right font-mono">
                                <div className="font-semibold text-alif-black">
                                  {formatINR(inv.totalPaise)}
                                </div>
                                {inv.balancePaise > 0 && inv.status !== 'Cancelled' && (
                                  <div className="text-[11px] text-alif-charcoal">
                                    Due {formatINR(inv.balancePaise)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
