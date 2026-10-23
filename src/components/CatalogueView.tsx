import React, { useMemo, useState } from 'react';
import { CatalogueCategory, CatalogueItem } from '../types/billing';
import { formatINR, paiseToRupeesString, rupeesToPaise } from '../utils/currency';
import { resetDefaultCatalogue, saveCatalogueItem } from '../services/billingService';
import { ConfirmDialog } from './StatusBadge';

interface CatalogueViewProps {
  catalogue: CatalogueItem[];
  onRefresh: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function CatalogueView({
  catalogue,
  onRefresh,
  onNotify
}: CatalogueViewProps) {
  const [filterCat, setFilterCat] = useState<CatalogueCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  const [editingItem, setEditingItem] = useState<CatalogueItem | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CatalogueCategory>('service');
  const [defaultPriceRupees, setDefaultPriceRupees] = useState('');
  const [minPriceRupees, setMinPriceRupees] = useState('');
  const [maxPriceRupees, setMaxPriceRupees] = useState('');
  const [costPriceRupees, setCostPriceRupees] = useState('');
  const [unit, setUnit] = useState('pc');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const filtered = useMemo(() => {
    return catalogue.filter((item) => {
      if (filterCat !== 'all' && item.category !== filterCat) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.unit.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [catalogue, filterCat, search]);

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
    setIsActive(item.isActive);
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

      const saved = await saveCatalogueItem({
        id: editingItem?.id,
        name,
        category,
        defaultPricePaise,
        minPricePaise,
        maxPricePaise,
        costPricePaise,
        unit,
        description,
        isActive
      });
      resetForm();
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

  return (
    <div className="space-y-8">
      {/* Add / Edit Catalogue Item Form */}
      <form
        onSubmit={handleSaveItem}
        className="border-b border-black pb-6 space-y-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="editorial-label">Atelier Rate Card</div>
            <h2 className="font-serif text-xl uppercase tracking-[0.18em] text-alif-black font-normal mt-0.5">
              {editingItem
                ? `Edit Item: ${editingItem.name}`
                : 'Catalogue & Pricing'}
            </h2>
            <p className="text-[11px] text-alif-grey mt-0.5">
              Default prices and ranges remain configurable per invoice.
            </p>
          </div>
          {editingItem && (
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
            <label className="block editorial-label mb-1">
              Item / Service Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bridal Astar Blouse"
              data-testid="cat-form-name"
              className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CatalogueCategory)}
              data-testid="cat-form-category"
              className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
            >
              <option value="service">Tailoring Service</option>
              <option value="product">Product / Material (Fabric, Lace, Latkan, Dori)</option>
              <option value="custom">Custom Item</option>
            </select>
          </div>

          <div>
            <label className="block editorial-label mb-1">
              Unit (pc, set, mtr, pair, saree)
            </label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pc"
              data-testid="cat-form-unit"
              className="w-full px-3 py-2 text-xs border border-alif-border bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block editorial-label mb-1">Default Rate (₹) *</label>
            <input
              type="number"
              min="0"
              step="any"
              value={defaultPriceRupees}
              onChange={(e) => setDefaultPriceRupees(e.target.value)}
              placeholder="450"
              data-testid="cat-form-price"
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Min Range (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={minPriceRupees}
              onChange={(e) => setMinPriceRupees(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Max Range (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={maxPriceRupees}
              onChange={(e) => setMaxPriceRupees(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">Cost Price (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={costPriceRupees}
              onChange={(e) => setCostPriceRupees(e.target.value)}
              placeholder="Optional"
              data-testid="cat-form-cost"
              className="w-full px-3 py-2 text-xs font-mono border border-alif-border bg-white"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional specification note..."
            className="flex-1 px-3 py-2 text-xs border border-alif-border bg-white"
          />

          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-alif-charcoal">
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
              className="px-5 py-2.5 bg-alif-black text-white text-[10px] font-semibold uppercase tracking-[0.16em] hover:bg-zinc-800"
            >
              {editingItem ? 'Update Item' : '+ Add to Catalogue'}
            </button>
          </div>
        </div>
      </form>

      {/* Catalogue List Section */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'service', 'product', 'custom'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] border font-semibold ${
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
              placeholder="Search catalogue..."
              className="px-3 py-1.5 text-xs border border-alif-border bg-white"
            />
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
            >
              Restore Defaults
            </button>
          </div>
        </div>

        <div className="bg-white border border-alif-border divide-y">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-medium text-alif-black">{item.name}</span>
                  <span className="text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-alif-border text-alif-grey">
                    {item.category}
                  </span>
                  {!item.isActive && (
                    <span className="text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-dashed border-alif-border text-alif-grey">
                      Hidden
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-alif-grey">{item.description}</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-alif-charcoal font-mono pt-0.5">
                  <span>
                    Default: <strong>{formatINR(item.defaultPricePaise)}</strong> / {item.unit}
                  </span>
                  {item.minPricePaise !== undefined && item.maxPricePaise !== undefined && (
                    <span className="text-alif-grey">
                      Range: {formatINR(item.minPricePaise)}–{formatINR(item.maxPricePaise)}
                    </span>
                  )}
                  {item.costPricePaise !== undefined && (
                    <span className="text-alif-grey">
                      Cost: {formatINR(item.costPricePaise)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  data-testid={`btn-edit-${item.id}`}
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] border border-alif-border bg-white hover:border-black"
                >
                  Edit Price / Details
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleActive(item)}
                  className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] border border-alif-border text-alif-grey hover:text-alif-black"
                >
                  {item.isActive ? 'Hide' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Restore Default Tailoring Catalogue?"
        message="This will restore the default ALiF Ladies Tailor items (astar blouse, plain blouse, fall & pico, suit, kurti, alter, Patiala, palazzo, gharara, sharara, frock, lehenga, fabric, lace, latkan, dori, and custom item) while keeping any custom items you added."
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
