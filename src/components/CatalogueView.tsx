import React, { useMemo, useState } from 'react';
import { CatalogueCategory, CatalogueItem, InventoryVariant } from '../types/billing';
import { formatINR, paiseToRupeesString, rupeesToPaise } from '../utils/currency';
import { formatStockQuantity, searchCatalogueItems } from '../utils/search';
import {
  resetDefaultCatalogue,
  saveCatalogueItem,
  toggleCatalogueItemPin
} from '../services/billingService';
import { ConfirmDialog } from './StatusBadge';

interface CatalogueViewProps {
  catalogue: CatalogueItem[];
  inventoryVariants?: InventoryVariant[];
  onRefresh: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function CatalogueView({
  catalogue,
  inventoryVariants = [],
  onRefresh,
  onNotify
}: CatalogueViewProps) {
  const [filterCat, setFilterCat] = useState<CatalogueCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  const [editingItem, setEditingItem] = useState<CatalogueItem | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CatalogueCategory>('service');
  const [defaultPriceRupees, setDefaultPriceRupees] = useState('');
  const [minPriceRupees, setMinPriceRupees] = useState('');
  const [maxPriceRupees, setMaxPriceRupees] = useState('');
  const [costPriceRupees, setCostPriceRupees] = useState('');
  const [unit, setUnit] = useState('pc');
  const [description, setDescription] = useState('');
  const [inventoryVariantId, setInventoryVariantId] = useState<string>('');
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isActive, setIsActive] = useState(true);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const variantsMap = useMemo(() => {
    const map: Record<string, InventoryVariant> = {};
    for (const v of inventoryVariants) map[v.id] = v;
    return map;
  }, [inventoryVariants]);

  const filtered = useMemo(() => {
    const base = catalogue.filter((item) => {
      if (filterCat !== 'all' && item.category !== filterCat) return false;
      return true;
    });
    return searchCatalogueItems(base, variantsMap, search).map((r) => r.item);
  }, [catalogue, variantsMap, filterCat, search]);

  function startEdit(item: CatalogueItem) {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category);
    setDefaultPriceRupees(paiseToRupeesString(item.defaultPricePaise));
    setMinPriceRupees(
      item.minPricePaise !== undefined ? paiseToRupeesString(item.minPricePaise) : ''
    );
    setMaxPriceRupees(
      item.maxPricePaise !== undefined ? paiseToRupeesString(item.maxPricePaise) : ''
    );
    setCostPriceRupees(
      item.costPricePaise !== undefined ? paiseToRupeesString(item.costPricePaise) : ''
    );
    setUnit(item.unit);
    setDescription(item.description || '');
    setInventoryVariantId(item.inventoryVariantId || '');
    setIsPinned(Boolean(item.isPinned));
    setIsActive(item.isActive);
    setIsFormOpen(true);
  }

  function resetForm() {
    setEditingItem(null);
    setName('');
    setCategory('service');
    setDefaultPriceRupees('');
    setMinPriceRupees('');
    setMaxPriceRupees('');
    setCostPriceRupees('');
    setUnit('pc');
    setDescription('');
    setInventoryVariantId('');
    setIsPinned(false);
    setIsActive(true);
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    try {
      const defaultPricePaise = rupeesToPaise(defaultPriceRupees || '0');
      const minPricePaise = minPriceRupees.trim()
        ? rupeesToPaise(minPriceRupees)
        : undefined;
      const maxPricePaise = maxPriceRupees.trim()
        ? rupeesToPaise(maxPriceRupees)
        : undefined;
      const costPricePaise = costPriceRupees.trim()
        ? rupeesToPaise(costPriceRupees)
        : undefined;

      const linkedVar =
        category !== 'service' && inventoryVariantId
          ? variantsMap[inventoryVariantId]
          : undefined;

      const saved = await saveCatalogueItem({
        id: editingItem?.id,
        name,
        category,
        defaultPricePaise,
        minPricePaise,
        maxPricePaise,
        costPricePaise,
        unit: linkedVar ? linkedVar.unit : unit,
        description,
        inventoryVariantId: category === 'service' ? null : inventoryVariantId || null,
        productType: linkedVar?.productType,
        workDesign: linkedVar?.workDesign,
        color: linkedVar?.color,
        isPinned,
        isActive
      });
      resetForm();
      setIsFormOpen(false);
      onRefresh();
      onNotify(`Saved catalogue item "${saved.name}" (${formatINR(saved.defaultPricePaise)})`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to save catalogue item', true);
    }
  }

  async function handleToggleActive(item: CatalogueItem) {
    try {
      await saveCatalogueItem({
        ...item,
        isActive: !item.isActive
      });
      onRefresh();
      onNotify(`${item.name} marked as ${!item.isActive ? 'Active' : 'Inactive'}`);
    } catch (err: any) {
      onNotify(err?.message || 'Failed to update item', true);
    }
  }

  async function handleTogglePin(item: CatalogueItem) {
    try {
      const updated = await toggleCatalogueItemPin(item.id, !item.isPinned);
      onRefresh();
      onNotify(
        `${updated.name} ${updated.isPinned ? 'pinned to' : 'unpinned from'} Frequently Used`
      );
    } catch (err: any) {
      onNotify(err?.message || 'Failed to toggle pin', true);
    }
  }

  const showForm = isFormOpen || Boolean(editingItem);

  return (
    <div className="space-y-6">
      {/* Header & Collapsible Add / Edit Catalogue Item Form */}
      <section className="bg-white border border-alif-border p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="editorial-label">Atelier Catalogue</div>
            <h2 className="editorial-heading mt-0.5">
              {editingItem
                ? `Edit Item: ${editingItem.name}`
                : `Catalogue & Services (${catalogue.length})`}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {editingItem && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFormOpen((prev) => !prev)}
              aria-expanded={showForm}
              className="px-3.5 py-2 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white hover:bg-zinc-800 min-h-[40px]"
            >
              {showForm ? 'Hide Editor ▲' : '+ Add Catalogue Item'}
            </button>
          </div>
        </div>

        {/* Form stays mounted in DOM so test hooks and entered values are preserved */}
        <form
          onSubmit={handleSaveItem}
          className={showForm ? 'border-t border-alif-border pt-4 space-y-3.5' : 'hidden'}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block editorial-label mb-1">
                Item / Service Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Astar Blouse"
                data-testid="cat-form-name"
                className="w-full px-3 py-2 text-base bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:col-span-2">
              <div>
                <label className="block editorial-label mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CatalogueCategory)}
                  data-testid="cat-form-category"
                  className="w-full px-3 py-2 text-base bg-white"
                >
                  <option value="service">Tailoring Service</option>
                  <option value="product">Product / Material</option>
                  <option value="custom">Custom Item</option>
                </select>
              </div>

              <div>
                <label className="block editorial-label mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  data-testid="cat-form-unit"
                  className="w-full px-3 py-2 text-base bg-white"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block editorial-label mb-1">Rate (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={defaultPriceRupees}
                onChange={(e) => setDefaultPriceRupees(e.target.value)}
                data-testid="cat-form-price"
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">Min Rate (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={minPriceRupees}
                onChange={(e) => setMinPriceRupees(e.target.value)}
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">Max Rate (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={maxPriceRupees}
                onChange={(e) => setMaxPriceRupees(e.target.value)}
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">Cost Price (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={costPriceRupees}
                onChange={(e) => setCostPriceRupees(e.target.value)}
                data-testid="cat-form-cost"
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>
          </div>

          {category !== 'service' && inventoryVariants.length > 0 && (
            <div>
              <label className="block editorial-label mb-1">
                Linked Inventory Stock Variant (Optional — Deducts FIFO stock on bill save)
              </label>
              <select
                value={inventoryVariantId}
                onChange={(e) => setInventoryVariantId(e.target.value)}
                data-testid="cat-form-inventory-variant"
                className="w-full px-3 py-2 text-sm font-mono bg-white"
              >
                <option value="">Non-Stock Item (Do not deduct inventory)</option>
                {inventoryVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category} → {v.productType} → {v.workDesign} → {v.color}) — Avail:{' '}
                    {formatStockQuantity(v.totalQuantity, v.unit)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <label className="block editorial-label mb-1">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Stitching details or fabric notes"
                className="w-full px-3 py-2 text-base bg-white"
              />
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-alif-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                />
                Pin Favourite
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-alif-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
              <button
                type="submit"
                data-testid="btn-save-catalogue"
                className="px-5 py-2.5 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800"
              >
                {editingItem ? 'Update Item' : '+ Add to Catalogue'}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Catalogue List Section */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'service', 'product', 'custom'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider border font-semibold min-h-[40px] ${
                  filterCat === cat
                    ? 'bg-alif-black text-white border-black'
                    : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                }`}
              >
                {cat === 'all'
                  ? `All (${catalogue.length})`
                  : cat === 'service'
                  ? 'Tailoring Services'
                  : cat === 'product'
                  ? 'Materials'
                  : 'Custom'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              aria-label="Search catalogue"
              className="flex-1 sm:w-56 px-3 py-1.5 text-base bg-white"
            />
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black shrink-0 min-h-[40px]"
            >
              Restore Defaults
            </button>
          </div>
        </div>

        <div className="bg-white border border-alif-border divide-y">
          {filtered.map((item) => {
            const linkedVar = item.inventoryVariantId
              ? variantsMap[item.inventoryVariantId]
              : undefined;
            return (
              <div
                key={item.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-alif-black">{item.name}</span>
                    <span className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 border border-alif-border bg-stone-50 text-alif-charcoal">
                      {item.category}
                    </span>
                    <span className="text-xs font-mono text-alif-grey">
                      Unit: {item.unit}
                    </span>
                    {linkedVar && (
                      <span className="text-xs font-mono px-1.5 py-0.5 bg-stone-100 border border-black text-alif-black">
                        Stock: {formatStockQuantity(linkedVar.totalQuantity, linkedVar.unit)}
                      </span>
                    )}
                    {!item.isActive && (
                      <span className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 border border-dashed border-alif-charcoal text-alif-grey">
                        Hidden
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-alif-grey">{item.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTogglePin(item)}
                    data-testid={`btn-pin-${item.id}`}
                    className={`px-2.5 py-1.5 text-xs border min-h-[40px] ${
                      item.isPinned
                        ? 'bg-stone-100 border-black font-bold text-alif-black'
                        : 'bg-white border-alif-border text-alif-grey'
                    }`}
                  >
                    {item.isPinned ? '★ Pinned' : '☆ Pin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    data-testid={`btn-edit-${item.id}`}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
                  >
                    Edit Details
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(item)}
                    className="px-2.5 py-1.5 text-xs uppercase tracking-wider border border-alif-border text-alif-grey hover:text-alif-black min-h-[40px]"
                  >
                    {item.isActive ? 'Hide' : 'Enable'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Restore Default Tailoring Catalogue?"
        message="This will restore the default ALiF Ladies Tailor items while keeping any custom items you added."
        confirmLabel="Restore Defaults"
        onConfirm={async () => {
          await resetDefaultCatalogue();
          setConfirmResetOpen(false);
          onRefresh();
          onNotify('Restored default catalogue items');
        }}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
