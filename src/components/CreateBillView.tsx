import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CatalogueCategory,
  CatalogueItem,
  Customer,
  DiscountType,
  InventoryVariant,
  Invoice,
  NewStockVariantSpec,
  PaymentMethod,
  ShopSettings
} from '../types/billing';
import {
  calculateInvoiceTotals,
  calculateLineTotalPaise,
  formatINR,
  paiseToRupeesString,
  PAYMENT_METHOD_LABELS,
  rupeesToPaise
} from '../utils/currency';
import {
  extractInventoryHierarchy,
  findDuplicateInventoryVariant,
  findNextBlankBillingField,
  focusAndScrollElementByTestId,
  formatStockQuantity,
  generateProductPlaceholderSvg,
  getVariantStockStatus,
  normalizeCustomerPhoneDigits,
  resolveColorSwatchHex,
  searchCatalogueItems
} from '../utils/search';
import {
  compressAndResizeImage,
  createInvoice,
  deleteItemPhoto,
  FrequentlyUsedEntry,
  fromQtyUnits,
  generateId,
  getFrequentlyUsedItems,
  getTodayIsoDate,
  previewNextInvoiceNumber,
  roundStockQty,
  saveItemPhotoFromFile,
  toQtyUnits
} from '../services/billingService';
import { StatusBadge } from './StatusBadge';

export { focusAndScrollElementByTestId, findNextBlankBillingField };

interface DraftLineItem {
  id: string;
  catalogueItemId: string | null;
  inventoryVariantId: string | null;
  isNonStock: boolean;
  name: string;
  category: CatalogueCategory;
  quantity: string;
  unit: string;
  unitPriceRupees: string;
  costPricePaise?: number;
  notes: string;
  photoId?: string;
  photoDataUrl?: string;
  newStockVariantSpec?: NewStockVariantSpec;
}

interface CreateBillViewProps {
  customers: Customer[];
  catalogue: CatalogueItem[];
  inventoryVariants?: InventoryVariant[];
  invoices?: Invoice[];
  settings: ShopSettings;
  preselectedCustomer?: Customer | null;
  onBillCreated: (invoice: Invoice) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

type BillStep = 1 | 2 | 3 | 4;

export interface BillValidationResult {
  error: string | null;
  step?: BillStep;
  targetTestId?: string;
}

const STEP_LABELS: { step: BillStep; label: string; sectionId: string }[] = [
  { step: 1, label: '1. Items', sectionId: 'bill-section-items' },
  { step: 2, label: '2. Discount', sectionId: 'bill-section-discount' },
  { step: 3, label: '3. Customer', sectionId: 'bill-section-customer' },
  { step: 4, label: '4. Total & Save', sectionId: 'bill-section-save' }
];

const FRACTIONAL_FABRIC_CHIPS: number[] = [0.5, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 3.25];
const WHOLE_UNIT_CHIPS: number[] = [1, 2, 3, 4, 5];

function isFractionalFabricUnit(unit: string, category: CatalogueCategory): boolean {
  const clean = String(unit || '').trim().toLowerCase();
  if (clean === 'm' || clean === 'mtr' || clean === 'meter' || clean === 'meters' || clean === 'yd') {
    return true;
  }
  return category === 'product' && clean !== 'pc' && clean !== 'pair' && clean !== 'set';
}

export function CreateBillView({
  customers,
  catalogue,
  inventoryVariants = [],
  invoices = [],
  settings,
  preselectedCustomer,
  onBillCreated,
  onNotify
}: CreateBillViewProps) {
  const [currentStep, setCurrentStep] = useState<BillStep>(1);
  const [isDiscountOpen, setIsDiscountOpen] = useState<boolean>(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationTargetTestId, setValidationTargetTestId] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    preselectedCustomer?.id || ''
  );
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerName, setCustomerName] = useState(preselectedCustomer?.name || '');
  const [customerPhone, setCustomerPhone] = useState(preselectedCustomer?.phone || '');
  const [customerNotes, setCustomerNotes] = useState(preselectedCustomer?.notes || '');
  const [nameManuallyEdited, setNameManuallyEdited] = useState<boolean>(
    Boolean(preselectedCustomer?.name)
  );
  const [autoFilledByPhone, setAutoFilledByPhone] = useState<boolean>(
    Boolean(preselectedCustomer?.id)
  );

  const [invoiceDate, setInvoiceDate] = useState(getTodayIsoDate());
  const [collectionDate, setCollectionDate] = useState('');
  const [previewNumber, setPreviewNumber] = useState('ALIF-2026-0001');

  const [catFilter, setCatFilter] = useState<CatalogueCategory | 'all'>('all');
  const [catSearch, setCatSearch] = useState('');
  const [hierCategory, setHierCategory] = useState('');
  const [hierProductType, setHierProductType] = useState('');
  const [hierWorkDesign, setHierWorkDesign] = useState('');
  const [hierColor, setHierColor] = useState('');

  // Improvement 5: Inline "+ New Stock Item" state for creating new stock variants directly from New Bill
  const [showInlineNewStock, setShowInlineNewStock] = useState<boolean>(false);
  const [newStockCategory, setNewStockCategory] = useState<string>('Fabric');
  const [newStockProductType, setNewStockProductType] = useState<string>('');
  const [newStockWorkDesign, setNewStockWorkDesign] = useState<string>('');
  const [newStockColor, setNewStockColor] = useState<string>('');
  const [newStockUnit, setNewStockUnit] = useState<string>('m');
  const [newStockOpeningQty, setNewStockOpeningQty] = useState<string>('');
  const [newStockSoldQty, setNewStockSoldQty] = useState<string>('');
  const [newStockSellingPrice, setNewStockSellingPrice] = useState<string>('');
  const [newStockPurchaseCost, setNewStockPurchaseCost] = useState<string>('');
  const [newStockSupplier, setNewStockSupplier] = useState<string>('');
  const [newStockPhotoDataUrl, setNewStockPhotoDataUrl] = useState<string>('');

  const [frequentlyUsed, setFrequentlyUsed] = useState<FrequentlyUsedEntry[]>([]);

  const [lines, setLines] = useState<DraftLineItem[]>([]);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [activeLineField, setActiveLineField] = useState<'name' | 'qty' | 'price' | 'notes' | null>(
    null
  );

  const [discountType, setDiscountType] = useState<DiscountType>('flat');
  const [discountInput, setDiscountInput] = useState('');
  const [advanceInput, setAdvanceInput] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>(
    settings.defaultPaymentMethod || 'cash'
  );
  const [billNotes, setBillNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateId('idem'));
  const [isSaving, setIsSaving] = useState(false);

  const submittingLockRef = useRef<boolean>(false);
  const pendingFocusRef = useRef<{
    lineId: string;
    target: 'price' | 'qty' | 'name';
    selectText?: boolean;
    allowScroll?: boolean;
  } | null>(null);

  const [previewPhoto, setPreviewPhoto] = useState<{
    itemName: string;
    dataUrl: string;
  } | null>(null);

  const variantsMap = useMemo(() => {
    const map: Record<string, InventoryVariant> = {};
    for (const v of inventoryVariants) {
      map[v.id] = v;
    }
    return map;
  }, [inventoryVariants]);

  const catalogueMap = useMemo(() => {
    const map: Record<string, CatalogueItem> = {};
    for (const c of catalogue) {
      map[c.id] = c;
    }
    return map;
  }, [catalogue]);

  const inlineDuplicateVariant = useMemo(() => {
    if (!newStockCategory.trim() || !newStockProductType.trim() || !newStockColor.trim()) {
      return undefined;
    }
    return findDuplicateInventoryVariant(inventoryVariants, {
      category: newStockCategory,
      productType: newStockProductType,
      workDesign: newStockWorkDesign || 'Standard',
      color: newStockColor
    });
  }, [
    inventoryVariants,
    newStockCategory,
    newStockProductType,
    newStockWorkDesign,
    newStockColor
  ]);

  /**
   * Computes last-billed actual selling prices from saved non-cancelled invoices:
   * - Global last-billed price per catalogueItemId / inventoryVariantId / normalized item name
   * - Customer-specific last-billed price when a repeat customer is selected
   * Strictly derived from saved invoices; never pre-populates or locks selling price inputs.
   */
  const historicalPrices = useMemo(() => {
    const sortedActiveInvoices = [...invoices]
      .filter((inv) => inv.status !== 'Cancelled')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const lastByCatalogueId: Record<string, { pricePaise: number; invoiceNumber: string }> = {};
    const lastByVariantId: Record<string, { pricePaise: number; invoiceNumber: string }> = {};
    const lastByName: Record<string, { pricePaise: number; invoiceNumber: string }> = {};
    const customerLastByCatalogueId: Record<string, { pricePaise: number; invoiceNumber: string }> =
      {};
    const customerLastByVariantId: Record<string, { pricePaise: number; invoiceNumber: string }> =
      {};

    for (const inv of sortedActiveInvoices) {
      const isCurrentCust =
        Boolean(selectedCustomerId && inv.customerId === selectedCustomerId) ||
        Boolean(
          customerPhone &&
            normalizeCustomerPhoneDigits(inv.customerPhone) ===
              normalizeCustomerPhoneDigits(customerPhone) &&
            normalizeCustomerPhoneDigits(customerPhone).length >= 6
        );

      for (const item of inv.items) {
        if (!item.unitPricePaise || item.unitPricePaise <= 0) continue;
        if (item.catalogueItemId) {
          if (!lastByCatalogueId[item.catalogueItemId]) {
            lastByCatalogueId[item.catalogueItemId] = {
              pricePaise: item.unitPricePaise,
              invoiceNumber: inv.invoiceNumber
            };
          }
          if (isCurrentCust && !customerLastByCatalogueId[item.catalogueItemId]) {
            customerLastByCatalogueId[item.catalogueItemId] = {
              pricePaise: item.unitPricePaise,
              invoiceNumber: inv.invoiceNumber
            };
          }
        }
        if (item.inventoryVariantId) {
          if (!lastByVariantId[item.inventoryVariantId]) {
            lastByVariantId[item.inventoryVariantId] = {
              pricePaise: item.unitPricePaise,
              invoiceNumber: inv.invoiceNumber
            };
          }
          if (isCurrentCust && !customerLastByVariantId[item.inventoryVariantId]) {
            customerLastByVariantId[item.inventoryVariantId] = {
              pricePaise: item.unitPricePaise,
              invoiceNumber: inv.invoiceNumber
            };
          }
        }
        const normName = item.name.trim().toLowerCase();
        if (normName && !lastByName[normName]) {
          lastByName[normName] = {
            pricePaise: item.unitPricePaise,
            invoiceNumber: inv.invoiceNumber
          };
        }
      }
    }

    return {
      lastByCatalogueId,
      lastByVariantId,
      lastByName,
      customerLastByCatalogueId,
      customerLastByVariantId
    };
  }, [invoices, selectedCustomerId, customerPhone]);

  /**
   * Computes previous unpaid balance and bill count for each customer from saved active invoices.
   */
  const customerLedgerSummaryMap = useMemo(() => {
    const map: Record<
      string,
      { billCount: number; outstandingPaise: number; lastBillDate?: string }
    > = {};
    for (const inv of invoices) {
      if (inv.status === 'Cancelled') continue;
      const cur = map[inv.customerId] || {
        billCount: 0,
        outstandingPaise: 0,
        lastBillDate: undefined
      };
      cur.billCount += 1;
      cur.outstandingPaise += inv.balancePaise;
      if (!cur.lastBillDate || inv.invoiceDate > cur.lastBillDate) {
        cur.lastBillDate = inv.invoiceDate;
      }
      map[inv.customerId] = cur;
    }
    return map;
  }, [invoices]);

  const hierarchyOptions = useMemo(
    () =>
      extractInventoryHierarchy(
        inventoryVariants,
        hierCategory,
        hierProductType,
        hierWorkDesign
      ),
    [inventoryVariants, hierCategory, hierProductType, hierWorkDesign]
  );

  useEffect(() => {
    if (preselectedCustomer) {
      setSelectedCustomerId(preselectedCustomer.id);
      setCustomerName(preselectedCustomer.name);
      setCustomerPhone(preselectedCustomer.phone);
      setCustomerNotes(preselectedCustomer.notes || '');
      setNameManuallyEdited(true);
      setAutoFilledByPhone(true);
    }
  }, [preselectedCustomer]);

  useEffect(() => {
    previewNextInvoiceNumber(invoiceDate).then(setPreviewNumber).catch(() => {});
  }, [invoiceDate]);

  useEffect(() => {
    getFrequentlyUsedItems(8)
      .then(setFrequentlyUsed)
      .catch(() => {});
  }, [catalogue, inventoryVariants, invoices]);

  // Detect virtual keyboard on mobile and ensure the active input is never covered by the soft keyboard
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const initialHeight = window.innerHeight;
    const handleResize = () => {
      const keyboardNowOpen = vv.height < initialHeight * 0.78;
      setIsKeyboardOpen(keyboardNowOpen);
      if (keyboardNowOpen && typeof document !== 'undefined') {
        const activeEl = document.activeElement as HTMLElement | null;
        const tag = activeEl?.tagName;
        if (
          activeEl &&
          (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') &&
          typeof activeEl.getBoundingClientRect === 'function'
        ) {
          const rect = activeEl.getBoundingClientRect();
          if (rect.bottom > vv.height - 20 || rect.top < 88) {
            try {
              activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_e) {
              // Ignore
            }
          }
        }
      }
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  /**
   * Auto-Focus WITHOUT Premature Page Scroll:
   * Because `allowScroll` is `false`, selecting 1, 2, 3, or more products NEVER scrolls the page
   * away from the product catalogue/search area.
   */
  useEffect(() => {
    if (!pendingFocusRef.current || lines.length === 0) return;
    const { lineId, target, selectText, allowScroll } = pendingFocusRef.current;
    const idx = lines.findIndex((l) => l.id === lineId);
    if (idx === -1) return;
    pendingFocusRef.current = null;

    const testId =
      target === 'price'
        ? `line-price-${idx}`
        : target === 'qty'
        ? `line-qty-${idx}`
        : `line-name-${idx}`;

    setActiveLineId(lineId);
    setActiveLineField(target);

    focusAndScrollElementByTestId(testId, {
      selectText: Boolean(selectText),
      allowScroll: Boolean(allowScroll)
    });
  }, [lines]);

  // Phone-first customer lookup candidates
  const phoneLookupMatches = useMemo(() => {
    const typedDigits = normalizeCustomerPhoneDigits(customerPhone);
    const searchQ = customerSearch.trim().toLowerCase();

    if (searchQ) {
      return customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(searchQ) ||
            c.phone.toLowerCase().includes(searchQ)
        )
        .slice(0, 8);
    }

    if (typedDigits.length >= 3) {
      return customers
        .filter((c) => normalizeCustomerPhoneDigits(c.phone).includes(typedDigits))
        .slice(0, 6);
    }

    return customers.slice(0, 6);
  }, [customers, customerPhone, customerSearch]);

  const matchedCustomerSummary = useMemo(() => {
    if (!selectedCustomerId) return null;
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) return null;
    const ledger = customerLedgerSummaryMap[selectedCustomerId] || {
      billCount: 0,
      outstandingPaise: 0
    };
    return { customer: cust, ledger };
  }, [selectedCustomerId, customers, customerLedgerSummaryMap]);

  const rankedCatalogueResults = useMemo(() => {
    const base = catalogue.filter((item) => {
      if (!item.isActive) return false;
      if (catFilter !== 'all' && item.category !== catFilter) return false;

      const linkedVar = item.inventoryVariantId
        ? variantsMap[item.inventoryVariantId]
        : undefined;
      if (linkedVar && !linkedVar.isActive) return false;

      if (hierCategory) {
        const c = linkedVar?.category || '';
        if (c !== hierCategory) return false;
      }
      if (hierProductType) {
        const pt = item.productType || linkedVar?.productType || '';
        if (pt !== hierProductType) return false;
      }
      if (hierWorkDesign) {
        const wd = item.workDesign || linkedVar?.workDesign || '';
        if (wd !== hierWorkDesign) return false;
      }
      if (hierColor) {
        const cl = item.color || linkedVar?.color || '';
        if (cl !== hierColor) return false;
      }
      return true;
    });

    return searchCatalogueItems(base, variantsMap, catSearch);
  }, [
    catalogue,
    variantsMap,
    catFilter,
    catSearch,
    hierCategory,
    hierProductType,
    hierWorkDesign,
    hierColor
  ]);

  function handleSelectExistingCustomer(cust: Customer, moveFocusToAdvance = false) {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    setCustomerNotes(cust.notes || '');
    setNameManuallyEdited(true);
    setAutoFilledByPhone(true);
    setCustomerSearch('');
    setValidationError(null);
    setValidationTargetTestId(null);

    if (moveFocusToAdvance) {
      setTimeout(() => {
        focusAndScrollElementByTestId('input-advance-amount', {
          selectText: true,
          allowScroll: true
        });
      }, 20);
    }
  }

  function handleCustomerPhoneChange(rawVal: string) {
    setCustomerPhone(rawVal);
    setValidationError(null);
    setValidationTargetTestId(null);

    const digits = normalizeCustomerPhoneDigits(rawVal);

    if (digits.length === 10) {
      const exactMatches = customers.filter(
        (c) => normalizeCustomerPhoneDigits(c.phone) === digits
      );
      if (exactMatches.length === 1) {
        const match = exactMatches[0];
        setSelectedCustomerId(match.id);
        if (!nameManuallyEdited || autoFilledByPhone || !customerName.trim()) {
          setCustomerName(match.name);
          setCustomerNotes(match.notes || '');
          setAutoFilledByPhone(true);
        }
        return;
      }
    }

    if (selectedCustomerId) {
      const prevCust = customers.find((c) => c.id === selectedCustomerId);
      if (prevCust && normalizeCustomerPhoneDigits(prevCust.phone) !== digits) {
        setSelectedCustomerId('');
        if (autoFilledByPhone && !nameManuallyEdited) {
          setCustomerName('');
          setCustomerNotes('');
        }
        setAutoFilledByPhone(false);
      }
    }
  }

  function handleCustomerNameChange(rawVal: string) {
    setCustomerName(rawVal);
    setNameManuallyEdited(rawVal.trim().length > 0);
    setAutoFilledByPhone(false);
    setValidationError(null);
    setValidationTargetTestId(null);
  }

  /**
   * Adds a catalogue item (or stock-linked material) to the bill WITHOUT scrolling the page.
   * Neither quantity nor selling price is pre-filled.
   */
  function addCatalogueItemToBill(item: CatalogueItem) {
    const newId = generateId('row');
    const linkedVar =
      item.category !== 'service' && item.inventoryVariantId
        ? variantsMap[item.inventoryVariantId]
        : undefined;

    pendingFocusRef.current = {
      lineId: newId,
      target: 'qty',
      selectText: false,
      allowScroll: false
    };
    setValidationError(null);
    setValidationTargetTestId(null);

    setLines((prev) => [
      ...prev,
      {
        id: newId,
        catalogueItemId: item.id,
        inventoryVariantId: linkedVar ? linkedVar.id : item.inventoryVariantId ?? null,
        isNonStock: item.category === 'service' || !item.inventoryVariantId,
        name: linkedVar ? linkedVar.name : item.name,
        category: item.category,
        quantity: '',
        unit: linkedVar ? linkedVar.unit : item.unit,
        unitPriceRupees: '',
        costPricePaise: linkedVar ? linkedVar.purchaseCostPaise : item.costPricePaise,
        notes: ''
      }
    ]);
  }

  function addBlankCustomItem() {
    const newId = generateId('row');
    pendingFocusRef.current = {
      lineId: newId,
      target: 'name',
      selectText: false,
      allowScroll: false
    };
    setValidationError(null);
    setValidationTargetTestId(null);
    setLines((prev) => [
      ...prev,
      {
        id: newId,
        catalogueItemId: null,
        inventoryVariantId: null,
        isNonStock: true,
        name: '',
        category: 'custom',
        quantity: '',
        unit: 'pc',
        unitPriceRupees: '',
        notes: ''
      }
    ]);
  }

  /**
   * Improvement 5: Adds a newly arrived physical stock variant + opening roll directly from New Bill.
   * The variant, opening roll, movement, and catalogue item are created atomically inside `createInvoice`
   * ONLY when `Save Bill` succeeds.
   */
  function handleAddInlineNewStockItem() {
    const cat = newStockCategory.trim() || 'Fabric';
    const prodType = newStockProductType.trim();
    const workDes = newStockWorkDesign.trim() || 'Standard';
    const col = newStockColor.trim();
    const unit = newStockUnit.trim() || 'm';
    const openingQty = roundStockQty(Number(newStockOpeningQty || 0));

    if (!prodType) {
      onNotify('Please enter Product Type for the new stock item (e.g. Fandy Silk).', true);
      focusAndScrollElementByTestId('new-stock-product-type', { allowScroll: false });
      return;
    }
    if (!col) {
      onNotify('Please enter Colour for the new stock item (e.g. Peacock Blue).', true);
      focusAndScrollElementByTestId('new-stock-color', { allowScroll: false });
      return;
    }
    if (!Number.isFinite(openingQty) || openingQty <= 0) {
      onNotify('Please enter an Opening Roll Stock Quantity greater than 0.', true);
      focusAndScrollElementByTestId('new-stock-opening-qty', { allowScroll: false });
      return;
    }

    if (inlineDuplicateVariant) {
      onNotify(
        `Variant "${inlineDuplicateVariant.name}" already exists in Inventory. Use the existing item instead.`,
        true
      );
      return;
    }

    const soldQtyStr = newStockSoldQty.trim();
    if (soldQtyStr && Number(soldQtyStr) > openingQty) {
      onNotify(
        `Sold quantity (${soldQtyStr} ${unit}) cannot exceed opening roll stock (${openingQty} ${unit}).`,
        true
      );
      focusAndScrollElementByTestId('new-stock-sold-qty', { allowScroll: false });
      return;
    }

    const purchaseCostPaise = newStockPurchaseCost.trim()
      ? rupeesToPaise(newStockPurchaseCost)
      : 0;
    const defaultSellingPricePaise = newStockSellingPrice.trim()
      ? rupeesToPaise(newStockSellingPrice)
      : 0;

    const fullName = `${col} ${prodType} — ${workDes}`;
    const newId = generateId('row');
    const nextFocusTarget = !soldQtyStr
      ? 'qty'
      : !newStockSellingPrice.trim()
      ? 'price'
      : 'price';

    pendingFocusRef.current = {
      lineId: newId,
      target: nextFocusTarget,
      selectText: false,
      allowScroll: false
    };
    setValidationError(null);
    setValidationTargetTestId(null);

    setLines((prev) => [
      ...prev,
      {
        id: newId,
        catalogueItemId: null,
        inventoryVariantId: null,
        isNonStock: false,
        name: fullName,
        category: 'product',
        quantity: soldQtyStr,
        unit,
        unitPriceRupees: newStockSellingPrice.trim(),
        costPricePaise: purchaseCostPaise,
        notes: '',
        photoDataUrl: newStockPhotoDataUrl || undefined,
        newStockVariantSpec: {
          category: cat,
          productType: prodType,
          workDesign: workDes,
          color: col,
          unit,
          openingStockQuantity: openingQty,
          purchaseCostPaise,
          defaultSellingPricePaise,
          supplier: newStockSupplier.trim() || undefined,
          photoDataUrl: newStockPhotoDataUrl || undefined
        }
      }
    ]);

    // Clear per-colour fields so another colour or item can be added easily
    setNewStockColor('');
    setNewStockOpeningQty('');
    setNewStockSoldQty('');
    setNewStockPhotoDataUrl('');
    setShowInlineNewStock(false);
    onNotify(
      `Added new stock item "${fullName}" (Opening roll: ${formatStockQuantity(openingQty, unit)})`
    );
  }

  function updateLine(id: string, patch: Partial<DraftLineItem>) {
    setValidationError(null);
    setValidationTargetTestId(null);
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function applyQuickQuantity(lineId: string, lineIndex: number, newQty: number) {
    const cleanQty = Math.max(0.05, roundStockQty(newQty));
    updateLine(lineId, { quantity: String(cleanQty) });
    const targetLine = lines[lineIndex];
    if (targetLine && !targetLine.unitPriceRupees.trim()) {
      setActiveLineId(lineId);
      setActiveLineField('price');
      focusAndScrollElementByTestId(`line-price-${lineIndex}`, {
        selectText: true,
        allowScroll: false
      });
    }
  }

  function stepLineQuantity(lineId: string, currentQtyStr: string, delta: number) {
    const cur = Number(currentQtyStr) || 0;
    const next = Math.max(0.25, roundStockQty(cur + delta));
    updateLine(lineId, { quantity: String(next) });
  }

  function applyPriceShortcut(lineId: string, lineIndex: number, pricePaise: number) {
    const rupeesStr = paiseToRupeesString(pricePaise);
    const updatedLines = lines.map((l, idx) =>
      idx === lineIndex ? { ...l, unitPriceRupees: rupeesStr } : l
    );
    updateLine(lineId, { unitPriceRupees: rupeesStr });

    const nextBlank = findNextBlankBillingField({
      lines: updatedLines,
      customerPhone,
      customerName,
      startAfterLineIdx: lineIndex
    });

    if (nextBlank.section === 'items' && nextBlank.lineId && nextBlank.field) {
      setActiveLineId(nextBlank.lineId);
      setActiveLineField(nextBlank.field);
      focusAndScrollElementByTestId(nextBlank.testId, {
        selectText: nextBlank.selectText,
        allowScroll: false
      });
      return;
    }

    setActiveLineId(lineId);
    setActiveLineField('price');
    focusAndScrollElementByTestId(`line-price-${lineIndex}`, {
      selectText: false,
      allowScroll: false
    });
  }

  function focusNextBlankOrAdvanceSection(startAfterLineIdx = -1) {
    const nextTarget = findNextBlankBillingField({
      lines,
      customerPhone,
      customerName,
      startAfterLineIdx
    });

    if (nextTarget.section === 'items') {
      setCurrentStep(1);
      if (nextTarget.lineId) setActiveLineId(nextTarget.lineId);
      if (nextTarget.field) setActiveLineField(nextTarget.field);
      focusAndScrollElementByTestId(nextTarget.testId, {
        selectText: nextTarget.selectText,
        allowScroll: true
      });
      return;
    }

    if (nextTarget.section === 'customer') {
      setCurrentStep(3);
      focusAndScrollElementByTestId(nextTarget.testId, {
        selectText: nextTarget.selectText,
        allowScroll: true,
        forceScroll: true
      });
      return;
    }

    setCurrentStep(4);
    focusAndScrollElementByTestId(nextTarget.testId, {
      selectText: nextTarget.selectText,
      allowScroll: true,
      forceScroll: true
    });
  }

  function scrollBackToCatalogue() {
    setCurrentStep(1);
    if (typeof document !== 'undefined') {
      const catEl = document.getElementById('bill-catalogue-card');
      if (catEl && typeof catEl.scrollIntoView === 'function') {
        try {
          catEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_e) {
          catEl.scrollIntoView();
        }
      }
    }
  }

  function handleFieldKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    stepType:
      | { kind: 'line-name'; idx: number }
      | { kind: 'line-qty'; idx: number }
      | { kind: 'line-price'; idx: number }
      | { kind: 'line-notes'; idx: number }
      | { kind: 'discount-value' }
      | { kind: 'customer-phone' }
      | { kind: 'customer-name' }
      | { kind: 'advance-amount' }
  ) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    if (stepType.kind === 'line-name') {
      const line = lines[stepType.idx];
      if (line) {
        setActiveLineId(line.id);
        setActiveLineField('qty');
      }
      focusAndScrollElementByTestId(`line-qty-${stepType.idx}`, {
        selectText: true,
        allowScroll: true
      });
      return;
    }

    if (stepType.kind === 'line-qty') {
      const line = lines[stepType.idx];
      if (line) {
        setActiveLineId(line.id);
        setActiveLineField('price');
      }
      focusAndScrollElementByTestId(`line-price-${stepType.idx}`, {
        selectText: true,
        allowScroll: true
      });
      return;
    }

    if (stepType.kind === 'line-price' || stepType.kind === 'line-notes') {
      focusNextBlankOrAdvanceSection(stepType.idx);
      return;
    }

    if (stepType.kind === 'discount-value') {
      focusNextBlankOrAdvanceSection(lines.length - 1);
      return;
    }

    if (stepType.kind === 'customer-phone') {
      if (customerName.trim()) {
        setCurrentStep(4);
        focusAndScrollElementByTestId('input-advance-amount', {
          selectText: true,
          allowScroll: true,
          forceScroll: true
        });
      } else {
        focusAndScrollElementByTestId('input-customer-name', {
          selectText: false,
          allowScroll: true
        });
      }
      return;
    }

    if (stepType.kind === 'customer-name') {
      if (normalizeCustomerPhoneDigits(customerPhone).length < 6) {
        focusAndScrollElementByTestId('input-customer-phone', {
          selectText: false,
          allowScroll: true
        });
      } else {
        setCurrentStep(4);
        focusAndScrollElementByTestId('input-advance-amount', {
          selectText: true,
          allowScroll: true,
          forceScroll: true
        });
      }
      return;
    }

    if (stepType.kind === 'advance-amount') {
      (e.currentTarget as HTMLInputElement).blur();
      focusAndScrollElementByTestId('btn-save-bill', { allowScroll: true });
    }
  }

  function handleLineStockVariantChange(lineId: string, variantIdOrEmpty: string) {
    setValidationError(null);
    setValidationTargetTestId(null);
    if (!variantIdOrEmpty) {
      updateLine(lineId, {
        inventoryVariantId: null,
        isNonStock: true
      });
      return;
    }
    const targetVar = variantsMap[variantIdOrEmpty];
    if (!targetVar) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          inventoryVariantId: targetVar.id,
          isNonStock: false,
          newStockVariantSpec: undefined,
          unit: targetVar.unit,
          costPricePaise: targetVar.purchaseCostPaise,
          name: l.name.trim() ? l.name : targetVar.name
        };
      })
    );
  }

  async function removeLine(id: string) {
    const target = lines.find((l) => l.id === id);
    setLines((prev) => prev.filter((line) => line.id !== id));
    if (activeLineId === id) {
      setActiveLineId(null);
      setActiveLineField(null);
    }
    if (target?.photoId) {
      try {
        await deleteItemPhoto(target.photoId);
      } catch (_e) {
        // Ignore cleanup error
      }
    }
  }

  function moveLine(index: number, direction: -1 | 1) {
    setLines((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  }

  async function handlePhotoSelected(
    lineId: string,
    file: File | undefined,
    inputEl?: HTMLInputElement | null
  ) {
    if (!file) return;
    const currentLine = lines.find((l) => l.id === lineId);
    try {
      const savedPhoto = await saveItemPhotoFromFile({
        file,
        lineItemId: lineId,
        existingPhotoId: currentLine?.photoId
      });
      updateLine(lineId, {
        photoId: savedPhoto.id,
        photoDataUrl: savedPhoto.dataUrl
      });
      onNotify(`Attached photo to ${currentLine?.name || 'item'}`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not attach photo', true);
    } finally {
      if (inputEl) {
        inputEl.value = '';
      }
    }
  }

  async function handleRemovePhoto(lineId: string) {
    const currentLine = lines.find((l) => l.id === lineId);
    if (!currentLine?.photoId) return;
    const oldPhotoId = currentLine.photoId;
    updateLine(lineId, {
      photoId: undefined,
      photoDataUrl: undefined
    });
    try {
      await deleteItemPhoto(oldPhotoId);
      onNotify('Removed item photo');
    } catch (_err) {
      onNotify('Removed item photo');
    }
  }

  const calculated = useMemo(() => {
    const parsedLines = lines.map((l) => {
      const qty = Math.max(0, roundStockQty(Number(l.quantity) || 0));
      let unitPaise = 0;
      try {
        unitPaise = Math.max(0, rupeesToPaise(l.unitPriceRupees || '0'));
      } catch (_e) {
        unitPaise = 0;
      }
      const lineTotalPaise = qty > 0 ? calculateLineTotalPaise(qty, unitPaise) : 0;
      return {
        ...l,
        qty,
        unitPaise,
        lineTotalPaise
      };
    });

    let discountVal = 0;
    try {
      discountVal =
        discountType === 'flat'
          ? Math.max(0, rupeesToPaise(discountInput || '0'))
          : Math.max(0, Math.min(100, Number(discountInput) || 0));
    } catch (_e) {
      discountVal = 0;
    }

    const totals = calculateInvoiceTotals({
      items: parsedLines
        .filter((l) => l.qty > 0)
        .map((l) => ({ quantity: l.qty, unitPricePaise: l.unitPaise })),
      discountType,
      discountValue: discountVal,
      taxEnabled: settings.taxEnabled,
      taxRatePercent: settings.taxRatePercent
    });

    let advancePaise = 0;
    try {
      advancePaise = Math.max(0, rupeesToPaise(advanceInput || '0'));
    } catch (_e) {
      advancePaise = 0;
    }

    const balancePaise = Math.max(0, totals.totalPaise - advancePaise);
    const status =
      totals.totalPaise === 0 || advancePaise >= totals.totalPaise
        ? 'Paid'
        : advancePaise > 0
        ? 'Partially Paid'
        : 'Unpaid';

    return {
      parsedLines,
      discountVal,
      totals,
      advancePaise,
      balancePaise,
      status
    };
  }, [lines, discountType, discountInput, advanceInput, settings]);

  function validateStep1Detail(): BillValidationResult {
    if (calculated.parsedLines.length === 0) {
      return {
        error: 'Please select at least one product or service.',
        step: 1,
        targetTestId: 'bill-catalogue-search'
      };
    }
    const requestedMilliByVariant = new Map<string, number>();
    const firstLineIdxByVariant = new Map<string, number>();

    for (let i = 0; i < calculated.parsedLines.length; i++) {
      const l = calculated.parsedLines[i];
      if (!l.name.trim()) {
        return {
          error: `Item #${i + 1} requires a name.`,
          step: 1,
          targetTestId: `line-name-${i}`
        };
      }
      if (l.qty <= 0) {
        return {
          error: `Item "${l.name}" must have a quantity greater than 0.`,
          step: 1,
          targetTestId: `line-qty-${i}`
        };
      }
      if (
        l.unitPriceRupees.trim() === '' ||
        isNaN(Number(l.unitPriceRupees)) ||
        l.unitPaise < 0
      ) {
        return {
          error: `Please enter a valid selling price for "${l.name}".`,
          step: 1,
          targetTestId: `line-price-${i}`
        };
      }

      if (l.newStockVariantSpec) {
        const openMilli = toQtyUnits(l.newStockVariantSpec.openingStockQuantity);
        const reqMilli = toQtyUnits(l.qty);
        if (reqMilli > openMilli) {
          return {
            error: `Insufficient opening stock for "${l.name}": opening roll is ${formatStockQuantity(
              l.newStockVariantSpec.openingStockQuantity,
              l.unit
            )}, but bill quantity is ${formatStockQuantity(l.qty, l.unit)}.`,
            step: 1,
            targetTestId: `line-qty-${i}`
          };
        }
      }

      if (l.category !== 'service' && !l.isNonStock && l.inventoryVariantId) {
        const cur = requestedMilliByVariant.get(l.inventoryVariantId) || 0;
        requestedMilliByVariant.set(l.inventoryVariantId, cur + toQtyUnits(l.qty));
        if (!firstLineIdxByVariant.has(l.inventoryVariantId)) {
          firstLineIdxByVariant.set(l.inventoryVariantId, i);
        }
      }
    }

    // Validate available inventory stock across all lines referencing the same variant
    for (const [varId, reqMilli] of requestedMilliByVariant.entries()) {
      const v = variantsMap[varId];
      if (v) {
        const availMilli = toQtyUnits(v.totalQuantity);
        if (reqMilli > availMilli) {
          const lineIdx = firstLineIdxByVariant.get(varId) ?? 0;
          return {
            error: `Insufficient stock for "${v.name}": requested ${formatStockQuantity(
              fromQtyUnits(reqMilli),
              v.unit
            )}, available ${formatStockQuantity(v.totalQuantity, v.unit)}.`,
            step: 1,
            targetTestId: `line-qty-${lineIdx}`
          };
        }
      }
    }

    return { error: null };
  }

  function validateStep2Detail(): BillValidationResult {
    if (discountInput.trim() !== '') {
      const num = Number(discountInput);
      if (isNaN(num) || num < 0) {
        return {
          error: 'Discount cannot be negative.',
          step: 2,
          targetTestId: 'input-discount-value'
        };
      }
      if (discountType === 'percent' && num > 100) {
        return {
          error: 'Percentage discount cannot exceed 100%.',
          step: 2,
          targetTestId: 'input-discount-value'
        };
      }
    }
    return { error: null };
  }

  function validateStep3Detail(): BillValidationResult {
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 6) {
      if (!customerName.trim()) {
        return {
          error:
            'Please enter the customer name and a valid customer phone number (at least 6 digits).',
          step: 3,
          targetTestId: 'input-customer-phone'
        };
      }
      return {
        error: 'Please enter a valid customer phone number (at least 6 digits).',
        step: 3,
        targetTestId: 'input-customer-phone'
      };
    }
    if (!customerName.trim()) {
      return {
        error: 'Please enter the customer name.',
        step: 3,
        targetTestId: 'input-customer-name'
      };
    }
    return { error: null };
  }

  function validateForm(): BillValidationResult {
    const s1 = validateStep1Detail();
    if (s1.error) return s1;
    const s2 = validateStep2Detail();
    if (s2.error) return s2;
    const s3 = validateStep3Detail();
    if (s3.error) return s3;
    if (calculated.advancePaise > calculated.totals.totalPaise) {
      return {
        error: 'Advance received cannot exceed the final bill total.',
        step: 4,
        targetTestId: 'input-advance-amount'
      };
    }
    return { error: null };
  }

  function applyValidationFailureFocus(res: BillValidationResult) {
    if (!res.error) return;
    setValidationError(res.error);
    setValidationTargetTestId(res.targetTestId || null);
    onNotify(res.error, true);

    if (res.step === 2) {
      setIsDiscountOpen(true);
    }
    if (res.step) {
      setCurrentStep(res.step);
    }
    if (res.targetTestId) {
      setTimeout(() => {
        focusAndScrollElementByTestId(res.targetTestId!, {
          selectText: true,
          allowScroll: true,
          forceScroll: true
        });
      }, 25);
    }
  }

  function scrollToSection(step: BillStep) {
    setCurrentStep(step);
    if (step === 2) {
      setIsDiscountOpen(true);
    }
    if (typeof document !== 'undefined') {
      const meta = STEP_LABELS.find((s) => s.step === step);
      const el = meta ? document.getElementById(meta.sectionId) : null;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function handleContinueFromItems() {
    const res = validateStep1Detail();
    if (res.error) {
      applyValidationFailureFocus(res);
      return;
    }
    focusNextBlankOrAdvanceSection(lines.length - 1);
  }

  function handleContinue() {
    if (currentStep === 1) {
      const res = validateStep1Detail();
      if (res.error) {
        applyValidationFailureFocus(res);
        return;
      }
      scrollToSection(3);
      focusNextBlankOrAdvanceSection(lines.length - 1);
    } else if (currentStep === 2) {
      const res = validateStep2Detail();
      if (res.error) {
        applyValidationFailureFocus(res);
        return;
      }
      scrollToSection(3);
      focusNextBlankOrAdvanceSection(lines.length - 1);
    } else if (currentStep === 3) {
      const res = validateStep3Detail();
      if (res.error) {
        applyValidationFailureFocus(res);
        return;
      }
      scrollToSection(4);
      focusAndScrollElementByTestId('input-advance-amount', {
        selectText: true,
        allowScroll: true,
        forceScroll: true
      });
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      scrollToSection((currentStep - 1) as BillStep);
    }
  }

  async function handleSaveBill() {
    if (isSaving || submittingLockRef.current) return;
    const validation = validateForm();
    if (validation.error) {
      applyValidationFailureFocus(validation);
      return;
    }

    submittingLockRef.current = true;
    setIsSaving(true);
    setValidationError(null);
    setValidationTargetTestId(null);
    try {
      const result = await createInvoice({
        customerId: selectedCustomerId || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerNotes: customerNotes.trim(),
        invoiceDate,
        collectionDate: collectionDate || undefined,
        items: calculated.parsedLines.map((l) => ({
          id: l.id,
          catalogueItemId: l.catalogueItemId,
          inventoryVariantId:
            l.category === 'service' || l.isNonStock ? null : l.inventoryVariantId,
          isNonStock: l.category === 'service' ? true : l.isNonStock,
          name: l.name.trim(),
          category: l.category,
          quantity: l.qty,
          unit: l.unit.trim() || 'pc',
          unitPricePaise: l.unitPaise,
          costPricePaise: l.costPricePaise,
          notes: l.notes.trim() || undefined,
          photoId: l.photoId,
          newStockVariantSpec: l.newStockVariantSpec
            ? {
                ...l.newStockVariantSpec,
                defaultSellingPricePaise:
                  l.unitPaise > 0
                    ? l.unitPaise
                    : l.newStockVariantSpec.defaultSellingPricePaise
              }
            : undefined
        })),
        discountType,
        discountValue: calculated.discountVal,
        advancePaise: calculated.advancePaise,
        advanceMethod,
        notes: billNotes.trim(),
        idempotencyKey
      });

      setIdempotencyKey(generateId('idem'));
      setLines([]);
      setActiveLineId(null);
      setActiveLineField(null);
      setDiscountType('flat');
      setDiscountInput('');
      setIsDiscountOpen(false);
      setAdvanceInput('');
      setBillNotes('');
      setCollectionDate('');
      if (!preselectedCustomer) {
        setSelectedCustomerId('');
        setCustomerName('');
        setCustomerPhone('');
        setCustomerNotes('');
        setNameManuallyEdited(false);
        setAutoFilledByPhone(false);
      }
      setCurrentStep(1);
      onNotify(`Saved bill ${result.invoice.invoiceNumber} (${formatINR(result.invoice.totalPaise)})`);
      onBillCreated(result.invoice);
    } catch (err: any) {
      const msg = err?.message || 'Failed to save bill';
      setValidationError(msg);
      onNotify(msg, true);
    } finally {
      submittingLockRef.current = false;
      setIsSaving(false);
    }
  }

  function getLinePriceShortcuts(line: DraftLineItem): {
    lastBilledPaise?: number;
    lastBilledLabel?: string;
    referencePaise?: number;
  } {
    let lastBilledPaise: number | undefined;
    let lastBilledLabel: string | undefined;

    if (
      line.catalogueItemId &&
      historicalPrices.customerLastByCatalogueId[line.catalogueItemId]
    ) {
      lastBilledPaise =
        historicalPrices.customerLastByCatalogueId[line.catalogueItemId].pricePaise;
      lastBilledLabel = 'Client Last Rate';
    } else if (
      line.inventoryVariantId &&
      historicalPrices.customerLastByVariantId[line.inventoryVariantId]
    ) {
      lastBilledPaise =
        historicalPrices.customerLastByVariantId[line.inventoryVariantId].pricePaise;
      lastBilledLabel = 'Client Last Rate';
    } else if (
      line.catalogueItemId &&
      historicalPrices.lastByCatalogueId[line.catalogueItemId]
    ) {
      lastBilledPaise = historicalPrices.lastByCatalogueId[line.catalogueItemId].pricePaise;
      lastBilledLabel = 'Last Billed';
    } else if (
      line.inventoryVariantId &&
      historicalPrices.lastByVariantId[line.inventoryVariantId]
    ) {
      lastBilledPaise = historicalPrices.lastByVariantId[line.inventoryVariantId].pricePaise;
      lastBilledLabel = 'Last Billed';
    } else {
      const norm = line.name.trim().toLowerCase();
      if (norm && historicalPrices.lastByName[norm]) {
        lastBilledPaise = historicalPrices.lastByName[norm].pricePaise;
        lastBilledLabel = 'Last Billed';
      }
    }

    let referencePaise: number | undefined;
    if (line.inventoryVariantId && variantsMap[line.inventoryVariantId]) {
      const refP = variantsMap[line.inventoryVariantId].defaultSellingPricePaise;
      if (refP > 0 && refP !== lastBilledPaise) {
        referencePaise = refP;
      }
    } else if (line.catalogueItemId && catalogueMap[line.catalogueItemId]) {
      const refP = catalogueMap[line.catalogueItemId].defaultPricePaise;
      if (refP > 0 && refP !== lastBilledPaise) {
        referencePaise = refP;
      }
    }

    return { lastBilledPaise, lastBilledLabel, referencePaise };
  }

  const hasDiscountApplied = calculated.totals.discountPaise > 0 || discountInput.trim() !== '';
  const step1Done = lines.length > 0 && !validateStep1Detail().error;
  const step3Done =
    customerName.trim().length > 0 && customerPhone.replace(/\D/g, '').length >= 6;
  const normalizedTypedPhone = normalizeCustomerPhoneDigits(customerPhone);
  const blankPriceLinesCount = lines.filter(
    (l) => !l.name.trim() || !(Number(l.quantity) > 0) || !l.unitPriceRupees.trim()
  ).length;

  return (
    <div
      className="space-y-6 pb-12"
      onFocusCapture={(e) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          setIsKeyboardOpen(true);
        }
      }}
      onBlurCapture={() => {
        setTimeout(() => {
          if (typeof document !== 'undefined') {
            const activeTag = document.activeElement?.tagName;
            if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT') {
              setIsKeyboardOpen(false);
            }
          }
        }, 120);
      }}
    >
      {/* Header & Section Jump Bar */}
      <div className="border-b border-black pb-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="editorial-label">Point of Sale • Tailoring &amp; Materials</div>
            <h2 className="editorial-heading mt-0.5">New Bill</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="editorial-label">Bill No</span>
            <span
              className="font-mono text-sm font-semibold px-2.5 py-1 border border-black bg-white text-alif-black"
              data-testid="next-invoice-number"
            >
              {previewNumber}
            </span>
          </div>
        </div>

        {/* Interactive Section Jump Strip */}
        <div
          aria-label="Billing Steps"
          data-testid="step-progress-indicator"
          className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-alif-border bg-white"
        >
          {STEP_LABELS.map(({ step, label }) => {
            const isActive = currentStep === step;
            const isDone =
              (step === 1 && step1Done) ||
              (step === 2 && hasDiscountApplied) ||
              (step === 3 && step3Done);
            return (
              <button
                key={step}
                type="button"
                onClick={() => scrollToSection(step)}
                data-testid={`step-indicator-${step}`}
                className={`p-2.5 border-r border-b border-alif-border text-left transition min-h-[44px] flex items-center justify-between ${
                  isActive
                    ? 'bg-alif-black text-white'
                    : isDone
                    ? 'bg-stone-50 text-alif-black'
                    : 'bg-white text-alif-charcoal hover:bg-stone-50'
                }`}
              >
                <span className="text-xs font-semibold truncate">{label}</span>
                {isDone && !isActive && (
                  <span className="text-xs font-mono text-alif-black">✓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: PRIMARY FOCUS — Products/Services, Quantities & Selling Prices */}
      <div id="bill-section-items" className="space-y-5" data-testid="step-1-content">
        {/* Frequently Used Products & Services Strip (Pinned + Actual Saved Invoice History; Zero Demo Prices) */}
        {frequentlyUsed.length > 0 && !catSearch.trim() && (
          <section
            data-testid="frequently-used-section"
            className="bg-white border border-alif-border p-3 sm:p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="editorial-label">Quick Access • Pinned &amp; Invoice History</div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-alif-black mt-0.5">
                  Frequently Used Products &amp; Services
                </h3>
              </div>
              <span className="text-[11px] text-alif-grey">
                Tap multiple to add • No auto-scroll
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 border-t border-l border-alif-border bg-alif-bg max-h-44 overflow-y-auto">
              {frequentlyUsed.map(({ item, variant, invoiceUsageCount, isPinned }) => {
                const displayColor = item.color || variant?.color || '';
                const displayType = item.productType || variant?.productType || '';
                const displayWork = item.workDesign || variant?.workDesign || '';
                const swatch = resolveColorSwatchHex(displayColor);
                const thumbSrc =
                  item.photoDataUrl ||
                  variant?.photoDataUrl ||
                  generateProductPlaceholderSvg(
                    displayType || item.name,
                    displayWork || item.category,
                    displayColor
                  );
                const stockStatus = variant ? getVariantStockStatus(variant) : null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addCatalogueItemToBill(item)}
                    data-testid={`freq-pick-${item.id}`}
                    className="text-left p-2.5 border-r border-b border-alif-border bg-white hover:bg-stone-50 transition flex items-start gap-2.5 min-h-[58px]"
                  >
                    <img
                      src={thumbSrc}
                      alt={item.name}
                      className="w-9 h-9 object-cover border border-alif-border shrink-0 mt-0.5"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-xs sm:text-sm font-semibold text-alif-black truncate">
                        {displayType || item.name}
                      </div>
                      {(displayColor || displayWork) && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {displayColor && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-mono font-bold border border-black bg-stone-50 text-alif-black">
                              <span
                                className="w-2 h-2 border border-black inline-block shrink-0"
                                style={{ backgroundColor: swatch.bg }}
                              />
                              {displayColor}
                            </span>
                          )}
                          {displayWork && (
                            <span className="text-[10px] text-alif-grey truncate">
                              {displayWork}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-alif-charcoal">
                        {isPinned && <span>★</span>}
                        {invoiceUsageCount > 0 && <span>{invoiceUsageCount}×</span>}
                        {variant && (
                          <span
                            className={`ml-auto font-bold ${
                              stockStatus === 'Out of Stock' ? 'underline' : ''
                            }`}
                          >
                            {formatStockQuantity(variant.totalQuantity, variant.unit)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section
          id="bill-catalogue-card"
          className="bg-white border border-alif-border p-3.5 sm:p-5 space-y-3.5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-alif-border pb-3">
            <div>
              <h3 className="editorial-subhead">1. Select Product or Service</h3>
              <p className="text-xs text-alif-grey mt-0.5">
                Select one or more items freely without page jumps, or add a newly arrived stock roll inline.
              </p>
            </div>

            {/* Category Filter Pills (Zero demo prices shown) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'service', 'product', 'custom'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider border font-semibold min-h-[40px] ${
                    catFilter === cat
                      ? 'bg-alif-black text-white border-black'
                      : 'bg-stone-50 text-alif-charcoal border-alif-border hover:border-black'
                  }`}
                >
                  {cat === 'all'
                    ? 'All'
                    : cat === 'service'
                    ? 'Services'
                    : cat === 'product'
                    ? 'Materials & Stock'
                    : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {/* Intelligent Offline Search + New Stock Item + Custom Item Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              enterKeyHint="search"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="Search item, fabric, colour, or design (e.g. gandy grren work all over)..."
              aria-label="Filter items"
              data-testid="bill-catalogue-search"
              className="flex-1 px-3 py-2 text-base bg-white"
            />
            {catSearch.trim() && (
              <button
                type="button"
                onClick={() => setCatSearch('')}
                data-testid="btn-clear-cat-search"
                className="px-3 py-2 text-xs uppercase tracking-wider font-semibold border border-alif-border bg-stone-50 text-alif-charcoal hover:border-black shrink-0"
              >
                Clear Search
              </button>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowInlineNewStock((prev) => !prev)}
                data-testid="btn-toggle-inline-new-stock"
                className={`px-3.5 py-2 text-xs uppercase tracking-wider font-semibold border min-h-[40px] ${
                  showInlineNewStock
                    ? 'bg-alif-black text-white border-black'
                    : 'bg-stone-50 text-alif-black border-black hover:bg-stone-100'
                }`}
              >
                {showInlineNewStock ? 'Hide Stock Form ▲' : '+ New Stock Item'}
              </button>
              <button
                type="button"
                onClick={addBlankCustomItem}
                data-testid="btn-add-custom-line"
                className="px-3.5 py-2 text-xs uppercase tracking-wider font-semibold bg-alif-charcoal text-white hover:bg-black min-h-[40px]"
              >
                + Custom Item
              </button>
            </div>
          </div>

          {/* Improvement 5: Compact Inline "+ New Stock Item" Panel on New Bill */}
          {showInlineNewStock && (
            <div
              data-testid="inline-new-stock-form"
              className="border-2 border-black bg-stone-50 p-3.5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-alif-black">
                    New Stock Variant &amp; Opening Roll (Created Atomically on Bill Save)
                  </div>
                  <p className="text-[11px] text-alif-grey">
                    Adds the new variant, opening roll, and catalogue item when this bill is saved, and deducts the billed quantity once.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInlineNewStock(false)}
                  className="btn-inline text-xs text-alif-grey underline"
                >
                  Cancel
                </button>
              </div>

              {inlineDuplicateVariant && (
                <div
                  data-testid="inline-new-stock-duplicate-alert"
                  className="p-2.5 bg-white border border-black flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <span>
                    Variant <strong>{inlineDuplicateVariant.name}</strong> already exists (Avail:{' '}
                    {formatStockQuantity(
                      inlineDuplicateVariant.totalQuantity,
                      inlineDuplicateVariant.unit
                    )}
                    ).
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const existingCat = catalogue.find(
                        (c) => c.inventoryVariantId === inlineDuplicateVariant.id
                      );
                      if (existingCat) {
                        addCatalogueItemToBill(existingCat);
                        setShowInlineNewStock(false);
                      }
                    }}
                    data-testid="btn-use-existing-stock-variant"
                    className="px-2.5 py-1 bg-alif-black text-white text-xs font-semibold uppercase"
                  >
                    Select Existing Variant →
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block editorial-label mb-1">Category *</label>
                  <input
                    type="text"
                    value={newStockCategory}
                    onChange={(e) => setNewStockCategory(e.target.value)}
                    placeholder="Fabric"
                    data-testid="new-stock-category"
                    className="w-full px-2.5 py-1.5 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Product Type *</label>
                  <input
                    type="text"
                    value={newStockProductType}
                    onChange={(e) => setNewStockProductType(e.target.value)}
                    placeholder="e.g. Organza Tissue"
                    data-testid="new-stock-product-type"
                    className="w-full px-2.5 py-1.5 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Work / Design</label>
                  <input
                    type="text"
                    value={newStockWorkDesign}
                    onChange={(e) => setNewStockWorkDesign(e.target.value)}
                    placeholder="e.g. Zari Border"
                    data-testid="new-stock-work-design"
                    className="w-full px-2.5 py-1.5 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Colour *</label>
                  <input
                    type="text"
                    value={newStockColor}
                    onChange={(e) => setNewStockColor(e.target.value)}
                    placeholder="e.g. Peacock Blue"
                    data-testid="new-stock-color"
                    className="w-full px-2.5 py-1.5 text-sm bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div>
                  <label className="block editorial-label mb-1">Unit *</label>
                  <select
                    value={newStockUnit}
                    onChange={(e) => setNewStockUnit(e.target.value)}
                    data-testid="new-stock-unit"
                    className="w-full px-2.5 py-1.5 text-sm bg-white"
                  >
                    <option value="m">m (Metres)</option>
                    <option value="pc">pc</option>
                    <option value="pair">pair</option>
                    <option value="roll">roll</option>
                    <option value="set">set</option>
                  </select>
                </div>
                <div>
                  <label className="block editorial-label mb-1">
                    Opening Roll Stock ({newStockUnit}) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    value={newStockOpeningQty}
                    onChange={(e) => setNewStockOpeningQty(e.target.value)}
                    placeholder="e.g. 15"
                    data-testid="new-stock-opening-qty"
                    className="w-full px-2.5 py-1.5 text-sm font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">
                    Bill Qty ({newStockUnit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    value={newStockSoldQty}
                    onChange={(e) => setNewStockSoldQty(e.target.value)}
                    placeholder="e.g. 2.5"
                    data-testid="new-stock-sold-qty"
                    className="w-full px-2.5 py-1.5 text-sm font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={newStockSellingPrice}
                    onChange={(e) => setNewStockSellingPrice(e.target.value)}
                    placeholder="e.g. 550"
                    data-testid="new-stock-selling-price"
                    className="w-full px-2.5 py-1.5 text-sm font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block editorial-label mb-1">Purchase Cost (₹)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={newStockPurchaseCost}
                    onChange={(e) => setNewStockPurchaseCost(e.target.value)}
                    placeholder="Optional"
                    data-testid="new-stock-purchase-cost"
                    className="w-full px-2.5 py-1.5 text-sm font-mono bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-alif-border">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    id="new-stock-camera-input"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        const p = await compressAndResizeImage(f);
                        setNewStockPhotoDataUrl(p.dataUrl);
                      } catch (_err) {
                        // Ignore
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      (
                        document.getElementById('new-stock-camera-input') as HTMLInputElement | null
                      )?.click()
                    }
                    data-testid="btn-new-stock-camera"
                    className="px-2.5 py-1 text-xs font-semibold uppercase border border-alif-border bg-white text-alif-black min-h-[34px]"
                  >
                    📷 Roll Photo
                  </button>
                  {newStockPhotoDataUrl && (
                    <img
                      src={newStockPhotoDataUrl}
                      alt="New stock preview"
                      className="w-8 h-8 object-cover border border-black"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddInlineNewStockItem}
                  data-testid="btn-add-inline-new-stock"
                  className="px-4 py-2 bg-alif-black text-white text-xs font-semibold uppercase tracking-wider hover:bg-zinc-800 min-h-[38px]"
                >
                  + Add Stock Item to Bill
                </button>
              </div>
            </div>
          )}

          {/* Hierarchical Browsing Bar when viewing All or Materials & Stock */}
          {(catFilter === 'all' || catFilter === 'product') &&
            inventoryVariants.length > 0 && (
              <div
                data-testid="bill-hierarchy-filters"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-stone-50 p-2.5 border border-alif-border"
              >
                <select
                  value={hierCategory}
                  onChange={(e) => {
                    setHierCategory(e.target.value);
                    setHierProductType('');
                    setHierWorkDesign('');
                    setHierColor('');
                  }}
                  aria-label="Hierarchy Category"
                  data-testid="bill-hier-category"
                  className="px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">All Categories</option>
                  {hierarchyOptions.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={hierProductType}
                  onChange={(e) => {
                    setHierProductType(e.target.value);
                    setHierWorkDesign('');
                    setHierColor('');
                  }}
                  aria-label="Hierarchy Product Type"
                  data-testid="bill-hier-type"
                  className="px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">All Product Types</option>
                  {hierarchyOptions.productTypes.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>

                <select
                  value={hierWorkDesign}
                  onChange={(e) => {
                    setHierWorkDesign(e.target.value);
                    setHierColor('');
                  }}
                  aria-label="Hierarchy Work or Design"
                  data-testid="bill-hier-work"
                  className="px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">All Work / Designs</option>
                  {hierarchyOptions.workDesigns.map((wd) => (
                    <option key={wd} value={wd}>
                      {wd}
                    </option>
                  ))}
                </select>

                <select
                  value={hierColor}
                  onChange={(e) => setHierColor(e.target.value)}
                  aria-label="Hierarchy Colour"
                  data-testid="bill-hier-color"
                  className="px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">All Colours</option>
                  {hierarchyOptions.colors.map((cl) => (
                    <option key={cl} value={cl}>
                      {cl}
                    </option>
                  ))}
                </select>
              </div>
            )}

          {/* Improvement 4: 2-Col Mobile / 4-Col Desktop Quick-Pick Grid with Clear Colour, Design & Stock Badges (Strictly Zero Demo Prices) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 border-t border-l border-alif-border max-h-60 overflow-y-auto bg-alif-bg">
            {rankedCatalogueResults.map(({ item, isApproximateMatch }) => {
              const linkedVar = item.inventoryVariantId
                ? variantsMap[item.inventoryVariantId]
                : undefined;
              const displayColor = item.color || linkedVar?.color || '';
              const displayType = item.productType || linkedVar?.productType || '';
              const displayWork = item.workDesign || linkedVar?.workDesign || '';
              const swatch = resolveColorSwatchHex(displayColor);
              const thumbSrc =
                item.photoDataUrl ||
                linkedVar?.photoDataUrl ||
                generateProductPlaceholderSvg(
                  displayType || item.name,
                  displayWork || item.category,
                  displayColor
                );
              const stockStatus = linkedVar ? getVariantStockStatus(linkedVar) : null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addCatalogueItemToBill(item)}
                  data-testid={`pick-${item.id}`}
                  className="text-left p-2.5 border-r border-b border-alif-border bg-white hover:bg-stone-50 transition flex items-start gap-2.5 min-h-[58px]"
                >
                  <img
                    src={thumbSrc}
                    alt={item.name}
                    className="w-9 h-9 object-cover border border-alif-border shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs sm:text-sm font-medium text-alif-black truncate">
                      {displayType || item.name}
                    </div>
                    {(displayColor || displayWork) && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {displayColor && (
                          <span
                            data-testid={`pick-color-badge-${item.id}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-mono font-bold border border-black bg-stone-50 text-alif-black"
                          >
                            <span
                              className="w-2 h-2 border border-black inline-block shrink-0"
                              style={{ backgroundColor: swatch.bg }}
                            />
                            {displayColor}
                          </span>
                        )}
                        {displayWork && (
                          <span
                            data-testid={`pick-work-badge-${item.id}`}
                            className="text-[10px] text-alif-grey truncate"
                          >
                            {displayWork}
                          </span>
                        )}
                      </div>
                    )}
                    {linkedVar && (
                      <div
                        data-testid={`pick-stock-badge-${item.id}`}
                        className="text-[10px] font-mono text-alif-charcoal truncate"
                      >
                        {formatStockQuantity(linkedVar.totalQuantity, linkedVar.unit)}{' '}
                        {stockStatus === 'Out of Stock'
                          ? '• Out of Stock'
                          : stockStatus === 'Low Stock'
                          ? '• Low'
                          : ''}
                      </div>
                    )}
                    {isApproximateMatch && catSearch.trim() && (
                      <div className="text-[10px] font-mono uppercase text-alif-charcoal">
                        ~ Approx Match
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-mono text-alif-grey ml-1 shrink-0">+</span>
                </button>
              );
            })}
          </div>

          {/* Non-Scrolling Multi-Product Selection Summary Bar */}
          {lines.length > 0 && (
            <div
              data-testid="selected-items-quick-bar"
              className="bg-stone-50 border border-black p-2.5 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="editorial-label text-alif-black mr-1">
                  Selected ({lines.length}):
                </span>
                {calculated.parsedLines.map((l, idx) => {
                  const needsQty = !(Number(l.quantity) > 0);
                  const needsPrice = !l.unitPriceRupees.trim();
                  const isIncomplete = needsQty || needsPrice || !l.name.trim();
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        const targetField = !l.name.trim()
                          ? `line-name-${idx}`
                          : needsQty
                          ? `line-qty-${idx}`
                          : `line-price-${idx}`;
                        focusAndScrollElementByTestId(targetField, {
                          selectText: true,
                          allowScroll: true,
                          forceScroll: true
                        });
                      }}
                      data-testid={`selected-pill-${idx}`}
                      className={`px-2 py-1 text-xs font-mono border min-h-[32px] transition ${
                        isIncomplete
                          ? 'bg-white text-alif-black border-black'
                          : 'bg-alif-black text-white border-black'
                      }`}
                    >
                      #{idx + 1} {l.name || 'Custom'}{' '}
                      {needsQty ? `(Enter ${l.unit})` : `(${l.quantity}${l.unit})`} •{' '}
                      {needsPrice ? 'Enter ₹' : formatINR(l.lineTotalPaise)}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => focusNextBlankOrAdvanceSection(-1)}
                data-testid="btn-catalogue-next-action"
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white hover:bg-zinc-800 min-h-[36px] shrink-0"
              >
                {blankPriceLinesCount > 0
                  ? `Fill Blank Fields (${blankPriceLinesCount}) ↓`
                  : 'Next: Customer Details →'}
              </button>
            </div>
          )}
        </section>

        {/* Added Line Items List */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-2">
            <h3 className="editorial-subhead">
              2. Added Garments &amp; Selling Rates ({lines.length})
            </h3>
            <div className="flex items-center gap-3">
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={scrollBackToCatalogue}
                  data-testid="btn-scroll-to-catalogue-top"
                  className="btn-inline text-xs font-semibold uppercase tracking-wider underline text-alif-charcoal hover:text-alif-black"
                >
                  ↑ + Select More Products
                </button>
              )}
              {lines.length > 0 && (
                <span className="font-mono text-base font-semibold text-alif-black">
                  Subtotal: {formatINR(calculated.totals.subtotalPaise)}
                </span>
              )}
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="p-6 text-center border border-alif-border bg-white text-sm text-alif-grey">
              Tap a tailoring service or material above to add it to this bill.
            </div>
          ) : (
            <div className="space-y-3">
              {calculated.parsedLines.map((line, idx) => {
                const linkedVar =
                  line.category !== 'service' && !line.isNonStock && line.inventoryVariantId
                    ? variantsMap[line.inventoryVariantId]
                    : undefined;
                const isStockShort =
                  (linkedVar && toQtyUnits(line.qty) > toQtyUnits(linkedVar.totalQuantity)) ||
                  (line.newStockVariantSpec &&
                    toQtyUnits(line.qty) >
                      toQtyUnits(line.newStockVariantSpec.openingStockQuantity));
                const isFractionalUnit = isFractionalFabricUnit(line.unit, line.category);
                const isRowActive =
                  activeLineId === line.id || idx === calculated.parsedLines.length - 1;
                const priceShortcuts = getLinePriceShortcuts(line);
                const hasNameError = validationTargetTestId === `line-name-${idx}`;
                const hasQtyError = validationTargetTestId === `line-qty-${idx}`;
                const hasPriceError = validationTargetTestId === `line-price-${idx}`;

                return (
                  <div
                    key={line.id}
                    onFocusCapture={() => setActiveLineId(line.id)}
                    className={`bg-white border p-3.5 sm:p-4 space-y-3 ${
                      hasNameError || hasQtyError || hasPriceError
                        ? 'border-2 border-black'
                        : 'border-black'
                    }`}
                    data-testid={`bill-line-${idx}`}
                  >
                    {/* Row 1: Item # Badge, Product/Service Name, and Reorder/Remove Controls */}
                    <div className="flex items-center justify-between gap-2 border-b border-alif-border pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="editorial-label text-alif-black">
                          Item #{idx + 1} • {line.category}
                        </span>
                        {line.category === 'service' ? (
                          <span className="text-[11px] font-mono text-alif-grey">
                            Service (Non-stock)
                          </span>
                        ) : line.newStockVariantSpec ? (
                          <span
                            data-testid={`line-new-stock-badge-${idx}`}
                            className="px-2 py-0.5 text-[11px] font-mono bg-alif-black text-white border border-black"
                          >
                            New Stock Roll:{' '}
                            {formatStockQuantity(
                              line.newStockVariantSpec.openingStockQuantity,
                              line.unit
                            )}{' '}
                            (Created on Save)
                          </span>
                        ) : linkedVar ? (
                          <span
                            data-testid={`line-stock-badge-${idx}`}
                            className={`px-2 py-0.5 text-[11px] font-mono border ${
                              isStockShort
                                ? 'bg-stone-100 border-dashed border-black text-alif-black font-bold'
                                : 'bg-stone-50 border-alif-border text-alif-charcoal'
                            }`}
                          >
                            FIFO Stock: {formatStockQuantity(linkedVar.totalQuantity, linkedVar.unit)}{' '}
                            avail
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-alif-grey">
                            Non-stock item
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {lines.length > 1 && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveLine(idx, -1)}
                              data-testid={`btn-move-up-${idx}`}
                              className="px-2.5 py-1 text-xs border border-alif-border bg-stone-50 text-alif-charcoal hover:border-black min-h-[36px]"
                              title="Move item up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === lines.length - 1}
                              onClick={() => moveLine(idx, 1)}
                              data-testid={`btn-move-down-${idx}`}
                              className="px-2.5 py-1 text-xs border border-alif-border bg-stone-50 text-alif-charcoal hover:border-black min-h-[36px]"
                              title="Move item down"
                            >
                              ↓
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          data-testid={`btn-remove-line-${idx}`}
                          className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-alif-charcoal hover:text-alif-black border border-alif-border bg-stone-50 min-h-[36px]"
                          title="Remove item"
                        >
                          Remove ✕
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Name, Qty, Unit Price (₹), and Line Total */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <label className="block editorial-label mb-1">
                          Product / Service Name *
                        </label>
                        <input
                          type="text"
                          enterKeyHint="next"
                          value={line.name}
                          onFocus={() => {
                            setActiveLineId(line.id);
                            setActiveLineField('name');
                          }}
                          onChange={(e) => updateLine(line.id, { name: e.target.value })}
                          onKeyDown={(e) =>
                            handleFieldKeyDown(e, { kind: 'line-name', idx })
                          }
                          placeholder="Enter item or service name"
                          data-testid={`line-name-${idx}`}
                          aria-invalid={hasNameError}
                          className="w-full px-3 py-2 text-base font-medium bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block editorial-label mb-1">
                            Qty ({line.unit}) *
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            enterKeyHint="next"
                            min="0.01"
                            step="any"
                            value={line.quantity}
                            onFocus={() => {
                              setActiveLineId(line.id);
                              setActiveLineField('qty');
                            }}
                            onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                            onKeyDown={(e) =>
                              handleFieldKeyDown(e, { kind: 'line-qty', idx })
                            }
                            data-testid={`line-qty-${idx}`}
                            aria-invalid={hasQtyError}
                            className="w-full px-3 py-2 text-base font-mono bg-white"
                          />
                        </div>

                        <div>
                          <label className="block editorial-label mb-1">
                            Selling Price (₹) *
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            enterKeyHint="next"
                            min="0"
                            step="any"
                            value={line.unitPriceRupees}
                            onFocus={() => {
                              setActiveLineId(line.id);
                              setActiveLineField('price');
                            }}
                            onChange={(e) =>
                              updateLine(line.id, { unitPriceRupees: e.target.value })
                            }
                            onKeyDown={(e) =>
                              handleFieldKeyDown(e, { kind: 'line-price', idx })
                            }
                            data-testid={`line-price-${idx}`}
                            aria-invalid={hasPriceError}
                            className="w-full px-3 py-2 text-base font-mono font-semibold bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end bg-stone-50 px-3 py-2 border border-alif-border min-h-[44px]">
                        <span className="editorial-label sm:mr-2">Line Total</span>
                        <span
                          className="text-base font-mono font-bold text-alif-black"
                          data-testid={`line-total-${idx}`}
                        >
                          {formatINR(line.lineTotalPaise)}
                        </span>
                      </div>
                    </div>

                    {/* Quick Quantity Chips for Fractional Fabric Measurements & Optional Last-Billed-Price Shortcut */}
                    {(isRowActive || isFractionalUnit || !line.unitPriceRupees.trim()) && (
                      <div
                        data-testid={`line-shortcuts-${idx}`}
                        className="bg-stone-50 border border-alif-border p-2.5 space-y-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="editorial-label text-alif-charcoal mr-1">
                            {isFractionalUnit ? `Quick ${line.unit}:` : 'Quick Qty:'}
                          </span>
                          {(isFractionalUnit ? FRACTIONAL_FABRIC_CHIPS : WHOLE_UNIT_CHIPS).map(
                            (chipVal) => {
                              const isSelectedQty =
                                Math.abs((Number(line.quantity) || 0) - chipVal) < 0.001;
                              return (
                                <button
                                  key={chipVal}
                                  type="button"
                                  onClick={() => applyQuickQuantity(line.id, idx, chipVal)}
                                  data-testid={`chip-qty-${idx}-${chipVal}`}
                                  className={`px-2 py-1 text-xs font-mono border min-h-[34px] transition ${
                                    isSelectedQty
                                      ? 'bg-alif-black text-white border-black font-bold'
                                      : 'bg-white text-alif-charcoal border-alif-border hover:border-black'
                                  }`}
                                >
                                  {chipVal}
                                  {isFractionalUnit ? line.unit : ''}
                                </button>
                              );
                            }
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              stepLineQuantity(
                                line.id,
                                line.quantity,
                                isFractionalUnit ? -0.25 : -1
                              )
                            }
                            data-testid={`btn-qty-minus-${idx}`}
                            className="px-2 py-1 text-xs font-mono border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[34px]"
                            title={isFractionalUnit ? 'Subtract 0.25' : 'Subtract 1'}
                          >
                            {isFractionalUnit ? '-0.25' : '-1'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              stepLineQuantity(
                                line.id,
                                line.quantity,
                                isFractionalUnit ? 0.25 : 1
                              )
                            }
                            data-testid={`btn-qty-plus-${idx}`}
                            className="px-2 py-1 text-xs font-mono border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[34px]"
                            title={isFractionalUnit ? 'Add 0.25' : 'Add 1'}
                          >
                            {isFractionalUnit ? '+0.25' : '+1'}
                          </button>
                        </div>

                        {(priceShortcuts.lastBilledPaise || priceShortcuts.referencePaise) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-alif-border">
                            <span className="editorial-label text-alif-charcoal">
                              Rate Shortcut:
                            </span>
                            {priceShortcuts.lastBilledPaise && (
                              <button
                                type="button"
                                onClick={() =>
                                  applyPriceShortcut(
                                    line.id,
                                    idx,
                                    priceShortcuts.lastBilledPaise!
                                  )
                                }
                                data-testid={`chip-last-price-${idx}`}
                                className="px-2.5 py-1 text-xs font-mono font-semibold border border-black bg-white text-alif-black hover:bg-stone-100 min-h-[34px]"
                              >
                                {priceShortcuts.lastBilledLabel}:{' '}
                                {formatINR(priceShortcuts.lastBilledPaise)}/{line.unit}
                              </button>
                            )}
                            {priceShortcuts.referencePaise && (
                              <button
                                type="button"
                                onClick={() =>
                                  applyPriceShortcut(
                                    line.id,
                                    idx,
                                    priceShortcuts.referencePaise!
                                  )
                                }
                                data-testid={`chip-ref-price-${idx}`}
                                className="px-2.5 py-1 text-xs font-mono border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[34px]"
                              >
                                Ref Rate: {formatINR(priceShortcuts.referencePaise)}/{line.unit}
                              </button>
                            )}
                            {activeLineField === 'price' && (
                              <span className="text-[11px] text-alif-grey ml-auto">
                                Press Enter ↵ for next blank field
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Optional Inventory Stock Variant Selector for Material & Custom Items */}
                    {line.category !== 'service' &&
                      !line.newStockVariantSpec &&
                      inventoryVariants.length > 0 && (
                        <div className="bg-stone-50 p-2.5 border border-alif-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label
                            htmlFor={`line-stock-select-${line.id}`}
                            className="editorial-label text-alif-charcoal"
                          >
                            Physical Stock Connection (FIFO on Save):
                          </label>
                          <select
                            id={`line-stock-select-${line.id}`}
                            value={line.isNonStock ? '' : line.inventoryVariantId || ''}
                            onChange={(e) =>
                              handleLineStockVariantChange(line.id, e.target.value)
                            }
                            data-testid={`line-stock-select-${idx}`}
                            className="px-2.5 py-1.5 text-xs font-mono bg-white sm:w-96"
                          >
                            <option value="">
                              Non-Stock / Customer&apos;s Own Material (Do not deduct inventory)
                            </option>
                            {inventoryVariants
                              .filter((v) => v.isActive)
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name} — Avail: {formatStockQuantity(v.totalQuantity, v.unit)}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                    {/* Row 3: Optional Item Note & Optional Garment Photo Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-alif-border">
                      <div className="flex-1">
                        <input
                          type="text"
                          enterKeyHint="next"
                          value={line.notes}
                          onFocus={() => {
                            setActiveLineId(line.id);
                            setActiveLineField('notes');
                          }}
                          onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                          onKeyDown={(e) =>
                            handleFieldKeyDown(e, { kind: 'line-notes', idx })
                          }
                          placeholder="Item note / measurement detail (optional)"
                          aria-label={`Item note for ${line.name || `Item #${idx + 1}`}`}
                          className="w-full px-3 py-1.5 text-base bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          id={`camera-file-${line.id}`}
                          data-testid={`input-camera-${idx}`}
                          onChange={(e) =>
                            handlePhotoSelected(line.id, e.target.files?.[0], e.target)
                          }
                          className="hidden"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          id={`gallery-file-${line.id}`}
                          data-testid={`input-photo-${idx}`}
                          onChange={(e) =>
                            handlePhotoSelected(line.id, e.target.files?.[0], e.target)
                          }
                          className="hidden"
                        />

                        {!line.photoDataUrl ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  `camera-file-${line.id}`
                                ) as HTMLInputElement | null;
                                el?.click();
                              }}
                              data-testid={`btn-camera-${idx}`}
                              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-stone-50 text-alif-black hover:border-black min-h-[40px]"
                              title="Capture or attach item photo"
                            >
                              📷 Photo
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  `gallery-file-${line.id}`
                                ) as HTMLInputElement | null;
                                el?.click();
                              }}
                              data-testid={`btn-gallery-${idx}`}
                              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-alif-border bg-white text-alif-charcoal hover:border-black min-h-[40px]"
                              title="Choose existing image from gallery"
                            >
                              Gallery
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  itemName: line.name || `Item #${idx + 1}`,
                                  dataUrl: line.photoDataUrl!
                                })
                              }
                              data-testid={`btn-preview-photo-${idx}`}
                              className="p-0.5 border border-black bg-white min-h-0"
                              title="Preview attached photo"
                            >
                              <img
                                src={line.photoDataUrl}
                                alt={`${line.name || 'Item'} thumbnail`}
                                data-testid={`thumb-photo-${idx}`}
                                className="w-10 h-10 object-cover block"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  `gallery-file-${line.id}`
                                ) as HTMLInputElement | null;
                                el?.click();
                              }}
                              data-testid={`btn-replace-photo-${idx}`}
                              className="px-2.5 py-1.5 text-xs font-semibold border border-alif-border bg-white text-alif-black hover:border-black min-h-[38px]"
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(line.id)}
                              data-testid={`btn-remove-photo-${idx}`}
                              className="px-2.5 py-1.5 text-xs border border-alif-border bg-white text-alif-grey hover:text-alif-black min-h-[38px]"
                            >
                              Remove Photo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Section 1 Footer Bar: Continue Selecting Products OR Advance to Customer Details */}
              <div className="bg-stone-50 border border-alif-border p-3 flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={scrollBackToCatalogue}
                  data-testid="btn-add-more-products"
                  className="px-3.5 py-2 text-xs font-semibold uppercase tracking-wider border border-black bg-white text-alif-black hover:bg-stone-100 min-h-[40px]"
                >
                  ↑ + Add More Products
                </button>

                <button
                  type="button"
                  onClick={handleContinueFromItems}
                  data-testid="btn-items-next-section"
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-alif-black text-white hover:bg-zinc-800 min-h-[40px]"
                >
                  {blankPriceLinesCount > 0
                    ? `Next Blank Item Field (${blankPriceLinesCount}) →`
                    : 'Next: Customer Details →'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* SECTION 2: PROGRESSIVE DISCLOSURE — Discount (Collapsed until needed, preserves entered data) */}
      <section
        id="bill-section-discount"
        data-testid="step-2-content"
        className="bg-white border border-alif-border"
      >
        <button
          type="button"
          onClick={() => setIsDiscountOpen((prev) => !prev)}
          aria-expanded={isDiscountOpen}
          data-testid="toggle-discount-section"
          className="w-full px-4 py-3 flex items-center justify-between text-left bg-stone-50 hover:bg-alif-muted transition min-h-[48px]"
        >
          <div className="flex items-center gap-2">
            <span className="editorial-subhead">3. Discount (Optional)</span>
            {hasDiscountApplied && (
              <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-alif-black text-white">
                - {formatINR(calculated.totals.discountPaise)}
              </span>
            )}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-alif-charcoal">
            {isDiscountOpen ? 'Hide ▲' : hasDiscountApplied ? 'Edit Discount ▼' : '+ Add Discount ▼'}
          </span>
        </button>

        {/* Mounted in DOM so discountType and discountInput are strictly preserved when collapsed */}
        <div className={isDiscountOpen ? 'p-4 space-y-4 border-t border-alif-border' : 'hidden'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-xl">
            <div>
              <label className="block editorial-label mb-1">
                Discount Type
              </label>
              <select
                value={discountType}
                onChange={(e) => {
                  setDiscountType(e.target.value as DiscountType);
                  setValidationError(null);
                  setValidationTargetTestId(null);
                }}
                data-testid="select-discount-type"
                className="w-full px-3 py-2 text-base bg-white"
              >
                <option value="flat">Flat Amount (₹)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </div>

            <div>
              <label className="block editorial-label mb-1">
                Discount ({discountType === 'flat' ? '₹' : '%'})
              </label>
              <input
                type="number"
                inputMode="decimal"
                enterKeyHint="next"
                min="0"
                step="any"
                value={discountInput}
                onChange={(e) => {
                  setDiscountInput(e.target.value);
                  setValidationError(null);
                  setValidationTargetTestId(null);
                }}
                onKeyDown={(e) =>
                  handleFieldKeyDown(e, { kind: 'discount-value' })
                }
                data-testid="input-discount-value"
                aria-invalid={validationTargetTestId === 'input-discount-value'}
                className="w-full px-3 py-2 text-base font-mono bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between max-w-xl bg-stone-50 px-3.5 py-2.5 border border-alif-border text-sm">
            <span className="text-alif-charcoal font-medium">Discount Deduction</span>
            <span className="font-mono font-semibold text-alif-black">
              - {formatINR(calculated.totals.discountPaise)} (Total: {formatINR(calculated.totals.totalPaise)})
            </span>
          </div>
        </div>
      </section>

      {/* SECTION 3: PHONE-FIRST CUSTOMER LOOKUP & AUTO-FILL (Immediately after Discount and before Save Bill) */}
      <section
        id="bill-section-customer"
        data-testid="step-3-content"
        className="bg-white border border-alif-border p-3.5 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-alif-border pb-3">
          <div>
            <h3 className="editorial-subhead">4. Customer Details (Phone-First Lookup)</h3>
            <p className="text-xs text-alif-grey mt-0.5">
              Enter 10-digit WhatsApp/mobile number first to auto-fill saved clients, or tap a client below.
            </p>
          </div>
          {customers.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search saved client..."
                aria-label="Search saved customer"
                className="px-3 py-1.5 text-base bg-white w-full sm:w-64"
              />
              {(selectedCustomerId || customerPhone || customerName) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId('');
                    setCustomerName('');
                    setCustomerPhone('');
                    setCustomerNotes('');
                    setNameManuallyEdited(false);
                    setAutoFilledByPhone(false);
                  }}
                  data-testid="btn-clear-customer"
                  className="btn-inline text-xs font-semibold uppercase tracking-wider text-alif-charcoal underline shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Matched / Repeat Customer Auto-Fill Status Banner */}
        {matchedCustomerSummary && (
          <div
            data-testid="customer-match-banner"
            className="bg-stone-50 border border-black px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 bg-alif-black text-white font-semibold uppercase tracking-wider">
                Repeat Client Matched
              </span>
              <span className="font-semibold text-alif-black">
                {matchedCustomerSummary.customer.name}
              </span>
              <span className="font-mono text-alif-grey">
                ({matchedCustomerSummary.customer.phone})
              </span>
              {matchedCustomerSummary.ledger.billCount > 0 && (
                <span className="font-mono text-alif-charcoal">
                  • {matchedCustomerSummary.ledger.billCount} past bill
                  {matchedCustomerSummary.ledger.billCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {matchedCustomerSummary.ledger.outstandingPaise > 0 && (
              <span
                data-testid="customer-previous-due-badge"
                className="font-mono font-bold text-alif-black px-2 py-0.5 bg-white border border-black"
              >
                Previous Due: {formatINR(matchedCustomerSummary.ledger.outstandingPaise)}
              </span>
            )}
          </div>
        )}

        {/* Quick-Pick / Live Phone-Filtered Repeat Customer Chips */}
        {phoneLookupMatches.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="customer-quick-chips">
            {phoneLookupMatches.map((c) => {
              const duePaise = customerLedgerSummaryMap[c.id]?.outstandingPaise || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectExistingCustomer(c, true)}
                  data-testid={`chip-customer-${c.phone}`}
                  className={`px-3 py-1.5 text-xs border transition min-h-[38px] ${
                    selectedCustomerId === c.id
                      ? 'bg-alif-black text-white border-black font-semibold'
                      : 'bg-stone-50 text-alif-charcoal border-alif-border hover:border-black'
                  }`}
                >
                  {c.name} ({c.phone})
                  {duePaise > 0 ? ` • Due ${formatINR(duePaise)}` : ''}
                </button>
              );
            })}
          </div>
        )}

        {/* Phone-First Field Order: 1. Phone / WhatsApp -> 2. Customer Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block editorial-label">
                Phone / WhatsApp *
              </label>
              {normalizedTypedPhone.length === 10 && !selectedCustomerId && (
                <span
                  data-testid="new-customer-phone-hint"
                  className="text-[11px] font-mono text-alif-charcoal"
                >
                  New client — enter name →
                </span>
              )}
            </div>
            <input
              type="tel"
              inputMode="tel"
              enterKeyHint="next"
              value={customerPhone}
              onChange={(e) => handleCustomerPhoneChange(e.target.value)}
              onKeyDown={(e) =>
                handleFieldKeyDown(e, { kind: 'customer-phone' })
              }
              placeholder="10-digit mobile number"
              data-testid="input-customer-phone"
              aria-invalid={validationTargetTestId === 'input-customer-phone'}
              className="w-full px-3 py-2 text-base font-mono bg-white"
            />
          </div>

          <div>
            <label className="block editorial-label mb-1">
              Customer Name *
            </label>
            <input
              type="text"
              enterKeyHint="next"
              value={customerName}
              onChange={(e) => handleCustomerNameChange(e.target.value)}
              onKeyDown={(e) =>
                handleFieldKeyDown(e, { kind: 'customer-name' })
              }
              placeholder="Client full name"
              data-testid="input-customer-name"
              aria-invalid={validationTargetTestId === 'input-customer-name'}
              className="w-full px-3 py-2 text-base bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:col-span-2">
            <div>
              <label className="block editorial-label mb-1">
                Bill Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-2.5 py-2 text-base font-mono bg-white"
              />
            </div>

            <div>
              <label className="block editorial-label mb-1">
                Collection Date (Optional)
              </label>
              <input
                type="date"
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                data-testid="input-collection-date"
                className="w-full px-2.5 py-2 text-base font-mono bg-white"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block editorial-label mb-1">
            Order Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={billNotes}
            onChange={(e) => setBillNotes(e.target.value)}
            placeholder="Special delivery instructions, fitting notes, or garment count..."
            className="w-full px-3 py-2 text-base bg-white"
          />
        </div>
      </section>

      {/* SECTION 4: PROMINENT GRAND TOTAL, ADVANCE, BALANCE & SAVE BILL */}
      <section
        id="bill-section-save"
        data-testid="step-4-content"
        className="bg-white border-2 border-black p-4 sm:p-5 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-alif-border pb-3">
          <div>
            <h3 className="editorial-subhead">5. Payment &amp; Bill Total</h3>
            <p className="text-xs text-alif-grey mt-0.5">
              Record advance received (if any) and save the bill. Physical stock is deducted only after saving.
            </p>
          </div>
          <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-stone-50 border border-alif-border text-alif-black">
            {previewNumber}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {/* Advance Input & Method */}
          <div className="space-y-3.5 bg-stone-50 p-3.5 border border-alif-border">
            <div className="flex items-center justify-between">
              <label className="editorial-label text-alif-black">
                Advance Received (₹)
              </label>
              {calculated.totals.totalPaise > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setAdvanceInput(paiseToRupeesString(calculated.totals.totalPaise))
                    }
                    className="btn-inline text-xs font-semibold underline text-alif-black"
                  >
                    Full ({formatINR(calculated.totals.totalPaise)})
                  </button>
                  {advanceInput && (
                    <button
                      type="button"
                      onClick={() => setAdvanceInput('')}
                      className="btn-inline text-xs text-alif-grey underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  min="0"
                  step="any"
                  value={advanceInput}
                  onChange={(e) => {
                    setAdvanceInput(e.target.value);
                    setValidationError(null);
                    setValidationTargetTestId(null);
                  }}
                  onKeyDown={(e) =>
                    handleFieldKeyDown(e, { kind: 'advance-amount' })
                  }
                  data-testid="input-advance-amount"
                  aria-invalid={validationTargetTestId === 'input-advance-amount'}
                  className="w-full px-3 py-2 text-base font-mono font-semibold bg-white"
                />
              </div>

              <div>
                <select
                  value={advanceMethod}
                  onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
                  data-testid="select-advance-method"
                  aria-label="Advance payment method"
                  className="w-full px-3 py-2 text-base bg-white"
                >
                  {(
                    settings.enabledPaymentMethods || [
                      'cash',
                      'upi',
                      'bank_transfer',
                      'other'
                    ]
                  ).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Prominent Financial Totals Breakdown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-alif-grey">
                Subtotal ({lines.length} item{lines.length === 1 ? '' : 's'})
              </span>
              <span className="font-mono font-medium text-alif-black" data-testid="summary-subtotal">
                {formatINR(calculated.totals.subtotalPaise)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-alif-grey">Discount</span>
              <span className="font-mono font-medium text-alif-charcoal" data-testid="summary-discount">
                - {formatINR(calculated.totals.discountPaise)}
              </span>
            </div>

            {settings.taxEnabled && calculated.totals.taxPaise > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-alif-grey">
                  {settings.taxLabel || 'Tax'} ({settings.taxRatePercent}%)
                </span>
                <span className="font-mono text-alif-charcoal">
                  + {formatINR(calculated.totals.taxPaise)}
                </span>
              </div>
            )}

            <div className="border-t-2 border-black pt-2.5 flex items-baseline justify-between">
              <span className="text-base font-bold uppercase tracking-wider text-alif-black">
                Grand Total
              </span>
              <span
                className="text-2xl font-mono font-bold text-alif-black"
                data-testid="summary-final-total"
              >
                {formatINR(calculated.totals.totalPaise)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-alif-grey">
                Advance ({PAYMENT_METHOD_LABELS[advanceMethod]})
              </span>
              <span className="font-mono font-medium text-alif-black">
                {formatINR(calculated.advancePaise)}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-2 border-t border-alif-border bg-stone-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold uppercase tracking-wider text-alif-charcoal">
                  Balance Due
                </span>
                <StatusBadge status={calculated.status} />
              </div>
              <span
                className="font-mono text-lg font-bold text-alif-black"
                data-testid="summary-balance-due"
              >
                {formatINR(calculated.balancePaise)}
              </span>
            </div>
          </div>
        </div>

        {/* Service-Only Garment Collection Notice (Shown ONLY when at least one service item is selected; hidden for products) */}
        {lines.some((l) => l.category === 'service') && (
          <div
            data-testid="bill-collection-notice"
            className="px-3.5 py-2.5 bg-stone-50 border border-alif-border text-xs font-mono text-alif-charcoal"
          >
            Receipt Note (Tailoring Services): Please bring this bill at the time of garment collection.
          </div>
        )}

        {/* Inline Validation Alert (Never obscured by sticky bar; includes jump-to-field button) */}
        {validationError && (
          <div
            role="alert"
            data-testid="bill-validation-error"
            className="p-3 bg-stone-50 border-l-4 border-black text-sm font-medium text-alif-black flex flex-wrap items-center justify-between gap-2"
          >
            <span>{validationError}</span>
            {validationTargetTestId && (
              <button
                type="button"
                onClick={() =>
                  focusAndScrollElementByTestId(validationTargetTestId, {
                    selectText: true,
                    allowScroll: true,
                    forceScroll: true
                  })
                }
                data-testid="btn-focus-invalid-field"
                className="btn-inline text-xs font-semibold uppercase tracking-wider underline text-alif-black"
              >
                Go to Field →
              </button>
            )}
          </div>
        )}

        {/* Prominent Non-Obscuring Action Bar */}
        <div
          data-testid="sticky-save-bar"
          className={`${
            isKeyboardOpen ? 'static' : 'sticky bottom-0 z-10'
          } border-t-2 border-black bg-white pt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print`}
        >
          <div className="min-w-0 flex items-baseline justify-between sm:justify-start gap-3">
            <div>
              <span className="editorial-label mr-2">Grand Total</span>
              <span className="font-mono text-xl font-bold text-alif-black">
                {formatINR(calculated.totals.totalPaise)}
              </span>
            </div>
            <div className="text-xs font-mono text-alif-grey">
              Adv {formatINR(calculated.advancePaise)} •{' '}
              <strong className="text-alif-black">
                Bal {formatINR(calculated.balancePaise)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveBill}
            data-testid="btn-save-bill"
            className="w-full sm:w-auto px-8 py-3.5 bg-alif-black text-white text-base font-semibold uppercase tracking-wider hover:bg-zinc-800 min-h-[48px] shrink-0"
          >
            {isSaving ? 'Saving...' : 'Save Bill'}
          </button>
        </div>

        {/* Step Navigation Helpers (Preserved for compatibility) */}
        <div className="hidden">
          <button type="button" onClick={handleBack} data-testid="btn-step-back">
            Back
          </button>
          <button type="button" onClick={handleContinue} data-testid="btn-step-continue">
            Continue
          </button>
        </div>
      </section>

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 alif-modal-backdrop"
          role="dialog"
          aria-modal="true"
          data-testid="modal-photo-preview"
        >
          <div className="bg-white border border-black max-w-md w-full p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-alif-border pb-3">
              <h4 className="text-base font-semibold text-alif-black truncate">
                {previewPhoto.itemName}
              </h4>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                data-testid="btn-close-photo-preview"
                className="px-3 py-1.5 text-sm border border-alif-border text-alif-black hover:border-black"
              >
                Close ✕
              </button>
            </div>
            <div className="bg-stone-50 border border-alif-border p-2 flex items-center justify-center">
              <img
                src={previewPhoto.dataUrl}
                alt={previewPhoto.itemName}
                className="max-h-80 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
