import React, { useMemo, useState } from 'react';
import {
  InventoryBundle,
  InventoryMovement,
  InventoryVariant,
  StockStatus
} from '../types/billing';
import { formatINR, paiseToRupeesString, rupeesToPaise } from '../utils/currency';
import { formatStockQuantity, getVariantStockStatus } from '../utils/search';
import {
  adjustInventoryStock,
  receiveInventoryBundle,
  saveInventoryVariant
} from '../services/billingService';
import { StatusBadge } from './StatusBadge';

interface InventoryViewProps {
  variants: InventoryVariant[];
  bundles: InventoryBundle[];
  movements: InventoryMovement[];
  onRefresh: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function InventoryView({
  variants,
  bundles,
  movements,
  onRefresh,
  onNotify
}: InventoryViewProps) {
  const [subTab, setSubTab] = useState<'variants' | 'bundles' | 'movements'>('variants');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<StockStatus | 'All'>('All');

  // Modals
  const [isAddVariantOpen, setIsAddVariantOpen] = useState(false);
  const [isReceiveBundleOpen, setIsReceiveBundleOpen] = useState(false);
  const [isAdjustStockOpen, setIsAdjustStockOpen] = useState(false);

  // Form states - Add/Edit Variant
  const [editingVariant, setEditingVariant] = useState<InventoryVariant | null>(null);
  const [category, setCategory] = useState('Fabric');
  const [productType, setProductType] = useState('');
  const [workDesign, setWorkDesign] = useState('');
  const [color, setColor] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('m');
  const [purchaseCostRupees, setPurchaseCostRupees] = useState('');
  const [sellingPriceRupees, setSellingPriceRupees] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [initialQty, setInitialQty] = useState('');

  // Form states - Receive Bundle
  const [selectedVariantIdForReceive, setSelectedVariantIdForReceive] = useState('');
  const [bundleQty, setBundleQty] = useState('');
  const [bundleCode, setBundleCode] = useState('');
  const [bundleSupplier, setBundleSupplier] = useState('');
  const [bundleCostRupees, setBundleCostRupees] = useState('');
  const [bundleNotes, setBundleNotes] = useState('');

  // Form states - Adjust Stock
  const [selectedVariantIdForAdjust, setSelectedVariantIdForAdjust] = useState('');
  const [adjustQtyDelta, setAdjustQtyDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    variants.forEach((v) => {
      if (v.category) set.add(v.category);
    });
    return Array.from(set);
  }, [variants]);

  // Filtered variants
  const filteredVariants = useMemo(() => {
    return variants.filter((v) => {
      if (filterCategory !== 'All' && v.category !== filterCategory) return false;
      if (filterStatus !== 'All' && getVariantStockStatus(v) !== filterStatus) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = v.name.toLowerCase().includes(q);
        const matchesType = v.productType.toLowerCase().includes(q);
        const matchesColor = v.color.toLowerCase().includes(q);
        const matchesSku = v.sku.toLowerCase().includes(q);
        if (!matchesName && !matchesType && !matchesColor && !matchesSku) return false;
      }
      return true;
    });
  }, [variants, filterCategory, filterStatus, search]);

  // Variant lookup map
  const variantMap = useMemo(() => {
    const map = new Map<string, InventoryVariant>();
    variants.forEach((v) => map.set(v.id, v));
    return map;
  }, [variants]);

  // Quick stats
  const stats = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalValuePaise = 0;

    variants.forEach((v) => {
      const status = getVariantStockStatus(v);
      if (status === 'In Stock') inStock++;
      else if (status === 'Low Stock') lowStock++;
      else if (status === 'Out of Stock') outOfStock++;

      totalValuePaise += Math.round(v.totalQuantity * (v.purchaseCostPaise || 0));
    });

    return { inStock, lowStock, outOfStock, totalValuePaise };
  }, [variants]);

  function openCreateVariant() {
    setEditingVariant(null);
    setCategory('Fabric');
    setProductType('');
    setWorkDesign('');
    setColor('');
    setName('');
    setUnit('m');
    setPurchaseCostRupees('');
    setSellingPriceRupees('');
    setLowStockThreshold('5');
    setInitialQty('');
    setIsAddVariantOpen(true);
  }

  function openEditVariant(v: InventoryVariant) {
    setEditingVariant(v);
    setCategory(v.category);
    setProductType(v.productType);
    setWorkDesign(v.workDesign);
    setColor(v.color);
    setName(v.name);
    setUnit(v.unit);
    setPurchaseCostRupees(paiseToRupeesString(v.purchaseCostPaise || 0));
    setSellingPriceRupees(paiseToRupeesString(v.defaultSellingPricePaise || 0));
    setLowStockThreshold(String(v.lowStockThreshold));
    setInitialQty('');
    setIsAddVariantOpen(true);
  }

  async function handleSaveVariant(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveInventoryVariant({
        id: editingVariant?.id,
        category,
        productType,
        workDesign,
        color,
        name: name.trim() || undefined,
        unit,
        purchaseCostPaise: rupeesToPaise(purchaseCostRupees || '0'),
        defaultSellingPricePaise: rupeesToPaise(sellingPriceRupees || '0'),
        lowStockThreshold: Number(lowStockThreshold || 3),
        initialBundleQuantity: editingVariant ? undefined : Number(initialQty || 0)
      });
      onNotify(editingVariant ? 'Item variant updated' : 'New variant created successfully');
      setIsAddVariantOpen(false);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message || 'Error saving variant', true);
    }
  }

  async function handleReceiveBundle(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVariantIdForReceive) {
      onNotify('Select a fabric/product variant', true);
      return;
    }
    const qty = Number(bundleQty);
    if (!qty || qty <= 0) {
      onNotify('Quantity must be greater than 0', true);
      return;
    }

    try {
      await receiveInventoryBundle({
        variantId: selectedVariantIdForReceive,
        quantity: qty,
        bundleCode: bundleCode.trim() || undefined,
        supplier: bundleSupplier.trim() || undefined,
        purchaseCostPaise: bundleCostRupees ? rupeesToPaise(bundleCostRupees) : undefined,
        notes: bundleNotes.trim() || undefined
      });
      onNotify('Stock bundle received & recorded');
      setIsReceiveBundleOpen(false);
      setBundleQty('');
      setBundleCode('');
      setBundleSupplier('');
      setBundleCostRupees('');
      setBundleNotes('');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message || 'Error receiving bundle', true);
    }
  }

  async function handleAdjustStock(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVariantIdForAdjust) {
      onNotify('Select a variant', true);
      return;
    }
    const delta = Number(adjustQtyDelta);
    if (!delta || delta === 0) {
      onNotify('Adjustment quantity must be non-zero', true);
      return;
    }
    if (!adjustReason.trim()) {
      onNotify('Please specify an adjustment reason', true);
      return;
    }

    try {
      await adjustInventoryStock({
        variantId: selectedVariantIdForAdjust,
        quantityDelta: delta,
        reason: adjustReason.trim()
      });
      onNotify('Stock adjusted successfully');
      setIsAdjustStockOpen(false);
      setAdjustQtyDelta('');
      setAdjustReason('');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message || 'Error adjusting stock', true);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Physical Inventory</h2>
          <p className="text-sm text-slate-500">
            Track fabric rolls, bundles, FIFO stock deductions & low-stock alerts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedVariantIdForReceive(variants[0]?.id || '');
              setIsReceiveBundleOpen(true);
            }}
            className="px-3.5 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <span>+ Receive Stock (Bundle)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedVariantIdForAdjust(variants[0]?.id || '');
              setIsAdjustStockOpen(true);
            }}
            className="px-3.5 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors"
          >
            Adjust Stock
          </button>
          <button
            type="button"
            onClick={openCreateVariant}
            className="px-3.5 py-2 text-sm font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-colors"
          >
            + Add Variant
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Variants</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{variants.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">In Stock</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.inStock}</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Low Stock</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.lowStock}</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">Out of Stock</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{stats.outOfStock}</p>
        </div>
      </div>

      {/* Sub Tabs: Variants, Bundles, Movements */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          type="button"
          onClick={() => setSubTab('variants')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            subTab === 'variants'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Stock Items ({filteredVariants.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('bundles')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            subTab === 'bundles'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Bundles & Rolls ({bundles.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('movements')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
            subTab === 'movements'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Movement Log ({movements.length})
        </button>
      </div>

      {/* TAB 1: VARIANTS */}
      {subTab === 'variants' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search by name, colour, SKU or product type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900"
              />
            </div>
            {categories.length > 0 && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as StockStatus | 'All')}
              className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
            >
              <option value="All">All Stock Levels</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>

          {/* Variants Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Item / Fabric</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Colour / Design</th>
                    <th className="px-4 py-3 text-right">Selling Rate</th>
                    <th className="px-4 py-3 text-right">Available Stock</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVariants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        No inventory variants match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredVariants.map((v) => {
                      const status = getVariantStockStatus(v);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div>{v.name}</div>
                            <span className="text-xs text-slate-400 font-mono">{v.sku}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{v.category}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <span>{v.color}</span>
                            {v.workDesign && (
                              <span className="text-xs text-slate-400 block">{v.workDesign}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-900 font-medium">
                            {formatINR(v.defaultSellingPricePaise || 0)}/{v.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {formatStockQuantity(v.totalQuantity, v.unit)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                                status === 'In Stock'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : status === 'Low Stock'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openEditVariant(v)}
                              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BUNDLES / ROLLS */}
      {subTab === 'bundles' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="px-4 py-3">Bundle Code</th>
                  <th className="px-4 py-3">Variant / Fabric</th>
                  <th className="px-4 py-3">Received Date</th>
                  <th className="px-4 py-3 text-right">Initial Qty</th>
                  <th className="px-4 py-3 text-right">Remaining Qty</th>
                  <th className="px-4 py-3 text-right">Purchase Rate</th>
                  <th className="px-4 py-3">Supplier / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bundles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      No stock bundles recorded yet.
                    </td>
                  </tr>
                ) : (
                  bundles.map((b) => {
                    const variant = variantMap.get(b.variantId);
                    const isExhausted = b.remainingQuantity <= 0;
                    return (
                      <tr
                        key={b.id}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isExhausted ? 'opacity-60 bg-slate-50/30' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-slate-900">
                          {b.bundleCode}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {variant ? variant.name : b.variantId}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{b.receivedDate}</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatStockQuantity(b.initialQuantity, b.unit)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatStockQuantity(b.remainingQuantity, b.unit)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium">
                          {b.purchaseCostPaise ? formatINR(b.purchaseCostPaise) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {b.supplier ? <span className="font-semibold block">{b.supplier}</span> : null}
                          {b.notes || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MOVEMENT LOG */}
      {subTab === 'movements' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Variant</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const variant = variantMap.get(m.variantId);
                    const isPositive = m.quantityDelta > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                          {m.date || m.createdAt.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {variant ? variant.name : m.variantId}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                              m.type === 'receive'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.type === 'sale'
                                ? 'bg-blue-100 text-blue-800'
                                : m.type === 'cancel_restore'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${
                            isPositive ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {formatStockQuantity(m.quantityDelta, m.unit)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900 font-semibold">
                          {formatStockQuantity(m.balanceAfter, m.unit)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {m.reason}
                          {m.invoiceNumber && (
                            <span className="block font-mono text-slate-400">{m.invoiceNumber}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT VARIANT */}
      {isAddVariantOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              {editingVariant ? 'Edit Variant' : 'New Physical Variant'}
            </h3>
            <form onSubmit={handleSaveVariant} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Category *</label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Fabric, Lace, Latkan"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Product Type *</label>
                  <input
                    type="text"
                    required
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    placeholder="e.g. Fandy Silk, Velvet"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Colour *</label>
                  <input
                    type="text"
                    required
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. Green, Red, Black"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Work / Design</label>
                  <input
                    type="text"
                    value={workDesign}
                    onChange={(e) => setWorkDesign(e.target.value)}
                    placeholder="e.g. All-over Work, Plain"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  >
                    <option value="m">m (meter)</option>
                    <option value="pc">pc (pieces)</option>
                    <option value="set">set</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cost (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchaseCostRupees}
                    onChange={(e) => setPurchaseCostRupees(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Selling (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={sellingPriceRupees}
                    onChange={(e) => setSellingPriceRupees(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Low Stock Alert Qty
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                {!editingVariant && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Opening Stock Qty
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={initialQty}
                      onChange={(e) => setInitialQty(e.target.value)}
                      placeholder="e.g. 25"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddVariantOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                >
                  Save Variant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECEIVE BUNDLE */}
      {isReceiveBundleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">+ Receive Stock Bundle / Roll</h3>
            <form onSubmit={handleReceiveBundle} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Variant *</label>
                <select
                  required
                  value={selectedVariantIdForReceive}
                  onChange={(e) => setSelectedVariantIdForReceive(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                >
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Quantity Received *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={bundleQty}
                    onChange={(e) => setBundleQty(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Bundle / Roll Code
                  </label>
                  <input
                    type="text"
                    value={bundleCode}
                    onChange={(e) => setBundleCode(e.target.value)}
                    placeholder="Auto if blank"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cost Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={bundleCostRupees}
                    onChange={(e) => setBundleCostRupees(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={bundleSupplier}
                    onChange={(e) => setBundleSupplier(e.target.value)}
                    placeholder="Supplier Name"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={bundleNotes}
                  onChange={(e) => setBundleNotes(e.target.value)}
                  placeholder="e.g. Lot #4, premium finish"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsReceiveBundleOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Receive Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADJUST STOCK */}
      {isAdjustStockOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Manual Stock Adjustment</h3>
            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Variant *</label>
                <select
                  required
                  value={selectedVariantIdForAdjust}
                  onChange={(e) => setSelectedVariantIdForAdjust(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                >
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} (Current: {formatStockQuantity(v.totalQuantity, v.unit)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Quantity Delta (+ or -) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjustQtyDelta}
                  onChange={(e) => setAdjustQtyDelta(e.target.value)}
                  placeholder="e.g. -1.5 for damage, or 5 to add"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                />
                <span className="text-xs text-slate-400 mt-1 block">
                  Use negative number to write off damaged/wasted fabric.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reason *</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Damaged piece cut, audit discrepancy"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAdjustStockOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
