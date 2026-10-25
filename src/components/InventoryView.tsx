import React, { useMemo, useState } from 'react';
import {
  InventoryBundle,
  InventoryMovement,
  InventoryVariant,
  StockStatus
} from '../types/billing';
import { formatINR, paiseToRupeesString, rupeesToPaise } from '../utils/currency';
import {
  extractInventoryHierarchy,
  findDuplicateInventoryVariant,
  focusAndScrollElementByTestId,
  formatStockQuantity,
  generateProductPlaceholderSvg,
  getVariantStockStatus,
  resolveColorSwatchHex,
  searchInventoryVariants
} from '../utils/search';
import {
  adjustInventoryStock,
  compressAndResizeImage,
  deleteInventoryBundle,
  fromQtyUnits,
  getTodayIsoDate,
  receiveInventoryBundle,
  roundStockQty,
  saveInventoryVariant,
  toQtyUnits,
  updateInventoryBundle
} from '../services/billingService';

interface InventoryViewProps {
  variants: InventoryVariant[];
  bundles: InventoryBundle[];
  movements: InventoryMovement[];
  onRefresh: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

const ADJUSTMENT_REASON_CHIPS = [
  'Roll End Shortage',
  'Physical Recount',
  'Damaged/Defective Material',
  'Sample/Display',
  'Data Entry Correction'
];

const DEFAULT_CATEGORY_SUGGESTIONS = [
  'Fabric',
  'Lining & Astar',
  'Lace & Borders',
  'Accessories'
];

export function InventoryView({
  variants,
  bundles,
  movements,
  onRefresh,
  onNotify
}: InventoryViewProps) {
  // Hierarchy & Search Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProductType, setSelectedProductType] = useState<string>('');
  const [selectedWorkDesign, setSelectedWorkDesign] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StockStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // New / Edit Variant Form State
  const [showVariantForm, setShowVariantForm] = useState<boolean>(false);
  const [editingVariant, setEditingVariant] = useState<InventoryVariant | null>(null);
  const [clonedFromVariantName, setClonedFromVariantName] = useState<string | null>(null);
  const [categoryInput, setCategoryInput] = useState<string>('Fabric');
  const [productTypeInput, setProductTypeInput] = useState<string>('');
  const [workDesignInput, setWorkDesignInput] = useState<string>('');
  const [colorInput, setColorInput] = useState<string>('');
  const [unitInput, setUnitInput] = useState<string>('m');
  const [purchaseCostRupees, setPurchaseCostRupees] = useState<string>('');
  const [defaultPriceRupees, setDefaultPriceRupees] = useState<string>('');
  const [lowStockThresholdInput, setLowStockThresholdInput] = useState<string>('3');
  const [variantNotesInput, setVariantNotesInput] = useState<string>('');
  const [variantPhotoDataUrl, setVariantPhotoDataUrl] = useState<string>('');
  const [isPinnedInput, setIsPinnedInput] = useState<boolean>(false);

  // Opening bundle fields when creating a new variant
  const [initBundleQtyInput, setInitBundleQtyInput] = useState<string>('');
  const [initBundleDateInput, setInitBundleDateInput] = useState<string>(getTodayIsoDate());
  const [initBundleCodeInput, setInitBundleCodeInput] = useState<string>('');
  const [initBundleSupplierInput, setInitBundleSupplierInput] = useState<string>('');
  const [initBundlePhotoDataUrl, setInitBundlePhotoDataUrl] = useState<string>('');

  // Receive Bundle Inline State
  const [receivingForVariantId, setReceivingForVariantId] = useState<string | null>(null);
  const [receiveQtyInput, setReceiveQtyInput] = useState<string>('');
  const [receiveDateInput, setReceiveDateInput] = useState<string>(getTodayIsoDate());
  const [receiveCostRupees, setReceiveCostRupees] = useState<string>('');
  const [receiveCodeInput, setReceiveCodeInput] = useState<string>('');
  const [receiveSupplierInput, setReceiveSupplierInput] = useState<string>('');
  const [receiveNotesInput, setReceiveNotesInput] = useState<string>('');
  const [receiveBundlePhotoDataUrl, setReceiveBundlePhotoDataUrl] = useState<string>('');

  // Manual Stock Adjustment Inline State (Supports both 'exact' Set Actual Remaining and 'delta' +/- Change)
  const [adjustingVariantId, setAdjustingVariantId] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState<'exact' | 'delta'>('exact');
  const [adjustBundleId, setAdjustBundleId] = useState<string>('');
  const [adjustActualInput, setAdjustActualInput] = useState<string>('');
  const [adjustDeltaInput, setAdjustDeltaInput] = useState<string>('');
  const [adjustReasonInput, setAdjustReasonInput] = useState<string>('');

  // Inline Roll / Bundle Editor State
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [editBundleCode, setEditBundleCode] = useState<string>('');
  const [editBundleInitialQty, setEditBundleInitialQty] = useState<string>('');
  const [editBundleCostRupees, setEditBundleCostRupees] = useState<string>('');
  const [editBundleDate, setEditBundleDate] = useState<string>('');
  const [editBundleSupplier, setEditBundleSupplier] = useState<string>('');
  const [editBundleNotes, setEditBundleNotes] = useState<string>('');
  const [editBundlePhotoDataUrl, setEditBundlePhotoDataUrl] = useState<string>('');

  // Expanded bundle breakdown state
  const [expandedVariantIds, setExpandedVariantIds] = useState<Record<string, boolean>>({});
  const [movementVariantFilter, setMovementVariantFilter] = useState<string>('');

  // Full-screen Photo Preview Modal
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{
    title: string;
    subtitle?: string;
    dataUrl: string;
  } | null>(null);

  const hierarchy = useMemo(
    () =>
      extractInventoryHierarchy(
        variants,
        selectedCategory,
        selectedProductType,
        selectedWorkDesign
      ),
    [variants, selectedCategory, selectedProductType, selectedWorkDesign]
  );

  // Attribute & Supplier Suggestion Chips for Fast Multi-Colour Entry
  const formSuggestions = useMemo(() => {
    const categories = new Set<string>(DEFAULT_CATEGORY_SUGGESTIONS);
    const productTypes = new Set<string>();
    const workDesigns = new Set<string>();
    const suppliers = new Set<string>();

    for (const v of variants) {
      if (v.category) categories.add(v.category);
      if (!categoryInput.trim() || v.category.toLowerCase() === categoryInput.trim().toLowerCase()) {
        if (v.productType) productTypes.add(v.productType);
      }
      if (
        !productTypeInput.trim() ||
        v.productType.toLowerCase() === productTypeInput.trim().toLowerCase()
      ) {
        if (v.workDesign) workDesigns.add(v.workDesign);
      }
    }

    // If filtered sets are empty, include all known productTypes / workDesigns
    if (productTypes.size === 0) {
      for (const v of variants) {
        if (v.productType) productTypes.add(v.productType);
      }
    }
    if (workDesigns.size === 0) {
      for (const v of variants) {
        if (v.workDesign) workDesigns.add(v.workDesign);
      }
    }

    for (const b of bundles) {
      if (b.supplier && b.supplier.trim()) {
        suppliers.add(b.supplier.trim());
      }
    }

    return {
      categories: Array.from(categories).slice(0, 6),
      productTypes: Array.from(productTypes).slice(0, 8),
      workDesigns: Array.from(workDesigns).slice(0, 8),
      suppliers: Array.from(suppliers).slice(0, 6)
    };
  }, [variants, bundles, categoryInput, productTypeInput]);

  // Live duplicate variant detector in the Add/Edit Variant form
  const duplicateVariantMatch = useMemo(() => {
    if (!categoryInput.trim() || !productTypeInput.trim() || !colorInput.trim()) {
      return undefined;
    }
    return findDuplicateInventoryVariant(variants, {
      category: categoryInput,
      productType: productTypeInput,
      workDesign: workDesignInput || 'Standard',
      color: colorInput,
      excludeId: editingVariant?.id
    });
  }, [variants, categoryInput, productTypeInput, workDesignInput, colorInput, editingVariant]);

  const bundlesByVariant = useMemo(() => {
    const map: Record<string, InventoryBundle[]> = {};
    for (const b of bundles) {
      if (!map[b.variantId]) map[b.variantId] = [];
      map[b.variantId].push(b);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        if (a.receivedDate !== b.receivedDate) {
          return a.receivedDate.localeCompare(b.receivedDate);
        }
        return a.createdAt.localeCompare(b.createdAt);
      });
    }
    return map;
  }, [bundles]);

  const rankedVariants = useMemo(() => {
    let base = variants.filter((v) => v.isActive);
    if (selectedCategory) {
      base = base.filter((v) => v.category === selectedCategory);
    }
    if (selectedProductType) {
      base = base.filter((v) => v.productType === selectedProductType);
    }
    if (selectedWorkDesign) {
      base = base.filter((v) => v.workDesign === selectedWorkDesign);
    }
    if (selectedColor) {
      base = base.filter((v) => v.color === selectedColor);
    }
    if (statusFilter !== 'All') {
      base = base.filter((v) => getVariantStockStatus(v) === statusFilter);
    }
    return searchInventoryVariants(base, searchQuery);
  }, [
    variants,
    selectedCategory,
    selectedProductType,
    selectedWorkDesign,
    selectedColor,
    statusFilter,
    searchQuery
  ]);

  const summaryCounts = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    for (const v of variants) {
      if (!v.isActive) continue;
      const st = getVariantStockStatus(v);
      if (st === 'In Stock') inStock++;
      else if (st === 'Low Stock') lowStock++;
      else outOfStock++;
    }
    return {
      totalVariants: variants.filter((v) => v.isActive).length,
      totalBundles: bundles.filter((b) => b.remainingQuantity > 0).length,
      inStock,
      lowStock,
      outOfStock
    };
  }, [variants, bundles]);

  const filteredMovements = useMemo(() => {
    const list = movementVariantFilter
      ? movements.filter((m) => m.variantId === movementVariantFilter)
      : movements;
    return list.slice(0, 25);
  }, [movements, movementVariantFilter]);

  const variantsById = useMemo(() => {
    const map: Record<string, InventoryVariant> = {};
    for (const v of variants) map[v.id] = v;
    return map;
  }, [variants]);

  function resetVariantForm() {
    setEditingVariant(null);
    setClonedFromVariantName(null);
    setCategoryInput('Fabric');
    setProductTypeInput('');
    setWorkDesignInput('');
    setColorInput('');
    setUnitInput('m');
    setPurchaseCostRupees('');
    setDefaultPriceRupees('');
    setLowStockThresholdInput('3');
    setVariantNotesInput('');
    setVariantPhotoDataUrl('');
    setIsPinnedInput(false);
    setInitBundleQtyInput('');
    setInitBundleDateInput(getTodayIsoDate());
    setInitBundleCodeInput('');
    setInitBundleSupplierInput('');
    setInitBundlePhotoDataUrl('');
  }

  function startEditVariant(v: InventoryVariant) {
    setEditingVariant(v);
    setClonedFromVariantName(null);
    setCategoryInput(v.category);
    setProductTypeInput(v.productType);
    setWorkDesignInput(v.workDesign);
    setColorInput(v.color);
    setUnitInput(v.unit);
    setPurchaseCostRupees(paiseToRupeesString(v.purchaseCostPaise));
    setDefaultPriceRupees(paiseToRupeesString(v.defaultSellingPricePaise));
    setLowStockThresholdInput(String(v.lowStockThreshold));
    setVariantNotesInput(v.notes || '');
    setVariantPhotoDataUrl(v.photoDataUrl || '');
    setIsPinnedInput(Boolean(v.isPinned));
    setShowVariantForm(true);
  }

  /**
   * Improvement 2: + Colour / Clone action on any existing variant card.
   * Pre-fills reusable attributes (Category, Product Type, Work/Design, Unit, Cost, Ref Price,
   * Low-Stock Threshold, and latest Supplier), leaves Colour and Incoming Quantity blank,
   * opens the form, and focuses Colour.
   */
  function startCloneVariant(v: InventoryVariant) {
    const vBundles = bundlesByVariant[v.id] || [];
    const latestSupplier =
      [...vBundles].reverse().find((b) => b.supplier && b.supplier.trim())?.supplier || '';

    setEditingVariant(null);
    setClonedFromVariantName(v.name);
    setCategoryInput(v.category);
    setProductTypeInput(v.productType);
    setWorkDesignInput(v.workDesign);
    setColorInput('');
    setUnitInput(v.unit);
    setPurchaseCostRupees(paiseToRupeesString(v.purchaseCostPaise));
    setDefaultPriceRupees(paiseToRupeesString(v.defaultSellingPricePaise));
    setLowStockThresholdInput(String(v.lowStockThreshold));
    setVariantNotesInput('');
    setVariantPhotoDataUrl('');
    setIsPinnedInput(Boolean(v.isPinned));
    setInitBundleQtyInput('');
    setInitBundleDateInput(getTodayIsoDate());
    setInitBundleCodeInput('');
    setInitBundleSupplierInput(latestSupplier);
    setInitBundlePhotoDataUrl('');
    setShowVariantForm(true);

    setTimeout(() => {
      focusAndScrollElementByTestId('inv-input-color', {
        selectText: true,
        allowScroll: true,
        forceScroll: true
      });
    }, 30);
  }

  async function handlePhotoUpload(
    file: File | undefined,
    onLoaded: (dataUrl: string) => void,
    inputEl?: HTMLInputElement | null
  ) {
    if (!file) return;
    try {
      const processed = await compressAndResizeImage(file);
      onLoaded(processed.dataUrl);
    } catch (err: any) {
      onNotify(err?.message || 'Could not process image', true);
    } finally {
      if (inputEl) {
        inputEl.value = '';
      }
    }
  }

  async function saveVariantCore(keepOpenForNextColour: boolean, receiveIntoDuplicate = false) {
    try {
      const purchaseCostPaise = rupeesToPaise(purchaseCostRupees || '0');
      const defaultSellingPricePaise = rupeesToPaise(defaultPriceRupees || '0');
      const lowStockThreshold = Math.max(0, Number(lowStockThresholdInput) || 0);
      const initialBundleQuantity = editingVariant
        ? undefined
        : Number(initBundleQtyInput || '0');

      const res = await saveInventoryVariant({
        id: editingVariant?.id,
        category: categoryInput,
        productType: productTypeInput,
        workDesign: workDesignInput,
        color: colorInput,
        unit: unitInput,
        purchaseCostPaise,
        defaultSellingPricePaise,
        lowStockThreshold,
        photoDataUrl: variantPhotoDataUrl || undefined,
        notes: variantNotesInput,
        isPinned: isPinnedInput,
        initialBundleQuantity,
        initialBundleDate: initBundleDateInput,
        initialBundleCode: initBundleCodeInput,
        initialBundleSupplier: initBundleSupplierInput,
        initialBundlePhotoDataUrl: initBundlePhotoDataUrl || undefined,
        receiveIntoExistingOnDuplicate: receiveIntoDuplicate
      });

      onRefresh();

      if (keepOpenForNextColour && !editingVariant) {
        // Preserve shared product attributes; clear only per-colour fields and focus Colour
        setClonedFromVariantName(res.variant.name);
        setColorInput('');
        setInitBundleQtyInput('');
        setInitBundleCodeInput('');
        setVariantPhotoDataUrl('');
        setInitBundlePhotoDataUrl('');
        setVariantNotesInput('');
        onNotify(
          `Saved "${res.variant.name}" (${formatStockQuantity(
            res.variant.totalQuantity,
            res.variant.unit
          )}). Enter next colour.`
        );
        setTimeout(() => {
          focusAndScrollElementByTestId('inv-input-color', {
            selectText: true,
            allowScroll: true
          });
        }, 25);
        return;
      }

      resetVariantForm();
      setShowVariantForm(false);
      if (res.receivedIntoExisting) {
        onNotify(
          `Received new stock into existing variant "${res.variant.name}" (Total: ${formatStockQuantity(
            res.variant.totalQuantity,
            res.variant.unit
          )})`
        );
      } else {
        onNotify(
          `Saved variant "${res.variant.name}" (${formatStockQuantity(
            res.variant.totalQuantity,
            res.variant.unit
          )})`
        );
      }
    } catch (err: any) {
      onNotify(err?.message || 'Failed to save inventory variant', true);
    }
  }

  async function handleSaveVariant(e: React.FormEvent) {
    e.preventDefault();
    await saveVariantCore(false, false);
  }

  async function handleReceiveIntoDuplicate() {
    if (!duplicateVariantMatch) return;
    const enteredQty = Number(initBundleQtyInput || '0');
    if (enteredQty > 0) {
      await saveVariantCore(false, true);
      return;
    }
    // If no initial quantity was typed yet in the New Variant form, jump straight to + Receive Roll on the existing variant
    const target = duplicateVariantMatch;
    resetVariantForm();
    setShowVariantForm(false);
    openReceiveBundle(target);
    onNotify(`Switched to Receive Roll for existing "${target.name}". Enter incoming quantity.`);
  }

  function openReceiveBundle(variant: InventoryVariant) {
    const vBundles = bundlesByVariant[variant.id] || [];
    const latestSupplier =
      [...vBundles].reverse().find((b) => b.supplier && b.supplier.trim())?.supplier || '';

    setReceivingForVariantId(variant.id);
    setAdjustingVariantId(null);
    setReceiveQtyInput('');
    setReceiveDateInput(getTodayIsoDate());
    setReceiveCostRupees(paiseToRupeesString(variant.purchaseCostPaise));
    setReceiveCodeInput('');
    setReceiveSupplierInput(latestSupplier);
    setReceiveNotesInput('');
    setReceiveBundlePhotoDataUrl('');
  }

  async function handleReceiveBundleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receivingForVariantId) return;
    try {
      const qty = Number(receiveQtyInput);
      const purchaseCostPaise = receiveCostRupees.trim()
        ? rupeesToPaise(receiveCostRupees)
        : undefined;
      const res = await receiveInventoryBundle({
        variantId: receivingForVariantId,
        quantity: qty,
        receivedDate: receiveDateInput,
        purchaseCostPaise,
        bundleCode: receiveCodeInput,
        supplier: receiveSupplierInput,
        photoDataUrl: receiveBundlePhotoDataUrl || undefined,
        notes: receiveNotesInput
      });
      setReceivingForVariantId(null);
      onRefresh();
      onNotify(
        `Received ${formatStockQuantity(
          res.bundle.initialQuantity,
          res.variant.unit
        )} into ${res.bundle.bundleCode} (Total: ${formatStockQuantity(
          res.variant.totalQuantity,
          res.variant.unit
        )})`
      );
    } catch (err: any) {
      onNotify(err?.message || 'Failed to receive stock bundle', true);
    }
  }

  function openAdjustStock(variant: InventoryVariant) {
    setAdjustingVariantId(variant.id);
    setReceivingForVariantId(null);
    setAdjustMode('exact');
    setAdjustBundleId('');
    setAdjustActualInput(String(variant.totalQuantity));
    setAdjustDeltaInput('');
    setAdjustReasonInput('');
  }

  function handleSelectAdjustBundle(variant: InventoryVariant, bundleId: string) {
    setAdjustBundleId(bundleId);
    if (!bundleId) {
      setAdjustActualInput(String(variant.totalQuantity));
    } else {
      const vBundles = bundlesByVariant[variant.id] || [];
      const b = vBundles.find((x) => x.id === bundleId);
      if (b) {
        setAdjustActualInput(String(b.remainingQuantity));
      }
    }
  }

  function handleMarkRollFinished(variant: InventoryVariant) {
    setAdjustMode('exact');
    setAdjustActualInput('0');
    setAdjustDeltaInput(
      String(
        -roundStockQty(
          adjustBundleId
            ? (bundlesByVariant[variant.id] || []).find((b) => b.id === adjustBundleId)
                ?.remainingQuantity ?? variant.totalQuantity
            : variant.totalQuantity
        )
      )
    );
    if (!adjustReasonInput.trim()) {
      setAdjustReasonInput('Roll End Shortage');
    }
  }

  async function handleAdjustStockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingVariantId) return;
    try {
      // Support both 'exact' (Set Actual Remaining) and 'delta' (Change by +/-)
      // Also seamlessly handle if a test or user directly typed into adjustDeltaInput while in default mode
      const useExactMode =
        adjustMode === 'exact' &&
        adjustActualInput.trim() !== '' &&
        adjustDeltaInput.trim() === '';

      const res = await adjustInventoryStock(
        useExactMode
          ? {
              variantId: adjustingVariantId,
              bundleId: adjustBundleId || undefined,
              actualRemainingQuantity: Number(adjustActualInput),
              reason: adjustReasonInput
            }
          : {
              variantId: adjustingVariantId,
              bundleId: adjustBundleId || undefined,
              quantityDelta: Number(adjustDeltaInput),
              reason: adjustReasonInput
            }
      );
      setAdjustingVariantId(null);
      onRefresh();
      const d = res.computedDelta;
      onNotify(
        `Adjusted "${res.variant.name}" by ${d > 0 ? `+${d}` : d} ${
          res.variant.unit
        } (New total: ${formatStockQuantity(res.variant.totalQuantity, res.variant.unit)})`
      );
    } catch (err: any) {
      onNotify(err?.message || 'Failed to adjust stock', true);
    }
  }

  function startEditBundle(b: InventoryBundle) {
    setEditingBundleId(b.id);
    setEditBundleCode(b.bundleCode);
    setEditBundleInitialQty(String(b.initialQuantity));
    setEditBundleCostRupees(paiseToRupeesString(b.purchaseCostPaise));
    setEditBundleDate(b.receivedDate);
    setEditBundleSupplier(b.supplier || '');
    setEditBundleNotes(b.notes || '');
    setEditBundlePhotoDataUrl(b.photoDataUrl || '');
  }

  async function handleSaveBundleEdit(e: React.FormEvent, b: InventoryBundle) {
    e.preventDefault();
    try {
      const res = await updateInventoryBundle({
        bundleId: b.id,
        bundleCode: editBundleCode,
        initialQuantity: Number(editBundleInitialQty),
        purchaseCostPaise: rupeesToPaise(editBundleCostRupees || '0'),
        receivedDate: editBundleDate,
        supplier: editBundleSupplier,
        notes: editBundleNotes,
        photoDataUrl: editBundlePhotoDataUrl ? editBundlePhotoDataUrl : null
      });
      setEditingBundleId(null);
      onRefresh();
      onNotify(
        `Updated roll ${res.bundle.bundleCode} (Rem: ${formatStockQuantity(
          res.bundle.remainingQuantity,
          res.bundle.unit
        )}, Variant Total: ${formatStockQuantity(res.variant.totalQuantity, res.variant.unit)})`
      );
    } catch (err: any) {
      onNotify(err?.message || 'Could not update roll', true);
    }
  }

  async function handleDeleteBundle(b: InventoryBundle) {
    try {
      const res = await deleteInventoryBundle(b.id);
      if (editingBundleId === b.id) {
        setEditingBundleId(null);
      }
      onRefresh();
      onNotify(
        `Deleted unused roll ${b.bundleCode} (New total: ${formatStockQuantity(
          res.variant.totalQuantity,
          res.variant.unit
        )})`
      );
    } catch (err: any) {
      onNotify(err?.message || 'Cannot delete roll', true);
    }
  }

  async function handleTogglePin(v: InventoryVariant) {
    try {
      await saveInventoryVariant({
        id: v.id,
        category: v.category,
        productType: v.productType,
        workDesign: v.workDesign,
        color: v.color,
        unit: v.unit,
        purchaseCostPaise: v.purchaseCostPaise,
        defaultSellingPricePaise: v.defaultSellingPricePaise,
        lowStockThreshold: v.lowStockThreshold,
        isPinned: !v.isPinned
      });
      onRefresh();
      onNotify(`${v.name} ${!v.isPinned ? 'pinned to' : 'unpinned from'} Frequently Used`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not update pin status', true);
    }
  }

  return (
    <div className="space-y-6">
      {/* Editorial Header & Primary Action */}
      <section className="bg-white border border-alif-border p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <div className="editorial-label">Physical Shop Stock • FIFO Rolls &amp; Bundles</div>
            <h2 className="editorial-heading mt-0.5">
              Inventory Management ({summaryCounts.totalVariants})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {(editingVariant || clonedFromVariantName) && (
              <button
                type="button"
                onClick={() => {
                  resetVariantForm();
                  setShowVariantForm(false);
                }}
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white hover:border-black min-h-[40px]"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (showVariantForm && (editingVariant || clonedFromVariantName)) {
                  resetVariantForm();
                }
                setShowVariantForm((prev) => !prev);
              }}
              data-testid="btn-open-new-variant"
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white hover:bg-zinc-800 min-h-[42px]"
            >
              {showVariantForm ? 'Hide Form ▲' : '+ Add Variant / Incoming Stock'}
            </button>
          </div>
        </div>

        {/* 2x2 / 4-Column Stock Status Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border bg-white text-sm">
          <div className="p-3 border-r border-b border-alif-border">
            <div className="editorial-label">Active Variants</div>
            <div
              className="font-mono text-xl font-bold text-alif-black mt-1"
              data-testid="inv-metric-variants"
            >
              {summaryCounts.totalVariants}
            </div>
            <div className="text-xs text-alif-grey mt-0.5">
              {summaryCounts.totalBundles} active rolls/bundles
            </div>
          </div>

          <div className="p-3 border-r border-b border-alif-border">
            <div className="editorial-label">In Stock</div>
            <div className="font-mono text-xl font-bold text-alif-black mt-1">
              {summaryCounts.inStock}
            </div>
            <div className="text-xs text-alif-grey mt-0.5">Healthy stock level</div>
          </div>

          <div className="p-3 border-r border-b border-alif-border bg-stone-50">
            <div className="editorial-label text-alif-charcoal">Low Stock</div>
            <div
              className="font-mono text-xl font-bold text-alif-black mt-1"
              data-testid="inv-metric-low-stock"
            >
              {summaryCounts.lowStock}
            </div>
            <div className="text-xs text-alif-charcoal mt-0.5">At or below threshold</div>
          </div>

          <div className="p-3 border-r border-b border-alif-border bg-stone-100">
            <div className="editorial-label text-alif-black">Out of Stock</div>
            <div
              className="font-mono text-xl font-bold text-alif-black mt-1"
              data-testid="inv-metric-out-of-stock"
            >
              {summaryCounts.outOfStock}
            </div>
            <div className="text-xs text-alif-charcoal mt-0.5">0 remaining quantity</div>
          </div>
        </div>

        {/* Collapsible Add / Edit / Clone Variant & Incoming Stock Form */}
        <form
          onSubmit={handleSaveVariant}
          data-testid="form-inventory-variant"
          className={
            showVariantForm ? 'border-t border-black pt-4 space-y-4 bg-stone-50 p-3.5' : 'hidden'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="editorial-subhead">
                {editingVariant
                  ? `Edit Variant: ${editingVariant.name}`
                  : clonedFromVariantName
                  ? `Multi-Colour Entry (Cloned from ${clonedFromVariantName})`
                  : 'New Product Variant & Opening Bundle'}
              </div>
              <p className="text-xs text-alif-grey mt-0.5">
                Organise stock by <strong>Category → Product Type → Work/Design → Colour</strong>.
                Every active variant is automatically synced to New Bill &amp; Catalogue.
              </p>
            </div>
            {clonedFromVariantName && !editingVariant && (
              <span
                data-testid="inv-clone-mode-badge"
                className="px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider bg-alif-black text-white"
              >
                Shared Details Pre-filled • Enter Colour &amp; Qty
              </span>
            )}
          </div>

          {/* Improvement 1: Live Duplicate Variant Detection Banner */}
          {duplicateVariantMatch && (
            <div
              data-testid="inv-duplicate-banner"
              className="p-3 bg-white border-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
            >
              <div className="space-y-0.5">
                <div className="font-bold uppercase tracking-wider text-alif-black">
                  Duplicate Variant Detected: {duplicateVariantMatch.name}
                </div>
                <div className="text-alif-charcoal font-mono">
                  SKU: {duplicateVariantMatch.sku} • Current Stock:{' '}
                  <strong>
                    {formatStockQuantity(
                      duplicateVariantMatch.totalQuantity,
                      duplicateVariantMatch.unit
                    )}
                  </strong>
                </div>
              </div>
              {!editingVariant && (
                <button
                  type="button"
                  onClick={handleReceiveIntoDuplicate}
                  data-testid="btn-receive-into-duplicate"
                  className="px-3.5 py-2 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800 shrink-0 min-h-[38px]"
                >
                  Receive Stock into Existing Variant Instead →
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block editorial-label mb-1">1. Category *</label>
              <input
                type="text"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                placeholder="e.g. Fabric"
                data-testid="inv-input-category"
                className="w-full px-3 py-2 text-base bg-white"
              />
              {formSuggestions.categories.length > 0 && (
                <div
                  className="flex flex-wrap gap-1 mt-1"
                  data-testid="inv-suggestions-category"
                >
                  {formSuggestions.categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryInput(cat)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono border ${
                        categoryInput === cat
                          ? 'bg-alif-black text-white border-black'
                          : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block editorial-label mb-1">2. Product Type *</label>
              <input
                type="text"
                value={productTypeInput}
                onChange={(e) => setProductTypeInput(e.target.value)}
                placeholder="e.g. Fandy Silk"
                data-testid="inv-input-product-type"
                className="w-full px-3 py-2 text-base bg-white"
              />
              {formSuggestions.productTypes.length > 0 && (
                <div
                  className="flex flex-wrap gap-1 mt-1"
                  data-testid="inv-suggestions-product-type"
                >
                  {formSuggestions.productTypes.map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setProductTypeInput(pt)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono border ${
                        productTypeInput === pt
                          ? 'bg-alif-black text-white border-black'
                          : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                      }`}
                    >
                      {pt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block editorial-label mb-1">3. Work / Design *</label>
              <input
                type="text"
                value={workDesignInput}
                onChange={(e) => setWorkDesignInput(e.target.value)}
                placeholder="e.g. All-over Work"
                data-testid="inv-input-work-design"
                className="w-full px-3 py-2 text-base bg-white"
              />
              {formSuggestions.workDesigns.length > 0 && (
                <div
                  className="flex flex-wrap gap-1 mt-1"
                  data-testid="inv-suggestions-work-design"
                >
                  {formSuggestions.workDesigns.map((wd) => (
                    <button
                      key={wd}
                      type="button"
                      onClick={() => setWorkDesignInput(wd)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono border ${
                        workDesignInput === wd
                          ? 'bg-alif-black text-white border-black'
                          : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                      }`}
                    >
                      {wd}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block editorial-label mb-1">4. Colour (Separate Variant) *</label>
              <input
                type="text"
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
                placeholder="e.g. Green"
                data-testid="inv-input-color"
                className="w-full px-3 py-2 text-base bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block editorial-label mb-1">Unit *</label>
              <select
                value={unitInput}
                onChange={(e) => setUnitInput(e.target.value)}
                data-testid="inv-input-unit"
                className="w-full px-3 py-2 text-base bg-white"
              >
                <option value="m">m (Metres)</option>
                <option value="mtr">mtr</option>
                <option value="pc">pc (Piece)</option>
                <option value="pair">pair</option>
                <option value="roll">roll</option>
                <option value="set">set</option>
              </select>
            </div>

            <div>
              <label className="block editorial-label mb-1">Purchase Cost (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={purchaseCostRupees}
                onChange={(e) => setPurchaseCostRupees(e.target.value)}
                placeholder="0"
                data-testid="inv-input-purchase-cost"
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">Catalogue Ref Price (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={defaultPriceRupees}
                onChange={(e) => setDefaultPriceRupees(e.target.value)}
                placeholder="0"
                data-testid="inv-input-default-price"
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">Low-Stock Alert At</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={lowStockThresholdInput}
                onChange={(e) => setLowStockThresholdInput(e.target.value)}
                data-testid="inv-input-threshold"
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>
          </div>

          {!editingVariant && (
            <div className="border-t border-alif-border pt-3 space-y-2.5">
              <div className="editorial-label text-alif-black">
                Opening Bundle / Roll Details (Supports fractional quantities like 1.2, 2.5, 3.25)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block editorial-label mb-1">
                    Incoming Quantity ({unitInput})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={initBundleQtyInput}
                    onChange={(e) => setInitBundleQtyInput(e.target.value)}
                    placeholder="e.g. 12.5"
                    data-testid="inv-input-initial-qty"
                    className="w-full px-3 py-2 text-base font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Receipt Date</label>
                  <input
                    type="date"
                    value={initBundleDateInput}
                    onChange={(e) => setInitBundleDateInput(e.target.value)}
                    data-testid="inv-input-initial-date"
                    className="w-full px-3 py-2 text-base font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Bundle / Roll Code</label>
                  <input
                    type="text"
                    value={initBundleCodeInput}
                    onChange={(e) => setInitBundleCodeInput(e.target.value)}
                    placeholder="Auto if blank"
                    data-testid="inv-input-initial-code"
                    className="w-full px-3 py-2 text-base font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Supplier (Optional)</label>
                  <input
                    type="text"
                    value={initBundleSupplierInput}
                    onChange={(e) => setInitBundleSupplierInput(e.target.value)}
                    placeholder="Supplier name"
                    data-testid="inv-input-initial-supplier"
                    className="w-full px-3 py-2 text-base bg-white"
                  />
                  {formSuggestions.suppliers.length > 0 && (
                    <div
                      className="flex flex-wrap gap-1 mt-1"
                      data-testid="inv-suggestions-supplier"
                    >
                      {formSuggestions.suppliers.map((sup) => (
                        <button
                          key={sup}
                          type="button"
                          onClick={() => setInitBundleSupplierInput(sup)}
                          className={`px-1.5 py-0.5 text-[10px] font-mono border ${
                            initBundleSupplierInput === sup
                              ? 'bg-alif-black text-white border-black'
                              : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                          }`}
                        >
                          {sup}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Opening Roll Photo (Camera + Gallery + Inheritance Notice) */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="editorial-label text-alif-charcoal">Opening Roll Photo:</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  id="inv-init-roll-camera-input"
                  data-testid="input-inv-init-roll-camera"
                  onChange={(e) =>
                    handlePhotoUpload(
                      e.target.files?.[0],
                      setInitBundlePhotoDataUrl,
                      e.target
                    )
                  }
                  className="hidden"
                />
                <input
                  type="file"
                  accept="image/*"
                  id="inv-init-roll-gallery-input"
                  data-testid="input-inv-init-roll-gallery"
                  onChange={(e) =>
                    handlePhotoUpload(
                      e.target.files?.[0],
                      setInitBundlePhotoDataUrl,
                      e.target
                    )
                  }
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() =>
                    (
                      document.getElementById('inv-init-roll-camera-input') as HTMLInputElement | null
                    )?.click()
                  }
                  data-testid="btn-inv-init-roll-camera"
                  className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white text-alif-black hover:border-black min-h-[34px]"
                >
                  📷 Roll Camera
                </button>
                <button
                  type="button"
                  onClick={() =>
                    (
                      document.getElementById(
                        'inv-init-roll-gallery-input'
                      ) as HTMLInputElement | null
                    )?.click()
                  }
                  data-testid="btn-inv-init-roll-gallery"
                  className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[34px]"
                >
                  Roll Gallery
                </button>
                {initBundlePhotoDataUrl && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPhotoModal({
                          title: 'Opening Roll Photo',
                          subtitle: `${colorInput || ''} ${productTypeInput || ''}`.trim(),
                          dataUrl: initBundlePhotoDataUrl
                        })
                      }
                      className="p-0.5 border border-black bg-white"
                    >
                      <img
                        src={initBundlePhotoDataUrl}
                        alt="Opening roll preview"
                        className="w-9 h-9 object-cover block"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setInitBundlePhotoDataUrl('')}
                      data-testid="btn-inv-init-roll-remove-photo"
                      className="px-2 py-1 text-xs border border-alif-border bg-white text-alif-grey hover:text-alif-black"
                    >
                      Remove
                    </button>
                    {!variantPhotoDataUrl && (
                      <span className="text-[11px] font-mono text-alif-charcoal">
                        (Will auto-set as Variant &amp; Catalogue photo)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Variant Photo (Camera + Gallery + Preview + Remove) & Submit Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-alif-border">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                id="inv-variant-camera-input"
                data-testid="input-inv-variant-camera"
                onChange={(e) =>
                  handlePhotoUpload(e.target.files?.[0], setVariantPhotoDataUrl, e.target)
                }
                className="hidden"
              />
              <input
                type="file"
                accept="image/*"
                id="inv-variant-gallery-input"
                data-testid="input-inv-variant-gallery"
                onChange={(e) =>
                  handlePhotoUpload(e.target.files?.[0], setVariantPhotoDataUrl, e.target)
                }
                className="hidden"
              />
              <button
                type="button"
                onClick={() =>
                  (
                    document.getElementById('inv-variant-camera-input') as HTMLInputElement | null
                  )?.click()
                }
                data-testid="btn-inv-variant-camera"
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-black bg-white text-alif-black hover:bg-stone-100 min-h-[38px]"
              >
                📷 Camera
              </button>
              <button
                type="button"
                onClick={() =>
                  (
                    document.getElementById('inv-variant-gallery-input') as HTMLInputElement | null
                  )?.click()
                }
                data-testid="btn-inv-variant-gallery"
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[38px]"
              >
                Gallery
              </button>
              {variantPhotoDataUrl && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewPhotoModal({
                        title: `${colorInput || ''} ${productTypeInput || 'Variant'}`.trim(),
                        subtitle: workDesignInput,
                        dataUrl: variantPhotoDataUrl
                      })
                    }
                    data-testid="btn-inv-variant-preview-photo"
                    className="p-0.5 border border-black bg-white"
                    title="Preview variant photo"
                  >
                    <img
                      src={variantPhotoDataUrl}
                      alt="Variant preview"
                      className="w-10 h-10 object-cover block"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariantPhotoDataUrl('')}
                    data-testid="btn-inv-variant-remove-photo"
                    className="px-2 py-1 text-xs border border-alif-border bg-white text-alif-grey hover:text-alif-black min-h-[34px]"
                  >
                    Remove Photo
                  </button>
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-alif-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinnedInput}
                  onChange={(e) => setIsPinnedInput(e.target.checked)}
                />
                Pin to Frequently Used
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!editingVariant && (
                <button
                  type="button"
                  onClick={() => saveVariantCore(true, false)}
                  data-testid="btn-save-and-add-colour"
                  className="px-4 py-2.5 border border-black bg-white text-alif-black text-xs font-semibold uppercase tracking-wider hover:bg-stone-100 min-h-[40px]"
                >
                  Save &amp; + Add Another Colour
                </button>
              )}
              <button
                type="submit"
                data-testid="btn-save-inventory-variant"
                className="px-6 py-2.5 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800 min-h-[40px]"
              >
                {editingVariant ? 'Update Variant' : 'Save Variant & Stock'}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Hierarchical Browsing & Intelligent Offline Search */}
      <section className="bg-white border border-alif-border p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h3 className="editorial-subhead">
              Browse Hierarchy &amp; Intelligent Offline Search
            </h3>
            <p className="text-xs text-alif-grey">
              Handles typos, word order, and hyphens (e.g. try searching{' '}
              <code>gandy grren work all over</code>).
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['All', 'In Stock', 'Low Stock', 'Out of Stock'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                data-testid={`inv-status-filter-${st.toLowerCase().replace(/\s+/g, '-')}`}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider border font-semibold min-h-[38px] ${
                  statusFilter === st
                    ? 'bg-alif-black text-white border-black'
                    : 'bg-stone-50 text-alif-charcoal border-alif-border hover:border-black'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by fabric, colour, work/design, or SKU (e.g. gandy grren work all over)..."
            aria-label="Search inventory"
            data-testid="inventory-search-input"
            className="flex-1 px-3.5 py-2 text-base bg-white"
          />
          {(searchQuery ||
            selectedCategory ||
            selectedProductType ||
            selectedWorkDesign ||
            selectedColor ||
            statusFilter !== 'All') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('');
                setSelectedProductType('');
                setSelectedWorkDesign('');
                setSelectedColor('');
                setStatusFilter('All');
              }}
              data-testid="btn-clear-inventory-filters"
              className="px-3.5 py-2 text-xs font-semibold uppercase tracking-wider border border-black bg-white hover:bg-stone-50 shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* 4-Level Hierarchical Selectors: Category -> Product Type -> Work/Design -> Colour */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div>
            <label className="block editorial-label mb-1">1. Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedProductType('');
                setSelectedWorkDesign('');
                setSelectedColor('');
              }}
              data-testid="inv-filter-category"
              className="w-full px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">All Categories</option>
              {hierarchy.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block editorial-label mb-1">2. Product Type</label>
            <select
              value={selectedProductType}
              onChange={(e) => {
                setSelectedProductType(e.target.value);
                setSelectedWorkDesign('');
                setSelectedColor('');
              }}
              data-testid="inv-filter-product-type"
              className="w-full px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">All Product Types</option>
              {hierarchy.productTypes.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block editorial-label mb-1">3. Work / Design</label>
            <select
              value={selectedWorkDesign}
              onChange={(e) => {
                setSelectedWorkDesign(e.target.value);
                setSelectedColor('');
              }}
              data-testid="inv-filter-work-design"
              className="w-full px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">All Work / Designs</option>
              {hierarchy.workDesigns.map((wd) => (
                <option key={wd} value={wd}>
                  {wd}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block editorial-label mb-1">4. Colour</label>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              data-testid="inv-filter-color"
              className="w-full px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">All Colours</option>
              {hierarchy.colors.map((cl) => (
                <option key={cl} value={cl}>
                  {cl}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Inventory Variants & FIFO Bundles List */}
      <section className="space-y-3" data-testid="inventory-variants-list">
        {rankedVariants.length === 0 ? (
          <div className="bg-white border border-alif-border p-8 text-center text-sm text-alif-grey">
            No matching inventory variants found. Try clearing filters or adding a new stock variant.
          </div>
        ) : (
          rankedVariants.map(({ item: v, isApproximateMatch }) => {
            const vBundles = bundlesByVariant[v.id] || [];
            const stockStatus = getVariantStockStatus(v);
            const isExpanded = Boolean(expandedVariantIds[v.id]);
            const thumbSrc =
              v.photoDataUrl ||
              generateProductPlaceholderSvg(v.productType || v.name, v.workDesign, v.color);
            const colorSwatch = resolveColorSwatchHex(v.color);

            // Compute live adjustment preview for this variant
            const currentAdjustBasis = adjustBundleId
              ? vBundles.find((b) => b.id === adjustBundleId)?.remainingQuantity ?? v.totalQuantity
              : v.totalQuantity;
            const previewComputedDelta =
              adjustMode === 'exact' && adjustActualInput.trim() !== ''
                ? roundStockQty(Number(adjustActualInput) - currentAdjustBasis)
                : Number(adjustDeltaInput || 0);

            return (
              <div
                key={v.id}
                data-testid={`inventory-card-${v.id}`}
                className="bg-white border border-alif-border p-3.5 sm:p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPhotoModal({
                          title: v.name,
                          subtitle: `${v.category} • ${v.productType} • ${v.workDesign} • ${v.color}`,
                          dataUrl: thumbSrc
                        })
                      }
                      className="p-0 border border-black shrink-0 bg-stone-50"
                      title="Tap to preview variant image"
                    >
                      <img
                        src={thumbSrc}
                        alt={v.name}
                        data-testid={`inv-thumb-${v.id}`}
                        className="w-14 h-14 object-cover block"
                      />
                    </button>

                    <div className="min-w-0 space-y-1">
                      {/* Improvement 4: Clear Colour Badge, Product Type & Work/Design Identification */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          data-testid={`inv-color-badge-${v.id}`}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider border border-black bg-stone-50 text-alif-black"
                        >
                          <span
                            className="w-2.5 h-2.5 border border-black inline-block shrink-0"
                            style={{ backgroundColor: colorSwatch.bg }}
                          />
                          {v.color}
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-mono border border-alif-border bg-white text-alif-charcoal">
                          {v.productType}
                        </span>
                        <span
                          data-testid={`inv-work-badge-${v.id}`}
                          className="px-2 py-0.5 text-[11px] font-mono border border-alif-border bg-stone-50 text-alif-charcoal"
                        >
                          {v.workDesign}
                        </span>
                        <span className="text-[11px] font-mono uppercase tracking-wider text-alif-grey">
                          ({v.category})
                        </span>
                        {isApproximateMatch && searchQuery.trim() && (
                          <span
                            data-testid={`inv-approx-badge-${v.id}`}
                            className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border border-dashed border-black bg-stone-50 text-alif-black"
                          >
                            Approximate Match
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-semibold text-alif-black">{v.name}</h4>
                        <span
                          data-testid={`inv-status-badge-${v.id}`}
                          className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border ${
                            stockStatus === 'In Stock'
                              ? 'bg-alif-black text-white border-black'
                              : stockStatus === 'Low Stock'
                              ? 'bg-stone-100 text-alif-black border-black'
                              : 'bg-white text-alif-charcoal border-dashed border-black'
                          }`}
                        >
                          {stockStatus}
                        </span>
                        <span className="text-xs font-mono text-alif-grey">SKU: {v.sku}</span>
                      </div>

                      <div className="text-xs font-mono text-alif-grey flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Purchase Cost: <strong>{formatINR(v.purchaseCostPaise)}</strong>/{v.unit}
                        </span>
                        <span>
                          Ref Rate: <strong>{formatINR(v.defaultSellingPricePaise)}</strong>/{v.unit}
                        </span>
                        <span>
                          Rolls/Bundles: <strong>{vBundles.length}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Combined Quantity + Quick Actions (Including + Colour / Clone) */}
                  <div className="flex sm:flex-col items-baseline sm:items-end justify-between border-t sm:border-t-0 pt-2.5 sm:pt-0 border-alif-border shrink-0 gap-2">
                    <div className="text-left sm:text-right">
                      <div className="editorial-label">Available Stock</div>
                      <div
                        data-testid={`inv-total-qty-${v.id}`}
                        className="font-mono text-xl font-bold text-alif-black"
                      >
                        {formatStockQuantity(v.totalQuantity, v.unit)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openReceiveBundle(v)}
                        data-testid={`btn-receive-bundle-${v.id}`}
                        className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white hover:bg-zinc-800 min-h-[38px]"
                      >
                        + Receive Roll
                      </button>
                      <button
                        type="button"
                        onClick={() => startCloneVariant(v)}
                        data-testid={`btn-clone-variant-${v.id}`}
                        title="Clone shared fabric details to add another colour"
                        className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider border border-black bg-stone-50 text-alif-black hover:bg-stone-100 min-h-[38px]"
                      >
                        + Colour / Clone
                      </button>
                      <button
                        type="button"
                        onClick={() => openAdjustStock(v)}
                        data-testid={`btn-adjust-stock-${v.id}`}
                        className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider border border-black bg-white text-alif-black hover:bg-stone-50 min-h-[38px]"
                      >
                        Adjust
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedVariantIds((prev) => ({
                            ...prev,
                            [v.id]: !prev[v.id]
                          }))
                        }
                        data-testid={`btn-toggle-bundles-${v.id}`}
                        className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-stone-50 text-alif-charcoal hover:border-black min-h-[38px]"
                      >
                        {isExpanded ? 'Hide Rolls ▲' : `Rolls (${vBundles.length}) ▼`}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePin(v)}
                        data-testid={`btn-inv-pin-${v.id}`}
                        title="Pin/unpin in New Bill Frequently Used"
                        className={`px-2 py-1.5 text-xs border min-h-[38px] ${
                          v.isPinned
                            ? 'bg-stone-100 border-black font-bold text-alif-black'
                            : 'bg-white border-alif-border text-alif-grey'
                        }`}
                      >
                        {v.isPinned ? '★ Pinned' : '☆ Pin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditVariant(v)}
                        data-testid={`btn-edit-variant-${v.id}`}
                        className="px-2 py-1.5 text-xs border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[38px]"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Receive Bundle Form */}
                {receivingForVariantId === v.id && (
                  <form
                    onSubmit={handleReceiveBundleSubmit}
                    data-testid={`form-receive-bundle-${v.id}`}
                    className="border-t border-black pt-3 bg-stone-50 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                        Receive Incoming Roll / Bundle for {v.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReceivingForVariantId(null)}
                        className="btn-inline text-xs text-alif-grey underline"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <div>
                        <label className="block editorial-label mb-1">
                          Quantity ({v.unit}) *
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="any"
                          value={receiveQtyInput}
                          onChange={(e) => setReceiveQtyInput(e.target.value)}
                          placeholder="e.g. 2.5"
                          data-testid={`input-receive-qty-${v.id}`}
                          className="w-full px-2.5 py-1.5 text-base font-mono bg-white"
                        />
                      </div>

                      <div>
                        <label className="block editorial-label mb-1">Receipt Date</label>
                        <input
                          type="date"
                          value={receiveDateInput}
                          onChange={(e) => setReceiveDateInput(e.target.value)}
                          data-testid={`input-receive-date-${v.id}`}
                          className="w-full px-2.5 py-1.5 text-base font-mono bg-white"
                        />
                      </div>

                      <div>
                        <label className="block editorial-label mb-1">Cost / {v.unit} (₹)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={receiveCostRupees}
                          onChange={(e) => setReceiveCostRupees(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-base font-mono bg-white"
                        />
                      </div>

                      <div>
                        <label className="block editorial-label mb-1">Bundle Code</label>
                        <input
                          type="text"
                          value={receiveCodeInput}
                          onChange={(e) => setReceiveCodeInput(e.target.value)}
                          placeholder="Auto if blank"
                          data-testid={`input-receive-code-${v.id}`}
                          className="w-full px-2.5 py-1.5 text-base font-mono bg-white"
                        />
                      </div>

                      <div>
                        <label className="block editorial-label mb-1">Supplier</label>
                        <input
                          type="text"
                          value={receiveSupplierInput}
                          onChange={(e) => setReceiveSupplierInput(e.target.value)}
                          placeholder="Supplier name"
                          data-testid={`input-receive-supplier-${v.id}`}
                          className="w-full px-2.5 py-1.5 text-base bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          id={`receive-roll-camera-${v.id}`}
                          data-testid={`input-receive-camera-${v.id}`}
                          onChange={(e) =>
                            handlePhotoUpload(
                              e.target.files?.[0],
                              setReceiveBundlePhotoDataUrl,
                              e.target
                            )
                          }
                          className="hidden"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          id={`receive-roll-gallery-${v.id}`}
                          data-testid={`input-receive-gallery-${v.id}`}
                          onChange={(e) =>
                            handlePhotoUpload(
                              e.target.files?.[0],
                              setReceiveBundlePhotoDataUrl,
                              e.target
                            )
                          }
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            (
                              document.getElementById(
                                `receive-roll-camera-${v.id}`
                              ) as HTMLInputElement | null
                            )?.click()
                          }
                          data-testid={`btn-receive-roll-camera-${v.id}`}
                          className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border border-black bg-white text-alif-black min-h-[34px]"
                        >
                          📷 Roll Camera
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            (
                              document.getElementById(
                                `receive-roll-gallery-${v.id}`
                              ) as HTMLInputElement | null
                            )?.click()
                          }
                          data-testid={`btn-receive-roll-gallery-${v.id}`}
                          className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white text-alif-charcoal min-h-[34px]"
                        >
                          Roll Gallery
                        </button>
                        {receiveBundlePhotoDataUrl && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhotoModal({
                                  title: `Roll Photo — ${v.name}`,
                                  dataUrl: receiveBundlePhotoDataUrl
                                })
                              }
                              className="p-0.5 border border-black bg-white"
                            >
                              <img
                                src={receiveBundlePhotoDataUrl}
                                alt="Bundle preview"
                                className="w-8 h-8 object-cover block"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => setReceiveBundlePhotoDataUrl('')}
                              data-testid={`btn-receive-roll-remove-photo-${v.id}`}
                              className="px-2 py-1 text-xs border border-alif-border bg-white text-alif-grey"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="submit"
                        data-testid={`btn-submit-receive-${v.id}`}
                        className="px-4 py-2 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider"
                      >
                        Save Incoming Bundle
                      </button>
                    </div>
                  </form>
                )}

                {/* Improvement 3: Upgraded Manual Stock Adjustment Form (Set Actual Remaining vs +/- Change + Reason Chips) */}
                {adjustingVariantId === v.id && (
                  <form
                    onSubmit={handleAdjustStockSubmit}
                    data-testid={`form-adjust-stock-${v.id}`}
                    className="border-t border-black pt-3 bg-stone-50 p-3 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-alif-black">
                        Stock Correction &amp; Adjustment — {v.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAdjustMode('exact')}
                          data-testid={`btn-adjust-mode-exact-${v.id}`}
                          className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border min-h-[34px] ${
                            adjustMode === 'exact'
                              ? 'bg-alif-black text-white border-black'
                              : 'bg-white text-alif-charcoal border-alif-border'
                          }`}
                        >
                          Set Actual Remaining
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustMode('delta')}
                          data-testid={`btn-adjust-mode-delta-${v.id}`}
                          className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wider border min-h-[34px] ${
                            adjustMode === 'delta'
                              ? 'bg-alif-black text-white border-black'
                              : 'bg-white text-alif-charcoal border-alif-border'
                          }`}
                        >
                          Change by +/-
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustingVariantId(null)}
                          className="btn-inline text-xs text-alif-grey underline ml-2"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block editorial-label mb-1">
                          Target Roll / Bundle
                        </label>
                        <select
                          value={adjustBundleId}
                          onChange={(e) => handleSelectAdjustBundle(v, e.target.value)}
                          data-testid={`select-adjust-bundle-${v.id}`}
                          className="w-full px-2.5 py-1.5 text-base bg-white"
                        >
                          <option value="">
                            Whole Variant ({formatStockQuantity(v.totalQuantity, v.unit)} avail)
                          </option>
                          {vBundles.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bundleCode} ({formatStockQuantity(b.remainingQuantity, b.unit)}{' '}
                              rem • {b.receivedDate})
                            </option>
                          ))}
                        </select>
                      </div>

                      {adjustMode === 'exact' ? (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="editorial-label">
                              Actual Remaining ({v.unit}) *
                            </label>
                            <button
                              type="button"
                              onClick={() => handleMarkRollFinished(v)}
                              data-testid={`btn-mark-roll-finished-${v.id}`}
                              className="btn-inline text-[11px] font-mono font-semibold underline text-alif-black"
                            >
                              Mark Roll Finished (0)
                            </button>
                          </div>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={adjustActualInput}
                            onChange={(e) => {
                              setAdjustActualInput(e.target.value);
                              setAdjustDeltaInput('');
                            }}
                            placeholder={`Current: ${currentAdjustBasis}`}
                            data-testid={`input-adjust-actual-${v.id}`}
                            className="w-full px-2.5 py-1.5 text-base font-mono bg-white"
                          />
                          <div className="text-[11px] font-mono text-alif-grey mt-0.5">
                            Current: {formatStockQuantity(currentAdjustBasis, v.unit)} → Delta:{' '}
                            <strong className="text-alif-black">
                              {previewComputedDelta > 0
                                ? `+${previewComputedDelta}`
                                : previewComputedDelta}{' '}
                              {v.unit}
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block editorial-label mb-1">
                            Quantity Change (+/- in {v.unit}) *
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={adjustDeltaInput}
                            onChange={(e) => setAdjustDeltaInput(e.target.value)}
                            placeholder="e.g. -1.25 or +2.0"
                            data-testid={`input-adjust-delta-${v.id}`}
                            className="w-full px-2.5 py-1.5 text-base font-mono bg-white"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block editorial-label mb-1">
                          Adjustment Reason (Required) *
                        </label>
                        <input
                          type="text"
                          value={adjustReasonInput}
                          onChange={(e) => setAdjustReasonInput(e.target.value)}
                          placeholder="e.g. Roll End Shortage"
                          data-testid={`input-adjust-reason-${v.id}`}
                          className="w-full px-2.5 py-1.5 text-base bg-white"
                        />
                      </div>
                    </div>

                    {/* 1-Tap Reason Chips */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-alif-border">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="editorial-label text-alif-charcoal">Quick Reason:</span>
                        {ADJUSTMENT_REASON_CHIPS.map((reason, rIdx) => (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => setAdjustReasonInput(reason)}
                            data-testid={`chip-adjust-reason-${v.id}-${rIdx}`}
                            className={`px-2 py-1 text-xs font-mono border min-h-[32px] ${
                              adjustReasonInput === reason
                                ? 'bg-alif-black text-white border-black font-semibold'
                                : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                            }`}
                          >
                            {reason}
                          </button>
                        ))}
                      </div>

                      <button
                        type="submit"
                        data-testid={`btn-submit-adjust-${v.id}`}
                        className="px-4 py-2 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider min-h-[38px]"
                      >
                        Record Adjustment
                      </button>
                    </div>
                  </form>
                )}

                {/* Expandable Individual Bundles / Rolls Breakdown (FIFO Order + Safe Edit & Delete) */}
                {isExpanded && (
                  <div
                    data-testid={`bundles-panel-${v.id}`}
                    className="border-t border-alif-border pt-3 space-y-2"
                  >
                    <div className="editorial-label">
                      Individual Rolls / Bundles (Ordered by Oldest Receipt Date First — FIFO)
                    </div>
                    {vBundles.length === 0 ? (
                      <div className="text-xs text-alif-grey">
                        No bundles recorded for this variant yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {vBundles.map((b, bIdx) => {
                          const alreadyUsedMilli = Math.max(
                            0,
                            toQtyUnits(b.initialQuantity) - toQtyUnits(b.remainingQuantity)
                          );
                          const isRollUnused = alreadyUsedMilli === 0;
                          const isEditingThisRoll = editingBundleId === b.id;

                          return (
                            <div
                              key={b.id}
                              data-testid={`bundle-row-${b.id}`}
                              className="p-2.5 border border-alif-border bg-stone-50 space-y-2 text-xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {b.photoDataUrl && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewPhotoModal({
                                          title: `Roll ${b.bundleCode}`,
                                          subtitle: `${v.name} • Recd ${b.receivedDate}`,
                                          dataUrl: b.photoDataUrl!
                                        })
                                      }
                                      className="p-0 border border-black shrink-0 bg-white"
                                      title="Preview roll photo"
                                    >
                                      <img
                                        src={b.photoDataUrl}
                                        alt={b.bundleCode}
                                        className="w-9 h-9 object-cover block"
                                      />
                                    </button>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-mono font-semibold text-alif-black flex items-center gap-1.5 flex-wrap">
                                      <span>
                                        #{bIdx + 1} • {b.bundleCode}
                                      </span>
                                      {bIdx === 0 && b.remainingQuantity > 0 && (
                                        <span className="px-1.5 py-0.5 text-[10px] bg-alif-black text-white uppercase">
                                          FIFO Next
                                        </span>
                                      )}
                                      {b.supplier && (
                                        <span className="px-1.5 py-0.5 text-[10px] border border-alif-border bg-white text-alif-charcoal">
                                          {b.supplier}
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-mono text-alif-grey">
                                      Recd: {b.receivedDate} • Cost: {formatINR(b.purchaseCostPaise)}
                                      /{b.unit}
                                    </div>
                                    {b.notes && (
                                      <div className="text-alif-charcoal truncate">{b.notes}</div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right font-mono">
                                    <div
                                      data-testid={`bundle-rem-qty-${b.id}`}
                                      className="font-bold text-sm text-alif-black"
                                    >
                                      {formatStockQuantity(b.remainingQuantity, b.unit)}
                                    </div>
                                    <div className="text-[11px] text-alif-grey">
                                      of {formatStockQuantity(b.initialQuantity, b.unit)}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        isEditingThisRoll
                                          ? setEditingBundleId(null)
                                          : startEditBundle(b)
                                      }
                                      data-testid={`btn-edit-bundle-${b.id}`}
                                      className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider border border-alif-border bg-white text-alif-black hover:border-black min-h-[32px]"
                                    >
                                      {isEditingThisRoll ? 'Close' : 'Edit Roll'}
                                    </button>
                                    {isRollUnused ? (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteBundle(b)}
                                        data-testid={`btn-delete-bundle-${b.id}`}
                                        className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[32px]"
                                        title="Delete unused roll"
                                      >
                                        Delete
                                      </button>
                                    ) : (
                                      <span
                                        data-testid={`bundle-used-badge-${b.id}`}
                                        className="px-1.5 py-1 text-[10px] font-mono border border-dashed border-alif-border bg-white text-alif-grey"
                                        title="Stock from this roll has been sold/deducted; deletion locked to protect FIFO history"
                                      >
                                        Used ({formatStockQuantity(fromQtyUnits(alreadyUsedMilli), b.unit)} sold)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Inline Roll Metadata & Initial Quantity Editor */}
                              {isEditingThisRoll && (
                                <form
                                  onSubmit={(e) => handleSaveBundleEdit(e, b)}
                                  data-testid={`form-edit-bundle-${b.id}`}
                                  className="border-t border-black pt-2.5 mt-2 bg-white p-2.5 space-y-2.5"
                                >
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    <div>
                                      <label className="block editorial-label mb-1">
                                        Roll Code *
                                      </label>
                                      <input
                                        type="text"
                                        value={editBundleCode}
                                        onChange={(e) => setEditBundleCode(e.target.value)}
                                        data-testid={`input-edit-bundle-code-${b.id}`}
                                        className="w-full px-2 py-1 text-sm font-mono bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block editorial-label mb-1">
                                        Initial Qty ({b.unit}) *
                                      </label>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0.01"
                                        step="any"
                                        value={editBundleInitialQty}
                                        onChange={(e) => setEditBundleInitialQty(e.target.value)}
                                        data-testid={`input-edit-bundle-init-qty-${b.id}`}
                                        className="w-full px-2 py-1 text-sm font-mono bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block editorial-label mb-1">
                                        Cost / {b.unit} (₹)
                                      </label>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="any"
                                        value={editBundleCostRupees}
                                        onChange={(e) => setEditBundleCostRupees(e.target.value)}
                                        data-testid={`input-edit-bundle-cost-${b.id}`}
                                        className="w-full px-2 py-1 text-sm font-mono bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block editorial-label mb-1">
                                        Receipt Date
                                      </label>
                                      <input
                                        type="date"
                                        value={editBundleDate}
                                        onChange={(e) => setEditBundleDate(e.target.value)}
                                        data-testid={`input-edit-bundle-date-${b.id}`}
                                        className="w-full px-2 py-1 text-sm font-mono bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="block editorial-label mb-1">
                                        Supplier
                                      </label>
                                      <input
                                        type="text"
                                        value={editBundleSupplier}
                                        onChange={(e) => setEditBundleSupplier(e.target.value)}
                                        data-testid={`input-edit-bundle-supplier-${b.id}`}
                                        className="w-full px-2 py-1 text-sm bg-white"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <input
                                      type="text"
                                      value={editBundleNotes}
                                      onChange={(e) => setEditBundleNotes(e.target.value)}
                                      placeholder="Roll notes"
                                      data-testid={`input-edit-bundle-notes-${b.id}`}
                                      className="flex-1 px-2 py-1 text-sm bg-white"
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="submit"
                                        data-testid={`btn-save-bundle-edit-${b.id}`}
                                        className="px-3 py-1.5 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider"
                                      >
                                        Save Roll Changes
                                      </button>
                                    </div>
                                  </div>
                                </form>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Stock Movement History Ledger */}
      <section
        data-testid="inventory-movements-section"
        className="bg-white border border-alif-border p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-alif-border pb-2.5">
          <div>
            <h3 className="editorial-subhead">
              Stock Movement History ({movements.length})
            </h3>
            <p className="text-xs text-alif-grey">
              Chronological audit log of stock receipts, FIFO invoice deductions, edits, and
              cancellations.
            </p>
          </div>
          <select
            value={movementVariantFilter}
            onChange={(e) => setMovementVariantFilter(e.target.value)}
            aria-label="Filter movement history by variant"
            className="px-3 py-1.5 text-xs bg-white sm:w-64"
          >
            <option value="">All Variants ({movements.length})</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {filteredMovements.length === 0 ? (
          <div className="py-6 text-center text-xs text-alif-grey">
            No stock movements recorded yet.
          </div>
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto text-xs">
            {filteredMovements.map((m) => {
              const v = variantsById[m.variantId];
              const isPositive = m.quantityDelta > 0;
              return (
                <div
                  key={m.id}
                  data-testid={`movement-row-${m.id}`}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold uppercase tracking-wider text-alif-black">
                        {m.type.replace('_', ' ')}
                      </span>
                      <span className="font-medium text-alif-charcoal">
                        {v ? v.name : m.variantId}
                      </span>
                      {m.bundleCode && (
                        <span className="font-mono px-1.5 py-0.5 bg-stone-50 border border-alif-border text-alif-charcoal">
                          {m.bundleCode}
                        </span>
                      )}
                      {m.invoiceNumber && (
                        <span className="font-mono text-alif-black underline">
                          {m.invoiceNumber}
                        </span>
                      )}
                      <span className="font-mono text-alif-grey">{m.date}</span>
                    </div>
                    <div className="text-alif-grey mt-0.5">{m.reason}</div>
                  </div>

                  <div className="text-right font-mono shrink-0">
                    <div className="font-bold text-sm text-alif-black">
                      {isPositive ? '+' : ''}
                      {formatStockQuantity(m.quantityDelta, m.unit)}
                    </div>
                    <div className="text-[11px] text-alif-grey">
                      Bal: {formatStockQuantity(m.balanceAfter, m.unit)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Full-Screen Inventory Photo Preview Modal */}
      {previewPhotoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 alif-modal-backdrop"
          role="dialog"
          aria-modal="true"
          data-testid="inv-modal-photo-preview"
        >
          <div className="bg-white border border-black max-w-md w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-alif-border pb-2.5">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-alif-black truncate">
                  {previewPhotoModal.title}
                </h4>
                {previewPhotoModal.subtitle && (
                  <p className="text-xs font-mono text-alif-grey truncate">
                    {previewPhotoModal.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                data-testid="btn-close-inv-photo-preview"
                className="px-3 py-1 text-xs font-semibold uppercase border border-alif-border text-alif-black hover:border-black"
              >
                Close ✕
              </button>
            </div>
            <div className="bg-stone-50 border border-alif-border p-2 flex items-center justify-center">
              <img
                src={previewPhotoModal.dataUrl}
                alt={previewPhotoModal.title}
                className="max-h-80 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
